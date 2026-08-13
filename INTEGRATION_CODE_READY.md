# 🚀 Integration Code Ready-to-Use

This file contains copy-paste ready code snippets to integrate the updater with scanner.js.

---

## 📌 Code Snippet 1: Update `evaluateSensitiveRisk()` Function

**Location:** `scanner.js` → Find `function evaluateSensitiveRisk(text)`

**Replace the entire function with:**

```javascript
async function evaluateSensitiveRisk(text) {
  let score = 0;
  const detectionDetails = [];
  
  if (!text) {
    return { score, detectionDetails, isSensitive: false };
  }

  console.log('[Scanner] Starting risk evaluation with live patterns...');

  try {
    // ===== STEP 1: Get live patterns from updater =====
    let patterns = null;
    
    if (window.SentinelGateUpdater) {
      try {
        patterns = await window.SentinelGateUpdater.getConfiguredPatterns();
        console.log('[Scanner] ✅ Loaded patterns from updater', patterns);
      } catch (err) {
        console.warn('[Scanner] ⚠️ Failed to get updater patterns, using defaults:', err);
        patterns = getDefaultPatterns();
      }
    } else {
      console.warn('[Scanner] Updater not available, using default patterns');
      patterns = getDefaultPatterns();
    }

    // ===== STEP 2: Check sensitive keywords (live) =====
    if (patterns.sensitive_keywords && Array.isArray(patterns.sensitive_keywords)) {
      for (const keyword of patterns.sensitive_keywords) {
        try {
          const regex = new RegExp(keyword.pattern, 'gi');
          if (regex.test(text)) {
            const riskScore = getRiskScore(keyword.risk);
            score += riskScore;
            detectionDetails.push({
              type: keyword.type || 'unknown',
              pattern: keyword.pattern,
              risk: keyword.risk,
              points: riskScore,
              source: 'keyword_pattern'
            });
            console.log(`[Scanner] ✓ Keyword matched: "${keyword.pattern}" (+${riskScore} pts)`);
          }
        } catch (err) {
          console.warn(`[Scanner] Invalid keyword regex: ${keyword.pattern}`, err);
        }
      }
    }

    // ===== STEP 3: Check regex patterns (live) =====
    if (patterns.regex_patterns && Array.isArray(patterns.regex_patterns)) {
      for (const regexPattern of patterns.regex_patterns) {
        try {
          const regex = new RegExp(regexPattern.regex, 'gi');
          if (regex.test(text)) {
            const riskScore = getRiskScore(regexPattern.risk);
            score += riskScore;
            detectionDetails.push({
              type: 'regex_match',
              name: regexPattern.name,
              pattern: regexPattern.regex,
              risk: regexPattern.risk,
              points: riskScore,
              source: 'regex_pattern'
            });
            console.log(`[Scanner] ✓ Regex matched: "${regexPattern.name}" (+${riskScore} pts)`);
          }
        } catch (err) {
          console.warn(`[Scanner] Invalid regex pattern: ${regexPattern.name}`, err);
        }
      }
    }

    // ===== STEP 4: Check real-time threats (GROK-STYLE!) =====
    if (patterns.real_time_threats && Array.isArray(patterns.real_time_threats)) {
      for (const threat of patterns.real_time_threats) {
        try {
          const regex = new RegExp(threat.pattern, 'gi');
          if (regex.test(text)) {
            const riskScore = getRiskScore(threat.risk);
            score += riskScore;
            detectionDetails.push({
              type: 'real_time_threat',
              id: threat.id,
              pattern: threat.pattern,
              risk: threat.risk,
              points: riskScore,
              source: threat.source || 'unknown',
              discovered: threat.discovered_at,
              critical: true
            });
            console.warn(
              `[Scanner] 🚨 REAL-TIME THREAT DETECTED: ${threat.id} - ${threat.pattern} (+${riskScore} pts)`
            );
          }
        } catch (err) {
          console.warn(`[Scanner] Invalid threat pattern: ${threat.id}`, err);
        }
      }
    }

    // ===== STEP 5: Determine if sensitive =====
    const isSensitive = score >= 7;
    console.log(
      `[Scanner] Risk Score: ${score}/20 ${isSensitive ? '⚠️ SENSITIVE' : '✅ SAFE'}`
    );
    console.log('[Scanner] Detection details:', detectionDetails);

    return {
      score,
      detectionDetails,
      isSensitive,
      threatCount: detectionDetails.filter(d => d.critical).length
    };
  } catch (error) {
    console.error('[Scanner] Error during risk evaluation:', error);
    return {
      score: 0,
      detectionDetails: [],
      isSensitive: false,
      error: error.message
    };
  }
}

// ===== Helper function: Convert risk level to score =====
function getRiskScore(riskLevel) {
  const scoreMap = {
    'critical': 8,
    'high': 6,
    'medium': 4,
    'low': 2,
    'info': 1
  };
  return scoreMap[riskLevel?.toLowerCase()] || 4;
}

// ===== Fallback patterns (if updater unavailable) =====
function getDefaultPatterns() {
  return {
    sensitive_keywords: [
      // ID Documents
      { pattern: 'aadhaar|aadhar|uidai', risk: 'high', type: 'id', description: 'Indian ID' },
      { pattern: 'voter|voter.?id', risk: 'high', type: 'id', description: 'Voter ID' },
      { pattern: 'pan|pan.?card', risk: 'high', type: 'id', description: 'PAN Card' },
      { pattern: 'passport', risk: 'high', type: 'id', description: 'Passport' },
      { pattern: 'driver.?license|dl', risk: 'high', type: 'id', description: 'Driver License' },
      { pattern: 'ssn|social.?security', risk: 'high', type: 'id', description: 'Social Security Number' },
      { pattern: 'birth.?certificate', risk: 'medium', type: 'id', description: 'Birth Certificate' },
      
      // Credentials
      { pattern: 'password', risk: 'critical', type: 'credential', description: 'Password' },
      { pattern: 'api.?key|apikey|api_key', risk: 'critical', type: 'credential', description: 'API Key' },
      { pattern: 'secret|access.?token|refresh.?token', risk: 'critical', type: 'credential', description: 'Secret/Token' },
      { pattern: 'jwt|bearer', risk: 'high', type: 'credential', description: 'Auth Token' },
      
      // Payment Info
      { pattern: 'credit.?card|debit.?card|card.?number', risk: 'critical', type: 'payment', description: 'Card' },
      { pattern: 'cvv|cvc|cvc2|cvv2', risk: 'critical', type: 'payment', description: 'Card CVV' },
      { pattern: 'bank.?account|routing.?number', risk: 'high', type: 'payment', description: 'Bank Account' }
    ],
    
    regex_patterns: [
      // Credit Card (16 digits with separators)
      {
        name: 'credit_card_16digit',
        regex: '\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}',
        risk: 'critical'
      },
      // SSN (XXX-XX-XXXX)
      {
        name: 'ssn_format',
        regex: '\\d{3}-\\d{2}-\\d{4}',
        risk: 'high'
      },
      // AWS Access Key
      {
        name: 'aws_access_key',
        regex: 'AKIA[0-9A-Z]{16}',
        risk: 'critical'
      },
      // Email
      {
        name: 'email_address',
        regex: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
        risk: 'medium'
      }
    ],
    
    real_time_threats: [] // Will be populated by updater
  };
}
```

