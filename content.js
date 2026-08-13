// @ts-nocheck
/**
 * SentinelGate: content.js
 * Final Hackathon-Ready Version (Updated with Mouse Click Interception)
 */

// 1. Defined Sensitive Patterns (Regex) - Must be at the top
const SENSITIVE_PATTERNS = {
    creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
    phoneNumber: /\b\d{10}\b/g,
    aadhaarLoose: /\b\d{12}\b/g,
    panLoose: /[A-Z]{5}[\s-]*\d{4}[\s-]*[A-Z](?:\b|(?=\s)|$)/g,
    bankAccountLoose: /\b\d{9,18}\b/g,
    awsKey: /AKIA[0-9A-Z]{16}/g,
    awsSecret: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    gcpKey: /AIza[0-9A-Za-z\-_]{35}/g,
    stripeKey: /s[kp]_live_[0-9a-zA-Z]{24}/g,
    slackToken: /xox[baprs]-([0-9a-zA-Z]{10,48})?/g,
    githubToken: /ghp_[0-9a-zA-Z]{36}/g,
    privateKey: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP)? PRIVATE KEY-----/g,
    ifscCode: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    aadhaarNumber: /\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b/g,
    voterId: /\b[A-Z]{3}\d{7}\b/g,
    panNumber: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    passportNumber: /\b[A-Z][1-9]\d\s?\d{4}[1-9]\b/g,
    identityKeywords: /(aadhaar|aadhar|uidai|voter id|epic|election commission|passport)/gi,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    proprietaryMarkers: /(INTERNAL_ONLY|CONFIDENTIAL|PROPERTY_OF_ACME|DO_NOT_DISTRIBUTE)/gi,
    dbConnection: /(mongodb\+srv|postgres|mysql):\/\/[^\s]+/gi,
    highEntropySecret: /['"][a-zA-Z0-9]{32,128}['"]/g
};

function formatMatches(matchesFound) {
    const labels = {
        phoneNumber: 'possible mobile number',
        aadhaarLoose: 'possible Aadhaar number',
        aadhaarNumber: 'possible Aadhaar number',
        panLoose: 'possible PAN number',
        panNumber: 'possible PAN number',
        bankAccountLoose: 'possible bank account number',
        awsKey: 'AWS Access Key',
        awsSecret: 'AWS Secret Key',
        gcpKey: 'GCP API Key',
        stripeKey: 'Stripe API Key',
        slackToken: 'Slack Token',
        githubToken: 'GitHub Token',
        privateKey: 'Private Key',
        ifscCode: 'IFSC Code',
        ssn: 'SSN (Social Security Number)',
        iban: 'IBAN (International Bank Account Number)',
        sensitiveImage: 'Sensitive Image',
        filenameHeuristic: 'Sensitive Filename',
        imageDomDetection: 'Image DOM Detection',
        imageSrcDetection: 'Image Source Detection',
        creditCard: 'Credit Card Number',
        email: 'Email Address',
        identityKeywords: 'Identity Keywords',
        ipv4: 'IPv4 Address',
        proprietaryMarkers: 'Proprietary Marker',
        dbConnection: 'Database Connection String',
        highEntropySecret: 'High-Entropy Secret',
        passportNumber: 'Passport Number',
        voterId: 'Voter ID'
    };

    return (matchesFound || []).map((match) => labels[match] || match).join(', ');
}

// 2. The Redaction Engine
function scanAndRedact(text) {
    let matchesFound = [];
    let redactedText = text;

    for (let type in SENSITIVE_PATTERNS) {
        // Reset regex index for global flags
        SENSITIVE_PATTERNS[type].lastIndex = 0; 
        
        if (SENSITIVE_PATTERNS[type].test(text)) {
            matchesFound.push(type);
            redactedText = redactedText.replace(SENSITIVE_PATTERNS[type], `[REDACTED_${type.toUpperCase()}]`);
        }
    }
    return { isSafe: matchesFound.length === 0, redactedText, matchesFound };
}

function showGlobalToast(message, type) {
    const toast = document.createElement('div');
    const bg = type === 'warn' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#10b981';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: ${bg};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: opacity 0.3s ease;
        opacity: 0;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => (toast.style.opacity = '1'));
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function getActiveInputElement() {
    return activeTextInput || document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
}

