/**
 * AI Web Worker - Runs intensive minimax search operations in a background thread.
 * Prevents locking the main browser UI and keeps piece drags running smoothly.
 */

// Import necessary dependencies
importScripts('../chess/engine.js', './evaluation.js', './minimax.js');

const engine = new ChessEngine();

onmessage = function (e) {
  const { fen, difficulty, color } = e.data;
  
  // Load the current game board state
  engine.loadFEN(fen);
  
  // Verify if game has already ended
  const legalMoves = engine.getAllLegalMoves();
  if (legalMoves.length === 0) {
    postMessage({ move: null });
    return;
  }

  let chosenMove = null;

  try {
    switch (difficulty) {
      case 'easy':
        // 1. Easy: Select a random legal move
        const randomIndex = Math.floor(Math.random() * legalMoves.length);
        chosenMove = legalMoves[randomIndex];
        break;

      case 'medium':
        // 2. Medium: Depth 2 Minimax Search
        chosenMove = ChessAI.findBestMove(engine, 2, color);
        break;

      case 'hard':
        // 3. Hard: Depth 3 Minimax Search
        chosenMove = ChessAI.findBestMove(engine, 3, color);
        break;

      case 'expert':
        // 4. Expert: Depth 4 Minimax Search + Quiescence Search
        chosenMove = ChessAI.findBestMove(engine, 4, color);
        break;

      default:
        chosenMove = legalMoves[0];
    }
  } catch (err) {
    console.error("AI Worker Search Error:", err);
    // Fail-safe: pick first legal move
    chosenMove = legalMoves[0];
  }

  // Return the selected move coordinates to the main thread
  postMessage({ move: chosenMove });
};
