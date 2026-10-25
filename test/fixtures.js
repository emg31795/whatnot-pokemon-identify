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

// --------------------------------------------------------------------------
// Blastoise 2/102 — the anniversary-reprint padding trap (test #109).
// --------------------------------------------------------------------------
// Every row below is REAL data captured from PPT on 2026-10-24 via
//   search="Blastoise 2/102"   -> CC_BLASTOISE_2 only
//   search="Blastoise 002/102" -> BASE_BLASTOISE_2 + BASE_BLASTOISE_2_SHADOWLESS
//   search="Charizard 4/102"   -> CC_CHARIZARD_4 + ME30_CHARIZARD_4 only
//   search="Charizard 004/102" -> the four originals/oddities below
//   search="Venusaur 15/102"   -> CC_VENUSAUR_15 only
//   search="Venusaur 015/102"  -> BASE_VENUSAUR_15 + BASE_VENUSAUR_15_SHADOWLESS
// The split is the whole bug: PPT stores the reprint at the ORIGINAL unpadded
// number and the originals zero-padded to three digits, so a correct read of
// "2/102" matches the $13.01 reprint exactly and never reaches the $227.27
// original. Attack text is preserved byte-for-byte, including the
// <strong>-wrapped name that made extractAttackNames return [].

const CC_BLASTOISE_2 = {
  tcgPlayerId: "250319",
  setName: "Celebrations: Classic Collection",
  name: "Blastoise",
  cardNumber: "2/102",
  totalSetNumber: null,
  rarity: "Classic Collection",
  cardType: "Pokemon",
  hp: null,
  stage: null,
  attacks: [
    "[WWW] <strong>Hydro Pump</strong> (40+)\r\n<br>Does 40 damage plus 10 more damage for each W Energy attached to Blastoise but not used to pay for this attack’s Energy cost. Extra W Energy after the 2nd doesn’t count.",
  ],
  pokemonType: "Water",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/250319",
  prices: { market: 13.01, primaryPrinting: "Holofoil", listings: 296 },
  printingsAvailable: ["Holofoil"],
};

const BASE_BLASTOISE_2 = {
  tcgPlayerId: "42360",
  setName: "Base Set",
  name: "Blastoise",
  cardNumber: "002/102",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: [
    "[WWW] Hydro Pump (40+)\r\n<br>Does 40 damage plus 10 more damage for each Water Energy attached to Blastoise but not used to pay for this attack's Energy cost.",
  ],
  pokemonType: "Water",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/42360",
  prices: { market: 227.27, primaryPrinting: "Holofoil", listings: 195 },
  printingsAvailable: ["Holofoil"],
};

const BASE_BLASTOISE_2_SHADOWLESS = {
  tcgPlayerId: "106997",
  setName: "Base Set (Shadowless)",
  name: "Blastoise",
  cardNumber: "002/102",
  totalSetNumber: null,
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: [
    "[WWW] Hydro Pump (40+)\r\n<br>Does 40 damage plus 10 more damage for each Water Energy attached to Blastoise but not used to pay for this attack's Energy cost.",
  ],
  pokemonType: "Water",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/106997",
  prices: { market: 896.06, primaryPrinting: "Unlimited Holofoil", listings: 33 },
  printingsAvailable: ["Unlimited Holofoil", "1st Edition Holofoil"],
};

// Charizard's reprint pair — BOTH anniversary sets carry 4/102 AND hp 120,
// which is why a Charizard read ties between two reprints while Blastoise
// (no ME-30th twin) came through as a clean, confident single winner.
const CC_CHARIZARD_4 = {
  tcgPlayerId: "250320",
  setName: "Celebrations: Classic Collection",
  name: "Charizard",
  cardNumber: "4/102",
  rarity: "Classic Collection",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  // Note the PARENTHESISED energy cost — not the "[cost]" shape — so
  // extractAttackNames returns [] for this row with or without the markup fix.
  attacks: ["(RRRR) Fire Spin (100)\r\n<br>Discard 2 Energy cards attached to Charizard in order to use this attack."],
  pokemonType: "Fire",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/250320",
  prices: { market: 139.17, primaryPrinting: "Holofoil", listings: 181 },
  printingsAvailable: ["Holofoil"],
};

