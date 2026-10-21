import { distance } from "./math";

/**
 * Designer-style names for the code-derived colours. The model normally names the swatches itself; this table is the
 * fallback (refine runs, a reply that is missing or reuses a tag name) so a swatch always has a real colour name.
 */
const NAMED: readonly (readonly [string, string])[] = [
  ["Bone linen", "#E9E1D0"], ["Warm ivory", "#F1EAD8"], ["Oat milk", "#E6D9C0"], ["Rice paper", "#EFE8D8"], ["Chalk white", "#F2F0EA"],
  ["Cool porcelain", "#E8ECEE"], ["Fog grey", "#C9CED2"], ["Pale concrete", "#BFC3C4"], ["Warm grey", "#A39E96"], ["Greige stone", "#B3A999"],
  ["Dove grey", "#8F9396"], ["Slate", "#5B6670"], ["Steel", "#4C5660"], ["Charcoal", "#2F3338"], ["Graphite", "#3A3D42"], ["Ink black", "#16181C"],
  ["Midnight ink", "#1C2333"], ["Deep indigo", "#26305A"], ["Walnut", "#5A3E2B"], ["Espresso", "#3B2A20"], ["Mocha", "#6B4A38"],
  ["Chestnut", "#7A4B33"], ["Caramel", "#B9803F"], ["Tan leather", "#A67B4F"], ["Sand", "#D6C3A1"], ["Dune", "#C8B28E"], ["Driftwood", "#9A8A76"],
  ["Cork", "#B88C5E"], ["Clay terracotta", "#B8654A"], ["Burnt sienna", "#A5532F"], ["Rust", "#9E4A2B"], ["Brick red", "#8E3B33"], ["Oxblood", "#5E1F26"],
  ["Burgundy", "#6B1F2E"], ["Wine", "#722F37"], ["Cherry lacquer", "#A3202C"], ["Chilli red", "#B3261E"], ["Vermilion", "#D2492A"], ["Persimmon", "#D9692F"],
  ["Coral", "#E26D5A"], ["Salmon pink", "#E39B8B"], ["Dusty rose", "#C9A0A0"], ["Blush", "#EBC9C0"], ["Peach", "#EDB48C"], ["Apricot", "#E8A765"],
  ["Marigold", "#E4A11B"], ["Saffron", "#EBA10F"], ["Mustard", "#C9A227"], ["Ochre", "#B58A2E"], ["Faded ochre", "#C2A05A"], ["Honey", "#D7A84A"],
  ["Brass", "#B08D3C"], ["Gold leaf", "#C9A64B"], ["Butter", "#EFD98A"], ["Sage", "#A3B18A"], ["Soft sage", "#B7C2A0"], ["Moss", "#6B7A3F"],
  ["Olive", "#6E6B34"], ["Fern", "#4F7A47"], ["Forest", "#1F3D2B"], ["Bottle green", "#1E3A2C"], ["Emerald", "#1B6B4B"], ["Jade", "#3E8E70"],
  ["Mint", "#BFDCC8"], ["Seafoam", "#9CCBBF"], ["Eucalyptus", "#7C9A8B"], ["Lime zest", "#A8C23D"], ["Pine", "#234B3B"], ["Deep teal", "#1F5A5C"],
  ["Teal", "#2A7A7A"], ["Aegean blue", "#1F6FA3"], ["Cobalt", "#2B4FA8"], ["Sapphire", "#1F3F7A"], ["Navy", "#1B2A4A"], ["Denim", "#4B6A8F"],
  ["Dusty blue", "#8FA7BB"], ["Powder blue", "#BCD0E0"], ["Sky", "#8EC1E3"], ["Duck egg", "#B8D3CF"], ["Electric cyan", "#17C3D1"], ["Slate blue", "#5D6D8E"],
  ["Aubergine", "#3F1F40"], ["Plum", "#5B2A5E"], ["Mauve", "#9C7A8E"], ["Lavender", "#B5A8D0"], ["Violet", "#6A3FA0"], ["Magenta", "#B02A7A"],
  ["Hot pink", "#E0457B"], ["Rosewood", "#65323A"], ["Cream", "#F3ECD6"], ["Parchment", "#EADFC4"], ["Shell pink", "#F0DCD5"], ["Mist blue", "#DCE6EC"],
];

/** Names in closeness order for a hex. */
export function nearestNames(hex: string, count = 4): string[] {
  return [...NAMED]
    .sort((a, b) => distance(hex, a[1]) - distance(hex, b[1]))
    .slice(0, count)
    .map(([name]) => name);
}

/** The closest colour name for `hex` that is not in `taken` (names compare case-insensitively). */
export function colourName(hex: string, taken: ReadonlySet<string> = new Set()): string {
  const free = nearestNames(hex, NAMED.length).find((n) => !taken.has(n.toLowerCase()));
  return free ?? hex.toUpperCase();
}
