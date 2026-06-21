/**
 * ChessBoard - Renders the physical chessboard grid, pieces, coordinates,
 * and processes tap/drag inputs for both Desktop and Mobile interfaces.
 */
class ChessBoard {
  constructor(containerId, engine, onMoveAttempt) {
    this.container = document.getElementById(containerId);
    this.engine = engine;
    this.onMoveAttempt = onMoveAttempt;
    
    this.flipped = false; // Is board viewed from Black's perspective
    this.selectedSquare = null; // Currently clicked piece square index
    this.activeDragPiece = null; // DOM reference to dragged element
    this.dragStartSquare = null; // Index where drag started
    this.legalDestinations = []; // Highlighted squares
    
    // Bind event handlers
    this.handleSquareClick = this.handleSquareClick.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    
    // SVG Piece Definitions (Clean outline vectors)
    this.pieceSVGs = this.getPieceSVGs();
    
    this.init();
  }

  init() {
    // Listeners for global mousemove/touchmove for drag interactions
    window.addEventListener('mousemove', this.handleDragMove);
    window.addEventListener('touchmove', this.handleDragMove, { passive: false });
    window.addEventListener('mouseup', this.handleDragEnd);
    window.addEventListener('touchend', this.handleDragEnd);
  }

  /**
   * Cleans up event listeners when changing views.
   */
  destroy() {
    window.removeEventListener('mousemove', this.handleDragMove);
    window.removeEventListener('touchmove', this.handleDragMove);
    window.removeEventListener('mouseup', this.handleDragEnd);
    window.removeEventListener('touchend', this.handleDragEnd);
  }

  /**
   * Sets the perspective of the board.
   */
  setFlipped(flipped) {
    this.flipped = flipped;
    this.render();
  }

  /**
   * Helper to map grid coordinates to physical square indices.
   * Row 0, Col 0 is top-left.
   * If flipped, top-left is h1 (56 + 7 = 63).
   * If normal, top-left is a8 (0).
   */
  coordsToSquare(row, col) {
    if (this.flipped) {
      return (7 - row) * 8 + (7 - col);
    }
    return row * 8 + col;
  }

