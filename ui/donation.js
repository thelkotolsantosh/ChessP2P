/**
 * DonationManager - Handles rendering dynamic UPI QR codes on canvas,
 * clipboard copies, and mobile payment app deep links.
 */
class DonationManager {
  constructor(canvasId, upiAddressId, copyButtonId, downloadButtonId, openAppButtonId) {
    this.canvas = document.getElementById(canvasId);
    this.upiAddressText = document.getElementById(upiAddressId);
    this.copyBtn = document.getElementById(copyButtonId);
    this.downloadBtn = document.getElementById(downloadButtonId);
    this.openAppBtn = document.getElementById(openAppButtonId);
    
    this.upiId = "8019542500@upi"; // Configurable UPI address
    this.payeeName = "THELKOTLOL SANTOSH";
    
    this.qriousLoaded = false;
    this.init();
  }

  init() {
    this.loadQRiousLibrary(() => {
      this.generateQRCode();
    });

    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => this.copyUPIToClipboard());
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadQRCodeImage());
    }
  }

  /**
   * Loads the QRious CDN library dynamically.
   */
  loadQRiousLibrary(callback) {
    if (window.QRious) {
      this.qriousLoaded = true;
      callback();
      return;
    }

    console.log("Loading QRious QR library dynamically...");
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js";
    script.integrity = "sha512-pUh3g2ILdtJOlhGgJD40f2cdG2K5S57W6n64FpLz8Bbp3DygXpG0N7NphSScW/Z1Y56v/b3L40F5K0B5X4L96Q==";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    
    script.onload = () => {
      this.qriousLoaded = true;
      console.log("QRious loaded successfully.");
      callback();
    };
    
    script.onerror = () => {
      console.error("Failed to load QRious library from CDN.");
    };

    document.head.appendChild(script);
  }

  /**
   * Generates standard UPI pay URI and renders QR code.
   * Format: upi://pay?pa=address&pn=name&cu=currency
   */
  generateQRCode() {
    if (!this.qriousLoaded || !this.canvas) return;

    const upiUri = `upi://pay?pa=${encodeURIComponent(this.upiId)}&pn=${encodeURIComponent(this.payeeName)}&cu=INR`;
    
    // Update local variables
    if (this.upiAddressText) {
      this.upiAddressText.textContent = this.upiId;
    }
    if (this.openAppBtn) {
      this.openAppBtn.setAttribute('href', upiUri);
    }

    // Render QR Code using QRious
    new QRious({
      element: this.canvas,
      value: upiUri,
      size: 220,
      background: 'white',
      foreground: 'black',
      level: 'H' // High error correction
    });
  }

  /**
   * Customizes developer payment credentials dynamically.
   */
  setUPIDetails(newUpiId, name) {
    this.upiId = newUpiId;
    if (name) this.payeeName = name;
    this.generateQRCode();
  }

  /**
   * Copies the UPI ID to the user's clipboard.
   */
  copyUPIToClipboard() {
    navigator.clipboard.writeText(this.upiId)
      .then(() => {
        const originalText = this.copyBtn.innerHTML;
        this.copyBtn.innerHTML = `<i class="fa-solid fa-check text-success"></i> Copied!`;
        this.copyBtn.classList.add('btn-primary');
        
        setTimeout(() => {
          this.copyBtn.innerHTML = originalText;
          this.copyBtn.classList.remove('btn-primary');
        }, 2000);
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
      });
  }

  /**
   * Converts the canvas image to a binary blob and downloads it.
   */
  downloadQRCodeImage() {
    const canvas = document.getElementById('upi-qr-canvas');
    const image = document.getElementById('upi-qr-image');
    
    if (image && !image.classList.contains('hidden')) {
      // Download the static PhonePe image
      const link = document.createElement('a');
      link.download = `p2pchess_donation_qr.png`;
      link.href = 'upi_qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (canvas) {
      // Download the dynamically generated canvas (room invite)
      const imageURI = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      const link = document.createElement('a');
      link.download = `p2pchess_invite_qr_${this.upiId}.png`;
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}

// Make globally accessible
window.DonationManager = DonationManager;
