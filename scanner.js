// @ts-nocheck
/**
 * scanner.js
 * Intercepts file uploads and drops, applies filename heuristics,
 * and runs local OCR (Tesseract.js) for image files.
 */

(function () {
  // Keep false in normal mode so only OCR-detected sensitive images are blocked.
  const STRICT_BLOCK_IMAGE_UPLOADS = false;

  // HTML escaping to prevent XSS when user-controlled strings are injected into innerHTML
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const SENSITIVE_FILENAME_PATTERNS = [
    /aadhaar/i,
    /aadhar/i,
    /voter/i,
    /epic/i,
    /election/i,
    /passport/i,
    /credential/i,
    /credentials/i,
    /secret/i,
    /key/i,
    /ssn/i,
    /pan/i,
    /token/i,
    /api/i,
    /aws/i,
    /id_card/i,
    /ifsc/i,
    /iban/i
  ];

  const IMAGE_EXTENSIONS = /\.(png|jpe?g|bmp|gif|webp|tiff?)$/i;
  const PDF_EXTENSIONS = /\.pdf$/i;
  const DOC_EXTENSIONS = /\.(txt|csv|docx|pptx)$/i;
  const OCR_DOC_PATTERNS = {
    aadhaarKeyword: /(aadhaar|aadhar|uidai)/i,
    aadhaarNumber: /\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b/,
    // Loose 12-digit grouping (covers synthetic or stylized samples that OCR may output)
    aadhaarLooseNumber: /\b(?:[0-9]{4}[\s-]*){3}\b/,
    voterKeyword: /(voter\s*id|electors\s+photo\s+identity\s+card|election\s*commission|epic)/i,
    voterId: /\b[A-Z]{3}\d{7}\b/,
    panKeyword: /\b(permanent\s+account\s+number|income\s+tax\s+department|pan\s+card)\b/i,
    panNumber: /[A-Z]{5}[\s-]*[0-9]{4}[\s-]*[A-Z]{1}(?:\b|(?=\s)|$)/,
    passportKeyword: /\bpassport\b/i,
    passportNumber: /\b[A-Z][1-9]\d\s?\d{4}[1-9]\b/,
    drivingLicenceKeyword: /\b(driving\s*licen[cs]e|dl\s*no|transport\s*department)\b/i,
    drivingLicenceNumber: /\b[A-Z]{2}[ -]?\d{2}[ -]?\d{4,12}\b/i,
    creditCardKeyword: /\b(credit\s*card|debit\s*card|visa|mastercard|rupay|valid\s*thru|card\s*holder|cvv)\b/i,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    usGreenCardKeyword: /\b(permanent\s+resident\s+card|uscis|green\s+card)\b/i,
    awsKey: /AKIA[0-9A-Z]{16}/,
    awsSecret: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/,
    gcpKey: /AIza[0-9A-Za-z\-_]{35}/,
    stripeKey: /s[kp]_live_[0-9a-zA-Z]{24}/,
    slackToken: /xox[baprs]-([0-9a-zA-Z]{10,48})?/,
    githubToken: /ghp_[0-9a-zA-Z]{36}/,
    privateKey: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP)? PRIVATE KEY-----/,
    ifscCode: /\b[A-Z]{4}0[A-Z0-9]{6}\b/,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/,
    iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/
  };

  const SENSITIVE_SCORE_THRESHOLD = 7;

  let deps = {
    scanAndRedact: null,
    showModernWarning: null,
    logViolation: null
  };

  let ocrWorker = null; // unused - OCR now handled by background worker
  let pageGuardInjected = false;
  let allowNextImagePasteOnce = false;
  let pendingPasteImage = null;
  let pendingPasteTarget = null;
  const bypassInputs = new WeakSet();
  const deniedInputs = new WeakSet();
  const pendingCredentialBlocks = new WeakMap(); // Map input elements to their blocked file info
  const pendingAllowedFilesByInput = new WeakMap(); // Original files while awaiting allow/deny decision
  let _allowSyntheticDropOnce = false;
  // Track recently-scanned files to prevent double-scanning from multiple event paths
  const _recentlyScanned = new Map(); // key: file name+size+lastModified → timestamp
  const _RESCAN_COOLDOWN_MS = 2000;

  function wasRecentlyScanned(file) {
    if (!file) return false;
    const key = `${file.name || ''}:${file.size || 0}:${file.lastModified || 0}`;
    const lastScan = _recentlyScanned.get(key);
    if (lastScan && (Date.now() - lastScan) < _RESCAN_COOLDOWN_MS) return true;
    _recentlyScanned.set(key, Date.now());
    // Prune old entries to prevent memory buildup
    if (_recentlyScanned.size > 50) {
      const now = Date.now();
      for (const [k, v] of _recentlyScanned) {
        if (now - v > _RESCAN_COOLDOWN_MS * 2) _recentlyScanned.delete(k);
      }
    }
    return false;
  }

  function toArray(fileList) {
    return fileList ? Array.from(fileList) : [];
  }

  function isImageFile(file) {
    const type = (file.type || "").toLowerCase();
    return type.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name || "");
  }

  function isPdfFile(file) {
    const type = (file.type || "").toLowerCase();
    return type === "application/pdf" || PDF_EXTENSIONS.test(file.name || "");
  }

  function isDocFile(file) {
    const name = (file.name || "").toLowerCase();
    return DOC_EXTENSIONS.test(name);
  }

  function filenameHit(fileName) {
    return SENSITIVE_FILENAME_PATTERNS.find((pattern) => pattern.test(fileName || "")) || null;
  }

  function makeAnalysis(matchesFound, redactedText) {
    return {
      isSafe: matchesFound.length === 0,
      redactedText: redactedText || "",
      matchesFound
    };
  }

  function uniqueTags(tags) {
    return Array.from(new Set((tags || []).filter(Boolean)));
  }

  function withSensitiveImageTag(analysis) {
    const nextMatches = uniqueTags(["sensitiveImage", ...(analysis && analysis.matchesFound ? analysis.matchesFound : [])]);
    return {
      isSafe: false,
      redactedText: (analysis && analysis.redactedText) || "[REDACTED_SENSITIVE_IMAGE]",
      matchesFound: nextMatches
    };
  }

  function clearFileInput(inputEl) {
    if (inputEl && inputEl.tagName === "INPUT" && inputEl.type === "file") {
      inputEl.value = "";
    }
  }

  // Block form submissions if they include denied file inputs
  function onFormSubmit(event) {
    try {
      const form = event.target;
      if (!(form && form.querySelector)) return;
      const fileInputs = Array.from(form.querySelectorAll("input[type='file']"));
      for (const inp of fileInputs) {
        if (deniedInputs.has(inp)) {
          // Prevent the submission and clear files
          blockEvent(event);
          clearFileInput(inp);
          deniedInputs.delete(inp);
          showBlockNotification(inp.name || 'file upload', 'Upload cancelled by PGAI Sentinel');
          // Stop after first denied input
          return;
        }
      }
    } catch (_err) {
      // ignore
    }
  }

  function notifyBlock(analysis, targetElement, reason) {


    if (typeof deps.logViolation === "function") {
      deps.logViolation(analysis);
    }

    if (typeof deps.showModernWarning === "function") {
      deps.showModernWarning(analysis, targetElement || document.body);
    }
  }

  function showBlockNotification(filename, reason) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: #fee2e2;
      border: 2px solid #dc2626;
      color: #991b1b;
      padding: 14px 18px;
      border-radius: 6px;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 1000001;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `
      <strong>🚫 Upload Blocked</strong><br/>
      <small style=\"margin-top: 4px; display: block; color: #b91c1c;\">${escapeHtml(reason)}</small>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 5000);

    // Add animation styles if not present
    if (!document.getElementById('sentinel-keyframes')) {
      const style = document.createElement('style');
      style.id = 'sentinel-keyframes';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(-400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(-400px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function showCredentialConfirmationPopup(filename, reason, inputElement) {


    // Remove any existing credential popup
    const existing = document.getElementById('sentinel-credential-popup');
    if (existing) existing.remove();

    // Create overlay (dark background)
    const overlay = document.createElement('div');
    overlay.id = 'sentinel-credential-popup';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647; /* ensure overlay appears above page UI */
      pointer-events: auto;
      animation: fadeIn 0.3s ease-out;
    `;

    // Create popup box
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      font-family: 'Segoe UI', Tahoma, sans-serif;
      animation: slideUp 0.3s ease-out;
    `;

    popup.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Sensitive File Detected</h2>
        <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          This file appears to contain sensitive information (${escapeHtml(filename)}).
        </p>
        <p style="color: #ef4444; margin: 0 0 24px 0; font-size: 13px; font-weight: 500; background: #fee2e2; padding: 8px 12px; border-radius: 6px;">
          ${escapeHtml(reason)}
        </p>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="sentinel-allow-btn" style="
            flex: 1;
            background: #10b981;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Allow</button>
          <button id="sentinel-deny-btn" style="
            flex: 1;
            background: #ef4444;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Don't Allow</button>
        </div>
      </div>
    `;

    overlay.appendChild(popup);
    // Use documentElement to maximize the chance the overlay is visible above site UI
    (document.documentElement || document.body).appendChild(overlay);


    // Add animations if not present
    if (!document.getElementById('sentinel-popup-animations')) {
      const style = document.createElement('style');
      style.id = 'sentinel-popup-animations';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #sentinel-allow-btn:hover { background: #059669 !important; }
        #sentinel-deny-btn:hover { background: #dc2626 !important; }
        #sentinel-allow-btn:active { transform: scale(0.98); }
        #sentinel-deny-btn:active { transform: scale(0.98); }
      `;
      document.head.appendChild(style);
    }

    // Button handlers
    const allowBtn = overlay.querySelector('#sentinel-allow-btn');
    const denyBtn = overlay.querySelector('#sentinel-deny-btn');
    if (!allowBtn || !denyBtn) {
      overlay.remove();
      return;
    }

    allowBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      overlay.remove();
      // Mark input as bypassed so next change event is allowed
      try {
        const approvedFiles = pendingAllowedFilesByInput.get(inputElement) || [];
        if (approvedFiles.length > 0) {
          const dt = new DataTransfer();
          for (const f of approvedFiles) {
            dt.items.add(f);
          }
          inputElement.files = dt.files;
        }

        bypassInputs.add(inputElement);
        // Remove any pending block record for this input
        try { pendingCredentialBlocks.delete(inputElement); } catch (_) {}
        try { pendingAllowedFilesByInput.delete(inputElement); } catch (_) {}

        // Dispatch input/change so the page can pick up the file selection
        try { inputElement.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        try { inputElement.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      } catch (_) {}

      showBlockNotification(filename, "✅ You allowed this sensitive credential. Please be careful!");
    }, false);

    denyBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      // Clear the file input and mark it denied so subsequent submits are blocked
      try {
        clearFileInput(inputElement);
        // Dispatch change events so page UI updates
        try { inputElement.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
        try { inputElement.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
      } catch (_e) { }

      deniedInputs.add(inputElement);
      pendingCredentialBlocks.delete(inputElement);
      try { pendingAllowedFilesByInput.delete(inputElement); } catch (_) {}
      overlay.remove();
      showBlockNotification(filename, "❌ Upload blocked at your request");
    }, false);


  }

  function showCredentialConfirmationPopupForDrop(filename, reason, dropEvent, imageFiles) {
    // Remove any existing credential popup
    const existing = document.getElementById('sentinel-credential-popup');
    if (existing) existing.remove();

    // Create overlay (dark background)
    const overlay = document.createElement('div');
    overlay.id = 'sentinel-credential-popup';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      pointer-events: auto;
      animation: fadeIn 0.3s ease-out;
    `;

    // Create popup box
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      font-family: 'Segoe UI', Tahoma, sans-serif;
      animation: slideUp 0.3s ease-out;
    `;

    popup.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Sensitive File Detected</h2>
        <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          This file appears to contain sensitive information (${escapeHtml(filename)}).
        </p>
        <p style="color: #ef4444; margin: 0 0 24px 0; font-size: 13px; font-weight: 500; background: #fee2e2; padding: 8px 12px; border-radius: 6px;">
          ${escapeHtml(reason)}
        </p>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="sentinel-allow-btn-drop" style="
            flex: 1;
            background: #10b981;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Allow</button>
          <button id="sentinel-deny-btn-drop" style="
            flex: 1;
            background: #ef4444;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Don't Allow</button>
        </div>
      </div>
    `;

    overlay.appendChild(popup);
    (document.documentElement || document.body).appendChild(overlay);

    // Button handlers
    const allowBtn = overlay.querySelector('#sentinel-allow-btn-drop');
    const denyBtn = overlay.querySelector('#sentinel-deny-btn-drop');
    if (!allowBtn || !denyBtn) {
      overlay.remove();
      return;
    }

    allowBtn.addEventListener('click', () => {

      overlay.remove();
      try {
        // If the drop targeted a nearby file input, inject files and dispatch change
        const inputEl = resolveDropInputTarget(dropEvent && dropEvent.target);
        if (inputEl instanceof HTMLInputElement && inputEl.type === 'file' && imageFiles && imageFiles.length) {
          try {
            const dt = new DataTransfer();
            for (const f of imageFiles) dt.items.add(f);
            inputEl.files = dt.files;
            bypassInputs.add(inputEl);
            try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
            try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
          } catch (_) {}
        } else if (dropEvent && dropEvent.target) {
          dispatchSyntheticDrop(dropEvent.target, imageFiles || []);
        }
      } catch (_) {}

      showBlockNotification(filename, "⚠️ You allowed a sensitive credential. Please be careful!");
    }, false);

    denyBtn.addEventListener('click', () => {
      // For drops we simply notify; if an input was targeted, clear it
      try {
        // If a file input is present nearby, clear and mark denied
        const inputEl = resolveDropInputTarget(dropEvent && dropEvent.target);
        if (inputEl) {
          clearFileInput(inputEl);
          deniedInputs.add(inputEl);
        }
      } catch (_e) { }
      overlay.remove();
      showBlockNotification(filename, "Drop blocked - sensitive content");
    }, false);
  }

  function showCredentialConfirmationPopupForPaste(filename, reason) {
    const existing = document.getElementById('sentinel-credential-popup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sentinel-credential-popup';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      pointer-events: auto;
      animation: fadeIn 0.3s ease-out;
    `;

    const popup = document.createElement('div');
    popup.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      font-family: 'Segoe UI', Tahoma, sans-serif;
      animation: slideUp 0.3s ease-out;
    `;

    popup.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Sensitive Image Detected</h2>
        <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
          This image appears to contain sensitive information (${escapeHtml(filename)}).
        </p>
        <p style="color: #ef4444; margin: 0 0 24px 0; font-size: 13px; font-weight: 500; background: #fee2e2; padding: 8px 12px; border-radius: 6px;">
          ${escapeHtml(reason)}
        </p>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="sentinel-allow-btn-paste" style="
            flex: 1;
            background: #10b981;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Paste Anyway</button>
          <button id="sentinel-deny-btn-paste" style="
            flex: 1;
            background: #ef4444;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s ease;
          ">Don't Allow</button>
        </div>
      </div>
    `;

    overlay.appendChild(popup);
    (document.documentElement || document.body).appendChild(overlay);

    const allowBtn = overlay.querySelector('#sentinel-allow-btn-paste');
    const denyBtn = overlay.querySelector('#sentinel-deny-btn-paste');
    if (!allowBtn || !denyBtn) {
      overlay.remove();
      return;
    }

    allowBtn.addEventListener('click', () => {
      allowNextImagePasteOnce = true;
      overlay.remove();

      // Prefer direct upload injection first to avoid synthetic paste loops.
      let handled = attemptPasteImageUpload();

      // Fallback: replay a single synthetic paste event and skip scanner once.
      if (!handled && pendingPasteTarget && pendingPasteImage) {
        try {
          const dt = new DataTransfer();
          dt.items.add(pendingPasteImage);
          const pasteEvent = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true });
          Object.defineProperty(pasteEvent, "clipboardData", { get: () => dt });
          pendingPasteTarget.dispatchEvent(pasteEvent);
          handled = true;
          pendingPasteImage = null;
          pendingPasteTarget = null;
        } catch (_) {
          handled = false;
        }
      }

      if (handled) {
        showBlockNotification(filename, "Image pasted after your approval.");
      } else {
        allowNextImagePasteOnce = false;
        showBlockNotification(filename, "Approval saved. Try manual upload.");
      }
    }, false);

    denyBtn.addEventListener('click', () => {
      // Clear pending pasted image to prevent later uploads
      pendingPasteImage = null;
      pendingPasteTarget = null;
      allowNextImagePasteOnce = false;
      overlay.remove();
      showBlockNotification(filename, "Paste blocked - sensitive content");
    }, false);
  }

  function attemptPasteImageUpload() {
    if (!pendingPasteImage) {
      return false;
    }
    // Prefer a nearby file input related to the original paste target
    let input = resolveDropInputTarget(pendingPasteTarget) || document.querySelector("input[type='file']");

    if (input instanceof HTMLInputElement && input.type === 'file') {
      try {
        const dt = new DataTransfer();
        dt.items.add(pendingPasteImage);
        input.files = dt.files;
        // Avoid re-scanning the approved file when we dispatch change.
        bypassInputs.add(input);
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pendingPasteImage = null;
        pendingPasteTarget = null;
        allowNextImagePasteOnce = false;
        return true;
      } catch (_err) {
        // fallthrough to try contentEditable insertion
      }
    }

    // If no file input is available, try to insert the pasted image directly into
    // the original target (contentEditable or text input). This uses a FileReader
    // to convert the image to a data URL and inserts an <img> or the data URL text.
    if (pendingPasteTarget) {
      try {
        const tgt = pendingPasteTarget;
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const dataUrl = e && e.target ? e.target.result : null;
            if (typeof dataUrl !== 'string' || !dataUrl) return;

            // Insert into contentEditable targets
            if (tgt.isContentEditable || (tgt.nodeType === 1 && tgt.getAttribute && tgt.getAttribute('contenteditable') === 'true')) {
              const img = document.createElement('img');
              img.src = dataUrl;
              img.alt = pendingPasteImage.name || 'pasted-image';
              const sel = window.getSelection();
              if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(img);
                range.setStartAfter(img);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } else {
                try { tgt.appendChild(img); } catch (_) { }
              }
              try { tgt.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
              try { tgt.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { }
              pendingPasteImage = null;
              pendingPasteTarget = null;
              allowNextImagePasteOnce = false;
              return;
            }

            // Insert into textarea/input as data URL text
            if (tgt.tagName === 'TEXTAREA' || (tgt.tagName === 'INPUT' && (tgt.type === 'text' || tgt.type === 'search'))) {
              const insertText = dataUrl;
              const start = typeof tgt.selectionStart === 'number' ? tgt.selectionStart : 0;
              const end = typeof tgt.selectionEnd === 'number' ? tgt.selectionEnd : 0;
              const val = tgt.value || '';
              tgt.value = val.slice(0, start) + insertText + val.slice(end);
              const pos = start + insertText.length;
              try { tgt.setSelectionRange(pos, pos); } catch (_) { }
              try { tgt.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
              pendingPasteImage = null;
              pendingPasteTarget = null;
              allowNextImagePasteOnce = false;
              return;
            }
          } catch (_e) {
            // ignore insert errors
          }
        };
        reader.onerror = function () {
          // nothing
        };
        reader.readAsDataURL(pendingPasteImage);
        // Indicate we started an async insertion attempt
        return true;
      } catch (_e) {
        return false;
      }
    }

    return false;
  }

  // Remove any images that may have already been inserted into a contentEditable
  // target by page-level paste handlers. This helps ensure blocked images don't
  // briefly appear before the credential confirmation popup is shown.
  function removePotentialInsertedImages(target, file) {
    try {
      if (!target) return 0;
      const candidates = [];

      if (target.isContentEditable || (target.nodeType === 1 && target.getAttribute && target.getAttribute('contenteditable') === 'true')) {
        try { candidates.push(...Array.from(target.querySelectorAll('img'))); } catch (_) { }
        if (target.tagName === 'IMG') candidates.push(target);
      } else {
        try { candidates.push(...Array.from(document.querySelectorAll('img'))); } catch (_) { }
      }

      let removed = 0;
      for (const img of candidates) {
        try {
          const src = (img.src || '');
          const alt = (img.alt || '').toLowerCase();
          const fname = (file && file.name || '').toLowerCase();

          if (src.indexOf('data:image/') === 0 || (fname && src.indexOf(fname) !== -1) || (fname && alt.indexOf(fname) !== -1)) {
            img.remove();
            removed += 1;
          }
        } catch (_) { }
      }
      return removed;
    } catch (_) {
      return 0;
    }
  }

  function makeReasonAnalysis(reasonTag, details) {
    const detailText = details ? ` (${details})` : "";
    return makeAnalysis(["sensitiveImage", reasonTag], `[REDACTED_${reasonTag.toUpperCase()}]${detailText}`);
  }

  function findPotentialCardNumbers(text) {
    const matches = (text.match(/\b(?:\d[ -]?){13,19}\b/g) || []);
    return matches
      .map((x) => x.replace(/[^\d]/g, ""))
      .filter((x) => x.length >= 13 && x.length <= 19);
  }

  function luhnValid(numberString) {
    let sum = 0;
    let shouldDouble = false;

    for (let i = numberString.length - 1; i >= 0; i -= 1) {
      let digit = Number(numberString[i]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  function evaluateSensitiveRisk(text) {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    const hits = [];
    let score = 0;

    if (OCR_DOC_PATTERNS.aadhaarKeyword.test(normalized)) {
      score += 4;
      hits.push("aadhaarDoc");
    }
    if (OCR_DOC_PATTERNS.aadhaarNumber.test(normalized)) {
      score += 6;
      hits.push("aadhaarNumber");
    }

    // Treat a loose 12-digit grouped number as a strong Aadhaar-like signal
    if (OCR_DOC_PATTERNS.aadhaarLooseNumber.test(normalized)) {
      score += 7; // strong signal to trigger blocking for pasted ID cards
      hits.push("aadhaarLooseNumber");
    }

    if (OCR_DOC_PATTERNS.voterKeyword.test(normalized)) {
      score += 4;
      hits.push("voterIdDoc");
    }
    if (OCR_DOC_PATTERNS.voterId.test(normalized)) {
      score += 5;
      hits.push("voterIdNumber");
    }

    if (OCR_DOC_PATTERNS.panKeyword.test(normalized)) {
      score += 4;
      hits.push("panDoc");
    }
    if (OCR_DOC_PATTERNS.panNumber.test(normalized)) {
      score += 7; // Increased from 6 to 7 - PAN number is strong signal of sensitive doc
      hits.push("panNumber");
    }

    if (OCR_DOC_PATTERNS.passportKeyword.test(normalized)) {
      score += 4;
      hits.push("passportDoc");
    }
    if (OCR_DOC_PATTERNS.passportNumber.test(normalized)) {
      score += 6;
      hits.push("passportNumber");
    }

    if (OCR_DOC_PATTERNS.drivingLicenceKeyword.test(normalized)) {
      score += 4;
      hits.push("drivingLicenceDoc");
    }
    if (OCR_DOC_PATTERNS.drivingLicenceNumber.test(normalized)) {
      score += 3;
      hits.push("drivingLicenceNumber");
    }

    if (OCR_DOC_PATTERNS.usGreenCardKeyword.test(normalized)) {
      score += 6;
      hits.push("greenCardDoc");
    }

    if (OCR_DOC_PATTERNS.creditCardKeyword.test(normalized)) {
      score += 3;
      hits.push("cardKeyword");
    }

    const cardNumbers = findPotentialCardNumbers(normalized);
    if (cardNumbers.some((n) => luhnValid(n))) {
      score += 7;
      hits.push("creditCardNumber");
    }

    if (OCR_DOC_PATTERNS.email.test(normalized)) {
      score += 3;
      hits.push("email");
    }

    if (OCR_DOC_PATTERNS.awsKey.test(normalized) || OCR_DOC_PATTERNS.awsSecret.test(normalized)) {
      score += 7;
      hits.push("awsKey");
    }
    if (OCR_DOC_PATTERNS.gcpKey.test(normalized)) { score += 7; hits.push("gcpKey"); }
    if (OCR_DOC_PATTERNS.stripeKey.test(normalized)) { score += 7; hits.push("stripeKey"); }
    if (OCR_DOC_PATTERNS.slackToken.test(normalized)) { score += 7; hits.push("slackToken"); }
    if (OCR_DOC_PATTERNS.githubToken.test(normalized)) { score += 7; hits.push("githubToken"); }
    if (OCR_DOC_PATTERNS.privateKey.test(normalized)) { score += 7; hits.push("privateKey"); }
    if (OCR_DOC_PATTERNS.ifscCode.test(normalized)) { score += 4; hits.push("ifscCode"); }
    if (OCR_DOC_PATTERNS.ssn.test(normalized)) { score += 7; hits.push("ssn"); }
    if (OCR_DOC_PATTERNS.iban.test(normalized)) { score += 5; hits.push("iban"); }

    return {
      score,
      matchesFound: uniqueTags(hits),
      isSensitive: score >= SENSITIVE_SCORE_THRESHOLD
    };
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function dataUrlFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  }

  // ── OCR via background service worker ─────────────────────────────────────
  // Content-script context is blocked by page CSP from loading Tesseract.
  // The background SW runs in the extension origin (no page CSP) and handles OCR.

  async function extractTextLocallyFromDataUrl(imageData) {
    let processedData = imageData;
    try { processedData = await preprocessImageForOCR(imageData); } catch (_) { }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: 'PGAI_OCR_REQUEST', dataUrl: processedData },
            (response) => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.warn('PGAI OCR: background error (attempt', attempt + 1, '):', err.message);
                resolve(null);
                return;
              }
              resolve(response || {});
            }
          );
        } catch (e) {
          console.warn('PGAI OCR: sendMessage threw (attempt', attempt + 1, '):', e);
          resolve(null);
        }
      });

      if (result !== null) {
        if (result && result.success) {
          console.log('PGAI OCR: text length', result.text ? result.text.length : 0);
          return result.text || '';
        }
        console.warn('PGAI OCR: non-success response', result);
        return '';
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return '';
  }


  async function extractTextLocallyFromImage(file) {
    try {
      const imageData = await dataUrlFromFile(file);
      return extractTextLocallyFromDataUrl(imageData);
    } catch (_err) {
      return '';
    }
  }


  async function extractTextFromPdfViaBackground(buffer) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'PGAI_PDF_REQUEST', buffer },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              console.warn('PGAI PDF: background error:', err.message);
              resolve('');
              return;
            }
            if (response && response.success) {
              resolve(response.text || '');
              return;
            }
            resolve('');
          }
        );
      } catch (_e) {
        resolve('');
      }
    });
  }

  async function extractTextFromPdfFile(file) {
    try {
      const buffer = await file.arrayBuffer();
      return await extractTextFromPdfViaBackground(buffer);
    } catch (_err) {
      return "";
    }
  }

  function preprocessImageForOCR(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size - upscale for better OCR
        canvas.width = img.width * 1.5;
        canvas.height = img.height * 1.5;

        // Draw image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Enhance contrast for better OCR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Simple contrast enhancement
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];
          const gray = (r + g + b) / 3;
          const contrast = 1.5;

          data[i] = Math.min(255, gray + (r - gray) * contrast);
          data[i + 1] = Math.min(255, gray + (g - gray) * contrast);
          data[i + 2] = Math.min(255, gray + (b - gray) * contrast);
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => {

        resolve(dataUrl); // Fallback to original
      };

      img.src = dataUrl;
    });
  }

  // NOTE: extractHighConfidenceText was removed — the offscreen OCR worker returns
  // plain text only (not word-level data with confidence scores). If word-level
  // filtering is needed in the future, it should be implemented in offscreen.js.

  async function analyzeFiles(files, options) {
    const opts = options || {};
    // FIRST: Check filename patterns (always works, no OCR needed)
    for (const file of files) {
      const matchedPattern = filenameHit(file.name || "");
      if (matchedPattern) {

        return {
          blocked: true,
          reason: `filename heuristic: ${matchedPattern}`,
          analysis: makeReasonAnalysis("filenameHeuristic", file.name || "")
        };
      }
    }

    // SECOND: Try OCR if filename check passes
    for (const file of files) {
      if (!isImageFile(file)) {
        continue;
      }

      if (STRICT_BLOCK_IMAGE_UPLOADS) {
        return {
          blocked: true,
          reason: `strict image upload policy: ${file.name}`,
          analysis: makeReasonAnalysis("imageUploadBlocked", file.name || "")
        };
      }

      try {
        const text = await extractTextLocallyFromImage(file);

        // Always log so we can see OCR output in extension DevTools
        console.log('PGAI OCR |', file.name || 'clipboard-image',
          '| chars:', text ? text.length : 0,
          '| preview:', text ? text.replace(/\n/g, ' ').slice(0, 150) : '(empty)');

        if (text && text.trim().length > 0) {
          // Pure pattern-based risk scoring — NO ML, NO scanAndRedact
          const risk = evaluateSensitiveRisk(text);
          console.log('PGAI risk |', { score: risk.score, sensitive: risk.isSensitive, hits: risk.matchesFound });

          if (risk.isSensitive) {
            return {
              blocked: true,
              reason: `Sensitive document detected (score ${risk.score}): ${risk.matchesFound.join(', ')}`,
              analysis: withSensitiveImageTag(makeAnalysis(risk.matchesFound, text))
            };
          }
          // Not sensitive — fall through to allow
        }
        // OCR returned no/empty text (plain photo, logo, etc.) → allow
      } catch (error) {
        const ocrError = error && error.message ? error.message : String(error);
        console.warn('PGAI OCR error for', file.name, ':', ocrError);
        // Fail open — don't block if OCR errors out
      }

    }


    // THIRD: Try PDF text extraction
    for (const file of files) {
      if (!isPdfFile(file)) {
        continue;
      }

      showScanningToast();
      const text = await extractTextFromPdfFile(file);
      hideScanningToast();
      
      if (text && text.trim().length > 0) {
        const baseAnalysis = typeof deps.scanAndRedact === "function"
          ? deps.scanAndRedact(text)
          : makeAnalysis([], text);
        const risk = evaluateSensitiveRisk(text);

        const combined = {
          isSafe: false,
          redactedText: (baseAnalysis && baseAnalysis.redactedText) || "[REDACTED_PDF]",
          matchesFound: uniqueTags([
            ...((baseAnalysis && baseAnalysis.matchesFound) || []),
            ...(risk.matchesFound || [])
          ])
        };

        if ((baseAnalysis && !baseAnalysis.isSafe) || risk.isSensitive) {
          return {
            blocked: true,
            reason: `pdf sensitive scan hit in file: ${file.name}`,
            analysis: combined
          };
        }
      } else if (opts.failClosed) {
        return {
          blocked: true,
          reason: `pdf blocked: unable to extract text (${file.name})`,
          analysis: makeReasonAnalysis("pdfUnscannable", file.name || "document.pdf")
        };
      }
    }

    // FOURTH: Try Docs/Text extraction
    for (const file of files) {
      if (!isDocFile(file)) {
        continue;
      }

      showScanningToast();
      const text = await extractTextFromDocFile(file);
      hideScanningToast();
      
      if (text && text.trim().length > 0) {
        const baseAnalysis = typeof deps.scanAndRedact === "function"
          ? deps.scanAndRedact(text)
          : makeAnalysis([], text);
        const risk = evaluateSensitiveRisk(text);

        const combined = {
          isSafe: false,
          redactedText: (baseAnalysis && baseAnalysis.redactedText) || "[REDACTED_DOC]",
          matchesFound: uniqueTags([
            ...((baseAnalysis && baseAnalysis.matchesFound) || []),
            ...(risk.matchesFound || [])
          ])
        };

        if ((baseAnalysis && !baseAnalysis.isSafe) || risk.isSensitive) {
          return {
            blocked: true,
            reason: `document sensitive scan hit in file: ${file.name}`,
            analysis: combined
          };
        }
      }
    }

    return { blocked: false };
  }

  let globalToastElement = null;

  function showScanningToast() {
    if (globalToastElement) return;
    globalToastElement = document.createElement('div');
    globalToastElement.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:10px;font-family:system-ui,sans-serif;font-size:14px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.25);';
    globalToastElement.textContent = '🔍 File is scanning to check if it has any sensitive data or not...';
    document.body.appendChild(globalToastElement);
  }

  function hideScanningToast() {
    if (globalToastElement && globalToastElement.parentNode) {
      globalToastElement.remove();
      globalToastElement = null;
    }
  }

  async function extractTextFromDocFile(file) {
      const name = (file && file.name ? file.name : '').toLowerCase();
      try {
          if (name.endsWith('.txt') || name.endsWith('.csv')) {
              return await file.text();
          }
          if (name.endsWith('.docx') || name.endsWith('.pptx')) {
              if (!window.JSZip) {
                  console.error("PGAI: window.JSZip not found!");
                  return '';
              }
              const zip = await window.JSZip.loadAsync(file);
              if (name.endsWith('.docx')) {
                  const docXml = zip.file('word/document.xml');
                  if (!docXml) return '';
                  const xmlText = await docXml.async('text');
                  return xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              } else if (name.endsWith('.pptx')) {
                  let slidesText = [];
                  const slideFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/slides/slide') && k.endsWith('.xml'));
                  for (const slidePath of slideFiles) {
                      const xmlText = await zip.file(slidePath).async('text');
                      slidesText.push(xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
                  }
                  return slidesText.join(' ');
              }
          }
      } catch (e) {
          console.warn('PGAI Doc Extract Error:', e);
      }
      return '';
  }

  function filterImageFiles(files) {
    return toArray(files).filter((file) => isImageFile(file));
  }

  function filterPdfFiles(files) {
    return toArray(files).filter((file) => isPdfFile(file));
  }

  function filterDocFiles(files) {
    return toArray(files).filter((file) => isDocFile(file));
  }

  function injectPageGuard() {
    if (pageGuardInjected) {
      return;
    }

    pageGuardInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-guard.js");
    script.async = false;
    script.onload = () => {
      script.remove();
    };
    script.onerror = () => {

    };
    (document.head || document.documentElement).appendChild(script);
  }

  function resolveDropInputTarget(eventTarget) {
    if (!eventTarget || !(eventTarget instanceof Element)) {
      return null;
    }

    if (eventTarget.matches("input[type='file']")) {
      return eventTarget;
    }

    const nestedInput = eventTarget.querySelector("input[type='file']");
    if (nestedInput) {
      return nestedInput;
    }

    return eventTarget.closest("label, form, div")?.querySelector("input[type='file']") || null;
  }

  function dispatchSyntheticDrop(target, files) {
    try {
      if (!target || !files || files.length === 0) {
        return false;
      }

      const dt = new DataTransfer();
      for (const f of files) {
        dt.items.add(f);
      }

      _allowSyntheticDropOnce = true;
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: dt
      });

      try {
        if (!dropEvent.dataTransfer) {
          Object.defineProperty(dropEvent, 'dataTransfer', { get: () => dt });
        }
      } catch (_) { }

      target.dispatchEvent(dropEvent);
      return true;
    } catch (_) {
      return false;
    } finally {
      setTimeout(() => {
        _allowSyntheticDropOnce = false;
      }, 0);
    }
  }

  async function handleFileInputChange(event) {
    try {
      const inputEl = event.target;
      if (!(inputEl instanceof HTMLInputElement) || inputEl.type !== "file") {
        return;
      }

      if (bypassInputs.has(inputEl)) {
        bypassInputs.delete(inputEl);

        return;
      }

      const files = toArray(inputEl.files);


      if (files.length === 0) {

        return;
      }

      // Analyze files for sensitive content

      const imageFiles = filterImageFiles(files);
      const pdfFiles = filterPdfFiles(files);
      const docFiles = filterDocFiles(files);
      const filesToScan = [...imageFiles, ...pdfFiles, ...docFiles];

      if (filesToScan.length === 0) {

        return; // Not an image, pdf, or doc, allow through
      }

      // Block page handlers immediately and clear input while async scan runs.
      blockEvent(event);
      pendingAllowedFilesByInput.set(inputEl, files);
      clearFileInput(inputEl);
      try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
      try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { }

      showScanningToast();
      const result = await analyzeFiles(filesToScan, { failClosed: false });
      hideScanningToast();


      if (result.blocked) {

        const blockedFile = filesToScan[0];
        pendingCredentialBlocks.set(inputEl, { analysis: result.analysis, reason: result.reason, file: blockedFile });

        showCredentialConfirmationPopup(blockedFile.name, result.reason, inputEl);
      } else {
        const approvedFiles = pendingAllowedFilesByInput.get(inputEl) || files;
        const dt = new DataTransfer();
        for (const f of approvedFiles) {
          dt.items.add(f);
        }
        inputEl.files = dt.files;
        pendingAllowedFilesByInput.delete(inputEl);
        bypassInputs.add(inputEl);
        try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
        try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { }
      }
    } catch (error) {
      try {
        const inputEl = event && event.target;
        if (inputEl instanceof HTMLInputElement && inputEl.type === 'file' && pendingAllowedFilesByInput.has(inputEl)) {
          const fallbackFiles = pendingAllowedFilesByInput.get(inputEl) || [];
          if (fallbackFiles.length > 0) {
            const dt = new DataTransfer();
            for (const f of fallbackFiles) {
              dt.items.add(f);
            }
            inputEl.files = dt.files;
            bypassInputs.add(inputEl);
            try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
            try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { }
          }
          pendingAllowedFilesByInput.delete(inputEl);
        }
      } catch (_) { }
    } finally {
      hideScanningToast();
    }
  }

  async function handleDrop(event) {
    if (_allowSyntheticDropOnce) {
      return;
    }

    const files = toArray(event.dataTransfer && event.dataTransfer.files);
    if (files.length === 0) {
      return;
    }

    // Analyze dropped files for sensitive content
    const imageFiles = filterImageFiles(files);
    const pdfFiles = filterPdfFiles(files);
    const docFiles = filterDocFiles(files);
    const filesToScan = [...imageFiles, ...pdfFiles, ...docFiles];
    if (filesToScan.length === 0) {
      return; // Not images, pdfs, or docs, allow through
    }

    // Prevent double-scanning if this file was already scanned recently
    if (filesToScan.every(f => wasRecentlyScanned(f))) return;

    blockEvent(event);
    showScanningToast();
    // Allow drops to be fail-open if OCR/PDF can't be executed in this site context
    const result = await analyzeFiles(filesToScan, { failClosed: false });
    hideScanningToast();
    if (result.blocked) {
      const blockedFile = filesToScan[0];
      showCredentialConfirmationPopupForDrop(blockedFile.name, result.reason, event, filesToScan);
    } else {
      dispatchSyntheticDrop(event.target, files);
    }
  }

  // prevent re-entrant handlePaste calls caused by synthetic re-paste events
  let _pasteBeingHandled = false;

  async function handlePaste(event) {
    if (_pasteBeingHandled) return; // Let synthetic/re-paste events through unblocked

    // User approved the previous sensitive paste: allow exactly one paste event through untouched.
    if (allowNextImagePasteOnce) {
      allowNextImagePasteOnce = false;
      return;
    }

    const clipboard = event.clipboardData;
    if (!clipboard || !clipboard.items) return;

    const pastedFiles = [];
    for (const item of Array.from(clipboard.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }

    const imageFiles = filterImageFiles(pastedFiles);
    const pdfFiles = filterPdfFiles(pastedFiles);
    const docFiles = filterDocFiles(pastedFiles);
    const filesToScan = [...imageFiles, ...pdfFiles, ...docFiles];

    if (filesToScan.length === 0) return;

    // Prevent double-scanning if this file was already scanned recently
    if (filesToScan.every(f => wasRecentlyScanned(f))) return;

    // Block native paste synchronously
    blockEvent(event);
    _pasteBeingHandled = true;
    const tgt = event.target;

    let plainText = '';
    let htmlText  = '';
    try { plainText = clipboard.getData('text/plain'); } catch (_) {}
    try { htmlText  = clipboard.getData('text/html');  } catch (_) {}

    showScanningToast();

    try {
      const result = await analyzeFiles(filesToScan, { failClosed: false });
      hideScanningToast();

      if (result.blocked) {
        // 🚨 Sensitive — show block popup
        pendingPasteImage  = filesToScan[0];
        pendingPasteTarget = tgt;
        try {
          // Remove any images that the page may have inserted already
          try { removePotentialInsertedImages(tgt, filesToScan[0]); } catch (_) { }
        } catch (_) { }

        showCredentialConfirmationPopupForPaste(
          filesToScan[0].name || 'clipboard-file',
          result.reason
        );
        return;
      }

      // ✅ Safe — paste it once
      // Strategy 1: file input injection (works on ChatGPT, Gemini)
      pendingPasteImage  = filesToScan[0];
      pendingPasteTarget = tgt;
      const uploaded = attemptPasteImageUpload();
      if (uploaded) return;

      // Strategy 2: synthetic ClipboardEvent (other sites)
      // _pasteBeingHandled stays true so the synthetic event is let through
      try {
        const dt = new DataTransfer();
        if (plainText) dt.setData('text/plain', plainText);
        if (htmlText)  dt.setData('text/html',  htmlText);
        for (const f of pastedFiles) dt.items.add(f);
        const pasteEvt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true });
        Object.defineProperty(pasteEvt, 'clipboardData', { get: () => dt });
        tgt.dispatchEvent(pasteEvt);
      } catch (_) {}

    } finally {
      hideScanningToast();
      _pasteBeingHandled = false;
    }
  }

  function setupListeners() {
    injectPageGuard();



    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target && target.matches && target.matches("input[type='file']")) {

        handleFileInputChange(event);
      }
    }, true);

    // Intercept form submissions to cancel uploads for denied inputs
    document.addEventListener('submit', onFormSubmit, true);

    document.addEventListener("dragover", (event) => {
      if (event.dataTransfer && event.dataTransfer.types && event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
      }
    }, true);

    document.addEventListener("drop", (event) => {

      handleDrop(event);
    }, true);

    document.addEventListener("paste", (event) => {

      handlePaste(event);
    }, true);


  }

  function init(options) {
    deps.scanAndRedact = options && options.scanAndRedact;
    deps.showModernWarning = options && options.showModernWarning;
    deps.logViolation = options && options.logViolation;

    setupListeners();

  }

  window.SentinelScanner = {
    init,
    // Test helper: call testPopup() from console to see popup
    testPopup: function () {

      showCredentialConfirmationPopup("test_aadhaar_card.jpg", "OCR detected: Aadhaar number pattern found", document.querySelector("input[type='file']") || document.body);
    }
  };



})();
