/**
 * updater.js
 * Dynamic parameter updater for SentinelGate
 * 
 * Purpose: Fetch real-time sensitive patterns, websites, and parameters
 * Similar to: Grok's real-time Twitter knowledge
 */

(function () {
  // Configuration URLs (can point to your backend API)
  const CONFIG = {
    // Central repository for sensitivity patterns
    patternsCDN: "https://sentinelgate.example.com/api/patterns.json",
    
    // List of AI websites to protect
    websitesCDN: "https://sentinelgate.example.com/api/websites.json",
    
    // Real-time learned threats
    threatsAPI: "https://sentinelgate.example.com/api/threats",
    
    // Fallback: Local config if CDN unavailable
    updateInterval: 24 * 60 * 60 * 1000, // Update every 24 hours
    
    // Storage keys
    storageKey: "sentinelgate_config",
    lastUpdateKey: "sentinelgate_last_update"
  };

  // NOTE: Remote updates are disabled. CDN URLs above are placeholders (example.com).
  // To enable, deploy a real backend API and set ENABLE_REMOTE_UPDATES = true.
  const ENABLE_REMOTE_UPDATES = false;
  const usesPlaceholderCdn = [
    CONFIG.patternsCDN,
    CONFIG.websitesCDN,
    CONFIG.threatsAPI
  ].some((url) => url.includes("example.com"));

  function shouldFetchRemotely() {
    return ENABLE_REMOTE_UPDATES && !usesPlaceholderCdn;
  }

  // Default patterns (fallback if updater fails)
  const DEFAULT_PATTERNS = {
    sensitive_keywords: [
      { pattern: "aadhaar", risk: "high", type: "id" },
      { pattern: "voter", risk: "high", type: "id" },
      { pattern: "passport", risk: "high", type: "id" },
      { pattern: "credit_card", risk: "high", type: "payment" },
      { pattern: "api_key", risk: "critical", type: "credential" },
      { pattern: "private_key", risk: "critical", type: "credential" },
      { pattern: "aws_", risk: "critical", type: "credential" },
      { pattern: "database", risk: "medium", type: "infrastructure" }
    ],
    
    sensitive_fields: [
      { name: "ssn", risk: "high", type: "id" },
      { name: "phone", risk: "medium", type: "personal" },
      { name: "email", risk: "medium", type: "personal" },
      { name: "password", risk: "critical", type: "credential" },
      { name: "api_token", risk: "critical", type: "credential" },
      { name: "credit_card_number", risk: "high", type: "payment" },
      { name: "bank_account", risk: "high", type: "payment" }
    ],
    
    regex_patterns: [
      { name: "credit_card", regex: "\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}", risk: "high" },
      { name: "email", regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", risk: "medium" },
      { name: "phone", regex: "\\+?1?\\d{9,15}", risk: "medium" },
      { name: "ipv4", regex: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", risk: "low" },
      { name: "aws_key", regex: "AKIA[0-9A-Z]{16}", risk: "critical" },
      { name: "private_key", regex: "-----BEGIN.*PRIVATE KEY-----", risk: "critical" }
    ]
  };

  // Default websites (fallback)
  const DEFAULT_WEBSITES = {
    ai_chat: [
      { domain: "chatgpt.com", name: "ChatGPT", type: "text_generation" },
      { domain: "claude.ai", name: "Claude", type: "text_generation" },
      { domain: "gemini.google.com", name: "Gemini", type: "text_generation" },
      { domain: "copilot.microsoft.com", name: "Copilot", type: "text_generation" },
      { domain: "huggingface.co", name: "HuggingFace", type: "model_hub" },
      { domain: "perplexity.ai", name: "Perplexity", type: "search_ai" }
    ],
    
    emerging_ai: [
      // These would be auto-discovered
    ]
  };

  /**
   * Fetch latest patterns from CDN/API
   * This replaces the hardcoded patterns with live data
   */
  async function fetchLatestPatterns() {
    if (!shouldFetchRemotely()) {
      const stored = await chrome.storage.local.get(CONFIG.storageKey);
      return stored[CONFIG.storageKey] || DEFAULT_PATTERNS;
    }

    try {
      // Try to fetch from CDN
      const response = await fetch(CONFIG.patternsCDN, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        // No credentials due to CORS - would be backend-managed
      });

      if (response.ok) {
        const patterns = await response.json();
        
        // Save to storage
        await chrome.storage.local.set({
          [CONFIG.storageKey]: patterns,
          [CONFIG.lastUpdateKey]: new Date().toISOString()
        });
        
        return patterns;
      }
    } catch (error) {}

    // Fallback to stored patterns or defaults
    const stored = await chrome.storage.local.get(CONFIG.storageKey);
    return stored[CONFIG.storageKey] || DEFAULT_PATTERNS;
  }

  /**
   * Discover new AI websites from the web
   * Scans for patterns like "new AI tool", "AI chat platform"
   */
  async function discoverNewWebsites() {
    if (!shouldFetchRemotely()) {
      return DEFAULT_WEBSITES;
    }

    try {
      const response = await fetch(CONFIG.websitesCDN);
      if (response.ok) {
        const websites = await response.json();
        return websites;
      }
    } catch (error) {}

    return DEFAULT_WEBSITES;
  }

  /**
   * Learn new threats from real-world data
   * Similar to Grok learning from Twitter in real-time
   */
  async function fetchRealTimeThreats() {
    if (!shouldFetchRemotely()) {
      return await getConfiguredPatterns();
    }

    try {
      const response = await fetch(`${CONFIG.threatsAPI}?limit=100&recent=true`);
      if (response.ok) {
        const threats = await response.json();
        // Merge with existing patterns
        const current = await getConfiguredPatterns();
        const merged = mergeThreats(current, threats);
        
        await chrome.storage.local.set({
          [CONFIG.storageKey]: merged
        });
        
        return merged;
      }
    } catch (error) {}

    return await getConfiguredPatterns();
  }

  /**
   * Merge new threats with existing patterns
   */
  function mergeThreats(current, newThreats) {
    return {
      ...current,
      real_time_threats: [
        ...(current.real_time_threats || []),
        ...newThreats.filter(threat => !current.real_time_threats?.some(t => t.id === threat.id))
      ],
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Get current configured patterns
   * (Used by scanner.js)
   */
  async function getConfiguredPatterns() {
    const stored = await chrome.storage.local.get(CONFIG.storageKey);
    return stored[CONFIG.storageKey] || DEFAULT_PATTERNS;
  }

  /**
   * Initialization update sequence.
   * Runs exactly once per injection to fetch updates if configured.
   */
  function startInitialUpdates() {
    // Update immediately on load.
    updateAll();
  }

  /**
   * Execute all updates
   */
  async function updateAll() {
    try {
      // Parallel updates for speed
      await Promise.all([
        fetchLatestPatterns(),
        discoverNewWebsites(),
        fetchRealTimeThreats()
      ]);
    } catch (error) {
      // Silence errors for local/dev builds
    }
  }

  /**
   * Query patterns by type
   * Usage: getPatternsByType("id") → returns all ID-related patterns
   */
  async function getPatternsByType(type) {
    const patterns = await getConfiguredPatterns();
    return patterns.sensitive_keywords?.filter(p => p.type === type) || [];
  }

  /**
   * Check if a string matches real-time threats
   * Usage: isRealTimeThreat("malicious_domain.com")
   */
  async function isRealTimeThreat(value) {
    const patterns = await getConfiguredPatterns();
    const threats = patterns.real_time_threats || [];
    
    return threats.some(threat => {
      try {
        const regex = new RegExp(threat.pattern, 'i');
        return regex.test(value);
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Get all supported websites
   * Used to dynamically update manifest
   */
  async function getSupportedWebsites() {
    const websites = await discoverNewWebsites();
    return [
      ...websites.ai_chat.map(w => w.domain),
      ...websites.emerging_ai.map(w => w.domain)
    ];
  }

  // Export API
  window.SentinelGateUpdater = {
    // Config access
    getConfiguredPatterns,
    getPatternsByType,
    getSupportedWebsites,
    isRealTimeThreat,
    
    // Manual updates
    updateAll,
    fetchLatestPatterns,
    discoverNewWebsites,
    fetchRealTimeThreats,
    
    // Status
    getLastUpdateTime: async () => {
      const data = await chrome.storage.local.get(CONFIG.lastUpdateKey);
      return data[CONFIG.lastUpdateKey];
    }
  };

  // Start configuration updates when extension loads
  startInitialUpdates();
})();
