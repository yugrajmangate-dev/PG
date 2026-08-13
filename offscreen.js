/**
 * offscreen.js
 * Runs inside offscreen.html.
 * This environment has full access to the DOM and Web Workers, so Tesseract.js works flawlessly here,
 * without being blocked by host page CSP or MV3 service worker limitations.
 */

let ocrWorker = null;
let initPromise = null;
const PDF_MAX_TEXT_PAGES = 6;
const PDF_MAX_OCR_PAGES = 2;
const PDF_OCR_TEXT_THRESHOLD = 60;

async function initTesseract() {
  if (ocrWorker) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const opts = {
        workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
        corePath: chrome.runtime.getURL('vendor/tesseract/tesseract-core.wasm.js'),
        // This project stores traineddata at vendor/tessdata/eng.traineddata/eng.traineddata
        // so langPath must point to that parent folder.
        langPath: chrome.runtime.getURL('vendor/tessdata/eng.traineddata/'),
        workerBlobURL: false,
        gzip: false
      };

      try {
        ocrWorker = await Tesseract.createWorker('eng', 1, opts);
      } catch (_) {
        ocrWorker = await Tesseract.createWorker(opts);
        if (ocrWorker.loadLanguage) await ocrWorker.loadLanguage('eng');
        if (ocrWorker.initialize) await ocrWorker.initialize('eng');
      }

      console.log('PGAI Offscreen: Tesseract ready ✓');
      return true;
    } catch (err) {
      console.error('PGAI Offscreen: Tesseract init failed:', err);
      ocrWorker = null;
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

// Pre-warm Tesseract
initTesseract().catch(() => {});

function extractTextFromPdfBinary(buffer) {
  try {
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(buffer);
    return raw.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (_err) {
    return '';
  }
}

async function extractTextFromPdfWithPdfJs(buffer) {
  if (!self.pdfjsLib || typeof self.pdfjsLib.getDocument !== 'function') {
    return '';
  }

  try {
    if (self.pdfjsLib.GlobalWorkerOptions && !self.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      self.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.js');
    }

    const task = self.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
    const pdf = await task.promise;
    let text = '';
    const maxPages = Math.min(pdf.numPages || 0, PDF_MAX_TEXT_PAGES);

    for (let i = 1; i <= maxPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = (content.items || []).map((item) => item.str || '').join(' ');
      text += ` ${pageText}`;
    }

    return text.trim();
  } catch (_err) {
    return '';
  }
}

async function renderPdfPageToDataUrl(page, scale) {
  try {
    const viewport = page.getViewport({ scale: scale || 1.5 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch (_err) {
    return '';
  }
}

async function extractTextFromPdfWithOcr(pdf) {
  if (!pdf) return '';

  const ready = await initTesseract();
  if (!ready || !ocrWorker) return '';

  const maxPages = Math.min(pdf.numPages || 0, PDF_MAX_OCR_PAGES);
  let text = '';

  for (let i = 1; i <= maxPages; i += 1) {
    try {
      const page = await pdf.getPage(i);
      const imageData = await renderPdfPageToDataUrl(page, 1.6);
      if (!imageData) continue;
      const result = await ocrWorker.recognize(imageData);
      const pageText = (result && result.data && result.data.text) || '';
      if (pageText) text += ` ${pageText}`;
    } catch (_err) {
      // Continue other pages if one page OCR fails.
    }
  }

  return text.trim();
}

async function extractTextFromPdfBuffer(buffer) {
  let text = await extractTextFromPdfWithPdfJs(buffer);

  if (text.length >= PDF_OCR_TEXT_THRESHOLD) {
    return text;
  }

  if (self.pdfjsLib && typeof self.pdfjsLib.getDocument === 'function') {
    try {
      if (self.pdfjsLib.GlobalWorkerOptions && !self.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        self.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.js');
      }

      const task = self.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
      const pdf = await task.promise;
      const ocrText = await extractTextFromPdfWithOcr(pdf);
      if (ocrText) text = `${text} ${ocrText}`.trim();
    } catch (_err) {
      // Fall back to current text.
    }
  }

  if (!text) {
    text = extractTextFromPdfBinary(buffer);
  }

  return text;
}

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_OCR_REQUEST') {
    (async () => {
      try {
        const ready = await initTesseract();
        if (!ready || !ocrWorker) {
          sendResponse({ success: false, text: '', error: 'Tesseract failed to load' });
          return;
        }

        const result = await ocrWorker.recognize(message.dataUrl);
        const text = (result && result.data && result.data.text) || '';
        
        console.log('PGAI Offscreen: OCR done, text length:', text.length, '| preview:', text.replace(/\n/g, ' ').slice(0, 50));
        sendResponse({ success: true, text });
      } catch (err) {
        console.error('PGAI Offscreen: OCR error:', err);
        sendResponse({ success: false, text: '', error: String(err) });
      }
    })();
    return true; // Keep channel open
  }

  if (message.type === 'OFFSCREEN_PDF_REQUEST') {
    (async () => {
      try {
        const text = await extractTextFromPdfBuffer(message.buffer);
        sendResponse({ success: true, text: text || '' });
      } catch (err) {
        console.error('PGAI Offscreen: PDF extraction error:', err);
        sendResponse({ success: false, text: '', error: String(err) });
      }
    })();
    return true;
  }
});
