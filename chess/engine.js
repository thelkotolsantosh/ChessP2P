/**
 * ChessEngine - A self-contained, lightweight chess logic library.
 * Designed to run in the main browser thread and inside Web Workers.
 */
class ChessEngine {
  constructor() {
    this.reset();
  }

  /**
   * Resets the game to the starting position.
   */
  reset() {
    // Flat 64-element board representation. 
    // Indices: 0 (a8) to 63 (h1). Row = Math.floor(i/8), Col = i%8.
    // 'wP' = White Pawn, 'bK' = Black King, null = Empty
    this.board = new Array(64).fill(null);
    this.turn = 'w'; // 'w' or 'b'
    
    // Castling rights: King-side (K) and Queen-side (Q)
    this.castling = {
      wK: true,
      wQ: true,
      bK: true,
      bQ: true
    };
    
    this.enPassant = null; // Square index (0-63) or null
    this.halfmove = 0;     // 50-move draw clock
    this.fullmove = 1;     // Fullmove number
    
    this.moveHistory = []; // Tracks historical states for 3-fold repetition
    
    this.setupStartingPosition();
  }

  /**
   * Sets up the standard initial chess board layout.
   */
  setupStartingPosition() {
    const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    this.loadFEN(startFEN);
  }

  /**
   * Parses a standard FEN (Forsyth-Edwards Notation) string.
   */
  loadFEN(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 1) return;