function setInputText(inputEl, text) {
    if (!inputEl) return;

    if (typeof inputEl.focus === 'function') {
        inputEl.focus();
    }

    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        inputEl.value = text;
    } else if (inputEl.isContentEditable || inputEl.contentEditable === 'true') {
        // Try the browser's rich-text insertion first.
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
        } catch (_err) {
            inputEl.textContent = text;
        }
    } else {
        inputEl.innerText = text;
    }

    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

async function extractTextFromFile(file) {
    const name = (file && file.name ? file.name : '').toLowerCase();
    if (name.endsWith('.txt')) {
        return await file.text();
    }

    if (name.endsWith('.docx')) {
        if (!window.JSZip) {
            console.error("PGAI: window.JSZip not found!");
            return '';
        }
        const zip = await window.JSZip.loadAsync(file);
        const docXml = zip.file('word/document.xml');
        if (!docXml) return '';
        const xmlText = await docXml.async('text');
        return xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    if (name.endsWith('.pptx')) {
        if (!window.JSZip) {
            console.error("PGAI: window.JSZip not found!");
            return '';
        }
        const zip = await window.JSZip.loadAsync(file);
        let slidesText = [];
        const slideFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/slides/slide') && k.endsWith('.xml'));
        for (const slidePath of slideFiles) {
            const xmlText = await zip.file(slidePath).async('text');
            slidesText.push(xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }
        return slidesText.join(' ');
    }

    return '';
}

// 3. Centralized Logging Function
function logViolation(analysis) {
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.get(['stats', 'detailedLogs'], (result) => {
                if (chrome.runtime.lastError) return;

                let stats = result.stats || { total: 0, types: {} };
                let logs = result.detailedLogs || [];

                stats.total++;
                analysis.matchesFound.forEach(type => {
                    stats.types[type] = (stats.types[type] || 0) + 1;
                });

                const newLog = {
                    time: new Date().toLocaleString(),
                    type: analysis.matchesFound.join(', '),
                    platform: window.location.hostname.replace('www.', ''),
                    status: "Blocked & Redacted"
                };
                logs.push(newLog);

                chrome.storage.local.set({ stats: stats, detailedLogs: logs });
            });
        }
    } catch (e) {
        // Extension context invalidated
    }
}

// Debug logging helper: record short events for tuning and diagnostics.
function debugRecord(obj) {
    try {
        if (!(chrome && chrome.storage && chrome.storage.local)) {
            console.debug('PGAI debug (no storage):', obj);
            return;
        }
    } catch (_e) {
        console.debug('PGAI debug (no chrome):', obj);
        return;
    }

    try {
        chrome.storage.local.get(['debugEvents'], (res) => {
            const arr = (res && res.debugEvents) || [];
            arr.push(Object.assign({ ts: Date.now(), page: location.href }, obj));
            // Keep only last 200 events
            if (arr.length > 200) arr.splice(0, arr.length - 200);
            chrome.storage.local.set({ debugEvents: arr });
        });
    } catch (e) {
        console.debug('PGAI debug write failed', e && e.message ? e.message : e);
    }
}

