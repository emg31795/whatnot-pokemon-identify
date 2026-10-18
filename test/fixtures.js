// Shared PPT-row fixtures for test/alakazam.test.js.
//
// Every Alakazam row below is REAL data, captured 2026-10-15 from
// PPT (`GET /api/v2/cards?search=Alakazam%20Expedition&limit=30`) and from
// TCGplayer's own catalog — not hand-invented. The two Expedition rows are
// the exact pair from requestId f033dcfe. Filler rows reproduce the names
// and numbers logged in that scan's own "scored candidates" line so page 1
// comes back FULL (30 rows), which is what triggers the page-2 fetch.

const ALAKAZAM_33 = {
  tcgPlayerId: "83500",
  setName: "Expedition",
  name: "Alakazam (33)",
  cardNumber: "033/165",
  totalSetNumber: null,
  rarity: "Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: [
    "[2P] Syncroblast (80)\r\n<br>If Alakazam and the Defending Pokémon don't have the same number of Energy cards attached to them, this attack's base damage is 20 instead of 80.",
  ],
  pokemonType: "Psychic",
  flavorText: "<em>ID: B-84-#</em>",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/83500",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/83500_in_800x800.jpg",
  prices: { market: 21.37, primaryPrinting: "Normal", listings: 67 },
  printingsAvailable: ["Reverse Holofoil", "Normal"],
};

const ALAKAZAM_1 = {
  tcgPlayerId: "83497",
  setName: "Expedition",
  name: "Alakazam (1)",
  cardNumber: "001/165",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: [
    "[2P] Syncroblast (80)\r\n<br>If Alakazam and the Defending Pokémon don't have the same number of Energy cards attached to them, this attack's base damage is 20 instead of 80.",
  ],
  pokemonType: "Psychic",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/83497",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/83497_in_800x800.jpg",
  prices: { market: 250.0, primaryPrinting: "Holofoil", listings: 41 },
  printingsAvailable: ["Reverse Holofoil", "Holofoil"],
};

// Skyridge pair — the H-numbered shape (holo sibling uses H01/H32, which is
// why Aquapolis/Skyridge are structurally safer than Expedition).
const SKY_ALAKAZAM_2 = {
  tcgPlayerId: "84001",
  setName: "Skyridge",
  name: "Alakazam (2)",
  cardNumber: "002/144",
  rarity: "Rare",
  cardType: "Pokemon",
  hp: "100",
  attacks: ["[2P] Energy Crush (20x)\r\n<br>Does 20 damage times the number of Energy cards attached to the Defending Pokemon."],
  prices: { market: 18.5, primaryPrinting: "Normal" },
  printingsAvailable: ["Reverse Holofoil", "Normal"],
};

const SKY_ALAKAZAM_H1 = {
  tcgPlayerId: "84002",
  setName: "Skyridge",
  name: "Alakazam (H1)",
  cardNumber: "H01/H32",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  attacks: ["[2P] Energy Crush (20x)\r\n<br>Does 20 damage times the number of Energy cards attached to the Defending Pokemon."],
  prices: { market: 120.0, primaryPrinting: "Holofoil" },
  printingsAvailable: ["Reverse Holofoil", "Holofoil"],
};

// Names/numbers lifted verbatim from f033dcfe's "scored candidates" log line.
const LOGGED_FILLER = [
  ["Alakazam V - SWSH083", "SWSH083", "190", "Promo", "SWSH: Sword & Shield Promo Cards", "228980"],
  ["Alakazam V - SWSH083", "SWSH083", "190", "Promo", "Jumbo Cards", "228981"],
  ["Alakazam (H1)", "H01/H32", "100", "Holo Rare", "Aquapolis", "83301"],
  ["Alakazam Star", "99/100", "80", "Ultra Rare", "EX Team Rocket Returns", "11111"],
  ["Alakazam Spirit Link", "90/124", null, "Uncommon", "XY Fates Collide", "11112"],
  ["Alakazam E4", "38/111", "80", "Uncommon", "EX Unseen Forces", "11113"],
  ["M Alakazam EX", "26/124", "210", "Ultra Rare", "XY Fates Collide", "11114"],
  ["Alakazam EX", "25/124", "160", "Ultra Rare", "XY Fates Collide", "11115"],
  ["Alakazam ex", "215/091", "310", "Shiny Ultra Rare", "SV Shrouded Fable", "11116"],
  ["Alakazam ex - 201/165", "201/165", "310", "Special Illustration Rare", "SV 151", "11117"],
  ["Alakazam", "2/123", "100", "Holo Rare", "DP Mysterious Treasures", "11118"],
  ["Alakazam ex - 188/165", "188/165", "310", "Ultra Rare", "SV 151", "11119"],
  ["Dark Alakazam (18)", "18/82", "60", "Rare", "Team Rocket", "11120"],
  ["Alakazam V (Full Art)", "172/185", "190", "Ultra Rare", "SWSH Vivid Voltage", "11121"],
  ["Alakazam EX (Secret)", "125/124", "160", "Secret Rare", "XY Fates Collide", "11122"],
  ["M Alakazam EX (Full Art)", "118/124", "210", "Ultra Rare", "XY Fates Collide", "11123"],
  ["Alakazam EX (Full Art)", "117/124", "160", "Ultra Rare", "XY Fates Collide", "11124"],
];

