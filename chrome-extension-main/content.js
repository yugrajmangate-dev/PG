/**
 * SentinelGate: content.js
 * Final Hackathon-Ready Version (Updated with Mouse Click Interception)
 */

// 1. Defined Sensitive Patterns (Regex) - Must be at the top
const SENSITIVE_PATTERNS = {
    creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
    awsKey: /AKIA[0-9A-Z]{16}/g,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    proprietaryMarkers: /(INTERNAL_ONLY|CONFIDENTIAL|PROPERTY_OF_ACME|DO_NOT_DISTRIBUTE)/gi,
    dbConnection: /(mongodb\+srv|postgres|mysql):\/\/[^\s]+/gi,
    highEntropySecret: /['"][a-zA-Z0-9]{32,128}['"]/g
};

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
        
    }
}

// 4. The Modern UI Overlay Logic
function showModernWarning(analysis, targetElement) {
    // Remove existing overlay if present
    const existing = document.getElementById('sentinel-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sentinel-overlay';
    overlay.className = 'sentinel-warning-overlay'; // Uses your styles.css
    
    // Inline styles as backup for hackathon stability
    overlay.setAttribute('style', `
        position: fixed; top: 20px; right: 20px; color: white;
        z-index: 100000; width: 340px; min-height: 200px; font-family: sans-serif;
    `);

    overlay.innerHTML = `
        <div style="position: absolute; top: 48px; left: 10px; width: 68px; height: 68px; background: #1e293b; border: 2px solid #ef4444; border-radius: 50%;"></div>
        <div style="position: absolute; top: 22px; left: 62px; width: 92px; height: 92px; background: #1e293b; border: 2px solid #ef4444; border-radius: 50%;"></div>
        <div style="position: absolute; top: 12px; left: 136px; width: 114px; height: 114px; background: #1e293b; border: 2px solid #ef4444; border-radius: 50%;"></div>
        <div style="position: absolute; top: 34px; right: 16px; width: 88px; height: 88px; background: #1e293b; border: 2px solid #ef4444; border-radius: 50%;"></div>
        <div style="position: absolute; top: 74px; left: 26px; width: 286px; height: 126px; background: #1e293b; border: 2px solid #ef4444; border-radius: 62px;"></div>

        <div style="position: relative; z-index: 2; padding: 48px 26px 16px 26px;">
            <strong style="display:block; color: #ef4444; margin-bottom: 8px;">🚨 PRIVACY VIOLATION</strong>
            <p style="font-size: 13px; margin: 0 0 15px 0;">We detected: <b>${analysis.matchesFound.join(', ')}</b>. Exfiltration paused.</p>
            <button id="sendRedacted" style="background: #ef4444; color: white; border: none; padding: 10px; border-radius: 999px; cursor: pointer; width: 100%; font-weight: bold;">Send Redacted Version</button>
            <button id="cancelSend" style="background: transparent; color: #94a3b8; border: none; margin-top: 10px; cursor: pointer; width: 100%; font-size: 12px;">Cancel and Edit</button>
        </div>
    `;
    
    document.body.appendChild(overlay);

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

    // Handle Redaction Choice
    const sendRedacted = document.getElementById('sendRedacted');
    if (sendRedacted) {
        sendRedacted.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT') {
                targetElement.value = analysis.redactedText;
            } else {
                targetElement.innerText = analysis.redactedText;
            }
            overlay.remove();
            showToast("Text sanitized. You can now press Enter or click Send safely.");
        }, true);
    }

    const cancelSend = document.getElementById('cancelSend');
    if (cancelSend) {
        cancelSend.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();
        }, true);
    }
}

// 5. Centralized Submission Handler
function processSubmission(event, userInput, inputElement) {
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

// A. Track the active text input box dynamically
document.addEventListener('input', (e) => {
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
if (window.SentinelScanner && typeof window.SentinelScanner.init === 'function') {
    window.SentinelScanner.init({
        scanAndRedact,
        showModernWarning,
        logViolation
    });
}
