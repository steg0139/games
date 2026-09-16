// App version + friendly food codename.
//
// Releases get an alphabetical codename that cycles through food categories:
// fruits, then vegetables, then meats, then dairy, then grains, then wraps.
// Bump RELEASE by one each time you cut a release to advance the codename.
//
// The package version and git short SHA are injected at build time (see
// vite.config.ts define). The SHA uniquely identifies the exact deployed build
// for precise "are you on the latest?" checks; the codename is the human label.

// Increment this by 1 per release. 0 = the first name ("Apple").
export const RELEASE = 0;

// Ordered categories; names within each are alphabetical.
const CODENAMES: string[] = [
  // Fruits
  "Apple",
  "Apricot",
  "Banana",
  "Blueberry",
  "Cherry",
  "Clementine",
  "Date",
  "Elderberry",
  "Fig",
  "Grape",
  "Guava",
  "Honeydew",
  "Kiwi",
  "Lemon",
  "Lime",
  "Mango",
  "Nectarine",
  "Orange",
  "Papaya",
  "Peach",
  "Pear",
  "Plum",
  "Quince",
  "Raspberry",
  "Strawberry",
  "Tangerine",
  "Watermelon",
  // Vegetables
  "Artichoke",
  "Asparagus",
  "Beet",
  "Broccoli",
  "Carrot",
  "Celery",
  "Cucumber",
  "Eggplant",
  "Fennel",
  "Garlic",
  "Kale",
  "Leek",
  "Mushroom",
  "Onion",
  "Parsnip",
  "Pumpkin",
  "Radish",
  "Spinach",
  "Turnip",
  "Zucchini",
  // Meats
  "Bacon",
  "Beef",
  "Brisket",
  "Chicken",
  "Chorizo",
  "Duck",
  "Ham",
  "Lamb",
  "Pork",
  "Prosciutto",
  "Salami",
  "Sausage",
  "Turkey",
  "Venison",
  // Dairy
  "Brie",
  "Butter",
  "Cheddar",
  "Cream",
  "Feta",
  "Gouda",
  "Gruyere",
  "Havarti",
  "Kefir",
  "Mozzarella",
  "Parmesan",
  "Provolone",
  "Ricotta",
  "Yogurt",
  // Grains
  "Barley",
  "Buckwheat",
  "Bulgur",
  "Cornmeal",
  "Farro",
  "Millet",
  "Oats",
  "Quinoa",
  "Rice",
  "Rye",
  "Semolina",
  "Sorghum",
  "Spelt",
  "Wheat",
];

/** The codename for a given release index (wraps if it runs off the end). */
export function codenameFor(release: number): string {
  return CODENAMES[((release % CODENAMES.length) + CODENAMES.length) % CODENAMES.length];
}

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
export const APP_SHA = typeof __APP_SHA__ !== "undefined" ? __APP_SHA__ : "dev";
export const CODENAME = codenameFor(RELEASE);

/** Full label, e.g. `v0.1.0 "Apricot" · a1dcafe`. */
export const VERSION_LABEL = `v${APP_VERSION} "${CODENAME}" · ${APP_SHA}`;
