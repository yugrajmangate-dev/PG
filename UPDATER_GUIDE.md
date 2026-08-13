# 🔄 SentinelGate Dynamic Updater System

## Overview

The **SentinelGate Updater** is a real-time parameter detection and learning system - similar to how **Grok learns from Twitter** but for sensitive data patterns.

Instead of hardcoding patterns, it:
- ✅ Fetches fresh patterns from a CDN/API
- ✅ Discovers new AI websites automatically
- ✅ Learns real-time threats from the web
- ✅ Updates without needing extension reinstall

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│           SentinelGate Extension                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  updater.js (NEW - Real-time learning)              │
│  ├─ fetchLatestPatterns() → CDN/API                 │
│  ├─ discoverNewWebsites() → Auto-detect AI tools    │
│  ├─ fetchRealTimethreats() → Live threat feed       │
│  └─ Stores in Chrome Storage                        │
│         ↓                                            │
│  scanner.js (Uses live patterns)                    │
│  ├─ analyzeFiles()                                  │
│  ├─ evaluateSensitiveRisk()                         │
│  └─ Queries updater for patterns                    │
│         ↓                                            │
│  content.js (Shows warnings)                        │
│  └─ Uses detected threats                           │
│                                                      │
└─────────────────────────────────────────────────────┘
        ↓
   Chrome Storage (Local)
   ├─ sentinelgate_config (patterns, websites, threats)
   └─ sentinelgate_last_update (timestamp)
```

---

## 📡 How It Updates Parameters

### **1. Fetch Latest Patterns (Every 24 Hours)**

```javascript
// updater.js calls this automatically
fetchLatestPatterns() 
→ Fetches from: https://sentinelgate.example.com/api/patterns.json
→ Format:
{
  "version": "2024.03.28",
  "sensitive_keywords": [
    { "pattern": "aadhaar", "risk": "high", "type": "id" },
    { "pattern": "crypto_wallet", "risk": "critical", "type": "payment" },
    { "pattern": "jwt_token", "risk": "critical", "type": "credential" }
  ],
  "sensitive_fields": [...],
  "regex_patterns": [...]
}
→ Stored in Chrome Storage
```

### **2. Discover New AI Websites**

```javascript
discoverNewWebsites()
→ Fetches: https://sentinelgate.example.com/api/websites.json
→ Format:
{
  "ai_chat": [
    { "domain": "chatgpt.com", "name": "ChatGPT" },
    { "domain": "claude.ai", "name": "Claude" }
  ],
  "emerging_ai": [
    { "domain": "newai-2024.com", "name": "New AI Tool" }
  ]
}
→ Extension automatically protects these domains
```

### **3. Real-Time Threat Learning (Grok-Style)**

```javascript
fetchRealTimethreats() 
→ Fetches: https://sentinelgate.example.com/api/threats?recent=true
→ Format:
[
  {
    "id": "threat_2024_001",
    "pattern": "malicious_prompt_injection",
    "type": "attack",
    "risk": "high",
    "discovered_at": "2024-03-28T10:00:00Z",
    "source": "reddit|twitter|github|honeypot"
  },
  {
    "id": "threat_2024_002",
    "pattern": "new_credential_format_.*",
    "type": "credential",
    "risk": "critical"
  }
]
→ Merged into scanning patterns
→ Scanner instantly detects new threats
```

---

## 🔌 How Scanner Uses Live Patterns

### **OLD WAY (Hardcoded):**
```javascript
// scanner.js - BEFORE
const OCR_DOC_PATTERNS = {
  aadhaarKeyword: /(aadhaar|aadhar|uidai)/i,
  // Static - never updates
};

function evaluateSensitiveRisk(text) {
  // Uses hardcoded patterns
  if (OCR_DOC_PATTERNS.aadhaarKeyword.test(text)) {
    score += 4;
  }
}
```

### **NEW WAY (Dynamic):**
```javascript
// scanner.js - AFTER
async function evaluateSensitiveRisk(text) {
  // Get live patterns from updater
  const patterns = await window.SentinelGateUpdater.getConfiguredPatterns();
  
  // Check all current patterns (updates automatically)
  for (const keyword of patterns.sensitive_keywords) {
    const regex = new RegExp(keyword.pattern, 'i');
    if (regex.test(text)) {
      score += getRiskScore(keyword.risk);
      hits.push(keyword.type);
    }
  }
  
  // Check real-time threats
  for (const threat of patterns.real_time_threats || []) {
    if (isRealTimeThreat(text, threat)) {
      score += 8; // High priority
      hits.push("real_time_threat");
    }
  }
  
  return { score, matchesFound: hits, isSensitive: score >= 7 };
}
```

---

## 📊 Data Flow: How Parameters Update

```
Timeline:
┌──────────────────────────────────────────────────────────┐
│                                                           │
│  12:00 AM (Day 1)                                        │
│  ├─ Extension loads                                      │
│  ├─ updater.js runs fetchLatestPatterns()                │
│  ├─ Downloads 150 patterns                               │
│  └─ Stores in Chrome Storage                             │
│                                                           │
│  2:00 PM (Day 1)                                         │
│  ├─ New threat discovered: "jailbreak_prompt_v2"         │
│  ├─ Posted on Reddit/Twitter                            │
│  ├─ Honeypot catches it                                  │
│  └─ Threat feed API adds to database                     │
│                                                           │
│  Next Page Load (Day 1 - 5:00 PM)                       │
│  ├─ Content script runs updater.js                       │
│  ├─ fetchRealTimethreats() called                        │
│  ├─ Gets new threat "jailbreak_prompt_v2"               │
│  ├─ Merges into patterns                                 │
│  └─ Stores updated config                                │
│                                                           │
│  User Upload (Day 1 - 5:30 PM)                          │
│  ├─ analyzer calls getConfiguredPatterns()               │
│  ├─ Gets updated patterns INCLUDING new threat           │
│  ├─ Text contains "jailbreak_prompt_v2"                 │
│  ├─ INSTANTLY DETECTED & BLOCKED                         │
│  └─ Popup shown: "Real-time threat detected"             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Usage Examples