---

## 📌 Code Snippet 2: Update `analyzeFiles()` Function

**Location:** `scanner.js` → Find `async function analyzeFiles(files)`

**Find this section:**
```javascript
// Check filename patterns
for (const file of allFiles) {
  const lowerFileName = file.name.toLowerCase();
  
  if (sensitiveFilenamePattern.test(lowerFileName)) {
    sensitiveFilesFound.push(file);
  }
}
```

**Replace with:**
```javascript
// ===== Get live patterns from updater =====
let filenamePatterns = null;
if (window.SentinelGateUpdater) {
  try {
    const livePatterns = await window.SentinelGateUpdater.getConfiguredPatterns();
    filenamePatterns = livePatterns.sensitive_keywords;
    console.log('[Scanner] Using live patterns for filename check');
  } catch (err) {
    console.warn('[Scanner] Failed to get live patterns:', err);
  }
}

// Check filename patterns (live or fallback)
for (const file of allFiles) {
  const lowerFileName = file.name.toLowerCase();
  
  // Try live patterns first
  if (filenamePatterns && Array.isArray(filenamePatterns)) {
    for (const keyword of filenamePatterns) {
      try {
        const regex = new RegExp(keyword.pattern, 'i');
        if (regex.test(lowerFileName)) {
          sensitiveFilesFound.push(file);
          console.log(`[Scanner] File "${file.name}" matched live pattern: ${keyword.pattern}`);
          break;
        }
      } catch (err) {
        console.warn(`Invalid filename pattern: ${keyword.pattern}`, err);
      }
    }
  } else {
    // Fallback to hardcoded pattern
    if (sensitiveFilenamePattern.test(lowerFileName)) {
      sensitiveFilesFound.push(file);
      console.log(`[Scanner] File "${file.name}" matched fallback pattern`);
    }
  }
}
```

---

## 📌 Code Snippet 3: Add to Content Script

**Location:** `content.js` → Add to top of file (after other initializations)

