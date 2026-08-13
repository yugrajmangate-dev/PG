const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const extensionPath = path.resolve(__dirname, '..'); // points to Extension/

  console.log('Launching Chromium with extension from', extensionPath);

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox'
    ]
  });

  const [page] = await browser.pages();

  page.on('console', msg => {
    try {
      console.log('PAGE:', msg.text());
    } catch (e) {
      // ignore
    }
  });

  // Use a public AI site included in the manifest (no auth required).
  const target = 'https://huggingface.co/';
  console.log('Opening', target);
  await page.goto(target, { waitUntil: 'networkidle2' });

  // Wait a few seconds for content scripts to load and inject
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Check for markers that scanner/content scripts add to window
  const sentinelPresent = await page.evaluate(() => {
    return !!(window.SentinelScanner || window.SentinelGateUpdater || window.__sentinelPageGuardInstalled);
  });

  console.log('Sentinel presence on page:', sentinelPresent);

  // Keep browser open for manual inspection
  console.log('Smoke test completed — leaving browser open for manual inspection. Close to finish.');
})();