    // 1. Board Layout
    const rows = parts[0].split('/');
    this.board = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      let col = 0;
      const rowStr = rows[r];
      for (let i = 0; i < rowStr.length; i++) {
        const char = rowStr[i];
        if (/\d/.test(char)) {
          col += parseInt(char, 10);
        } else {
          const color = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase();
          this.board[r * 8 + col] = color + type;
          col++;
        }
      }
    }

    // 2. Active Turn
    this.turn = parts[1] || 'w';

    // 3. Castling Availability
    const castlingStr = parts[2] || '-';
    this.castling = {
      wK: castlingStr.includes('K'),
      wQ: castlingStr.includes('Q'),
      bK: castlingStr.includes('k'),
      bQ: castlingStr.includes('q')
    };

    // 4. En Passant Square
    const epStr = parts[3] || '-';
    if (epStr === '-') {
      this.enPassant = null;
    } else {
      this.enPassant = this.algebraicToIndex(epStr);
    }

    // 5. Halfmove Clock
    this.halfmove = parseInt(parts[4] || '0', 10);

    // 6. Fullmove number
    this.fullmove = parseInt(parts[5] || '1', 10);
    
    // Clear history on hard reload FEN to prevent legacy loops
    this.moveHistory = [this.getFENStateSignature()];
  }

  /**
   * Generates a standard FEN string from the current state.
   */
  getFEN() {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let rowStr = '';
      let emptyCount = 0;
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r * 8 + c];
        if (piece === null) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          const color = piece[0];
          const type = piece[1];
          rowStr += color === 'w' ? type.toUpperCase() : type.toLowerCase();
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount;
      }
      rows.push(rowStr);
    }

    const boardPart = rows.join('/');
    const turnPart = this.turn;
    
    let castlingPart = '';
    if (this.castling.wK) castlingPart += 'K';
    if (this.castling.wQ) castlingPart += 'Q';
    if (this.castling.bK) castlingPart += 'k';
    if (this.castling.bQ) castlingPart += 'q';
    if (castlingPart === '') castlingPart = '-';
    
    const epPart = this.enPassant !== null ? this.indexToAlgebraic(this.enPassant) : '-';
    
    return `${boardPart} ${turnPart} ${castlingPart} ${epPart} ${this.halfmove} ${this.fullmove}`;
  }

  /**
   * Helper signature to detect 3-fold repetition.
   * Strips out fullmove & halfmove counters, keeping only position + castling + ep rights.
   */
  getFENStateSignature() {
    const fullFEN = this.getFEN();
    const parts = fullFEN.split(' ');
    return parts.slice(0, 4).join(' ');
  }

  /**
   * Converts a board index (0-63) to chess notation (e.g. 0 -> 'a8').
   */
  indexToAlgebraic(index) {
    const col = index % 8;
    const row = Math.floor(index / 8);
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    return files[col] + ranks[row];
  }

  /**
   * Converts chess notation (e.g. 'a8') to index (0-63).
   */
  algebraicToIndex(coord) {
    const col = coord.charCodeAt(0) - 97; // 'a' = 97
    const row = 8 - parseInt(coord[1], 10);
    return row * 8 + col;
  }

  /**
   * Returns copy of the board array.
   */
  getBoard() {
    return [...this.board];
  }

  /**
   * Checks if a square index is valid.
   */
  isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  /**
   * Generates pseudo-legal moves for a piece on a square.
   * Pseudo-legal moves ignore checks.
   */
  generatePseudoMoves(square) {
    const piece = this.board[square];
    if (!piece) return [];
    
    const color = piece[0];
    const type = piece[1];
    const row = Math.floor(square / 8);
    const col = square % 8;
    const moves = [];

    switch (type) {
      case 'p': // Pawn
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;

        // 1. One step forward
        const f1Row = row + dir;
        const f1Square = f1Row * 8 + col;
        if (this.isValidSquare(f1Row, col) && this.board[f1Square] === null) {
          moves.push({ from: square, to: f1Square });

          // 2. Double step forward
          const f2Row = row + (2 * dir);
          const f2Square = f2Row * 8 + col;
          if (row === startRow && this.board[f2Square] === null) {
            moves.push({ from: square, to: f2Square });
          }
        }

        // 3. Diagonal captures
        const captureOffsets = [-1, 1];
        for (const offset of captureOffsets) {
          const capCol = col + offset;
          const capRow = row + dir;
          if (this.isValidSquare(capRow, capCol)) {
            const capSquare = capRow * 8 + capCol;
            const target = this.board[capSquare];
            
            // Standard capture
            if (target && target[0] !== color) {
              moves.push({ from: square, to: capSquare });
            }
            
            // En Passant capture
            if (this.enPassant === capSquare) {
              moves.push({ from: square, to: capSquare, flags: 'ep' });
            }
          }
        }
        break;

      case 'n': // Knight
        const knightOffsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const offset of knightOffsets) {
          const targetRow = row + offset[0];
          const targetCol = col + offset[1];
          if (this.isValidSquare(targetRow, targetCol)) {
            const targetSquare = targetRow * 8 + targetCol;
            const target = this.board[targetSquare];
            if (target === null || target[0] !== color) {
              moves.push({ from: square, to: targetSquare });
            }
          }
        }
        break;

      case 'b': // Bishop
        this.addSlidingMoves(square, color, [[-1, -1], [-1, 1], [1, -1], [1, 1]], true, moves);
        break;

      case 'r': // Rook
        this.addSlidingMoves(square, color, [[-1, 0], [1, 0], [0, -1], [0, 1]], false, moves);
        break;

      case 'q': // Queen
        this.addSlidingMoves(square, color, [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
          [-1, 0], [1, 0], [0, -1], [0, 1]
        ], null, moves);
        break;

      case 'k': // King
        const kingOffsets = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1]
        ];
        for (const offset of kingOffsets) {
          const targetRow = row + offset[0];
          const targetCol = col + offset[1];
          if (this.isValidSquare(targetRow, targetCol)) {
            const targetSquare = targetRow * 8 + targetCol;
            const target = this.board[targetSquare];
            if (target === null || target[0] !== color) {
              moves.push({ from: square, to: targetSquare });
            }
          }
        }
        
        // Castling
        this.addCastlingMoves(square, color, moves);
        break;
    }

    return moves;
  }

  /**
   * Helper to generate Bishop, Rook, Queen sliding moves.
   */
  addSlidingMoves(square, color, directions, isDiagonal, moves) {
    const row = Math.floor(square / 8);
    const col = square % 8;

    // Direct directions vectors: diagonal or orthogonal
    const delta = isDiagonal === true 
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] 
      : isDiagonal === false 
        ? [[-1, 0], [1, 0], [0, -1], [0, 1]] 
        : directions; // Queen utilizes both

    for (const dir of delta) {
      let r = row + dir[0];
      let c = col + dir[1];
      while (this.isValidSquare(r, c)) {
        const targetSquare = r * 8 + c;
        const target = this.board[targetSquare];
        if (target === null) {
          moves.push({ from: square, to: targetSquare });
        } else {
          if (target[0] !== color) {
            moves.push({ from: square, to: targetSquare });
          }
          break; // Hit a piece, stop sliding in this direction
        }
        r += dir[0];
        c += dir[1];
      }
    }
  }

  /**
   * Adds castling moves if valid.
   */
  addCastlingMoves(square, color, moves) {
    if (this.isSquareAttacked(square, color === 'w' ? 'b' : 'w')) return;

    if (color === 'w') {
      // King-side Castling
      if (this.castling.wK && 
          this.board[61] === null && 
          this.board[62] === null &&
          !this.isSquareAttacked(61, 'b') && 
          !this.isSquareAttacked(62, 'b')) {
        moves.push({ from: square, to: 62, flags: 'k' });
      }
      // Queen-side Castling
      if (this.castling.wQ && 
          this.board[59] === null && 
          this.board[58] === null && 
          this.board[57] === null &&
          !this.isSquareAttacked(59, 'b') && 
          !this.isSquareAttacked(58, 'b')) {
        moves.push({ from: square, to: 58, flags: 'q' });
      }
    } else {
      // King-side Castling
      if (this.castling.bK && 
          this.board[5] === null && 
          this.board[6] === null &&
          !this.isSquareAttacked(5, 'w') && 
          !this.isSquareAttacked(6, 'w')) {
        moves.push({ from: square, to: 6, flags: 'k' });
      }
      // Queen-side Castling
      if (this.castling.bQ && 
          this.board[3] === null && 
          this.board[2] === null && 
          this.board[1] === null &&
          !this.isSquareAttacked(3, 'w') && 
          !this.isSquareAttacked(2, 'w')) {
        moves.push({ from: square, to: 2, flags: 'q' });
      }
    }
  }

  /**
   * Generates legal moves for a piece on a square.
   * Legal moves filter out pseudo-legal moves that place or keep the king in check.
   */
  getLegalMoves(square) {
    const piece = this.board[square];
    if (!piece || piece[0] !== this.turn) return [];

    const pseudoMoves = this.generatePseudoMoves(square);
    const legalMoves = [];

    for (const move of pseudoMoves) {
      if (this.tryMoveAndCheckLegality(move)) {
        legalMoves.push(move);
      }
    }

    return legalMoves;
  }

  /**
   * Helper that checks if a moves makes your own king vulnerable.
   */
  tryMoveAndCheckLegality(move) {
    const originState = this.saveState();
    
    // Simulate move
    this.executeInternalMove(move);
    
    // Check if original turn's king is attacked in simulated board
    const color = originState.turn;
    const kingType = color + 'k';
    let kingSquare = -1;
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === kingType) {
        kingSquare = i;
        break;
      }
    }

    let isLegal = true;
    if (kingSquare !== -1) {
      const opponentColor = color === 'w' ? 'b' : 'w';
      isLegal = !this.isSquareAttacked(kingSquare, opponentColor);
    } else {
      isLegal = false; // No king exists? Illegal.
    }

    this.restoreState(originState);
    return isLegal;
  }

  /**
   * Generates all legal moves for the active side.
   */
  getAllLegalMoves() {
    const moves = [];
    for (let i = 0; i < 64; i++) {
      const piece = this.board[i];
      if (piece && piece[0] === this.turn) {
        moves.push(...this.getLegalMoves(i));
      }
    }
    return moves;
  }

  /**
   * Checks if a square is attacked by any piece of the specified attacker color.
   */
  isSquareAttacked(square, attackerColor) {
    const r = Math.floor(square / 8);
    const c = square % 8;

    // 1. Attack by Knight
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const offset of knightOffsets) {
      const tr = r + offset[0];
      const tc = c + offset[1];
      if (this.isValidSquare(tr, tc)) {
        const piece = this.board[tr * 8 + tc];
        if (piece === attackerColor + 'n') return true;
      }
    }

    // 2. Attack by Bishop / Queen (diagonals)
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const dir of diagDirs) {
      let tr = r + dir[0];
      let tc = c + dir[1];
      while (this.isValidSquare(tr, tc)) {
        const piece = this.board[tr * 8 + tc];
        if (piece !== null) {
          if (piece === attackerColor + 'b' || piece === attackerColor + 'q') return true;
          break; // Blocker
        }
        tr += dir[0];
        tc += dir[1];
      }
    }

    // 3. Attack by Rook / Queen (orthogonals)
    const orthDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const dir of orthDirs) {
      let tr = r + dir[0];
      let tc = c + dir[1];
      while (this.isValidSquare(tr, tc)) {
        const piece = this.board[tr * 8 + tc];
        if (piece !== null) {
          if (piece === attackerColor + 'r' || piece === attackerColor + 'q') return true;
          break; // Blocker
        }
        tr += dir[0];
        tc += dir[1];
      }
    }

    // 4. Attack by Pawn
    const pawnDir = attackerColor === 'w' ? 1 : -1; // Pawn attack direction relative to target
    const pawnRow = r + pawnDir;
    const pawnCols = [c - 1, c + 1];
    for (const pc of pawnCols) {
      if (this.isValidSquare(pawnRow, pc)) {
        const piece = this.board[pawnRow * 8 + pc];
        if (piece === attackerColor + 'p') return true;
      }
    }

    // 5. Attack by King
    const kingOffsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    for (const offset of kingOffsets) {
      const tr = r + offset[0];
      const tc = c + offset[1];
      if (this.isValidSquare(tr, tc)) {
        const piece = this.board[tr * 8 + tc];
        if (piece === attackerColor + 'k') return true;
      }
    }

    return false;
  }

  /**
   * Executes a move on the board, updating turn, enPassant, and castling rights.
   * Returns a move report object (useful for sound triggers, histories, validation).
   */
  makeMove(from, to, promotion = 'q') {
    // 1. Verify legality of move
    const legalMoves = this.getLegalMoves(from);
    const matchingMove = legalMoves.find(m => m.to === to);
    if (!matchingMove) {
      return { success: false, reason: "Illegal move" };
    }

    const piece = this.board[from];
    const target = this.board[to];
    const pieceType = piece[1];
    
    // Store captured details for reporting
    let captured = target;
    const isEnPassant = matchingMove.flags === 'ep';
    if (isEnPassant) {
      const captureEPIndex = this.turn === 'w' ? to + 8 : to - 8;
      captured = this.board[captureEPIndex];
    }

    // Save history state signature BEFORE making updates
    const preMoveSignature = this.getFENStateSignature();

    // 2. Perform the execution
    const executedDetails = this.executeInternalMove(matchingMove, promotion);

    // 3. Update clocks
    if (pieceType === 'p' || captured !== null) {
      this.halfmove = 0; // Reset 50-move rule clock on pawn push or capture
    } else {
      this.halfmove++;
    }

    if (this.turn === 'w') {
      this.fullmove++;
    }

    // Append to 3-fold repetition history
    this.moveHistory.push(this.getFENStateSignature());

    // 4. Return summary of what happened
    return {
      success: true,
      from,
      to,
      piece,
      captured,
      isEnPassant,
      isCastling: !!matchingMove.flags && (matchingMove.flags === 'k' || matchingMove.flags === 'q'),
      isPromotion: executedDetails.isPromotion,
      promotion,
      fen: this.getFEN()
    };
  }

  /**
   * Performs mutations directly on the board array.
   */
  executeInternalMove(move, promotion = 'q') {
    const from = move.from;
    const to = move.to;
    const piece = this.board[from];
    const pieceColor = piece[0];
    const pieceType = piece[1];
    
    let isPromotion = false;

    // Handle en passant capture
    if (move.flags === 'ep') {
      const epCaptureSquare = pieceColor === 'w' ? to + 8 : to - 8;
      this.board[epCaptureSquare] = null;
    }

    // Move the piece
    this.board[to] = this.board[from];
    this.board[from] = null;

    // Handle castling rook moves
    if (move.flags === 'k') { // King-side castling
      if (pieceColor === 'w') {
        this.board[61] = 'wr';
        this.board[63] = null;
      } else {
        this.board[5] = 'br';
        this.board[7] = null;
      }
    } else if (move.flags === 'q') { // Queen-side castling
      if (pieceColor === 'w') {
        this.board[59] = 'wr';
        this.board[56] = null;
      } else {
        this.board[3] = 'br';
        this.board[0] = null;
      }
    }

    // Handle promotions
    if (pieceType === 'p' && (Math.floor(to / 8) === 0 || Math.floor(to / 8) === 7)) {
      this.board[to] = pieceColor + promotion.toLowerCase();
      isPromotion = true;
    }

    // Update castling rights
    // 1. King moves
    if (pieceType === 'k') {
      if (pieceColor === 'w') {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
    }
    // 2. Rook moves / captures affecting rooks
    if (from === 56 || to === 56) this.castling.wQ = false;
    if (from === 63 || to === 63) this.castling.wK = false;
    if (from === 0 || to === 0) this.castling.bQ = false;
    if (from === 7 || to === 7) this.castling.bK = false;

    // Set new En Passant target square if pawn double stepped
    if (pieceType === 'p' && Math.abs(from - to) === 16) {
      this.enPassant = pieceColor === 'w' ? from - 8 : from + 8;
    } else {
      this.enPassant = null;
    }

    this.turn = this.turn === 'w' ? 'b' : 'w';

    return { isPromotion };
  }

  /**
   * Clones current state.
   */
  saveState() {
    return {
      board: [...this.board],
      turn: this.turn,
      castling: { ...this.castling },
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      moveHistory: [...this.moveHistory]
    };
  }

  /**
   * Restores a previously saved state.
   */
  restoreState(state) {
    this.board = [...state.board];
    this.turn = state.turn;
    this.castling = { ...state.castling };
    this.enPassant = state.enPassant;
    this.halfmove = state.halfmove;
    this.fullmove = state.fullmove;
    this.moveHistory = [...state.moveHistory];
  }

  // ==========================================================================
  // GAME END DETECTION STATUSES
  // ==========================================================================

  /**
   * Checks if active turn is in check.
   */
  inCheck() {
    const color = this.turn;
    const kingType = color + 'k';
    let kingSquare = -1;
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === kingType) {
        kingSquare = i;
        break;
      }
    }
    if (kingSquare === -1) return false;
    return this.isSquareAttacked(kingSquare, color === 'w' ? 'b' : 'w');
  }

  /**
   * Checks if active side is checkmated.
   */
  isCheckmate() {
    return this.inCheck() && this.getAllLegalMoves().length === 0;
  }

  /**
   * Checks if active side is stalemated.
   */
  isStalemate() {
    return !this.inCheck() && this.getAllLegalMoves().length === 0;
  }

  /**
   * Checks for 3-fold repetition.
   */
  isThreefoldRepetition() {
    if (this.moveHistory.length < 6) return false;
    const currentSig = this.getFENStateSignature();
    let count = 0;
    for (const signature of this.moveHistory) {
      if (signature === currentSig) {
        count++;
      }
    }
    return count >= 3;
  }

  /**
   * Checks for insufficient mating material.
   * e.g., Lone Kings, King+Knight vs King, King+Bishop vs King.
   */
  isInsufficientMaterial() {
    let pieces = [];
    for (let i = 0; i < 64; i++) {
      if (this.board[i] !== null) {
        pieces.push(this.board[i]);
      }
    }

    // King vs King
    if (pieces.length === 2) return true;

    // King + Bishop vs King or King + Knight vs King
    if (pieces.length === 3) {
      return pieces.includes('wb') || pieces.includes('bb') || pieces.includes('wn') || pieces.includes('bn');
    }

    // King + Bishop vs King + Bishop (same color squares)
    // For simplicity, we flag as draw if only bishops/kings remain and count is 4.
    if (pieces.length === 4) {
      const whiteBishops = pieces.filter(p => p === 'wb').length;
      const blackBishops = pieces.filter(p => p === 'bb').length;
      if (whiteBishops === 1 && blackBishops === 1) {
        // Find positions to verify square color.
        let wSquareColor = null;
        let bSquareColor = null;
        for (let i = 0; i < 64; i++) {
          if (this.board[i] === 'wb') wSquareColor = (Math.floor(i / 8) + (i % 8)) % 2;
          if (this.board[i] === 'bb') bSquareColor = (Math.floor(i / 8) + (i % 8)) % 2;
        }
        return wSquareColor === bSquareColor;
      }
    }

    return false;
  }

  /**
   * General draw evaluation (50-move rule, 3-fold repetition, stalemate, material).
   */
  isDraw() {
    if (this.isStalemate()) return { type: 'stalemate', reason: 'Stalemate (No legal moves left)' };
    if (this.halfmove >= 100) return { type: '50move', reason: '50-Move Rule (No captures or pawn pushes for 50 moves)' };
    if (this.isThreefoldRepetition()) return { type: 'repetition', reason: 'Threefold Repetition' };
    if (this.isInsufficientMaterial()) return { type: 'material', reason: 'Insufficient Mating Material' };
    return null;
  }
}

// Make globally accessible in browser contexts and exportable for Workers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChessEngine;
} else {
  const globalObject = typeof window !== 'undefined' ? window : self;
  globalObject.ChessEngine = ChessEngine;
}