const ME30_CHARIZARD_4 = {
  tcgPlayerId: "714372",
  setName: "ME: 30th Celebration Classic Collection",
  name: "Charizard",
  cardNumber: "4/102",
  rarity: "Classic Collection",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  attacks: [
    "(RRRR) Fire Spin (100)\r\n<br>Discard 2 Energy cards attached to Charizard in order to use this attack.",
    "Spits fire that is hot enough to melt boulders.",
  ],
  pokemonType: "Fire",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/714372",
  prices: { market: 164.23, primaryPrinting: "Holofoil", listings: 59 },
  printingsAvailable: ["Holofoil"],
};

const BASE_CHARIZARD_4 = {
  tcgPlayerId: "42382",
  setName: "Base Set",
  name: "Charizard",
  cardNumber: "004/102",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  attacks: ["[RRRR] Fire Spin (100)\r\n<br>Discard 2 Energy cards attached to Charizard in order to use this attack."],
  pokemonType: "Fire",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/42382",
  prices: { market: 954.65, primaryPrinting: "Holofoil", listings: 133 },
  printingsAvailable: ["Holofoil"],
};

const BASE_CHARIZARD_4_SHADOWLESS = {
  tcgPlayerId: "106999",
  setName: "Base Set (Shadowless)",
  name: "Charizard",
  cardNumber: "004/102",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  attacks: ["[RRRR] Fire Spin (100)\r\n<br>Discard 2 Energy cards attached to Charizard in order to use this attack."],
  pokemonType: "Fire",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/106999",
  prices: { market: 2172.24, primaryPrinting: "Unlimited Holofoil", listings: 25 },
  printingsAvailable: ["Unlimited Holofoil", "1st Edition Holofoil"],
};

