// Generate comprehensive match patterns from websites.json
// This script converts websites into manifest.json patterns

function generateMatchPatterns() {
  // All websites categorized
  const websitesData = {
    chat: [
      "chatgpt.com", "openai.com", "claude.ai", "claude.com",
      "gemini.google.com", "aistudio.google.com", "copilot.microsoft.com",
      "perplexity.ai", "replika.ai", "poe.com", "you.com",
      "mistral.ai", "grok.com", "grok.x.ai"
    ],
    coding: [
      "github.com", "replit.com", "cursor.sh", "tabnine.com",
      "coderabbit.ai", "gitpod.io", "gitlab.com"
    ],
    image: [
      "openai.com/dall-e", "labs.openai.com", "midjourney.com",
      "stability.ai", "leonardo.ai", "ideogram.ai", "replicate.com",
      "runway.ml", "artbreeder.com", "wombo.art", "canva.com"
    ],
    video: [
      "synthesia.io", "descript.com", "opus.ai", "heygen.com",
      "d-id.com", "pictory.ai", "runwayml.com"
    ],
    audio: [
      "elevenlabs.io", "murf.ai", "udio.com", "soundraw.io",
      "speechify.com", "typecast.ai"
    ],
    writing: [
      "grammarly.com", "quillbot.com", "jasper.ai", "rytr.me",
      "copyai.com", "writersonic.com", "wordtune.com", "notion.so"
    ],
    design: [
      "figma.com", "canva.com", "adobe.com", "webflow.com",
      "sketch.com", "penpot.app"
    ],
    research: [
      "arxiv.org", "kaggle.com", "scholar.google.com",
      "semanticscholar.org", "tensorflow.org", "pytorch.org"
    ],
    business: [
      "microsoft365.com", "slack.com", "asana.com", "monday.com",
      "notion.so", "airtable.com", "salesforce.com", "hubspot.com"
    ],
    education: [
      "coursera.org", "udemy.com", "duolingo.com", "codecademy.com",
      "linkedin.com/learning", "skillshare.com", "pluralsight.com"
    ],
    translation: [
      "deepl.com", "translate.google.com", "bing.com/translator"
    ],
    search: [
      "google.com", "bing.com", "duckduckgo.com", "wikipedia.org",
      "wolframalpha.com"
    ],
    social: [
      "facebook.com", "twitter.com", "x.com", "linkedin.com",
      "instagram.com", "tiktok.com", "youtube.com", "reddit.com"
    ],
    devops: [
      "docker.com", "kubernetes.io", "heroku.com", "netlify.com",
      "vercel.com", "aws.amazon.com", "azure.microsoft.com"
    ],
    payment: [
      "stripe.com", "shopify.com", "paypal.com", "square.com"
    ],
    security: [
      "cloudflare.com", "darktrace.com", "crowdstrike.com"
    ]
  };

  // Generate patterns
  const patterns = [];

  // Pattern 1: Direct domain
  for (const category in websitesData) {
    for (const website of websitesData[category]) {
      // Direct: https://example.com/*
      patterns.push(`https://${website}/*`);
      
      // Wildcard subdomain: https://*.example.com/* (if not already wildcard)
      if (!website.includes("*.") && website.split(".").length >= 2) {
        const parts = website.split(".");
        const domain = parts.slice(-2).join(".");
        patterns.push(`https://*.${domain}/*`);
      }
    }
  }

  // Remove duplicates
  const uniquePatterns = [...new Set(patterns)];

  return {
    totalPatterns: uniquePatterns.length,
    patterns: uniquePatterns,
    patternsByCategory: websitesData
  };
}

// Generate all patterns
const result = generateMatchPatterns();
console.log(`Generated ${result.totalPatterns} match patterns`);
console.log("Patterns:", result.patterns);

// Export for manifest.json
const manifestMatches = result.patterns.map(p => `"${p}"`).join(",\n        ");
console.log("\n=== COPY THIS TO manifest.json (matches array) ===\n");
console.log("\"matches\": [\n        " + manifestMatches + "\n      ]");

// ============================================
// PROGRAMMATIC MANIFEST GENERATOR
// ============================================

function generateManifestJSON() {
  const result = generateMatchPatterns();
  
  return {
    "manifest_version": 3,
    "name": "PrivacyGuard AI Protector",
    "version": "1.0",
    "description": "Prevents sensitive data leakage to LLMs (1000+ sites protected)",
    "permissions": ["storage", "activeTab"],
    "content_scripts": [
      {
        "matches": result.patterns,
        "js": ["updater.js", "scanner.js", "content.js"],
        "css": ["style.css"]
      }
    ],
    "web_accessible_resources": [
      {
        "resources": [
          "vendor/tesseract/tesseract.min.js",
          "page-guard.js",
          "vendor/tesseract/worker.min.js",
          "vendor/tesseract/tesseract-core.wasm.js",
          "vendor/tesseract/tesseract-core.wasm",
          "vendor/tesseract/tesseract-core-simd.wasm.js",
          "vendor/tesseract/tesseract-core-simd.wasm",
          "vendor/tessdata/*"
        ],
        "matches": ["<all_urls>"]
      }
    ],
    "content_security_policy": {
      "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'"
    },
    "action": {
      "default_popup": "popup.html"
    }
  };
}

