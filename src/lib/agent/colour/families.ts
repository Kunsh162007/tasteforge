/**
 * Curated mapping from tag vocabulary to colour families (documented in CLAUDE.md, "Palette derivation").
 *
 * A family lists keywords (matched at word starts in a tag's name) and, per role, one or more HSL ranges:
 *   light  - a pale ground colour        mid  - a mid-tone support colour
 *   deep   - a dark anchor               accent - a saturated colour that must stand out from the rest
 * The derivation picks a value inside a range with a stable hash of the brief's evidence, so the same evidence
 * always gives the same colours and different evidence gives different ones.
 *
 * Ranges are hue [lo, hi] in degrees, saturation and lightness [lo, hi] in 0..1.
 * A keyword starting with "=" must be a whole word ("=classic" is not "classical"); keywords of three letters or
 * fewer are always whole words.
 */

export type Role = "light" | "mid" | "deep" | "accent";
type Range = readonly [number, number];
export type Tone = { readonly role: Role; readonly h: Range; readonly s: Range; readonly l: Range };

export type Family = {
  readonly id: string;
  /** How much a tag of this family counts (default 1). Words every venue uses ("casual", "welcoming") count little. */
  readonly weightScale?: number;
  /** Word-start keywords, lowercase. A tag matches when any keyword starts a word of its name. */
  readonly keywords: readonly string[];
  readonly tones: readonly Tone[];
};

const tone = (role: Role, h: Range, s: Range, l: Range): Tone => ({ role, h, s, l });

/**
 * Accent tones any family may borrow. A family's own accents define its character, but a palette whose evidence differs
 * should not always end in the same red: the hash of the evidence picks among the family's accents and these.
 */
export const SHARED_ACCENTS: readonly Tone[] = [
  tone("accent", [38, 44], [0.8, 0.92], [0.5, 0.58]),
  tone("accent", [178, 190], [0.55, 0.7], [0.32, 0.42]),
  tone("accent", [216, 228], [0.6, 0.75], [0.4, 0.5]),
  tone("accent", [150, 160], [0.5, 0.65], [0.3, 0.4]),
  tone("accent", [322, 334], [0.55, 0.7], [0.4, 0.5]),
  tone("accent", [68, 80], [0.5, 0.65], [0.38, 0.48]),
  tone("accent", [262, 276], [0.45, 0.6], [0.4, 0.5]),
  tone("accent", [4, 10], [0.65, 0.8], [0.56, 0.64]),
];

