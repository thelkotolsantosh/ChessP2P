/**
 * AI Minimax - Implementation of Minimax search with Alpha-Beta pruning,
 * Move Ordering, and Quiescence Search for chess engines.
 */

// Import evaluation module if running inside Node/Webpack.
// In browser Web Workers, these will be loaded via importScripts().
if (typeof require !== 'undefined') {
  globalThis.ChessEvaluation = require('./evaluation.js');
}

class ChessMinimax {
  constructor() {
    this.nodesEvaluated = 0;
  }

  /**
   * Main entry point to find the best move.
   * Runs the minimax search at the requested depth.
   */
  findBestMove(engine, depth, playerColor) {
    this.nodesEvaluated = 0;
    const isWhite = playerColor === 'w';
    const allMoves = engine.getAllLegalMoves();
    
    if (allMoves.length === 0) return null;

    // Order moves to optimize Alpha-Beta cutoffs
    this.orderMoves(engine, allMoves);

    let bestMove = null;
    let alpha = -Infinity;
    let beta = Infinity;

    if (isWhite) {
      let maxScore = -Infinity;
      for (const move of allMoves) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        
        // Search child node
        const score = this.search(engine, depth - 1, alpha, beta, false);
        engine.restoreState(state);

        if (score > maxScore) {
          maxScore = score;
          bestMove = move;
        }
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break; // Beta cutoff
      }
    } else {
      let minScore = Infinity;
      for (const move of allMoves) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        
        // Search child node
        const score = this.search(engine, depth - 1, alpha, beta, true);
        engine.restoreState(state);

        if (score < minScore) {
          minScore = score;
          bestMove = move;
        }
        beta = Math.min(beta, score);
        if (beta <= alpha) break; // Alpha cutoff
      }
    }

    console.log(`AI evaluated ${this.nodesEvaluated} positions.`);
    return bestMove;
  }

  /**
   * Recursive alpha-beta search.
   */
  search(engine, depth, alpha, beta, isMaximizing) {
    this.nodesEvaluated++;

    // Base Case
    if (depth === 0) {
      return this.quiescenceSearch(engine, alpha, beta, isMaximizing);
    }

    const draw = engine.isDraw();
    if (draw) return 0; // Draw evaluation is neutral

    const moves = engine.getAllLegalMoves();
    if (moves.length === 0) {
      if (engine.inCheck()) {
        // Checkmate: return huge negative if active side is maximizing, else huge positive
        return isMaximizing ? -250000 - depth : 250000 + depth;
      }
      return 0; // Stalemate
    }

    this.orderMoves(engine, moves);

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (const move of moves) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        const score = this.search(engine, depth - 1, alpha, beta, false);
        engine.restoreState(state);

        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break; // Pruning
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (const move of moves) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        const score = this.search(engine, depth - 1, alpha, beta, true);
        engine.restoreState(state);

        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break; // Pruning
      }
      return minScore;
    }
  }

  /**
   * Quiescence Search - Continues searching capture moves after depth limit is reached
   * to verify if the position is tactically stable, avoiding the horizon effect.
   */
  quiescenceSearch(engine, alpha, beta, isMaximizing) {
    this.nodesEvaluated++;
    
    // Static evaluation of current leaf position
    const staticEval = ChessEvaluation.evaluate(engine.board);

    if (isMaximizing) {
      if (staticEval >= beta) return beta;
      if (staticEval > alpha) alpha = staticEval;

      const captures = this.getCapturesOnly(engine);
      this.orderMoves(engine, captures);

      for (const move of captures) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        const score = this.quiescenceSearch(engine, alpha, beta, false);
        engine.restoreState(state);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    } else {
      if (staticEval <= alpha) return alpha;
      if (staticEval < beta) beta = staticEval;

      const captures = this.getCapturesOnly(engine);
      this.orderMoves(engine, captures);

      for (const move of captures) {
        const state = engine.saveState();
        engine.executeInternalMove(move);
        const score = this.quiescenceSearch(engine, alpha, beta, true);
        engine.restoreState(state);

        if (score <= alpha) return alpha;
        if (score < beta) beta = score;
      }
      return beta;
    }
  }

  /**
   * Filters move list to only contain captures (used in Quiescence).
   */
  getCapturesOnly(engine) {
    const moves = engine.getAllLegalMoves();
    return moves.filter(move => {
      // 1. Is standard board capture
      const target = engine.board[move.to];
      if (target !== null) return true;
      // 2. Is en passant flag capture
      if (move.flags === 'ep') return true;
      return false;
    });
  }

  /**
   * Sorts the moves array in-place to evaluate captures and promotions first.
   * Ordering makes alpha-beta pruning significantly faster (finding cutoffs earlier).
   */
  orderMoves(engine, moves) {
    moves.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      const pieceA = engine.board[a.from];
      const targetA = engine.board[a.to];
      const pieceB = engine.board[b.from];
      const targetB = engine.board[b.to];

      // 1. MVV-LVA (Most Valuable Victim, Least Valuable Attacker) capture ordering
      if (targetA !== null) {
        scoreA = 10 * ChessEvaluation.PIECE_VALUES[targetA[1]] - ChessEvaluation.PIECE_VALUES[pieceA[1]];
      }
      if (targetB !== null) {
        scoreB = 10 * ChessEvaluation.PIECE_VALUES[targetB[1]] - ChessEvaluation.PIECE_VALUES[pieceB[1]];
      }

      // Special check for en passant capture
      if (a.flags === 'ep') scoreA = 10 * ChessEvaluation.PIECE_VALUES['p'] - ChessEvaluation.PIECE_VALUES['p'];
      if (b.flags === 'ep') scoreB = 10 * ChessEvaluation.PIECE_VALUES['p'] - ChessEvaluation.PIECE_VALUES['p'];

      // 2. Promotion ordering
      // Reward promotions to Queen highly
      const isPromotionA = pieceA && pieceA[1] === 'p' && (Math.floor(a.to / 8) === 0 || Math.floor(a.to / 8) === 7);
      const isPromotionB = pieceB && pieceB[1] === 'p' && (Math.floor(b.to / 8) === 0 || Math.floor(b.to / 8) === 7);
      
      if (isPromotionA) scoreA += 9000;
      if (isPromotionB) scoreB += 9000;

      // 3. Moving pieces away from attack (safety check)
      // If our piece is attacked at the starting square, reward moving it
      if (pieceA && engine.isSquareAttacked(a.from, pieceA[0] === 'w' ? 'b' : 'w')) {
        scoreA += ChessEvaluation.PIECE_VALUES[pieceA[1]];
      }
      if (pieceB && engine.isSquareAttacked(b.from, pieceB[0] === 'w' ? 'b' : 'w')) {
        scoreB += ChessEvaluation.PIECE_VALUES[pieceB[1]];
      }

      return scoreB - scoreA; // High score first
    });
  }
}

// Make globally accessible
const ChessAI = new ChessMinimax();
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChessAI;
} else {
  const globalObject = typeof window !== 'undefined' ? window : self;
  globalObject.ChessAI = ChessAI;
}
