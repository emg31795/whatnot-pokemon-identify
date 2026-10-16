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
  tcgPlayerId: "517940",
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
  tcgPlayerId: "517988",
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
  LOGGED_FILLER,
  fillerRow,
  padTo,
};
