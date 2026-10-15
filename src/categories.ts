import type { Token } from './types.js';

export interface TokenCategory {
  id: string;
  label: string;
  color: string;
  kind: 'platform' | 'category';
}

/**
 * Platform rules keyed off the token's current pool DEX (from the data
 * provider). This is the platform the pool trades on, which is a strong, but
 * not definitive, hint at the launchpad (pump.fun coins migrate to Raydium).
 *
 * Order matters: the first match wins, so patterns for a specific launchpad come
 * before the broader family pattern they would otherwise be swallowed by
 * (bonkers before bonk, pumpswap before pump, launchlab before raydium,
 * meteora's bond curve before meteora, liquidaf before liquid).
 */
const platformRules: { id: string; label: string; color: string; pattern: RegExp }[] = [
  // Meteora's dynamic bonding curve is a separate product from its AMM pools.
  { id: 'dynamicbc', label: 'Dynamic BC', color: '#f59e0b', pattern: /meteora-?dbc|dynamic|\bdbc\b/i },
  { id: 'meteora', label: 'Meteora', color: '#38bdf8', pattern: /meteora|dlmm/i },
  // Raydium's launchpad is listed separately from its AMM pools.
  { id: 'launchlab', label: 'LaunchLab', color: '#818cf8', pattern: /launchlab|launch-?lab/i },
  { id: 'raydium', label: 'Raydium', color: '#a78bfa', pattern: /raydium|cpmm|gamma/i },
  // Pump family: the AMM came after the launchpad.
  { id: 'pumpswap', label: 'PumpSwap', color: '#fb923c', pattern: /pumpswap|pump-?swap|pump-?amm/i },
  { id: 'pumpfun', label: 'pump.fun', color: '#f97316', pattern: /pump/i },
  { id: 'orca', label: 'Orca', color: '#22d3ee', pattern: /orca|whirlpool/i },
  // Bonkers before bonk, or the substring would steal it.
  { id: 'bonkers', label: 'Bonkers', color: '#fbbf24', pattern: /bonkers/i },
  { id: 'bonk', label: 'Bonk', color: '#facc15', pattern: /bonk|letsbonk/i },
  { id: 'liquidaf', label: 'LiquidAF AMM', color: '#2dd4bf', pattern: /liquidaf|liquid-?af/i },
  { id: 'liquid', label: 'Liquid', color: '#34d399', pattern: /liquid/i },
  { id: 'moonshot', label: 'Moonshot', color: '#f43f5e', pattern: /moonshot/i },
  { id: 'moonit', label: 'Moonit', color: '#fb7185', pattern: /moonit/i },
  { id: 'boop', label: 'Boop', color: '#fb7185', pattern: /boop/i },
  { id: 'believe', label: 'Believe', color: '#34d399', pattern: /believe/i },
  { id: 'bags', label: 'Bags', color: '#22c55e', pattern: /bags/i },
  { id: 'heaven', label: 'Heaven', color: '#7dd3fc', pattern: /heaven/i },
  { id: 'sugar', label: 'Sugar', color: '#f472b6', pattern: /sugar/i },
  { id: 'candle', label: 'Candle', color: '#fb923c', pattern: /candle/i },
  { id: 'mayhem', label: 'Mayhem', color: '#ef4444', pattern: /mayhem/i },
  { id: 'surge', label: 'Surge', color: '#a3e635', pattern: /surge/i },
  { id: 'soar', label: 'Soar', color: '#38bdf8', pattern: /soar/i },
  { id: 'borderless', label: 'Borderless', color: '#c084fc', pattern: /borderless/i },
  { id: 'daos', label: 'Daos.fun', color: '#60a5fa', pattern: /daos/i },
  { id: 'printr', label: 'Printr', color: '#94a3b8', pattern: /printr/i },
  { id: 'riserich', label: 'Rise Rich', color: '#f59e0b', pattern: /rise-?rich|riserich/i },
  { id: 'stonk', label: 'Stonk.fun', color: '#4ade80', pattern: /stonk/i },
  { id: 'usepaid', label: 'UsePaid', color: '#c084fc', pattern: /usepaid|use-?pa?id|\bpaid\b/i },
  { id: 'jupiter', label: 'Jupiter Studio', color: '#22d3ee', pattern: /jupiter/i },
  { id: 'pancake', label: 'PancakeSwap', color: '#facc15', pattern: /pancake/i }
];

/** Every launchpad Scout can name, in catalogue order, for the platform filter. */
export const knownPlatforms: { id: string; label: string; color: string }[] =
  platformRules.map(({ id, label, color }) => ({ id, label, color }));

/**
 * Category rules keyed off the token name/symbol. These are keyword heuristics,
 * clearly labelled as such, and they are not verified claims about the coin.
 */
const categoryRules: { id: string; label: string; color: string; pattern: RegExp }[] = [
  { id: 'charity', label: 'Charity', color: '#f472b6', pattern: /(charity|charitable|donat|relief|nonprofit|non-profit|giveaway|orphan|water-well)/i },
  { id: 'ai', label: 'AI', color: '#38bdf8', pattern: /(\bai\b|agent|neural|gpt|llm|\bagi\b|openai|autonomous)/i },
  { id: 'elon', label: 'Elon', color: '#a78bfa', pattern: /(elon|musk|tesla|doge|spacex|\bxai\b|groq)/i },
  { id: 'trump', label: 'Trump', color: '#ef4444', pattern: /(trump|maga)/i }
];

const titleCase = (value: string): string => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

/** Colored platform/category tags for a token, platform first. */
export function tokenTags(token: Token): TokenCategory[] {
  const tags: TokenCategory[] = [];
  const dex = (token.dexName ?? '').trim();
  if (dex) {
    const rule = platformRules.find(candidate => candidate.pattern.test(dex));
    tags.push(rule
      ? { id: rule.id, label: rule.label, color: rule.color, kind: 'platform' }
      : { id: `dex:${dex.toLowerCase()}`, label: titleCase(dex), color: '#7d97a6', kind: 'platform' });
  }
  const haystack = `${token.name} ${token.symbol}`;
  for (const rule of categoryRules) {
    if (rule.pattern.test(haystack)) tags.push({ id: rule.id, label: rule.label, color: rule.color, kind: 'category' });
  }
  return tags;
}

/** Human-readable summary of the tags, or null when there are none. */
export function formatTokenTags(tags: TokenCategory[]): string | null {
  return tags.length ? tags.map(tag => tag.label).join(' \u00b7 ') : null;
}
