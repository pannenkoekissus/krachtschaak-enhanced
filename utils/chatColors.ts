export const DEFAULT_CHAT_COLOR = '#38bdf8'; // Sky Blue default

export const CHAT_COLOR_PALETTE = [
  '#38bdf8', // Sky Blue
  '#4ade80', // Emerald Green
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#fbbf24', // Amber / Gold
  '#2dd4bf', // Teal
  '#fb923c', // Orange
  '#ec4899', // Pink
  '#818cf8', // Indigo
  '#a3e635', // Lime
  '#06b6d4', // Cyan
  '#f472b6', // Light Pink
  '#e879f9', // Fuchsia
  '#34d399', // Mint
  '#facc15', // Yellow
];

/**
 * Returns a random chat color from the curated palette.
 */
export function getRandomChatColor(): string {
  const index = Math.floor(Math.random() * CHAT_COLOR_PALETTE.length);
  return CHAT_COLOR_PALETTE[index] || DEFAULT_CHAT_COLOR;
}

/**
 * Deterministically generates a color for a user ID or name if no custom color is set.
 * Backwards compatible with legacy messages lacking a color field or null/undefined sender information.
 */
export function getDeterministicChatColor(uidOrName?: string | null): string {
  if (!uidOrName || typeof uidOrName !== 'string' || !uidOrName.trim()) {
    return DEFAULT_CHAT_COLOR;
  }
  let hash = 0;
  for (let i = 0; i < uidOrName.length; i++) {
    hash = uidOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CHAT_COLOR_PALETTE.length;
  return CHAT_COLOR_PALETTE[index] || DEFAULT_CHAT_COLOR;
}