function fillerRow([name, cardNumber, hp, rarity, setName, tcgPlayerId]) {
  return {
    tcgPlayerId,
    setName,
    name,
    cardNumber,
    rarity,
    cardType: "Pokemon",
    hp,
    attacks: ["[P] Psychic (20)\r\n<br>Unrelated filler attack."],
    prices: { market: 5.0, primaryPrinting: "Holofoil" },
    printingsAvailable: ["Holofoil"],
  };
}

function padTo(rows, n, seedName) {
  const out = rows.slice();
  let i = 0;
  while (out.length < n) {
    out.push(
      fillerRow([`${seedName} Pad ${i}`, `${900 + i}/999`, "70", "Common", "Filler Set", `9000${i}`])
    );
    i += 1;
  }
  return out;
}

// Real Expedition pair where BOTH siblings are non-holo Rares (036/165 and
// 037/165, productIds 83889/83890 from TCGplayer's own catalog). Proves the
// sibling cap is not a holo-vs-non-holo special case.
const BLASTOISE_36 = {
  tcgPlayerId: "83889",
  setName: "Expedition",
  name: "Blastoise (36)",
  cardNumber: "036/165",
  rarity: "Rare",
  cardType: "Pokemon",
  hp: "90",
  attacks: ["[2W] Hydro Pump (40+)\r\n<br>Does 40 damage plus 10 more for each Water Energy."],
  prices: { market: 24.0, primaryPrinting: "Normal" },
  printingsAvailable: ["Reverse Holofoil", "Normal"],
};

const BLASTOISE_37 = {
  tcgPlayerId: "83890",
  setName: "Expedition",
  name: "Blastoise (37)",
  cardNumber: "037/165",
  rarity: "Rare",
  cardType: "Pokemon",
  hp: "90",
  attacks: ["[2W] Hydro Pump (40+)\r\n<br>Does 40 damage plus 10 more for each Water Energy."],
  prices: { market: 31.5, primaryPrinting: "Normal" },
  printingsAvailable: ["Reverse Holofoil", "Normal"],
};

// Real SV03 Obsidian Flames Charizard ex rows, captured from PPT 2026-10-15.
// This is the modern twin class the #104 scope correction is about: because
// candidateSiblingBaseName strips the " - 125/197" suffix, every one of these
// is a sibling of the others. Charizard ex alone has FOUR same-set versions,
// and 19 popular modern names yielded 92 such pairs.
const CHARIZARD_EX_125 = {
  tcgPlayerId: "509879",
  setName: "SV03: Obsidian Flames",
  name: "Charizard ex - 125/197",
  cardNumber: "125/197",
  rarity: "Double Rare",
  cardType: "Pokemon",
  hp: "330",
  attacks: ["[2RR] Burning Darkness (180+)\r\n<br>Does 30 more damage for each Prize card your opponent has taken."],
  prices: { market: 5.27, primaryPrinting: "Holofoil", listings: 410 },
  printingsAvailable: ["Holofoil"],
};

const CHARIZARD_EX_223 = {
  tcgPlayerId: "509980",
  setName: "SV03: Obsidian Flames",
  name: "Charizard ex - 223/197",
  cardNumber: "223/197",
  rarity: "Special Illustration Rare",
  cardType: "Pokemon",
  hp: "330",
  attacks: ["[2RR] Burning Darkness (180+)\r\n<br>Does 30 more damage for each Prize card your opponent has taken."],
  prices: { market: 94.62, primaryPrinting: "Holofoil", listings: 120 },
  printingsAvailable: ["Holofoil"],
};

// Same pair with the pricier twin's market missing — the real "Judge 167/182"
// shape (siblingMarkets=[null,null,19.88]), where we cannot prove the winner
// is the cheap one and so must fall to the capping side.
const CHARIZARD_EX_223_NO_MARKET = {
  ...CHARIZARD_EX_223,
  prices: { primaryPrinting: "Holofoil", listings: 120 },
};


