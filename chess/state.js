/**
 * ChessState - Manages clocks, captured pieces, move logs, and match parameters.
 */
class ChessState {
  constructor() {
    this.localPlayerColor = 'w'; // 'w' or 'b'
    this.mode = 'ai'; // 'ai' or 'p2p'
    this.timeControl = 600; // Default 10 minutes in seconds
    
    this.whiteTime = this.timeControl;
    this.blackTime = this.timeControl;
    this.clockInterval = null;
    this.onTimeExpiredCallback = null;
    this.onClockTickCallback = null;
    this.isClockRunning = false;
  }

  /**
   * Initializes state details for a new match.
   */
  startNewMatch(localColor, mode, timeLimit = 600) {
    this.localPlayerColor = localColor;
    this.mode = mode;
    this.timeControl = timeLimit;
    
    this.whiteTime = timeLimit;
    this.blackTime = timeLimit;
    this.stopClock();
    this.isClockRunning = false;
  }

  /**
   * Starts the countdown clock for the active player.
   */
  startClock(activeTurn, onTick, onExpired) {
    this.stopClock();
    this.onClockTickCallback = onTick;
    this.onTimeExpiredCallback = onExpired;
    this.isClockRunning = true;

    this.clockInterval = setInterval(() => {
      if (activeTurn() === 'w') {
        if (this.whiteTime > 0) {
          this.whiteTime--;
          if (this.whiteTime === 0) {
            this.stopClock();
            if (this.onTimeExpiredCallback) this.onTimeExpiredCallback('w');
          }
        }
      } else {
        if (this.blackTime > 0) {
          this.blackTime--;
          if (this.blackTime === 0) {
            this.stopClock();
            if (this.onTimeExpiredCallback) this.onTimeExpiredCallback('b');
          }
        }
      }

      if (this.onClockTickCallback) {
        this.onClockTickCallback(this.whiteTime, this.blackTime);
      }
    }, 1000);
  }

  /**
   * Stops the active clock.
   */
  stopClock() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    this.isClockRunning = false;
  }

  /**
   * Formats seconds to mm:ss notation.
   */
  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Derives what pieces have been captured by inspecting the current board state.
   * Prevents incremental counting issues during network packets drops.
   */
  getCapturedPieces(board) {
    const counts = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1 }
    };

    // Subtract active pieces
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (piece !== null) {
        const color = piece[0];
        const type = piece[1];
        if (type !== 'k' && counts[color][type] !== undefined) {
          counts[color][type]--;
        }
      }
    }

    // Pieces captured by WHITE (meaning BLACK pieces lost)
    const capturedByWhite = [];
    const valWeights = { q: 9, r: 5, b: 3, n: 3, p: 1 };
    
    // Sort pieces by value
    const order = ['q', 'r', 'b', 'n', 'p'];
    
    for (const type of order) {
      const lostCount = counts.b[type];
      for (let i = 0; i < lostCount; i++) {
        capturedByWhite.push({ color: 'b', type });
      }
    }

    // Pieces captured by BLACK (meaning WHITE pieces lost)
    const capturedByBlack = [];
    for (const type of order) {
      const lostCount = counts.w[type];
      for (let i = 0; i < lostCount; i++) {
        capturedByBlack.push({ color: 'w', type });
      }
    }

    // Calculate material advantage
    let wScore = 0;
    let bScore = 0;
    capturedByWhite.forEach(p => wScore += valWeights[p.type]);
    capturedByBlack.forEach(p => bScore += valWeights[p.type]);

    const balance = wScore - bScore;

    return {
      capturedByWhite,
      capturedByBlack,
      balance
    };
  }

  /**
   * Converts a move detail to Standard Algebraic Notation (SAN).
   */
  moveToSAN(engine, move, moveReport) {
    if (moveReport.isCastling) {
      return move.to === 62 || move.to === 6 ? 'O-O' : 'O-O-O';
    }

    const piece = moveReport.piece;
    const pieceType = piece[1].toUpperCase();
    const isCapture = moveReport.captured !== null;
    const targetCell = engine.indexToAlgebraic(move.to);
    
    let san = '';

    if (pieceType === 'P') {
      if (isCapture) {
        // Starts with source file, e.g., exd5
        const sourceCell = engine.indexToAlgebraic(move.from);
        san += sourceCell[0] + 'x' + targetCell;
      } else {
        san += targetCell;
      }
      
      if (moveReport.isPromotion) {
        san += '=' + moveReport.promotion.toUpperCase();
      }
    } else {
      san += pieceType;
      
      // Handle ambiguity if multiple identical pieces can reach the target square
      const ambiguityModifier = this.getAmbiguityModifier(engine, move, piece[0], piece[1]);
      san += ambiguityModifier;

      if (isCapture) {
        san += 'x';
      }
      san += targetCell;
    }

    // Check/Checkmate annotations
    if (engine.isCheckmate()) {
      san += '#';
    } else if (engine.inCheck()) {
      san += '+';
    }

    return san;
  }

  /**
   * Resolves algebraic ambiguities (e.g. if two Knights can jump to the same square).
   */
  getAmbiguityModifier(engine, move, color, type) {
    let duplicateSquares = [];
    const target = move.to;

    for (let i = 0; i < 64; i++) {
      if (i === move.from) continue;
      const piece = engine.board[i];
      if (piece && piece[0] === color && piece[1] === type) {
        const legal = engine.getLegalMoves(i);
        if (legal.some(m => m.to === target)) {
          duplicateSquares.push(i);
        }
      }
    }

    if (duplicateSquares.length === 0) return '';

    const sourceAlgebraic = engine.indexToAlgebraic(move.from);
    const sourceFile = sourceAlgebraic[0];
    const sourceRank = sourceAlgebraic[1];

    // Check files
    let fileAmbiguity = false;
    let rankAmbiguity = false;

    for (const dup of duplicateSquares) {
      const dupAlgebraic = engine.indexToAlgebraic(dup);
      if (dupAlgebraic[0] === sourceFile) fileAmbiguity = true;
      if (dupAlgebraic[1] === sourceRank) rankAmbiguity = true;
    }

    if (!fileAmbiguity) {
      return sourceFile; // Differentiate by file: e.g. Nab3
    } else if (!rankAmbiguity) {
      return sourceRank; // Differentiate by rank: e.g. N1b3
    } else {
      return sourceFile + sourceRank; // Differentiate by both: e.g. Nd1b3
    }
  }
}

// Make globally accessible
window.ChessState = ChessState;