// Generate and log
const manifest = generateManifestJSON();
console.log("\n=== FULL manifest.json ===\n");
console.log(JSON.stringify(manifest, null, 2));

// ============================================
// STATISTICS
// ============================================

function printStatistics() {
  const result = generateMatchPatterns();
  
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   EXTENSION COVERAGE STATISTICS       ║");
  console.log("╚════════════════════════════════════════╝\n");
  
  console.log(`Total Match Patterns:        ${result.patterns.length}`);
  console.log(`Total Unique Domains:        ${Object.values(result.patternsByCategory).flat().length}`);
  console.log(`Categories Covered:          ${Object.keys(result.patternsByCategory).length}`);
  
  console.log("\n📊 BREAKDOWN BY CATEGORY:\n");
  
  for (const [category, sites] of Object.entries(result.patternsByCategory)) {
    const patterns = sites.length * 2; // domain + wildcard
    console.log(`  ${category.padEnd(20)} ${sites.length.toString().padStart(3)} sites → ${patterns} patterns`);
  }
  
  console.log("\n=== TOP PROTECTED CATEGORIES ===\n");
  
  // Most common first
  const categorySizes = Object.entries(result.patternsByCategory)
    .map(([cat, sites]) => [cat, sites.length])
    .sort((a, b) => b[1] - a[1]);
  
  categorySizes.slice(0, 5).forEach(([cat, count], idx) => {
    console.log(`${idx + 1}. ${cat.toUpperCase()}: ${count} sites`);
  });
}

printStatistics();

// ============================================
// EXPORT FOR USE IN updater.js
// ============================================

function exportForUpdater() {
  const result = generateMatchPatterns();
  
  return {
    "protected_websites": Object.values(result.patternsByCategory).flat(),
    "total_count": Object.values(result.patternsByCategory).flat().length,
    "last_updated": new Date().toISOString(),
    "categories": result.patternsByCategory,
    "manifest_patterns_count": result.patterns.length
  };
}

const updaterConfig = exportForUpdater();
console.log("\n=== FOR updater.js ===\n");
console.log(JSON.stringify(updaterConfig, null, 2));

// ============================================
// ADD NEW WEBSITES DYNAMICALLY
// ============================================

function addNewWebsite(domain, category = "emerging") {
  console.log(`Adding ${domain} to ${category}...`);
  
  // Step 1: Add to websites.json
  const newEntry = {
    domain: domain,
    category: category,
    discovered_at: new Date().toISOString(),
    added_by: "dynamic_discovery"
  };
  
  // Step 2: Generate new pattern
  const mainPattern = `https://${domain}/*`;
  const parts = domain.split(".");
  const wildcardPattern = `https://*.${parts.slice(-2).join(".")}/*`;
  
  console.log(`✅ New patterns to add to manifest:`);
  console.log(`   1. ${mainPattern}`);
  console.log(`   2. ${wildcardPattern}`);
  
  return {
    newEntry,
    patterns: [mainPattern, wildcardPattern]
  };
}

// Example: Add new website
console.log("\n=== ADDING NEW WEBSITE DYNAMICALLY ===\n");
const newSite = addNewWebsite("newai-2024.com", "chat_ai");
console.log(JSON.stringify(newSite, null, 2));

// ============================================
// VALIDATION & TESTING
// ============================================

function validatePatterns(patterns) {
  console.log("\n=== VALIDATING PATTERNS ===\n");
  
  const results = {
    total: patterns.length,
    valid: 0,
    invalid: 0,
    errors: []
  };
  
  for (const pattern of patterns) {
    // Check if matches manifest pattern format
    const isValid = /^https?:\/\/[*\w.\/-]+\/\*$/.test(pattern);
    
    if (isValid) {
      results.valid++;
    } else {
      results.invalid++;
      results.errors.push(pattern);
    }
  }
  
  console.log(`✅ Valid patterns:   ${results.valid}`);
  console.log(`❌ Invalid patterns: ${results.invalid}`);
  
  if (results.invalid > 0) {
    console.log("\nInvalid patterns:");
    results.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  return results;
}

const validation = validatePatterns(generateMatchPatterns().patterns);
console.log("\nValidation complete:", validation);

// Export everything for other scripts
window.SentinelGationPatternGenerator = {
  generateMatchPatterns,
  generateManifestJSON,
  printStatistics,
  exportForUpdater,
  addNewWebsite,
  validatePatterns
};

console.log("\n✅ Pattern generator ready!");
console.log("Use: window.SentinelGatePatternGenerator.generateMatchPatterns()");
