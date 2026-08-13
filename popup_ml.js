// Loader and UI glue for popup ML demo
// Depends on ml/js_inference_example.js being included before this script

let __pgai_vec = null;
let __pgai_clf = null;
let __pgai_loaded = false;
let ocrWorker = null;
let ocrReady = false;
let ocrLoading = false;

async function loadModels() {
  if (__pgai_loaded) return true;
  try {
    const vecUrl = chrome.runtime.getURL('ml/models/vectorizer.json');
    const clfUrl = chrome.runtime.getURL('ml/models/classifier.json');
    const [vR, cR] = await Promise.all([fetch(vecUrl), fetch(clfUrl)]);
    __pgai_vec = await vR.json();
    __pgai_clf = await cR.json();
    __pgai_loaded = true;
    return true;
  } catch (e) {
    console.error('Failed to load ML models', e);
    return false;
  }
}

async function preloadOCRWorker() {
  if (ocrReady) return true;
  if (ocrLoading) return false;
  ocrLoading = true;
  try {
    if (typeof Tesseract === 'undefined' || !Tesseract.createWorker) {
      console.warn('Tesseract not available');
      return false;
    }
    const opts = {
      workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('vendor/tesseract/tesseract-core.wasm.js'),
      // Keep popup OCR path aligned with offscreen OCR path.
      langPath: chrome.runtime.getURL('vendor/tessdata/eng.traineddata/'),
      workerBlobURL: false,
      gzip: false,
      logger: m => {
        try {
          const el = document.getElementById('mlResult');
          if (el && m) {
            const p = typeof m.progress === 'number' ? Math.round(m.progress * 100) + '%' : '';
            el.innerText = 'OCR: ' + (m.status || '') + ' ' + p;
          }
        } catch (_e) {}
      }
    };
    // Tesseract v5 API: createWorker returns a Promise and accepts lang as first arg
    try {
      ocrWorker = await Tesseract.createWorker('eng', 1, opts);
    } catch (_) {
      // Fallback to legacy v2/v3 API
      ocrWorker = await Tesseract.createWorker(opts);
      if (typeof ocrWorker.loadLanguage === 'function') await ocrWorker.loadLanguage('eng');
      if (typeof ocrWorker.initialize === 'function') await ocrWorker.initialize('eng');
    }
    ocrReady = true;
    return true;
  } catch (e) {
    console.error('OCR worker init failed', e);
    return false;
  } finally {
    ocrLoading = false;
  }
}

function resizeImageFile(file, maxDim) {
  maxDim = maxDim || 1200;
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = 1;
          if (Math.max(w, h) > maxDim) scale = maxDim / Math.max(w, h);
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          canvas.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob); else resolve(file);
          }, 'image/jpeg', 0.9);
        } catch (err) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    } catch (e) { reject(e); }
  });
}

function showMLResult(text, res) {
  const out = [];
  if (!res) {
    out.push('No result');
  } else {
    out.push('Input: ' + (text.length > 200 ? text.slice(0,200) + '...' : text));
    out.push('Detected labels: ' + (res.labels && res.labels.length ? res.labels.join(', ') : 'none'));
    if (res.probs && res.probs.length) {
      const probStr = res.probs.map((p,i)=>`${(p*100).toFixed(1)}%`).join(', ');
      out.push('Probabilities: ' + probStr);
    }
  }
  const el = document.getElementById('mlResult');
  if (el) el.innerText = out.join('\n');
}

