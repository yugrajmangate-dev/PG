# 🔌 Integration Checklist: Connecting Updater to Scanner

## Current Status
- ✅ updater.js created (live learning system)
- ✅ manifest.json updated (correct script loading order)
- ⏳ **TODO: Connect scanner.js to use live patterns**

---

## Step 1: Modify `analyzeFiles()` in scanner.js

### Before:
```javascript
async function analyzeFiles(files) {
  // ... existing code ...
  
  for (const file of files) {
    const fileName = file.name.toLowerCase();
    
    // Using HARDCODED patterns
    if (/aadhaar|aadhar|uidai/.test(fileName)) {
      sensitiveFilesFound.push(file);
    }
  }
}
```

### After:
```javascript
async function analyzeFiles(files) {
  // ... existing code ...
  
  // Get LIVE patterns from updater
  const patterns = await window.SentinelGateUpdater?.getConfiguredPatterns() || getDefaultPatterns();
  
  for (const file of files) {
    const fileName = file.name.toLowerCase();
    
    // Check against LIVE patterns (updates every 24 hours)
    if (patterns.sensitive_keywords) {
      for (const keyword of patterns.sensitive_keywords) {
        try {
          const regex = new RegExp(keyword.pattern, 'i');
          if (regex.test(fileName)) {
            sensitiveFilesFound.push(file);
            console.log(`[Scanner] File matched live pattern: ${keyword.pattern}`);
            break;
          }
        } catch (e) {
          console.warn(`Invalid regex: ${keyword.pattern}`, e);
        }
      }
    }
  }
}
```

---

## Step 2: Modify `evaluateSensitiveRisk()` in scanner.js

### Before:
```javascript
function evaluateSensitiveRisk(text) {
  let score = 0;
  const detectionDetails = [];
  
  // Hardcoded patterns
  if (text && /aadhaar|aadhar|uidai|voter|pan|aadhar|driver.?license/i.test(text)) {
    score += 4;
    detectionDetails.push('id_document');
  }
  
  if (text && /password|api.?key|secret|token|credential/i.test(text)) {
    score += 4;
    detectionDetails.push('credential');
  }
  
  // ... more hardcoded checks ...
  
  return { score, detectionDetails };
}
```

### After:
```javascript
async function evaluateSensitiveRisk(text) {
  let score = 0;
  const detectionDetails = [];
  
  // Get LIVE patterns from updater
  const patterns = await window.SentinelGateUpdater?.getConfiguredPatterns() || getDefaultPatterns();
  
  if (!text) return { score, detectionDetails };
  
  // Check against LIVE sensitive keywords
  if (patterns.sensitive_keywords) {
    for (const keyword of patterns.sensitive_keywords) {
      try {
        const regex = new RegExp(keyword.pattern, 'i');
        if (regex.test(text)) {
          const riskScore = getRiskScore(keyword.risk);
          score += riskScore;
          detectionDetails.push({
            type: keyword.type,
            pattern: keyword.pattern,
            risk: keyword.risk,
            points: riskScore
          });
          console.log(`[Scanner] Text matched live pattern: ${keyword.pattern} (+${riskScore})`);
        }
      } catch (e) {
        console.warn(`Invalid regex: ${keyword.pattern}`, e);
      }
    }
  }
  
  // Check against LIVE regex patterns (more complex)
  if (patterns.regex_patterns) {
    for (const regexPattern of patterns.regex_patterns) {
      try {
        const regex = new RegExp(regexPattern.regex, 'i');
        if (regex.test(text)) {
          const riskScore = getRiskScore(regexPattern.risk);
          score += riskScore;
          detectionDetails.push({
            type: 'regex_match',
            name: regexPattern.name,
            risk: regexPattern.risk,
            points: riskScore
          });
        }
      } catch (e) {
        console.warn(`Invalid regex pattern: ${regexPattern.name}`, e);
      }
    }
  }
  
  // Check against REAL-TIME threats (Grok-style!)
  if (patterns.real_time_threats) {
    for (const threat of patterns.real_time_threats) {
      try {
        const regex = new RegExp(threat.pattern, 'i');
        if (regex.test(text)) {
          const riskScore = getRiskScore(threat.risk);
          score += riskScore;
          detectionDetails.push({
            type: 'real_time_threat',
            id: threat.id,
            risk: threat.risk,
            points: riskScore,
            source: threat.source,
            discovered: threat.discovered_at
          });
          console.warn(`[Scanner] ⚠️ REAL-TIME THREAT DETECTED: ${threat.id}`);
        }
      } catch (e) {
        console.warn(`Invalid threat pattern: ${threat.id}`, e);
      }
    }
  }
  
  return { score, detectionDetails };
}

// Helper function to convert risk level to score
function getRiskScore(riskLevel) {
  const scores = {
    'low': 2,
    'medium': 4,
    'high': 6,
    'critical': 8
  };
  return scores[riskLevel] || 4;
}
```

