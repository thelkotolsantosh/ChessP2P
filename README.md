# ♟️ P2P Chess: Zero-Server WebRTC Chess Platform

A production-grade, 100% serverless, peer-to-peer multiplayer chess platform that runs entirely in the browser. Challenge friends directly browser-to-browser via WebRTC with sub-100ms move latency, or play against a high-performance AI engine running in a background thread.

Deploys instantly on the **Netlify Free Tier** with zero operational or maintenance costs.

---

## 🚀 Key Features

- **True Peer-to-Peer:** Game moves and chat logs travel directly between players' browsers. No central gameplay database, no chat relays, and 100% private.
- **Easy Matchmaking:** Host generates a human-friendly, collision-resistant 6-character room code (e.g. `K9-R2-M6`). Guests input the code to connect instantly.
- **Advanced AI Opponent:** Play offline against an AI with 4 difficulty levels. The AI features positional Piece-Square Tables (PST) and deep Minimax search with Alpha-Beta pruning and Quiescence search, running inside a Web Worker.
- **Modern UI/UX:** Stunning dark-themed glassmorphism interface with smooth animations, dynamic coordinates, and full touch controls for mobile/tablet screens.
- **Dynamic Donation System:** Custom canvas-based UPI QR generator to optionally support developers, supporting deep linking to GPay, PhonePe, and Paytm.
- **No Logins Required:** No sign-up forms, no cookies, no tracking. Open the page and play instantly.

---

## 🏗️ Folder Structure

```
ChessP2P/
│
├── index.html          # Semantic HTML5 layout, imports libraries and handles modal structures
├── style.css           # Glassmorphism/Neomorphism design tokens, layout grids, animations
├── main.js             # Core coordinator, event router, synth audio generator
│
├── chess/
│   ├── engine.js       # Complete chess rules (moves, checks, draw states, FEN parsing)
│   ├── board.js        # Responsive grid layout rendering modern SVG piece outlines
│   └── state.js        # Captured piece tallies, timer countdowns, SAN move conversions
│
├── ai/
│   ├── worker.js       # Web Worker entry, preventing deep searches from freezing the browser UI
│   ├── evaluation.js   # Positional piece-square tables, material weights, endgame scaling
│   └── minimax.js      # Search algorithms: alpha-beta cutoffs, MVV-LVA move ordering
│
├── networking/
│   ├── peer.js         # PeerJS interface, public STUN parameters, reconnect state machine
│   └── sync.js         # Dual FEN verification protocol, ping-pong latency checking
│
├── ui/
│   ├── theme.js        # Light/Dark stylesheet variable switcher
│   ├── chat.js         # Scrollable chat bubbles, unread notification badges
│   └── donation.js     # QRious canvas UPI renderer, offline QR savers, app linkers
│
└── netlify.toml        # Deployment routing rules and HTTP security headers
```

---

## 📡 WebRTC & Network Traversal Deep-Dive

WebRTC (Web Real-Time Communication) allows web applications to establish direct, peer-to-peer data channels between browsers. However, browsers cannot easily find each other's network addresses without help. The connection sequence follows a two-phase process:

```
[Player A]                      [PeerJS Signaling Server]                     [Player B]
    │                                       │                                     │
    │ 1. Host registers room code           │                                     │
    ├──────────────────────────────────────>│                                     │
    │                                       │ 2. Dial room code                   │
    │                                       │<────────────────────────────────────┤
    │ 3. Exchange SDP Offer/Answer          │                                     │
    ├<─────────────────────────────────────>┤                                     │
    │                                       │                                     │
    │ 4. Swap ICE Candidates                │                                     │
    ├<─────────────────────────────────────>┤                                     │
    │                                       │                                     │
    │================ DIRECT WebRTC DATA CHANNEL OPENED ==========================│
    │                                                                             │
    │ 5. Disconnect Signaling               │                                     │
    ├──────────────────────────────────────x│                                     │
    │                                                                             │
    │ 6. Send Move Coordinates (P2P Direct)                                       │
    ├────────────────────────────────────────────────────────────────────────────>│
```

### 1. Signaling Phase
Before connecting directly, browsers exchange session parameters (SDP description profiles: resolution, channel parameters) and network candidates. We use the public, free **PeerJS Cloud** signaling server (`0.peerjs.com`) to broker this initial exchange. Once both browsers swap their network configuration details, the signaling broker is bypassed, and direct P2P data flow begins.