// Real rows from PPT's Japanese catalog, captured 2026-10-18 during the
// Meganium investigation (search=Meganium&language=japanese). The three
// HP-100 Ken Sugimori rows all carry an EMPTY cardNumber, because Japanese
// Neo-era cards print no collector number at all — the only number on the
// card is the Pokedex "No. 154".
const MEGANIUM_NEO_JP = {
  tcgPlayerId: "575820",
  setName: "Gold, Silver, to a New World...",
  name: "Meganium",
  cardNumber: "",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: ["[Grass][Grass][Grass][Grass] Soothing Scent (40)<br> The Defending Pok?mon is now Asleep."],
  pokedexNumbers: [154],
  artist: "Ken Sugimori",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/575820",
  prices: { market: 18.14, primaryPrinting: "Holofoil" },
  printingsAvailable: ["Holofoil"],
};

const MEGANIUM_BEP_102 = {
  tcgPlayerId: "576020",
  setName: "Base Expansion Pack",
  name: "Meganium - 102/128",
  cardNumber: "102/128",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: ["[Grass][Grass][Colorless][Colorless] Poisonpowder (40)<br> The Defending Pok?mon is now Poisoned."],
  pokedexNumbers: [154],
  artist: "Hajime Kusajima",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/576020",
  prices: { market: null, primaryPrinting: "1st Edition Holofoil" },
  printingsAvailable: ["1st Edition Holofoil", "Normal"],
};

// SV2a: Pokemon Card 151 prints its collector number as "No. XXX" — a
// Pokedex-order homage — so for these cards the card number and the
// Pokedex number are THE SAME VALUE by design. This is the card behind the
// 2026-09-26 NUMBER_LABEL_PATTERN fix (a real Japanese Lapras, Master Ball
// Pattern), and the reason Pokedex classification can only ever run after
// retrieval has failed to match the number.
const LAPRAS_SV2A_131 = {
  tcgPlayerId: "517994",
  setName: "SV2a: Pokemon Card 151",
  name: "Lapras",
  cardNumber: "131/165",
  totalSetNumber: null,
  rarity: "Common",
  cardType: "Pokemon",
  hp: "140",
  stage: "Basic",
  attacks: ["[Water][Colorless][Colorless] Hydro Pump (80+)"],
  pokedexNumbers: [131],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/517994",
  prices: { market: 21.88, primaryPrinting: "Normal" },
  printingsAvailable: ["Normal"],
};

// The second real occurrence found alongside Lapras, same set, same format.
const VICTREEBEL_SV2A_71 = {
  tcgPlayerId: "517934",
  setName: "SV2a: Pokemon Card 151",
  name: "Victreebel",
  cardNumber: "071/165",
  totalSetNumber: null,
  rarity: "Uncommon",
  cardType: "Pokemon",
  hp: "130",
  stage: "Stage 2",
  attacks: ["[Grass][Colorless] Acid Spray (60)"],
  pokedexNumbers: [71],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/517934",
  prices: { market: 1.24, primaryPrinting: "Normal" },
  printingsAvailable: ["Normal"],
};

// RECONSTRUCTED, not captured: the two previously-logged Pokedex-number
// scans (Japanese Azumarill "No. 184", Japanese Typhlosion "No.157") are
// older than Vercel's 1h log retention, so these rows are built from what
// docs/history.md records about them — the decisive documented fact being
// that the real PPT candidate's own cardNumber field is EMPTY, which is why
// neither was ever recoverable. Shape, not provenance, is what these two
// exercise.
const AZUMARILL_JP_NO_NUMBER = {
  tcgPlayerId: "575835",
  setName: "Gold, Silver, to a New World...",
  name: "Azumarill",
  cardNumber: "",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "80",
  stage: "Stage 1",
  attacks: ["[Water][Colorless] Rain Splash (20)"],
  pokedexNumbers: [184],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/575835",
  prices: { market: 12.5, primaryPrinting: "Holofoil" },
  printingsAvailable: ["Holofoil"],
};

const TYPHLOSION_JP_NO_NUMBER = {
  tcgPlayerId: "575822",
  setName: "Gold, Silver, to a New World...",
  name: "Typhlosion",
  cardNumber: "",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: ["[Fire][Fire][Colorless] Flame Burst (50)"],
  pokedexNumbers: [157],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/575822",
  prices: { market: 39.99, primaryPrinting: "Holofoil" },
  printingsAvailable: ["Holofoil"],
};

module.exports = {
  CHARIZARD_EX_125,
  CHARIZARD_EX_223,
  CHARIZARD_EX_223_NO_MARKET,
  BLASTOISE_36,
  BLASTOISE_37,
  ALAKAZAM_33,
  ALAKAZAM_1,
  SKY_ALAKAZAM_2,
  SKY_ALAKAZAM_H1,
  MEGANIUM_NEO_JP,
  MEGANIUM_BEP_102,
  LAPRAS_SV2A_131,
  VICTREEBEL_SV2A_71,
  AZUMARILL_JP_NO_NUMBER,
  TYPHLOSION_JP_NO_NUMBER,
  LOGGED_FILLER,
  fillerRow,
  padTo,
};
