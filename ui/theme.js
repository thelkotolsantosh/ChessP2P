/**
 * ThemeManager - Manages Dark and Light mode transitions, 
 * persisting preferences to localStorage.
 */
class ThemeManager {
  constructor(toggleButtonId) {
    this.toggleButton = document.getElementById(toggleButtonId);
    this.currentTheme = localStorage.getItem('p2pchess-theme') || 'dark';

    this.init();
  }

  init() {
    this.applyTheme(this.currentTheme);

    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => {
        const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(nextTheme);
      });
    }
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('p2pchess-theme', theme);

    if (theme === 'dark') {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
  }
}

// Make globally accessible
window.ThemeManager = ThemeManager;
