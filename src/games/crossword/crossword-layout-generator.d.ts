// Minimal typing for the untyped crossword-layout-generator package.
declare module "crossword-layout-generator" {
  interface LayoutInput {
    clue: string;
    answer: string;
  }
  interface LayoutResultItem {
    clue: string;
    answer: string;
    startx: number; // 1-based
    starty: number; // 1-based
    orientation: "across" | "down" | "none";
    position: number;
  }
  interface Layout {
    rows: number;
    cols: number;
    table: string[][];
    result: LayoutResultItem[];
  }
  export function generateLayout(input: LayoutInput[]): Layout;
  const _default: { generateLayout: typeof generateLayout };
  export default _default;
}