// 4. The Modern UI Overlay Logic
function showModernWarning(analysis, targetElement, options) {
    // Remove existing overlay if present
    const existing = document.getElementById('sentinel-overlay');
    if (existing) existing.remove();

    const opts = options || {};
    const primaryLabel = opts.primaryLabel || 'Redact Safely';
    const secondaryLabel = opts.secondaryLabel || 'Ignore & Send';

    const overlay = document.createElement('div');
    overlay.id = 'sentinel-overlay';
    
    // Sleek, modern toast notification
    overlay.setAttribute('style', `
        position: fixed; 
        top: 24px; 
        right: 24px;
        z-index: 2147483647; 
        width: 360px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 12px;
        padding: 20px;
        margin: 0;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        animation: sentinel-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        display: flex;
        flex-direction: column;
        gap: 12px;
    `);

    // Add keyframes if not present
    if (!document.getElementById('sentinel-animations')) {
        const style = document.createElement('style');
        style.id = 'sentinel-animations';
        style.innerHTML = `
            @keyframes sentinel-slide-in {
                from { transform: translateX(100%) translateY(-10px) scale(0.95); opacity: 0; }
                to { transform: translateX(0) translateY(0) scale(1); opacity: 1; }
            }
            .sentinel-btn {
                transition: all 0.2s ease;
                font-family: inherit;
            }
            .sentinel-btn:hover {
                transform: translateY(-1px);
            }
            .sentinel-btn:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    overlay.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="background-color: #fee2e2; color: #ef4444; padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </div>
            <div style="flex: 1;">
                <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #111827;">Sensitive Data Blocked</h3>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563;">
                    We detected the following sensitive information: <br/>
                    <strong style="color: #111827; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 6px; font-size: 12px;">${formatMatches(analysis.matchesFound)}</strong>
                </p>
            </div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 8px; justify-content: flex-end;">
            <button class="sentinel-btn sentinel-dismiss-btn" style="background: white; color: #4b5563; border: 1px solid #d1d5db; padding: 8px 16px; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                ${secondaryLabel}
            </button>
            <button class="sentinel-btn sentinel-block-btn" style="background: #2563eb; color: white; border: none; padding: 8px 16px; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><polyline points="12 15 17 21 21 10"></polyline><line x1="12" y1="15" x2="22" y2="3"></line></svg>
                ${primaryLabel}
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Attach handlers using class selectors (more reliable)
    const blockBtn = overlay.querySelector('.sentinel-block-btn');
    const dismissBtn = overlay.querySelector('.sentinel-dismiss-btn');
    
    // Professional temporary toast UI
    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: opacity 0.3s ease;
            opacity: 0;
        `;
        toast.innerText = message;
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => toast.style.opacity = '1');
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function blockAction() {
        if (typeof opts.onPrimary === 'function') {
            opts.onPrimary();
            overlay.remove();
            return;
        }

        if (targetElement) {
            if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT') {
                targetElement.value = analysis.redactedText;
            } else if (targetElement.isContentEditable || targetElement.contentEditable === 'true') {
                targetElement.textContent = analysis.redactedText;
            } else {
                targetElement.innerText = analysis.redactedText;
            }
        }
        overlay.remove();
        showToast("Sensitive data redacted. You can now submit safely.");
    }
    
    function dismissAction() {
        if (typeof opts.onSecondary === 'function') {
            opts.onSecondary();
            overlay.remove();
            return;
        }

        allowNextSendOnce = true;
        overlay.remove();

        const sendBtn = getSendButton();
        if (sendBtn) {
            sendBtn.click();
            return;
        }

        if (targetElement) {
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true
            });
            targetElement.dispatchEvent(enterEvent);
        }
    }
    
    // Use capture phase and pointer/mousedown events robustly 
    // to bypass ChatGPT/React event swallowing
    if (blockBtn) {
        blockBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            blockAction();
        }, true);
    }
    
    if (dismissBtn) {
        dismissBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dismissAction();
        }, true);
    }
}

// 5. Centralized Submission Handler
function processSubmission(event, userInput, inputElement) {
    if (allowNextSendOnce) {
        allowNextSendOnce = false;
        return true;
    }

    if (!userInput) return true;
    
    const analysis = scanAndRedact(userInput);

    if (!analysis.isSafe) {
        // Stop the event dead in its tracks
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        showModernWarning(analysis, inputElement);
        logViolation(analysis);
        return false; // Submission blocked
    }
    return true; // Submission safe
}

// ==========================================
// 6. EVENT INTERCEPTORS (The Fix)
// ==========================================

let activeTextInput = null;
let lastSendButton = null;
let allowNextSendOnce = false;

function getSendButton() {
    if (lastSendButton && document.contains(lastSendButton)) {
        return lastSendButton;
    }

    return document.querySelector(
        'button[aria-label*="send" i], button[data-testid*="send" i], ' +
        'button[title*="send" i], button[type="submit"], ' +
        'button[aria-label*="run" i], button[data-testid*="run" i]'
    );
}

// A. Track the active text input box dynamically
document.addEventListener('input', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.role === 'textbox' || e.target.isContentEditable) {
        activeTextInput = e.target;
    }
}, true);

document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.role === 'textbox' || e.target.isContentEditable) {
        activeTextInput = e.target;
    }
}, true);

// B. Enter Key Interceptor
window.addEventListener('keydown', (event) => {
    const isTextArea = event.target.tagName === 'TEXTAREA' || 
                       event.target.role === 'textbox' || 
                       event.target.contentEditable === 'true';
    
    if (isTextArea && event.key === 'Enter' && !event.shiftKey) {
        const userInput = event.target.innerText || event.target.value;
        processSubmission(event, userInput, event.target);
    }
}, true); // Use capture phase