---

## Step 3: Add Fallback Patterns (if Updater Fails)

```javascript
// Add this function to scanner.js
function getDefaultPatterns() {
  return {
    sensitive_keywords: [
      { pattern: 'aadhaar|aadhar|uidai', risk: 'high', type: 'id' },
      { pattern: 'voter|pan|driver.?license', risk: 'high', type: 'id' },
      { pattern: 'passport|birth.?certificate', risk: 'high', type: 'id' },
      { pattern: 'password|api.?key|secret|token', risk: 'critical', type: 'credential' },
      { pattern: 'credit.?card|debit.?card', risk: 'critical', type: 'payment' }
    ],
    regex_patterns: [
      { name: 'credit_card_full', regex: '\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}', risk: 'high' },
      { name: 'ssn', regex: '\\d{3}-\\d{2}-\\d{4}', risk: 'high' }
    ],
    real_time_threats: []
  };
}
```

---

## Step 4: Ensure Updater Initialization

Add this to the top of `content.js`:

```javascript
// Ensure updater is ready before scanner runs
if (window.SentinelGateUpdater) {
  // Trigger immediate update if not done in last hour
  window.SentinelGateUpdater.updateAll().catch(err => {
    console.warn('[Updater] Could not update immediately:', err);
  });
} else {
  console.warn('[Scanner] Updater not loaded yet');
}
```

---

## Step 5: Test Integration

### Manual Test 1: Check Pattern Loading
```javascript
// In DevTools console:
const patterns = await window.SentinelGateUpdater.getConfiguredPatterns();
console.log('Loaded patterns:', patterns);
// Should show: sensitive_keywords[], regex_patterns[], real_time_threats[]
```

### Manual Test 2: Force Update & Verify
```javascript
// In DevTools console:
await window.SentinelGateUpdater.updateAll();
const updated = await window.SentinelGateUpdater.getConfiguredPatterns();
console.log('After update:', updated);
```

### Manual Test 3: Test with File Upload
1. Upload file named `aadhaar_2024.jpg` 
   - Should check against LIVE patterns
   - Should block if pattern in `sensitive_keywords`
2. Check console for: `[Scanner] File matched live pattern: ...`

### Manual Test 4: Check for Real-Time Threats
```javascript
// Manually add a threat to test
const threats = await window.SentinelGateUpdater.getConfiguredPatterns();
console.log('Real-time threats:', threats.real_time_threats);
```

---

## Step 6: Deploy & Monitor

### Deploy Steps:
1. ✅ Update scanner.js with new functions
2. ✅ Test locally with manual file uploads
3. ✅ Check Chrome DevTools logs for pattern matches
4. ✅ Push to production
5. ✅ Monitor: Verify users are getting updated patterns

### Monitor Metrics:
- Pattern update success rate (aim: >99%)
- Time to detect real-time threats (aim: <1 minute)
- User uploads blocked per day
- False positive rate (should be <5%)

---

## Before/After Comparison

### OLD (Hardcoded):
```
User uploads file → Scanner checks hardcoded patterns → Blocks if match
```
**Problem:** New threats not detected, needs code change to add patterns

### NEW (Live Learning - Grok-Style):
```
User uploads file → Updater fetches latest patterns (24h) → Scanner checks 
                      real-time threats (live) → Blocks if match
```
**Benefit:** New threats detected in minutes, zero code changes needed! 🚀

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scanner.js` | Replace hardcoded patterns with updater calls | ⚠️ HIGH |
| `content.js` | Add updater initialization check | 🟡 MEDIUM |
| `manifest.json` | Already updated ✅ | - |
| `updater.js` | Already created ✅ | - |

---

## Success Criteria

✅ Scanner loads live patterns on extension startup
✅ Real-time threats detected immediately after updater fetch
✅ New AI websites auto-protected without redeployment
✅ Fallback patterns work if updater fails
✅ Console logs show pattern matching
✅ Zero false positives
✅ 100% backward compatibility

---

## Rollback Plan (if needed)

```javascript
// Revert scanner.js to getDefaultPatterns() only:
async function evaluateSensitiveRisk(text) {
  const patterns = getDefaultPatterns(); // Uses local only
  // ... rest of code ...
}
```

This ensures extension works even if updater breaks.

---

## Timeline

| Step | Est. Time | Status |
|------|-----------|--------|
| Update scanner.js | 30 min | ⏳ |
| Add fallback patterns | 15 min | ⏳ |
| Local testing | 1 hour | ⏳ |
| Deploy | 10 min | ⏳ |
| Monitor (24h) | 1 day | ⏳ |
| **Total** | **~2 hours** | ⏳ |

---

## Questions Before Starting?

- ❓ Should we test local patterns before connecting to real API?
- ❓ Want to add logging/telemetry for pattern matches?
- ❓ Need rate limiting on API calls?
- ❓ Should threats auto-expire after TTL (time-to-live)?
