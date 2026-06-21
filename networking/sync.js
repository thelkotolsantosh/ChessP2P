/**
 * GameSync - Coordinates game state updates, validations, clock updates, 
 * draw offers, resignations, and chat logs across WebRTC datachannels.
 */
class GameSync {
  constructor(peerManager, engine, state, uiCallbacks) {
    this.peer = peerManager;
    this.engine = engine;
    this.state = state;
    
    // UI trigger notifications
    this.ui = uiCallbacks; 
    // Example: { 
    //   onMoveReceived: (moveReport) => {}, 
    //   onChatReceived: (sender, text, time) => {}, 
    //   onDrawOffer: () => {},
    //   onDrawOfferResponse: (accepted) => {},
    //   onResignReceived: () => {},
    //   onLatencyUpdate: (ms) => {},
    //   onReconnectionSync: () => {}
    // }

    this.latencyInterval = null;
    this.lastPingTime = 0;
  }

  /**
   * Initializes WebRTC message sync event listeners.
   */
  handleMessage(parsed) {
    const { type, payload } = parsed;
    
    switch (type) {
      case 'match_init':
        this.processMatchInit(payload);
        break;

      case 'match_ack':
        this.processMatchAck(payload);
        break;

      case 'move':
        this.processMoveReceived(payload);
        break;

      case 'chat':
        this.processChatReceived(payload);
        break;

      case 'draw_offer':
        this.processDrawOffer(payload);
        break;

      case 'resign':
        this.processResignReceived();
        break;

      case 'ping':
        this.processPing(payload);
        break;

      case 'pong':
        this.processPong(payload);
        break;

      case 'state_sync':
        this.processStateSync(payload);
        break;
    }
  }

  /**
   * Host assigns player colors randomly and initiates match values.
   */
  initiateMatch() {
    if (!this.peer.isHost) return;

    // Randomize: White is white, black is black
    const hostColor = Math.random() < 0.5 ? 'w' : 'b';
    const guestColor = hostColor === 'w' ? 'b' : 'w';
    
    const timeLimit = 600; // 10 minutes default

    // Set local state
    this.state.startNewMatch(hostColor, 'p2p', timeLimit);
    this.engine.reset();

    const hostName = localStorage.getItem('chess_username') || "Host";

    // Small delay (200ms) before sending match_init to let WebRTC channel settle
    setTimeout(() => {
      this.peer.send('match_init', {
        guestColor: guestColor,
        timeLimit: timeLimit,
        fen: this.engine.getFEN(),
        hostName: hostName
      });
    }, 200);

    // Start latency tracking
    this.startLatencyTracking();
    
    // Trigger board redraw locally
    this.ui.onMatchReady(hostColor);
  }

  processMatchInit(payload) {
    const { guestColor, timeLimit, fen, hostName } = payload;
    
    // Save opponent's name
    this.state.opponentName = hostName || "Host";
    
    // Set local state matching host instruction
    this.state.startNewMatch(guestColor, 'p2p', timeLimit);
    this.engine.loadFEN(fen);

    // Reply with match_ack containing guestName
    const guestName = localStorage.getItem('chess_username') || "Guest";
    this.peer.send('match_ack', {
      guestName: guestName
    });

    this.startLatencyTracking();
    
    // Trigger board redraw locally
    this.ui.onMatchReady(guestColor);
  }

  processMatchAck(payload) {
    const { guestName } = payload;
    this.state.opponentName = guestName || "Guest";
    if (typeof updatePlayerStats === 'function') {
      updatePlayerStats();
    }
  }

  /**
   * Formulate and send local moves.
   */
  sendMove(from, to, promotion = 'q') {
    // Perform validation locally
    const report = this.engine.makeMove(from, to, promotion);
    if (!report.success) return false;

    // Send payload including remaining local clock times to correct latency drifts
    this.peer.send('move', {
      from,
      to,
      promotion,
      fen: this.engine.getFEN(),
      whiteTime: this.state.whiteTime,
      blackTime: this.state.blackTime
    });

    return report;
  }