// C. Mouse Click Interceptor (Catches Send Buttons)
['mousedown', 'click'].forEach(eventType => {
    window.addEventListener(eventType, (event) => {
        let target = event.target;
        let isSendAction = false;

        // Traverse up the DOM tree to see if the user clicked inside a button
        while (target && target !== document.body) {
            if (target.tagName === 'BUTTON' || target.role === 'button') {
                const aria = (target.getAttribute('aria-label') || '').toLowerCase();
                const testId = (target.getAttribute('data-testid') || '').toLowerCase();
                const title = (target.getAttribute('title') || '').toLowerCase();
                
                // Identify if the button is likely a 'Send' button based on standard attributes
                if (aria.includes('send') || testId.includes('send') ||
                    title.includes('send') || aria.includes('run') || target.type === 'submit') {
                    isSendAction = true;
                    lastSendButton = target;
                    break;
                }
            }
            target = target.parentElement;
        }

        if (isSendAction) {
            // Find the active text box
            const inputElement = activeTextInput || document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
            
            if (inputElement) {
                const userInput = inputElement.innerText || inputElement.value || inputElement.textContent;
                processSubmission(event, userInput, inputElement);
            }
        }
    }, true); // Use capture phase to intercept before React handles it
});

// 7. File Upload + Drop Scanner bootstrap
function initializeScanner() {
    if (window.SentinelScanner && typeof window.SentinelScanner.init === 'function') {
        window.SentinelScanner.init({
            scanAndRedact,
            showModernWarning,
            logViolation
        });
        return true;
    }
    return false;
}

// Try immediate initialization, with aggressive retry polling
if (!initializeScanner()) {
    // Retry with polling: 50ms intervals, max 20 attempts (1 second window)
    let retryCount = 0;
    const maxRetries = 20;
    const retryInterval = setInterval(() => {
        retryCount++;
        if (initializeScanner() || retryCount >= maxRetries) {
            clearInterval(retryInterval);
        }
    }, 50);
}

// 8. Listen for images about to be sent by network layer
window.addEventListener('sentinel:image-pending-send', (event) => {
    if (!event || !event.detail) {
        return;
    }

    const imageInfo = event.detail || {};
    // Check filename heuristics — only examine path/filename (ignore query strings)
    const sensitivePattern = /(?:aadhaar|aadhar|voter|epic|election|passport|credential|(?:api[_-]?key)|(?:private[_-]?key)|secret|ssn|pan|driving|green.?card|credit|debit)/i;
    const requestId = imageInfo.requestId || null;

    function sendDecision(reqId, allow) {
        try {
            if (!reqId) return;
            window.dispatchEvent(new CustomEvent('sentinel:image-send-decision', { detail: { requestId: reqId, allowed: !!allow } }));
        } catch (e) {
            console.debug('sentinel:decision dispatch failed', e && e.message ? e.message : e);
        }
    }

    try {
        let fname = (imageInfo.filename || "") + "";
        try {
            const u = new URL(fname, window.location.href);
            fname = (u.pathname || "").split('/').pop() || fname;
        } catch (_e) {
            fname = (fname.split('?')[0] || fname).split('/').pop() || fname;
        }

        const isSuspicious = sensitivePattern.test((fname || '').toLowerCase());

        // Log the incoming request for debugging/tuning
        try { debugRecord({ event: 'request', requestId: requestId, filename: fname, suspicious: !!isSuspicious, reason: imageInfo.reason || null }); } catch (_) {}

        if (isSuspicious) {
            const analysis = {
                isSafe: false,
                redactedText: "[REDACTED_SENSITIVE_IMAGE]",
                matchesFound: ["filenameHeuristic", "sensitiveImage"]
            };

            showModernWarning(analysis, document.body, {
                primaryLabel: "Don't Allow",
                secondaryLabel: "Allow",
                onPrimary: () => {
                    try { debugRecord({ event: 'decision', requestId: requestId, decision: false }); } catch (_) {}
                    logViolation(analysis);
                    sendDecision(requestId, false);
                },
                onSecondary: () => {
                    try { debugRecord({ event: 'decision', requestId: requestId, decision: true }); } catch (_) {}
                    sendDecision(requestId, true);
                }
            });

            logViolation(analysis);
        } else {
            // Not suspicious — immediately allow so page-guard can continue
            try { debugRecord({ event: 'request_auto_allow', requestId: requestId, filename: fname }); } catch (_) {}
            if (requestId) sendDecision(requestId, true);
        }
    } catch (err) {
        // On heuristic error: allow to avoid blocking user
        try { debugRecord({ event: 'request_error', requestId: requestId, filename: fname, error: err && err.message ? err.message : String(err) }); } catch (_) {}
        if (requestId) sendDecision(requestId, true);
    }
}, true);

