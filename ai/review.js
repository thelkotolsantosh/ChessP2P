/**
 * Game Review Engine - Analyzes all positions in a completed game,
 * calculates player accuracies, and classifies move qualities.
 */
class ChessReview {
  static analyzeGame(gameHistory) {
    const engine = new ChessEngine();
    const reviews = [];
    const counts = {
      w: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
      b: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 }
    };
    
    let whiteTotalCpLoss = 0;
    let blackTotalCpLoss = 0;
    let whiteMovesCount = 0;
    let blackMovesCount = 0;

    // Loop through each played move
    for (let i = 1; i < gameHistory.length; i++) {
      const prevFEN = gameHistory[i-1].fen;
      const playedState = gameHistory[i];
      const movingColor = playedState.piece[0]; // 'w' or 'b'
      const pieceType = playedState.piece[1];

      // Load board before the move
      engine.loadFEN(prevFEN);
      const legalMoves = engine.getAllLegalMoves();
      
      let bestScore = 0;
      let playedScore = 0;

      // 1. Evaluate all options statically to find best score and played score
      const moveScores = [];
      for (let j = 0; j < legalMoves.length; j++) {
        const mv = legalMoves[j];
        const state = engine.saveState();
        engine.executeInternalMove(mv);
        const score = ChessEvaluation.evaluate(engine.board);
        engine.restoreState(state);
        
        moveScores.push({ move: mv, score: score });
      }

      // Sort scores (highest first for White, lowest first for Black)
      if (movingColor === 'w') {
        moveScores.sort((a, b) => b.score - a.score);
      } else {
        moveScores.sort((a, b) => a.score - b.score);
      }

      const bestMoveInfo = moveScores[0];
      bestScore = bestMoveInfo ? bestMoveInfo.score : 0;

      // Find played move score
      const matchingPlayed = moveScores.find(m => m.move.from === playedState.from && m.move.to === playedState.to);
      playedScore = matchingPlayed ? matchingPlayed.score : ChessEvaluation.evaluate(engine.board);

      // Normalize scores relative to the moving player
      const bestScoreRel = movingColor === 'w' ? bestScore : -bestScore;
      const playedScoreRel = movingColor === 'w' ? playedScore : -playedScore;
      
      let cpLoss = Math.max(0, bestScoreRel - playedScoreRel);

      // 2. Classify the move
      let classification = 'good';
      let classificationClass = 'q-good';
      let explanation = '';

      const isBook = i <= 4; // First 2 moves of each side are classified as book moves

      if (isBook) {
        classification = 'book';
        classificationClass = 'q-book';
        explanation = "Book move. This is a standard opening line.";
      } else {
        // Sacrifice check for Brilliant !!
        const hangingValue = this.isSacrifice(engine, playedState, movingColor);
        if (hangingValue >= 300 && cpLoss <= 15 && playedScoreRel > -100) {
          classification = 'brilliant';
          classificationClass = 'q-brilliant';
          explanation = "Brilliant move! You sacrificed material to secure a tactical advantage.";
        } else if (cpLoss === 0 && moveScores.length > 1 && (moveScores[0].score - (moveScores[1] ? moveScores[1].score : 0)) > 150) {
          // Only winning move / Great !
          classification = 'great';
          classificationClass = 'q-great';
          explanation = "Great move! This was the only winning continuation in this position.";
        } else if (cpLoss <= 10) {
          classification = 'best';
          classificationClass = 'q-best';
          explanation = "Best move. You played the strongest move available.";
        } else if (cpLoss <= 30) {
          classification = 'excellent';
          classificationClass = 'q-excellent';
          explanation = "Excellent move. A very strong continuation that maintains your position.";
        } else if (cpLoss <= 65) {
          classification = 'good';
          classificationClass = 'q-good';
          explanation = "Good move. Keeps the game balanced and coordinates your pieces.";
        } else if (cpLoss <= 130) {
          classification = 'inaccuracy';
          classificationClass = 'q-inaccuracy';
          explanation = "Inaccuracy. You missed a slightly stronger continuation.";
        } else if (cpLoss <= 250) {
          classification = 'mistake';
          classificationClass = 'q-mistake';
          explanation = "Mistake. This move weakens your position and gives your opponent an opening.";
        } else {
          // Blunder or Miss
          const oppBlunderedBefore = this.checkOpponentBlunderedBefore(reviews, i);
          if (oppBlunderedBefore && cpLoss > 150) {
            classification = 'miss';
            classificationClass = 'q-miss';
            explanation = "Missed win. You had a chance to gain a major advantage but missed it.";
          } else {
            classification = 'blunder';
            classificationClass = 'q-blunder';
            explanation = "Blunder. This seriously damages your position, losing material or mating safety.";
          }
        }
      }

      // Record counts
      counts[movingColor][classification]++;
      
      // Accumulate centipawn loss for accuracy
      if (!isBook) {
        if (movingColor === 'w') {
          whiteTotalCpLoss += cpLoss;
          whiteMovesCount++;
        } else {
          blackTotalCpLoss += cpLoss;
          blackMovesCount++;
        }
      }

      // Format move notation text
      const notation = this.getMoveNotation(engine, playedState);

      reviews.push({
        moveIndex: i,
        color: movingColor,
        from: playedState.from,
        to: playedState.to,
        piece: playedState.piece,
        notation,
        classification,
        classificationClass,
        explanation,
        playedScoreRel,
        bestScoreRel,
        cpLoss
      });
    }

    // 3. Compute Accuracies using sigmoid formula
    const calcAccuracy = (totalCpLoss, movesCount) => {
      if (movesCount === 0) return 100.0;
      const avgCpLoss = totalCpLoss / movesCount;
      const acc = 100 * Math.exp(-0.005 * avgCpLoss);
      return Math.max(10, Math.min(99.9, acc)).toFixed(1);
    };

    const whiteAccuracy = calcAccuracy(whiteTotalCpLoss, whiteMovesCount);
    const blackAccuracy = calcAccuracy(blackTotalCpLoss, blackMovesCount);

    return {
      whiteAccuracy,
      blackAccuracy,
      counts,
      reviews
    };
  }

  static isSacrifice(engine, playedState, color) {
    const pieceVal = ChessEvaluation.PIECE_VALUES[playedState.piece[1]];
    if (pieceVal < 300) return 0; // Pawns are not sacrifices
    
    const targetSquare = playedState.to;
    const oppColor = color === 'w' ? 'b' : 'w';
    
    if (engine.isSquareAttacked(targetSquare, oppColor)) {
      return pieceVal;
    }
    return 0;
  }

  static checkOpponentBlunderedBefore(reviews, currentIndex) {
    if (reviews.length === 0) return false;
    const lastRev = reviews[reviews.length - 1];
    return lastRev.classification === 'blunder' || lastRev.classification === 'mistake';
  }

  static getMoveNotation(engine, playedState) {
    const pieceType = playedState.piece[1].toUpperCase();
    const toCell = engine.indexToAlgebraic(playedState.to);
    if (pieceType === 'P') {
      if (playedState.captured !== null) {
        const fromCell = engine.indexToAlgebraic(playedState.from);
        return fromCell[0] + 'x' + toCell;
      }
      return toCell;
    }
    return pieceType + (playedState.captured !== null ? 'x' : '') + toCell;
  }
}

// Make globally accessible
window.ChessReview = ChessReview;
