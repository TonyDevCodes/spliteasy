// Expense categories: one fixed list, stored as a key in expenses.category.
// mobile/lib/categories.ts is an identical copy of this file.
// Icons are kept as names only (Lucide on web, Ionicons on mobile); each app
// maps the name to a component, so this file stays free of UI imports.

export type CategoryKey =
  | "food"
  | "transport"
  | "housing"
  | "shopping"
  | "entertainment"
  | "travel"
  | "bills"
  | "other";

export type Category = {
  key: CategoryKey;
  label: string;
  color: string;
  /** Lucide icon name (web). */
  icon: string;
  /** Ionicons icon name (mobile). */
  ionIcon: string;
};

export const CATEGORIES: readonly Category[] = [
  { key: "food", label: "Food & drinks", color: "#F59E0B", icon: "Utensils", ionIcon: "restaurant-outline" },
  { key: "transport", label: "Transport", color: "#3B82F6", icon: "Car", ionIcon: "car-outline" },
  { key: "housing", label: "Housing", color: "#6366F1", icon: "Home", ionIcon: "home-outline" },
  { key: "shopping", label: "Shopping", color: "#EC4899", icon: "ShoppingBag", ionIcon: "bag-outline" },
  { key: "entertainment", label: "Entertainment", color: "#FB7185", icon: "Ticket", ionIcon: "ticket-outline" },
  { key: "travel", label: "Travel", color: "#06B6D4", icon: "Plane", ionIcon: "airplane-outline" },
  { key: "bills", label: "Bills", color: "#64748B", icon: "Receipt", ionIcon: "receipt-outline" },
  { key: "other", label: "Other", color: "#9CA3AF", icon: "MoreHorizontal", ionIcon: "ellipsis-horizontal" },
];

export const DEFAULT_CATEGORY_KEY: CategoryKey = "other";

const OTHER = CATEGORIES[CATEGORIES.length - 1];

export function isValidCategory(key: unknown): key is CategoryKey {
  return typeof key === "string" && CATEGORIES.some((c) => c.key === key);
}

/** The category for a stored key; null, empty or unknown keys give "other". */
export function getCategory(key: string | null | undefined): Category {
  return CATEGORIES.find((c) => c.key === key) ?? OTHER;
}

// Keywords (English and Albanian, written without diacritics) used to guess a
// category for old expenses that have none. Matching is per word: a keyword
// starting with "=" must equal the word, keywords up to 3 letters likewise,
// 4-5 letters match as a word prefix (taxi -> taxis) and longer ones anywhere
// in the word (museum -> rijksmuseum). The first category that matches wins.
const KEYWORDS: readonly (readonly [CategoryKey, readonly string[]])[] = [
  [
    "food",
    [
      "dinner", "lunch", "breakfast", "brunch", "food", "coffee", "restaurant", "cafe", "pizza", "burger",
      "drink", "beer", "wine", "groceries", "grocery", "supermarket", "snack", "bakery", "sushi", "bar",
      "darke", "dreke", "mengjes", "kafe", "ushqim", "restorant", "pije", "birre", "vere", "buke",
    ],
  ],
  [
    "transport",
    [
      "train", "taxi", "bus", "uber", "bolt", "fuel", "petrol", "gas", "parking", "metro", "tram", "toll",
      "car", "tren", "taksi", "autobus", "benzine", "nafte", "karburant", "makine",
    ],
  ],
  ["housing", ["airbnb", "hotel", "rent", "hostel", "apartment", "qira", "shtepi", "banese", "apartament"]],
  [
    "entertainment",
    [
      "ticket", "museum", "cinema", "movie", "concert", "theatre", "theater", "party", "game", "club",
      "bilet", "muze", "kinema", "koncert", "teater", "festival",
    ],
  ],
  [
    "travel",
    ["flight", "trip", "travel", "vacation", "holiday", "luggage", "fluturim", "udhetim", "aeroplan", "pushime"],
  ],
  [
    "bills",
    [
      "=bill", "=bills", "electricity", "internet", "water", "phone", "insurance", "subscription", "utilities",
      "fature", "rryme", "uji", "sigurim", "abonim",
    ],
  ],
  [
    "shopping",
    ["shopping", "clothes", "gift", "amazon", "mall", "shoes", "store", "blerje", "dhurate", "rroba", "dyqan"],
  ],
];

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function wordMatches(word: string, keyword: string): boolean {
  if (keyword.startsWith("=")) return word === keyword.slice(1);
  if (keyword.length <= 3) return word === keyword;
  if (keyword.length <= 5) return word.startsWith(keyword);
  return word.includes(keyword);
}

/** Best guess for an expense without a stored category; "other" when nothing matches. */
export function inferCategoryFromTitle(title: string | null | undefined): Category {
  const words = normalize(title ?? "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const [key, keywords] of KEYWORDS) {
    if (words.some((word) => keywords.some((keyword) => wordMatches(word, keyword)))) {
      return getCategory(key);
    }
  }
  return OTHER;
}

/** The stored category when there is one, otherwise a guess from the description. */
export function categoryForExpense(expense: { category?: string | null; description: string }): Category {
  return expense.category ? getCategory(expense.category) : inferCategoryFromTitle(expense.description);
}