  /**
   * Process moves sent by opponent.
   */
  processMoveReceived(payload) {
    const { from, to, promotion, fen, whiteTime, blackTime } = payload;

    // Double validation: Attempt move on local engine
    const report = this.engine.makeMove(from, to, promotion);
    
    if (report.success) {
      // Sync clock timers directly to eliminate drift
      this.state.whiteTime = whiteTime;
      this.state.blackTime = blackTime;

      // Double Check FEN signatures to prevent cheating / desyncs
      if (this.engine.getFEN() !== fen) {
        console.warn("Desynchronisation detected between clients! Re-syncing board from FEN...", fen);
        this.engine.loadFEN(fen);
      }

      this.ui.onMoveReceived(report);
    } else {
      console.error("Opponent attempted illegal move! Requesting full state sync...");
      this.requestStateSync();
    }
  }

  /**
   * Recovers state if connection drops and drops back in.
   */
  syncOnReconnection() {
    console.log("Reconnected! Sending sync payload...");
    this.peer.send('state_sync', {
      fen: this.engine.getFEN(),
      whiteTime: this.state.whiteTime,
      blackTime: this.state.blackTime,
      isRequest: false
    });
  }

  requestStateSync() {
    this.peer.send('state_sync', { isRequest: true });
  }

  processStateSync(payload) {
    if (payload.isRequest) {
      // Send active state if requested
      this.peer.send('state_sync', {
        fen: this.engine.getFEN(),
        whiteTime: this.state.whiteTime,
        blackTime: this.state.blackTime,
        isRequest: false
      });
    } else {
      // Re-sync local engine
      console.log("Applying board sync state:", payload.fen);
      this.engine.loadFEN(payload.fen);
      this.state.whiteTime = payload.whiteTime;
      this.state.blackTime = payload.blackTime;
      
      this.ui.onReconnectionSync();
    }
  }

  // ==========================================================================
  // SOCIAL & CHAT FUNCTIONS
  // ==========================================================================

  sendChat(text) {
    const msg = {
      text: text,
      timestamp: Date.now(),
      sender: this.state.localPlayerColor
    };
    
    if (this.peer.send('chat', msg)) {
      this.ui.onChatReceived(msg.sender, msg.text, msg.timestamp, true);
    }
  }

  processChatReceived(payload) {
    this.ui.onChatReceived(payload.sender, payload.text, payload.timestamp, false);
  }

  // ==========================================================================
  // GAME NEGOTIATION CHANNELS
  // ==========================================================================

  proposeDraw() {
    this.peer.send('draw_offer', { action: 'propose' });
  }

  acceptDraw() {
    this.peer.send('draw_offer', { action: 'accept' });
  }

  declineDraw() {
    this.peer.send('draw_offer', { action: 'decline' });
  }

  processDrawOffer(payload) {
    const { action } = payload;
    if (action === 'propose') {
      this.ui.onDrawOffer();
    } else if (action === 'accept') {
      this.ui.onDrawOfferResponse(true);
    } else if (action === 'decline') {
      this.ui.onDrawOfferResponse(false);
    }
  }

  resignMatch() {
    this.peer.send('resign');
  }

  processResignReceived() {
    this.ui.onResignReceived();
  }

  // ==========================================================================
  // LATENCY / KEEP-ALIVE SYSTEM
  // ==========================================================================

  startLatencyTracking() {
    this.stopLatencyTracking();
    
    // Ping every 5 seconds
    this.latencyInterval = setInterval(() => {
      this.lastPingTime = Date.now();
      this.peer.send('ping', { time: this.lastPingTime });
    }, 5000);
  }

  stopLatencyTracking() {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
  }

  processPing(payload) {
    // Reply immediately with pong
    this.peer.send('pong', { time: payload.time });
  }

  processPong(payload) {
    const latency = Date.now() - payload.time;
    this.ui.onLatencyUpdate(latency);
  }

  destroy() {
    this.stopLatencyTracking();
  }
}

// Make globally accessible
window.GameSync = GameSync;
