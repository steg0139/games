// Starter crossword puzzle library. Each puzzle is a list of {answer, clue}
// pairs; the layout generator arranges them into an interlocking grid at
// runtime. Answers are letters only, uppercase. Clues are hand-authored
// (Phase 1 starter set — not professional-grade; expand this list over time).

export interface WordClue {
  answer: string;
  clue: string;
}

export interface Puzzle {
  title: string;
  words: WordClue[];
}

export const PUZZLES: Puzzle[] = [
  {
    title: "Everyday",
    words: [
      { answer: "OREO", clue: "Black-and-white sandwich cookie" },
      { answer: "RIVER", clue: "Flowing body of water" },
      { answer: "APPLE", clue: "Fruit that keeps the doctor away" },
      { answer: "TIGER", clue: "Big striped cat" },
      { answer: "PIANO", clue: "88-key instrument" },
      { answer: "OCEAN", clue: "Vast body of salt water" },
      { answer: "LEMON", clue: "Sour yellow citrus" },
      { answer: "NIGHT", clue: "When the stars come out" },
      { answer: "EAGLE", clue: "Bird on the US seal" },
      { answer: "MANGO", clue: "Sweet tropical fruit" },
      { answer: "CANDLE", clue: "It burns with a wick" },
      { answer: "ROBOT", clue: "Automated machine" },
      { answer: "GARDEN", clue: "Where flowers grow" },
      { answer: "PLANET", clue: "Earth, for one" },
      { answer: "SILVER", clue: "Second-place metal" },
    ],
  },
  {
    title: "Kitchen",
    words: [
      { answer: "SPOON", clue: "Utensil for soup" },
      { answer: "PLATE", clue: "You eat off it" },
      { answer: "KNIFE", clue: "Cutting tool" },
      { answer: "SUGAR", clue: "Sweetener in the bowl" },
      { answer: "BREAD", clue: "Loaf staple" },
      { answer: "ONION", clue: "Layered bulb that brings tears" },
      { answer: "OVEN", clue: "Where you bake" },
      { answer: "PASTA", clue: "Italian noodle dish" },
      { answer: "KETTLE", clue: "It whistles when boiling" },
      { answer: "GRILL", clue: "Backyard cooking gear" },
      { answer: "BUTTER", clue: "Spread for toast" },
      { answer: "SALAD", clue: "Bowl of greens" },
      { answer: "PEPPER", clue: "Salt's partner" },
      { answer: "TEAPOT", clue: "Short and stout in a rhyme" },
    ],
  },
  {
    title: "Weather",
    words: [
      { answer: "CLOUD", clue: "It may bring rain" },
      { answer: "STORM", clue: "Violent weather event" },
      { answer: "THUNDER", clue: "Sound after lightning" },
      { answer: "BREEZE", clue: "Gentle wind" },
      { answer: "FROST", clue: "Icy morning coating" },
      { answer: "RAINBOW", clue: "Colorful arc after a shower" },
      { answer: "SUNNY", clue: "Clear-sky forecast" },
      { answer: "HUMID", clue: "Muggy and damp" },
      { answer: "SNOW", clue: "Winter's white blanket" },
      { answer: "WINDY", clue: "Kite-flying condition" },
      { answer: "DRIZZLE", clue: "Light rain" },
      { answer: "SEASON", clue: "Spring, summer, fall, or winter" },
    ],
  },
  {
    title: "Music",
    words: [
      { answer: "GUITAR", clue: "Six-string instrument" },
      { answer: "DRUM", clue: "You beat it to keep time" },
      { answer: "MELODY", clue: "The tune you hum" },
      { answer: "TEMPO", clue: "Speed of a piece" },
      { answer: "CHORD", clue: "Notes played together" },
      { answer: "VIOLIN", clue: "Bowed string instrument" },
      { answer: "LYRICS", clue: "The words of a song" },
      { answer: "ALBUM", clue: "Collection of tracks" },
      { answer: "TRUMPET", clue: "Brass instrument with valves" },
      { answer: "RHYTHM", clue: "The beat's pattern" },
      { answer: "OCTAVE", clue: "Eight-note interval" },
      { answer: "SINGER", clue: "Vocalist" },
    ],
  },
  {
    title: "Travel",
    words: [
      { answer: "AIRPORT", clue: "Where planes take off" },
      { answer: "TICKET", clue: "You need it to board" },
      { answer: "HOTEL", clue: "Place to stay overnight" },
      { answer: "BEACH", clue: "Sandy seaside spot" },
      { answer: "MAP", clue: "It shows the way" },
      { answer: "TRAIN", clue: "It runs on rails" },
      { answer: "LUGGAGE", clue: "Your packed bags" },
      { answer: "PASSPORT", clue: "Travel ID for abroad" },
      { answer: "ISLAND", clue: "Land surrounded by water" },
      { answer: "SUBWAY", clue: "Underground city train" },
      { answer: "TOURIST", clue: "Sightseeing visitor" },
      { answer: "CAMERA", clue: "It captures the memories" },
    ],
  },
  {
    title: "Space",
    words: [
      { answer: "COMET", clue: "Icy body with a tail" },
      { answer: "GALAXY", clue: "Star system like the Milky Way" },
      { answer: "ROCKET", clue: "It launches into orbit" },
      { answer: "METEOR", clue: "Shooting star" },
      { answer: "ORBIT", clue: "Path around a planet" },
      { answer: "SATURN", clue: "Planet with rings" },
      { answer: "LUNAR", clue: "Of the moon" },
      { answer: "NEBULA", clue: "Cloud of space gas and dust" },
      { answer: "STELLAR", clue: "Relating to stars; also, excellent" },
      { answer: "ASTEROID", clue: "Rocky object between Mars and Jupiter" },
      { answer: "SOLAR", clue: "Of the sun" },
      { answer: "MARS", clue: "The red planet" },
    ],
  },
  {
    title: "Sports",
    words: [
      { answer: "SOCCER", clue: "Football, outside the US" },
      { answer: "TENNIS", clue: "Racket game with a net" },
      { answer: "REFEREE", clue: "One who calls fouls" },
      { answer: "MEDAL", clue: "Olympic prize" },
      { answer: "GOALIE", clue: "Net-minder" },
      { answer: "INNING", clue: "Baseball division" },
      { answer: "RACKET", clue: "Tennis swinger" },
      { answer: "SPRINT", clue: "Short fast race" },
      { answer: "STADIUM", clue: "Big sports venue" },
      { answer: "HELMET", clue: "Head protection" },
      { answer: "ROOKIE", clue: "First-year player" },
      { answer: "TROPHY", clue: "Winner's cup" },
    ],
  },
  {
    title: "Nature",
    words: [
      { answer: "FOREST", clue: "Dense stand of trees" },
      { answer: "MEADOW", clue: "Grassy field" },
      { answer: "CANYON", clue: "Deep river-carved gorge" },
      { answer: "VALLEY", clue: "Low land between hills" },
      { answer: "STREAM", clue: "Small flowing waterway" },
      { answer: "BOULDER", clue: "Large rock" },
      { answer: "BLOSSOM", clue: "A tree's flower" },
      { answer: "MAPLE", clue: "Syrup-yielding tree" },
      { answer: "PEBBLE", clue: "Small smooth stone" },
      { answer: "SUMMIT", clue: "Mountain's peak" },
      { answer: "CAVERN", clue: "Large cave" },
      { answer: "PRAIRIE", clue: "Flat grassland" },
    ],
  },
];