### **1. Manual Update (Force Refresh)**
```javascript
// In Chrome DevTools console:
await window.SentinelGateUpdater.updateAll();
// Fetches latest patterns, websites, and threats NOW
```

### **2. Get Patterns by Type**
```javascript
// Get all ID-related patterns
const idPatterns = await window.SentinelGateUpdater.getPatternsByType("id");
// Returns: [
//   { pattern: "aadhaar", risk: "high", type: "id" },
//   { pattern: "voter", risk: "high", type: "id" },
//   { pattern: "passport", risk: "high", type: "id" }
// ]
```

### **3. Check for Real-Time Threats**
```javascript
const userInput = "Here's a jailbreak_prompt_v2 attack";
const isThreating = await window.SentinelGateUpdater.isRealTimeThreat(userInput);
if (isThreat) {
  showWarning("Real-time threat detected!");
}
```

### **4. Auto-Update Integration**
```javascript
// Every 24 hours, automatically:
// ✅ Fetch new patterns
// ✅ Discover new AI websites
// ✅ Learn new threats
// ✅ Update stored config
// ✅ Scanner automatically uses new data
```

---

## 🔐 What Gets Updated

| Component | Update Frequency | Source | Live? |
|-----------|------------------|--------|-------|
| Sensitive Keywords | 24 hours | CDN/API | ✅ Yes |
| Regex Patterns | 24 hours | CDN/API | ✅ Yes |
| AI Websites | 24 hours | CDN/API | ✅ Yes |
| Real-Time Threats | On Page Load | Threat Feed API | ✅ Yes |
| Risk Scores | On Update | CDN/API | ✅ Yes |

---

## 📝 Backend API Structure (What You Need to Create)

### **1. `/api/patterns.json` Endpoint**
```json
{
  "version": "2024.03.28",
  "updated_at": "2024-03-28T14:30:00Z",
  "sensitive_keywords": [
    { "pattern": "aadhaar", "risk": "high", "type": "id", "description": "Indian ID" },
    { "pattern": "ssn", "risk": "high", "type": "id", "description": "Social Security Number" }
  ],
  "sensitive_fields": [
    { "name": "password", "risk": "critical", "type": "credential" },
    { "name": "api_key", "risk": "critical", "type": "credential" }
  ],
  "regex_patterns": [
    { "name": "credit_card", "regex": "\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}", "risk": "high" },
    { "name": "aws_key", "regex": "AKIA[0-9A-Z]{16}", "risk": "critical" }
  ]
}
```

### **2. `/api/websites.json` Endpoint**
```json
{
  "ai_chat": [
    { "domain": "chatgpt.com", "name": "ChatGPT", "type": "text_generation", "risk_level": "medium" },
    { "domain": "claude.ai", "name": "Claude", "type": "text_generation", "risk_level": "medium" }
  ],
  "emerging_ai": [
    { "domain": "grok.x.ai", "name": "Grok", "type": "real_time_ai", "risk_level": "medium" },
    { "domain": "llama2-chat.com", "name": "Llama 2 Chat", "type": "text_generation", "risk_level": "high" }
  ]
}
```

### **3. `/api/threats` Endpoint**
```json
[
  {
    "id": "threat_2024_001",
    "pattern": "jailbreak_prompt_.*",
    "risk": "critical",
    "type": "attack",
    "discovered_at": "2024-03-28T10:00:00Z",
    "source": ["reddit", "twitter", "honeypot"],
    "description": "New jailbreak prompt variant detected in the wild",
    "action": "block_immediately",
    "ttl_days": 7
  },
  {
    "id": "threat_2024_002",
    "pattern": "new_credential_format_",
    "risk": "high",
    "type": "credential",
    "discovered_at": "2024-03-28T12:00:00Z"
  }
]
```

---

## ✅ Benefits Over Hardcoded Approach

| Feature | Hardcoded | Updater |
|---------|-----------|---------|
| Update frequency | Manual (weeks) | Automatic (daily) |
| Real-time threats | ❌ No | ✅ Yes |
| New websites | Manual update required | ✅ Auto-discovered |
| Zero-day response | Minutes to weeks | ⚡ Seconds |
| User action needed | Reinstall extension | ✅ None |
| Learning capability | ❌ No | ✅ Yes |
| Scale | Fixed | ✅ Dynamic |

---

## 🎯 Next Steps

1. ✅ **updater.js created** - Real-time learning engine
2. 📝 **Create backend APIs** to serve patterns/websites/threats
3. 🔧 **Integrate with scanner.js** - Use live patterns
4. 📊 **Set up honeypots** - Catch emerging threats
5. 🌐 **Auto-update manifest** - Add new websites dynamically

This makes your extension like **Grok but for credential protection** - always learning, always updating! 🚀