  /**
   * Draws the board state and injects SVG elements.
   */
  render(lastMove = null) {
    this.container.innerHTML = '';
    
    // Redraw coordinates tags in the outer frame if they exist
    this.updateCoordinatesDisplay();

    // Check if king is in check
    const inCheck = this.engine.inCheck();
    let checkedKingSquare = -1;
    if (inCheck) {
      const activeKing = this.engine.turn + 'k';
      checkedKingSquare = this.engine.board.findIndex(p => p === activeKing);
    }

    // Check if we are in review mode
    let isReviewFrom = false;
    let isReviewTo = false;
    let activeReview = null;
    if (window.isReviewMode && window.reviewData && window.activeReviewIndex > 0) {
      activeReview = window.reviewData.reviews[window.activeReviewIndex - 1];
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sqIndex = this.coordsToSquare(r, c);
        const piece = this.engine.board[sqIndex];
        
        if (activeReview) {
          isReviewFrom = (sqIndex === activeReview.from);
          isReviewTo = (sqIndex === activeReview.to);
        } else {
          isReviewFrom = false;
          isReviewTo = false;
        }

        // Create square element
        const squareEl = document.createElement('div');
        squareEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        squareEl.dataset.square = sqIndex;
        
        // Apply review highlights
        if (activeReview && (isReviewFrom || isReviewTo)) {
          squareEl.classList.add(`review-${activeReview.classification}`);
        }

        // Highlight Selected
        if (sqIndex === this.selectedSquare) {
          squareEl.classList.add('selected');
        }

        // Highlight Check
        if (sqIndex === checkedKingSquare) {
          squareEl.classList.add('in-check');
        }

        // Highlight Last Move
        if (!window.isReviewMode && lastMove && (sqIndex === lastMove.from || sqIndex === lastMove.to)) {
          squareEl.classList.add('last-move');
        }

        // Highlight Legal moves
        if (this.legalDestinations.includes(sqIndex)) {
          const isCapture = piece !== null || (this.engine.enPassant === sqIndex && this.engine.board[this.dragStartSquare || this.selectedSquare]?.slice(1) === 'p');
          squareEl.classList.add(isCapture ? 'legal-dest-capture' : 'legal-dest');
        }

        // Inject Piece SVG
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = `piece ${piece}`;
          pieceEl.innerHTML = this.pieceSVGs[piece];
          pieceEl.dataset.square = sqIndex;
          
          // Drag and Tap Events
          pieceEl.addEventListener('mousedown', (e) => this.handleDragStart(e, sqIndex, pieceEl));
          pieceEl.addEventListener('touchstart', (e) => this.handleDragStart(e, sqIndex, pieceEl), { passive: true });
          
          squareEl.appendChild(pieceEl);
        }

        // Standard tap interactions
        squareEl.addEventListener('click', (e) => this.handleSquareClick(e, sqIndex));

        // Inject review badge on target square
        if (isReviewTo && activeReview) {
          const badgeEl = document.createElement('div');
          badgeEl.className = `review-badge badge-${activeReview.classification}`;
          const badgeTextMap = {
            brilliant: '!!',
            great: '!',
            book: 'B',
            best: '★',
            excellent: '✓',
            good: '✓',
            inaccuracy: '?!',
            mistake: '?',
            miss: '✗',
            blunder: '??'
          };
          badgeEl.textContent = badgeTextMap[activeReview.classification] || '';
          squareEl.appendChild(badgeEl);
        }

        this.container.appendChild(squareEl);
      }
    }
  }

  /**
   * Redraws letters (A-H) and numbers (1-8) along the board border matching orientation.
   */
  updateCoordinatesDisplay() {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    const yContainer = document.querySelector('.board-y-coordinates');
    const xContainer = document.querySelector('.board-x-coordinates');

    if (yContainer && xContainer) {
      yContainer.innerHTML = '';
      xContainer.innerHTML = '';

      const activeRanks = this.flipped ? [...ranks].reverse() : ranks;
      const activeFiles = this.flipped ? [...files].reverse() : files;

      activeRanks.forEach(r => {
        const span = document.createElement('span');
        span.textContent = r;
        yContainer.appendChild(span);
      });

      activeFiles.forEach(f => {
        const span = document.createElement('span');
        span.textContent = f;
        xContainer.appendChild(span);
      });
    }
  }

  /**
   * Standard Tap-to-move selections.
   */
  handleSquareClick(e, squareIndex) {
    if (window.isReviewMode) return;
    this.processSelection(squareIndex);
  }

  processSelection(squareIndex) {
    const piece = this.engine.board[squareIndex];
    const myTurn = piece && piece[0] === this.engine.turn;

    if (this.selectedSquare === null) {
      // First click: select my piece
      if (myTurn) {
        this.selectedSquare = squareIndex;
        this.legalDestinations = this.engine.getLegalMoves(squareIndex).map(m => m.to);
        this.render();
      }
    } else {
      // Second click: attempt move
      const from = this.selectedSquare;
      const to = squareIndex;
      
      if (this.legalDestinations.includes(to)) {
        // Legal move triggered
        this.clearHighlights();
        this.onMoveAttempt(from, to);
      } else if (myTurn) {
        // Change selection instead
        this.selectedSquare = squareIndex;
        this.legalDestinations = this.engine.getLegalMoves(squareIndex).map(m => m.to);
        this.render();
      } else {
        // Cancel selection
        this.clearHighlights();
        this.render();
      }
    }
  }

  clearHighlights() {
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.dragStartSquare = null;
  }

  // ==========================================================================
  // DRAG & DROP INTERACTION HANDLERS
  // ==========================================================================

  handleDragStart(e, squareIndex, pieceEl) {
    if (window.isReviewMode) return;
    const piece = this.engine.board[squareIndex];
    
    // Only allow drag if it's the player's piece and their turn
    if (!piece || piece[0] !== this.engine.turn) return;

    this.activeDragPiece = pieceEl;
    this.dragStartSquare = squareIndex;
    
    // Add visual states
    pieceEl.classList.add('dragging');
    this.selectedSquare = squareIndex;
    this.legalDestinations = this.engine.getLegalMoves(squareIndex).map(m => m.to);
    this.render();

    this.positionDragPiece(e);
  }

  handleDragMove(e) {
    if (!this.activeDragPiece) return;
    
    // Prevent mobile rubber banding scroll while dragging
    if (e.cancelable) {
      e.preventDefault();
    }
    
    this.positionDragPiece(e);
  }

  positionDragPiece(e) {
    if (!this.activeDragPiece) return;

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Centering offsets
    const radius = this.activeDragPiece.offsetWidth / 2;
    this.activeDragPiece.style.position = 'fixed';
    this.activeDragPiece.style.left = `${clientX - radius}px`;
    this.activeDragPiece.style.top = `${clientY - radius}px`;
  }

  handleDragEnd(e) {
    if (!this.activeDragPiece) return;

    const dragPiece = this.activeDragPiece;
    const fromSquare = this.dragStartSquare;
    this.activeDragPiece = null;
    
    // Reset styles
    dragPiece.classList.remove('dragging');
    dragPiece.style.position = '';
    dragPiece.style.left = '';
    dragPiece.style.top = '';

    // Find destination square element from drop coordinate
    let clientX, clientY;
    if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Detect target element
    const hitElement = document.elementFromPoint(clientX, clientY);
    const targetSquareEl = hitElement ? hitElement.closest('.square') : null;
    
    if (targetSquareEl) {
      const toSquare = parseInt(targetSquareEl.dataset.square, 10);
      if (this.legalDestinations.includes(toSquare)) {
        this.clearHighlights();
        this.onMoveAttempt(fromSquare, toSquare);
        return;
      } else if (toSquare === fromSquare) {
        // Keep selection on click
        return;
      }
    }

    // Reset board if dropped illegally
    this.clearHighlights();
    this.render();
  }

  // ==========================================================================
  // OUTLINE VECTOR CHESS PIECE SVG DATA
  // ==========================================================================
  getPieceSVGs() {
    return {
      'bb': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-bishop" class="black bishop" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zm6-4c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" fill="#000" stroke-linecap="butt"/><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>',
      'bk': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-king" class="black king" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#000"/><path d="M20 8h5" stroke-linejoin="miter"/><path d="M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>',
      'bn': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-knight" class="black knight" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#000000; stroke:#000000;"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#000000; stroke:#000000;"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#ececec; stroke:#ececec;"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#ececec; stroke:#ececec;"/><path d="M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z " style="fill:#ececec; stroke:none;"/></g></svg>',
      'bp': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-pawn" class="black pawn"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></g></svg>',
      'bq': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-queen" class="black queen" fill="#000" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#000" stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0" fill="none" stroke="#fff"/></g></svg>',
      'br': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="black-rook" class="black rook" fill="#000" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/></g></svg>',
      'wb': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-bishop" class="white bishop" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>',
      'wk': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-king" class="white king" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>',
      'wn': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-knight" class="white knight" fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#ffffff; stroke:#000000;"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#ffffff; stroke:#000000;"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#000000; stroke:#000000;"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#000000; stroke:#000000;"/></g></svg>',
      'wp': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-pawn" class="white pawn"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></g></svg>',
      'wq': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-queen" class="white queen" fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g></svg>',
      'wr': '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g id="white-rook" class="white rook" fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>',
    };
  }
}

// Make globally accessible
window.ChessBoard = ChessBoard;