### 2. NAT Traversal: STUN, TURN, and ICE
Most computers sit behind a **NAT (Network Address Translator)** router, which hides their private local IP addresses from the public web. 

- **STUN (Session Traversal Utilities for NAT):** A STUN server sits on the public internet. When Player A pings the STUN server, the server responds back with Player A's public-facing IP address and port number. Players exchange these discovered public coordinates (called **ICE Candidates**) to establish a direct pathway through their routers. We use Google's public STUN servers:
  - `stun:stun.l.google.com:19302`
- **TURN (Traversal Using Relays around NAT):** If both players are behind restrictive firewalls (such as symmetric enterprise NATs or strict university proxies), they cannot establish a direct path. In this case, a TURN server relays all data. Because TURN servers consume high hosting bandwidth, they require paid hosting. This free, serverless project relies entirely on STUN; hence, matches will occasionally fail if both players are on highly restrictive corporate networks.

---

## 🧠 AI Search Architecture: Minimax & Alpha-Beta

The computer opponent runs inside a **Web Worker** background thread. If the search ran on the main thread, the browser UI would lock up, leading to piece drag-and-drop lag.

### 1. The Minimax Algorithm
Minimax is a decision-making algorithm that simulates all possible moves up to a certain depth. It assumes both players will play their optimal moves. White aims to maximize the board evaluation score, while Black aims to minimize it.

### 2. Alpha-Beta Pruning
An unpruned search tree grows exponentially. **Alpha-Beta pruning** eliminates branches that are guaranteed to be worse than branches we have already evaluated. 
- **Alpha:** The minimum score the maximizing player is assured of.
- **Beta:** The maximum score the minimizing player is assured of.

If at any point \(\beta \le \alpha\), the search prunes that branch, saving massive compute cycles:

```
            [Max Node]
           /          \
      [Min Node]       [Min Node]
      /   |   \         /   |   \
     3    5   10       2   (x)  (x)  <-- Pruned! Since min player has a 2, 
                                         max player will never choose this branch
                                         if their other option is >= 3.
```

### 3. MVV-LVA Move Ordering
Alpha-beta pruning is most efficient when the best moves are evaluated first. We implement **MVV-LVA (Most Valuable Victim - Least Valuable Attacker)** sorting. Capturing a Queen with a Pawn is sorted to the front of the evaluation queue, triggering cutoffs much earlier.

### 4. Quiescence Search
Standard minimax suffers from the **Horizon Effect**—if a search ends at depth 4 right before a capture occurs, the static evaluation will show an incorrect, inflated score. **Quiescence search** extends the search depth for all pending capture sequences until the board becomes stable (no more captures possible), preventing the AI from making tactical blunders.

---

## 🔒 Security: Dual-State Validation
In centralized multiplayer games, a server maintains the authority of the board state. To achieve this in a serverless peer-to-peer environment, we enforce **Dual-State Validation**:

1. Player A moves their Knight.
2. Player A's local engine verifies the move, executes it, and sends the move coordinates `{from: 42, to: 28, promotion: 'q'}` along with Player A's resulting board FEN state.
3. Player B's browser receives the coordinates. It does **not** blindly render the move. Instead, Player B's local engine validates the move.
4. If valid, Player B executes the move, updates their board, and compares their resulting FEN state with Player A's FEN.
5. If the FENs mismatch (due to a packet drop, desync, or tamper attempt), Player B flags a warning and requests a clean state synchronization using the host FEN.

---

## 🛠️ Local Development & Setup

You don't need any complex compilation steps. Simply open `index.html` in your browser. To test WebRTC locally, you should run a local web server:

### Option A: Using Python
Open your terminal inside the project folder and run:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in two different browser tabs (one in Incognito to simulate two different players).

### Option B: Using Node.js
```bash
npx serve .
```

---

## ⚡ Deployment to Netlify

This project is completely configured for Netlify out of the box.

1. **Via Netlify Dashboard:**
   - Create a free Netlify account.
   - Click "Add new site" -> "Deploy manually".
   - Drag and drop the `ChessP2P` project folder.
2. **Via Git Integration:**
   - Initialize a Git repo and push to GitHub/GitLab.
   - Connect the repo to Netlify. It will automatically deploy updates when you push to main!
