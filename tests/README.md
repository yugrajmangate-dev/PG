Smoke test for the Chrome extension

Prerequisites:

- Node.js and npm
- Chrome/Chromium installed (the script will launch Chromium provided by Puppeteer or your system)

Install and run:

```bash
cd Extension/tests
npm init -y
npm install puppeteer
node smoke_test.js
```

What it does:

- Launches Chromium with the unpacked extension at `Extension/` loaded.
- Opens `https://huggingface.co/` (a domain included in the extension manifest) where content scripts should inject.
- Prints page console messages and checks for a few global markers the extension sets (`window.SentinelScanner`, `window.SentinelGateUpdater`, `window.__sentinelPageGuardInstalled`).

Notes:

- The script runs non-headless to let you open DevTools and inspect the console/network for vendor assets (Tesseract/pdf.js worker paths).
- If the target site requires login (e.g., chat.openai.com), prefer a public domain in the manifest like `huggingface.co`.
