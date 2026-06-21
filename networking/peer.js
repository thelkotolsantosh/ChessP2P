/**
 * PeerManager - Establishes and manages WebRTC connections using PeerJS.
 * Handles room creation, join routing, STUN configurations, and reconnection lifecycles.
 */
class PeerManager {
  constructor(onStateChange, onDataReceived) {
    this.onStateChange = onStateChange; // (state, detail) => {}
    this.onDataReceived = onDataReceived; // (data) => {}
    
    this.peer = null;
    this.conn = null;
    this.roomCode = null;
    this.isHost = false;
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting, failed
    
    // PeerJS Cloud signaling server configurations + free STUN servers
    this.iceConfig = {
      debug: 3, // Enable verbose logs
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    };
    
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
  }

  /**
   * Generates a 6-character alpha-numeric room code.
   * e.g., K9-R2-M6
   * Letters (A-Z) + Digits (1-9) excluding 0/O for legibility.
   */
  generateRoomCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I, O
    const digits = '123456789';
    
    const genSegment = () => {
      const char = letters[Math.floor(Math.random() * letters.length)];
      const num = digits[Math.floor(Math.random() * digits.length)];
      return char + num;
    };

    return `${genSegment()}-${genSegment()}-${genSegment()}`;
  }

  /**
   * Transition helper for connection state machine.
   */
  transitionTo(state, detail = null) {
    console.log(`WebRTC State: ${this.connectionState} -> ${state}`, detail || '');
    this.connectionState = state;
    this.onStateChange(state, detail);
  }

  /**
   * Initialises the Host connection sequence.
   */
  hostRoom() {
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    const peerId = `chessp2p-room-${this.roomCode}`;
    
    this.transitionTo('connecting', { 
      message: 'Registering room on signaling server...', 
      code: this.roomCode 
    });

    this.peer = new Peer(peerId, this.iceConfig);
    this.bindPeerEvents();
  }

  /**
   * Initialises the Guest connection sequence.
   */
  joinRoom(code) {
    this.isHost = false;
    // Format input (strip whitespace, enforce uppercase)
    this.roomCode = code.trim().toUpperCase();
    const targetPeerId = `chessp2p-room-${this.roomCode}`;
    
    this.transitionTo('connecting', { message: 'Connecting to signaling broker...' });

    // Client gets a random ID from signaling server
    this.peer = new Peer(undefined, this.iceConfig);
    
    this.peer.on('open', (id) => {
      console.log(`Local client registered with ID: ${id}`);
      this.transitionTo('connecting', { message: `Dialing host: ${this.roomCode}...` });
      
      const conn = this.peer.connect(targetPeerId, {
        reliable: true
      });
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error("Joiner Peer Error:", err);
      this.transitionTo('failed', { error: 'Failed to connect. Double check the room code.' });
    });
  }

  /**
   * Binds global PeerJS events.
   */
  bindPeerEvents() {
    this.peer.on('open', (id) => {
      console.log(`Room registered successfully. Peer ID: ${id}`);
      this.transitionTo('connecting', { message: 'Waiting for opponent to join...', code: this.roomCode });
    });

    // Listen for incoming connection (Host-specific)
    this.peer.on('connection', (conn) => {
      if (this.conn) {
        // Reject extra connections if already playing
        console.warn("Incoming connection rejected: room is full.");
        conn.close();
        return;
      }
      console.log("Opponent connected to room. Initialising data channels.");
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error("PeerJS Error:", err.type, err);
      
      if (err.type === 'unavailable-id') {
        // Room code collision! Try again if host
        if (this.isHost) {
          console.warn("Room collision detected. Regenerating code...");
          this.destroy();
          this.hostRoom();
        }
      } else {
        this.transitionTo('failed', { error: `Signaling Error: ${err.message}` });
      }
    });

    this.peer.on('disconnected', () => {
      console.warn("Disconnected from signaling server. WebRTC datachannel remains active.");
      // Note: We don't drop the match here because direct WebRTC connection might still be active!
    });
  }

  /**
   * Attaches handlers to the WebRTC DataChannel connection.
   */
  setupConnection(conn) {
    this.conn = conn;

    const handleOpen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      
      this.transitionTo('connected', { isHost: this.isHost });
    };

    // Race condition fix: if connection is already open, fire callback immediately
    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        this.onDataReceived(parsed);
      } catch (err) {
        console.error("Failed to parse incoming network packet:", err);
      }
    });

    conn.on('close', () => {
      console.warn("WebRTC DataChannel closed.");
      this.handleConnectionDrop();
    });

    conn.on('error', (err) => {
      console.error("WebRTC DataChannel connection error:", err);
      this.handleConnectionDrop();
    });
  }

  /**
   * Processes drops and initiates attempts to self-heal.
   */
  handleConnectionDrop() {
    if (this.connectionState === 'disconnected' || this.connectionState === 'failed') return;
    
    this.conn = null;
    this.transitionTo('reconnecting', { attempt: this.reconnectAttempts + 1 });

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Exponential backoff reconnect dialer
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.attemptReconnect();
      }, delay);
    } else {
      this.transitionTo('failed', { error: 'Connection lost. Max reconnection attempts exceeded.' });
    }
  }

  /**
   * Logic to dial back.
   */
  attemptReconnect() {
    if (this.isHost) {
      // Host just waits for Guest to dial back
      console.log("Host is waiting for guest reconnection...");
      // Re-register listener on signaling server if peer was disconnected
      if (this.peer && this.peer.disconnected) {
        this.peer.reconnect();
      }
    } else {
      // Guest redials the Host
      console.log("Guest is attempting to dial host...");
      if (this.peer) {
        if (this.peer.disconnected) {
          this.peer.reconnect();
        }
        const targetPeerId = `chessp2p-room-${this.roomCode}`;
        const conn = this.peer.connect(targetPeerId, { reliable: true });
        this.setupConnection(conn);
      }
    }
  }

  /**
   * Sends data payload over WebRTC datachannel.
   */
  send(type, payload = {}) {
    if (this.conn && this.conn.open) {
      const dataString = JSON.stringify({ type, payload });
      this.conn.send(dataString);
      return true;
    }
    console.error("Cannot send network packet: WebRTC channel not open.");
    return false;
  }

  /**
   * Resets and cleans up all connections.
   */
  destroy() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    this.roomCode = null;
    this.isHost = false;
    this.connectionState = 'disconnected';
  }
}

// Make globally accessible
window.PeerManager = PeerManager;
