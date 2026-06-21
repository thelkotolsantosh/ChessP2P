/**
 * Main Application Orchestrator - Binds DOM elements, handles view routing,
 * manages game loops (AI and WebRTC), and synthesizes sound effects.
 */

// Global App State
let engine, board, state, theme, chat, donation, peer, sync;
let aiWorker = null;
let stockfishWorker = null;
let activeDifficulty = 'easy';

// Game Review state variables
let gameHistory = [];
let activeReviewIndex = 0;
let reviewData = null;
let isReviewMode = false;
window.isReviewMode = false;
window.reviewData = null;
window.activeReviewIndex = 0;

// Preloaded animal sound files for custom chess moves
const knightSound = new Audio('sounds/knight.ogg');
const bishopSound = new Audio('sounds/bishop.mp3');
const rookSound = new Audio('sounds/rook.ogg');
knightSound.volume = 0.4;
bishopSound.volume = 0.4;
rookSound.volume = 0.4;

// Sound Synthesizer Utility (Web Audio API)
function playSound(isCapture, pieceType = null) {
  try {
    if (pieceType === 'n') {
      knightSound.currentTime = 0;
      knightSound.play().catch(err => console.warn("Audio play failed:", err));
      return;
    }
    if (pieceType === 'b') {
      bishopSound.currentTime = 0;
      bishopSound.play().catch(err => console.warn("Audio play failed:", err));
      return;
    }
    if (pieceType === 'r') {
      rookSound.currentTime = 0;
      rookSound.play().catch(err => console.warn("Audio play failed:", err));
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (isCapture) {
      // High-to-low double tap for captures
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(350, ctx.currentTime + 0.05);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc2.start(ctx.currentTime + 0.05);
      osc2.stop(ctx.currentTime + 0.15);
    } else {
      // Light wood block tap for standard moves
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (err) {
    console.warn("Audio synthesis context blocked or failed to load:", err);
  }
}

// View Router
function showView(viewId) {
  const landing = document.getElementById('landing-screen');
  const game = document.getElementById('game-screen');
  
  if (viewId === 'landing') {
    landing.classList.add('view-active');
    landing.classList.remove('view-hidden');
    game.classList.add('view-hidden');
    game.classList.remove('view-active');
  } else {
    game.classList.add('view-active');
    game.classList.remove('view-hidden');
    landing.classList.add('view-hidden');
    landing.classList.remove('view-active');
  }
}

// Modal Controllers
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// Update clock text nodes in UI
function updateClockDisplay(wSecs, bSecs) {
  const whiteClock = document.getElementById('local-clock');
  const blackClock = document.getElementById('opponent-clock');
  
  const whiteFmt = state.formatTime(wSecs);
  const blackFmt = state.formatTime(bSecs);

  // Set values based on local player color
  if (state.localPlayerColor === 'w') {
    whiteClock.textContent = whiteFmt;
    blackClock.textContent = blackFmt;
  } else {
    whiteClock.textContent = blackFmt;
    blackClock.textContent = whiteFmt;
  }

  // Highlight active clocks
  const activeColor = engine.turn;
  const activeClockEl = (state.localPlayerColor === activeColor) ? whiteClock : blackClock;
  const inactiveClockEl = (state.localPlayerColor === activeColor) ? blackClock : whiteClock;
  
  activeClockEl.className = `player-clock timer-active`;
  inactiveClockEl.className = `player-clock timer-inactive`;
  
  // Danger red highlights if under 30 seconds
  const activeTime = activeColor === 'w' ? wSecs : bSecs;
  if (activeTime <= 30) {
    activeClockEl.classList.add('timer-danger');
  }
}

// Updates names and captured lists in the sidebar panels
function updatePlayerStats() {
  const localName = document.getElementById('local-player-name');
  const oppName = document.getElementById('opponent-name');
  const localCaptures = document.getElementById('local-captures');
  const oppCaptures = document.getElementById('opponent-captures');

  const localUser = localStorage.getItem('chess_username') || "You";
  if (state.mode === 'ai') {
    localName.textContent = localUser;
    oppName.textContent = `Computer (Level: ${activeDifficulty})`;
  } else {
    const oppUser = state.opponentName || "Opponent";
    localName.textContent = `${localUser} (${state.localPlayerColor === 'w' ? 'White' : 'Black'})`;
    oppName.textContent = `${oppUser} (${state.localPlayerColor === 'w' ? 'Black' : 'White'})`;
  }

  const caps = state.getCapturedPieces(engine.board);
  const localPieces = state.localPlayerColor === 'w' ? caps.capturedByWhite : caps.capturedByBlack;
  const oppPieces = state.localPlayerColor === 'w' ? caps.capturedByBlack : caps.capturedByWhite;

  const renderPieces = (container, list) => {
    container.innerHTML = '';
    list.forEach(p => {
      const svg = board.pieceSVGs[p.color + p.type.toUpperCase()];
      const wrapper = document.createElement('span');
      wrapper.innerHTML = svg;
      container.appendChild(wrapper);
    });
  };

  renderPieces(localCaptures, localPieces);
  renderPieces(oppCaptures, oppPieces);

  // Display material balance indicator next to player name
  const balance = state.localPlayerColor === 'w' ? caps.balance : -caps.balance;
  if (balance > 0) {
    localName.textContent += ` (+${balance})`;
  } else if (balance < 0) {
    oppName.textContent += ` (+${Math.abs(balance)})`;
  }
}

// Appends row entries to Move History panel
function updateMoveHistoryUI(sanMove) {
  const body = document.getElementById('moves-history-body');
  const fullHistory = engine.moveHistory;
  
  // White/Black pairs are computed from FEN history size
  const moveNumber = Math.floor((fullHistory.length - 1) / 2);
  
  if (engine.turn === 'b') {
    // White just moved, create new row
    const row = document.createElement('tr');
    row.id = `move-row-${moveNumber}`;
    row.innerHTML = `
      <td>${moveNumber + 1}</td>
      <td class="w-move">${sanMove}</td>
      <td class="b-move">-</td>
    `;
    body.appendChild(row);
  } else {
    // Black just moved, append to current row
    const row = document.getElementById(`move-row-${moveNumber}`);
    if (row) {
      row.querySelector('.b-move').textContent = sanMove;
    }
  }
  
  // Auto-scroll moves container
  const container = body.closest('.history-scrollable-container');
  container.scrollTop = container.scrollHeight;
}

// Triggers End game UI overlays
function handleGameOver(result) {
  state.stopClock();
  
  // Disable move interface
  board.clearHighlights();
  board.render();
  
  // Disable resign/draw controls
  document.getElementById('resign-btn').setAttribute('disabled', 'true');
  document.getElementById('draw-btn').setAttribute('disabled', 'true');
  
  const title = document.getElementById('endgame-title');
  const msg = document.getElementById('endgame-message');
  const icon = document.getElementById('endgame-icon-container');
  
  if (result.type === 'checkmate') {
    const winnerColor = engine.turn === 'w' ? 'Black' : 'White';
    const isWinnerLocal = (state.localPlayerColor === 'w' && winnerColor === 'White') || 
                          (state.localPlayerColor === 'b' && winnerColor === 'Black');
    
    if (isWinnerLocal) {
      title.textContent = "Victory!";
      msg.textContent = "Checkmate. You won the match.";
      icon.innerHTML = `<i class="fa-solid fa-trophy text-accent-3"></i>`;
    } else {
      title.textContent = "Defeat";
      msg.textContent = "Checkmate. Opponent won the match.";
      icon.innerHTML = `<i class="fa-solid fa-face-frown text-danger"></i>`;
    }
  } else if (result.type === 'timeout') {
    const winnerColor = result.color === 'w' ? 'Black' : 'White';
    const isWinnerLocal = (state.localPlayerColor === 'w' && winnerColor === 'White') || 
                          (state.localPlayerColor === 'b' && winnerColor === 'Black');

    if (isWinnerLocal) {
      title.textContent = "Victory!";
      msg.textContent = "Opponent ran out of time.";
      icon.innerHTML = `<i class="fa-solid fa-clock text-accent-3"></i>`;
    } else {
      title.textContent = "Defeat";
      msg.textContent = "You ran out of time.";
      icon.innerHTML = `<i class="fa-solid fa-circle-exclamation text-danger"></i>`;
    }
  } else if (result.type === 'resign') {
    const winner = result.byLocal ? "Opponent" : "You";
    title.textContent = winner === "You" ? "Victory!" : "Defeat";
    msg.textContent = result.byLocal ? "You resigned the match." : "Opponent resigned the match.";
    icon.innerHTML = winner === "You" ? `<i class="fa-solid fa-trophy text-accent-3"></i>` : `<i class="fa-solid fa-flag text-danger"></i>`;
  } else {
    // Draws
    title.textContent = "Match Drawn";
    msg.textContent = result.reason;
    icon.innerHTML = `<i class="fa-solid fa-handshake text-accent-1"></i>`;
  }

  // Show overlay
  toggleModal('endgame-overlay', true);
}

// Checks end states on active engine
function verifyEngineGameEnd() {
  if (engine.isCheckmate()) {
    handleGameOver({ type: 'checkmate' });
    return true;
  }
  const draw = engine.isDraw();
  if (draw) {
    handleGameOver(draw);
    return true;
  }
  return false;
}

// Handles Clock Expirations
function handleTimeExpired(color) {
  handleGameOver({ type: 'timeout', color });
  
  if (state.mode === 'p2p') {
    // Alert opponent that time expired
    peer.send('resign', { reason: 'timeout' });
  }
}

// Handles Pawn Promotions
function handlePromotionTrigger(from, to, callback) {
  toggleModal('promotion-overlay', true);
  
  const choices = document.querySelectorAll('.promo-choice-btn');
  choices.forEach(btn => {
    // Rebind choice clicks
    btn.onclick = () => {
      const pieceType = btn.dataset.piece;
      toggleModal('promotion-overlay', false);
      callback(pieceType);
    };
  });
}

// Binds Web Worker callbacks with automatic main thread fallbacks
function triggerAIMove() {
  if (engine.turn !== state.localPlayerColor) {
    document.getElementById('game-connection-status').innerHTML = `
      <span class="status-dot dot-yellow"></span>
      <span class="status-text">Computer is thinking...</span>
    `;

    let workerUsed = false;
    // Only use workers if hosted on server protocol (file protocol blocks worker scripts in some browsers)
    if (window.Worker && !window.location.protocol.startsWith('file')) {
      try {
        if (!aiWorker) {
          aiWorker = new Worker('ai/worker.js');
          aiWorker.onmessage = function (e) {
            const { move } = e.data;
            executeAIMove(move);
          };
          aiWorker.onerror = function (err) {
            console.warn("AI Web Worker crashed or failed, falling back to main thread:", err);
            runAIMoveOnMainThread();
          };
        }
        aiWorker.postMessage({
          fen: engine.getFEN(),
          difficulty: activeDifficulty,
          color: engine.turn
        });
        workerUsed = true;
      } catch (err) {
        console.warn("Could not start Web Worker, using main thread fallback:", err);
      }
    }

    if (!workerUsed) {
      // Use setTimeout to allow the browser to render the "Thinking" state first
      setTimeout(() => {
        runAIMoveOnMainThread();
      }, 50);
    }
  }
}

function runAIMoveOnMainThread() {
  const allMoves = engine.getAllLegalMoves();
  if (allMoves.length === 0) {
    verifyEngineGameEnd();
    return;
  }

  let chosenMove = null;
  const color = engine.turn;

  try {
    switch (activeDifficulty) {
      case 'easy':
        const randomIndex = Math.floor(Math.random() * allMoves.length);
        chosenMove = allMoves[randomIndex];
        break;
      case 'medium':
        chosenMove = ChessAI.findBestMove(engine, 2, color);
        break;
      case 'hard':
        chosenMove = ChessAI.findBestMove(engine, 3, color);
        break;
      case 'expert':
        chosenMove = ChessAI.findBestMove(engine, 4, color);
        break;
      default:
        chosenMove = allMoves[0];
    }
  } catch (err) {
    console.error("Main thread search failed:", err);
    chosenMove = allMoves[0]; // Fallback
  }

  executeAIMove(chosenMove);
}

function executeAIMove(move) {
  if (move) {
    const report = engine.makeMove(move.from, move.to, move.promotion || 'q');
    if (report.success) {
      // Log move to history
      gameHistory.push({
        from: move.from,
        to: move.to,
        piece: report.piece,
        captured: report.captured,
        promotion: move.promotion || 'q',
        fen: report.fen || engine.getFEN()
      });

      playSound(report.captured !== null, report.piece ? report.piece[1] : null);
      board.render(report);
      
      const san = state.moveToSAN(engine, move, report);
      updateMoveHistoryUI(san);
      updatePlayerStats();
      
      document.getElementById('game-connection-status').innerHTML = `
        <span class="status-dot dot-green"></span>
        <span class="status-text">Your Turn</span>
      `;

      verifyEngineGameEnd();
    }
  }
}

// ==========================================================================
// ACTION TRIGGERS (AI AND PEER EVENTS)
// ==========================================================================

function handleLocalMoveAttempt(from, to) {
  // Check if turn ownership is correct (bypassed in Analysis Mode)
  if (state.mode !== 'analysis' && engine.turn !== state.localPlayerColor) return;

  const piece = engine.board[from];
  const isPawn = piece && piece[1] === 'p';
  const targetRow = Math.floor(to / 8);
  const isPromotionRow = isPawn && (targetRow === 0 || targetRow === 7);

  const executeMoveWithPromotion = (promoPiece) => {
    let report;
    if (state.mode === 'ai' || state.mode === 'analysis') {
      report = engine.makeMove(from, to, promoPiece);
    } else {
      report = sync.sendMove(from, to, promoPiece);
    }

    if (report.success) {
      // Log move to history
      gameHistory.push({
        from: from,
        to: to,
        piece: report.piece,
        captured: report.captured,
        promotion: promoPiece || 'q',
        fen: report.fen || engine.getFEN()
      });

      playSound(report.captured !== null, report.piece ? report.piece[1] : null);
      board.render(report);
      
      const sanMove = state.moveToSAN(engine, { from, to }, report);
      updateMoveHistoryUI(sanMove);
      updatePlayerStats();

      // Check end states
      if (verifyEngineGameEnd()) return;

      // Switch turn loop
      if (state.mode === 'ai') {
        triggerAIMove();
      } else if (state.mode === 'analysis') {
        analyzeCurrentPosition();
      } else {
        document.getElementById('game-connection-status').innerHTML = `
          <span class="status-dot dot-green"></span>
          <span class="status-text">Opponent's Turn</span>
        `;
      }
    }
  };

  if (isPromotionRow) {
    // Prompt promotion choices overlay
    handlePromotionTrigger(from, to, executeMoveWithPromotion);
  } else {
    executeMoveWithPromotion(undefined);
  }
}

// ==========================================================================
// STOCKFISH & FREE ANALYSIS ENGINE
// ==========================================================================

function initStockfish() {
  if (stockfishWorker) {
    stockfishWorker.terminate();
    stockfishWorker = null;
  }
  
  try {
    document.getElementById('analysis-status-text').textContent = "Engine initializing...";
    
    // Cross-origin worker load via Blob wrapper
    const blobCode = `importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');`;
    const blob = new Blob([blobCode], { type: 'application/javascript' });
    const blobURL = URL.createObjectURL(blob);
    
    stockfishWorker = new Worker(blobURL);
    
    stockfishWorker.onmessage = function (e) {
      parseStockfishOutput(e.data);
    };
    
    stockfishWorker.postMessage('uci');
    stockfishWorker.postMessage('isready');
  } catch (err) {
    console.error("Failed to start Stockfish Web Worker:", err);
    document.getElementById('analysis-status-text').textContent = "Failed to load engine.";
  }
}

function startAnalysisMode() {
  state.mode = 'analysis';
  state.localPlayerColor = 'w'; // White view perspective
  engine.reset();

  // Initialize game history
  gameHistory = [{
    fen: engine.getFEN(),
    move: null,
    piece: null,
    captured: null
  }];

  // Reset clock UI
  state.stopClock();
  document.getElementById('local-clock').textContent = "N/A";
  document.getElementById('opponent-clock').textContent = "N/A";
  document.getElementById('local-clock').className = "player-clock timer-inactive";
  document.getElementById('opponent-clock').className = "player-clock timer-inactive";

  // Modify player panel layouts
  document.getElementById('local-player-name').textContent = "Analysis Board (White)";
  document.getElementById('opponent-name').textContent = "Analysis Board (Black)";

  // Layout panels toggle
  document.getElementById('moves-history-body').innerHTML = '';
  chat.clear();
  chat.disable();
  
  // Show/Hide sidebar tabs
  document.querySelector('.chat-panel').classList.add('hidden');
  document.getElementById('analysis-panel').classList.remove('hidden');

  // Inject .has-eval class to chessboard frame grid
  const boardFrame = document.querySelector('.chessboard-outer-frame');
  boardFrame.classList.add('has-eval');
  document.getElementById('evaluation-bar-container').classList.remove('hidden');

  // Disable resign/draw triggers
  document.getElementById('resign-btn').setAttribute('disabled', 'true');
  document.getElementById('draw-btn').setAttribute('disabled', 'true');

  // Setup board elements
  board = new ChessBoard('chessboard', engine, handleLocalMoveAttempt);
  board.setFlipped(false);
  board.render();
  
  updatePlayerStats();
  showView('game');
  toggleModal('endgame-overlay', false);

  // Initialize Stockfish worker
  initStockfish();
  analyzeCurrentPosition();
}

function analyzeCurrentPosition() {
  if (state.mode !== 'analysis' || !stockfishWorker) return;

  document.getElementById('analysis-status-text').textContent = "Stockfish thinking...";
  
  // Reset Stockfish position and analyze
  stockfishWorker.postMessage('position fen ' + engine.getFEN());
  stockfishWorker.postMessage('go depth 12');
}

function parseStockfishOutput(line) {
  // 1. Engine confirms ready status
  if (line.includes('uciok') || line.includes('readyok')) {
    document.getElementById('analysis-status-text').textContent = "Engine ready.";
    return;
  }

  // 2. Parse search info lines
  // Example: info depth 10 score cp 34 nodes ... pv e2e4 e7e5 g1f3
  if (line.startsWith('info') && line.includes('score')) {
    const depthMatch = line.match(/depth\s+(\d+)/);
    const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
    const pvMatch = line.match(/pv\s+(.+)/);

    let scoreLabel = "0.0";
    let numericScore = 0; // Relative to White advantage

    if (scoreMatch) {
      const type = scoreMatch[1]; // cp or mate
      let value = parseInt(scoreMatch[2], 10);
      
      // Stockfish reports score relative to the side whose turn it is to move.
      // We normalize all score values relative to WHITE's perspective.
      if (engine.turn === 'b') {
        value = -value;
      }

      if (type === 'cp') {
        numericScore = value / 100;
        scoreLabel = (numericScore >= 0 ? '+' : '') + numericScore.toFixed(2);
      } else {
        // Mate
        scoreLabel = (value >= 0 ? '+' : '-') + 'M' + Math.abs(value);
        numericScore = value > 0 ? 10 : -10; // Extreme bias for mate
      }
    }

    // Update Analysis Info panel
    document.getElementById('analysis-eval-score').textContent = scoreLabel;
    
    if (depthMatch) {
      document.getElementById('analysis-status-text').textContent = `Stockfish depth ${depthMatch[1]}`;
    }

    // Update Suggested best moves line
    if (pvMatch) {
      // Split the moves, capitalize them, or display directly
      const rawMoves = pvMatch[1].split(' ').slice(0, 5).join(' ');
      document.getElementById('analysis-best-line').textContent = rawMoves;
    }

    // Update visual Evaluation Bar height
    // Clamp numericScore between -5.0 and +5.0 pawn units
    const clampedScore = Math.max(-5, Math.min(5, numericScore));
    // Scale to percentage from 0 to 100 (50 is even, 0 is full White win, 100 is full Black win)
    const percentage = 50 - (clampedScore / 5) * 50;
    
    const blackFill = document.getElementById('eval-bar-black');
    const scoreText = document.getElementById('eval-score-text');
    
    if (blackFill && scoreText) {
      blackFill.style.height = percentage + '%';
      
      // Display absolute text in the middle badge
      const displayScore = scoreMatch && scoreMatch[1] === 'mate' 
        ? 'M' + Math.abs(parseInt(scoreMatch[2], 10)) 
        : Math.abs(numericScore).toFixed(1);
      scoreText.textContent = displayScore;
      
      // Position the score label relative to advantage (top 15% if White, bottom 15% if Black)
      if (numericScore > 0.2) {
        scoreText.style.top = '85%'; // Push label down in White area
      } else if (numericScore < -0.2) {
        scoreText.style.top = '15%'; // Pull label up in Black area
      } else {
        scoreText.style.top = '50%'; // Even
      }
    }
  }
}

// Starts Single Player vs AI Game Loop
function startAIGame() {
  if (!validateUsername()) return;

  state.startNewMatch('w', 'ai', 600); // White by default, 10 min
  engine.reset();

  // Initialize game history for analysis
  gameHistory = [{
    fen: engine.getFEN(),
    move: null,
    piece: null,
    captured: null
  }];
  
  // Clear table logs
  document.getElementById('moves-history-body').innerHTML = '';
  chat.clear();
  chat.appendSystemNotice("Playing vs Computer offline. Clocks are running.");
  
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }

  // Re-initialise UI
  document.getElementById('resign-btn').removeAttribute('disabled');
  document.getElementById('draw-btn').setAttribute('disabled', 'true'); // No draw offers to AI
  
  // Setup Board
  board = new ChessBoard('chessboard', engine, handleLocalMoveAttempt);
  board.setFlipped(false);
  
  updatePlayerStats();
  showView('game');
  toggleModal('endgame-overlay', false);

  document.getElementById('game-connection-status').innerHTML = `
    <span class="status-dot dot-green"></span>
    <span class="status-text">Your Turn</span>
  `;

  // Start Clocks
  state.startClock(
    () => engine.turn,
    (w, b) => updateClockDisplay(w, b),
    (color) => handleTimeExpired(color)
  );
}

// Binds WebRTC Game sync callbacks
function setupSyncCallbacks() {
  return {
    onMatchReady: (assignedColor) => {
      // Initialize game history
      gameHistory = [{
        fen: engine.getFEN(),
        move: null,
        piece: null,
        captured: null
      }];

      // Clear game table histories
      document.getElementById('moves-history-body').innerHTML = '';
      chat.clear();
      chat.enable();
      
      chat.appendSystemNotice(`Match started! You are playing as ${assignedColor === 'w' ? 'White' : 'Black'}.`);

      // Initialise board representation
      board = new ChessBoard('chessboard', engine, handleLocalMoveAttempt);
      board.setFlipped(assignedColor === 'b');
      
      updatePlayerStats();
      showView('game');
      toggleModal('endgame-overlay', false);
      
      document.getElementById('resign-btn').removeAttribute('disabled');
      document.getElementById('draw-btn').removeAttribute('disabled');

      const isMyTurn = engine.turn === state.localPlayerColor;
      document.getElementById('game-connection-status').innerHTML = `
        <span class="status-dot dot-green"></span>
        <span class="status-text">${isMyTurn ? 'Your Turn' : "Opponent's Turn"}</span>
      `;

      // Start Clocks
      state.startClock(
        () => engine.turn,
        (w, b) => updateClockDisplay(w, b),
        (color) => handleTimeExpired(color)
      );
    },

    onMoveReceived: (report) => {
      // Log move to history
      gameHistory.push({
        from: report.from,
        to: report.to,
        piece: report.piece,
        captured: report.captured,
        promotion: report.promotion || 'q',
        fen: report.fen
      });

      playSound(report.captured !== null, report.piece ? report.piece[1] : null);
      board.render(report);
      
      const san = state.moveToSAN(engine, report, report);
      updateMoveHistoryUI(san);
      updatePlayerStats();

      const isMyTurn = engine.turn === state.localPlayerColor;
      document.getElementById('game-connection-status').innerHTML = `
        <span class="status-dot dot-green"></span>
        <span class="status-text">${isMyTurn ? 'Your Turn' : "Opponent's Turn"}</span>
      `;

      verifyEngineGameEnd();
    },

    onChatReceived: (sender, text, timestamp, isLocal) => {
      chat.appendMessage(sender, text, timestamp, isLocal);
    },

    onDrawOffer: () => {
      const accept = confirm("Opponent has offered a draw. Accept?");
      if (accept) {
        sync.acceptDraw();
        handleGameOver({ type: 'draw', reason: 'Draw by Agreement' });
      } else {
        sync.declineDraw();
      }
    },

    onDrawOfferResponse: (accepted) => {
      if (accepted) {
        handleGameOver({ type: 'draw', reason: 'Draw by Agreement' });
      } else {
        chat.appendSystemNotice("Draw offer declined by opponent.");
      }
    },

    onResignReceived: () => {
      handleGameOver({ type: 'resign', byLocal: false });
    },

    onLatencyUpdate: (ms) => {
      const isMyTurn = engine.turn === state.localPlayerColor;
      document.getElementById('game-connection-status').innerHTML = `
        <span class="status-dot dot-green"></span>
        <span class="status-text">${isMyTurn ? 'Your Turn' : "Opponent's Turn"} (Ping: ${ms}ms)</span>
      `;
    },

    onReconnectionSync: () => {
      chat.appendSystemNotice("Game states re-synchronised successfully.");
      board.render();
      updatePlayerStats();
    }
  };
}

// Binds WebRTC Peer connection state triggers
function handlePeerStateChange(state, detail) {
  const statusEl = document.getElementById('game-connection-status');
  
  switch (state) {
    case 'connecting':
      if (detail && detail.code) {
        // Host waiting display
        document.getElementById('generated-room-code').textContent = detail.code;
        document.getElementById('room-info-display').classList.remove('hidden');
      }
      statusEl.innerHTML = `
        <span class="status-dot dot-yellow"></span>
        <span class="status-text">${detail?.message || 'Connecting...'}</span>
      `;
      break;

    case 'connected':
      statusEl.innerHTML = `
        <span class="status-dot dot-green"></span>
        <span class="status-text">Connected. Initiating game...</span>
      `;
      document.getElementById('room-info-display').classList.add('hidden');
      
      if (detail && detail.isHost) {
        sync.initiateMatch();
      }
      break;

    case 'reconnecting':
      statusEl.innerHTML = `
        <span class="status-dot dot-yellow"></span>
        <span class="status-text">Opponent disconnected. Reconnecting (Attempt ${detail.attempt})...</span>
      `;
      chat.appendSystemNotice(`Connection lost. Attempting self-healing reconnect ${detail.attempt}...`);
      break;

    case 'failed':
      statusEl.innerHTML = `
        <span class="status-dot dot-red"></span>
        <span class="status-text">Failed: ${detail.error}</span>
      `;
      chat.appendSystemNotice(`Match failed: ${detail.error}`);
      alert(detail.error);
      break;
  }
}

// ==========================================================================
// GAME REVIEW UI METRIC ORCHESTRATORS
// ==========================================================================

function validateUsername() {
  const username = localStorage.getItem('chess_username');
  if (!username) {
    alert("Please set your username in the 'Player Profile' card first!");
    const input = document.getElementById('username-input');
    if (input) {
      input.classList.add('input-error');
      input.focus();
    }
    return false;
  }
  return true;
}

function startReviewMode() {
  if (gameHistory.length <= 1) {
    alert("No moves were played in this match to review.");
    return;
  }

  // Show Loading Overlay
  toggleModal('review-loading-overlay', true);
  const progressBar = document.getElementById('review-progress-bar');
  const statusText = document.getElementById('review-loading-status');
  let progress = 0;
  
  const progressInterval = setInterval(() => {
    progress += 5;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    if (progress === 30 && statusText) statusText.textContent = "Analyzing pawn structure...";
    if (progress === 60 && statusText) statusText.textContent = "Calculating tactical sacrifices...";
    if (progress === 85 && statusText) statusText.textContent = "Determining player accuracies...";

    if (progress >= 100) {
      clearInterval(progressInterval);
      toggleModal('review-loading-overlay', false);
      
      // Calculate Review Data
      reviewData = ChessReview.analyzeGame(gameHistory);
      window.reviewData = reviewData;
      
      // Update UI Panels
      document.getElementById('panel-history').classList.add('hidden');
      document.getElementById('panel-chat').classList.add('hidden');
      document.getElementById('panel-review').classList.remove('hidden');
      
      document.getElementById('review-navigation').classList.remove('hidden');
      document.querySelector('.board-controls-row').classList.add('hidden');

      // Set state to Review Mode
      isReviewMode = true;
      window.isReviewMode = true; // Expose to board.js
      activeReviewIndex = gameHistory.length - 1;
      window.activeReviewIndex = activeReviewIndex;
      
      // Update stats and coach
      populateReviewUI();
      
      // Show last move
      showReviewMove(activeReviewIndex);
    }
  }, 75);
}

function populateReviewUI() {
  if (!reviewData) return;

  // Update accuracies
  document.getElementById('review-white-accuracy').textContent = reviewData.whiteAccuracy + '%';
  document.getElementById('review-black-accuracy').textContent = reviewData.blackAccuracy + '%';
  
  // Set player names
  let localName = localStorage.getItem('chess_username') || "You";
  let oppName = state.mode === 'ai' ? "Computer" : (state.opponentName || "Opponent");
  
  if (state.localPlayerColor === 'w') {
    document.getElementById('review-white-name').textContent = localName;
    document.getElementById('review-black-name').textContent = oppName;
  } else {
    document.getElementById('review-white-name').textContent = oppName;
    document.getElementById('review-black-name').textContent = localName;
  }

  // Populate Move Quality Table counts
  const body = document.getElementById('move-quality-table-body');
  body.innerHTML = '';
  
  const qualities = [
    { key: 'brilliant', label: 'Brilliant', class: 'q-brilliant', icon: '!!' },
    { key: 'great', label: 'Great', class: 'q-great', icon: '!' },
    { key: 'book', label: 'Book', class: 'q-book', icon: '<i class="fa-solid fa-book"></i>' },
    { key: 'best', label: 'Best', class: 'q-best', icon: '<i class="fa-solid fa-star"></i>' },
    { key: 'excellent', label: 'Excellent', class: 'q-excellent', icon: '<i class="fa-solid fa-thumbs-up"></i>' },
    { key: 'good', label: 'Good', class: 'q-good', icon: '<i class="fa-solid fa-check"></i>' },
    { key: 'inaccuracy', label: 'Inaccuracy', class: 'q-inaccuracy', icon: '?!' },
    { key: 'mistake', label: 'Mistake', class: 'q-mistake', icon: '?' },
    { key: 'miss', label: 'Miss', class: 'q-miss', icon: '<i class="fa-solid fa-xmark"></i>' },
    { key: 'blunder', label: 'Blunder', class: 'q-blunder', icon: '??' }
  ];

  qualities.forEach(q => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${reviewData.counts.w[q.key]}</td>
      <td>
        <span class="quality-badge ${q.class}">${q.icon} ${q.label}</span>
      </td>
      <td>${reviewData.counts.b[q.key]}</td>
    `;
    body.appendChild(row);
  });

  // Calculate coach message summary
  let winMsg = "The game ended in a draw! Both players displayed solid techniques.";
  if (engine.isCheckmate()) {
    const winner = engine.turn === 'w' ? 'Black' : 'White';
    const isWinnerLocal = (state.localPlayerColor === 'w' && winner === 'White') || (state.localPlayerColor === 'b' && winner === 'Black');
    winMsg = isWinnerLocal ? "Outstanding victory! You played with great accuracy." : "Tough defeat, but this review will help you spot key errors.";
  } else if (engine.halfmove >= 100) {
    winMsg = "Draw by 50-move rule. Positional control was maintained by both sides.";
  }
  
  document.getElementById('coach-message').textContent = winMsg;
}

function showReviewMove(index) {
  if (index < 0 || index >= gameHistory.length) return;
  activeReviewIndex = index;
  window.activeReviewIndex = index;

  // Load FEN state
  engine.loadFEN(gameHistory[index].fen);
  
  // Render board
  board.render();
  
  // Update indicator
  const halfMoveCount = index;
  const isWhiteMove = halfMoveCount % 2 === 1;
  const moveNumber = Math.ceil(halfMoveCount / 2);
  document.getElementById('review-move-indicator').textContent = halfMoveCount === 0 ? "Start Position" : `Move ${moveNumber} (${isWhiteMove ? 'White' : 'Black'})`;
  
  // Update detail card
  const card = document.getElementById('active-move-review-card');
  if (halfMoveCount === 0) {
    card.classList.add('hidden');
    drawEvaluationGraph();
    return;
  }
  
  card.classList.remove('hidden');
  const rev = reviewData.reviews[halfMoveCount - 1];
  
  document.getElementById('active-move-classification').className = `move-badge ${rev.classificationClass}`;
  document.getElementById('active-move-classification').textContent = rev.classification.toUpperCase();
  document.getElementById('active-move-notation').textContent = rev.notation;
  document.getElementById('active-move-explanation').textContent = rev.explanation;
  
  // Update coach speech bubble message
  document.getElementById('coach-message').textContent = `Move ${moveNumber}: ${rev.explanation}`;

  // Redraw graph
  drawEvaluationGraph();
}

function drawEvaluationGraph() {
  const canvas = document.getElementById('eval-history-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Center line (0.0 even evaluation)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  
  if (!reviewData || reviewData.reviews.length === 0) return;
  
  const reviews = reviewData.reviews;
  const n = reviews.length;
  
  const getX = (i) => (i / (n - 1)) * w;
  const getY = (idx) => {
    // Normalize eval score relative to White (positive favors White, negative Black)
    const whiteScore = reviews[idx].color === 'w' ? reviews[idx].playedScoreRel : -reviews[idx].playedScoreRel;
    const clamped = Math.max(-600, Math.min(600, whiteScore));
    return h / 2 - (clamped / 600) * (h / 2 - 5);
  };
  
  // Draw evaluation path line
  ctx.strokeStyle = 'var(--accent-3)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  
  for (let i = 0; i < n; i++) {
    const x = getX(i);
    const y = getY(i);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  
  // Fill gradient below/above the line
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0, 255, 163, 0.12)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(255, 77, 109, 0.12)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(getX(i), getY(i));
  }
  ctx.lineTo(w, h / 2);
  ctx.closePath();
  ctx.fill();

  // Active move dot indicator on chart
  if (activeReviewIndex > 0 && activeReviewIndex <= n) {
    const activeIdx = activeReviewIndex - 1;
    const x = getX(activeIdx);
    const y = getY(activeIdx);
    
    ctx.fillStyle = 'var(--accent-3)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

function exitReviewMode() {
  isReviewMode = false;
  window.isReviewMode = false;
  window.reviewData = null;
  
  document.getElementById('panel-review').classList.add('hidden');
  document.getElementById('panel-history').classList.remove('hidden');
  document.getElementById('panel-chat').classList.remove('hidden');
  
  document.getElementById('review-navigation').classList.add('hidden');
  document.querySelector('.board-controls-row').classList.remove('hidden');
}

// ==========================================================================
// DOM BINDINGS & APP SETUP
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Managers
  theme = new ThemeManager('theme-toggle');
  engine = new ChessEngine();
  state = new ChessState();
  
  chat = new ChatManager('chat-form', 'chat-input-field', 'chat-messages-box', 'chat-badge');
  donation = new DonationManager('upi-qr-canvas', 'upi-address-text', 'copy-upi-btn', 'download-qr-btn', 'open-upi-app-btn');
  
  peer = new PeerManager(handlePeerStateChange, (data) => sync.handleMessage(data));
  sync = new GameSync(peer, engine, state, setupSyncCallbacks());

  // AI Difficulty Options
  const diffButtons = document.querySelectorAll('.diff-btn');
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDifficulty = btn.dataset.level;
    });
  });

  // Start AI Match Button
  document.getElementById('start-ai-btn').addEventListener('click', startAIGame);

  // Start Analysis Match Button
  document.getElementById('start-analysis-btn').addEventListener('click', startAnalysisMode);

  // Host Room Button
  document.getElementById('create-room-btn').addEventListener('click', () => {
    if (!validateUsername()) return;
    peer.destroy();
    peer.hostRoom();
  });

  // Join Room Button
  document.getElementById('join-room-btn').addEventListener('click', () => {
    if (!validateUsername()) return;
    const input = document.getElementById('room-code-input');
    const code = input.value.trim();
    if (!code) {
      alert("Please enter a valid room code.");
      return;
    }
    peer.destroy();
    peer.joinRoom(code);
  });

  // Share invite links
  document.getElementById('share-link-btn').addEventListener('click', () => {
    if (!peer.roomCode) return;
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${peer.roomCode}`;
    navigator.clipboard.writeText(inviteLink)
      .then(() => alert("Invite link copied to clipboard!"))
      .catch(err => console.error("Link copy failed: ", err));
  });

  // Show room invite QR code
  document.getElementById('qr-invite-btn').addEventListener('click', () => {
    if (!peer.roomCode) return;
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${peer.roomCode}`;
    
    // Toggle element visibility
    const canvas = document.getElementById('upi-qr-canvas');
    const image = document.getElementById('upi-qr-image');
    if (canvas && image) {
      canvas.classList.remove('hidden');
      image.classList.add('hidden');
    }

    // Reuse donation manager code generation capabilities
    donation.setUPIDetails(peer.roomCode, "Invite Link");
    // Draw QR for the invite link instead of UPI
    if (window.QRious) {
      new QRious({
        element: canvas,
        value: inviteLink,
        size: 220
      });
      document.getElementById('upi-address-text').textContent = peer.roomCode;
      document.getElementById('open-upi-app-btn').classList.add('hidden');
      toggleModal('donation-modal', true);
    }
  });

  // Chat Form submission
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const field = document.getElementById('chat-input-field');
    const msg = field.value.trim();
    if (!msg) return;

    sync.sendChat(msg);
    field.value = '';
  });

  // Match Action Controls
  document.getElementById('resign-btn').addEventListener('click', () => {
    const confirmResign = confirm("Are you sure you want to resign the match?");
    if (confirmResign) {
      if (state.mode === 'ai') {
        handleGameOver({ type: 'resign', byLocal: true });
      } else {
        sync.resignMatch();
        handleGameOver({ type: 'resign', byLocal: true });
      }
    }
  });

  document.getElementById('draw-btn').addEventListener('click', () => {
    if (state.mode === 'p2p') {
      chat.appendSystemNotice("Draw offer sent to opponent.");
      sync.proposeDraw();
    }
  });

  document.getElementById('flip-board-btn').addEventListener('click', () => {
    if (board) {
      board.setFlipped(!board.flipped);
    }
  });

  document.getElementById('leave-game-btn').addEventListener('click', () => {
    const leave = confirm("Quit match to main menu?");
    if (leave) {
      state.stopClock();
      peer.destroy();
      sync.destroy();
      
      // Clean up Stockfish Web Worker
      if (stockfishWorker) {
        stockfishWorker.terminate();
        stockfishWorker = null;
      }
      
      exitReviewMode();
      
      // Reset UI layout settings back to normal
      document.querySelector('.chat-panel').classList.remove('hidden');
      document.getElementById('analysis-panel').classList.add('hidden');
      document.querySelector('.chessboard-outer-frame').classList.remove('has-eval');
      document.getElementById('evaluation-bar-container').classList.add('hidden');
      
      showView('landing');
    }
  });

  document.getElementById('endgame-menu-btn').addEventListener('click', () => {
    toggleModal('endgame-overlay', false);
    exitReviewMode();
    showView('landing');
  });

  document.getElementById('endgame-rematch-btn').addEventListener('click', () => {
    toggleModal('endgame-overlay', false);
    if (state.mode === 'ai') {
      startAIGame();
    } else {
      // Re-initialize match request
      if (peer.isHost) {
        sync.initiateMatch();
      } else {
        chat.appendSystemNotice("Waiting for host to restart match...");
      }
    }
  });

  // Footer / Header Donation Modal triggers
  const openDonation = () => {
    // Toggle element visibility
    const canvas = document.getElementById('upi-qr-canvas');
    const image = document.getElementById('upi-qr-image');
    if (canvas && image) {
      canvas.classList.add('hidden');
      image.classList.remove('hidden');
    }

    // Reset donation QR code details
    donation.setUPIDetails("8019542500@upi", "THELKOTLOL SANTOSH");
    document.getElementById('open-upi-app-btn').classList.remove('hidden');
    toggleModal('donation-modal', true);
  };
  
  document.getElementById('nav-support-btn').addEventListener('click', openDonation);
  document.getElementById('footer-support-btn').addEventListener('click', openDonation);
  document.getElementById('post-game-support-btn').addEventListener('click', openDonation);
  document.getElementById('close-donation-btn').addEventListener('click', () => toggleModal('donation-modal', false));

  // Tech Architecture modal triggers
  document.getElementById('footer-about-btn').addEventListener('click', () => toggleModal('about-modal', true));
  document.getElementById('close-about-btn').addEventListener('click', () => toggleModal('about-modal', false));

  // Mobile navigation tabs routing
  const tabButtons = document.querySelectorAll('.mobile-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabName = btn.dataset.tab;
      chat.setActiveTab(tabName);

      // Hide all panels
      document.getElementById('panel-board').classList.remove('mobile-active');
      document.getElementById('panel-history').classList.remove('mobile-active');
      document.getElementById('panel-chat').classList.remove('mobile-active');

      if (tabName === 'board') {
        document.getElementById('panel-board').classList.add('mobile-active');
      } else if (tabName === 'history') {
        document.getElementById('panel-history').classList.add('mobile-active');
      } else if (tabName === 'chat') {
        document.getElementById('panel-chat').classList.add('mobile-active');
      }
    });
  });

  // Detect URL parameter for instant joining: ?room=K9-R2-M6
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomCode = urlParams.get('room');
  if (urlRoomCode) {
    document.getElementById('room-code-input').value = urlRoomCode;
    peer.joinRoom(urlRoomCode);
  }
  
  // Set initial mobile active view
  document.getElementById('panel-board').classList.add('mobile-active');

  // Initialize Player Profile from localStorage
  const usernameInput = document.getElementById('username-input');
  const savedName = localStorage.getItem('chess_username');
  if (savedName && usernameInput) {
    usernameInput.value = savedName;
  }

  // Save Player Name button
  const saveBtn = document.getElementById('save-username-btn');
  if (saveBtn && usernameInput) {
    saveBtn.addEventListener('click', () => {
      const name = usernameInput.value.trim().toLowerCase();
      if (!name) {
        alert("Please enter a valid username.");
        usernameInput.classList.add('input-error');
        return;
      }
      localStorage.setItem('chess_username', name);
      usernameInput.classList.remove('input-error');
      alert(`Username successfully set to: ${name}`);
    });
    
    usernameInput.addEventListener('input', () => {
      usernameInput.classList.remove('input-error');
    });
  }

  // Bind Game Review button
  document.getElementById('endgame-review-btn').addEventListener('click', startReviewMode);

  // Bind Game Review navigation buttons
  document.getElementById('review-first-btn').addEventListener('click', () => showReviewMove(0));
  document.getElementById('review-prev-btn').addEventListener('click', () => showReviewMove(activeReviewIndex - 1));
  document.getElementById('review-next-btn').addEventListener('click', () => showReviewMove(activeReviewIndex + 1));
  document.getElementById('review-last-btn').addEventListener('click', () => showReviewMove(gameHistory.length - 1));
});
