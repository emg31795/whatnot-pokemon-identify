// api/price.js
//
// ADDED 2026-09-10 — companion to api/identify.js. Decouples live
// TCGplayer per-condition pricing from card identification (see
// docs/test-cases.md test #88 for the investigation that motivated
// this): a failing TCGplayer price-history fetch was blocking the
// ENTIRE /api/identify response for up to ~5.3s (2 attempts x
// TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS), even when the identification
// itself was already done in ~1.5s, well inside the 1-3s target. Test
// #88 ruled out self-inflicted rate-limiting and confirmed TCGplayer
// itself is fundamentally healthy (direct curls of the exact failing
// productIds all returned real data promptly) — the blocking
// architecture, not TCGplayer's reliability, was the actionable
// finding.
//
// /api/identify now returns identification immediately, with a
// `pricingLookup` object describing what THIS endpoint needs to fetch
// pricing for (see lookupCardPPT in api/identify.js). The extension
// calls this as a second, independent request right after rendering
// the card ID, and updates just the price section of the panel when it
// resolves.
//
// Deliberately reuses buildLiveVariantsForCandidate/pickDefaultVariantKey
// UNCHANGED from api/identify.js (via require — not duplicated) — this
// is purely a relocation of WHERE the existing pricing logic runs, not
// a rewrite of it. TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS (2500ms) and its
// single retry live in identify.js and are untouched here.

const { buildLiveVariantsForCandidate, pickDefaultVariantKey } = require("./identify.js");

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { requestId, pricingLookup } = req.body || {};
  if (!pricingLookup || !pricingLookup.tcgPlayerId) {
    res.status(400).json({ error: "Missing pricingLookup.tcgPlayerId", requestId });
    return;
  }

  const { tcgPlayerId, tag, siblingTcgPlayerId, siblingTag, stampType, primaryPrinting } = pricingLookup;

  // Same shape as the block this replaced in lookupCardPPT
  // (api/identify.js) — every dollar figure from here on is either
  // genuine live TCGplayer data or an explicit `pricingError`, never a
  // guess.
  let priceVariants = null;
  let pricingError = null;
  try {
    priceVariants = await buildLiveVariantsForCandidate({ tcgPlayerId }, tag || null);
    if (siblingTcgPlayerId) {
      try {
        const siblingVariants = await buildLiveVariantsForCandidate({ tcgPlayerId: siblingTcgPlayerId }, siblingTag || null);
        priceVariants = { ...priceVariants, ...siblingVariants };
        console.log(`[price] requestId=${requestId} merged Shadowless-sibling LIVE prices into dropdown, sibling keys=`, Object.keys(siblingVariants));
      } catch (e) {
        // Non-fatal: the sibling is a bonus dropdown option, not the
        // primary match's own price. Log and move on rather than
        // failing the whole pricing call over a secondary printing.
        console.error(`[price] requestId=${requestId} Shadowless sibling LIVE price fetch failed (non-fatal):`, e && e.message);
      }
    }
  } catch (e) {
    console.error(`[price] requestId=${requestId} LIVE TCGPLAYER PRICING FAILED:`, e && e.message, "tcgPlayerId=", tcgPlayerId);
    pricingError = (e && e.message) || "Could not fetch live TCGplayer pricing for this card.";
    priceVariants = null;
  }

  const priceVariantUsed = priceVariants ? pickDefaultVariantKey(priceVariants, { stampType }, primaryPrinting) : null;
  const chosenVariant = priceVariantUsed && priceVariants ? priceVariants[priceVariantUsed] : null;

  let noPriceNote = null;
  if (!chosenVariant && !pricingError) {
    noPriceNote = "TCGplayer doesn't have complete live condition pricing for this printing yet. Check the link below for current listings.";
  }

  res.status(200).json({
    priceVariants,
    priceVariantUsed,
    marketPrice: chosenVariant ? chosenVariant.basePrice : null,
    conditionPrices: chosenVariant ? chosenVariant.conditions : null,
    // Kept for frontend/shape compatibility — always all-false now,
    // since every surviving number is genuine live TCGplayer data (see
    // buildLivePriceVariantsFromTCGPlayer in api/identify.js).
    conditionPricesEstimated: chosenVariant ? chosenVariant.estimated : null,
    // True when TCGplayer had real live data for SOME but not all 5
    // condition tiers on the shown printing — lets the frontend caption
    // this differently from full 5-condition coverage without implying
    // any missing tier was guessed.
    conditionPricesPartial: chosenVariant ? !!chosenVariant.partial : false,
    // Loud, explicit failure — set only when live TCGplayer pricing
    // could not be fetched at all. Never paired with a fabricated
    // marketPrice/conditionPrices — those stay null whenever this is
    // set.
    pricingError,
    noPriceNote,
    requestId,
  });
};
