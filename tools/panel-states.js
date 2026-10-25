// Fixture states for tools/panel-harness.html (#113).
//
// Each state is {identify, price} matching the real shapes: `identify` is an
// /api/identify response, `price` is the separate /api/price response that
// fetchAndRenderPricing feeds to renderPriceSection. Values are taken from
// real scans recorded in docs/test-cases.md so the harness shows the panel as
// it really renders, not an idealised mock.
window.WNPK_STATES = {
  "priced-raw": {
    label: "Priced raw card (Alakazam 33, High/High)",
    identify: {
      found: true, cardName: "Alakazam (33)", setName: "Expedition",
      cardLanguage: "English", confidence: "High", matchConfidence: "High",
      matchBasis: "score-only", stampType: "none",
      tcgplayerUrl: "https://www.tcgplayer.com/product/83500",
      pricingLookup: { tcgPlayerId: "83500" },
      usage: { estCostUsd: 0.00092 },
    },
    price: {
      listingCount: 67, priceVariantUsed: "Normal",
      conditionPrices: { NM: 21.37, LP: 16.1, MP: 12.44, HP: 9.08, DMG: 5.58 },
      conditionsSuggestedBid: { NM: 12.03, LP: 8.9, MP: 6.63, HP: 4.53, DMG: 2.35 },
      priceVariants: {
        Normal: {
          label: "Normal", basePrice: 21.37,
          sellThrough: { monthlyPace: 6.3, tier: "Slow", totalSold: 19 },
          conditions: { NM: 21.37, LP: 16.1, MP: 12.44, HP: 9.08, DMG: 5.58 },
          conditionsSuggestedBid: { NM: 12.03, LP: 8.9, MP: 6.63, HP: 4.53, DMG: 2.35 },
          conditionsBreakEven: { NM: 17.14, LP: 12.7, MP: 9.45, HP: 6.46, DMG: 3.35 },
        },
        "Reverse Holofoil": {
          label: "Reverse Holofoil", basePrice: 34.9,
          sellThrough: { monthlyPace: 2.0, tier: "Stagnant", totalSold: 6 },
          conditions: { NM: 34.9, LP: 26.2, MP: 20.1, HP: 14.4, DMG: 8.8 },
          conditionsSuggestedBid: { NM: 13.38, LP: 9.63, MP: 6.99, HP: 4.51, DMG: 2.0 },
          conditionsBreakEven: { NM: 28.37, LP: 20.9, MP: 15.6, HP: 10.6, DMG: 5.8 },
        },
      },
    },
  },

  "alternate-printing": {
    label: "Alternate-printing banner (cheaper variant detected)",
    identify: {
      found: true, cardName: "Treecko", setName: "EX Crystal Guardians",
      cardLanguage: "English", confidence: "High", matchConfidence: "High",
      matchBasis: "score-only", stampType: "none",
      tcgplayerUrl: "https://www.tcgplayer.com/product/91234",
      pricingLookup: { tcgPlayerId: "91234" },
      usage: { estCostUsd: 0.00091 },
    },
    price: {
      listingCount: 41, priceVariantUsed: "Normal",
      conditionPrices: { NM: 1.18, LP: 0.95, MP: 0.8, HP: 0.62, DMG: 0.4 },
      conditionsSuggestedBid: { NM: 0.61, LP: 0.42, MP: 0.3, HP: 0.14, DMG: null },
      priceVariants: {
        Normal: {
          label: "Normal", basePrice: 1.18,
          sellThrough: { monthlyPace: 14.0, tier: "Slow", totalSold: 42 },
          conditions: { NM: 1.18, LP: 0.95, MP: 0.8, HP: 0.62, DMG: 0.4 },
          conditionsSuggestedBid: { NM: 0.61, LP: 0.42, MP: 0.3, HP: 0.14, DMG: null },
          conditionsBreakEven: { NM: 0.7, LP: 0.49, MP: 0.35, HP: 0.16, DMG: null },
        },
        "Reverse Holofoil": {
          label: "Reverse Holofoil", basePrice: 28.5,
          sellThrough: { monthlyPace: 3.3, tier: "Stagnant", totalSold: 10 },
          conditions: { NM: 28.5, LP: 21.4, MP: 16.2, HP: 11.9, DMG: 7.1 },
          conditionsSuggestedBid: { NM: 10.74, LP: 7.68, MP: 5.5, HP: 3.57, DMG: 1.5 },
          conditionsBreakEven: { NM: 22.94, LP: 16.9, MP: 12.6, HP: 8.5, DMG: 4.3 },
        },
      },
    },
  },

  "sibling-ambiguous": {
    label: "Sibling-ambiguous (Tyrunt, Cosmos holo pair)",
    identify: {
      found: true, cardName: "Tyrunt", setName: "XY - Fates Collide",
      cardLanguage: "English", confidence: "High", matchConfidence: "Low",
      matchBasis: "sibling-ambiguous", stampType: "none", pricingLookup: null,
      ambiguousNote:
        "This set prints this card in more than one version, told apart ONLY by the card number — and the two AI models read different card numbers (\"25/124\" vs \"26/124\"), each pointing at a different one of these printings. Both printings are shown below with their own price and bid. Check the finish and artwork to tell these apart.",
      siblingAmbiguity: {
        prompt: "Check the finish and artwork to tell these apart.",
        candidates: [
          { tcgPlayerId: "118554", name: "Tyrunt", number: "25/124", setName: "XY - Fates Collide", rarity: "Common", tcgplayerUrl: "https://www.tcgplayer.com/product/118554" },
          { tcgPlayerId: "118555", name: "Tyrunt (Cosmos Holofoil)", number: "25/124", setName: "Blister Exclusives", rarity: "Holo Rare", tcgplayerUrl: "https://www.tcgplayer.com/product/118555" },
        ],
      },
      usage: { estCostUsd: 0.00093 },
    },
    siblingPrices: { "118554": { nm: 0.42, bid: null }, "118555": { nm: 18.75, bid: 7.02 } },
  },

  "number-tie": {
    label: "Number tie across products (Rayquaza 003/017)",
    identify: {
      found: true, cardName: "Rayquaza", setName: "POP Series 1",
      cardLanguage: "English", confidence: "High", matchConfidence: "Low",
      matchBasis: "number-tie-ambiguous", stampType: "none", pricingLookup: null,
      ambiguousNote:
        "The card number (\"3/17\") is used by 2 different products, so the number cannot tell them apart. All of them are shown below with their own price and bid. Check the set symbol, or the pack or box it came from, to tell these apart.",
      siblingAmbiguity: {
        prompt: "Check the set symbol, or the pack or box it came from, to tell these apart.",
        candidates: [
          { tcgPlayerId: "88624", name: "Rayquaza", number: "003/017", setName: "POP Series 1", rarity: "Rare", tcgplayerUrl: "https://www.tcgplayer.com/product/88624" },
          { tcgPlayerId: "691978", name: "Rayquaza - 003/017 (2006)", number: "003/017", setName: "Blister Exclusives", rarity: "Promo", tcgplayerUrl: "https://www.tcgplayer.com/product/691978" },
        ],
      },
      usage: { estCostUsd: 0.00094 },
    },
    siblingPrices: { "88624": { nm: 325.3, bid: 121.9 }, "691978": { nm: 135.3, bid: 50.2 } },
  },

  "reprint-three-rows": {
    label: "Anniversary reprint (Blastoise 2/102, 3 rows)",
    identify: {
      found: true, cardName: "Blastoise", setName: "Base Set",
      cardLanguage: "English", confidence: "High", matchConfidence: "Low",
      matchBasis: "sibling-ambiguous", stampType: "1st Edition", pricingLookup: null,
      ambiguousNote:
        "This printing exists in two different print runs — Shadowless and standard/Unlimited — that share an identical card number, HP, and attack, and there's no visual signal this tool checks for that tells them apart from a video frame (Shadowless is identified by the ABSENCE of a drop-shadow on the picture-frame border, a physical detail on the card itself). Both printings' prices are available in the dropdown below — pick whichever matches the physical card before trusting this price. This set prints this card in more than one version, and this card number (\"2/102\") belongs to more than one of these printings, so it cannot tell them apart. All 3 are shown below with their own price and bid. This number belongs to both the original and a 25th Anniversary reprint; check for the anniversary logo.",
      siblingAmbiguity: {
        prompt: "This number belongs to both the original and a 25th Anniversary reprint; check for the anniversary logo.",
        candidates: [
          { tcgPlayerId: "42360", name: "Blastoise", number: "002/102", setName: "Base Set", rarity: "Holo Rare", tcgplayerUrl: "https://www.tcgplayer.com/product/42360" },
          { tcgPlayerId: "106997", name: "Blastoise", number: "002/102", setName: "Base Set (Shadowless)", rarity: "Holo Rare", tcgplayerUrl: "https://www.tcgplayer.com/product/106997" },
          { tcgPlayerId: "250319", name: "Blastoise", number: "2/102", setName: "Celebrations: Classic Collection", rarity: "Classic Collection", tcgplayerUrl: "https://www.tcgplayer.com/product/250319" },
        ],
      },
      usage: { estCostUsd: 0.00093 },
    },
    siblingPrices: {
      "42360": { nm: 227.27, bid: 85.1 },
      "106997": { nm: 896.06, bid: 340.4 },
      "250319": { nm: 13.01, bid: 4.32 },
    },
  },

  "weak-signal-withhold": {
    label: "Weak-signal withhold (Japanese Meganium, dex number)",
    identify: {
      found: true, cardName: "Meganium", setName: null,
      cardLanguage: "Japanese", confidence: "High", matchConfidence: "Low",
      matchBasis: "score-only", stampType: "none",
      pricingLookup: null, printingUndetermined: true,
      ambiguousNote:
        "This card shows only a Pokédex number (\"No. 154\"), not a set/collector number, and the closest candidate on other details shares only one weak signal, not enough to trust a specific printing or price. Verify the exact printing on the physical card.",
      usage: { estCostUsd: 0.00092 },
    },
  },

  "slab-priced": {
    label: "Slab priced (SM210 PSA 9)",
    identify: {
      found: true, isSlab: true, slabCardIdentified: true,
      cardName: "Moltres & Zapdos & Articuno GX - SM210", setName: "SM Promos",
      cardLanguage: "English", confidence: "High", matchConfidence: "High",
      matchBasis: "score-only", grader: "PSA", grade: "9", certNumber: "84219371",
      gradedPrice: 155.2, gradedSampleCount: 12, gradedListPrice: 156.2,
      gradedBreakEven: 125.68, gradedSuggestedBid: 90.67,
      gradedSellThrough: { monthlyPace: 5.5, tier: "Normal", totalSold: 12, windowDays: 197 },
      gradedLowConfidence: false, gradedOutlierAffected: false,
      nearbyGradedPrices: [
        { label: "PSA 8", price: 92.5, count: 7 },
        { label: "PSA 10", price: 410.0, count: 9 },
        { label: "CGC 9", price: 118.0, count: 3 },
        { label: "BGS 9", price: 130.0, count: 2 },
      ],
      tcgplayerUrl: "https://www.tcgplayer.com/product/186000",
      pricingLookup: { tcgPlayerId: "186000" },
      usage: { estCostUsd: 0.00098 },
    },
    price: { marketPrice: 153.84, conditionPrices: { NM: 153.84 } },
  },

  "slab-thin": {
    label: "Slab, graded data too thin",
    identify: {
      found: true, isSlab: true, slabCardIdentified: true,
      cardName: "Dragonite", setName: "SV: Shrouded Fable",
      cardLanguage: "English", confidence: "High", matchConfidence: "Medium",
      matchBasis: "score-only", grader: "CGC", grade: "9.5", certNumber: "2100847001",
      gradedPriceUnavailable: true, gradedThin: true, gradedSampleCount: 2,
      nearbyGradedPrices: [
        { label: "PSA 10", price: 88.0, count: 14 },
        { label: "PSA 9", price: 41.5, count: 6 },
      ],
      tcgplayerUrl: "https://www.tcgplayer.com/product/232000",
      pricingLookup: { tcgPlayerId: "232000" },
      usage: { estCostUsd: 0.00096 },
    },
    price: { marketPrice: 28.4, conditionPrices: { NM: 28.4 } },
  },

  "not-found": {
    label: "Not identified",
    identify: {
      found: false,
      reason: "Couldn't identify the card. Try again when it's clearly visible.",
      usage: { estCostUsd: 0.00089 },
    },
  },
};
