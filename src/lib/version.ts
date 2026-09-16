// App version + friendly food codename.
//
// Releases get an alphabetical codename that cycles through food categories:
// fruits, then vegetables, then meats, then dairy, then grains, then wraps.
//
// The release index advances automatically — one bump per CI deploy — derived
// from the count of release-* git tags and injected at build time (see
// vite.config.ts / deploy workflow). Local builds fall back to 0 ("Apple").
// The package version and git short SHA are also injected at build time; the
// SHA identifies the exact deployed build for precise "latest?" checks.

export const RELEASE =
  typeof __APP_RELEASE__ !== "undefined" ? __APP_RELEASE__ : 0;

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

/** Visible label, e.g. `Apricot · a1dcafe` (codename + build SHA). The
 *  package.json semantic version (APP_VERSION) is kept for internal reference
 *  but intentionally not shown, since it's bumped manually. */
export const VERSION_LABEL = `${CODENAME} · ${APP_SHA}`;
