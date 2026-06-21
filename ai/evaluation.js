/**
 * AI Evaluation - Computes static evaluation scores for a chess board state.
 * Symmetrical piece-square tables are used to evaluate positional advantages.
 */

// Piece values
const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// Piece-Square Tables (PST) - Values relative to White (index 0 is a8, 63 is h1).
// High numbers encourage pieces to occupy those squares.

// Pawns want to advance and control the center
const PAWN_PST = [
    0,  0,  0,  0,  0,  0,  0,  0,
   50, 50, 50, 50, 50, 50, 50, 50,
   10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
];

// Knights want to sit in the center, avoid edges
const KNIGHT_PST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

// Bishops prefer long open diagonals
const BISHOP_PST = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

// Rooks want open files, 7th rank
const ROOK_PST = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  5,  0,  0
];

// Queens stay active, similar to rooks/bishops
const QUEEN_PST = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  5,-10,
  -10,  0,  5,  0,  0,  5,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

// King Middle Game (Prefers safety in corners behind pawns)
const KING_MIDDLE_PST = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

// King End Game (Wants to emerge and control center, help passed pawns)
const KING_END_PST = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50
];

/**
 * Returns static evaluation score. 
 * Positive score favors White, negative favors Black.
 */
function evaluateBoard(board) {
  let whiteScore = 0;
  let blackScore = 0;
  
  // Detect if game is in the endgame stage (fewer heavy pieces)
  const isEndGame = checkIsEndGame(board);

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === null) continue;
    
    const color = piece[0];
    const type = piece[1];
    const value = PIECE_VALUES[type];

    // Compute PST index (Black PST is mirrored vertically)
    const pstIndex = color === 'w' ? i : mirrorSquare(i);
    
    let pstVal = 0;
    switch (type) {
      case 'p': pstVal = PAWN_PST[pstIndex]; break;
      case 'n': pstVal = KNIGHT_PST[pstIndex]; break;
      case 'b': pstVal = BISHOP_PST[pstIndex]; break;
      case 'r': pstVal = ROOK_PST[pstIndex]; break;
      case 'q': pstVal = QUEEN_PST[pstIndex]; break;
      case 'k': pstVal = isEndGame ? KING_END_PST[pstIndex] : KING_MIDDLE_PST[pstIndex]; break;
    }

    const totalVal = value + pstVal;

    if (color === 'w') {
      whiteScore += totalVal;
    } else {
      blackScore += totalVal;
    }
  }

  return whiteScore - blackScore;
}

/**
 * Mirrors index vertically.
 * e.g., Index 0 (a8) maps to 56 (a1).
 */
function mirrorSquare(square) {
  const row = Math.floor(square / 8);
  const col = square % 8;
  return (7 - row) * 8 + col;
}

/**
 * Determines if the board is in an endgame scenario.
 * Endgames are characterized by no Queens, or Queens but only one other minor/major piece.
 */
function checkIsEndGame(board) {
  let wQueens = 0;
  let bQueens = 0;
  let wMinorsOrMajors = 0;
  let bMinorsOrMajors = 0;

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === null) continue;
    const color = piece[0];
    const type = piece[1];

    if (type === 'q') {
      if (color === 'w') wQueens++; else bQueens++;
    } else if (type === 'r' || type === 'b' || type === 'n') {
      if (color === 'w') wMinorsOrMajors++; else bMinorsOrMajors++;
    }
  }

  // No queens remains
  if (wQueens === 0 && bQueens === 0) return true;
  
  // Queens remain, but very few helper pieces
  if (wQueens === 1 && wMinorsOrMajors <= 1 && bQueens === 1 && bMinorsOrMajors <= 1) return true;
  
  return false;
}

// Make globally accessible or exportable
const ChessEvaluation = {
  evaluate: evaluateBoard,
  PIECE_VALUES: PIECE_VALUES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChessEvaluation;
} else {
  const globalObject = typeof window !== 'undefined' ? window : self;
  globalObject.ChessEvaluation = ChessEvaluation;
}
