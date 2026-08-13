/**
 * background.js — Service worker setup.
 * Handles creating the offscreen document and forwarding OCR requests to it.
 * Tesseract CANNOT run in standard MV3 service workers due to lack of Web Worker support.
 */

let creating; // A promise to track if we're currently creating the offscreen doc
let idleTimer = null;
const OFFSCREEN_IDLE_TIMEOUT_MS = 60000; // 60 seconds

async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['DOM_PARSER', 'WORKERS'],
      justification: 'Run Tesseract OCR worker which requires full DOM and Web Worker support',
    });
    await creating;
    creating = null;
  }
}

async function closeOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    chrome.offscreen.closeDocument();
  }
}

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    closeOffscreenDocument();
  }, OFFSCREEN_IDLE_TIMEOUT_MS);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PGAI_OCR_REQUEST') {
    (async () => {
      try {
        await setupOffscreenDocument('offscreen.html');
        resetIdleTimer();

        // Forward the message to the offscreen document
        chrome.runtime.sendMessage(
          { type: 'OFFSCREEN_OCR_REQUEST', dataUrl: message.dataUrl },
          (response) => {
            resetIdleTimer();
            if (chrome.runtime.lastError) {
              console.error('PGAI SW: Error forwarding to offscreen:', chrome.runtime.lastError);
              sendResponse({ success: false, text: '', error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      } catch (err) {
        console.error('PGAI SW: Failed to setup offscreen document:', err);
        sendResponse({ success: false, text: '', error: String(err) });
      }
    })();

    return true; // Keep channel open for async response
  }

  if (message.type === 'PGAI_PDF_REQUEST') {
    (async () => {
      try {
        await setupOffscreenDocument('offscreen.html');
        resetIdleTimer();

        chrome.runtime.sendMessage(
          { type: 'OFFSCREEN_PDF_REQUEST', buffer: message.buffer },
          (response) => {
            resetIdleTimer();
            if (chrome.runtime.lastError) {
              console.error('PGAI SW: Error forwarding PDF to offscreen:', chrome.runtime.lastError);
              sendResponse({ success: false, text: '', error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response);
            }
          }
        );
      } catch (err) {
        console.error('PGAI SW: Failed to setup offscreen document for PDF:', err);
        sendResponse({ success: false, text: '', error: String(err) });
      }
    })();

    return true;
  }
});
