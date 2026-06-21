/**
 * ChatManager - Controls the P2P chat box interface, appends message bubbles,
 * handles message badges, and manages disabling input controls.
 */
class ChatManager {
  constructor(formId, inputId, containerId, badgeId) {
    this.form = document.getElementById(formId);
    this.input = document.getElementById(inputId);
    this.container = document.getElementById(containerId);
    this.badge = document.getElementById(badgeId);
    
    this.unreadCount = 0;
    this.activeTab = 'board'; // Triggers notification if not active
  }

  /**
   * Resets the chat interface.
   */
  clear() {
    this.container.innerHTML = `
      <div class="chat-notice">
        <i class="fa-solid fa-lock"></i> All messages travel directly between devices using WebRTC. No data is stored.
      </div>
    `;
    this.unreadCount = 0;
    this.updateBadge();
    this.disable();
  }

  enable() {
    if (this.input) this.input.removeAttribute('disabled');
    const sendBtn = this.form ? this.form.querySelector('button') : null;
    if (sendBtn) sendBtn.removeAttribute('disabled');
  }

  disable() {
    if (this.input) this.input.setAttribute('disabled', 'true');
    const sendBtn = this.form ? this.form.querySelector('button') : null;
    if (sendBtn) sendBtn.setAttribute('disabled', 'true');
  }

  setActiveTab(tab) {
    this.activeTab = tab;
    if (tab === 'chat') {
      this.unreadCount = 0;
      this.updateBadge();
    }
  }

  /**
   * Renders a message bubble in the container.
   */
  appendMessage(sender, text, timestamp, isLocal) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isLocal ? 'local' : 'opponent'}`;

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    bubble.appendChild(textSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-meta';
    
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    timeSpan.textContent = `${hours}:${mins}`;
    
    bubble.appendChild(timeSpan);
    this.container.appendChild(bubble);
    
    // Auto-scroll
    this.container.scrollTop = this.container.scrollHeight;

    // Show unread notification badge on mobile tabs if user is looking at board/stats
    if (!isLocal && this.activeTab !== 'chat') {
      this.unreadCount++;
      this.updateBadge();
    }
  }

  /**
   * Renders a system notice (e.g. "Draw Offered", "Opponent Reconnected").
   */
  appendSystemNotice(text) {
    const notice = document.createElement('div');
    notice.className = 'chat-bubble system';
    notice.textContent = text;
    this.container.appendChild(notice);
    this.container.scrollTop = this.container.scrollHeight;
  }

  updateBadge() {
    if (!this.badge) return;
    
    if (this.unreadCount > 0) {
      this.badge.textContent = this.unreadCount;
      this.badge.classList.remove('hidden');
    } else {
      this.badge.classList.add('hidden');
    }
  }
}

// Make globally accessible
window.ChatManager = ChatManager;