export const FAMILIES: readonly Family[] = [
  // ---- decor and ambience ----
  {
    id: "vintage-ochre",
    keywords: ["vintage", "retro", "antique", "nostalg", "old fashion", "heritage", "mid century", "=classic", "throwback", "70s", "60s", "thrift", "traditional", "histor"],
    tones: [
      tone("light", [34, 46], [0.25, 0.45], [0.84, 0.91]),
      tone("mid", [28, 40], [0.3, 0.5], [0.55, 0.66]),
      tone("deep", [18, 28], [0.3, 0.45], [0.2, 0.3]),
      tone("accent", [36, 46], [0.6, 0.78], [0.44, 0.54]),
      tone("accent", [8, 16], [0.5, 0.65], [0.42, 0.5]),
    ],
  },
  {
    id: "minimal-cool",
    keywords: ["minimal", "modern", "clean", "contemporary", "scandinav", "simple", "sleek", "bauhaus", "airy"],
    tones: [
      tone("light", [200, 220], [0.04, 0.12], [0.92, 0.97]),
      tone("mid", [205, 225], [0.05, 0.12], [0.55, 0.68]),
      tone("deep", [210, 225], [0.12, 0.2], [0.16, 0.24]),
      tone("accent", [205, 225], [0.38, 0.55], [0.34, 0.44]),
      tone("accent", [15, 25], [0.55, 0.7], [0.5, 0.58]),
    ],
  },
  {
    id: "warm-wood",
    keywords: ["cozy", "cosy", "rustic", "farmhouse", "cabin", "homey", "homely", "woods", "country", "comfort", "warm", "hygge", "fireplace"],
    tones: [
      tone("light", [30, 38], [0.3, 0.45], [0.82, 0.9]),
      tone("mid", [26, 34], [0.35, 0.5], [0.45, 0.56]),
      tone("deep", [20, 30], [0.35, 0.5], [0.26, 0.36]),
      tone("accent", [14, 22], [0.55, 0.7], [0.42, 0.52]),
      tone("accent", [36, 42], [0.65, 0.8], [0.46, 0.54]),
    ],
  },
  {
    id: "industrial-steel",
    keywords: ["industrial", "urban", "loft", "warehouse", "gritty", "edgy", "concrete", "brick", "metal", "steel", "raw", "factory"],
    tones: [
      tone("light", [200, 215], [0.04, 0.09], [0.8, 0.88]),
      tone("mid", [205, 220], [0.08, 0.16], [0.4, 0.52]),
      tone("deep", [215, 225], [0.08, 0.14], [0.14, 0.22]),
      tone("accent", [16, 28], [0.62, 0.8], [0.46, 0.55]),
      tone("accent", [42, 48], [0.7, 0.88], [0.5, 0.58]),
    ],
  },
  {
    id: "botanical-green",
    keywords: ["botanic", "plant", "garden", "green", "nature", "natural", "organic", "leaf", "jungle", "herb", "terrace", "patio", "eco"],
    tones: [
      tone("light", [85, 100], [0.15, 0.28], [0.88, 0.93]),
      tone("mid", [95, 115], [0.18, 0.3], [0.55, 0.66]),
      tone("deep", [140, 160], [0.35, 0.5], [0.16, 0.25]),
      tone("accent", [100, 130], [0.4, 0.58], [0.34, 0.44]),
      tone("accent", [352, 360], [0.55, 0.7], [0.5, 0.58]),
    ],
  },
  {
    id: "jewel-elegant",
    keywords: ["elegan", "upscale", "classy", "luxur", "sophisticat", "refined", "fine dining", "glamo", "posh", "formal", "high end", "fancy", "opulen", "art deco"],
    tones: [
      tone("light", [38, 46], [0.35, 0.5], [0.8, 0.88]),
      tone("mid", [345, 355], [0.2, 0.32], [0.45, 0.55]),
      tone("deep", [155, 165], [0.55, 0.7], [0.17, 0.25]),
      tone("deep", [345, 355], [0.5, 0.65], [0.18, 0.26]),
      tone("accent", [40, 46], [0.55, 0.7], [0.46, 0.56]),
      tone("accent", [345, 355], [0.6, 0.75], [0.32, 0.4]),
    ],
  },
  {
    id: "bohemian-spice",
    keywords: ["bohemi", "eclectic", "artsy", "colorful", "colourful", "quirky", "kitsch", "hippie", "whimsic", "funky", "maximal", "global", "ethnic", "cultural"],
    tones: [
      tone("light", [34, 42], [0.4, 0.55], [0.82, 0.9]),
      tone("mid", [175, 190], [0.3, 0.45], [0.35, 0.45]),
      tone("deep", [315, 335], [0.3, 0.45], [0.2, 0.3]),
      tone("accent", [38, 44], [0.8, 0.92], [0.5, 0.58]),
      tone("accent", [322, 338], [0.55, 0.7], [0.42, 0.52]),
    ],
  },
  {
    id: "coastal-blue",
    keywords: ["tropic", "beach", "nautical", "seaside", "coastal", "island", "ocean", "sea", "waterfront", "lakeside", "marina", "harbor", "harbour", "riverside"],
    tones: [
      tone("light", [40, 48], [0.3, 0.45], [0.88, 0.93]),
      tone("mid", [165, 180], [0.3, 0.45], [0.62, 0.74]),
      tone("deep", [212, 222], [0.5, 0.65], [0.18, 0.26]),
      tone("accent", [5, 14], [0.65, 0.8], [0.58, 0.66]),
      tone("accent", [190, 200], [0.7, 0.85], [0.4, 0.5]),
    ],
  },
  {
    id: "moody-plum",
    keywords: ["intimate", "romantic", "candle", "date", "lounge", "speakeasy", "moody", "dark", "sultry", "cocktail", "dive", "late night", "immersive", "dimly", "dim light"],
    tones: [
      tone("light", [10, 20], [0.25, 0.4], [0.82, 0.88]),
      tone("mid", [320, 335], [0.18, 0.3], [0.3, 0.4]),
      tone("deep", [300, 320], [0.25, 0.4], [0.12, 0.2]),
      tone("accent", [30, 38], [0.75, 0.9], [0.5, 0.58]),
      tone("accent", [352, 360], [0.55, 0.7], [0.36, 0.44]),
    ],
  },
  {
    id: "lively-bright",
    keywords: ["lively", "loud", "energetic", "party", "fun", "playful", "trendy", "hip", "vibrant", "hipster", "neon", "nightlife", "dance", "nightclub", "buzz", "festive", "social", "bustling"],
    tones: [
      tone("light", [40, 50], [0.2, 0.35], [0.93, 0.97]),
      tone("mid", [215, 230], [0.3, 0.45], [0.35, 0.45]),
      tone("deep", [225, 240], [0.35, 0.5], [0.14, 0.22]),
      tone("accent", [352, 360], [0.78, 0.9], [0.5, 0.58]),
      tone("accent", [222, 232], [0.7, 0.85], [0.45, 0.55]),
      tone("accent", [268, 282], [0.55, 0.7], [0.42, 0.52]),
    ],
  },
  {
    id: "calm-stone",
    keywords: ["quiet", "calm", "peace", "serene", "zen", "slow", "wabi", "japan", "ceramic", "mindful", "tranquil", "relax", "meditat", "sustainab", "craft", "handmade", "artisan"],
    tones: [
      tone("light", [40, 50], [0.15, 0.28], [0.9, 0.95]),
      tone("mid", [30, 40], [0.08, 0.16], [0.58, 0.68]),
      tone("deep", [220, 235], [0.3, 0.45], [0.18, 0.28]),
      tone("accent", [14, 24], [0.45, 0.62], [0.48, 0.58]),
      tone("accent", [96, 110], [0.22, 0.34], [0.42, 0.5]),
    ],
  },
  // ---- music ----
  {
    id: "indie-dusk",
    keywords: ["indie", "dream pop", "folk", "acoustic", "singer", "lo fi", "lofi", "bedroom", "shoegaze", "alternative", "chamber"],
    tones: [
      tone("light", [30, 42], [0.2, 0.35], [0.88, 0.93]),
      tone("mid", [200, 215], [0.25, 0.38], [0.58, 0.68]),
      tone("deep", [215, 230], [0.25, 0.4], [0.2, 0.3]),
      tone("accent", [40, 46], [0.65, 0.8], [0.52, 0.6]),
      tone("accent", [325, 340], [0.3, 0.45], [0.5, 0.6]),
    ],
  },
  {
    id: "jazz-brass",
    keywords: ["jazz", "blues", "soul", "swing", "bebop", "funk", "motown", "bossa"],
    tones: [
      tone("light", [36, 46], [0.2, 0.32], [0.84, 0.9]),
      tone("mid", [25, 35], [0.2, 0.3], [0.32, 0.42]),
      tone("deep", [225, 235], [0.45, 0.6], [0.14, 0.22]),
      tone("accent", [38, 44], [0.6, 0.75], [0.44, 0.54]),
      tone("accent", [352, 360], [0.5, 0.65], [0.34, 0.42]),
    ],
  },
  {
    id: "rock-ember",
    keywords: ["rock", "punk", "metal", "grunge", "hardcore", "garage", "emo", "goth"],
    tones: [
      tone("light", [20, 40], [0.04, 0.1], [0.82, 0.88]),
      tone("mid", [0, 20], [0.04, 0.1], [0.36, 0.46]),
      tone("deep", [0, 20], [0.05, 0.12], [0.08, 0.14]),
      tone("accent", [0, 8], [0.7, 0.85], [0.38, 0.46]),
      tone("accent", [28, 36], [0.8, 0.92], [0.48, 0.56]),
    ],
  },
  {
    id: "electronic-neon",
    keywords: ["electro", "techno", "house music", "deep house", "synth", "edm", "ambient", "disco", "trance", "dubstep", "idm", "downtempo", "chillwave"],
    tones: [
      tone("light", [230, 250], [0.1, 0.2], [0.9, 0.95]),
      tone("mid", [250, 270], [0.2, 0.32], [0.38, 0.48]),
      tone("deep", [250, 265], [0.35, 0.5], [0.1, 0.17]),
      tone("accent", [180, 190], [0.8, 0.95], [0.46, 0.54]),
      tone("accent", [315, 330], [0.75, 0.9], [0.5, 0.58]),
    ],
  },
  {
    id: "hiphop-gold",
    keywords: ["hip hop", "hiphop", "rap", "r b", "rnb", "trap", "grime", "drill"],
    tones: [
      tone("light", [30, 45], [0.08, 0.16], [0.82, 0.88]),
      tone("mid", [30, 40], [0.1, 0.2], [0.34, 0.44]),
      tone("deep", [20, 40], [0.06, 0.12], [0.1, 0.16]),
      tone("accent", [42, 48], [0.75, 0.9], [0.48, 0.56]),
      tone("accent", [275, 290], [0.5, 0.65], [0.38, 0.48]),
    ],
  },
  {
    id: "classical-ivory",
    keywords: ["classical", "orchestra", "opera", "baroque", "symphon", "piano", "choral"],
    tones: [
      tone("light", [42, 50], [0.3, 0.45], [0.9, 0.94]),
      tone("mid", [350, 360], [0.15, 0.25], [0.4, 0.5]),
      tone("deep", [345, 355], [0.45, 0.6], [0.16, 0.24]),
      tone("accent", [40, 46], [0.5, 0.65], [0.46, 0.56]),
    ],
  },
  {
    id: "country-leather",
    keywords: ["americana", "bluegrass", "western", "honky", "outlaw", "roots"],
    tones: [
      tone("light", [34, 42], [0.35, 0.5], [0.84, 0.9]),
      tone("mid", [24, 34], [0.4, 0.55], [0.4, 0.5]),
      tone("deep", [20, 28], [0.4, 0.55], [0.18, 0.26]),
      tone("accent", [208, 220], [0.4, 0.55], [0.36, 0.46]),
      tone("accent", [10, 18], [0.6, 0.75], [0.42, 0.5]),
    ],
  },
  {
    id: "island-sun",
    keywords: ["reggae", "latin", "salsa", "afrobeat", "caribbean", "calypso", "samba", "cumbia", "world"],
    tones: [
      tone("light", [44, 52], [0.4, 0.6], [0.88, 0.93]),
      tone("mid", [120, 140], [0.3, 0.45], [0.35, 0.45]),
      tone("deep", [150, 165], [0.45, 0.6], [0.14, 0.22]),
      tone("accent", [42, 48], [0.85, 0.95], [0.5, 0.58]),
      tone("accent", [2, 10], [0.7, 0.85], [0.45, 0.53]),
    ],
  },
  {
    id: "bollywood-spice",
    keywords: ["bollywood", "indian", "bhangra", "hindi", "punjabi", "desi", "ghazal", "carnatic", "hindustani", "sufi", "qawwali"],
    tones: [
      tone("light", [38, 46], [0.55, 0.75], [0.88, 0.93]),
      tone("mid", [14, 22], [0.5, 0.65], [0.42, 0.52]),
      tone("deep", [350, 358], [0.55, 0.7], [0.16, 0.24]),
      tone("accent", [40, 46], [0.88, 0.97], [0.5, 0.58]),
      tone("accent", [330, 342], [0.6, 0.75], [0.42, 0.5]),
    ],
  },
  {
    id: "pop-candy",
    keywords: ["pop", "k pop", "kpop", "j pop", "teen", "bubblegum", "synthpop"],
    tones: [
      tone("light", [335, 350], [0.5, 0.7], [0.92, 0.96]),
      tone("mid", [200, 215], [0.4, 0.55], [0.7, 0.8]),
      tone("deep", [255, 270], [0.35, 0.5], [0.22, 0.32]),
      tone("accent", [338, 350], [0.7, 0.85], [0.58, 0.66]),
      tone("accent", [175, 185], [0.55, 0.7], [0.45, 0.55]),
    ],
  },
  // ---- cuisine, drinks and venues ----
  {
    id: "coffee-mocha",
    keywords: ["coffee", "espresso", "cafe", "bakery", "pastry", "dessert", "cake", "brunch", "tea house", "chocolate"],
    tones: [
      tone("light", [36, 44], [0.35, 0.5], [0.88, 0.93]),
      tone("mid", [24, 32], [0.3, 0.42], [0.36, 0.46]),
      tone("deep", [18, 26], [0.3, 0.42], [0.14, 0.22]),
      tone("accent", [28, 34], [0.55, 0.7], [0.48, 0.58]),
      tone("accent", [150, 165], [0.35, 0.5], [0.28, 0.38]),
    ],
  },
  {
    id: "italian-tomato",
    keywords: ["italian", "pizza", "pasta", "trattoria", "osteria", "tuscan", "gelato", "neapolitan"],
    tones: [
      tone("light", [40, 48], [0.35, 0.5], [0.9, 0.94]),
      tone("mid", [75, 88], [0.25, 0.38], [0.34, 0.44]),
      tone("deep", [90, 105], [0.25, 0.38], [0.14, 0.22]),
      tone("accent", [4, 10], [0.7, 0.82], [0.44, 0.52]),
    ],
  },
  {
    id: "aegean-white",
    keywords: ["mediterran", "greek", "turkish", "lebanese", "levant", "middle eastern", "moroccan", "tapas", "spanish", "portugu"],
    tones: [
      tone("light", [40, 50], [0.15, 0.3], [0.93, 0.97]),
      tone("mid", [195, 210], [0.3, 0.45], [0.55, 0.65]),
      tone("deep", [215, 225], [0.55, 0.7], [0.22, 0.3]),
      tone("accent", [20, 30], [0.6, 0.75], [0.5, 0.58]),
      tone("accent", [42, 48], [0.75, 0.9], [0.5, 0.58]),
    ],
  },
  {
    id: "agave-fiesta",
    keywords: ["mexican", "taco", "taqueria", "tex mex", "peruvian", "cantina", "mezcal", "tequila", "burrito"],
    tones: [
      tone("light", [38, 46], [0.4, 0.55], [0.86, 0.92]),
      tone("mid", [150, 170], [0.3, 0.45], [0.3, 0.4]),
      tone("deep", [200, 215], [0.5, 0.65], [0.16, 0.24]),
      tone("accent", [330, 342], [0.7, 0.85], [0.46, 0.54]),
      tone("accent", [40, 46], [0.85, 0.95], [0.5, 0.58]),
    ],
  },
  {
    id: "lacquer-lime",
    keywords: ["vietnam", "thai", "pho", "banh", "cambodian", "lao", "indonesian", "malay", "southeast asian", "ramen", "korean", "chinese", "dim sum", "noodle", "sichuan", "szechuan", "asian"],
    tones: [
      tone("light", [48, 60], [0.25, 0.4], [0.9, 0.94]),
      tone("mid", [80, 95], [0.35, 0.5], [0.4, 0.5]),
      tone("deep", [175, 190], [0.45, 0.6], [0.14, 0.22]),
      tone("accent", [2, 8], [0.75, 0.88], [0.42, 0.5]),
      tone("accent", [72, 84], [0.6, 0.75], [0.48, 0.56]),
    ],
  },
  {
    id: "ink-shoji",
    keywords: ["sushi", "izakaya", "kaiseki", "sake", "matcha", "yakitori", "tempura", "omakase"],
    tones: [
      tone("light", [40, 50], [0.12, 0.24], [0.92, 0.96]),
      tone("mid", [100, 120], [0.1, 0.2], [0.4, 0.5]),
      tone("deep", [220, 235], [0.25, 0.4], [0.12, 0.2]),
      tone("accent", [352, 360], [0.65, 0.8], [0.44, 0.52]),
    ],
  },
  {
    id: "ember-char",
    keywords: ["steak", "bbq", "barbecue", "grill", "burger", "smokehouse", "chophouse", "roast", "american", "diner"],
    tones: [
      tone("light", [30, 40], [0.12, 0.22], [0.84, 0.9]),
      tone("mid", [14, 22], [0.3, 0.45], [0.32, 0.42]),
      tone("deep", [10, 20], [0.1, 0.2], [0.1, 0.16]),
      tone("accent", [10, 20], [0.75, 0.88], [0.46, 0.54]),
      tone("accent", [40, 46], [0.8, 0.92], [0.48, 0.56]),
    ],
  },
  {
    id: "wine-cellar",
    keywords: ["wine", "bar", "pub", "whisk", "bourbon", "brewery", "beer", "gastropub", "taproom", "cellar", "vermouth"],
    tones: [
      tone("light", [30, 40], [0.2, 0.32], [0.84, 0.9]),
      tone("mid", [350, 360], [0.3, 0.45], [0.3, 0.4]),
      tone("deep", [345, 355], [0.5, 0.65], [0.14, 0.22]),
      tone("accent", [36, 42], [0.65, 0.8], [0.46, 0.54]),
      tone("accent", [160, 170], [0.35, 0.5], [0.3, 0.4]),
    ],
  },
  {
    id: "fresh-leaf",
    keywords: ["vegan", "vegetarian", "salad", "healthy", "juice", "wellness", "smoothie", "farm to table", "plant based", "yoga", "fitness"],
    tones: [
      tone("light", [70, 90], [0.2, 0.35], [0.92, 0.96]),
      tone("mid", [100, 125], [0.25, 0.4], [0.5, 0.62]),
      tone("deep", [150, 165], [0.35, 0.5], [0.18, 0.28]),
      tone("accent", [12, 22], [0.7, 0.85], [0.55, 0.62]),
      tone("accent", [45, 52], [0.8, 0.92], [0.52, 0.6]),
    ],
  },
  {
    id: "library-green",
    keywords: ["book", "library", "literar", "reading", "poetry", "writer", "study", "academic", "scholar", "film", "cinema", "theatre", "theater"],
    tones: [
      tone("light", [38, 46], [0.3, 0.42], [0.86, 0.91]),
      tone("mid", [22, 30], [0.3, 0.42], [0.3, 0.4]),
      tone("deep", [155, 168], [0.4, 0.55], [0.14, 0.22]),
      tone("accent", [40, 46], [0.6, 0.75], [0.46, 0.54]),
      tone("accent", [350, 358], [0.5, 0.65], [0.3, 0.38]),
    ],
  },
  {
    id: "gallery-vermilion",
    keywords: ["gallery", "museum", "design", "creative", "studio", "architect", "photograph", "painter", "illustrat", "fashion", "boutique", "stylish", "=chic", "polished"],
    tones: [
      tone("light", [40, 55], [0.05, 0.12], [0.94, 0.97]),
      tone("mid", [30, 45], [0.04, 0.1], [0.52, 0.62]),
      tone("deep", [220, 235], [0.1, 0.2], [0.1, 0.18]),
      tone("accent", [8, 14], [0.75, 0.88], [0.5, 0.58]),
      tone("accent", [218, 230], [0.6, 0.75], [0.4, 0.5]),
    ],
  },
  {
    id: "trail-pine",
    keywords: ["outdoor", "hiking", "adventure", "camping", "trail", "mountain", "climb", "cycling", "surf", "skate", "travel"],
    tones: [
      tone("light", [40, 50], [0.18, 0.3], [0.88, 0.93]),
      tone("mid", [200, 212], [0.1, 0.18], [0.4, 0.5]),
      tone("deep", [155, 168], [0.35, 0.5], [0.16, 0.24]),
      tone("accent", [22, 30], [0.8, 0.92], [0.5, 0.58]),
    ],
  },
  {
    id: "pixel-glow",
    keywords: ["gamer", "gaming", "esport", "arcade", "anime", "geek", "tech", "startup", "developer", "cyber", "sci fi"],
    tones: [
      tone("light", [230, 250], [0.1, 0.2], [0.9, 0.95]),
      tone("mid", [255, 270], [0.25, 0.4], [0.4, 0.5]),
      tone("deep", [245, 260], [0.4, 0.55], [0.1, 0.16]),
      tone("accent", [160, 170], [0.8, 0.95], [0.44, 0.52]),
      tone("accent", [300, 320], [0.7, 0.85], [0.52, 0.6]),
    ],
  },
  {
    id: "easy-linen",
    weightScale: 0.3,
    keywords: ["casual", "informal", "charming", "welcoming", "friendly", "laid back", "easygoing", "unpretentious", "unique", "authentic", "local", "inviting", "pleasant"],
    tones: [
      tone("light", [38, 46], [0.2, 0.35], [0.88, 0.93]),
      tone("mid", [90, 110], [0.1, 0.2], [0.55, 0.65]),
      tone("deep", [212, 222], [0.3, 0.45], [0.2, 0.3]),
      tone("accent", [12, 20], [0.5, 0.65], [0.48, 0.56]),
      tone("accent", [38, 44], [0.7, 0.85], [0.5, 0.58]),
    ],
  },
  {
    id: "family-sunny",
    keywords: ["family", "kids", "child", "toddler", "school", "playground", "parent", "student", "college", "campus", "young professional", "millennial", "gen z"],
    tones: [
      tone("light", [44, 52], [0.5, 0.7], [0.9, 0.95]),
      tone("mid", [195, 205], [0.4, 0.55], [0.62, 0.72]),
      tone("deep", [215, 225], [0.4, 0.55], [0.26, 0.36]),
      tone("accent", [12, 20], [0.75, 0.88], [0.56, 0.64]),
      tone("accent", [140, 152], [0.4, 0.55], [0.45, 0.55]),
    ],
  },
];

/** Lowercase letters and digits only, single spaces, with a leading space so keywords can anchor at word starts. */
export const normaliseTagName = (name: string): string =>
  ` ${name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

/** Keywords this short must be a whole word ("bar" is not "barbecue", "pub" is not "public"). */
const WHOLE_WORD_MAX_CHARS = 3;

function matches(text: string, keyword: string): boolean {
  const exact = keyword.startsWith("=");
  const k = keyword.replace(/[^a-z0-9 ]+/g, " ").trim();
  return exact || k.length <= WHOLE_WORD_MAX_CHARS ? `${text} `.includes(` ${k} `) : text.includes(` ${k}`);
}

/** The families whose keywords start a word of the tag name (short keywords must be the whole word). */
export function familiesFor(name: string): readonly Family[] {
  const text = normaliseTagName(name);
  return FAMILIES.filter((f) => f.keywords.some((k) => matches(text, k)));
}
