"use strict";
(() => {
  // src/categories.ts
  var platformRules = [
    // Meteora's dynamic bonding curve is a separate product from its AMM pools.
    { id: "dynamicbc", label: "Dynamic BC", color: "#f59e0b", pattern: /meteora-?dbc|dynamic|\bdbc\b/i },
    { id: "meteora", label: "Meteora", color: "#38bdf8", pattern: /meteora|dlmm/i },
    // Raydium's launchpad is listed separately from its AMM pools.
    { id: "launchlab", label: "LaunchLab", color: "#818cf8", pattern: /launchlab|launch-?lab/i },
    { id: "raydium", label: "Raydium", color: "#a78bfa", pattern: /raydium|cpmm|gamma/i },
    // Pump family: the AMM came after the launchpad.
    { id: "pumpswap", label: "PumpSwap", color: "#fb923c", pattern: /pumpswap|pump-?swap|pump-?amm/i },
    { id: "pumpfun", label: "pump.fun", color: "#f97316", pattern: /pump/i },
    { id: "orca", label: "Orca", color: "#22d3ee", pattern: /orca|whirlpool/i },
    // Bonkers before bonk, or the substring would steal it.
    { id: "bonkers", label: "Bonkers", color: "#fbbf24", pattern: /bonkers/i },
    { id: "bonk", label: "Bonk", color: "#facc15", pattern: /bonk|letsbonk/i },
    { id: "liquidaf", label: "LiquidAF AMM", color: "#2dd4bf", pattern: /liquidaf|liquid-?af/i },
    { id: "liquid", label: "Liquid", color: "#34d399", pattern: /liquid/i },
    { id: "moonshot", label: "Moonshot", color: "#f43f5e", pattern: /moonshot/i },
    { id: "moonit", label: "Moonit", color: "#fb7185", pattern: /moonit/i },
    { id: "boop", label: "Boop", color: "#fb7185", pattern: /boop/i },
    { id: "believe", label: "Believe", color: "#34d399", pattern: /believe/i },
    { id: "bags", label: "Bags", color: "#22c55e", pattern: /bags/i },
    { id: "heaven", label: "Heaven", color: "#7dd3fc", pattern: /heaven/i },
    { id: "sugar", label: "Sugar", color: "#f472b6", pattern: /sugar/i },
    { id: "candle", label: "Candle", color: "#fb923c", pattern: /candle/i },
    { id: "mayhem", label: "Mayhem", color: "#ef4444", pattern: /mayhem/i },
    { id: "surge", label: "Surge", color: "#a3e635", pattern: /surge/i },
    { id: "soar", label: "Soar", color: "#38bdf8", pattern: /soar/i },
    { id: "borderless", label: "Borderless", color: "#c084fc", pattern: /borderless/i },
    { id: "daos", label: "Daos.fun", color: "#60a5fa", pattern: /daos/i },
    { id: "printr", label: "Printr", color: "#94a3b8", pattern: /printr/i },
    { id: "riserich", label: "Rise Rich", color: "#f59e0b", pattern: /rise-?rich|riserich/i },
    { id: "stonk", label: "Stonk.fun", color: "#4ade80", pattern: /stonk/i },
    { id: "usepaid", label: "UsePaid", color: "#c084fc", pattern: /usepaid|use-?pa?id|\bpaid\b/i },
    { id: "jupiter", label: "Jupiter Studio", color: "#22d3ee", pattern: /jupiter/i },
    { id: "pancake", label: "PancakeSwap", color: "#facc15", pattern: /pancake/i }
  ];
  var knownPlatforms = platformRules.map(({ id, label, color }) => ({ id, label, color }));
  var categoryRules = [
    { id: "charity", label: "Charity", color: "#f472b6", pattern: /(charity|charitable|donat|relief|nonprofit|non-profit|giveaway|orphan|water-well)/i },
    { id: "ai", label: "AI", color: "#38bdf8", pattern: /(\bai\b|agent|neural|gpt|llm|\bagi\b|openai|autonomous)/i },
    { id: "elon", label: "Elon", color: "#a78bfa", pattern: /(elon|musk|tesla|doge|spacex|\bxai\b|groq)/i },
    { id: "trump", label: "Trump", color: "#ef4444", pattern: /(trump|maga)/i }
  ];
  var titleCase = (value) => value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  function tokenTags(token) {
    const tags = [];
    const dex = (token.dexName ?? "").trim();
    if (dex) {
      const rule = platformRules.find((candidate) => candidate.pattern.test(dex));
      tags.push(rule ? { id: rule.id, label: rule.label, color: rule.color, kind: "platform" } : { id: `dex:${dex.toLowerCase()}`, label: titleCase(dex), color: "#7d97a6", kind: "platform" });
    }
    const haystack = `${token.name} ${token.symbol}`;
    for (const rule of categoryRules) {
      if (rule.pattern.test(haystack)) tags.push({ id: rule.id, label: rule.label, color: rule.color, kind: "category" });
    }
    return tags;
  }

  // src/ui.ts
  var extensionApi = globalThis.chrome;
  function hasCriticalFlag(a) {
    return a.critical.length > 0 || a.status === "HIGH RISK" || (a.token.priceChange5mPct ?? 0) <= -25;
  }
  function hasEntryCaution(a, settings2) {
    return a.token.liquidityUsd !== null && a.token.liquidityUsd < settings2.minLiquidityUsd || a.slippagePct !== null && a.slippagePct > settings2.maxSlippagePct;
  }
  function signalClass(a, settings2) {
    if (hasCriticalFlag(a)) return "signal-red";
    if (hasEntryCaution(a, settings2)) return "signal-amber";
    if (a.status === "TOP CANDIDATE") return "signal-green";
    if (a.status === "WATCH") return "signal-amber";
    return "signal-gray";
  }

  // src/attention.ts
  var runningTurnover = 1;
  var activeTurnover = 0.25;
  function turnoverRatio(token, a) {
    const volume = a.volume5m;
    if (!Number.isFinite(volume) || volume <= 0) return null;
    const base = token.liquidityUsd !== null && token.liquidityUsd > 0 ? token.liquidityUsd : token.marketCapUsd;
    if (base === null || base === void 0 || base <= 0) return null;
    return volume / base;
  }
  var multipleLabel = (turnover) => turnover >= 10 ? `${Math.round(turnover)}\xD7` : `${turnover.toFixed(1)}\xD7`;
  function movementVerdict(token, a) {
    if (a.volume5m === 0) return { level: "QUIET", turnover: null, detail: "No 5m volume at all" };
    const turnover = turnoverRatio(token, a);
    if (turnover === null) return { level: "QUIET", turnover: null, detail: "No pool size to measure volume against" };
    const detail = `${usdShort(a.volume5m)} of 5m volume, ${multipleLabel(turnover)} the pool`;
    if (turnover >= runningTurnover) return { level: "RUNNING", turnover, detail };
    if (turnover >= activeTurnover) return { level: "ACTIVE", turnover, detail };
    return { level: "QUIET", turnover, detail };
  }
  function runningWithoutVerdict(a, settings2) {
    if (signalClass(a, settings2) !== "signal-gray") return false;
    return movementVerdict(a.token, a.analytics).level === "RUNNING";
  }
  var hotBuyers5m = 12;
  var hotBuys5m = 20;
  var hotBuyRatio = 1.5;
  function hotCoin(a, settings2) {
    if (a.status !== "TOP CANDIDATE" && a.status !== "WATCH") return null;
    if (hasCriticalFlag(a)) return null;
    if (hasEntryCaution(a, settings2)) return null;
    const { buyers5m, buys5m, sells5m } = a.analytics;
    if (buyers5m === null || buyers5m < hotBuyers5m || buys5m < hotBuys5m) return null;
    if (buys5m < sells5m * hotBuyRatio) return null;
    const volume = volumeVerdict(a.token, a.analytics);
    if (volume.level !== "HIGH") return null;
    return { label: "HOT", detail: `${buyers5m} unique buyers, ${buys5m} buys \xB7 ${volume.detail}` };
  }
  var usdShort = (value) => value >= 1e3 ? `$${(value / 1e3).toFixed(1)}K` : `$${value.toFixed(value < 1 ? 4 : 0)}`;
  function volumeVerdict(token, a) {
    const volume = a.volume5m;
    if (!Number.isFinite(volume) || volume <= 0) return { level: "UNKNOWN", tone: "neutral", detail: "No recent 5m volume data" };
    const hasLiquidity = token.liquidityUsd !== null && token.liquidityUsd > 0;
    const base = hasLiquidity ? token.liquidityUsd : token.marketCapUsd;
    if (base === null || base === void 0 || base <= 0) {
      return { level: "UNKNOWN", tone: "neutral", detail: `${usdShort(volume)} 5m volume (no liquidity baseline)` };
    }
    const ratio = volume / base;
    const detail = `${usdShort(volume)} 5m volume \xB7 ${Math.round(ratio * 100)}% of ${hasLiquidity ? "liquidity" : "market cap"}`;
    if (ratio >= 0.25) return { level: "HIGH", tone: "green", detail };
    if (ratio >= 0.05) return { level: "MODERATE", tone: "amber", detail };
    return { level: "LOW", tone: "red", detail };
  }

  // src/dex.ts
  var mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  // src/pulseRows.ts
  var signalClasses = ["scout-pulse-green", "scout-pulse-amber", "scout-pulse-red", "scout-pulse-gray", "scout-pulse-run", "scout-pulse-neutral"];
  var hotClass = "scout-pulse-hot";
  function applyPulseSignals(rows, assessments, settings2, now = Date.now()) {
    const byMint = /* @__PURE__ */ new Map();
    for (const assessment of assessments) {
      if (!mintPattern.test(assessment.token.mint) || assessment.token.provider === "SIMULATED DEMO") continue;
      if (assessment.token.observedAt > now + 6e4 || assessment.expiresAt < now) continue;
      const previous = byMint.get(assessment.token.mint);
      if (!previous || assessment.token.observedAt > previous.token.observedAt) byMint.set(assessment.token.mint, assessment);
    }
    let coloured = 0;
    for (const { element, mint } of rows) {
      element.classList.remove(...signalClasses, hotClass);
      element.removeAttribute("data-scout-mint");
      element.removeAttribute("data-scout-status");
      element.removeAttribute("data-scout-hot");
      if (!mintPattern.test(mint)) continue;
      const assessment = byMint.get(mint);
      if (!assessment) continue;
      const signal = signalClass(assessment, settings2);
      const style = runningWithoutVerdict(assessment, settings2) ? "scout-pulse-run" : signal === "signal-green" ? "scout-pulse-green" : signal === "signal-amber" ? "scout-pulse-amber" : signal === "signal-red" ? "scout-pulse-red" : "scout-pulse-gray";
      element.classList.add(style);
      element.dataset.scoutMint = mint;
      element.dataset.scoutStatus = assessment.status;
      const hot = hotCoin(assessment, settings2);
      if (hot) {
        element.classList.add(hotClass);
        element.dataset.scoutHot = hot.detail;
      }
      coloured++;
    }
    return coloured;
  }

  // src/asset.ts
  function assetUrl(file) {
    const api2 = globalThis.chrome;
    const getURL = api2?.runtime?.getURL;
    if (typeof getURL === "function") {
      try {
        return getURL.call(api2?.runtime, file);
      } catch {
      }
    }
    return file;
  }
  var scoutMarkFile = "scout-raccoon-logo.png";
  var markFallback = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="12" cy="12.6" r="10.4" fill="#15121c"/><path d="M5.4 6.4 3.6 2.4l4.6 1.8z" fill="#e9ebf0"/><path d="M18.6 6.4 20.4 2.4l-4.6 1.8z" fill="#e9ebf0"/><ellipse cx="8.5" cy="11.4" rx="3.2" ry="2.7" fill="#e9ebf0"/><ellipse cx="15.5" cy="11.4" rx="3.2" ry="2.7" fill="#e9ebf0"/><circle cx="8.7" cy="11.4" r="1.2" fill="#15121c"/><circle cx="15.3" cy="11.4" r="1.2" fill="#15121c"/><path d="M12 15.2c1.4 0 2.3.85 2.3 1.75S13.4 18.7 12 18.7s-2.3-.85-2.3-1.75S10.6 15.2 12 15.2z" fill="#e9ebf0"/></svg>';
  function scoutMark(document2, className) {
    const badge = document2.createElement("span");
    badge.className = className;
    badge.setAttribute("aria-hidden", "true");
    const image = document2.createElement("img");
    image.className = `${className}-img`;
    image.alt = "";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      const fallback = document2.createElement("span");
      fallback.className = `${className}-fallback`;
      fallback.innerHTML = markFallback;
      badge.append(fallback);
    }, { once: true });
    image.src = assetUrl(scoutMarkFile);
    badge.append(image);
    return badge;
  }

  // src/developerReputation.ts
  function devReputation(token) {
    const dev = token.developer;
    const reasons = [];
    if (dev.priorLaunches !== null && dev.rapidFailures !== null && dev.priorLaunches >= 5 && dev.rapidFailures >= 3)
      reasons.push(`${dev.rapidFailures} rapid failures across ${dev.priorLaunches} prior launches`);
    if (dev.linkedSales !== null && dev.linkedSales > 0)
      reasons.push(`${dev.linkedSales} creator-linked sale(s) observed`);
    if (reasons.length) return { label: "RISKY DEV", tone: "orange", reasons };
    if (dev.source === "unknown")
      return { label: "UNKNOWN DEV", tone: "neutral", reasons: ["Creator identity and launch history are unverified"] };
    return null;
  }
  function devStatus(token) {
    const verdict = devReputation(token);
    if (!verdict) {
      const dev = token.developer;
      return {
        label: "GOOD DEV",
        tone: "green",
        reasons: [`Verified creator${dev.priorLaunches !== null ? ` with ${dev.priorLaunches} prior launches` : ""} and no rapid failures or linked selling in the available data`]
      };
    }
    return verdict.label === "RISKY DEV" ? { label: "RISKY DEV", tone: "orange", reasons: verdict.reasons } : { label: "UNKNOWN DEV", tone: "neutral", reasons: verdict.reasons };
  }

  // src/overlayFrame.ts
  var clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  function applyOverlayRect(element, rect, options = {}) {
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    if (options.height === false) element.style.height = "";
    else element.style.height = `${rect.height}px`;
  }
  function attachOverlayFrame(element, options) {
    const doc = options.document ?? element.ownerDocument;
    const minWidth = options.minWidth ?? 220;
    const minHeight = options.minHeight ?? 130;
    const maxWidth = options.maxWidth ?? 720;
    let drag = null;
    function start(event, mode) {
      if (event.button !== 0) return;
      const target = event.target;
      if (mode === "move" && options.isBlocked && target && typeof target.closest === "function" && options.isBlocked(target)) return;
      const rect = element.getBoundingClientRect();
      drag = { mode, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      if (mode === "resize") {
        element.style.width = `${rect.width}px`;
        if (options.resizeAxis !== "width") element.style.height = `${rect.height}px`;
      }
      event.preventDefault();
    }
    function move(event) {
      if (!drag) return;
      const view = doc.defaultView;
      const viewW = view?.innerWidth ?? 1024;
      const viewH = view?.innerHeight ?? 768;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === "move") {
        element.style.left = `${clamp(drag.left + dx, 0, Math.max(0, viewW - 48))}px`;
        element.style.top = `${clamp(drag.top + dy, 0, Math.max(0, viewH - 28))}px`;
      } else {
        element.style.width = `${clamp(drag.width + dx, minWidth, Math.min(maxWidth, Math.max(minWidth, viewW - 16)))}px`;
        if (options.resizeAxis !== "width") element.style.height = `${clamp(drag.height + dy, minHeight, Math.max(minHeight, viewH - 16))}px`;
      }
    }
    function end() {
      if (!drag) return;
      drag = null;
      const rect = element.getBoundingClientRect();
      options.onCommit?.({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    const onHandleDown = (event) => start(event, "move");
    const onResizeDown = (event) => start(event, "resize");
    options.handle.addEventListener("mousedown", onHandleDown);
    options.resize?.addEventListener("mousedown", onResizeDown);
    doc.addEventListener("mousemove", move);
    doc.addEventListener("mouseup", end);
    return () => {
      options.handle.removeEventListener("mousedown", onHandleDown);
      options.resize?.removeEventListener("mousedown", onResizeDown);
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("mouseup", end);
    };
  }

  // src/holders.ts
  var dominantWalletPct = 20;
  var byHolding = (a, b) => b.pct - a.pct;
  function holderReadings(token) {
    const raw = token.holders ?? [];
    const top = [...raw].sort(byHolding);
    const topPct = top.length ? top.reduce((sum, holder) => sum + holder.pct, 0) : null;
    const largest = top[0] ?? null;
    const bands = [];
    const addBand = (label, pct) => {
      if (typeof pct === "number" && Number.isFinite(pct)) bands.push({ label, pct });
    };
    addBand("Top 10 wallets", token.holderBands?.top10);
    addBand("Wallets 11-20", token.holderBands?.next10);
    addBand("Wallets 21-40", token.holderBands?.mid);
    addBand("Everyone else", token.holderBands?.rest);
    const count = token.holderCount ?? null;
    const hasAnything = top.length > 0 || bands.length > 0 || count !== null || typeof token.developerHoldingPct === "number";
    if (!hasAnything) return null;
    const creatorWallet = token.developer.creator;
    const creatorKnown = typeof creatorWallet === "string" && creatorWallet.length > 0;
    let creator = null;
    if (creatorKnown) {
      const index = top.findIndex((holder) => holder.wallet === creatorWallet);
      const stated = typeof token.developerHoldingPct === "number" && Number.isFinite(token.developerHoldingPct) ? token.developerHoldingPct : null;
      if (index >= 0) {
        const holder = top[index];
        if (holder) creator = { wallet: holder.wallet, pct: holder.pct, rank: index + 1, locked: holder.locked === true, basis: "ranked" };
      } else if (stated !== null) {
        creator = { wallet: creatorWallet, pct: stated, rank: null, locked: false, basis: "feed" };
      } else if (top.length) {
        creator = { wallet: creatorWallet, pct: null, rank: null, locked: false, basis: "below-list" };
      } else {
        creator = { wallet: creatorWallet, pct: null, rank: null, locked: false, basis: "below-list" };
      }
    }
    const note = largest === null ? null : largest.type === "pool" ? `The largest account holds ${largest.pct.toFixed(1)}% of the supply. On a token this new that is usually the pool or bonding curve rather than a person.` : largest.pct >= dominantWalletPct ? `One wallet holds ${largest.pct.toFixed(1)}% of the supply.` : null;
    return {
      count,
      listed: top.length,
      topPct,
      top10Pct: token.holderBands?.top10 ?? token.top10HoldPct ?? topPct,
      bands,
      largest,
      top,
      creator,
      creatorKnown,
      note
    };
  }
  function shortWallet(wallet) {
    return wallet.length > 12 ? `${wallet.slice(0, 6)}\u2026${wallet.slice(-5)}` : wallet;
  }

  // src/overlayPrefs.ts
  var key = "scout.overlays.v1";
  var api = () => globalThis.chrome;
  var isRect = (value) => {
    if (!value || typeof value !== "object") return false;
    const rect = value;
    return Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height);
  };
  async function loadOverlayRects() {
    try {
      const value = (await api()?.storage?.local?.get(key))?.[key];
      if (!value || typeof value !== "object") return {};
      const out = {};
      for (const [name, rect] of Object.entries(value)) {
        if (isRect(rect)) out[name] = rect;
      }
      return out;
    } catch {
      return {};
    }
  }
  async function saveOverlayRect(name, rect) {
    try {
      const current = await loadOverlayRects();
      current[name] = rect;
      await api()?.storage?.local?.set({ [key]: current });
    } catch {
    }
  }
  var flagKey = "scout.overlayFlags.v1";
  async function loadOverlayFlags() {
    try {
      const value = (await api()?.storage?.local?.get(flagKey))?.[flagKey];
      if (!value || typeof value !== "object") return {};
      const out = {};
      for (const [name, flag] of Object.entries(value)) {
        if (typeof flag === "boolean") out[name] = flag;
      }
      return out;
    } catch {
      return {};
    }
  }
  async function saveOverlayFlag(name, value) {
    try {
      const current = await loadOverlayFlags();
      current[name] = value;
      await api()?.storage?.local?.set({ [flagKey]: current });
    } catch {
    }
  }

  // src/riskWarning.ts
  var present = (values) => values.filter((value) => typeof value === "string" && value.length > 0);
  function warningFor(a, settings2) {
    if (a.farmer === true) {
      return {
        id: "farmer-dev",
        category: "FARMER DEV",
        severity: "red",
        headline: "FARMER DEV",
        summary: "Potentially coordinated developer-linked wallet activity.",
        reasons: present([...a.critical, ...a.warnings]).slice(0, 8),
        confidence: a.confidence
      };
    }
    const criticalSecurity = present([
      a.token.freezeAuthority === true ? "Freeze authority is active" : null,
      a.token.transferRestriction === true ? "Transfer restriction detected" : null
    ]);
    if (criticalSecurity.length) {
      return {
        id: "token-security",
        category: "CRITICAL TOKEN SECURITY RISK",
        severity: "red",
        headline: "CRITICAL TOKEN SECURITY RISK",
        summary: "The token has an active control that can block or restrict trading.",
        reasons: criticalSecurity,
        confidence: a.confidence
      };
    }
    const verdict = devReputation(a.token);
    if (verdict?.label === "RISKY DEV") {
      return {
        id: "risky-dev",
        category: "RISKY DEV",
        severity: "orange",
        headline: "RISKY DEV",
        summary: verdict.reasons[0] ?? "Developer track record shows concerning patterns.",
        reasons: verdict.reasons,
        confidence: a.confidence
      };
    }
    if (a.analytics.suspiciousConcentration) {
      return {
        id: "wallet-cluster",
        category: "SUSPICIOUS WALLET CLUSTER",
        severity: "orange",
        headline: "SUSPICIOUS WALLET CLUSTER",
        summary: "Trading volume is concentrated in very few wallets.",
        reasons: ["Trading volume is concentrated in very few wallets"],
        confidence: a.confidence
      };
    }
    const liquidityProblems = present([
      a.token.liquidityChangePct !== null && a.token.liquidityChangePct < -30 ? "Liquidity fell more than 30%" : null,
      a.slippagePct !== null && a.slippagePct > settings2.maxSlippagePct ? `Estimated entry impact ${a.slippagePct.toFixed(1)}% exceeds the configured ${settings2.maxSlippagePct}% limit` : null,
      a.token.liquidityUsd !== null && a.token.liquidityUsd < settings2.minLiquidityUsd ? "Liquidity below configured minimum" : null
    ]);
    if (liquidityProblems.length) {
      return {
        id: "liquidity",
        category: "LIQUIDITY WARNING",
        severity: "orange",
        headline: "LIQUIDITY WARNING",
        summary: "Liquidity or execution conditions look weak.",
        reasons: liquidityProblems,
        confidence: a.confidence
      };
    }
    return null;
  }

  // src/riskOverlay.ts
  var severityLabel = { red: "CRITICAL", orange: "CAUTION", neutral: "UNKNOWN", green: "NO FLAG" };
  var severityWord = { red: "Risk detected", orange: "Caution", neutral: "Unknown", green: "All clear" };
  var usd = (value) => {
    if (value === null || value === void 0 || !Number.isFinite(value)) return "Unknown";
    return value < 0.01 ? `$${value.toPrecision(3)}` : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  };
  var when = (at) => at === null ? "unknown time" : new Date(at).toLocaleString();
  var ageLabel = (from) => {
    if (from === null || !Number.isFinite(from)) return "Unknown";
    const seconds = Math.max(0, Math.floor((Date.now() - from) / 1e3));
    return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
  };
  var shortMint = (mint) => `${mint.slice(0, 6)}\u2026${mint.slice(-4)}`;
  function createRiskOverlay(options = {}) {
    const doc = options.document ?? document;
    const explorerUrl = options.explorerUrl ?? ((mint) => `https://solscan.io/token/${mint}`);
    const accountUrl = options.accountUrl ?? ((wallet) => `https://solscan.io/account/${wallet}`);
    let panel = null;
    let resizeHandle = null;
    let detachFrame = null;
    let dismissedMint = null;
    let collapsed = false;
    let short = false;
    let signature = "";
    let lastMint = null;
    let shortButton = null;
    let collapseButton = null;
    let lastRender = null;
    function syncButtons() {
      if (collapseButton) {
        collapseButton.textContent = collapsed ? "+" : "\u2212";
        collapseButton.setAttribute("aria-label", collapsed ? "Expand popup" : "Collapse popup");
        collapseButton.setAttribute("title", collapsed ? "Expand" : "Collapse to header only");
      }
      if (shortButton) {
        shortButton.textContent = short ? "\u25B4" : "\u25BE";
        shortButton.setAttribute("aria-label", short ? "Show market, checks and history" : "Hide market, checks and history, keeping the holder data");
        shortButton.setAttribute("title", short ? "Show all details" : "Show only the verdict and holders");
      }
    }
    function element(tag, className, text) {
      const node = doc.createElement(tag);
      node.className = className;
      if (text !== void 0) node.textContent = text;
      return node;
    }
    function link(className, href, text) {
      const node = element("a", className, text);
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      return node;
    }
    function ensurePanel() {
      if (panel) return panel;
      panel = element("aside", "scout-risk");
      panel.setAttribute("role", "alertdialog");
      panel.setAttribute("aria-label", "Scout token popup");
      panel.addEventListener("click", onPanelClick);
      resizeHandle = element("div", "scout-risk-resize");
      resizeHandle.setAttribute("title", "Drag to resize");
      panel.append(resizeHandle);
      detachFrame = attachOverlayFrame(panel, {
        document: doc,
        handle: panel,
        resize: resizeHandle,
        minWidth: 260,
        minHeight: 180,
        maxWidth: 720,
        resizeAxis: "width",
        isBlocked: (target) => !!target.closest("button, details, summary, a"),
        onCommit: (rect) => {
          void saveOverlayRect("risk", rect);
        }
      });
      doc.body?.append(panel);
      void loadOverlayRects().then((saved) => {
        if (panel && saved.risk) applyOverlayRect(panel, saved.risk, { height: false });
      });
      void loadOverlayFlags().then((flags) => {
        collapsed = flags.riskCollapsed ?? false;
        short = flags.riskShort ?? false;
        panel?.classList.toggle("is-collapsed", collapsed);
        syncButtons();
      });
      return panel;
    }
    function onPanelClick(event) {
      const target = event.target;
      if (!panel) return;
      if (target?.closest('[data-scout-action="dismiss"]')) {
        dismissedMint = panel.dataset.scoutMint ?? null;
        panel.classList.remove("is-visible");
        return;
      }
      if (target?.closest('[data-scout-action="collapse"]')) {
        collapsed = !collapsed;
        panel.classList.toggle("is-collapsed", collapsed);
        panel.style.height = "";
        void saveOverlayFlag("riskCollapsed", collapsed);
        syncButtons();
        return;
      }
      if (target?.closest('[data-scout-action="shorten"]')) {
        short = !short;
        void saveOverlayFlag("riskShort", short);
        syncButtons();
        panel.style.height = "";
        signature = "";
        if (lastRender) render(lastRender.assessment, lastRender.view, lastRender.history);
      }
    }
    function row(wrap, key2, value) {
      const line = element("div", "scout-risk-history-line");
      line.append(element("span", "scout-risk-history-key", key2), element("span", "scout-risk-history-value", value));
      wrap.append(line);
    }
    function walletQualitySection(assessment) {
      const quality2 = assessment.token.holderQuality;
      if (!quality2) return null;
      const wrap = element("div", "scout-risk-history");
      wrap.append(element("div", "scout-risk-history-title", "Wallet quality"));
      if (quality2.devLaunches !== null) {
        row(wrap, "Dev track record", quality2.devLaunches === 0 ? "First token from this creator" : `${quality2.devLaunches.toLocaleString("en-US")} token${quality2.devLaunches === 1 ? "" : "s"} from this creator`);
      }
      if (quality2.bundlerPct !== null) row(wrap, "Bundled buys", `${quality2.bundlerPct.toFixed(1)}% of supply`);
      if (quality2.sniperPct !== null) row(wrap, "Snipers", `${quality2.sniperPct.toFixed(1)}% of supply`);
      if (quality2.botDegenPct !== null) row(wrap, "Bots / degen", `${quality2.botDegenPct.toFixed(1)}% of supply`);
      if (quality2.freshWalletPct !== null) row(wrap, "Fresh wallets", `${quality2.freshWalletPct.toFixed(1)}% of supply`);
      return wrap.childElementCount > 1 ? wrap : null;
    }
    function marketSection(assessment) {
      const token = assessment.token;
      const a = assessment.analytics;
      const hasActivity = Boolean(token.marketSnapshot) || token.trades.length > 0;
      const wrap = element("div", "scout-risk-history");
      wrap.append(element("div", "scout-risk-history-title", "Market & pool"));
      const platform = token.dexName ?? (token.provider.includes("GeckoTerminal") ? "GeckoTerminal pool" : "Unknown platform");
      const pair = token.quoteSymbol ? `${platform} \xB7 quoted in ${token.quoteSymbol}` : platform;
      row(wrap, "Platform", pair);
      if (token.poolAddresses?.[0]) row(wrap, "Pool", shortMint(token.poolAddresses[0]));
      row(wrap, "Pool age", `${ageLabel(token.launchedAt)}${token.stage !== "unknown" ? ` \xB7 ${token.stage}` : ""}`);
      row(wrap, "Price", usd(token.priceUsd));
      if (token.priceChange5mPct !== null) row(wrap, "Price 5m", `${token.priceChange5mPct.toFixed(1)}%`);
      row(wrap, "Liquidity", usd(token.liquidityUsd));
      if (token.liquidityChangePct !== null) row(wrap, "Liquidity chg", `${token.liquidityChangePct.toFixed(1)}%`);
      row(wrap, "5m volume", hasActivity ? usd(a.volume5m) : "Unknown");
      row(wrap, "Movement", movementVerdict(token, a).detail);
      row(wrap, "5m buys / sells", hasActivity ? `${a.buys5m} / ${a.sells5m}` : "Unknown");
      row(wrap, "5m buyers / sellers", !hasActivity ? "Unknown" : a.buyers5m !== null && a.sellers5m !== null ? `${a.buyers5m} / ${a.sellers5m}` : "Not published");
      row(wrap, "Market cap", token.marketCapUsd !== null ? usd(token.marketCapUsd) : "Unknown");
      row(wrap, "FDV", token.fdvUsd !== null ? usd(token.fdvUsd) : "Unknown");
      return wrap;
    }
    function checksSection(assessment) {
      const token = assessment.token;
      const wrap = element("div", "scout-risk-history");
      wrap.append(element("div", "scout-risk-history-title", "Token checks"));
      row(wrap, "Mint authority", token.mintAuthority === null ? "Unknown" : token.mintAuthority ? "Active (can mint)" : "Revoked");
      row(wrap, "Freeze authority", token.freezeAuthority === null ? "Unknown" : token.freezeAuthority ? "Active (can freeze)" : "Revoked");
      row(wrap, "Transfer control", token.transferRestriction === null ? "Unknown" : token.transferRestriction ? "Restricted" : "Clear");
      const concentration = assessment.concentrationPct ?? token.top10HoldPct ?? null;
      row(wrap, "Top 10 holders", concentration !== null ? `${concentration.toFixed(1)}%` : "Unknown");
      row(wrap, "Data completeness", `${assessment.dataCompletenessPct}% \xB7 ${assessment.confidence} confidence`);
      return wrap;
    }
    function holdersSection(assessment) {
      const wrap = element("div", "scout-risk-history");
      wrap.append(element("div", "scout-risk-history-title", "Holders"));
      const reading = holderReadings(assessment.token);
      if (!reading) {
        row(wrap, "Holders", "Not published yet");
        row(wrap, "Top 10 hold", "Not published yet");
        row(wrap, "Biggest wallet", "Not published yet");
        row(wrap, "Dev / creator holding", assessment.token.developer.creator ? `Creator wallet ${shortWallet(assessment.token.developer.creator)} \xB7 holdings not published` : "Creator wallet is not identified for this token");
        wrap.append(element(
          "p",
          "scout-risk-note",
          "No holder breakdown has been published for this mint yet. Newly launched tokens usually get one once they have traded for a while, and Scout fills this in on its next scan."
        ));
        return wrap;
      }
      row(wrap, "Holders", reading.count !== null ? reading.count.toLocaleString("en-US") : "Not published");
      if (reading.topPct !== null && reading.listed) row(wrap, `Top ${reading.listed} hold`, `${reading.topPct.toFixed(1)}%`);
      else if (reading.top10Pct !== null) row(wrap, "Top 10 hold", `${reading.top10Pct.toFixed(1)}%`);
      if (reading.largest) row(wrap, reading.largest.type === "pool" ? "Largest account" : "Biggest wallet", `${reading.largest.pct.toFixed(2)}% \xB7 ${shortWallet(reading.largest.wallet)}`);
      row(wrap, "Dev / creator holding", creatorHoldingLine(reading));
      if (reading.bands.length) {
        const bandList = element("div", "scout-risk-holders");
        const widest2 = Math.max(...reading.bands.map((band) => band.pct), 1);
        for (const band of reading.bands) {
          const line = element("div", "scout-risk-holder");
          line.append(element("span", "scout-risk-holder-rank", ""));
          const bar = element("span", "scout-risk-holder-bar");
          const fill = element("span", "scout-risk-holder-fill");
          fill.style.width = `${Math.max(2, Math.round(band.pct / widest2 * 100))}%`;
          bar.append(fill);
          line.append(bar);
          line.append(element("span", "scout-risk-holder-pct", `${band.pct.toFixed(1)}%`));
          line.append(element("span", "scout-risk-holder-band", band.label));
          bandList.append(line);
        }
        wrap.append(bandList);
      }
      const widest = reading.largest?.pct ?? 0;
      if (reading.top.length) {
        const list = element("div", "scout-risk-holders");
        reading.top.forEach((holder, index) => {
          const line = element("div", "scout-risk-holder");
          line.append(element("span", "scout-risk-holder-rank", `${index + 1}`));
          const bar = element("span", "scout-risk-holder-bar");
          const fill = element("span", "scout-risk-holder-fill");
          fill.style.width = `${widest > 0 ? Math.max(2, Math.round(holder.pct / widest * 100)) : 2}%`;
          bar.append(fill);
          line.append(bar);
          line.append(element("span", "scout-risk-holder-pct", `${holder.pct.toFixed(2)}%`));
          const who = link("scout-risk-holder-wallet", accountUrl(holder.wallet), shortWallet(holder.wallet));
          who.setAttribute("title", [
            holder.wallet,
            `${holder.pct.toFixed(4)}% of total supply`,
            holder.tag,
            holder.locked ? "reported as locked" : null
          ].filter(Boolean).join(" \xB7 "));
          line.append(who);
          list.append(line);
        });
        wrap.append(list);
      }
      if (reading.note) wrap.append(element("p", "scout-risk-note", reading.note));
      return wrap;
    }
    function creatorHoldingLine(reading) {
      if (!reading.creatorKnown) return "Creator wallet is not identified for this token";
      const creator = reading.creator;
      if (!creator) return "Unknown";
      const share = creator.pct !== null ? `${creator.pct.toFixed(2)}%` : "Unknown share";
      const where = creator.basis === "ranked" ? `wallet #${creator.rank}` : creator.basis === "feed" ? "reported by the feed" : reading.top.length ? `outside the listed top ${reading.listed}` : "holder breakdown not published";
      return `${share} \xB7 ${where}${creator.locked ? " \xB7 locked" : ""}`;
    }
    function historySection(history) {
      if (!history) return null;
      const wrap = element("div", "scout-risk-history");
      wrap.append(element("div", "scout-risk-history-title", "Coin history"));
      if (history.ath) row(wrap, "All-time high", `${usd(history.ath.priceUsd)} \xB7 ${history.ath.source}`);
      if (history.observedHigh) {
        const parts = [usd(history.observedHigh.priceUsd), history.observedHigh.marketCapUsd !== null ? `${usd(history.observedHigh.marketCapUsd)} mkt cap` : null].filter(Boolean).join(" \xB7 ");
        row(wrap, "Scout-observed high", `${parts || "Unknown"} \xB7 ${when(history.observedHigh.at)}`);
      }
      const copies = history.similar.length;
      if (copies > 0) {
        const oldest = history.similar[0];
        const fed = history.similar.filter((item) => item.source === "feed").length;
        const detail = [
          oldest ? `oldest: ${oldest.symbol || oldest.name}${oldest.source === "feed" ? " (feed ticker match)" : ` \xB7 first seen ${when(oldest.firstSeenAt)}`}` : null,
          fed > 0 ? `${fed} from the public feed` : "all seen by Scout"
        ].filter(Boolean).join(" \xB7 ");
        row(wrap, `Copycat/vampire (${copies})`, `Same name as ${oldest?.symbol || oldest?.name || "another coin"} \xB7 ${detail}`);
        const links = element("div", "scout-risk-links");
        if (oldest) links.append(link("scout-risk-link", explorerUrl(oldest.mint), "Oldest coin on explorer"));
        for (const item of history.similar.slice(1, 3)) links.append(link("scout-risk-link", explorerUrl(item.mint), `${item.symbol || item.name} on explorer`));
        if (links.childElementCount) wrap.append(links);
      } else {
        row(wrap, "Copycat/vampire", "None found");
        row(wrap, "Vampire check", history.feedChecked ? "No other Solana pool uses this ticker, and Scout has not seen another coin by this name" : "Scout has not seen another coin with this name yet");
      }
      return wrap;
    }
    function verdictChip(key2, value, tone, title) {
      const chip = element("span", `scout-risk-verdict scout-risk-verdict--${tone}`);
      if (title) chip.setAttribute("title", title);
      chip.append(element("span", "scout-risk-verdict-key", key2), element("span", "scout-risk-verdict-value", value));
      return chip;
    }
    function verdictStrip(assessment, history) {
      const strip = element("div", "scout-risk-verdicts");
      const dev = devStatus(assessment.token);
      const volume = volumeVerdict(assessment.token, assessment.analytics);
      const copies = history?.similar.length ?? 0;
      const vamp = copies > 0 ? verdictChip("Vamp", `${copies} ${copies === 1 ? "copy" : "copies"}`, copies >= 3 ? "red" : "orange", `${copies} other coin(s) trade under this name or ticker`) : verdictChip("Vamp", "no copies", "green", history?.feedChecked ? "No other Solana pool uses this ticker and Scout has seen no other coin by this name" : "Scout has not seen another coin with this name yet");
      strip.append(
        verdictChip("Dev", dev.label, dev.tone, dev.reasons[0] ?? ""),
        verdictChip("Volume", volume.level, volume.tone),
        vamp
      );
      return strip;
    }
    function categoryRow(assessment) {
      const tags = tokenTags(assessment.token);
      if (!tags.length) return null;
      const wrap = element("div", "scout-risk-tags");
      for (const tag of tags.slice(0, 3)) {
        const chip = element("span", "scout-risk-tag", tag.label);
        chip.style.setProperty("--scout-tag", tag.color);
        wrap.append(chip);
      }
      return wrap;
    }
    function render(assessment, view, history, mintOverride = null) {
      lastRender = { assessment, view, history };
      const root = ensurePanel();
      const token = assessment?.token ?? null;
      const mint = token?.mint ?? mintOverride;
      const head = element("header", "scout-risk-head");
      const icon = scoutMark(doc, "scout-risk-icon");
      icon.setAttribute("title", `${severityWord[view.tone]} \xB7 Scout`);
      const titles = element("div", "scout-risk-titles");
      titles.append(element("strong", "scout-risk-brand", "SCOUT"), element("span", "scout-risk-category", view.category));
      const shorten = element("button", "scout-risk-btn", "\u25BE");
      shorten.type = "button";
      shorten.setAttribute("data-scout-action", "shorten");
      const collapse = element("button", "scout-risk-btn", "\u2212");
      collapse.type = "button";
      collapse.setAttribute("data-scout-action", "collapse");
      collapse.setAttribute("aria-label", "Collapse popup");
      const dismiss = element("button", "scout-risk-btn", "\xD7");
      dismiss.type = "button";
      dismiss.setAttribute("data-scout-action", "dismiss");
      dismiss.setAttribute("aria-label", "Dismiss popup for this token");
      head.append(icon, titles, shorten, collapse, dismiss);
      const body = element("div", "scout-risk-body");
      const meta = element("div", "scout-risk-meta");
      if (token) meta.append(metaChip(token.symbol || "?", "symbol"));
      if (assessment) meta.append(metaChip(assessment.status, "status"), metaChip(`${Math.round(assessment.score)}/100`, "score"));
      meta.append(metaChip(severityLabel[view.tone], `tone-${view.tone}`));
      body.append(meta, element("p", "scout-risk-summary", view.summary));
      if (assessment) body.append(verdictStrip(assessment, history));
      if (assessment) {
        const categories = categoryRow(assessment);
        if (categories) body.append(categories);
      }
      if (assessment) body.append(holdersSection(assessment));
      if (assessment) {
        const quality2 = walletQualitySection(assessment);
        if (quality2) body.append(quality2);
      }
      if (assessment && !short) body.append(marketSection(assessment));
      if (assessment && !short) body.append(checksSection(assessment));
      if (!short) {
        const historyEl = historySection(history);
        if (historyEl) body.append(historyEl);
      }
      if (view.reasons.length) {
        const evidence2 = doc.createElement("details");
        evidence2.className = "scout-risk-evidence";
        const summaryEl = doc.createElement("summary");
        summaryEl.textContent = "View evidence";
        evidence2.append(summaryEl);
        const list = doc.createElement("ul");
        for (const reason of view.reasons) list.append(element("li", "scout-risk-reason", reason));
        evidence2.append(list);
        if (view.disclaimer) evidence2.append(element("p", "scout-risk-disclaimer", view.disclaimer));
        if (token) {
          const links = element("div", "scout-risk-links");
          links.append(link("scout-risk-link", explorerUrl(token.mint), "Token on explorer"));
          if (token.developer.creator) links.append(link("scout-risk-link", accountUrl(token.developer.creator), "Creator wallet"));
          if (token.sourceUrl) links.append(link("scout-risk-link", token.sourceUrl, "Source pool"));
          evidence2.append(links);
        }
        body.append(evidence2);
      }
      if (short) body.append(element("p", "scout-risk-note", "Market, checks and history hidden \xB7 press \u25BE above to show them. Holder data stays on screen."));
      const next = [view.tone, view.category, collapsed ? "c" : "f", short ? "s" : "l", body.textContent ?? ""].join("|");
      shortButton = shorten;
      collapseButton = collapse;
      if (next === signature) {
        root.classList.add("is-visible");
        syncButtons();
        return;
      }
      const evidence = body.querySelector("details");
      const wasOpen = root.querySelector(".scout-risk-evidence")?.open ?? false;
      if (wasOpen && evidence) evidence.open = true;
      const scrollTop = root.querySelector(".scout-risk-body")?.scrollTop ?? 0;
      const tokenChanged = mint !== lastMint;
      if (tokenChanged) root.classList.remove("is-visible");
      root.replaceChildren();
      if (mint) root.dataset.scoutMint = mint;
      else root.removeAttribute("data-scout-mint");
      root.dataset.scoutSeverity = view.tone;
      root.classList.toggle("is-collapsed", collapsed);
      root.append(head, body);
      if (resizeHandle) root.append(resizeHandle);
      if (scrollTop > 0) body.scrollTop = scrollTop;
      if (tokenChanged) void root.offsetWidth;
      root.classList.add("is-visible");
      signature = next;
      lastMint = mint;
      syncButtons();
    }
    function metaChip(text, kind) {
      return element("span", `scout-risk-meta-chip scout-risk-meta-chip--${kind}`, text);
    }
    return {
      /**
       * The page is a token page with a full mint, but Scout has no independent data
       * for it yet. Showing an explicit "nothing yet" state beats showing nothing at
       * all: silence is indistinguishable from Scout being broken, and it hides the
       * fact that a retry is already on its way while the page stays open.
       */
      showUnscanned(mint, reason = "") {
        if (mint === dismissedMint) return;
        render(null, {
          tone: "neutral",
          category: "NOT SCANNED YET",
          summary: reason || "Scout could not find independent market data for this exact mint yet. It keeps retrying while this page stays open.",
          reasons: [
            "No pool data was returned for this exact mint, so there is nothing to score yet.",
            "Scout never reuses an earlier score for a mint it cannot currently verify.",
            "This is not a claim about the coin: it means Scout has no evidence yet, not that the coin is unsafe."
          ],
          disclaimer: "Retrying automatically while this page stays open."
        }, null, mint);
      },
      /**
       * Refresh the popup. A null assessment with no page badge hides it;
       * otherwise a verdict is always shown.
       */
      update(assessment, settings2, pageBadge = null, history = null) {
        if (!assessment && !pageBadge) {
          panel?.classList.remove("is-visible");
          return;
        }
        const mint = assessment?.token.mint ?? null;
        if (mint && mint === dismissedMint) return;
        const warning = assessment ? warningFor(assessment, settings2) : null;
        if (warning) {
          render(assessment, { tone: warning.severity, category: warning.category, summary: warning.summary, reasons: warning.reasons, disclaimer: null }, history);
          return;
        }
        const status = assessment ? devStatus(assessment.token) : null;
        if (pageBadge) {
          render(assessment, {
            tone: pageBadge.tone,
            category: pageBadge.classification,
            summary: pageBadge.details[0] ?? "The host page reports a developer provenance result for this token.",
            reasons: pageBadge.details,
            disclaimer: "Host page badge \xB7 not independently verified"
          }, history);
        } else if (status?.label === "UNKNOWN DEV") {
          render(assessment, {
            tone: "neutral",
            category: "UNKNOWN DEV",
            summary: status.reasons[0] ?? "Scout could not verify this developer.",
            reasons: status.reasons,
            disclaimer: "Creator identity and launch history are unverified."
          }, history);
        } else if (status?.label === "GOOD DEV") {
          render(assessment, {
            tone: "green",
            category: "GOOD DEV",
            summary: "Verified creator with no rapid failures or linked selling, and no configured critical risk detected. This is not a guarantee of safety.",
            reasons: status.reasons,
            disclaimer: "Evidence-based check \xB7 not investment advice"
          }, history);
        } else {
          render(assessment, {
            tone: "green",
            category: "NO CRITICAL RISK FLAGGED",
            summary: "No configured critical risk was detected in the available data. This is not a guarantee of safety.",
            reasons: assessment?.positives.slice(0, 3) ?? [],
            disclaimer: "Evidence-based check \xB7 not investment advice"
          }, history);
        }
      },
      destroy() {
        detachFrame?.();
        detachFrame = null;
        resizeHandle = null;
        panel?.remove();
        panel = null;
        dismissedMint = null;
      }
    };
  }

  // scripts/store-shots/shot.ts
  var NOW = Date.now();
  var MINUTE = 6e4;
  var settings = {
    refreshSeconds: 15,
    minLiquidityUsd: 25e3,
    maxSlippagePct: 8,
    tradeSizeUsd: 500,
    minScore: 65,
    maxAgeHours: 72,
    notifications: false,
    weights: { momentum: 0.2, liquidity: 0.2, developer: 0.2, price: 0.15, holders: 0.15, security: 0.1 }
  };
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function demoMint(seed) {
    let out = "";
    let x = (seed * 7919 + 104729) % 2147483647;
    while (out.length < 43) {
      x = x * 48271 % 2147483647;
      out += B58[(x >>> 3) % 58];
    }
    return out;
  }
  var demos = [
    { symbol: "KETTLE", name: "Kettle", mint: demoMint(11), price: 412e-5, liquidity: 96400, marketCap: 294e4, volume5m: 241800, buys: 61, sells: 22, buyers: 34, ageMinutes: 38 },
    { symbol: "PARKWAY", name: "Parkway", mint: demoMint(12), price: 0.0718, liquidity: 128e3, marketCap: 618e4, volume5m: 34500, buys: 24, sells: 15, buyers: 9, ageMinutes: 96 },
    { symbol: "TINFOIL", name: "Tinfoil", mint: demoMint(13), price: 221e-5, liquidity: 41200, marketCap: 884e3, volume5m: 18900, buys: 31, sells: 9, buyers: 17, ageMinutes: 51 },
    { symbol: "GRAVEL", name: "Gravel", mint: demoMint(14), price: 904e-5, liquidity: 22600, marketCap: 412e3, volume5m: 9100, buys: 12, sells: 26, buyers: 7, ageMinutes: 143 },
    { symbol: "MARIGOLD", name: "Marigold", mint: demoMint(15), price: 91e-5, liquidity: 88300, marketCap: 112e4, volume5m: 183400, buys: 58, sells: 41, buyers: 29, ageMinutes: 21 },
    { symbol: "LANTERN", name: "Lantern", mint: demoMint(16), price: 0.0334, liquidity: 24e4, marketCap: 333e4, volume5m: 860, buys: 6, sells: 5, buyers: 4, ageMinutes: 310 },
    { symbol: "SPINDLE", name: "Spindle", mint: demoMint(17), price: 18e-5, liquidity: 9400, marketCap: 96e3, volume5m: 2100, buys: 9, sells: 14, buyers: 6, ageMinutes: 12 },
    { symbol: "SPROCKET", name: "Sprocket", mint: demoMint(18), price: 0.0126, liquidity: 74100, marketCap: 142e4, volume5m: 26400, buys: 22, sells: 17, buyers: 11, ageMinutes: 64 },
    { symbol: "TUMBLER", name: "Tumbler", mint: demoMint(19), price: 587e-5, liquidity: 152e3, marketCap: 406e4, volume5m: 61900, buys: 38, sells: 19, buyers: 21, ageMinutes: 47 },
    { symbol: "COPPER", name: "Copper", mint: demoMint(20), price: 44e-5, liquidity: 31800, marketCap: 512e3, volume5m: 5600, buys: 11, sells: 10, buyers: 8, ageMinutes: 27 },
    { symbol: "HALYARD", name: "Halyard", mint: demoMint(21), price: 0.0209, liquidity: 68500, marketCap: 221e4, volume5m: 21300, buys: 19, sells: 33, buyers: 12, ageMinutes: 118 }
  ];
  function buildAnalytics(d, over = {}) {
    return {
      volume30s: Math.round(d.volume5m / 10),
      volume1m: Math.round(d.volume5m / 5),
      volume5m: d.volume5m,
      volume15m: d.volume5m * 2.6,
      buys5m: d.buys,
      sells5m: d.sells,
      buyVolume5m: null,
      sellVolume5m: null,
      buyers5m: d.buyers,
      sellers5m: Math.max(1, Math.round(d.buyers * 0.7)),
      buyerGrowth: null,
      volumeAcceleration: null,
      repeatBuyers: 0,
      netPressure: null,
      suspiciousConcentration: false,
      ...over
    };
  }
  function buildToken(d, over = {}) {
    return {
      mint: d.mint,
      chain: "solana",
      name: d.name,
      symbol: d.symbol,
      stage: "migrated",
      launchedAt: NOW - d.ageMinutes * MINUTE,
      observedAt: NOW,
      poolAddresses: [demoMint(d.mint.length + 500)],
      priceUsd: d.price,
      marketCapUsd: d.marketCap,
      fdvUsd: Math.round(d.marketCap * 1.16),
      liquidityUsd: d.liquidity,
      liquidityChangePct: 6.2,
      priceChange5mPct: 4.8,
      imageUrl: null,
      trades: [],
      holders: null,
      holderCount: 1284,
      top10HoldPct: null,
      holderBands: null,
      holderQuality: null,
      developerHoldingPct: 4.2,
      developer: { creator: demoMint(d.mint.length + 900), priorLaunches: 3, rapidFailures: 0, linkedSales: 0, source: "verified", note: "" },
      mintAuthority: false,
      freezeAuthority: false,
      transferRestriction: false,
      migrationProgressPct: null,
      provider: "DexScreener",
      dexName: "Raydium",
      quoteSymbol: "SOL",
      marketSnapshot: { volume5m: d.volume5m, volume15m: d.volume5m * 2.6, buys5m: d.buys, sells5m: d.sells, buyers5m: d.buyers, sellers5m: Math.max(1, Math.round(d.buyers * 0.7)) },
      ...over
    };
  }
  function buildAssessment(token, analytics, over = {}) {
    return {
      token,
      analytics,
      score: 74,
      status: "WATCH",
      confidence: "medium",
      expiresAt: NOW + 5 * MINUTE,
      dataCompletenessPct: 82,
      components: { momentum: 68, liquidity: 71, developer: 74, price: 66, holders: 59, security: 90 },
      positives: ["Liquidity held while volume rose", "Buy count leads sell count on the 5m window", "Creator has shipped before without a rapid failure"],
      warnings: ["Top 10 wallets hold a large share of supply"],
      missing: ["Creator holding is not published by the feed"],
      critical: [],
      entryConditions: [{ label: "Minimum liquidity met", met: true }],
      invalidation: [],
      slippagePct: 2.4,
      concentrationPct: 38.6,
      farmer: null,
      ...over
    };
  }
  function buildHolders() {
    return [
      { wallet: demoMint(301), pct: 14.82, type: "pool", tag: "Raydium AMM", locked: true },
      { wallet: demoMint(302), pct: 6.41, type: "wallet", tag: null },
      { wallet: demoMint(303), pct: 5.13, type: "wallet", tag: null },
      { wallet: demoMint(304), pct: 4.27, type: "wallet", tag: null },
      { wallet: demoMint(305), pct: 3.08, type: "burn", tag: "Burn address" },
      { wallet: demoMint(306), pct: 2.66, type: "wallet", tag: null },
      { wallet: demoMint(307), pct: 2.11, type: "wallet", tag: null }
    ];
  }
  var quality = { devLaunches: 3, bundlerPct: 6.4, sniperPct: 3.1, botDegenPct: 11.2, freshWalletPct: 18.6 };
  function buildHistory() {
    return {
      ath: { priceUsd: 0.0942, at: NOW - 26 * 60 * MINUTE, source: "GeckoTerminal" },
      observedHigh: { priceUsd: 0.0521, marketCapUsd: 412e4, at: NOW - 5 * 60 * MINUTE },
      similar: [
        { mint: demoMint(701), symbol: "KETTLE", name: "Kettle", firstSeenAt: NOW - 19 * 60 * MINUTE, source: "observed" },
        { mint: demoMint(702), symbol: "KETTLE", name: "Kettle Inu", firstSeenAt: NOW - 3 * 60 * MINUTE, source: "feed" }
      ],
      feedChecked: true
    };
  }
  function badgeKind(row) {
    const c = row.classList;
    if (c.contains("scout-pulse-run")) return "run";
    if (c.contains("scout-pulse-green")) return "green";
    if (c.contains("scout-pulse-amber")) return "amber";
    if (c.contains("scout-pulse-red")) return "red";
    return "gray";
  }
  function renderRows() {
    const body = document.getElementById("rows");
    if (!body) return;
    const statuses = [
      "TOP CANDIDATE",
      "TOP CANDIDATE",
      "WATCH",
      "HIGH RISK",
      "UNKNOWN / INCOMPLETE",
      "UNKNOWN / INCOMPLETE",
      "DISQUALIFIED",
      "WATCH",
      "TOP CANDIDATE",
      "UNKNOWN / INCOMPLETE",
      "WAIT FOR CONFIRMATION"
    ];
    const scores = [81, 71, 68, 24, 41, 33, 12, 66, 77, 38, 52];
    const critical = [[], [], [], ["Liquidity pulled by the deploying wallet"], [], [], ["Trading is disabled by the token contract"], [], [], [], []];
    const rows = [];
    const assessments = [];
    demos.forEach((d, index) => {
      const tr = document.createElement("tr");
      tr.className = "scout-pulse-row";
      tr.innerHTML = `
      <td class="left mock-rank">${index + 1}</td>
      <td class="left"><div class="mock-name"><span class="mock-sym">${d.symbol}</span><span class="mock-age">${d.ageMinutes}m</span></div>
        <div class="mock-full">${d.mint}</div></td>
      <td>$${d.price < 0.01 ? d.price.toPrecision(3) : d.price.toFixed(4)}</td>
      <td class="${index === 3 || index === 6 ? "mock-down" : "mock-up"}">${index === 3 || index === 6 ? "-" : "+"}${(3 + index * 1.7).toFixed(1)}%</td>
      <td class="mock-dim">$${d.liquidity.toLocaleString("en-US")}</td>
      <td class="mock-dim">$${d.marketCap.toLocaleString("en-US")}</td>`;
      body.append(tr);
      const token = buildToken(d, { holderQuality: quality, developerHoldingPct: 4.2 });
      const analytics = buildAnalytics(d, { suspiciousConcentration: index === 3 });
      const assessment = buildAssessment(token, analytics, {
        score: scores[index] ?? 50,
        status: statuses[index] ?? "WATCH",
        critical: critical[index] ?? [],
        farmer: null
      });
      rows.push({ element: tr, mint: d.mint });
      assessments.push(assessment);
    });
    applyPulseSignals(rows, assessments, settings, NOW);
    rows.forEach((row, index) => {
      const demo = demos[index];
      const assessment = assessments[index];
      if (!demo || !assessment) return;
      const kind = badgeKind(row.element);
      const badge = document.createElement("span");
      badge.className = `scout-pulse-badge scout-pulse-badge--${kind}`;
      badge.textContent = kind === "run" ? "SCOUT \xB7 RUNNING" : `SCOUT ${Math.round(assessment.score)}`;
      badge.title = `${assessment.status} \xB7 Score ${Math.round(assessment.score)}/100`;
      row.element.append(badge);
      const tags = tokenTags(assessment.token);
      if (tags.length) {
        const wrap = document.createElement("div");
        wrap.className = "scout-pulse-tags";
        for (const tag of tags.slice(0, 3)) {
          const chip = document.createElement("span");
          chip.className = "scout-pulse-tag";
          chip.textContent = tag.label;
          chip.style.setProperty("--scout-tag", tag.color);
          wrap.append(chip);
        }
        row.element.append(wrap);
      }
    });
  }
  function renderPopup(mode) {
    const demo = mode === "history" ? demos[1] : demos[0];
    if (!demo) return;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    document.body.append(scrim);
    const clean = mode === "history";
    const token = buildToken(demo, {
      holders: buildHolders(),
      holderQuality: quality,
      developerHoldingPct: 4.2,
      liquidityUsd: clean ? 128e3 : 14200,
      liquidityChangePct: clean ? 8.4 : -42.5,
      marketCapUsd: clean ? 618e4 : 412e3
    });
    const analytics = buildAnalytics(demo, { volume5m: clean ? 34500 : 18900 });
    const assessment = buildAssessment(token, analytics, {
      score: clean ? 71 : 46,
      status: clean ? "WATCH" : "WAIT FOR CONFIRMATION",
      confidence: "medium",
      dataCompletenessPct: 82,
      slippagePct: clean ? 1.9 : 11.8,
      concentrationPct: 38.6,
      warnings: clean ? [] : ["Liquidity fell more than 30% in the last 5 minutes", "Top 10 wallets hold 38.6% of supply"]
    });
    const overlay = createRiskOverlay();
    overlay.update(assessment, settings, null, buildHistory());
    if (clean) {
      requestAnimationFrame(() => {
        const body = document.querySelector(".scout-risk-body");
        if (body) body.scrollTop = body.scrollHeight;
      });
    }
  }
  var shot = new URLSearchParams(location.search).get("shot") ?? "rows";
  document.body.dataset.shot = shot;
  renderRows();
  if (shot === "popup") renderPopup("popup");
  if (shot === "history") renderPopup("history");
})();
