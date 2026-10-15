import type { Token } from './types.js';

export interface NarrativeTag {
  tag: string;
  label: string;
}

const themes: { tag: string; label: string; words: string[] }[] = [
  { tag: 'ELON', label: 'Elon / Musk narrative', words: ['elon', 'musk', 'tesla', 'doge', 'mars', 'spacex', 'xai', 'groq'] },
  { tag: 'TRUMP', label: 'Trump / politics narrative', words: ['trump', 'maga'] },
  { tag: 'AI', label: 'AI / agent narrative', words: ['agent', 'neural', 'gpt', 'llm', 'agi', 'openai', 'autonomous', 'robotics'] }
];

/**
 * Name/symbol keyword matches are hype proxies. They indicate that a coin is
 * riding a known narrative; they are not proof that a specific person tweeted
 * about it or that the token will move.
 */
export function narrativeTags(token: Token): NarrativeTag[] {
  const haystack = `${token.name} ${token.symbol}`.toLowerCase();
  return themes.filter(theme => theme.words.some(word => haystack.includes(word))).map(({ tag, label }) => ({ tag, label }));
}