```javascript
// ===== Initialize Updater (Grok-style learning system) =====
console.log('[Content] Initializing SentinelGate Updater...');

if (typeof window !== 'undefined' && window.SentinelGateUpdater) {
  try {
    // Trigger immediate update
    window.SentinelGateUpdater.updateAll()
      .then(() => {
        console.log('[Content] ✅ Updater initialized successfully');
      })
      .catch(err => {
        console.warn('[Content] Updater initialization warning:', err);
        // Continue anyway - fallback patterns will be used
      });
  } catch (err) {
    console.error('[Content] Failed to initialize updater:', err);
  }
} else {
  console.warn('[Content] SentinelGateUpdater not available');
}

// ===== Listen for pattern updates =====
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.sentinelgate_config) {
    console.log('[Content] 📡 Patterns updated - live learning engaged!');
    console.log('Previous:', changes.sentinelgate_config.oldValue);
    console.log('New:', changes.sentinelgate_config.newValue);
  }
});
```

---

## 📌 Code Snippet 4: Update Manifest (if needed)

**Location:** `manifest.json` → Verify content_scripts order

**Should look like:**
```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["updater.js", "scanner.js", "content.js"],
      "run_at": "document_start"
    }
  ]
}
```

✅ Order critical: `updater.js` → `scanner.js` → `content.js`

---

## 🧪 Testing Code Snippet

**Paste in Chrome DevTools Console:**

```javascript
// ===== TEST 1: Check if updater loaded =====
console.log('=== TEST 1: Updater Check ===');
console.log('Updater available:', !!window.SentinelGateUpdater);
if (window.SentinelGateUpdater) {
  console.log('Methods:', Object.getOwnPropertyNames(window.SentinelGateUpdater));
}

// ===== TEST 2: Get current patterns =====
console.log('\n=== TEST 2: Get Current Patterns ===');
window.SentinelGateUpdater?.getConfiguredPatterns()
  .then(p => {
    console.log('Keywords:', p.sensitive_keywords?.length || 0);
    console.log('Regex patterns:', p.regex_patterns?.length || 0);
    console.log('Real-time threats:', p.real_time_threats?.length || 0);
  })
  .catch(e => console.error('Failed to get patterns:', e));

// ===== TEST 3: Force update =====
console.log('\n=== TEST 3: Force Update ===');
window.SentinelGateUpdater?.updateAll()
  .then(() => console.log('✅ Update completed'))
  .catch(e => console.error('⚠️ Update failed:', e));

// ===== TEST 4: Check for real-time threats =====
console.log('\n=== TEST 4: Real-Time Threats ===');
window.SentinelGateUpdater?.getConfiguredPatterns()
  .then(p => {
    const threats = p.real_time_threats || [];
    console.log(`Found ${threats.length} real-time threats`);
    threats.slice(0, 3).forEach(t => {
      console.log(`- [${t.risk}] ${t.pattern}`);
    });
  });

// ===== TEST 5: Get pattern by type =====
console.log('\n=== TEST 5: Get ID Patterns ===');
window.SentinelGateUpdater?.getPatternsByType('id')
  .then(p => console.log('ID patterns:', p))
  .catch(e => console.error('Failed:', e));
```

**Expected Output:**
```
=== TEST 1: Updater Check ===
Updater available: true
Methods: ["getConfiguredPatterns", "getPatternsByType", ...]

=== TEST 2: Get Current Patterns ===
Keywords: 15
Regex patterns: 5
Real-time threats: 3

=== TEST 3: Force Update ===
✅ Update completed

=== TEST 4: Real-Time Threats ===
Found 3 real-time threats
- [critical] jailbreak_prompt_.*
- [high] new_credential_format_
- [high] malicious_injection_.*
```

---

## 🎯 Integration Workflow

```
1. Replace evaluateSensitiveRisk() ────────┐
                                            │
2. Update analyzeFiles() ─────────────────────┤────→ DEPLOY
                                            │
3. Add initializer to content.js ──────────┘

4. Verify all tests pass
5. Monitor logs
6. Real-time threats auto-detected! 🚀
```

---

## ✅ Validation Checklist

After integration, verify:

- [ ] `evaluateSensitiveRisk()` uses `window.SentinelGateUpdater.getConfiguredPatterns()`
- [ ] `analyzeFiles()` checks live filename patterns
- [ ] `content.js` initializes updater on load
- [ ] Manifest has correct script order
- [ ] All browser console tests pass
- [ ] File upload triggers pattern check with console logs
- [ ] Real-time threats detected (test with DevTools)
- [ ] Fallback patterns work if updater fails
- [ ] No JavaScript errors in extension

---

## 🚀 Expected Behavior After Integration

**Before:** Extension blocks based on hardcoded patterns → New threats not detected

**After:**
1. Extension loads → Updater fetches live patterns (24h)
2. User uploads file → Scanner checks live patterns (real-time)
3. New threat discovered on Twitter/Reddit/honeypot
4. Updater fetches it within 1 hour
5. Next user upload → New threat instantly detected! ⚡

---

## Rollback (if needed)

If anything breaks, revert `evaluateSensitiveRisk()` to use only `getDefaultPatterns()`:

```javascript
// Emergency revert
const patterns = getDefaultPatterns(); // Don't await updater
// Rest of function stays same
```

This ensures extension always works with fallback patterns.