// The real "Charizard 004/102" page also carries these three. They are here
// so the padded-retrieval test runs against the messy pool PPT really returns,
// not a tidied one: an oversized Jumbo (ODDITY_PATTERN), a metal novelty, and
// an error-variant row with no hp and no market at all.
const CHARIZARD_4_JUMBO = {
  tcgPlayerId: "179079",
  setName: "Jumbo Cards",
  name: "Charizard - 4/102 (CoroCoro Promo)",
  cardNumber: "004/102",
  rarity: "Promo",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  attacks: ["[RRRR] Fire Spin (100)"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/179079",
  prices: { market: 350, primaryPrinting: "Holofoil", listings: 0 },
  printingsAvailable: ["Holofoil"],
};

const CHARIZARD_4_METAL = {
  tcgPlayerId: "252517",
  setName: "Miscellaneous Cards & Products",
  name: "Charizard (Celebrations Metal Card)",
  cardNumber: "004/102",
  rarity: "Promo",
  cardType: "Pokemon",
  hp: "120",
  stage: "Stage 2",
  attacks: ["[RRRR] Fire Spin (100)"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/252517",
  prices: { market: 313.39, primaryPrinting: "Holofoil", listings: 80 },
  printingsAvailable: ["Holofoil"],
};

const CHARIZARD_4_BLACK_DOT = {
  tcgPlayerId: "657516",
  setName: "Base Set",
  name: "Charizard (Black Dot Error)",
  cardNumber: "004/102",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: null,
  stage: null,
  attacks: [],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/657516",
  prices: { market: null, primaryPrinting: "Holofoil", listings: 6 },
  printingsAvailable: ["Holofoil"],
};

const CC_VENUSAUR_15 = {
  tcgPlayerId: "250321",
  setName: "Celebrations: Classic Collection",
  name: "Venusaur",
  cardNumber: "15/102",
  rarity: "Classic Collection",
  cardType: "Pokemon",
  hp: null,
  stage: null,
  attacks: ["[GGGG] <strong>Solar Beam</strong> (60)"],
  pokemonType: "Grass",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/250321",
  prices: { market: 9.6, primaryPrinting: "Holofoil", listings: 252 },
  printingsAvailable: ["Holofoil"],
};

const BASE_VENUSAUR_15 = {
  tcgPlayerId: "42355",
  setName: "Base Set",
  name: "Venusaur",
  cardNumber: "015/102",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: ["[GGGG] Solar Beam (60)"],
  pokemonType: "Grass",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/42355",
  prices: { market: 156.02, primaryPrinting: "Holofoil", listings: 216 },
  printingsAvailable: ["Holofoil"],
};

const BASE_VENUSAUR_15_SHADOWLESS = {
  tcgPlayerId: "107010",
  setName: "Base Set (Shadowless)",
  name: "Venusaur",
  cardNumber: "015/102",
  rarity: "Holo Rare",
  cardType: "Pokemon",
  hp: "100",
  stage: "Stage 2",
  attacks: ["[GGGG] Solar Beam (60)"],
  pokemonType: "Grass",
  tcgPlayerUrl: "https://www.tcgplayer.com/product/107010",
  prices: { market: 981.25, primaryPrinting: "1st Edition Holofoil", listings: 38 },
  printingsAvailable: ["Unlimited Holofoil", "1st Edition Holofoil"],
};

// --------------------------------------------------------------------------
// Japanese PSA 9 Pichu slab, cert 115602100 (test #111).
// --------------------------------------------------------------------------
// REAL rows captured from PPT 2026-10-24:
//   search="Pichu NEO" language=japanese -> both rows below, 607842 FIRST
//   ("Pichu NEO PROMO" returns 0 rows and "Pichu PROMO" returns neither.)
// Both carry cardNumber "" and pokedexNumbers [172] -- the label's "#172" is
// Pichu's POKEDEX number, which is why the by-number filter had to learn the
// #108 lesson. Only 607842's setName contains the label's "2".
// The ebay block is the real salesByGrade, trimmed to the fields the graded
// path reads.
const PICHU_NEO_PREMIUM_FILE_2 = {
  tcgPlayerId: "607842",
  setName: "Neo Premium File 2",
  name: "Pichu",
  cardNumber: "",
  rarity: "None",
  cardType: "Pokemon",
  hp: "30",
  stage: "Basic",
  pokedexNumbers: [172],
  attacks: ["[Colorless] Let's Play! <br>Search your deck for a Baby Pokémon card and put it onto your Bench. Shuffle your deck afterward. (You can't use this attack if your Bench is full.)"],
  prices: { market: 42.02, primaryPrinting: "Holofoil", listings: 27 },
  printingsAvailable: ["Holofoil"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/607842",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/607842_in_800x800.jpg",
  ebay: {
    "dateRangeStart": "2026-07-31T00:00:00.000Z",
    "dateRangeEnd": "2026-10-17T00:00:00.000Z",
    "totalSales": 34,
    "gradesTracked": [
        "cgc7_5",
        "cgc8_5",
        "cgc9",
        "psa10",
        "cgc10",
        "psa9",
        "psa8",
        "psa5",
        "tag7_5",
        "bgs9",
        "psa6"
    ],
    "salesByGrade": {
        "psa9": {
            "count": 9,
            "totalValue": 1081.57,
            "averagePrice": 135.19625,
            "medianPrice": 139.79,
            "minPrice": 61,
            "maxPrice": 179.99,
            "lastSaleDate": "2026-10-17T00:00:00.000Z"
        },
        "psa10": {
            "count": 7,
            "totalValue": 5585,
            "averagePrice": 930.8333333333334,
            "medianPrice": 917.5,
            "minPrice": 800,
            "maxPrice": 1100,
            "lastSaleDate": "2026-10-17T00:00:00.000Z"
        },
        "psa8": {
            "count": 2,
            "totalValue": 148,
            "averagePrice": 74,
            "medianPrice": 74,
            "minPrice": 57.5,
            "maxPrice": 90.5,
            "lastSaleDate": "2026-07-31T00:00:00.000Z"
        }
    }
},
};

const PICHU_INTRO_PACK_NEO = {
  tcgPlayerId: "614135",
  setName: "Intro Pack Neo (Totodile)",
  name: "Pichu",
  cardNumber: "",
  rarity: "None",
  cardType: "Pokemon",
  hp: "30",
  stage: "Baby",
  pokedexNumbers: [172],
  attacks: ["[Colorless] Pound (10)"],
  prices: { market: 65, primaryPrinting: "Normal", listings: 0 },
  printingsAvailable: ["Normal"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/614135",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/614135_in_800x800.jpg",
};

// The junk winner from the real scans: a 2024 Start Deck 100 card that cleared
// MATCH_FLOOR on hp 30 alone (score 6) in a THIRTEEN-way tie, made
// `found: true`, and so locked the slab-label rescue out entirely.
const PICHU_ETHANS_START_DECK = {
  tcgPlayerId: "669985",
  setName: "Start Deck 100 Battle Collection",
  name: "Ethan's Pichu",
  cardNumber: "241/742",
  rarity: "",
  cardType: "Pokemon",
  hp: "30",
  stage: "Basic",
  pokedexNumbers: [172],
  attacks: ["[0] Zapping Draw (30)<br> Draw a card."],
  prices: { market: 4.99, primaryPrinting: "Normal", listings: 4 },
  printingsAvailable: ["Normal"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/669985",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/669985_in_800x800.jpg",
};

// --------------------------------------------------------------------------
// Japanese Shining Celebi, M6a 30th Celebration (test #112).
// --------------------------------------------------------------------------
// REAL row captured from PPT 2026-10-25 by tcgPlayerId. The live scan
// (requestId f86f1d7c) read setName "Celebrations" and number "002/025";
// PPT stores the ORIGINAL card's number 141/103, the same convention
// Celebrations: Classic Collection uses. The set's Classic Collection subset
// runs 141/103..165/103 (25 cards) -- no "/025" denominator exists anywhere
// in it, which is why the read number matched nothing.
const SHINING_CELEBI_717001 = {
  tcgPlayerId: "717001",
  setName: "M6a: MEGA Expansion 30th Celebration",
  name: "Shining Celebi",
  cardNumber: "141/103",
  totalSetNumber: null,
  rarity: "Classic Collection",
  cardType: "Pokemon",
  hp: "50",
  stage: "Basic",
  pokedexNumbers: [251],
  attacks: ["[Water] Healing Water\r\n<br>\r\nRemove a number of damage counters from 1 of your Benched Pokémon equal to the number of Water Energy cards attached to Shining Celebi. If the Pokémon has fewer damage counters than that, remove all of them.", "[Grass][Psychic] Miracle Leaf (10)\r\n<br>\r\nFlip a number of coins equal to the number of Energy attached to the Defending Pokémon. If you get 1 or more heads, the Defending Pokémon is now Asleep, Confused, or Poisoned (your choice)."],
  prices: { market: 27.43, primaryPrinting: "Holofoil", listings: 36 },
  printingsAvailable: ["Holofoil", "Normal"],
  tcgPlayerUrl: "https://www.tcgplayer.com/product/717001",
  imageCdnUrl: "https://tcgplayer-cdn.tcgplayer.com/product/717001_in_800x800.jpg",
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
  PICHU_NEO_PREMIUM_FILE_2,
  PICHU_INTRO_PACK_NEO,
  PICHU_ETHANS_START_DECK,
  SHINING_CELEBI_717001,
  CC_BLASTOISE_2,
  BASE_BLASTOISE_2,
  BASE_BLASTOISE_2_SHADOWLESS,
  CC_CHARIZARD_4,
  ME30_CHARIZARD_4,
  BASE_CHARIZARD_4,
  BASE_CHARIZARD_4_SHADOWLESS,
  CHARIZARD_4_JUMBO,
  CHARIZARD_4_METAL,
  CHARIZARD_4_BLACK_DOT,
  CC_VENUSAUR_15,
  BASE_VENUSAUR_15,
  BASE_VENUSAUR_15_SHADOWLESS,
  LOGGED_FILLER,
  fillerRow,
  padTo,
};