function redactPII(text) {
  if (!text) return text;
  // emails
  let red = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[REDACTED-EMAIL]');
  // phone numbers (simple)
  red = red.replace(/(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[REDACTED-PHONE]');
  // long hex-like tokens / API keys
  red = red.replace(/\b[a-f0-9]{32,}\b/ig, '[REDACTED-KEY]');
  // ssn-like
  red = red.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]');
  return red;
}

document.addEventListener('DOMContentLoaded', () => {
  const classifyBtn = document.getElementById('classifyBtn');
  const redactBtn = document.getElementById('redactBtn');
  const inputEl = document.getElementById('mlInput');

  if (classifyBtn) {
    classifyBtn.addEventListener('click', async () => {
      const text = inputEl ? inputEl.value : '';
      if (!text) {
        showMLResult(text, null);
        return;
      }
      const ok = await loadModels();
      if (!ok) {
        const el = document.getElementById('mlResult');
        if (el) el.innerText = 'Model load failed';
        return;
      }
      try {
        const res = predictPII(text, __pgai_vec, __pgai_clf, 0.5);
        showMLResult(text, res);
      } catch (e) {
        console.error('predictPII error', e);
        const el = document.getElementById('mlResult');
        if (el) el.innerText = 'Error running model';
      }
    });
  }

  if (redactBtn) {
    redactBtn.addEventListener('click', () => {
      const text = inputEl ? inputEl.value : '';
      const red = redactPII(text);
      if (inputEl) inputEl.value = red;
      const el = document.getElementById('mlResult');
      if (el) el.innerText = 'Redaction applied';
    });
  }

  // OCR: file picker + OCR button wiring
  const ocrBtn = document.getElementById('ocrBtn');
  const ocrFile = document.getElementById('ocrFile');
  if (ocrBtn && ocrFile) {
    ocrBtn.addEventListener('click', () => ocrFile.click());
    ocrFile.addEventListener('change', async (ev) => {
      const file = (ev && ev.target && ev.target.files && ev.target.files[0]) || null;
      const el = document.getElementById('mlResult');
      if (!file) return;
      if (el) el.innerText = 'Preparing image...';
      try {
        const okModel = await loadModels();
        // preload OCR worker (may be slow first time)
        await preloadOCRWorker();
        const resized = await resizeImageFile(file, 1200);
        if (el) el.innerText = 'Running OCR... (this may take a few seconds)';
        const { data } = await ocrWorker.recognize(resized);
        const text = data && data.text ? data.text : '';
        if (!text || !text.trim()) {
          if (el) el.innerText = 'No text detected in image';
          return;
        }
        // classify extracted text
        if (!okModel) await loadModels();
        const res = predictPII(text, __pgai_vec, __pgai_clf, 0.5);
        showMLResult(text, res);
      } catch (e) {
        console.error('OCR processing failed', e);
        if (el) el.innerText = 'OCR failed';
      }
    });
  }

  // Paste handler: allow users to paste screenshots/images into the popup
  async function handlePastedImage(file) {
    const el = document.getElementById('mlResult');
    if (el) el.innerText = 'Pasted image — processing...';
    try {
      await loadModels();
      await preloadOCRWorker();
      const resized = await resizeImageFile(file, 1200);
      if (el) el.innerText = 'Running OCR...';
      const { data } = await ocrWorker.recognize(resized);
      const text = data && data.text ? data.text : '';
      if (text && inputEl) inputEl.value = text;
      if (text) {
        const res = predictPII(text, __pgai_vec, __pgai_clf, 0.5);
        showMLResult(text, res);
      } else {
        if (el) el.innerText = 'No text detected in pasted image';
      }
    } catch (err) {
      console.error('paste image error', err);
      if (el) el.innerText = 'OCR failed on pasted image';
    }
  }

  document.addEventListener('paste', async (ev) => {
    try {
      const items = ev.clipboardData && ev.clipboardData.items;
      if (items && items.length) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it && it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
            const file = it.getAsFile();
            if (file) {
              ev.preventDefault();
              await handlePastedImage(file);
              return;
            }
          }
        }
      }

      // Fallback: try async Clipboard API (may require permissions)
      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                if (blob) {
                  ev.preventDefault();
                  await handlePastedImage(blob);
                  return;
                }
              }
            }
          }
        } catch (_e) {
          // ignore permission errors
        }
      }
    } catch (e) {
      console.error('paste handler error', e);
    }
  });

  // Preload models in background for snappy demo
  loadModels().then(ok => {
    if (ok) console.log('ML models preloaded');
  });
});
