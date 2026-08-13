// JS inference example for the exported vectorizer and classifier JSON
// Usage (in extension/content script):
// const vec = await fetch(chrome.runtime.getURL('ml/models/vectorizer.json')).then(r=>r.json())
// const clf = await fetch(chrome.runtime.getURL('ml/models/classifier.json')).then(r=>r.json())
// const res = predictPII('my email is foo@example.com', vec, clf)

function tokenize(text) {
  if (!text) return [];
  return ('' + text).toLowerCase().match(/\b\w+\b/g) || [];
}

function generateNgrams(tokens) {
  const ngrams = [];
  for (let i = 0; i < tokens.length; i++) {
    ngrams.push(tokens[i]);
    if (i + 1 < tokens.length) {
      ngrams.push(tokens[i] + ' ' + tokens[i + 1]);
    }
  }
  return ngrams;
}

function buildTfIdfVector(text, vecJson) {
  const vocab = vecJson.vocab || {};
  const idf = vecJson.idf || [];
  const nFeatures = vecJson.n_features || idf.length || 0;

  const tokens = tokenize(text);
  const ngrams = generateNgrams(tokens);

  // Count occurrences only for vocabulary terms
  const counts = new Map();
  for (const ng of ngrams) {
    const idx = vocab.hasOwnProperty(ng) ? vocab[ng] : undefined;
    if (idx !== undefined) {
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
  }

  // Build dense array and apply idf
  const vec = new Array(nFeatures).fill(0.0);
  for (const [idx, cnt] of counts.entries()) {
    const idfVal = idx < idf.length ? idf[idx] : 1.0;
    vec[idx] = cnt * idfVal;
  }

  // L2 normalize
  let norm = 0.0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-12) {
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
  }

  return vec;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function dotProduct(x, w) {
  let s = 0.0;
  const n = Math.min(x.length, w.length);
  for (let i = 0; i < n; i++) s += x[i] * w[i];
  return s;
}

function predictPII(text, vecJson, clfJson, threshold=0.5) {
  const x = buildTfIdfVector(text, vecJson);
  const coefs = clfJson.coefs || [];
  const intercepts = clfJson.intercepts || [];
  const classes = clfJson.classes || [];

  const probs = [];
  const labels = [];
  for (let i = 0; i < coefs.length; i++) {
    const w = coefs[i];
    const b = intercepts[i] || 0.0;
    const score = dotProduct(x, w) + b;
    const p = sigmoid(score);
    probs.push(p);
    if (p >= threshold) labels.push(classes[i] || `label_${i}`);
  }

  return { labels, probs };
}

// Export for Node or browser module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tokenize, buildTfIdfVector, predictPII };
}