// 9. Monitor DOM for image uploads and check if they contain sensitive data
function setupImageObserver() {
    // Narrow filename heuristics and avoid matching on query params or tiny icons
    const sensitiveFilenamePattern = /(?:aadhaar|aadhar|voter|epic|election|passport|credential|(?:api[_-]?key)|(?:private[_-]?key)|secret|ssn|pan|driving|green.?card|credit|debit)/i;
    const sensitiveKeywords = /(aadhaar|aadhar|uidai|voter|epic|election|passport|pan|pan card|driving license|green card|credit card|debit card)/i;
    const ignoreHostPattern = /(gstatic|googleusercontent|googleapis|cdn|favicon|logo|icon|avatar|sprite|static)/i;
    const minImageSizePx = 48; // ignore small UI icons

    // Debounce to avoid excessive processing on SPAs that re-render constantly
    let _observerDebounceTimer = null;
    const observer = new MutationObserver(function(mutations) {
        if (_observerDebounceTimer) return;
        _observerDebounceTimer = setTimeout(function() {
            _observerDebounceTimer = null;
            mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Get images as an array (fixes NodeList.push bug)
                        let images = [];
                        if (node.querySelectorAll) {
                            images = Array.from(node.querySelectorAll('img'));
                        }
                        if (node.tagName === 'IMG') {
                            images.push(node);
                        }

                        images.forEach(function(img) {
                            try {
                                const altText = (img.alt || "").toLowerCase();
                                const src = (img.src || "").toLowerCase();

                                // Skip tiny UI images and known CDN/asset hosts
                                const w = img.naturalWidth || img.width || 0;
                                const h = img.naturalHeight || img.height || 0;
                                if (w < minImageSizePx || h < minImageSizePx) return;
                                if (ignoreHostPattern.test(src)) return;

                                // Check alt text first (user-supplied descriptions)
                                if (sensitiveKeywords.test(altText) || sensitiveFilenamePattern.test(altText)) {
                                    showModernWarning({
                                        isSafe: false,
                                        redactedText: "[REDACTED_SENSITIVE_IMAGE]",
                                        matchesFound: ["imageDomDetection", "sensitiveImage"]
                                    }, document.body);
                                    logViolation({
                                        isSafe: false,
                                        redactedText: "[REDACTED_SENSITIVE_IMAGE]",
                                        matchesFound: ["imageDomDetection", "sensitiveImage"]
                                    });
                                    return;
                                }

                                // Parse pathname/filename only (ignore query strings which commonly include 'key' or tokens)
                                let filename = "";
                                try {
                                    const u = new URL(src, window.location.href);
                                    filename = (u.pathname || "").split('/').pop() || "";
                                } catch (_e) {
                                    filename = (src.split('?')[0] || "").split('/').pop() || "";
                                }
                                filename = (filename || "").toLowerCase();

                                if (sensitiveKeywords.test(filename) || sensitiveFilenamePattern.test(filename)) {
                                    showModernWarning({
                                        isSafe: false,
                                        redactedText: "[REDACTED_SENSITIVE_IMAGE]",
                                        matchesFound: ["imageSrcDetection", "sensitiveImage"]
                                    }, document.body);
                                    logViolation({
                                        isSafe: false,
                                        redactedText: "[REDACTED_SENSITIVE_IMAGE]",
                                        matchesFound: ["imageSrcDetection", "sensitiveImage"]
                                    });
                                }
                            } catch (_err) {
                                // Non-fatal — don't let observer errors break page
                            }
                        });
                    }
                }
            }
        });
        }, 200); // 200ms debounce
    });

    // Start observing the entire document for added/removed nodes
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
}

// Start image observer when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupImageObserver);
} else {
    setupImageObserver();
}
