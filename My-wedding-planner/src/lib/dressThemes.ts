// "What to wear" for each function: named colours, suggested themes per kind of
// function, and outfit ideas. Used by the planner's "For guests" form and the invitation.

export type NamedColor = { hex: string; name: string }

/** Colours families actually wear to Indian weddings, with friendly names. */
export const NAMED_COLORS: NamedColor[] = [
  { hex: '#F4C430', name: 'Haldi yellow' },
  { hex: '#FFB347', name: 'Marigold' },
  { hex: '#FF8C42', name: 'Saffron' },
  { hex: '#FFF1C9', name: 'Butter cream' },
  { hex: '#5E8C31', name: 'Mehendi green' },
  { hex: '#A8D5A2', name: 'Mint' },
  { hex: '#2E6B5E', name: 'Bottle green' },
  { hex: '#E0115F', name: 'Rani pink' },
  { hex: '#F4B6C2', name: 'Blush pink' },
  { hex: '#FFCBA4', name: 'Peach' },
  { hex: '#C8A2C8', name: 'Lilac' },
  { hex: '#6B3FA0', name: 'Royal purple' },
  { hex: '#B22222', name: 'Sindoori red' },
  { hex: '#7B1E3A', name: 'Maroon' },
  { hex: '#5C1A33', name: 'Wine' },
  { hex: '#1F3A93', name: 'Royal blue' },
  { hex: '#87CEEB', name: 'Sky blue' },
  { hex: '#008080', name: 'Teal' },
  { hex: '#D4AF37', name: 'Gold' },
  { hex: '#C0C0C0', name: 'Silver' },
  { hex: '#FFFFF0', name: 'Ivory' },
  { hex: '#F5F5DC', name: 'Beige' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#1A1A1A', name: 'Black' }
]

export const OUTFITS_HIM = ['Kurta-pyjama', 'Kurta with Nehru jacket', 'Sherwani', 'Bandhgala', 'Indo-western', 'Dhoti-kurta', 'Pathani suit', 'Suit']
export const OUTFITS_HER = ['Saree', 'Lehenga', 'Anarkali', 'Suit / salwar', 'Sharara', 'Gharara', 'Lehenga saree', 'Indo-western']

export type DressTheme = { theme: string; colors: string[]; him: string[]; her: string[] }

/** Ready-made looks; the first whose keywords match the function's name is suggested. */
export const THEME_PRESETS: (DressTheme & { keywords: RegExp })[] = [
  { keywords: /haldi|pithi|ubtan/i, theme: 'Sunshine yellow', colors: ['#F4C430', '#FFB347', '#FFF1C9'], him: ['Kurta-pyjama'], her: ['Suit / salwar', 'Anarkali'] },
  { keywords: /mehendi|mehndi|henna/i, theme: 'Mehendi green & pink', colors: ['#5E8C31', '#A8D5A2', '#E0115F'], him: ['Kurta-pyjama', 'Kurta with Nehru jacket'], her: ['Lehenga', 'Sharara'] },
  { keywords: /sangeet|cocktail|dj|night/i, theme: 'Jewel tones', colors: ['#1F3A93', '#6B3FA0', '#2E6B5E', '#D4AF37'], him: ['Indo-western', 'Bandhgala'], her: ['Lehenga', 'Indo-western'] },
  { keywords: /chowki|jagran|puja|pooja|path|havan|satsang/i, theme: 'Red & yellow', colors: ['#B22222', '#F4C430', '#FF8C42'], him: ['Kurta-pyjama'], her: ['Saree', 'Suit / salwar'] },
  { keywords: /engage|ring|roka|sagai/i, theme: 'Pastels', colors: ['#F4B6C2', '#FFCBA4', '#C8A2C8', '#A8D5A2'], him: ['Kurta with Nehru jacket', 'Indo-western'], her: ['Lehenga', 'Anarkali'] },
  { keywords: /reception/i, theme: 'Royal evening', colors: ['#1A1A1A', '#C0C0C0', '#1F3A93', '#5C1A33'], him: ['Suit', 'Bandhgala'], her: ['Saree', 'Indo-western'] },
  { keywords: /wedding|shaadi|vivah|phere|pheras|baraat/i, theme: 'Red & gold', colors: ['#7B1E3A', '#B22222', '#D4AF37', '#FFFFF0'], him: ['Sherwani', 'Kurta with Nehru jacket'], her: ['Lehenga', 'Saree'] }
]

/** Shown as quick picks even when the name matches nothing. */
export const THEME_CHOICES = THEME_PRESETS.map(({ theme, colors, him, her }) => ({ theme, colors, him, her }))

export function suggestedTheme(functionName: string): DressTheme | null {
  const p = THEME_PRESETS.find(t => t.keywords.test(functionName))
  return p ? { theme: p.theme, colors: p.colors, him: p.him, her: p.her } : null
}

const rgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Friendly name for a colour: its own name if it's one of ours, otherwise the closest. */
export function colorName(hex: string) {
  const exact = NAMED_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase())
  if (exact) return exact.name
  const [r, g, b] = rgb(hex)
  let best = NAMED_COLORS[0]
  let bestD = Infinity
  NAMED_COLORS.forEach(c => {
    const [r2, g2, b2] = rgb(c.hex)
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (d < bestD) { bestD = d; best = c }
  })
  return best.name
}

/** Light colours need a border to show on white. */
export function isLight(hex: string) {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 215
}

export const splitList = (s: string | null | undefined) => (s || '').split(',').map(x => x.trim()).filter(Boolean)
