// api/identify.js
//
// REBUILT 2026-08-24 after the original source was lost to a dropped chat
// session; see the project's build-status doc for that history.
//
// ARCHITECTURE HISTORY: consolidated onto PokemonPriceTracker as the sole
// data source (English, Japanese, graded slabs) after pokemontcg.io was
// found to have been folded into paid-only Scrydex. Fixed a critical
// endpoint-URL bug (was calling nonexistent /api/v2/prices, corrected to
// /api/v2/cards) that made 100% of scans fail for a period on 2026-08-26.
// See build-status doc for full narrative.
//
// LIVE-TEST FIXES (2026-08-27), most recent first:
//   - REAL ROOT CAUSE, CORRECTED BY USER — Japanese scans (Baxcalibur,
//     Raichu, Psyduck, Lapras) were matching wrong/English printings. I
//     initially (WRONGLY) concluded this was a structural PPT data gap for
//     Japanese cards and shipped a blanket "treat as unverified" caveat.
//     The user corrected this: they specifically pay for PPT's Japanese
//     card data. Re-checked PPT's own API docs (pokemonpricetracker.com/docs)
//     and found a documented `language` query parameter
//     ("language=japanese" vs default "language=english") that
//     fetchPokemonPriceTracker never set — every "Japanese" scan was
//     silently searching PPT's ENGLISH database the whole time. Real bug,
//     real fix: fetchPokemonPriceTracker now accepts and passes a
//     `language` option, threaded through from every caller (lookupCardPPT,
//     its retry, lookupGradedPrice). The blanket Japanese caveat and
//     confidence cap added for the wrong diagnosis have been removed —
//     see fetchPokemonPriceTracker below for the full story. Lesson: an
//     absence of evidence for a specific mechanism (no Japanese candidates
//     returned) doesn't confirm the data doesn't exist upstream — it can
//     just as easily mean the request never asked for it. Should have
//     checked the API docs before concluding a data-source limitation.
//   - Baxcalibur (Japanese SV2P) — misleading warning ordering: see the
//     comment above the "no number match in pool" check in lookupCardPPT
//     below for the fix (this ordering fix is still valid/kept — it's
//     independent of the language-param bug above; a specific, legible
//     number that matches nothing in the pool is still a more useful
//     diagnosis than the generic ambiguous-tie note, for any language).
//   - Mewtwo (SVP 052 promo) — weak/asymmetric number match: see
//     numbersMatch below for the fix and the real-log evidence (a bare
//     promo-style number "052" coincidentally matched an unrelated
//     numbered-set card "52/108" at FULL number-match strength, winning
//     with false High confidence and showing the wrong card/price).
//   - Cramorant V / Shaymin V — number weight + oddity tie-break: see
//     SCORE and pickBestCandidate below for the fix and the real-log
//     evidence (a normal card matched to a "Jumbo Cards" oversized promo
//     and a "Prize Pack Series" repackaging, both because the number
//     signal could tie with weaker combined signals and there was no
//     preference against oddity product lines in a tie).
//   - Silvally GX / alphanumeric card numbers: normalizeNumber's regex
//     required the number to start with a digit, so promo-style numbers
//     ("SM91", "SV79/SV94", etc) never parsed on either side and the
//     number-match signal silently contributed nothing whenever Gemini
//     correctly read one. See normalizeNumber below for the fix and the
//     real-log evidence (a correct "SM91" read lost to a 7-way tie and
//     picked the wrong printing).
//   - Latency fix: Gemini calls were defaulting to thinkingLevel "medium"
//     (undocumented default when thinkingConfig is omitted), burning
//     400-600+ internal reasoning tokens per call before any output was
//     produced — confirmed via real Vercel logs. Also confirmed 16 real
//     requests in a 24h window that got fully aborted by the 5000ms
//     Gemini timeout. Set thinkingConfig.thinkingLevel to "minimal" — this
//     task (transcribe visible fields from one image into a fixed schema)
//     doesn't need deep reasoning. Should cut Gemini response time
//     substantially; needs a live rescan with real timing to confirm.
//   - Hitmontop/attackName: see extractFirstAttackName below.
//   - Brock's Onix: Gemini read cardNumber "21/132" (matched a real
//     candidate) but ALSO read hp "100 HP", which only belongs to a
//     DIFFERENT candidate (069/132). The number match won with false High
//     confidence, showing the wrong printing. Root cause #1: HP comparison
//     did exact string match, so "100 HP" never matched a candidate's bare
//     "100" — HP was silently contributing nothing. Fixed by comparing
//     digits-only. Root cause #2: no safeguard existed for "number matches
//     but HP contradicts, while a DIFFERENT candidate's HP matches
//     exactly" — a strong signal one of Gemini's OCR fields is wrong
//     (likely on a card partially obscured by others in frame). Added a
//     conflict check that downgrades to Low confidence with an explicit
//     warning instead of presenting a specific wrong card with false
//     certainty. Also nudged the Gemini prompt to explicitly warn against
//     mixing fields from different cards visible in the same frame.
//   - Koffing/1st-Edition default: a PRIOR fix here (same day) excluded
//     "1st Edition"-labeled variants whenever Gemini's stampType read was
//     "none", assuming Gemini's own visual read was more trustworthy than
//     PPT's `primaryPrinting` field. The very next live test proved this
//     backwards — the user physically confirmed a card WAS 1st Edition
//     (visible stamp) that Gemini had read as "none" (a false negative on
//     stamp detection, not a code bug). REVERTED: back to trusting
//     `primaryPrinting` first, since it was correct on every card checked
//     against a physical original so far. Neither signal is fully
//     reliable on its own — the manual variant dropdown remains the real
//     safety net.
//
// SPEED: this tool needs to return in ~2-5s so it's useful for a live
// buy/bid decision, not just eventually-correct. Timeouts below are
// tuned tight on that assumption. These are timeout CEILINGS (safety nets
// against a hung request), not the expected latency.
//
// PRIOR FIX (2026-08-24 rewrite, still in effect): the confirmed bug where
// a Japanese lookup picked a completely wrong candidate (a "369/742"
// Medicham, HP 120) even though the candidate matching Gemini's read
// exactly (number "054/083") was present in the pool. Fixed by (a) using
// ONE shared scoring function for every lookup path instead of independently
// -maintained copies, and (b) making the number comparison robust to
// formatting noise (leading zeros, missing "/total", stray whitespace).

const crypto = require("crypto");

// PROMOTED 2026-09-06 (see CLAUDE.md "Current priority" and test #83/#84
// in docs/test-cases.md for the full decision trace): GEMINI_MODEL now
// defaults to gemini-3.5-flash-lite, promoted from a shadow-only
// experiment (tests #80-83) to the real, user-facing primary model —
// dramatically better completion rate (far fewer timeouts/503s) and
// statistically equal ground-truth accuracy on completed calls versus
// the prior primary, gemini-3.6-flash. ROLLBACK: if the legacy-model
// shadow test below (LEGACY_GEMINI_SHADOW_MODEL) surfaces a real problem
// with gemini-3.5-flash-lite at volume or under real stream conditions,
// revert is a one-line change of this default back to "gemini-3.6-flash"
// — see the LEGACY_GEMINI_SHADOW_MODEL comment below for un-flipping the
// shadow test back to its original direction, and the GEMINI_INPUT/
// OUTPUT_USD_PER_1M comment below for the matching pricing-constant swap.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 5000;
// ADDED 2026-10-02: hard cap on how long the setName-scoped search rescue
// will wait for the legacy shadow read just to borrow its `setName` as a
// hint. The legacy call is fired in parallel with the primary at the top
// of the handler and real production logs show it finishing only ~100-250ms
// after it (primary 1519-1774ms vs legacy 1572-1991ms), so this almost
// never bites — but it is bounded by GEMINI_TIMEOUT_MS, and a measured
// worst case added +2161ms to a weak scan, which would blow the 1-3s
// target on its own. Past this cap the hint is simply treated as absent
// and the scan falls through to existing behavior.
const LEGACY_SETNAME_HINT_TIMEOUT_MS = 500;

// Cap on awaiting the legacy shadow read inside the ATTACK MISMATCH check
// and the downstream LEGACY-MODEL NUMBER RESCUE, same Promise.race pattern
// and same reasoning as LEGACY_SETNAME_HINT_TIMEOUT_MS above. Both were
// bare `await legacyReadPromise` calls bounded only by GEMINI_TIMEOUT_MS,
// and the downstream rescue's uncapped await is the one that produced the
// single real runtime error in the 2026-10-14 deploy window
// ("legacy-model rescue check failed ... This operation was aborted").
// A legacy read that is not ready in time is treated as absent, which
// leaves each caller on its pre-existing no-legacy-read path.
const LEGACY_NUMBER_RESCUE_TIMEOUT_MS = 500;

// One line shown to the user when two printings of the same card in the same
// set cannot be told apart. Deliberately NOT holo-specific (2026-10-15, test
// #104): the e-Card double prints that motivated this really are holo vs
// non-holo, but the same code now covers modern ex/SIR and V/alt-art twins,
// where the tell is the artwork and the finish rather than holo-vs-not.
const SIBLING_DISAMBIGUATION_HINT = "Check the finish and artwork to tell these apart.";

// Total budget for waiting on the legacy shadow read inside the
// sibling-disagreement cap, measured from the moment the cap starts.
//
// ADDED 2026-10-18 (live review of 2026-10-17): the cap took its first
// organic `legacyReady=no` on requestId 787f6fce — an Iono's Bellibolt ex
// PSA 10 whose card was identified CORRECTLY (114/100, bestScore 34,
// tieCount 1, and the PSA label itself reads "#114"). The only reason it
// came back ambiguous with no price was that the legacy read landed just
// after the 500ms cap; the shadow log shows it eventually read "114/100",
// which would have corroborated. A PSA 10 Japanese SR is the most valuable
// thing on these streams to leave unpriced.
//
// So the first wait stays at LEGACY_NUMBER_RESCUE_TIMEOUT_MS and the cap
// only spends the rest of this budget in the ONE case where more waiting
// can change the answer: it is about to say ambiguous-uncorroborated purely
// because no legacy number has arrived yet. A corroborated or
// disagreement decision is already final on the evidence in hand and never
// waits. Measured legacy reads in the 2026-10-17 window ran 1927-2656ms
// total against a primary of 1657-2260ms, so the extra ~700ms covers the
// realistic overhang without approaching GEMINI_TIMEOUT_MS.
const SIBLING_CAP_LEGACY_TOTAL_WAIT_MS = 1200;

// Cap on per-sibling graded lookups in a sibling-ambiguous slab result.
// Each is a `limit=1` fetchPptCardByTcgPlayerId — 2 credits, not the 30 a
// search costs — and they run in parallel, so the real cost of a 4-way group
// is 8 credits and one round trip. The cap exists so a pathologically large
// sibling group can never turn one scan into a credit burn. Observed groups
// in the 2026-10-17 window topped out at 4 (Iono's Bellibolt ex, Venusaur &
// Snivy GX, Roaring Moon ex).
const SIBLING_GRADED_MAX_LOOKUPS = 6;

// PHASE 2-LITE (2026-10-11): hard cap on label-driven PPT searches per
// scan. Each is a full limit=30 request (30 credits, ~3 rate-limit units),
// and this path only runs on a slab that the ordinary lookup already
// failed to identify — so it must not be able to turn one failed scan into
// an unbounded credit burn. 2 is enough for the real shape seen in the
// logs: a completed-number query, then the most specific set word.
const SLAB_LABEL_MAX_QUERIES = 2;

// Cap on awaiting the legacy shadow read for labelText, same Promise.race
// pattern and same reasoning as LEGACY_SETNAME_HINT_TIMEOUT_MS above: the
// label is a bonus signal, never worth holding a live bid decision open
// for. Slightly longer because this fires only on a slab whose ordinary
// lookup already failed, where there is nothing else left to try.
const SLAB_LABEL_WAIT_MS = 900;

// LOG-ONLY sanity tripwire threshold - see the GRADED SANITY TRIPWIRE
// block in lookupGradedPrice. Applies to grades <= 9 only and currently
// suppresses nothing; it exists to gather real traffic before any
// decision about gating on it.
const GRADED_SANITY_LOW_GRADE_RATIO = 4;
const CARDDB_TIMEOUT_MS = 2500;
const CARDDB_RETRY_TIMEOUT_MS = 1200;

// ADDED (2026-09-20, break-even/Suggested Bid markup): the multiplier Eric's
// eBay listing template applies to live TCGplayer market price to get his
// actual list price — see computeBreakEvenMaxBid below, the only place this
// is used.
// CHANGED (2026-09-29): was 1.2 ("1.2x market"). Eric switched his listing
// template to "market + $1.00" for all NEW listings, so the multiply step is
// now a no-op (1.0) and LISTING_ADD_AMOUNT below carries the whole markup.
// THIS IS A TEST, running until roughly mid-October 2026 — his older
// listings stay on the 1.2x template so the two can be compared. Switching
// back is exactly these two constants and nothing else: set
// LISTING_MARKUP_MULTIPLIER back to 1.2 and LISTING_ADD_AMOUNT back to 0.
const LISTING_MARKUP_MULTIPLIER = 1.0;

// ADDED (2026-09-29, "market + $1.00" listing-template test): the flat dollar
// amount added AFTER the multiply above and BEFORE the tier overrides below.
// See the LISTING_MARKUP_MULTIPLIER comment for the test window and how to
// revert. Used only by computeBreakEvenMaxBid.
const LISTING_ADD_AMOUNT = 1.0;

// ADDED (2026-09-26, break-even/Suggested Bid tier overrides): Eric's real
// eBay repricer template runs these pricing-tier overrides AFTER the
// LISTING_MARKUP_MULTIPLIER / LISTING_ADD_AMOUNT steps above — if the marked
// price lands inside a tier's [min, max] range, the repricer pins the actual
// list price to that tier's newPrice instead of the raw computed figure.
// Ordered array (not an object) so tiers are checked in order, first
// match wins, same as the real template — and so Eric can add/reorder/
// edit tiers later if his template changes. See computeBreakEvenMaxBid
// below, the only place this is used.
// UNCHANGED by the 2026-09-29 "+ $1.00" switch — the bands themselves are
// the same, but the MARKET prices that reach them moved: the $20-$25.58 band
// is now hit by market $19.00-$24.58 (was roughly $16.67-$21.32 under 1.2x),
// and the $0-$2.48 band by market <= $1.48 (was market <= $2.06).
const LISTING_PRICE_TIERS = [
  { min: 0.0, max: 2.48, newPrice: 2.49 },
  { min: 20.0, max: 25.58, newPrice: 19.99 },
];

// ADDED (2026-09-29, real fee model): Eric's actual eBay setup, replacing the
// flat 13.25% no-Store rate computeBreakEvenMaxBid used to assume.
//   - Basic eBay Store subscription -> final value fee is 12.35% in Toys &
//     Hobbies > Collectible Card Games (the no-Store rate is 13.25%).
//   - Promoted Listings Standard at a 2.2% ad rate. Deliberately applied to
//     EVERY sale even though not every sale actually closes through a
//     promotion — per Eric, this is intentionally conservative (it can only
//     understate his bid room, never overstate it).
//   - Both fees are charged on the TOTAL amount of the sale, which includes
//     sales tax — verified 2026-09-29 against eBay's own current help pages
//     (Store selling fees id=4122 for the 12.35% Basic Store CCG rate and
//     the "total amount of the sale" definition; Promoted Listings fees
//     id=5295, which since 2022-06-01 bills the ad rate on "an item's total
//     sale amount (including item price shipping, taxes, and any other
//     applicable fees)"). So the effective rate on the LIST price is
//     (0.1235 + 0.022) * 1.07 = 0.155685, i.e. ~15.57%.
// NOTE: the exact product 0.155685 is used, not a rounded 15.57% — rounding
// the rate first shifts the break-even by a cent on larger cards (a $100
// market price gives $79.07 at 0.1557 but $79.08 at 0.155685, and $79.08 is
// the break-even worked out by hand when this change was planned).
// CardUploader's own preview is NOT a check on this number — that preview
// only shows LIST prices (market 10 -> $11.00, 1.20 -> $2.49, 20 -> $19.99,
// 30 -> $31.00, all confirmed there); it knows nothing about eBay fees,
// shipping, or break-even.
// NOTE: "total amount of the sale" also includes buyer-paid shipping, but
// these listings ship free — the buyer pays no shipping, so shipping enters
// the math below only as a seller COST, never as part of the fee base.
// The monthly Store subscription fee is deliberately NOT modeled here: it's
// a fixed monthly cost, not a per-sale one, so it has no place in a
// per-card break-even.
const EBAY_FINAL_VALUE_FEE_RATE = 0.1235;
const EBAY_PROMOTED_LISTINGS_RATE = 0.022;
const ASSUMED_SALES_TAX_RATE = 0.07;
const EBAY_FEE_RATE_ON_LIST_PRICE =
  (EBAY_FINAL_VALUE_FEE_RATE + EBAY_PROMOTED_LISTINGS_RATE) *
  (1 + ASSUMED_SALES_TAX_RATE);

// ADDED (2026-09-30, Whatnot purchase costs): what Eric actually pays ON TOP
// of his winning bid when he buys a card on Whatnot. These belong to the BUY
// side, not the sell side, so they are used ONLY by computeSuggestedBid below
// — computeBreakEvenMaxBid above is deliberately untouched, because break-even
// is defined here as the eBay-side zero-profit figure (what a card can be
// bought for and still break even on resale, before any Whatnot-specific
// purchase costs).
//
// Sales tax: Eric pays sales tax on every Whatnot purchase. 6.625% is New
// Jersey's statewide rate.
// ASSUMPTION, NOT YET VERIFIED: this is NJ's published rate, not a figure read
// off one of Eric's real Whatnot receipts. Worth checking against an actual
// receipt — if Whatnot charges a different effective rate (a different
// ship-to state, or tax applied to a different base than the item price),
// this is the one constant to correct.
const WHATNOT_PURCHASE_TAX_RATE = 0.06625;

// Whatnot shipping, per card. Eric's real Whatnot shipping is $0.78 per card
// and caps at roughly $6 per order — and because he batches many cards into
// one order, he pays that cap once rather than $0.78 per card. Starting at
// ZERO on purpose: at realistic batch sizes the per-card share of a single
// ~$6 cap is small enough that charging $0.78 to every card would overstate
// his real cost substantially, and understating a cost can only make the
// suggested bid more conservative, never less.
// To turn it on later, set this to roughly $6 divided by his typical number
// of cards per order (e.g. 20 cards/order -> 0.30). It is subtracted from the
// margin-adjusted figure BEFORE the tax division in computeSuggestedBid,
// since Whatnot shipping is not itself taxed as part of the item price.
const WHATNOT_SHIPPING_PER_CARD = 0.0;

// FIX (2026-09-03): these were stale for the model active at the time
// (gemini-3.6-flash, $0.75 input / $3.75 output per MTok — confirmed live
// against Google's own pricing page) — see CLAUDE.md/test-cases.md for
// that original stale-pricing-constant bug writeup.
// UPDATED 2026-09-06 for the gemini-3.5-flash-lite promotion above: these
// now hold Flash-Lite's own pricing ($0.30 input / $2.50 output per MTok,
// confirmed live 2026-09-05) so `estimateGeminiCostUsd()` (the "This
// scan: $X" / session-total cost shown in the extension panel) keeps
// tracking whatever model GEMINI_MODEL actually resolves to, instead of
// repeating the exact stale-constant bug this project already found and
// fixed once. If GEMINI_MODEL is ever reverted to gemini-3.6-flash,
// these must be swapped back to 0.75/3.75 too — see
// LEGACY_GEMINI_INPUT/OUTPUT_USD_PER_1M just below, which hold those old
// values for exactly this rollback case.
const GEMINI_INPUT_USD_PER_1M = 0.3;
const GEMINI_OUTPUT_USD_PER_1M = 2.5;

// REVERSED 2026-09-06 (was FLASH_LITE_SHADOW_MODEL — forward-looking
// research into whether Flash-Lite was worth promoting, see tests #80-83
// in docs/test-cases.md). Now that Flash-Lite IS the primary model
// (GEMINI_MODEL above), this shadow test is flipped into a regression
// watch on the model just moved away from: gates a read-only shadow call
// to the OLD primary, gemini-3.6-flash, on every scan, entirely opt-in
// via this env var (unset = complete no-op). When set, its value IS the
// legacy model id to shadow-test (e.g. "gemini-3.6-flash"). Never
// changes GEMINI_MODEL itself, never affects the real response — purely
// visibility into whether the new primary has some weakness that only
// shows up at volume or under real stream conditions the pre-promotion
// testing didn't catch. TO UN-FLIP: see the GEMINI_MODEL comment above.
const LEGACY_GEMINI_SHADOW_MODEL = process.env.LEGACY_GEMINI_SHADOW_MODEL || null;

// PHASE 1 SLAB-LABEL PROBE KILL SWITCH (2026-10-11). See
// LEGACY_LABEL_PROBE_PROMPT below for what the probe is and why it needs
// a switch at all: the legacy shadow read is NOT purely a shadow — it is
// consumed for real by three production rescue paths (the setName hint,
// the sub-floor number rescue and the downstream number rescue) — so
// adding fields to its schema carries a small but real risk of perturbing
// the cardNumber/setName reads those rescues depend on.
//
// DEFAULTS ON when unset, so the probe collects data from the moment it
// deploys. Set SLAB_LABEL_PROBE=off to disable it, which makes the legacy
// shadow call send a request body byte-identical to the pre-probe one (it
// passes no prompt/schema override at all, so identifyWithGemini's own
// defaults apply — see legacyShadowOptions at the call site).
//
// Env vars are snapshotted at BUILD time on Vercel, so flipping this
// requires a redeploy, not just a dashboard edit.
const SLAB_LABEL_PROBE_ENABLED = String(process.env.SLAB_LABEL_PROBE ?? "on").trim().toLowerCase() !== "off";

// Old gemini-3.6-flash pricing (confirmed live 2026-09-03 — see the FIX
// comment on GEMINI_INPUT/OUTPUT_USD_PER_1M above), kept here under the
// legacy model's name purely so the shadow test's own cost logging stays
// accurate for whichever model LEGACY_GEMINI_SHADOW_MODEL points at.
// Also doubles as the values to restore GEMINI_INPUT/OUTPUT_USD_PER_1M
// to if GEMINI_MODEL is ever rolled back.
const LEGACY_GEMINI_INPUT_USD_PER_1M = 0.75;
const LEGACY_GEMINI_OUTPUT_USD_PER_1M = 3.75;

// REMOVED (2026-08-30, user report — Ditto 18/62 Fossil, LP shown $13.45
// vs. real TCGplayer LP $6.84): this flat 85/70/55/40% multiplier was
// never accurate across card eras — real per-condition ratios vary a lot
// by rarity/age (a WotC-era card's real LP/NM ratio here was 43%, not
// 85%) — and it was carrying the WHOLE condition table for any printing
// where PPT had no real per-condition breakdown at all (common for older
// cards, confirmed via logs). The user pointed out we should pull real
// per-condition prices straight from TCGplayer instead, the way
// pallet.trade does — see the live-pricing section below, which replaces
// this multiplier entirely. There is no more synthetic price anywhere in
// this file: a condition tier with no genuine live TCGplayer number now
// surfaces as an explicit `pricingError` instead of a guess (per explicit
// user instruction, since they're in an active testing phase and want
// loud failures over quiet wrong numbers).
const CONDITION_TIERS = ["NM", "LP", "MP", "HP", "DMG"];

// FIX (2026-08-27, live test — Cramorant V / Shaymin V): number was worth
// only 10 points, but the OTHER four signals combined (hp 6 + subtype 5 +
// set 2 + attackName 4 = 17) could already outscore or tie a clean exact
// number match — and modern V/VMAX/GX/ex reprints very often share
// identical HP and attack text across many different print runs of the
// same Pokemon, so "hp + attackName coincidentally match" is a common,
// weak signal, not a rare one. Real logs showed an exact "SWSH086"
// number match tie with 3 other candidates that only matched on
// hp+attackName. Pallet.trade's own API treats the card number as
// authoritative (a `number_mismatch` error code fails the whole
// identification rather than soft-scoring around it — see
// pallet-trade-reverse-engineering.md) — bumping number's weight so it
// structurally dominates any combination of the weaker signals moves us
// closer to that same principle without a full rewrite: 20 > 6+5+3+4=18.
const SCORE = { number: 20, hp: 6, subtype: 5, set: 3, attackName: 4, stampMatch: 3, stampMismatch: 8, rarity: 2 };
const MATCH_FLOOR = 3;
const HIGH_THRESHOLD = 10;
const MEDIUM_THRESHOLD = 5;

// FIX (2026-08-27, live test — Eevee "173", Pokemon Center Exclusive):
// Gemini reads a `stampType` field on every scan (enum: none, 1st
// Edition, Staff, Prerelease, Winner, Pokemon Center, World Championship,
// other) but nothing in scoring/tie-break ever used it. A tied-score
// Eevee scan (plain promo "Eevee - 173" vs. "Eevee - 173 (Pokemon Center
// Exclusive)" — same number, same HP, same attack, PPT carries both as
// separate rows) landed arbitrarily on the Pokemon Center variant, even
// though Gemini explicitly read stampType "none" — i.e. it looked at the
// card and found no such stamp. That's direct, positive evidence the
// scoring never got to see. Added a soft stamp-keyword signal: a
// candidate whose name/set advertises a specific stamp variant gets a
// bonus when it matches the read stampType, and a penalty when Gemini
// explicitly read "none" and the candidate implies a stamp isn't there.
// Deliberately a soft penalty (8, less than the number signal) rather
// than an outright exclusion — the Koffing/1st-Edition case earlier this
// project proved Gemini's stamp reads can false-negative on a real stamp,
// so this nudges ties without overriding stronger independent evidence.
const STAMP_KEYWORDS = [
  { type: "Pokemon Center", pattern: /pok[ée]mon center/i },
  { type: "Staff", pattern: /\bstaff\b/i },
  { type: "Prerelease", pattern: /pre-?release/i },
  { type: "Winner", pattern: /\bwinner\b/i },
  { type: "World Championship", pattern: /world championship|\bworlds\b/i },
];

function candidateStampType(candidate) {
  const haystack = `${candidate.name || ""} ${candidate.setName || ""}`;
  for (const { type, pattern } of STAMP_KEYWORDS) {
    if (pattern.test(haystack)) return type;
  }
  return null;
}

// ADDED 2026-10-09 (live Snorlax 33/95 — three real PPT rows share the number
// 33/95 AND hp 100: the correct Call of Legends Rare (tcgPlayerId 89392,
// $30.23) plus "Snorlax - 33/95 (Prerelease)" (213021, $499.99) and
// "Snorlax - 33/95 (Prerelease) [Staff]" (228494, $1975) from Nintendo
// Promos. Both Gemini models read stampType "none" on all three live scans,
// yet the downstream LEGACY-MODEL NUMBER RESCUE picked the $499.99 Prerelease
// row purely because Array.prototype.find takes the FIRST number match and
// PPT happened to list it one index earlier.
//
// scoreCandidate ALREADY encodes the right judgment for this: a read of
// "none" against a stamped candidate costs SCORE.stampMismatch (8), the
// second-largest weight in the table. But every by-number rescue path
// bypasses scoring entirely, so none of them ever sees it. This applies the
// same judgment to a candidate set assembled by number alone.
//
// Deliberately symmetric, and the stamped-read direction is load-bearing
// rather than symmetry for its own sake: without it, a scan that correctly
// reads "Prerelease" would see all three rows survive, hit the
// exactly-one-distinct requirement added alongside this, and rescue NOTHING
// — turning a case that works today into a withhold. Keeping only the
// candidates whose own stamp equals the read preserves it.
//
// Both branches fall back to the unfiltered set when the filter would empty
// it, so this can only narrow a choice that was already ambiguous and can
// never remove the last remaining candidate:
//   - read "none"/null + at least one unstamped candidate -> keep only unstamped
//   - read "none"/null + EVERY candidate stamped           -> unchanged
//   - read <stamp> + at least one candidate with that stamp -> keep those
//   - read <stamp> no candidate carries (e.g. "1st Edition", which
//     STAMP_KEYWORDS cannot detect at all)                  -> unchanged
// A set of 0 or 1 is returned untouched, so a unique number match is
// provably unaffected. Safe on raw PPT rows as well as normalizePptCard
// output: normalizePptCard passes `name` and `setName` straight through,
// which are the only two fields candidateStampType reads.
function filterCandidatesByStampAgreement(candidates, read) {
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates;
  const readStamp = read && read.stampType && read.stampType !== "none" ? read.stampType : null;
  if (readStamp) {
    const agreeing = candidates.filter((c) => candidateStampType(c) === readStamp);
    return agreeing.length ? agreeing : candidates;
  }
  const unstamped = candidates.filter((c) => candidateStampType(c) === null);
  return unstamped.length ? unstamped : candidates;
}

// Collapse a candidate list to distinct printings by candidateDedupKey,
// preserving order. Same loop the setName-search and sub-floor rescues
// already run inline; factored out so the downstream legacy rescue can
// apply the identical uniqueness rule without a third copy.
function distinctByDedupKey(candidates) {
  const out = [];
  const seen = new Set();
  for (const c of candidates || []) {
    const key = candidateDedupKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ADDED (2026-10-15): await the legacy shadow read with a hard cap, the
// same Promise.race-plus-cleared-timer shape the setName-hint path has
// used since 2026-10-02. Returns the legacy read object, or null if it
// timed out, rejected, or came back unusable — so every caller's
// "no legacy read available" branch covers the slow case for free.
//
// Replaces the bare `await legacyReadPromise` on the downstream number
// rescue, which was bounded only by GEMINI_TIMEOUT_MS and is where the
// one real runtime error of the 2026-10-14 window came from. The
// `.catch(() => null)` is what keeps a rejected legacy read from becoming
// an unhandled rejection; the timer is cleared on every path so a resolved
// race never holds the function open.
async function awaitLegacyReadCapped(legacyReadPromise, requestId, label, timeoutMs = LEGACY_NUMBER_RESCUE_TIMEOUT_MS) {
  if (!legacyReadPromise) return null;
  let timer = null;
  try {
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ __legacyTimedOut: true }), timeoutMs);
    });
    const legacyRead = await Promise.race([legacyReadPromise.catch(() => null), timeoutPromise]);
    if (legacyRead && legacyRead.__legacyTimedOut) {
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] legacy shadow read not ready within ${timeoutMs}ms for ${label} — continuing without it`
      );
      return null;
    }
    return legacyRead || null;
  } catch (e) {
    console.error(`[requestId=${requestId}]`, `[lookup] legacy shadow read unavailable for ${label} (treating as absent):`, e && e.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function estimateGeminiCostUsd(usageMetadata) {
  if (!usageMetadata) return null;
  const inTok = usageMetadata.promptTokenCount || 0;
  const outTok = usageMetadata.candidatesTokenCount || 0;
  const cost = (inTok / 1_000_000) * GEMINI_INPUT_USD_PER_1M + (outTok / 1_000_000) * GEMINI_OUTPUT_USD_PER_1M;
  return { estCostUsd: cost, promptTokens: inTok, outputTokens: outTok };
}

// ---------------------------------------------------------------------------
// Gemini vision call
// ---------------------------------------------------------------------------

const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    confidence: { type: "string", enum: ["High", "Medium", "Low"] },
    cardName: { type: "string", nullable: true },
    cardNumber: { type: "string", nullable: true },
    hp: { type: "string", nullable: true },
    subtype: { type: "string", nullable: true },
    setName: { type: "string", nullable: true },
    attackName: { type: "string", nullable: true },
    // ADDED (2026-09-26, Victreebel — Pokemon Jungle attackName tie):
    // PPT's `attacks` data is always stored in English regardless of a
    // card's actual print language (see extractFirstAttackName above),
    // but a Japanese card's `attackName` is transcribed as-printed
    // (Japanese script) — so the attackName scoring signal was
    // structurally dead for every Japanese scan, never able to break a
    // tie like this one (3 candidates sharing HP=80, no card number in
    // PPT's data to disambiguate, only the real card's actual attacks —
    // "Lure"/"Acid" vs. two decoys' "Razor Leaf" — could have told them
    // apart). This new field asks for the standard English move name
    // alongside the as-printed transcription (attackName is left
    // untouched, not replaced, since other things may read it) so
    // scoreCandidate can compare against PPT's English `attacks` data.
    attackNameEnglish: { type: "string", nullable: true },
    language: { type: "string", enum: ["English", "Japanese"], nullable: true },
    stampType: {
      type: "string",
      enum: ["none", "1st Edition", "Staff", "Prerelease", "Winner", "Pokemon Center", "World Championship", "other"],
    },
    isSlab: { type: "boolean" },
    grader: { type: "string", nullable: true },
    grade: { type: "string", nullable: true },
    certNumber: { type: "string", nullable: true },
    reason: { type: "string", nullable: true },
  },
  required: ["found", "confidence", "stampType", "isSlab"],
};

const GEMINI_PROMPT = `You are looking at a single video frame of a Pokemon trading card, held up on a live shopping stream. Transcribe ONLY what is literally printed and legible in this frame — do not guess a card's exact set/number from general trivia or memory. If a field isn't clearly legible, return null for it rather than guessing.

cardNumber and hp are the two most important fields — they're the strongest signals for telling apart printings that otherwise look identical, so spend extra effort trying to find them even if other parts of the card are unclear or at an angle. The card number is normally small printed text along the bottom edge of the card — usually bottom-right as a fraction like "025/198" for numbered-set cards, or a short alphanumeric code (e.g. "SWSH001", "XY126", "SVP001") for promo cards, sometimes bottom-left instead. Check that specific bottom-edge region closely even if the text there is small — it's often still legible even when other parts of the card (artwork, larger body text) are blurry or at an angle. Holo and reverse-holo cards frequently have glare directly over this area; if there's glare, look for any digits visible at the edges of the glare before concluding it's unreadable. If multiple cards are visible in the frame, make sure cardNumber, hp, and every other field describe the SAME single card being held up or highlighted — do not mix a number from one card with the HP or name of a different card in the background.

If cardNumber ends up null, briefly say why in reason (e.g. "number area obscured by glare", "card held too far from camera", "angled away from camera", "cropped out of frame") — a short phrase is enough, this is for diagnostics only, not a full explanation.

If the card text is in Japanese, translate the species name to its standard English name for cardName (e.g. チャーレム -> Medicham), and set language to "Japanese". Otherwise language is "English".

attackName is just the short name of the top/first attack (e.g. "Continuous Tumble"), not a full transcription of its text or damage. If the card's attack name is printed in a language other than English, also fill in attackNameEnglish with that attack's standard/official English name (the name it's known by in English-language Pokemon TCG releases, not a literal word-for-word translation) — e.g. attackName "だいばくはつ" -> attackNameEnglish "Explosion". If the card's attack name is already printed in English, leave attackNameEnglish null (attackName already covers it).

For stampType: only report "1st Edition" if the specific black/red "1st Edition" logo is actually visible and legible on the card — being an old-looking vintage holo is NOT evidence on its own. Default to "none" (meaning standard/Unlimited) whenever the stamp area is unclear, out of frame, or not confidently seen. Other tournament/promo stamps (Staff, Prerelease, Winner, Pokemon Center, World Championship) should only be reported if their text/logo is actually legible; use "other" for a visible-but-unrecognized stamp.

If the card appears to be inside a graded slab (a thick plastic holder with a printed label, e.g. PSA/BGS/CGC/SGC), set isSlab true and fill in grader, grade, and certNumber from the label if legible, otherwise leave them null.

If no card is visible in the frame at all, set found to false.`;

// ---------------------------------------------------------------------------
// PHASE 1 SLAB-LABEL PROBE — LEGACY SHADOW MODEL ONLY (2026-10-11)
// ---------------------------------------------------------------------------
//
// MEASUREMENT ONLY. Nothing below is read by matching, pricing, or any
// response field — it exists purely to answer one unmeasured question
// before any graded-slab feature gets built on top of it: *can a vision
// model actually read a slab label off a real live-stream frame?*
//
// The research that motivated this (see docs/history.md's slab-divergence
// entry) found, across 73 consecutive real scans with all three models
// given the byte-identical GEMINI_PROMPT:
//   - primary Gemini:      isSlab=true on 0 of 70 found reads
//   - legacy Gemini shadow: isSlab=true on 0 of 72 found reads
//   - Claude Haiku:        isSlab=true on 39 of 73 (53%)
// and `certNumber` read successfully ZERO times by any model. So the
// current four slab fields are not yet trustworthy enough to gate a
// feature on, and `labelText` is the field that would tell us whether
// that's a prompt problem or a physics problem (small specular label,
// glare band, single uncontrolled frame grab).
//
// WHY THE LEGACY SHADOW MODEL AND NOT THE PRIMARY: the primary prompt is
// load-bearing for every raw scan, and this project has a documented
// history of prompt/model changes moving raw-card accuracy. The legacy
// shadow call is already in flight on every request (see
// LEGACY_GEMINI_SHADOW_MODEL), so this adds NO new API call, no new cost
// beyond a few output tokens, and no latency on the response path.
//
// HONEST CAVEAT, FLAGGED RATHER THAN GLOSSED: this is *not* strictly
// zero-production-risk, because the legacy read is not purely a shadow —
// it is also consumed for real by three production paths (the setName
// hint at LEGACY_SETNAME_HINT_TIMEOUT_MS, the sub-floor number rescue,
// and the downstream number rescue). Adding output fields to a model's
// schema can in principle perturb its other fields. Two deliberate
// mitigations: (1) both the prompt and the schema below are STRICTLY
// ADDITIVE — GEMINI_PROMPT is embedded verbatim and every existing
// GEMINI_SCHEMA property is spread through unchanged, so nothing the
// rescues read has been reworded or re-ordered; (2) the existing
// `[legacy-model-shadow-test]` line already diffs legacy against primary
// on EVERY request, so any drift in the legacy model's cardNumber/setName
// reads is directly observable in the logs we already collect, rather
// than silent. If even that is unwanted, gating the two constants below
// behind an env var is a one-line change.
const LEGACY_LABEL_PROBE_PROMPT = `${GEMINI_PROMPT}

Additionally, if this card is inside a graded slab, transcribe the label. A graded slab is a rigid sealed plastic case with a printed label bearing a grading company name and a numeric grade. A penny sleeve, a toploader, a team bag or a one-touch magnetic holder is NOT a slab — leave every label field null for those.

labelText: transcribe EVERY piece of text visible on the slab label, verbatim and in reading order, exactly as printed and with no interpretation, guessing or reformatting. Include the grading company name, the card name, the set name, the card number, the grade and its wording, and the certification number. If only part of the label is legible, transcribe just that part rather than returning null. Return null only if there is no slab label visible at all.

grader: the grading company printed on the label, if legible (PSA, BGS, Beckett, CGC, SGC, TAG, ACE). grade: just the numeric grade as printed (e.g. "10", "9.5"), without the adjective. certNumber: the certification/serial number printed on the label — PSA is 8 digits, CGC 10-13 digits, SGC 7 digits or 7-3 digits, TAG 8 characters. A certification number has no checksum, so a single wrong character silently identifies a completely different card: return null unless EVERY character is clearly legible, and never infer, complete or guess any part of it.`;

const LEGACY_LABEL_PROBE_SCHEMA = {
  ...GEMINI_SCHEMA,
  properties: {
    ...GEMINI_SCHEMA.properties,
    labelText: { type: "string", nullable: true },
  },
};

// `model` param added 2026-09-05 (Flash-Lite shadow test, see the
// dedicated block below) — defaults to the module-level GEMINI_MODEL so
// every existing call site (which never passes a third argument) is
// completely unaffected; only the shadow-test call site passes a
// different model id explicitly.
//
// `prompt`/`schema` overrides added 2026-10-11 (Phase 1 slab-label probe,
// above) — same deliberately-defaulted pattern as `model`: both default to
// the module-level GEMINI_PROMPT/GEMINI_SCHEMA, so every existing call
// site (none of which passes a fourth argument) builds a byte-identical
// request body to the one it built before this parameter existed.
async function identifyWithGemini(imageBase64, apiKey, model = GEMINI_MODEL, { prompt = GEMINI_PROMPT, schema = GEMINI_SCHEMA } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      // FIX (2026-08-27, latency): Gemini 3.x models default to
      // thinkingLevel "medium" when this isn't set at all, which burns
      // 400-600+ internal "thinking" tokens per call BEFORE producing any
      // output — confirmed in real Vercel logs (usageMetadata.thoughtsTokenCount
      // regularly 400-600 on a simple single-image structured-extraction
      // call that needs none of that reasoning depth). This was the
      // dominant latency cost, and logs also showed 16 real requests in a
      // 24h window where the Gemini call was aborted outright by our own
      // 5000ms timeout ("This operation was aborted") — meaning some
      // fraction of scans were failing completely, not just slow.
      // "minimal" is Google's documented lowest-latency thinking level
      // ("matches the 'no thinking' setting for most queries") — this task
      // is exactly that case: transcribe visible text/fields from one
      // image into a fixed schema, not something requiring deep reasoning.
      //
      // RAISED minimal -> low (2026-08-29, research task prompted by test
      // #50's severe Gemini read instability), then REVERTED low -> minimal
      // (2026-09-01): the "low" experiment never showed a confirmed benefit
      // — tests #63 and #67, both on deployments that already included this
      // change, still showed the same instability class (wrong
      // translations, wrong card numbers at High confidence) — while a real
      // cost showed up: 31 confirmed hard Gemini timeouts in a ~25h window
      // (2026-08-31 to 2026-09-01), all landing at 5002-5004ms, right at
      // the GEMINI_TIMEOUT_MS = 5000 wall. No confirmed benefit, confirmed
      // cost -> reverted. Full write-up: docs/test-cases.md, "Research:
      // latency and PPT rate-limit options (2026-09-01)".
      thinkingConfig: { thinkingLevel: "minimal" },
      // ADDED (2026-08-29, same research task): explicitly request the
      // model's max media resolution instead of relying on the
      // undocumented "unspecified" default. Per Google's current docs
      // (ai.google.dev/gemini-api/docs/generate-content/media-resolution),
      // this is a plain generationConfig.media_resolution string on this
      // (legacy inline_data) API surface, with MEDIA_RESOLUTION_HIGH
      // giving the model the most image detail tokens to work with short
      // of the per-part-only ULTRA_HIGH. Caveat, confirmed from the same
      // docs and noted honestly rather than oversold: for Gemini 3 models
      // specifically, "unspecified" reportedly already computes to the
      // same ~1120-token budget as explicit HIGH, so this may be a no-op
      // for accuracy on gemini-3.6-flash specifically — shipping it
      // anyway as a low/zero-cost safety net against relying on
      // undocumented default behavior that could silently change on a
      // future model swap.
      media_resolution: "MEDIA_RESOLUTION_HIGH",
    },
  };

  const resp = await fetchWithTimeout(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    GEMINI_TIMEOUT_MS
  );

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Gemini error ${resp.status}: ${errBody}`);
  }

  const json = await resp.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Gemini returned unparseable JSON: " + text.slice(0, 200));
  }

  parsed._geminiUsage = json.usageMetadata || null;
  return parsed;
}

// =============================================================================
// CLAUDE HAIKU 4.5 — SHADOW-TEST LOGGING + ACTIVE FALLBACK
// (shadow test added 2026-09-03; promoted to an active fallback 2026-09-03,
// see CLAUDE.md's "Current priority" for why — a severe live Gemini failure
// cluster, 13/14 scans failed in one ~9-minute window including a new 503
// "high demand" error type, while 14 real shadow-test data points showed
// Haiku succeeding on every one of those Gemini failures.)
//
// Two DIFFERENT things now live in this section and coexist deliberately:
//
// 1. SHADOW-TEST COMPARISON LOGGING (unchanged in purpose from 2026-09-03):
//    answers the accuracy question the "is Gemini the right vision
//    provider?" research (docs/test-cases.md) couldn't settle from docs
//    alone. Logs a `[haiku-shadow-test]` line comparing both providers'
//    reads on the SAME frame whenever both are available. Still just
//    logging — never itself shown to the user or fed into matching/pricing.
//    Still removable independently once enough same-frame comparisons exist
//    to answer the accuracy question (see docs/test-cases.md) — the
//    fallback below does NOT depend on this logging function.
//
// 2. ACTIVE FALLBACK (new, 2026-09-03): when Gemini's call itself fails
//    (timeout, 5xx, unparseable response — anything that throws out of
//    identifyWithGemini), the handler now uses Haiku's read as the actual
//    response shown to the user and fed into matching/pricing, instead of
//    the old `{ found: false, error: "gemini-failed" }`. This IS a
//    permanent, user-facing behavior change and is NOT removable the way
//    the shadow-test logging is. A fallback-sourced result is always
//    labeled `visionProvider: "haiku-fallback"` in the API response (vs.
//    `"gemini"` for the normal path) so the extension panel can show the
//    user which provider actually identified the card — never a silent
//    substitution. Gemini's own successful responses, including Low-
//    confidence ones, are completely untouched — the fallback only ever
//    fires when Gemini's call itself throws.
//
// Both are entirely gated on ANTHROPIC_API_KEY being present in the
// environment (see the handler below) — a complete no-op, zero added
// latency/cost/risk, for anyone without that key configured: Gemini-only,
// today's exact pre-fallback behavior.
//
// LATENCY: haikuPromise is fired in parallel with geminiPromise, before
// either is awaited — not sequentially after Gemini fails. So when Gemini
// does fail, awaiting the already-in-flight haikuPromise adds at most
// max(GEMINI_TIMEOUT_MS, HAIKU_TIMEOUT_MS) - (time already elapsed) to the
// response, not the two timeouts added together. Both are 5000ms, so
// worst case for a fallback response is bounded by ~5000ms total, not
// ~10000ms. On the far more common path (Gemini succeeds), the response
// is sent immediately without waiting on Haiku at all — Haiku's promise is
// left to resolve in the background (via waitUntil) purely for shadow-test
// logging, so a successful Gemini scan's latency is unchanged from before.
//
// Pricing confirmed LIVE 2026-09-03 against platform.claude.com/docs/en/
// about-claude/pricing (not reused from the earlier research doc without
// rechecking): Claude Haiku 4.5 is $1.00 input / $5.00 output per MTok,
// standard (non-batch) rate — unchanged from the research doc's numbers,
// but re-verified live per the same discipline that research used.
const ANTHROPIC_INPUT_USD_PER_1M = 1.0;
const ANTHROPIC_OUTPUT_USD_PER_1M = 5.0;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
// Same budget as Gemini's own GEMINI_TIMEOUT_MS, deliberately — this is a
// fair latency comparison, not a generous allowance for the shadow call.
const HAIKU_TIMEOUT_MS = 5000;

// Waits for the given promise without holding open the response to the
// user — see the big comment above. @vercel/functions' waitUntil() is
// confirmed (via its own docs, checked live 2026-09-03) to work in
// Node.js Vercel Functions, not just Edge, and to extend the invocation's
// lifetime up to the function's own maxDuration (15s here, per
// vercel.json — comfortably covers HAIKU_TIMEOUT_MS). Guarded require:
// if the package is somehow unavailable at runtime, this shadow test
// degrades to best-effort fire-and-forget rather than breaking anything
// in the real request path.
let waitUntil = null;
try {
  ({ waitUntil } = require("@vercel/functions"));
} catch (e) {
  waitUntil = null;
}

// ADDED (2026-09-12, PPT per-minute rate-limit research — see
// docs/test-cases.md "Research: PPT per-minute rate limit hit during
// normal single-click scanning"): a short-TTL cache for lookupCardPPT's
// result, to avoid spending fresh PokemonPriceTracker credits on
// identical/near-identical repeat searches within a short window (the
// same card visible for several seconds while the user considers, or a
// manual re-scan) — real logs showed a scan can cost up to 3 separate
// PPT calls (90 credits) in the worst case, and that worst case fires
// on over a third of real scans. Uses Vercel's own Runtime Cache
// (`getCache()`), confirmed via Vercel's docs to be available on the
// Hobby plan with no new dependency (this file already requires
// `@vercel/functions` for `waitUntil` above) and no new paid service —
// same guarded-require pattern as `waitUntil`, so a missing/unavailable
// package just disables caching rather than breaking real requests.
let getCache = null;
try {
  ({ getCache } = require("@vercel/functions"));
} catch (e) {
  getCache = null;
}

// Namespaced separately from anything else that might ever share this
// team's single Hobby-plan Runtime Cache (Runtime Cache is per-team on
// Hobby, not per-project — confirmed via Vercel's docs).
const PPT_CACHE_NAMESPACE = "wnpk-ppt-lookup";

// TTL chosen at the SHORT end of the 30-60s range the user asked for,
// deliberately, not the middle or long end: Whatnot's own sudden-death
// auctions run ~10s each (the reason this project's own latency target
// is 1-3s, not the original 2-5s — see CLAUDE.md), so "same card visible
// for several seconds" plus a manual re-scan or two is comfortably
// covered by 30s. A longer TTL would buy a higher hit rate but widens
// the window in which a DIFFERENT physical card sharing the exact same
// name+number+language as an earlier one (a real possibility — see the
// cache-key comment below) could serve a stale result; 30s keeps that
// window as small as the caching benefit allows.
const PPT_CACHE_TTL_SECONDS = 30;

// Cache key deliberately includes cardNumber, not just cardName+language.
// A wholesale cardName+language-only key would let two DIFFERENT
// physical cards that happen to share a species name (extremely common
// on this app's own use case — e.g. several different Pikachu prints
// sold back-to-back in the same stream) collide within the TTL window
// and silently serve one card's identification/price for another — the
// exact kind of confident-wrong-answer this project's whole design
// philosophy exists to avoid (see CLAUDE.md's "Key design principle").
// cardNumber is this codebase's own highest-weighted, most reliable
// match signal (see SCORE / pickBestCandidate below) precisely because
// it's the one field that actually disambiguates printings — so it's
// the right disambiguator here too. When no cardNumber was read at all,
// return null (skip caching entirely for that lookup) rather than cache
// under a weaker key: a numberless read is exactly the case with the
// least ability to tell two different cards apart, so failing toward
// "spend the PPT credits" is safer than failing toward "maybe serve the
// wrong card."
function pptCacheKey(read) {
  if (!read || !read.cardNumber) return null;
  const name = normalizeNameForMatch(read.cardName || "");
  if (!name) return null;
  const number = String(read.cardNumber).trim().toLowerCase();
  const language = String(read.language || "English").trim().toLowerCase();
  return `${language}:${name}:${number}`;
}

// Same field set as GEMINI_SCHEMA, re-expressed in standard JSON Schema
// (Anthropic's output_config.format uses plain JSON Schema, not Gemini's
// OpenAPI-flavored `nullable: true` — nullable fields here use a
// `["string", "null"]` type union instead). Anthropic's own structured-
// outputs example requires every defined property when
// `additionalProperties: false` is set (confirmed live 2026-09-03,
// platform.claude.com/docs/en/build-with-claude/structured-outputs) —
// followed here even though Gemini's own schema only required 4 fields,
// since that's how Anthropic's strict-schema validation is documented to
// work.
const HAIKU_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    confidence: { type: "string", enum: ["High", "Medium", "Low"] },
    cardName: { type: ["string", "null"] },
    cardNumber: { type: ["string", "null"] },
    hp: { type: ["string", "null"] },
    subtype: { type: ["string", "null"] },
    setName: { type: ["string", "null"] },
    attackName: { type: ["string", "null"] },
    // ADDED (2026-09-26) — see the matching comment on GEMINI_SCHEMA
    // above for the full rationale (Victreebel/Pokemon Jungle tie).
    attackNameEnglish: { type: ["string", "null"] },
    // FIX (2026-09-03, caught by a local smoke test before deploying —
    // see the shadow-test comment above): `type: ["string", "null"]`
    // combined with `enum` including `null` was rejected live by
    // Anthropic's schema validator ("Enum value 'English' does not match
    // declared type"). `enum` alone (which already implies the allowed
    // value set, null included) is what actually works.
    language: { enum: ["English", "Japanese", null] },
    stampType: {
      type: "string",
      enum: ["none", "1st Edition", "Staff", "Prerelease", "Winner", "Pokemon Center", "World Championship", "other"],
    },
    isSlab: { type: "boolean" },
    grader: { type: ["string", "null"] },
    grade: { type: ["string", "null"] },
    certNumber: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
  },
  required: [
    "found",
    "confidence",
    "cardName",
    "cardNumber",
    "hp",
    "subtype",
    "setName",
    "attackName",
    "attackNameEnglish",
    "language",
    "stampType",
    "isSlab",
    "grader",
    "grade",
    "certNumber",
    "reason",
  ],
  additionalProperties: false,
};

function estimateHaikuCostUsd(usage) {
  if (!usage) return null;
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok / 1_000_000) * ANTHROPIC_INPUT_USD_PER_1M + (outTok / 1_000_000) * ANTHROPIC_OUTPUT_USD_PER_1M;
  return { estCostUsd: cost, promptTokens: inTok, outputTokens: outTok };
}

// Same shape/contract as identifyWithGemini(imageBase64, apiKey) — takes
// the raw image + an API key, returns a plain object with the same field
// set (plus its own _haikuUsage instead of _geminiUsage). Reuses
// GEMINI_PROMPT verbatim, per the task's explicit instruction to share
// prompt content where possible.
async function identifyWithHaiku(imageBase64, apiKey) {
  const body = {
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: GEMINI_PROMPT },
        ],
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: HAIKU_SCHEMA },
    },
  };

  const resp = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    HAIKU_TIMEOUT_MS
  );

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Haiku error ${resp.status}: ${errBody}`);
  }

  const json = await resp.json();
  const text = json.content?.[0]?.text;
  if (!text) throw new Error("Haiku returned no content");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Haiku returned unparseable JSON: " + text.slice(0, 200));
  }

  parsed._haikuUsage = json.usage || null;
  return parsed;
}

// Fields compared between the two providers' reads for the shadow-test
// log line. Deliberately the fields that actually drive matching/scoring
// downstream (see scoreCandidate below) — not every raw field Gemini
// returns (e.g. `reason` is free text, not meaningfully comparable).
const HAIKU_SHADOW_COMPARE_FIELDS = ["cardName", "cardNumber", "hp", "subtype", "setName", "attackName", "attackNameEnglish", "language", "stampType", "isSlab", "confidence"];

function haikuShadowFieldsMatch(a, b) {
  const na = a == null ? "" : String(a).trim().toLowerCase();
  const nb = b == null ? "" : String(b).trim().toLowerCase();
  return na === nb;
}

// Orchestrates the shadow comparison: awaits the SAME geminiPromise and
// haikuPromise the main handler already created (promises are safe to
// await from multiple places — a promise's underlying work only ever runs
// once no matter how many places `await` it, so this never fires a second
// Haiku API call and never affects what the main handler sees), and logs
// one greppable line either way, including when Gemini itself failed
// (that's one of the more interesting comparison points, not a case to
// skip — and, since 2026-09-03, also the case where Haiku's read was just
// used as the real fallback response, not only logged). Never throws past
// its own try/catches — the caller wraps this in one more .catch() as a
// second safety net (see the handler below) so a bug here can never
// surface to the real response.
async function runHaikuShadowTest(geminiPromise, haikuPromise, tStart, tHaikuStart) {
  let haikuResult = null;
  let haikuErrorMsg = null;
  try {
    haikuResult = await haikuPromise;
  } catch (e) {
    haikuErrorMsg = (e && e.message) || String(e);
  }
  const haikuMs = Date.now() - tHaikuStart;

  let geminiResult = null;
  let geminiErrorMsg = null;
  try {
    geminiResult = await geminiPromise;
  } catch (e) {
    geminiErrorMsg = (e && e.message) || String(e);
  }
  const geminiMs = Date.now() - tStart;

  const haikuUsage = haikuResult ? estimateHaikuCostUsd(haikuResult._haikuUsage) : null;

  let fieldAgreement = null;
  let overallMatch = "n/a";
  if (geminiResult && haikuResult) {
    fieldAgreement = {};
    let allAgree = true;
    for (const field of HAIKU_SHADOW_COMPARE_FIELDS) {
      const agree = haikuShadowFieldsMatch(geminiResult[field], haikuResult[field]);
      fieldAgreement[field] = agree;
      if (!agree) allAgree = false;
    }
    overallMatch = allAgree;
  }

  console.log(
    "[haiku-shadow-test]",
    "gemini=",
    JSON.stringify(geminiErrorMsg ? { error: geminiErrorMsg } : geminiResult),
    "haiku=",
    JSON.stringify(haikuErrorMsg ? { error: haikuErrorMsg } : haikuResult),
    "match=",
    overallMatch,
    "fieldAgreement=",
    JSON.stringify(fieldAgreement),
    "geminiMs=",
    geminiMs,
    "haikuMs=",
    haikuMs,
    "haikuCostUsd=",
    haikuUsage ? haikuUsage.estCostUsd : null
  );
}
// =============================================================================
// END TEMPORARY SHADOW TEST
// =============================================================================

// =============================================================================
// LEGACY-MODEL REGRESSION SHADOW TEST — GEMINI 3.6 FLASH VS CURRENT MODEL
// (originally added 2026-09-05 as "TEMPORARY SHADOW TEST — GEMINI 3.5
// FLASH-LITE VS CURRENT MODEL", forward-looking research into whether
// Flash-Lite was worth promoting — see "Research: hitting a 1-3s latency
// target for sudden-death auctions", docs/test-cases.md, 2026-09-05.
// REVERSED 2026-09-06 when that research (tests #80-83) led to actually
// promoting gemini-3.5-flash-lite to GEMINI_MODEL (see the comment on
// GEMINI_MODEL's definition above for the decision trace). Same harness,
// flipped direction: now watches the OLD primary (gemini-3.6-flash) in
// the background as a regression check on the model just moved away
// from, not forward-looking research on a candidate. UNRELATED to the
// Claude Haiku shadow-test/fallback block above — this compares two
// Gemini-family models against each other, not Gemini vs. a different
// provider.
//
// SAME non-disruptive shape as before: entirely gated on
// LEGACY_GEMINI_SHADOW_MODEL being set (see its definition above) — a
// complete no-op otherwise. The current model (GEMINI_MODEL, now
// gemini-3.5-flash-lite) remains the sole source of what the user sees
// and what matching/pricing runs on; the legacy model's read is logged
// only, never consumed elsewhere. Fired in parallel with the real call,
// not awaited before responding, kept alive via waitUntil() the same
// way — see the handler wiring below.
//
// CORRECTNESS NOTE (worth keeping if this pattern is ever copied again):
// the Haiku shadow test's `geminiMs` field is mislabeled when Haiku is
// the slower of the two promises, because that function awaits its two
// promises sequentially and stamps each one's elapsed time only after
// the wait completes — the second stamp ends up measuring "however long
// we waited on the slower promise," not the first promise's own
// completion time (see the "Research: hitting a 1-3s latency target"
// entry in docs/test-cases.md for the full story, and CLAUDE.md/
// test-cases.md test #79's methodology note). Fixed here via
// `timePromise()`, which subscribes to each promise independently at
// creation time via `.then()`, so each one's own elapsed-time stamp is
// captured the instant IT settles, regardless of what order anything
// else awaits them in or how long the other one takes.
//
// TO UN-FLIP BACK (if GEMINI_MODEL is ever reverted to gemini-3.6-flash):
// change GEMINI_MODEL's default back, set LEGACY_GEMINI_SHADOW_MODEL to
// "gemini-3.5-flash-lite" instead, and swap GEMINI_INPUT/OUTPUT_USD_PER_1M
// back to the 0.75/3.75 values currently on LEGACY_GEMINI_INPUT/
// OUTPUT_USD_PER_1M (and vice versa) — see the comments on those
// constants above.
//
// REMOVABLE ENTIRELY: to fully remove this regression watch, delete (1)
// this whole block, (2) the `LEGACY_GEMINI_SHADOW_MODEL`/
// `LEGACY_GEMINI_INPUT_USD_PER_1M`/`LEGACY_GEMINI_OUTPUT_USD_PER_1M`
// constants above, (3) the handler call site below (the `if
// (LEGACY_GEMINI_SHADOW_MODEL) { ... }` block), and (4) revert
// `identifyWithGemini`'s `model` parameter back to using `GEMINI_MODEL`
// directly (harmless to leave, but the parameter becomes dead once
// nothing passes a third argument).

function timePromise(promise, tStart) {
  return promise.then(
    (result) => ({ result, error: null, ms: Date.now() - tStart }),
    (err) => ({ result: null, error: (err && err.message) || String(err), ms: Date.now() - tStart })
  );
}

function estimateLegacyGeminiCostUsd(usageMetadata) {
  if (!usageMetadata) return null;
  const inTok = usageMetadata.promptTokenCount || 0;
  const outTok = usageMetadata.candidatesTokenCount || 0;
  const cost = (inTok / 1_000_000) * LEGACY_GEMINI_INPUT_USD_PER_1M + (outTok / 1_000_000) * LEGACY_GEMINI_OUTPUT_USD_PER_1M;
  return { estCostUsd: cost, promptTokens: inTok, outputTokens: outTok };
}

// Takes the two ALREADY-TIMED promises the handler created (via
// timePromise(), so timing is correct regardless of await order — see
// the correctness note above) and logs one greppable comparison line.
// Reuses HAIKU_SHADOW_COMPARE_FIELDS/haikuShadowFieldsMatch (defined
// above) as-is — both are generic field-set/string-compare helpers, not
// actually Haiku-specific, and both models here share the exact same
// GEMINI_SCHEMA/GEMINI_PROMPT, so the field list is identical. Never
// throws past its own try/catch — the caller wraps this in one more
// .catch() as a second safety net, same as the Haiku shadow test.
async function runLegacyModelShadowTest(timedCurrentPromise, timedLegacyPromise, requestId) {
  const [current, legacy] = await Promise.all([timedCurrentPromise, timedLegacyPromise]);

  const legacyUsage = legacy.result ? estimateLegacyGeminiCostUsd(legacy.result._geminiUsage) : null;

  let fieldAgreement = null;
  let overallMatch = "n/a";
  if (current.result && legacy.result) {
    fieldAgreement = {};
    let allAgree = true;
    for (const field of HAIKU_SHADOW_COMPARE_FIELDS) {
      const agree = haikuShadowFieldsMatch(current.result[field], legacy.result[field]);
      fieldAgreement[field] = agree;
      if (!agree) allAgree = false;
    }
    overallMatch = allAgree;
  }

  console.log(
    `[legacy-model-shadow-test] requestId=${requestId}`,
    "currentModel=",
    GEMINI_MODEL,
    "legacyModel=",
    LEGACY_GEMINI_SHADOW_MODEL,
    "current=",
    JSON.stringify(current.error ? { error: current.error } : current.result),
    "legacy=",
    JSON.stringify(legacy.error ? { error: legacy.error } : legacy.result),
    "match=",
    overallMatch,
    "fieldAgreement=",
    JSON.stringify(fieldAgreement),
    "currentMs=",
    current.ms,
    "legacyMs=",
    legacy.ms,
    "legacyCostUsd=",
    legacyUsage ? legacyUsage.estCostUsd : null
  );

  logSlabLabelProbe(current.result, legacy.result, requestId);
}

// PHASE 1 SLAB-LABEL PROBE LOGGING (2026-10-11) — see
// LEGACY_LABEL_PROBE_PROMPT above. Deliberately a SEPARATE, short,
// greppable line rather than more fields on the
// `[legacy-model-shadow-test]` line: that line already JSON.stringify's
// the whole legacy read, so `labelText` would land inside it anyway — and
// a long label would push that line past the ~3000-char truncation the
// Vercel MCP log tool applies (see CLAUDE.md), silently hiding the
// existing fields it is relied on for. One tagged line per relevant scan,
// with labelText capped, keeps both readable.
//
// Fires only when there is something to measure — either model called a
// slab, or the probe transcribed a label. The DENOMINATOR for any rate
// computed from these lines must come from counting
// `legacy-model-shadow-test` lines, which fire unconditionally; per
// CLAUDE.md, never derive a rate from a filter that only matches the
// successful case.
function logSlabLabelProbe(current, legacy, requestId) {
  try {
    if (!current && !legacy) return;
    const primarySlab = current ? current.isSlab === true : null;
    const legacySlab = legacy ? legacy.isSlab === true : null;
    const labelText = legacy ? legacy.labelText : null;
    if (!primarySlab && !legacySlab && !labelText) return;

    console.log(
      `[slab-label-probe] requestId=${requestId}`,
      // So the two switch states are never confused when reading logs: a
      // probe=off line has no labelText by construction, not because the
      // label was illegible.
      "probe=",
      SLAB_LABEL_PROBE_ENABLED ? "on" : "off",
      "primaryIsSlab=",
      primarySlab,
      "legacyIsSlab=",
      legacySlab,
      "legacyGrader=",
      legacy ? legacy.grader : null,
      "legacyGrade=",
      legacy ? legacy.grade : null,
      "legacyCert=",
      legacy ? legacy.certNumber : null,
      "legacyLabelTextLen=",
      labelText ? String(labelText).length : 0,
      "legacyLabelText=",
      labelText ? JSON.stringify(String(labelText).slice(0, 400)) : null,
      // The primary read's own slab fields, for the same frame — this is
      // the comparison the whole probe exists to produce.
      "primaryGrader=",
      current ? current.grader : null,
      "primaryGrade=",
      current ? current.grade : null,
      "primaryCert=",
      current ? current.certNumber : null,
      "primaryCardName=",
      current ? current.cardName : null,
      "primaryCardNumber=",
      current ? current.cardNumber : null
    );
  } catch (e) {
    // Logging must never be able to break a real scan.
    console.error(`[slab-label-probe] requestId=${requestId} probe logging threw (non-fatal):`, e && e.message);
  }
}
// =============================================================================
// END LEGACY-MODEL REGRESSION SHADOW TEST
// =============================================================================

// ---------------------------------------------------------------------------
// Shared scoring — ONE function used by every lookup (raw-card and
// graded-slab).
// ---------------------------------------------------------------------------

// FIX (2026-08-27, live test — Silvally GX): the regex here required the
// number to START with a digit (`^0*(\d+)`), so it silently failed to
// parse ANY alphanumeric-prefixed card number — promo formats like
// "SM91", "SV79/SV94", "XY177", "BW-P" etc, which are common on secret
// rares and black-star promos. When both sides fail to parse,
// numbersMatch returns "no match, 0 points" even when the numbers are
// actually identical. Confirmed via real logs: Gemini read cardNumber
// "SM91" for a real Silvally GX promo, which exactly matches a real
// candidate's number field ("SM91") in the pool — but the old regex
// returned null for both, so the number signal contributed nothing, and
// the pick fell back to a 7-way tie among every same-HP/same-attack
// Silvally GX printing (since they're mechanically identical Pokemon
// cards, just different print runs), landing on the wrong one (Hidden
// Fates Shiny Vault, first in the raw list) instead of the actual promo.
// Now captures an optional leading letter prefix on both the number and
// the total, and requires the prefix to match too (case-insensitive).
// FIX (2026-09-26, live scans — Lapras "No. 131" / Victreebel "No.071"):
// this regex required the number to start with an optional letter PREFIX
// immediately adjacent to the digits (for "SM91"-style promo codes), but
// had no tolerance for a "No. "/"No."/"#"-style LABEL in front of the
// digits — a real, recurring print convention (confirmed live: SV2a:
// Pokemon Card 151 prints its card number as "No. XXX" rather than the
// more common "XXX/165" fraction). "No. 131" doesn't start with a digit
// or "0", so the whole match failed and normalizeNumber returned null —
// not a partial/weak parse, a TOTAL parse failure, meaning numbersMatch's
// `if (!a || !b) return {match:false...}` guard threw the read away
// before ever comparing it to any candidate, even though the real
// candidate ("131/165") was sitting in the pool the whole time. This is
// distinct from a genuine legibility/Pokédex-number-confusion case (see
// the Azumarill "No. 184" investigation, docs/test-cases.md) — there the
// real candidate's own PPT record has an empty cardNumber, so this fix
// doesn't change that outcome; it only fixes cases where a real numeric
// candidate exists and the label was the sole reason the read couldn't
// reach it. The label is stripped as a throwaway prefix, NOT captured
// into `prefix` (which participates in the cross-side equality check) —
// deliberately, so a "No. 131" read still correctly has prefix "" and
// can match a plain, unprefixed candidate number, exactly as a bare
// "131" read already does.
const NUMBER_LABEL_PATTERN = /^\s*(?:no\.?\s*|#\s*)?/i;

function normalizeNumber(raw) {
  if (raw == null) return null;
  const str = String(raw).trim().replace(NUMBER_LABEL_PATTERN, "");
  const m = str.match(/^([A-Za-z]*)0*(\d+)(?:\s*\/\s*([A-Za-z]*)0*(\d+))?/);
  if (!m) return null;
  return {
    prefix: (m[1] || "").toUpperCase(),
    num: m[2],
    totalPrefix: (m[3] || "").toUpperCase(),
    total: m[4] || null,
  };
}

// FIX (2026-08-27, live test — Mewtwo/SVP 052): a bare promo-style number
// with NO "/total" (e.g. "052") matched a totally unrelated numbered-set
// candidate ("52/108", XY - Evolutions) at FULL number-match strength (20
// points, same as an exact "52/108"=="52/108" match), and nothing else
// scored, yet this still won at false "High" confidence and showed the
// wrong card+price ($10.45 Mewtwo EX instead of the real SVP 052 promo).
// Real log evidence: read cardNumber "052", winning candidate number
// "52/108" — matching digits are coincidental (there are dozens of
// unrelated "Mewtwo" printings whose numerator happens to be in the low
// 50s), not evidence of the same printing. Distinguish this from the
// Silvally GX case (test #18), where BOTH the read ("SM91") and the
// correct candidate ("SM91") lacked a total — that's a true promo-to-promo
// match and deserves full credit. The bug is specifically the ASYMMETRIC
// case: one side has a "/total" (a numbered-set card) and the other
// doesn't (a promo-style bare number) — different numbering schemes
// entirely, so a shared numerator is weak coincidental evidence, not
// confirmation. Downgraded to well below MEDIUM_THRESHOLD on its own so a
// bare-number-only match can no longer surface as a confident answer.
// FIX (2026-08-31, test #67 — Froakie 056/066 vs 056/197): the
// `bothHaveTotal` branch used to give 0.7x partial credit AND
// `match: true` when the numerator matched but the total/denominator
// didn't ("056/066" vs "056/197") — but a different total is normally a
// different set/printing entirely, not a near-miss. That spurious
// `match: true` fed straight into every caller that asks "did the read
// number match anything" (the page-2/combined-search retry triggers,
// the name-filter rescue path, the Shadowless-sibling lookup, and —
// worst — the `numberMatchedForBest`/`anyNumberMatch` check that gates
// the accurate "no candidate has this number" warning). Confirmed via
// real logs: two candidates sharing the literal number "056/197" tied
// at score 20 (14 from this 0.7x credit + 6 HP) purely because of this
// coincidental-numerator credit, which suppressed the accurate warning
// and let the generic "wasn't legible" message fire instead, even
// though Gemini had read a specific, wrong, denominator every time.
// Now treated as NO match at all (same as a numerator mismatch) — a
// mismatched total is disqualifying, not partial evidence. Deliberately
// leaves the `neitherHasTotal`/asymmetric-"weak" branches below
// untouched — those are the legitimate partial-match cases from test
// #23 (a bare promo number vs. a numbered-set candidate, where one side
// simply doesn't carry a total at all) and are a different situation
// from two candidates that both HAVE totals and disagree on what they
// are.
function numbersMatch(readRaw, candRaw) {
  const a = normalizeNumber(readRaw);
  const b = normalizeNumber(candRaw);
  if (!a || !b) return { match: false, points: 0, strength: "none" };
  if (a.prefix !== b.prefix || a.num !== b.num) return { match: false, points: 0, strength: "none" };

  const bothHaveTotal = a.total && b.total;
  const neitherHasTotal = !a.total && !b.total;

  if (bothHaveTotal) {
    if (a.total !== b.total || a.totalPrefix !== b.totalPrefix) {
      return { match: false, points: 0, strength: "none" };
    }
    return { match: true, points: SCORE.number, strength: "exact" };
  }

  if (neitherHasTotal) {
    return { match: true, points: SCORE.number, strength: "exact" };
  }

  // Asymmetric: one side is a numbered-set card, the other a bare
  // promo-style number. Weak coincidental evidence only.
  return { match: true, points: SCORE.number * 0.35, strength: "weak" };
}

// ADDED (2026-10-15, Alakazam 33/165 — requestId f033dcfe): does the
// DENOMINATOR of two numbers positively disagree? This is deliberately
// numbersMatch's own `bothHaveTotal` disqualification rule and nothing
// more — same fields, same comparison, same "a different total is a
// different set/printing entirely" reasoning written out above — lifted
// into a predicate that can be asked about a number pair whose NUMERATORS
// were never expected to match.
//
// numbersMatch itself is useless for that question: it short-circuits on
// `a.num !== b.num` and reports `strength: "none"` without ever looking at
// the totals, so a read of "1/18" against a candidate "001/165" is
// indistinguishable from "1/18" against "77/102".
//
// The real case: the primary model read "1/18" off an Expedition Alakazam
// whose true number is 033/165. The legacy shadow model read "1/165",
// which matched Alakazam (1) 001/165 exactly, and the downstream rescue
// installed that card — an 11.7x more expensive holo sibling. The primary
// read's own denominator ("/18") contradicted the rescue target's ("/165")
// the whole time; nothing was looking.
//
// Returns false whenever either side lacks a total, matching numbersMatch's
// treatment of the asymmetric bare-promo-number case as weak-but-not-
// disqualifying rather than as a contradiction. Absence of a denominator is
// not disagreement about one.
function totalsContradict(aRaw, bRaw) {
  const a = normalizeNumber(aRaw);
  const b = normalizeNumber(bRaw);
  if (!a || !b) return false;
  if (!a.total || !b.total) return false;
  return a.total !== b.total || a.totalPrefix !== b.totalPrefix;
}

// FIX (2026-09-27, live test — Mewtwo 10/130 and Nidoking 11/130, both
// Base Set 2): the combined name+number search fallback below (added for
// test #49) builds its query from `read.cardNumber` verbatim ("Mewtwo
// 10/130"), but PPT's `search` param does exact/tokenized matching on the
// stored cardNumber string, not fuzzy matching — and confirmed live
// against real PPT data, certain vintage sets (Base Set, Base Set 2)
// store their card numbers with the numerator zero-padded to the SAME
// DIGIT WIDTH as the total ("010/130", "001/130"), while others (Jungle,
// Fossil, every modern set checked) don't ("9/64" stored as "09/64" to
// match Jungle's 2-digit total, not 3). A plain-text search for the
// unpadded "10/130" therefore returns zero results against a stored
// "010/130", even though the record exists and even though
// `normalizeNumber()`/`numbersMatch()` already strip leading zeros
// correctly once a candidate is actually in the pool — this was never a
// scoring bug, only a query-construction gap. Confirmed via real PPT API
// calls before building this: Base Set 2 and Base Set (Shadowless) both
// pad every numerator to match their total's width (checked across the
// full numerator range, 001-130 and 001-102); Jungle/Fossil (2-digit
// totals) don't extend past 2-digit padding. This derives the padding
// width from the read's own parsed total rather than hardcoding a fixed
// width, so it generalizes to any set following the same convention
// without needing to know in advance which sets do.
function buildZeroPaddedNumberVariant(rawNumber) {
  const parsed = normalizeNumber(rawNumber);
  if (!parsed || !parsed.total) return null;
  if (parsed.num.length >= parsed.total.length) return null;
  const paddedNum = parsed.num.padStart(parsed.total.length, "0");
  return `${parsed.prefix}${paddedNum}/${parsed.totalPrefix}${parsed.total}`;
}

// ADDED (2026-10-18, live Rayquaza run): the SECOND stored padding
// convention. buildZeroPaddedNumberVariant above pads the numerator to the
// width of the read's own total, which is right for Base Set/Base Set 2
// ("10/130" -> "010/130") and for Jungle/Fossil ("9/64" -> "09/64"). It is
// wrong for the small promo sets, which pad BOTH sides to three digits: POP
// Series stores a 17-card set as "003/017", not "03/17".
//
// Real cost of the gap: seven consecutive scans of a Rayquaza POP Series 1
// 003/017 ($325.30). All three models read "3/17" correctly and agreed on
// hp 80 and the attack "Fly" — the read was never the problem. The card was
// simply absent from the 60-candidate pool ("Rayquaza" is one of the most
// reprinted names in the game), and the combined name+number rescue that
// exists precisely to recover that case queried "Rayquaza 3/17" and
// "Rayquaza 03/17", both of which return ZERO rows. Verified directly
// against PPT: `search="Rayquaza 003/017"` returns the card.
//
// `numbersMatch` already handles the comparison once the row is in the pool
// (normalizeNumber strips leading zeros), so this is purely a
// query-construction gap — the same class as the 2026-09-27 Base Set 2 fix,
// which derived padding from the total and stopped one digit short of this.
//
// Scoped to a read total of fewer than three digits, so it never fires for
// the modern/vintage sets the existing variant already covers and can never
// change a query that works today. Returns null when it would duplicate.
function buildWideZeroPaddedNumberVariant(rawNumber) {
  const parsed = normalizeNumber(rawNumber);
  if (!parsed || !parsed.total) return null;
  if (parsed.total.length >= 3) return null;
  const paddedNum = parsed.num.padStart(3, "0");
  const paddedTotal = parsed.total.padStart(3, "0");
  return `${parsed.prefix}${paddedNum}/${parsed.totalPrefix}${paddedTotal}`;
}

// ADDED (2026-10-03, Southern Islands Mew wrong-number class — see
// docs/test-cases.md): the "read total orphan" signal, used ONLY by the
// setName-scoped search rescue further down.
//
// Three of the ten logged Mew scans read a WRONG card number (8/18 x2,
// 8/64) and resolved to tcgPlayerId 607818 ("Mew - 8 (Glossy Finish)",
// WoTC Promo, $37.25) instead of the real 46466 ($624.04) — a 17x
// understatement at Medium confidence, resting on nothing but a
// coincidental numerator. The read "8/18" weak-matches the bare candidate
// number "8" (numbersMatch's asymmetric branch: SCORE.number * 0.35 = 7
// points, and crucially `match: true`), and that `match: true` is what
// satisfies `numberAlreadyConfirmed` and blocks the rescue entirely.
//
// What separates the right card from the wrong one here is the
// DENOMINATOR, not the numerator: the read said "/18" and NOT ONE
// candidate in the fetched pool carries total 18, because the whole
// Southern Islands set was crowded out of the search. That is a precise
// "the set we need was never retrieved, or the denominator was misread"
// detector. Measured against 18 real cached PPT pools, 330 perturbation
// triples (see the matching docs/test-cases.md entry):
//     number read correctly      -> fires   0 / 330  (0.0%)
//     NUMERATOR misread (+7)     -> fires   0 / 330  (0.0%)
//     DENOMINATOR misread (+13)  -> fires 317 / 330 (96.1%)
// So it ignores numerator typos — which the page-2 and combined
// name+number fallbacks above already handle — and fires almost only when
// the denominator is wrong or the set is absent. It also cannot fire at
// all on a read with no "/total", which is what keeps the large, mostly-
// CORRECT bare-numerator population (322/330 real simulated scans land on
// a weak match, 276 of them on the right card) completely untouched.
//
// NOT usable as a general scoring signal, and deliberately not wired in as
// one: PPT's own `totalSetNumber` is null everywhere (confirmed again on
// 46466), so "the candidate set's real printed total" is not available —
// only the total embedded in a candidate's own number string is.
function readTotalMissingFromPool(readNumber, candidates) {
  const parsed = readNumber ? normalizeNumber(readNumber) : null;
  if (!parsed || !parsed.total) return false;
  if (!Array.isArray(candidates) || !candidates.length) return false;
  return !candidates.some((c) => {
    const candParsed = c && c.number ? normalizeNumber(c.number) : null;
    return candParsed && candParsed.total && candParsed.total === parsed.total && candParsed.totalPrefix === parsed.totalPrefix;
  });
}

// Companion to the above: denominator-only equality, ignoring the
// numerator. Used ONLY as the relaxed acceptance rule inside the
// setName-scoped rescue, and ONLY when readTotalMissingFromPool already
// fired — never as a scoring signal and never on the pre-existing rescue
// path. Requires BOTH sides to actually carry a total, so a bare
// promo-style number on either side can never qualify (verified: read
// "8/18" accepts only 01/18 Southern Islands and rejects 32/68 Hidden
// Fates, bare "8"/47/53/08/53 WoTC Promo, 53/108 XY-Evolutions and
// 131/165 SV2a; read "8/64" accepts nothing at all, which is correct —
// that denominator was misread too).
function numberTotalsMatch(readRaw, candRaw) {
  const a = normalizeNumber(readRaw);
  const b = normalizeNumber(candRaw);
  if (!a || !b || !a.total || !b.total) return false;
  return a.total === b.total && a.totalPrefix === b.totalPrefix;
}

// ADDED (2026-08-31, research write-up + test #53 Drayton case):
// PPT's raw `rarity` field is fetched on every single lookup already
// (zero extra API cost) but was never used anywhere in scoring —
// confirmed via `grep -n "\.rarity" api/identify.js` returning zero
// hits before this change, the same "reliably-present-in-data-we-
// already-have, silently unused" pattern as the earlier attackName and
// Trainer-subtype dead-signal bugs.
//
// ARCHITECTURALLY DIFFERENT from every other signal in scoreCandidate:
// every other signal compares Gemini's READ against the candidate
// (read.hp vs candidate.hp, etc). Gemini is not asked to read rarity at
// all (no schema/prompt change here, per explicit instruction — that
// would need separate live-scan validation of Gemini's read reliability
// before being trusted, a different, not-yet-answered question). This
// is instead a candidate-side-only PRIOR: cards actually worth pausing a
// livestream to identify and price-check skew heavily toward notable/
// chase rarities rather than bulk commons (this project's own 66+ real
// test cases bear this out — virtually none are plain Common/Uncommon
// pulls), the same kind of evidence-grounded prior as isOddityCandidate
// below (which similarly never compares against a read value).
//
// Deliberately a SMALL, OPT-IN allow-list, not a deny-list of "ordinary"
// tiers: new rarity tier names get invented most sets (a live sweep this
// session alone surfaced "Mega Hyper Rare", not something anyone would
// have hand-guessed in advance), so an allow-list of tiers actually
// CONFIRMED via live PPT queries this session is safer than trying to
// guess every "ordinary" tier that should be excluded. A newly-invented
// notable tier not yet in this list simply won't get the bonus — a
// known, stated limitation, not a silent wrong answer.
//
// WEIGHT: deliberately the smallest in SCORE (2) — below every other
// signal, including the softest existing one (set: 3) — so it can NEVER
// on its own outweigh a single real matched signal, let alone override
// an actual number/hp mismatch. It can only ever matter among
// candidates that already tie on every stronger signal. Verified against
// a live re-pull of the real test #53 Drayton candidate set (4
// candidates: Special Illustration Rare / Ultra Rare / Uncommon /
// Special Illustration Rare), with subtype scoring isolated as a
// control (patched so all 4 credit identically for "Supporter",
// removing an unrelated PPT data-completeness quirk on one row as a
// confound): rarity alone narrows bestScore/tieCount from 5/4 to 7/3 —
// the pattern matches 3 of the 4 (all but the Uncommon one). Confirms
// the design goal exactly: helps narrow this real tie, does NOT fully
// resolve it (the two Special Illustration Rare printings, from
// different sets, remain genuinely tied) — the underlying structural
// issue (Trainer cards have fewer independent tie-break signals than
// Pokémon cards) is still open, see ROADMAP.md.
const NOTABLE_RARITY_PATTERN = /double rare|hyper rare|illustration rare|secret rare|shiny holo rare|ultra rare|prism rare|radiant rare|rare break|mega attack rare/i;

// ADDED (2026-09-26, Victreebel — Pokemon Jungle attackName tie): the
// attackName comparison used to require exact string equality, which
// only ever worked when Gemini's read was already in English (matching
// PPT's own English-only `attacks` data — see extractFirstAttackName
// above). Now that a Japanese card also supplies `attackNameEnglish`
// (Gemini's own translation to the move's standard English name, not a
// literal transcription), exact equality is too strict a bar: official
// Pokémon TCG translations are sometimes rendered slightly differently
// across sources/printings ("Hydro Bombard" vs "Hydro-Bombard"), and a
// vision model's translation of Japanese move text won't always land on
// PPT's exact string even when it's substantively the same move. This
// normalizes punctuation/whitespace/"&" first, then falls back to an
// edit-distance similarity ratio so minor phrasing differences still
// count as a match while genuinely different attacks (low similarity)
// correctly don't.
function normalizeAttackNameForMatch(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ADDED (2026-10-15, Alakazam 33/165 Psymimic false positive): does a read
// attack name occur VERBATIM inside the candidate's own card text?
//
// The real case: the primary model read attackName "Psymimic" off an
// Expedition Alakazam. "Psymimic" is the card's Poké-POWER, not its attack
// — the attack is "Syncroblast" — so the ATTACK MISMATCH rule fired on the
// CORRECT card (83500), capped it to Low, and with it suppressed the
// alternate-printing banner that would have offered the Reverse Holofoil.
//
// IMPORTANT DATA LIMIT, verified against real PPT rows: PPT's schema has
// NO Poké-Power / Poké-Body / Ability field at all. The full field list for
// 83500 is name/cardNumber/rarity/cardType/hp/stage/attacks/weakness/
// resistance/retreatCost/artist/pokemonType/energyType/flavorText/prices/
// images — and the string "Psymimic" appears in NONE of them (checked a
// modern Alakazam V row too: same schema, no ability field). So this check
// CANNOT recover the Alakazam case on its own; the cross-model check below
// is what does that. This exists for the rows where PPT does carry power or
// ability text inside an attack entry's description, where a read of that
// name is a correct read of the card and must not be treated as disproof.
//
// Whole-token match on the normalized text, never a substring: "Psychic"
// must not match "Psychic Energy" inside a damage clause by accident, and
// a one-word power name must not match any longer word containing it.
function attackNameAppearsInCardText(readAttackName, cardText) {
  const needle = normalizeAttackNameForMatch(readAttackName);
  if (!needle) return false;
  const haystack = normalizeAttackNameForMatch(cardText);
  if (!haystack) return false;
  return new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(haystack);
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, row[j], row[j - 1]);
      prevDiag = temp;
    }
  }
  return row[n];
}

// Similarity ratio >= this counts as a match once normalized. Tuned
// against real PPT attack-name pairs (see docs/test-cases.md's matching
// entry for the full multi-card verification) — high enough that
// genuinely different attacks (e.g. "Lure" vs "Razor Leaf", similarity
// ~0.2) never cross it, low enough that realistic translation-phrasing
// variance ("Hydro Bombard" vs "Hydro-Bombard", "Poltergeist" vs
// "Poltergeist!") still does.
const ATTACK_NAME_FUZZY_THRESHOLD = 0.82;

function attackNamesFuzzyMatch(readAttackName, candidateAttackName) {
  const a = normalizeAttackNameForMatch(readAttackName);
  const b = normalizeAttackNameForMatch(candidateAttackName);
  if (!a || !b) return false;
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const similarity = 1 - levenshteinDistance(a, b) / maxLen;
  return similarity >= ATTACK_NAME_FUZZY_THRESHOLD;
}

function scoreCandidate(candidate, read) {
  let score = 0;
  const detail = {};

  if (read.cardNumber && candidate.number) {
    const { match, points, strength } = numbersMatch(read.cardNumber, candidate.number);
    score += points;
    detail.number = match;
    detail.numberStrength = strength;
  }

  // FIX (2026-08-27, live test — Brock's Onix): compared hp as exact
  // trimmed strings, so a read of "100 HP" never matched a candidate's
  // bare "100" — HP was silently contributing zero points whenever
  // Gemini included the "HP" suffix (which it does inconsistently).
  // Strip to digits-only on both sides, same approach as normalizeNumber.
  const readHpDigits = read.hp ? String(read.hp).match(/\d+/) : null;
  const candHpDigits = candidate.hp ? String(candidate.hp).match(/\d+/) : null;
  if (readHpDigits && candHpDigits && readHpDigits[0] === candHpDigits[0]) {
    score += SCORE.hp;
    detail.hp = true;
  }

  if (read.subtype && read.subtype !== "none" && Array.isArray(candidate.subtypes)) {
    const wanted = read.subtype.toLowerCase();
    if (candidate.subtypes.some((s) => String(s).toLowerCase().includes(wanted))) {
      score += SCORE.subtype;
      detail.subtype = true;
    }
  }

  if (read.setName && candidate.setName && String(candidate.setName).toLowerCase().includes(String(read.setName).toLowerCase())) {
    score += SCORE.set;
    detail.set = true;
  }

  // FIX (2026-09-26, Victreebel — Pokemon Jungle attackName tie): prefer
  // the translated attackNameEnglish when present (non-English cards),
  // falling back to attackName (already English on an English card, so
  // this is a no-op for the English path — attackNameEnglish is null
  // there per the prompt). Compared via attackNamesFuzzyMatch, not exact
  // equality — see the comment above that function for why.
  const attackNameForCompare = read.attackNameEnglish || read.attackName;
  if (attackNameForCompare && candidate.attackName && attackNamesFuzzyMatch(attackNameForCompare, candidate.attackName)) {
    score += SCORE.attackName;
    detail.attackName = true;
  }

  const candStamp = candidateStampType(candidate);
  if (read.stampType && read.stampType !== "none") {
    if (candStamp && candStamp === read.stampType) {
      score += SCORE.stampMatch;
      detail.stampMatch = true;
    } else if (candStamp && candStamp !== read.stampType) {
      score -= SCORE.stampMismatch;
      detail.stampMismatch = true;
    }
  } else if (read.stampType === "none" && candStamp) {
    score -= SCORE.stampMismatch;
    detail.stampMismatch = true;
  }

  // See the big comment above NOTABLE_RARITY_PATTERN for the full
  // rationale — a small, candidate-side-only tie-break prior, not a
  // read-comparison like every signal above. No `read.x` guard needed
  // since there is no corresponding Gemini-read field.
  if (candidate.rarity && NOTABLE_RARITY_PATTERN.test(candidate.rarity)) {
    score += SCORE.rarity;
    detail.rarity = true;
  }

  return { score, detail };
}

// FIX (2026-08-27, live test — Cramorant V / Shaymin V): PPT's data has
// two real quirks that were producing bad tie-breaks:
//   1. Literal duplicate rows for the SAME printing — e.g. real logs
//      showed both "Shaymin V - 013/172" and "Shaymin V" as separate
//      candidates, identical number/hp, just a name-suffix difference.
//      The old id (`name|number`) treated these as 2 distinct
//      candidates, triggering a false "ambiguous match" warning on a
//      clean, unambiguous scan.
//   2. Oddity product lines sharing a real card's number/stats — "Jumbo
//      Cards" (5x-oversized promotional reprints) and "Prize Pack Series
//      Cards" (a repackaging line) showed up as literal ties against the
//      standard printing for the exact same number. These are virtually
//      never what's actually being held up on a livestream, but with no
//      preference either way, the pick was arbitrary (whichever PPT
//      listed first) — which is how a normal card ended up shown as a
//      "Jumbo" oversized product.
// Fixed by (a) stripping the "- number" name suffix before computing the
// dedup key used for both tie-counting and picking, and (b) preferring a
// non-oddity candidate among whatever's left at the top score.
const ODDITY_PATTERN = /code card|jumbo|premium collection|prize pack|oversize|\btin\b/i;

function isOddityCandidate(candidate) {
  return ODDITY_PATTERN.test(candidate.setName || "") || ODDITY_PATTERN.test(candidate.name || "");
}

// FIX (2026-08-28, feature request — Shadowless dropdown option): the
// user asked for "Shadowless" (Base Set's early print run, no drop-shadow
// on the picture-frame border) to be selectable in the price dropdown.
// Explicitly NOT doing this via a new Gemini-detected visual signal — the
// user asked to avoid adding runtime/latency risk, so this is pure
// post-processing on data already fetched. Real logs confirmed
// PokemonPriceTracker doesn't model Shadowless as another key inside one
// card's `variants` object (the way "1st Edition"/"Unlimited" are) — it's
// a whole separate candidate row with its own setName ("Base Set
// (Shadowless)" vs plain "Base Set"), same number/hp/attack otherwise.
// These two helpers let the price-building step recognize that pairing
// so both sets of prices can be merged into one dropdown regardless of
// which one the scoring picked as "best" — see lookupCardPPT below.
function stripShadowlessSuffix(setName) {
  return String(setName || "").replace(/\s*\(shadowless\)\s*$/i, "").trim().toLowerCase();
}

function isShadowlessSetName(setName) {
  return /\(shadowless\)/i.test(String(setName || ""));
}

// FIX (2026-09-13, live scan — Clefairy Base Set vs. Base Set (Shadowless),
// both 005/102): this key used to be `name|number` only — no `setName` at
// all — so a plain "Base Set" candidate and its "Base Set (Shadowless)"
// sibling (same number/hp/attack, PPT models them as two entirely separate
// rows, see the Shadowless-dropdown FIX above) collapsed to the SAME dedup
// key and were counted as ONE distinct candidate in pickBestCandidate's
// tieCount, even when both genuinely tied at the top score. Confirmed via
// real logs (tieCount=1 on this exact scan) plus a live PPT query
// reproducing the same two rows: nothing in scoreCandidate can currently
// tell Shadowless apart from non-Shadowless (by design — see the
// Shadowless-dropdown FIX, which deliberately avoided adding a new
// Gemini-detected signal), so this is a genuine, unresolvable tie given
// today's signals — but the collapsed tieCount suppressed the ambiguous-
// match warning that should have disclosed exactly that, and `best` ended
// up being whichever of the two PPT's own API happened to list first
// (confirmed Shadowless-first for this card), producing a systematic bias
// rather than an honest coin-flip disclosure.
// Now includes the Shadowless-normalized set name so these two are counted
// as genuinely distinct. Deliberately safe against the ORIGINAL case this
// function was built for (2026-08-27, Shaymin V / Cramorant V literal
// duplicate rows — same setName, name differing only by a trailing
// "- number" suffix): those still share an identical setName, so adding it
// to the key changes nothing for that case — verified via a synthetic
// unit check mirroring that exact shape before deploying this fix.
function candidateDedupKey(candidate) {
  const baseName = String(candidate.name || "")
    .replace(/\s*-\s*\S+\/\S+\s*$/, "")
    .trim()
    .toLowerCase();
  const baseSetName = stripShadowlessSuffix(candidate.setName);
  const shadowless = isShadowlessSetName(candidate.setName) ? "shadowless" : "not-shadowless";
  return `${baseName}|${candidate.number}|${baseSetName}|${shadowless}`;
}

// ADDED (2026-10-15, Alakazam 33/165): the e-Card era (Expedition,
// Aquapolis, Skyridge) prints 32 cards of each set TWICE — once as a
// non-holo Rare and once as a Holo Rare — and TCGplayer/PPT disambiguate
// the two products purely by a numeric parenthetical on the name:
// "Alakazam (1)" (001/165, Holo Rare, $250.00) vs "Alakazam (33)"
// (033/165, Rare, $21.37). Measured across the three sets: 94 such
// holo/non-holo sibling groups (Expedition 32, Aquapolis 32, Skyridge 30),
// with an Expedition median price ratio of 5.9x, 23 of 38 priced pairs at
// 5x or worse, and a worst case of 15.2x (Vileplume).
//
// Within one group the two products are the SAME card design, so every
// scoring signal except the number is identical by construction — same
// HP, same attack list, same set, same name. Confirmed on the real pair:
// both carry hp "100" and the single attack "[2P] Syncroblast (80)". The
// card number is therefore the ONLY thing that can tell them apart, which
// makes a misread number maximally destructive here and makes "two models
// disagree about the number" exactly the case where we must not guess.
//
// Strips ONLY a purely numeric or H-numeric trailing parenthetical —
// "(33)", "(1)", "(H1)" — on top of candidateDedupKey's own
// " - 123/456" suffix strip. Deliberately NOT a general parenthetical
// strip: "(Full Art)", "(Secret)", "(Shadowless)" and "(Glossy Finish)"
// name genuinely different products, not print treatments of one card,
// and collapsing those would make this guard fire on unrelated pairs.
function candidateSiblingBaseName(candidate) {
  return String(candidate && candidate.name || "")
    .replace(/\s*-\s*\S+\/\S+\s*$/, "")
    .replace(/\s*\(\s*H?\d+\s*\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

// Two candidates are siblings when they share a base name and a set but
// are different products. Set comparison goes through
// normalizeSetNameForMatch (the same exact-equality normalizer the
// setName-rescue acceptance check uses) on the Shadowless-stripped set
// name — NOT the loosened substring test, which CLAUDE.md's DO-NOT list
// forbids widening for exactly this class of reason.
// ADDED (2026-10-15, test #102): does this read number positively identify
// that candidate? Deliberately stricter than `numbersMatch(...).match` alone,
// combining both existing primitives:
//   - a "weak" (asymmetric bare-promo) match is a coincidence by definition
//     and cannot corroborate anything;
//   - totalsContradict is checked explicitly so a disagreeing denominator can
//     never read as corroboration.
// Used only by the sibling-disagreement cap, which asks "do the two models'
// numbers point at the SAME member of this sibling group?"
// ADDED (2026-10-18): builds the two-row disclosure payload shared by BOTH
// ambiguity paths — the sibling-disagreement cap and the exact-number tie
// below. Factored out so the panel contract, the card-number ordering and
// the per-row graded pricing exist in exactly one place; the extension
// renders `siblingAmbiguity` and does not care which path produced it.
//
// Ordered by card number ascending — deterministic, and never price-ranked,
// so the panel cannot imply the expensive one is the likely answer.
async function buildAmbiguityDisclosure(group, read, requestId, { prompt, reason, label }) {
  const ordered = group.slice().sort((x, y) => {
    const nx = normalizeNumber(x.number);
    const ny = normalizeNumber(y.number);
    return (nx ? Number(nx.num) : 0) - (ny ? Number(ny.num) : 0);
  });
  const payload = {
    prompt,
    reason,
    candidates: ordered.map((c) => ({
      tcgPlayerId: c.tcgPlayerId || null,
      name: c.name,
      number: c.number,
      rarity: c.rarity || null,
      setName: c.setName || null,
      tcgplayerUrl: c.tcgPlayerUrl || null,
      // Ready-to-use for a POST /api/price call per candidate, so the panel
      // can show each one's real NM market and NM Suggested Bid from live
      // TCGplayer data. api/price.js is UNCHANGED — this is the same shape
      // it already takes.
      pricingLookup: {
        tcgPlayerId: c.tcgPlayerId || null,
        tag: null,
        siblingTcgPlayerId: null,
        siblingTag: null,
        siblingSetName: null,
        stampType: read.stampType,
        primaryPrinting: c.prices?.primaryPrinting ?? null,
        listingCount: c.prices?.listings ?? null,
      },
    })),
  };

  // Per-row graded pricing for a slab (see test #105). Applies to this path
  // too: a graded slab whose number ties across two products is exactly as
  // unpriceable as one whose siblings tie, and each row can still be priced
  // at the scanned grade on its own.
  if (normalizeGraderForCompare(read.grader) && normalizeGradeForCompare(read.grade)) {
    const targets = payload.candidates.slice(0, SIBLING_GRADED_MAX_LOOKUPS);
    const started = Date.now();
    const results = await Promise.all(
      targets.map(async (cand) => {
        const source = ordered.find((c) => String(c.tcgPlayerId) === String(cand.tcgPlayerId));
        if (!source) return null;
        try {
          return await lookupGradedPrice(read, source);
        } catch (e) {
          console.error(
            `[requestId=${requestId}]`,
            `[lookup] per-row graded lookup failed for tcgPlayerId=${cand.tcgPlayerId} (treating as unavailable):`,
            e && e.message
          );
          return null;
        }
      })
    );
    let priced = 0;
    let thin = 0;
    targets.forEach((cand, i) => {
      const gr = results[i];
      if (!gr || gr.error === "rate-limited") return;
      cand.graded = gr;
      if (gr.gradedPrice != null) priced += 1;
      else if (gr.gradedThin) thin += 1;
    });
    console.log(
      `[requestId=${requestId}]`,
      `[${label}] PER-SIBLING GRADED: ${read.grader} ${read.grade} over ${targets.length} row(s) ` +
        `-> ${priced} priced, ${thin} thin-gated, ${targets.length - priced - thin} no data; ` +
        `${Date.now() - started}ms, ~${targets.length * 2} credits`
    );
  }
  return payload;
}

function numberPointsAtCandidate(numberRaw, candidate) {
  if (!numberRaw || !candidate || !candidate.number) return false;
  const nm = numbersMatch(numberRaw, candidate.number);
  if (!nm.match || nm.strength === "weak") return false;
  return !totalsContradict(numberRaw, candidate.number);
}

function sameSiblingGroup(a, b) {
  if (!a || !b) return false;
  if (a.tcgPlayerId && b.tcgPlayerId && String(a.tcgPlayerId) === String(b.tcgPlayerId)) return false;
  const nameA = candidateSiblingBaseName(a);
  if (!nameA || nameA !== candidateSiblingBaseName(b)) return false;
  const setA = normalizeSetNameForMatch(stripShadowlessSuffix(a.setName));
  const setB = normalizeSetNameForMatch(stripShadowlessSuffix(b.setName));
  if (!setA || !setB) return false;
  return setA === setB;
}

function pickBestCandidate(candidates, read, logPrefix) {
  const scored = candidates.map((c) => {
    const { score, detail } = scoreCandidate(c, read);
    return { candidate: c, score, detail };
  });

  let bestScore = -1;
  for (const s of scored) {
    if (s.score > bestScore) bestScore = s.score;
  }

  const topScorers = scored.filter((s) => s.score === bestScore);
  const distinctIds = new Set(topScorers.map((s) => candidateDedupKey(s.candidate)));
  const tieCount = distinctIds.size;

  const nonOddityTop = topScorers.filter((s) => !isOddityCandidate(s.candidate));
  const pickPool = nonOddityTop.length ? nonOddityTop : topScorers;
  const best = pickPool.length ? pickPool[0].candidate : null;

  // ADDED (2026-10-02): log WHICH candidates are tied, not just how many.
  // Without this a tie cannot be reconstructed after the fact — proved on
  // 2026-10-01, when re-querying PPT failed to reproduce the original pool
  // and 0 of 14 real ties from a live session were recoverable. The ids
  // are already in hand here; this is pure logging, no behavior change.
  const tiedIdsForLog = topScorers.map((s) => s.candidate && s.candidate.tcgPlayerId).filter(Boolean);
  console.log(
    `${logPrefix} best=`,
    best ? { name: best.name, number: best.number, hp: best.hp, setName: best.setName } : null,
    "bestScore=",
    bestScore,
    "tieCount=",
    tieCount,
    "tiedIds=",
    tiedIdsForLog.join(","),
    "read=",
    { cardName: read.cardName, cardNumber: read.cardNumber, hp: read.hp, subtype: read.subtype, setName: read.setName, attackName: read.attackName, attackNameEnglish: read.attackNameEnglish }
  );

  if (!best || bestScore < MATCH_FLOOR) {
    return { best: null, bestScore, tieCount };
  }

  const bestDetail = pickPool.length ? pickPool[0].detail : null;
  // ADDED (2026-09-13, scoped Shadowless-tie message): the plain candidate
  // objects tied at bestScore, so a caller that already knows tieCount >= 2
  // can inspect WHICH candidates are actually tied (e.g. to tell a
  // Shadowless/non-Shadowless tie apart from any other kind of tie) without
  // re-running scoreCandidate over the whole pool a second time.
  const tiedCandidates = topScorers.map((s) => s.candidate);
  return { best, bestScore, tieCount, bestDetail, tiedCandidates };
}

function confidenceForScore(score) {
  if (score >= HIGH_THRESHOLD) return "High";
  if (score >= MEDIUM_THRESHOLD) return "Medium";
  return "Low";
}

// FIX (2026-09-26, Gemini read-consistency investigation): this used to
// always claim "...the card number is the only thing that tells them
// apart, and it wasn't legible this scan" — true when cardNumber came back
// null, but actively wrong when cardNumber WAS read and DID match best
// (the only way this generic branch is reached with a legible number is a
// genuine tie where two+ candidates share the identical number/HP/attack/
// type, e.g. a literal catalog duplicate that isn't the already-separately-
// handled Shadowless case). Callers pass whether the number was actually
// legible so the message matches what really happened.
// ADDED (2026-10-18, test #107): both ambiguousNoteText variants end with
// "This is our best guess only; verify the exact printing..." — accurate when
// the panel shows ONE candidate and its price, and wrong the moment a
// two-row disclosure replaces that single guess. A result with
// `pricingLookup: null` and a `siblingAmbiguity` payload is not a guess at
// all; it names every candidate and prices each one separately. Stripped at
// the single point where that decision is finalised, so it covers the
// score-path sibling cap and the exact-number tie path alike. The regex
// matches both variants ("exact printing" and "exact set/number").
function stripBestGuessClause(note) {
  if (!note) return note;
  return String(note)
    .replace(/\s*This is our best guess only;[^.]*\./g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ambiguousNoteText(numberWasLegible) {
  if (numberWasLegible) {
    return "Multiple different printings of this card share an identical card number, HP, attack, and type — there's nothing left in our data to tell them apart. This is our best guess only; verify the exact printing on the physical card before trusting this match or price.";
  }
  return "Multiple different printings of this card share identical HP, attack, and type — the card number is the only thing that tells them apart, and it wasn't legible this scan. This is our best guess only; verify the exact set/number on the physical card before trusting this match or price.";
}

// ADDED (2026-09-13, live scan — Clefairy Base Set vs. Base Set
// (Shadowless), see the candidateDedupKey FIX above): ambiguousNoteText()
// above says "...the card number is the only thing that tells them apart,
// and it wasn't legible this scan" — actively wrong for a Shadowless/
// non-Shadowless tie specifically, since the number IS legible and DID
// match both candidates exactly; what's unresolvable is the print-run
// distinction itself (Shadowless has no drop-shadow on the picture-frame
// border — a physical detail this tool deliberately doesn't try to detect,
// see the Shadowless-dropdown FIX). Scoped narrowly: only used when the tie
// is EXACTLY a 2-way Shadowless/non-Shadowless pair of the same underlying
// printing (same number, same set name once the suffix is stripped); every
// other kind of tie (3+ way, or a 2-way tie that isn't a Shadowless pair)
// keeps using the generic ambiguousNoteText() unchanged.
function shadowlessAmbiguousNoteText() {
  return "This printing exists in two different print runs — Shadowless and standard/Unlimited — that share an identical card number, HP, and attack, and there's no visual signal this tool checks for that tells them apart from a video frame (Shadowless is identified by the ABSENCE of a drop-shadow on the picture-frame border, a physical detail on the card itself). Both printings' prices are available in the dropdown below — pick whichever matches the physical card before trusting this price.";
}

function isShadowlessVsPlainTie(tiedCandidates) {
  if (!Array.isArray(tiedCandidates)) return false;
  const distinct = [];
  const seen = new Set();
  for (const c of tiedCandidates) {
    const key = candidateDedupKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(c);
    }
  }
  if (distinct.length !== 2) return false;
  const [a, b] = distinct;
  const baseSetName = stripShadowlessSuffix(a.setName);
  return !!baseSetName && isShadowlessSetName(a.setName) !== isShadowlessSetName(b.setName) && baseSetName === stripShadowlessSuffix(b.setName);
}

// ---------------------------------------------------------------------------
// Card lookup + pricing — PokemonPriceTracker, the ONLY data source.
// ---------------------------------------------------------------------------

const PPT_BASE_URL = process.env.PPT_BASE_URL || "https://www.pokemonpricetracker.com/api/v2/cards";

// FIX (2026-08-27, user correction — Baxcalibur/Raichu/Psyduck/Lapras):
// I had wrongly concluded this was a structural data gap ("PPT doesn't
// carry Japanese cards"). The user pointed out they specifically pay for
// PPT's Japanese card data — that sent me back to PPT's own API docs
// (pokemonpricetracker.com/docs), which document a `language` query param
// ("language=japanese" vs the default "language=english") that this
// function never set. Every "Japanese" scan was silently searching PPT's
// ENGLISH card database the whole time, which is why the correct
// Japanese printing was never in the returned candidate pool — not a
// data-source limitation at all, just a missing parameter. Now passes
// language=japanese whenever the Gemini read says language is Japanese.
//
// FIX (2026-08-27, live test — Palkia GX "couldn't reach our card
// database"): a burst of 4 rapid rescans in ~30s all failed with the
// generic "intermittently flaky" message. Real logs showed the ACTUAL
// cause: PPT returned a 429 ("Minute rate limit exceeded... required:10,
// available:8/9"), not a timeout or 5xx. Checked PPT's own docs (WebFetch,
// pokemonpricetracker.com/api-docs): PPT bills API credits roughly 1-per-
// card-returned, on TOP OF a per-minute call cap — and this function was
// requesting `limit=100` on every single search, so ordinary rapid
// rescanning during a live stream burns through the per-minute credit
// budget fast even though any real match has only ever needed a fraction
// of that (18 candidates was the largest raw pool seen in any log this
// entire session). Fixed by (a) dropping the default limit from 100 to
// 30 — plenty of headroom over anything actually seen, while cutting
// credit cost per call roughly 3x, and (b) detecting a 429 specifically
// and returning an honest, actionable message instead of the generic
// "flaky" one — the user deserves to know it's a real rate limit from
// scanning quickly, not a mystery outage, and roughly how long to wait.
// CORRECTED (2026-08-27, live test — Squirtle rescan, same card): the
// `cardNumber` param added earlier today for the Squirtle/limit=30 fix
// was WRONG — confirmed via a real 400 response from PPT itself on every
// single request that included it: `"Unsupported query parameter(s):
// cardNumber"`, with an `allowedParameters` list straight from PPT's own
// validator that does NOT include `cardNumber` or `number` at all:
// tcgPlayerId, cardId, setId, setName, set, search, rarity, cardType,
// artist, minPrice, maxPrice, sortBy, sortOrder, limit, offset,
// includeHistory, includeEbay, includeBoth. My earlier WebFetch summary
// of PPT's docs claiming a `cardNumber` filter existed was simply wrong
// (a doc-summarization error, not a real documented param) — this is a
// stronger, more direct signal than any docs page: PPT's own live API
// validator rejecting the exact param name. The fallback logic already
// in place caught this gracefully (every request fell through to the
// old plain-name search with no crash), but that meant the actual
// crowding-out bug from the original Squirtle report was NEVER fixed —
// it was just silently failing to apply, on every single request, while
// also adding one extra wasted round-trip of latency per scan for
// nothing. Removed entirely. Real fix is below: `offset`-based
// pagination (confirmed as a REAL accepted param via the same error
// message), tried only when the first page's best candidate doesn't
// clear the match floor — see the FIX comment in lookupCardPPT.
// FIX (2026-08-28, real-money price-accuracy report — Togepi, Undaunted
// 70/90 Reverse Holofoil): user found our "Lightly Played" estimate
// ($31.88, from the flat CONDITION_MULTIPLIERS.LP = 0.85 applied to the
// Near-Mint-only `marketPrice` PPT was returning) was ~3x TCGplayer's
// actual live LP market ($10.52) for that exact card/printing. Root cause
// confirmed empirically (not from PPT's docs, which have been wrong
// before — see the cardNumber FIX above): a live diagnostic added
// `includeHistory=true` to a real request and logged the raw response
// across several different live scans (Pokegear 3.0, Raticate BREAK,
// Zorua, Vileplume). Every one of them came back with genuine, DIFFERENT
// per-condition prices (e.g. Pokegear 3.0 Reverse Holofoil: NM $36.22, LP
// $27.59, MP $21.79, HP $20.41, DMG $12.50 — ratios nowhere close to our
// flat 85/70/55/40% multiplier table) instead of the single NM-only number
// we'd been extrapolating from this whole time. `includeHistory=true` was
// turned on here to feed buildPriceVariantsFromPPT/buildAggregatePricing
// below with that per-condition breakdown.
//
// REMOVED (2026-09-01, credit-cost research): buildPriceVariantsFromPPT/
// buildAggregatePricing (the only consumers of includeHistory's extra
// data) were themselves removed 2026-08-30 when pricing moved to live
// TCGplayer per-condition fetches (see the live-pricing section below) —
// `includeHistory=true` kept running on every call anyway, silently
// doubling PPT credit cost (confirmed live: PPT bills
// limit × (1 + includeHistory + includeEbay + ...), so limit=30 +
// includeHistory=true = 60 credits/call, not 30 — matches a real
// production 429 body verbatim: "Request requires 60 credits"). Verified
// live before removing: `prices.primaryPrinting` — the only field of
// `prices` still read anywhere downstream (pickDefaultVariantKey via
// `best.prices?.primaryPrinting`) — and the top-level `variants` field
// (source of `_rawVariants`, used only in diagnostic logging, never in
// scoring/pricing) are BYTE-IDENTICAL with and without includeHistory on
// a real request (Charizard, both returned primaryPrinting "Holofoil"
// and an identical variants object). includeHistory=true only adds
// `prices.variants`' per-condition breakdown, a new `prices.conditions`
// object, and a top-level `priceHistory` key — none referenced anywhere
// in this file (confirmed via grep). Halves the credit cost of every PPT
// call (60→30) and every fallback (page-2/combined-search each drop the
// same way) with no behavior change.
// FIX (2026-09-28, live test — Moo-Moo Milk, Neo Genesis 101/111): a
// real card's own printed name contains a hyphen, but PPT's `search`
// query param treats a literal hyphen very differently depending on
// what's on either side of it — confirmed live against the real API,
// not guessed. "Moo-Moo Milk" (exactly what read.cardName sends
// verbatim) returns 0 useful results (4 wrong, unhyphenated "Moomoo
// Milk" reprints only); "Moo Moo Milk" (hyphen replaced by a space)
// returns exactly the 2 real hyphenated "Moo-Moo Milk" printings,
// including the correct Neo Genesis 101/111 card that both the primary
// and legacy shadow models independently and repeatedly read off the
// physical card. Same failure confirmed for "Ho-Oh" (1 garbage result)
// vs. "Ho Oh" (53 correct results). Deliberately NOT the same fix as
// normalizeNameForMatch's full punctuation-to-space treatment — tested
// apostrophes ("Professor's Research") and periods ("Mr. Mime") live
// and both already return identical, correct result counts whether the
// punctuation is present or not, so broadening this beyond hyphens
// would be unjustified scope creep. Also confirmed hyphens aren't
// universally broken — "Porygon-Z", "Kommo-o", "Jangmo-o", "Hakamo-o"
// all return identical, correct results whether hyphenated or
// space-separated (a long token survives on at least one side of the
// hyphen in all of those; "Ho-Oh"/"Moo-Moo" are pathological because
// BOTH sides are short) — so replacing every hyphen with a space is safe
// across every real case tested, not just the ones that were broken.
// Scoped to the card NAME only (see call sites below) — never applied
// to a card NUMBER token, since some real promo-style numbers
// legitimately contain a hyphen as part of their format (e.g.
// "308/S-P", "051/PCG-P") and space-separating those was never tested
// or needed.
// ADDED 2026-10-02 (Southern Islands Mew, Options 1+2): set-name
// comparison used ONLY by the setName-scoped search rescue in
// lookupCardPPT. Folds case, punctuation and "&"/"and" so a read of
// "Diamond & Pearl" compares equal to PPT's "Diamond and Pearl" and
// "Southern Islands" survives whatever spacing a model emits.
//
// DELIBERATELY NOT wired into scoreCandidate's `set` signal. Per the
// Burger King Chimchar entry in CLAUDE.md, making that comparison
// succeed in isolation would hand the BASE card +3 while a promo
// reprint sharing the number gets nothing, collapsing an honest tie
// into a confident wrong answer. That change is blocked until the
// tie-surfacing work lands.
function normalizeSetNameForMatch(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeNameForSearchQuery(name) {
  return String(name || "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPokemonPriceTracker(name, { graded = false, language = "English", offset = null } = {}) {
  const params = new URLSearchParams({ search: name, limit: "30" });
  if (graded) params.set("includeEbay", "true");
  if (String(language).toLowerCase() === "japanese") params.set("language", "japanese");
  if (offset) params.set("offset", String(offset));
  const url = `${PPT_BASE_URL}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${process.env.POKEMONPRICETRACKER_API_KEY}` };

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    // FIX (2026-10-07, live Trainer-run investigation): a throw here is an
    // abort/network error, and it used to return null — which
    // lookupCardPPT turns into an EMPTY candidate pool and therefore a
    // silent notFound, indistinguishable from "this card isn't in the
    // catalog". That cost a real scan: Doctor 214/198 at 22:32:16, where
    // BOTH vision models agreed on the number and the card genuinely
    // exists (Doctor (Secret) 214/198, $8.67 — a price seen in this same
    // session's own logs), came back as nothing at all on the single log
    // line "PokemonPriceTracker request threw: This operation was
    // aborted".
    //
    // One retry, same shape and rationale as the retry already shipped on
    // fetchTCGPlayerPriceHistory (test #72): scoped strictly to this
    // abort/network-error branch. A 4xx, a 429 or a 5xx does NOT throw —
    // fetchWithTimeout resolves and those are handled on `!resp.ok`
    // below — so by construction this can never retry a rate limit or a
    // client error, only a genuine timeout/transport blip. The retry uses
    // the shorter CARDDB_RETRY_TIMEOUT_MS so a hung upstream cannot push
    // the request past the 1-3s scan target.
    console.error("[lookup] PokemonPriceTracker request threw:", e && e.message, "— retrying once");
    try {
      resp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
      console.log("[lookup] PokemonPriceTracker retry after abort SUCCEEDED for name=", name);
    } catch (eRetry) {
      console.error("[lookup] PokemonPriceTracker retry after abort also threw:", eRetry && eRetry.message, "name=", name);
      return null;
    }
  }

  if (!resp.ok) {
    if (resp.status === 404) {
      console.log("[lookup] PokemonPriceTracker returned 404 (no match) for name=", name);
      return { data: [] };
    }

    const body = await resp.text().catch(() => "");
    console.error(`[lookup] PokemonPriceTracker request FAILED — status=`, resp.status, "body=", body.slice(0, 300), "name=", name);

    if (resp.status === 429) {
      let retryAfter = 15;
      let isDailyLimit = false;
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.retryAfter) retryAfter = parsed.retryAfter;
        // FIX (2026-08-29, live — Sudowoodo/Charizard ex, daily quota
        // exhausted mid-stream): PPT returns a 429 for TWO genuinely
        // different reasons with different real-world fixes — a real
        // per-minute rate limit (error: "Minute rate limit exceeded", see
        // test #30 — resolves itself in ~15s) and running out of the
        // account's DAILY credit allowance entirely (error: "Daily credit
        // limit exceeded", confirmed via real logs: body included
        // "Insufficient API credits. Request requires 60 credits, you
        // have 14 daily + 0 purchased = 14 remaining" — retryAfter here
        // was ~1000-1090s, which is time until the daily reset, NOT a
        // per-minute cooldown). The user-facing message below used to
        // call both of these "our per-minute limit," which is actively
        // wrong and unactionable for the daily-quota case (waiting 15s
        // does nothing — the account is out of credits until the daily
        // reset, or until more are purchased). Detecting which one this
        // is from PPT's own `error` field so the message can tell the
        // user the real, correct fix.
        if (parsed && /daily/i.test(String(parsed.error || ""))) isDailyLimit = true;
      } catch (e3) {
        // ignore, use default
      }
      console.log(`[lookup] RATE LIMITED by PokemonPriceTracker: retryAfter=${retryAfter}s isDailyLimit=${isDailyLimit} name=`, name);
      return { error: "rate-limited", retryAfter, isDailyLimit };
    }

    if (resp.status >= 500) {
      try {
        const retryResp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
        if (retryResp.ok) return await retryResp.json();
      } catch (e2) {
        console.error("[lookup] PokemonPriceTracker retry threw:", e2 && e2.message, "name=", name);
      }
    }
    return null;
  }

  return await resp.json();
}

// FIX (2026-08-27, live test — Hitmontop): PPT never actually returns a
// plain `attackName` field on a card — it returns an `attacks` array of
// full move-text strings, e.g. "[F] Triple Kick (20x) Flip 3 coins...".
// Since normalizePptCard only ever checked `raw.attackName` (which never
// exists in PPT's real shape), `candidate.attackName` has been null on
// EVERY card since this rewrite — the attackName scoring signal (4 of the
// ~27 possible points) has been silently dead the whole time, which made
// weak matches (like this Hitmontop, which only had HP to go on) even
// weaker than they needed to be. Extract the first attack's name by
// stripping the leading "[cost]" bracket and everything from the first
// "(" or line break onward.
function extractFirstAttackName(attacks) {
  if (!Array.isArray(attacks) || !attacks.length) return null;
  const first = String(attacks[0] || "");
  // FIX (2026-09-26, found while testing the attackNameEnglish fuzzy-
  // match fix above): this regex only ever stripped ONE leading
  // "[cost]" bracket group, so a multi-energy-cost attack like
  // "[Fire][Colorless] Explosion Y" came out as "[Colorless] Explosion
  // Y" — a leftover bracket survived as part of candidate.attackName.
  // Checked against real PPT data across 6 species (180 candidates):
  // 71% of real extracted attack names had this residual bracket. Since
  // Gemini's own read.attackName/attackNameEnglish never includes cost
  // brackets (the prompt asks for "just the short name"), this silently
  // broke the attackName comparison for the large majority of real
  // multi-cost-attack cards — not just for the new Japanese-translation
  // path, but for English cards too, the whole time this signal has
  // existed. `(?:\[[^\]]*\]\s*)+` now consumes every leading bracket
  // group, however many there are, before capturing the actual name.
  const m = first.match(/^\s*(?:\[[^\]]*\]\s*)+([^(\r\n<]+)/);
  return m ? m[1].trim() : null;
}

// ADDED (2026-10-05, 30th Celebration Pikachu — see the ATTACK MISMATCH
// block in lookupCardPPT for the real-log case this exists for): the
// parsed name of EVERY attack on a candidate, not just the first.
// scoreCandidate's existing `attackName` signal only ever needed attack
// #1, but a mismatch rule needs all of them — a correct read of a card's
// SECOND attack ("Thunder Jolt" on Celebrations 005/025, whose
// extractFirstAttackName is "Gnaw") must not look like a mismatch.
// Deliberately implemented by calling extractFirstAttackName on a
// one-element array rather than refactoring a shared helper out of it:
// that function is on the live scoring path and is left byte-identical.
// FIX (2026-10-09, live Snorlax 33/95 — see docs/history.md): PPT stores
// attack text in a THIRD format that this parser mangled. Call of Legends
// Snorlax 33/95 (tcgPlayerId 89392) carries
//   "[3] Layabout - Remove all damage counters from Snorlax.  Snorlax can't..."
// i.e. the name and its description separated by a literal " - ", where the
// Nintendo Promos twins (213021/228494) use "\r\n<br>". The old regex cuts
// only at "(", CR, LF or "<", so for 89392 the ENTIRE SENTENCE became the
// "attack name", never fuzzy-matched the read "Layabout", and the 2026-10-05
// ATTACK MISMATCH rule fired on the CORRECT card — capping it to Low, adding
// a false warning, and (per the 2026-10-01 Corphish containment) suppressing
// the alternate-printing banner on a card that has a Reverse Holofoil
// printing. A false positive here is expensive in both directions.
//
// Two deliberate scoping decisions:
//   1. ONLY this function changes. `extractFirstAttackName` is what feeds
//      `candidate.attackName` and therefore scoreCandidate, so it is left
//      byte-identical — scoring, every tie-break and the whole historical
//      regression corpus are unaffected by construction. This function feeds
//      only `attackNames`, read by nothing but the attack-mismatch rule.
//   2. A FAIL-SAFE, because this parser can only ever be a heuristic over
//      somebody else's free-text field: if any name still looks like prose
//      after parsing (longer than ATTACK_NAME_MAX_LEN, or containing ". "),
//      return [] for the whole candidate so the rule SKIPS it entirely.
//      Silence is not evidence — the rule already requires a non-empty
//      attack list, so [] means "cannot judge", never "mismatch". That is
//      the safe direction: a missed warning costs a warning, a false warning
//      costs a correct card its confidence and its printing banner.
//
// An entry that does not match the regex at all (PPT's
// "<b>Tail Rap -- 20x</b>" shape, which has no leading [cost] bracket — 3 of
// 265 entries in the 2026-10-05 sample) now ALSO returns [] for the whole
// candidate rather than being quietly dropped. A PARTIALLY parsed attack list
// must never reach the mismatch rule: dropping the one entry we could not read
// and then declaring "the read attack is on none of the others" is exactly how
// a false positive gets manufactured, and the unreadable entry is the one most
// likely to have held the match. Bare numeric/whitespace junk (PPT sometimes
// carries a stray "2" or "4") is the one exception and is still skipped — it
// cannot be an attack name, so its absence tells us nothing.
// Note " -- " does not contain the " - " separator, so that format's name is
// unaffected by the separator cut either way.
const ATTACK_NAME_MAX_LEN = 40;
const ATTACK_ENTRY_BARE_JUNK = /^[\s\d.]*$/;

function extractAttackNames(attacks) {
  if (!Array.isArray(attacks) || !attacks.length) return [];
  const names = [];
  for (const a of attacks) {
    const entry = String(a == null ? "" : a);
    const m = entry.match(/^\s*(?:\[[^\]]*\]\s*)+([^(\r\n<]+)/);
    if (!m) {
      if (ATTACK_ENTRY_BARE_JUNK.test(entry)) continue;
      return [];
    }
    let name = m[1];
    const dashAt = name.indexOf(" - ");
    if (dashAt !== -1) name = name.slice(0, dashAt);
    name = name.trim();
    if (!name) continue;
    if (name.length > ATTACK_NAME_MAX_LEN || name.includes(". ")) return [];
    names.push(name);
  }
  return names;
}

function normalizePptCard(raw) {
  const nameSuffixMatch = String(raw.name || "").match(/-\s*(\d+\/\d+)\s*(?:\(.*\))?\s*$/);
  const number = raw.cardNumber || raw.number || (nameSuffixMatch ? nameSuffixMatch[1] : null);

  const subtypes = [];
  const n = String(raw.name || "");
  for (const tag of ["VMAX", "VSTAR", "GX", "EX", "ex", " V", "BREAK"]) {
    if (n.includes(tag)) subtypes.push(tag.trim());
  }
  // FIX (2026-08-30, live test — Drayton, test #53): the scan above only
  // ever looked for Pokémon power tags in the name, so the subtype
  // scoring signal was silently dead for every Trainer/Supporter/Item/
  // Stadium/Tool card — same dead-signal class as the attackName bug
  // above. PPT's raw payload carries the real subtype directly on
  // `pokemonType` as "Trainer - <subtype>" for non-Pokémon cards.
  const trainerSubtypeMatch = String(raw.pokemonType || "").match(/^Trainer\s*-\s*(.+)$/i);
  if (trainerSubtypeMatch) subtypes.push(trainerSubtypeMatch[1].trim());

  return {
    id: `${raw.name}|${number}`,
    name: raw.name,
    number,
    hp: raw.hp || null,
    subtypes,
    // ADDED (2026-08-31, test #53 Drayton tie-break): was fetched on
    // every lookup already but never copied onto the normalized
    // candidate — see NOTABLE_RARITY_PATTERN above scoreCandidate for
    // why this is now a scoring signal.
    rarity: raw.rarity || null,
    setName: raw.setName || null,
    attackName: raw.attackName || extractFirstAttackName(raw.attacks) || null,
    // ADDED (2026-10-05): the full attack list, carried alongside the
    // unchanged single-attack `attackName` above so nothing on the
    // existing scoring path shifts. `attacks` is PPT's raw text (kept
    // for diagnosis); `attackNames` is the parsed list the ATTACK
    // MISMATCH check in lookupCardPPT compares against. An empty array
    // means "no attack data" (Trainer, Energy, or an incomplete PPT
    // row) — the mismatch rule skips those entirely, since silence is
    // not evidence.
    attacks: Array.isArray(raw.attacks) ? raw.attacks : null,
    attackNames: extractAttackNames(raw.attacks),
    tcgPlayerUrl: raw.tcgPlayerUrl || null,
    // ADDED (2026-08-30, live TCGplayer pricing): PPT's own data already
    // carries the real TCGplayer product ID for every candidate (PPT is
    // itself built on top of TCGplayer's catalog) — this is what lets us
    // fetch real per-condition prices directly from TCGplayer once a card
    // is matched, instead of trusting PPT's own (sometimes incomplete)
    // per-condition data. See fetchTCGPlayerPriceHistory below.
    tcgPlayerId: raw.tcgPlayerId || null,
    cardImageUrl: raw.imageCdnUrl || raw.imageCdnUrl200 || raw.imageUrl || raw.image || raw.images?.large || raw.images?.small || null,
    prices: raw.prices || null,
    _rawVariants: raw.variants && typeof raw.variants === "object" ? raw.variants : null,
    _priceSource: "PokemonPriceTracker",
  };
}

// FIX (2026-08-28, feature request — Shadowless dropdown option): added
// an optional `tag` so the same PPT variant keys ("1st Edition Holofoil",
// "Unlimited Holofoil") can be relabeled when they're being merged in
// from a SIBLING candidate (e.g. the "Base Set (Shadowless)" entry's
// prices merged alongside plain "Base Set"'s) rather than the winning
// candidate's own data — see the merge step in lookupCardPPT. Untagged
// calls (tag omitted) behave exactly as before.
// Maps our internal tier codes to PPT's real (includeHistory=true)
// condition-name keys. See the FIX comment on fetchPokemonPriceTracker
// above for how this was confirmed against real live-scan data.
const CONDITION_NAME_TO_TIER = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  Damaged: "DMG",
};

// ---------------------------------------------------------------------------
// Live TCGplayer per-condition pricing (2026-08-30)
// ---------------------------------------------------------------------------
// REPLACED buildPriceVariantsFromPPT/buildAggregatePricing (the
// CONDITION_MULTIPLIERS-based functions that used to live here).
//
// User report that triggered this: Ditto (18/62, Fossil) showed LP $13.45
// (the old 85%-of-NM multiplier, since PPT's raw `variants` object for
// this exact printing was the old single-number shape with zero real
// per-condition breakdown) vs. the real live TCGplayer LP of $6.84 — a
// >2x miss. The user pointed out pallet.trade pulls real per-condition
// data straight from TCGplayer and asked us to do the same instead of
// trusting PPT's own (sometimes incomplete) per-condition coverage.
//
// Confirmed live (browser network inspection on a real tcgplayer.com
// product page — same technique originally used to reverse-engineer
// pallet.trade itself, see pallet-trade-reverse-engineering.md):
// TCGplayer's own storefront calls a public, UNAUTHENTICATED, CORS-open,
// cacheable JSON endpoint —
// `https://infinite-api.tcgplayer.com/price/history/{tcgPlayerId}/detailed?range=quarter`
// — returning REAL, transaction-based market prices broken out by every
// condition AND every printing (SKU-level), refreshed weekly from actual
// sales. Confirmed for this exact Ditto (tcgPlayerId 44426): Unlimited /
// Lightly Played showed $7.33 — real market noise away from the user's
// cited $6.84 — vs. our old multiplier's $13.45.
//
// PPT already gives us every candidate's real `tcgPlayerId` (PPT is
// itself built on TCGplayer's catalog), so PPT is untouched for the hard
// part — vision-matching/candidate scoring, validated across 40+ live
// test cases — only the PRICING step now calls TCGplayer directly.
//
// Per explicit user instruction (mid-testing-phase, 2026-08-30): if a
// genuine real-time number can't be pulled for a condition, THROW rather
// than substitute a guess. There is no synthetic fallback left anywhere
// in this file — a failure here surfaces as an explicit `pricingError` in
// the API response (see lookupCardPPT below), which the extension shows
// as a loud, visible warning instead of any price.
const TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS = 2500;

// FIX (2026-09-20): TCGplayer started 403-blocking this endpoint too — this
// project already hit the identical bot-block once on a different
// TCGplayer endpoint (mp-search-api's listings call, see the comment above
// TCGPLAYER_LISTINGS_TIMEOUT_MS's old removed usage in git history) and
// fixed it the same way. Confirmed live, 2026-09-20: a request with zero
// headers 403s 100% of the time (5/5 attempts); adding just this
// User-Agent succeeds 100% of the time (15/15 real failing productIds from
// the incident, incl. 114004/684415/477050/89964/699876/268712/96420/
// 450289/478098/509960/86067/284295/699871/534460/693513) — no Referer/
// Origin needed. Not rate-limit-shaped: it was a hard, consistent block
// with no headers, not intermittent.
const TCGPLAYER_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function fetchTCGPlayerPriceHistory(tcgPlayerId) {
  const url = `https://infinite-api.tcgplayer.com/price/history/${tcgPlayerId}/detailed?range=quarter`;
  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers: TCGPLAYER_FETCH_HEADERS }, TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS);
  } catch (e) {
    // FIX (2026-09-04, test #72, live Ferrothorn scan): a single retry
    // after a timeout/abort on this fetch specifically — live-confirmed via
    // test #72 that this endpoint normally responds in ~170ms against a
    // 2500ms budget, so a one-off abort here is far more often a transient
    // blip than genuinely missing data (a live curl for the exact
    // productId that failed returned real data in 173ms seconds later).
    // Deliberately scoped to only this abort/network-error case — an HTTP
    // error status, invalid JSON, or a genuine zero-SKU response below are
    // real answers from TCGplayer, not something a retry can fix.
    try {
      resp = await fetchWithTimeout(url, { headers: TCGPLAYER_FETCH_HEADERS }, TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS);
    } catch (e2) {
      throw new Error(`TCGplayer price-history request failed for productId=${tcgPlayerId} (after 1 retry): ${e2 && e2.message}`);
    }
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`TCGplayer price-history returned HTTP ${resp.status} for productId=${tcgPlayerId}: ${body.slice(0, 200)}`);
  }
  let json;
  try {
    json = await resp.json();
  } catch (e) {
    throw new Error(`TCGplayer price-history returned invalid JSON for productId=${tcgPlayerId}: ${e && e.message}`);
  }
  const result = Array.isArray(json && json.result) ? json.result : [];
  if (!result.length) {
    throw new Error(`TCGplayer price-history returned zero SKUs for productId=${tcgPlayerId}`);
  }
  console.log(`[tcgplayer-price] productId=${tcgPlayerId} skus=${result.length}`);
  return result;
}

// ---------------------------------------------------------------------------
// Break-even max bid (2026-09-17)
// ---------------------------------------------------------------------------
// Feature request: alongside each condition's live price, show the most
// Eric could pay for a card in that exact condition and still break even
// if it resells at that condition's own listed price — a zero-profit
// floor, not "safe to bid up to" (hence the UI's "BE:" label, not "Max:"
// — explicit per Eric's instruction, since "Max" risks being misread
// mid-auction as "bid up to this").
//
// CHANGED (2026-09-20): the assumed sale price is Eric's real listing
// price, not raw market price — he lists at a markup over live TCGplayer
// market price, so break-even/Suggested Bid were understating his real
// bid room by assuming he'd sell at market.
// This only affects the internal break-even math below — the displayed
// Market Price / per-condition prices (`conditions` in
// buildLivePriceVariantsFromTCGPlayer) are untouched, still raw market.
//
// Formula, all-in eBay + shipping costs:
//   Step 1 (markup):  marked price = market price * LISTING_MARKUP_MULTIPLIER
//   Step 2 (add):     marked price += LISTING_ADD_AMOUNT
//   Step 3 (tiers):   walk LISTING_PRICE_TIERS in order; if marked price
//                      falls in a tier's [min, max] range, first match
//                      wins and marked price is REPLACED by that tier's
//                      newPrice. No match -> marked price is unchanged
//                      (this is the whole pre-2026-09-26 behavior).
//   Assumed sale price = marked price after step 3
//   eBay fee = EBAY_FEE_RATE_ON_LIST_PRICE (~15.57%: a 12.35% Basic-Store
//              final value fee plus a 2.2% Promoted Listings ad rate, both
//              billed on the sale total including 7% sales tax) of the
//              assumed sale price, plus a fixed per-order fee ($0.30 if
//              assumed sale price <= $10, else $0.40)
//   Shipping = $0.955 (single-card eBay Standard Envelope, all-in) if
//              assumed sale price < $20, else $5.80 (Ground Advantage)
//   Max Bid  = Assumed Sale Price - eBay Fee - Shipping
//
// CHANGED (2026-09-29, two separate changes landing together):
//   (a) Listing template: "1.2x market" -> "market + $1.00" (steps 1-2
//       above) for all NEW listings. THIS IS A TEST running until roughly
//       mid-October 2026 — older listings stay on 1.2x for comparison, and
//       this tool tracks the NEW template because that's what Eric will
//       list cards bought today at. Reverting is exactly two constants:
//       LISTING_MARKUP_MULTIPLIER back to 1.2, LISTING_ADD_AMOUNT back to
//       0. Nothing in this function needs to change to switch back.
//   (b) Fee model: the flat 13.25% no-Store final value fee this used to
//       assume is replaced by Eric's real setup — see the
//       EBAY_FINAL_VALUE_FEE_RATE block near the top of this file for the
//       rates, the eBay help-page verification that both fees really are
//       billed on the tax-inclusive sale total, and why the 2.2% ad rate
//       is applied to every sale on purpose.
//
// Worked example, re-verified for the new formula: market price=$5.29 ->
// marked price = 5.29*1.0 + 1.00 = 6.29 (no tier match, both tiers are
// far from $6.29) -> fee = 0.155685*6.29 + 0.30 = 1.27924... -> shipping
// 0.955 -> maxBid = 6.29 - 1.27924 - 0.955 = 4.05576 -> rounds to $4.06.
// (Superseded the 1.2x-era $4.25 figure, which itself superseded the
// pre-markup $3.33 — see CLAUDE.md/test-cases.md for each.)
//
// ADDED (2026-09-26): the tier-override step mirrors Eric's real eBay
// repricer template, which pins the computed list price to a fixed
// value whenever it lands in one of two bands ($0-$2.48 -> $2.49,
// $20.00-$25.58 -> $19.99) rather than actually listing at the raw
// marked price. Before this, a market price whose marked price landed in
// the $20-$25.58 band had its break-even computed off a sale price up to
// ~$5 higher than what Eric will actually list at, overstating safe bid
// room in that band; the $0-$2.48 band is a smaller, opposite-direction
// miss. Under the "+ $1.00" template that upper band is reached by market
// $19.00-$24.58 (it was roughly $16.67-$21.32 under 1.2x). See
// docs/test-cases.md for the tier-boundary verification.
//
// Computed independently per condition (never once off NM and reused) —
// market price, and therefore the assumed sale price and both fees,
// differs by condition. Can go negative for a cheap enough condition
// price (fees + shipping exceed the assumed sale price itself) —
// returned as the real signed number, not clamped to $0, so the panel
// can show it honestly; see the wnpk-be-negative styling in content.css
// for how a negative value is made visually unambiguous as "not worth
// bidding on at any price in this condition," consistent with this
// project's standing "log real uncertainty/bad numbers, don't hide
// them" design principle.
function computeBreakEvenMaxBid(salePrice) {
  if (salePrice == null || !Number.isFinite(salePrice)) return null;
  let assumedSalePrice =
    salePrice * LISTING_MARKUP_MULTIPLIER + LISTING_ADD_AMOUNT;
  const tier = LISTING_PRICE_TIERS.find(
    (t) => assumedSalePrice >= t.min && assumedSalePrice <= t.max
  );
  if (tier) assumedSalePrice = tier.newPrice;
  const fixedFee = assumedSalePrice <= 10 ? 0.3 : 0.4;
  const ebayFee = EBAY_FEE_RATE_ON_LIST_PRICE * assumedSalePrice + fixedFee;
  const shipping = assumedSalePrice < 20 ? 0.955 : 5.8;
  return Math.round((assumedSalePrice - ebayFee - shipping) * 100) / 100;
}

// Groups TCGplayer's flat per-SKU result list into
// { <printingLabel>: { label, printEdition, basePrice, conditions: {NM,LP,MP,HP,DMG}, conditionsBreakEven: {NM,LP,MP,HP,DMG}, estimated, partial } }
// using each SKU's most recent weekly bucket as the live market price for
// that condition.
//
// CHANGED (2026-08-29, user report — Hitmontop/Cinccino/Snorlax Japanese
// promos all showing "NO LIVE PRICE" back-to-back): this used to require
// TCGplayer to have real data for ALL FIVE conditions before including a
// printing at all, on the theory that a partially-real row was a
// different flavor of the "fabricated number" problem. Real evidence
// proved that wrong — the user pulled up the live TCGplayer listing page
// for the Cinccino case and showed real, current NM (26 listings) and LP
// (3 listings) asking prices existing right now, for a card our
// price-history endpoint only had weekly sales-history data for on 1-3
// conditions. Requiring all 5 conditions to have sales-history data
// before showing ANY of them was throwing away real numbers we did have,
// not preventing fabrication — every number here is still either a real
// TCGplayer figure or a blank "—", never guessed. So: a printing is now
// included as long as it has real data for AT LEAST ONE condition;
// whichever tiers TCGplayer doesn't have sales data for are simply left
// out of `conditions` (the frontend already renders a missing tier as
// "—", same as before). `estimated` is always all-false since every
// value present is genuine live data — the field is kept for
// frontend/shape compatibility. `partial: true` is set whenever fewer
// than all 5 tiers have real data, so the UI can caption this
// distinctly from a printing with full coverage.
function buildLivePriceVariantsFromTCGPlayer(historyResult) {
  const byVariant = {};
  for (const sku of historyResult) {
    const tier = CONDITION_NAME_TO_TIER[sku.condition];
    if (!tier) continue;
    const latest = Array.isArray(sku.buckets) && sku.buckets.length ? sku.buckets[0] : null;
    const price = latest && latest.marketPrice != null ? Number(latest.marketPrice) : null;
    if (price == null || Number.isNaN(price)) continue;
    const label = String(sku.variant || "").trim();
    if (!label) continue;
    if (!byVariant[label]) byVariant[label] = {};
    // ADDED (2026-09-16, Months of Supply): this same TCGplayer response
    // already carries each SKU's own `totalQuantitySold` — its real
    // 3-month rolling sales count (this fetch already requests
    // range=quarter). Confirmed live against the actual product page's
    // "3 Month Snapshot -> Total Sold" figure for this exact card: it
    // matched exactly, for two different conditions, on the first try
    // (see docs/test-cases.md). No second call needed for this half of
    // the sell-through metric.
    const sold = Number(sku.totalQuantitySold);
    byVariant[label][tier] = {
      price: Math.round(price * 100) / 100,
      sold: Number.isFinite(sold) ? sold : null,
    };
  }

  const variants = {};
  for (const [label, byTier] of Object.entries(byVariant)) {
    const presentTiers = CONDITION_TIERS.filter((t) => byTier[t] != null);
    if (!presentTiers.length) continue;
    // Prefer NM as the headline "Market" price shown above the table
    // (matches how every other part of this tool has always defined
    // "market price"); if TCGplayer's data happens not to include NM for
    // this printing, fall back to whichever tier IS present, preferring
    // the best-condition one available.
    const basePriceTier = byTier.NM != null ? "NM" : presentTiers[0];
    const conditions = {};
    const conditionsBreakEven = {};
    for (const t of presentTiers) {
      conditions[t] = byTier[t].price;
      // ADDED (2026-09-17, break-even max bid): computed per-condition off
      // that condition's own price, not once off NM and reused — see
      // computeBreakEvenMaxBid's comment above for the formula and the
      // known-good hand-verified example.
      conditionsBreakEven[t] = computeBreakEvenMaxBid(byTier[t].price);
    }
    // FIX (2026-09-20, Shiny Lotad SH4 report): sell-through used to be fed
    // ONLY the base-price tier's totalQuantitySold (e.g. NM alone), throwing
    // away up to 4/5 of TCGplayer's own real sold-count data for this
    // printing. Sum across every present tier instead — a tier with a real
    // sold value of 0 counts as 0 (same as always), and a tier missing sold
    // data entirely also counts as 0 toward the sum, but ONLY once at least
    // one tier has real sold data; if every present tier's sold value is
    // null, the sum stays null so a genuine "no data anywhere" case still
    // reads as unknown, not as a confirmed zero.
    let totalSoldAllConditions = null;
    for (const t of presentTiers) {
      const tierSold = byTier[t].sold;
      if (tierSold == null) continue;
      totalSoldAllConditions = (totalSoldAllConditions || 0) + tierSold;
    }
    variants[label] = {
      label,
      printEdition: label,
      basePrice: byTier[basePriceTier].price,
      // ADDED (2026-09-16, sell-through signal); CHANGED (2026-09-20, see
      // FIX comment above): basePriceTier/basePriceTierSold are kept only
      // long enough for reference below; totalSoldAllConditions is what
      // buildLiveVariantsForCandidate now feeds into computeSellThrough.
      // All three are deleted before the variant object goes out in the
      // API response.
      basePriceTier,
      basePriceTierSold: byTier[basePriceTier].sold,
      totalSoldAllConditions,
      conditions,
      conditionsBreakEven,
      estimated: { NM: false, LP: false, MP: false, HP: false, DMG: false },
      partial: presentTiers.length < CONDITION_TIERS.length,
    };
  }
  return Object.keys(variants).length ? variants : null;
}

// ---------------------------------------------------------------------------
// Sales-velocity — sell-through signal (2026-09-16, tier basis CHANGED 2026-09-17)
// ---------------------------------------------------------------------------
// Feature request: alongside Market Price, show whether a card will
// actually sell in reasonable time, not just whether it's profitable.
//
// CHANGED (2026-09-17): originally this was "Months of Supply" =
// Current Quantity / (Total Sold / 3) — Current Quantity came from a
// second TCGplayer endpoint (see the removed fetchCurrentListingQuantity/
// mp-search-api code, in git history if ever needed again). Per explicit
// instruction, that was rebuilt on real-world grounds: the actual selling
// venue for these cards is eBay, not TCGplayer, so TCGplayer's own
// listing glut doesn't reflect real competition on eBay — Total Sold
// (demand) transfers across platforms reasonably, but TCGplayer's
// specific supply figure doesn't. The tier is now classified directly
// off raw monthly sales pace (Total Sold / 3) alone, with no supply term
// at all. This also removes an entire network round-trip (and failure
// point) from every scan, since Current Quantity is no longer needed for
// anything.
//
// "Total Sold" still needs NO new call — it's already sitting unused in
// the EXACT response fetchTCGPlayerPriceHistory already fetches above
// (`range=quarter` = the same 3-month window): each SKU carries its own
// real `totalQuantitySold`. Confirmed exactly matching the live product
// page's own "3 Month Snapshot -> Total Sold" figure for two different
// conditions (Near Mint: 8=8, Lightly Played: 10=10) — see the ORIGINAL
// 2026-09-16 investigation note that used to live here for the full
// trace.
//
// Boundaries per explicit spec, off monthly pace = Total Sold / 3:
//   Stagnant: under 5/month     Slow: 5-49/month
//   Normal:   50-599/month      Fast-flip: 600+/month
// Total Sold = 0 needs no special case — 0/3 = 0, which is under 5/month
// and lands in Stagnant automatically, same as every other value.
function classifySellThroughTier(monthlyPace) {
  if (monthlyPace >= 600) return "Fast-flip";
  if (monthlyPace >= 50) return "Normal";
  if (monthlyPace >= 5) return "Slow";
  return "Stagnant";
}

function computeSellThrough(totalSold) {
  if (totalSold == null) return null;
  const monthlyPace = totalSold / 3;
  return { monthlyPace, tier: classifySellThroughTier(monthlyPace), totalSold };
}

// ---------------------------------------------------------------------------
// Suggested max bid — liquidity-adjusted break-even (2026-09-17)
// ---------------------------------------------------------------------------
// Feature request: the raw break-even (computeBreakEvenMaxBid above) is a
// zero-profit floor — it says nothing about how long a card sits in
// inventory before it actually resells. Suggested Max Bid divides BE by
// (1 + required margin), where the required margin comes from the SAME
// per-variant Months-of-Supply liquidity tier already computed alongside
// Market Price (see computeSellThrough above) — the tier is a property of
// the printing, not the individual condition, so every condition tier on
// one variant shares the same required margin; only the BE (and therefore
// the sale price) each divides varies per condition.
//
// Required margin by tier, per explicit spec — no special-case blocking
// for Stagnant, it still produces a real (steeply discounted) number:
//   Fast-flip: 15%   Normal: 30%   Slow: 50%   Stagnant: 100%
//
// Hand-verified against the spec's own examples before wiring into the
// real per-condition loop below:
//   Slow:      21.19 / 1.50 = 14.126666.. -> $14.13 (spec's own example, match)
//   Stagnant:  21.19 / 2.00 = 10.595      -> $10.60 (spec's own example, match)
//   Fast-flip: 21.19 / 1.15 = 18.426086.. -> $18.43
//
// CHANGED (2026-09-30, Whatnot purchase costs): the margin-adjusted figure is
// no longer the suggested bid itself. Eric pays sales tax (and, in principle,
// shipping) ON TOP of his winning bid, so that figure is the target for TOTAL
// money out the door, and the bid is worked backwards from it:
//
//   suggested bid = (BE / (1 + margin) - WHATNOT_SHIPPING_PER_CARD)
//                   / (1 + WHATNOT_PURCHASE_TAX_RATE)
//
// rounded to cents once, at the end. This keeps the required margin applied
// to what Eric actually pays in total rather than to the bid alone — under
// the old formula, a 15%-margin bid of $X actually cost $X * 1.06625 once
// Whatnot's tax landed, quietly eating part of the intended margin.
// WHATNOT_SHIPPING_PER_CARD is 0.00 today (see its own comment near the fee
// constants for why, and for how to turn it on), so the tax division is the
// only term doing real work right now.
// computeBreakEvenMaxBid is deliberately NOT touched by this — break-even
// stays the eBay-side zero-profit figure, and the tooltip that shows it keeps
// showing exactly the same numbers as before.
//
// Worked examples, hand-verified against the real function (2026-09-30, with
// shipping at 0.00):
//   Fast-flip: 79.08 / 1.15 = 68.765217.. / 1.06625 = 64.49329.. -> $64.49
//   Stagnant:   3.81 / 2.00 =  1.905      / 1.06625 =  1.78665.. ->  $1.79
const REQUIRED_MARGIN_BY_TIER = {
  "Fast-flip": 0.15,
  Normal: 0.3,
  Slow: 0.5,
  Stagnant: 1.0,
};

function computeSuggestedBid(breakEven, tier) {
  if (breakEven == null || !Number.isFinite(breakEven)) return null;
  const margin = tier != null ? REQUIRED_MARGIN_BY_TIER[tier] : null;
  if (margin == null) return null;
  // Margin-adjusted target for TOTAL money out the door on Whatnot, then
  // worked backwards to the bid itself: subtract per-card Whatnot shipping
  // (a flat cost, not taxed with the item), then divide by (1 + tax rate)
  // so that bid + tax on that bid lands on the target. Rounded to cents
  // once, at the very end.
  const afterShipping =
    breakEven / (1 + margin) - WHATNOT_SHIPPING_PER_CARD;
  return (
    Math.round((afterShipping / (1 + WHATNOT_PURCHASE_TAX_RATE)) * 100) / 100
  );
}

// Fetches + builds live price variants for one candidate (identified by
// its own tcgPlayerId), optionally relabeling every variant key with a
// suffix tag (used for merging in a Shadowless sibling's prices — see the
// merge step in lookupCardPPT). Throws if the candidate has no
// tcgPlayerId or the TCGplayer fetch/build fails.
async function buildLiveVariantsForCandidate(candidate, tag) {
  if (!candidate || !candidate.tcgPlayerId) {
    throw new Error(`No TCGplayer product ID available for "${candidate && candidate.name}" — cannot fetch live pricing.`);
  }
  const history = await fetchTCGPlayerPriceHistory(candidate.tcgPlayerId);
  const variants = buildLivePriceVariantsFromTCGPlayer(history);
  if (!variants) {
    throw new Error(`TCGplayer has no live condition-price data at all for productId=${candidate.tcgPlayerId} (${candidate.name}).`);
  }

  // CHANGED (2026-09-17): used to be one Current-Quantity lookup per
  // variant/printing (a second TCGplayer network call, mp-search-api's
  // listings endpoint) run in parallel here. Per explicit instruction,
  // the tier no longer depends on TCGplayer's supply figure at all (see
  // the "Sales-velocity" comment block above computeSellThrough) — it's
  // computed directly from v.totalSoldAllConditions, already sitting on
  // the variant from buildLivePriceVariantsFromTCGPlayer above, with no
  // fetch, no await, and no failure mode of its own.
  for (const v of Object.values(variants)) {
    v.sellThrough = computeSellThrough(v.totalSoldAllConditions);
    // ADDED (2026-09-17, suggested max bid): per condition, divides THAT
    // condition's own conditionsBreakEven by the variant's single
    // liquidity tier (tier is per-variant, sale price/BE is per-condition
    // — same relationship conditionsBreakEven already has to conditions).
    // A missing tier (v.sellThrough null, i.e. no basePriceTierSold data
    // at all) makes computeSuggestedBid return null for every condition
    // here — the frontend is what turns that into an explicit
    // "(Bid: —)" rather than silently falling back to showing raw BE
    // under the same label.
    const suggestedBidTier = v.sellThrough ? v.sellThrough.tier : null;
    v.conditionsSuggestedBid = {};
    for (const t of Object.keys(v.conditionsBreakEven)) {
      v.conditionsSuggestedBid[t] = computeSuggestedBid(v.conditionsBreakEven[t], suggestedBidTier);
    }
    delete v.basePriceTier;
    delete v.basePriceTierSold;
    delete v.totalSoldAllConditions;
  }

  if (!tag) return variants;
  const tagged = {};
  for (const [k, v] of Object.entries(variants)) {
    const label = `${k} (${tag})`;
    tagged[label] = { ...v, label, printEdition: label };
  }
  return tagged;
}

// Picks which variant is pre-selected in the dropdown.
// FIX (2026-09-13, live scan — Clefairy Base Set (Shadowless)): added the
// `tag` param. `primaryPrinting` always comes straight from PPT untagged
// (e.g. "1st Edition Holofoil"), but by the time this function runs, the
// WINNING candidate's own live-variant keys have already been suffix-
// tagged by buildLiveVariantsForCandidate (e.g. "1st Edition Holofoil
// (Shadowless)") whenever a tag applies. Matching untagged primaryPrinting
// against those tagged keys always failed, so the match silently fell
// through to the generic preference list below — which, on this exact
// scan, matched the merged-in SIBLING's own untagged key ("Holofoil")
// instead. Net effect: the panel's header named the Shadowless printing,
// but the price pre-selected as default was actually the sibling's
// (opposite Shadowless status). Now tries the tagged form first.
function pickDefaultVariantKey(priceVariants, read, primaryPrinting, tag) {
  const keys = Object.keys(priceVariants);
  if (!keys.length) return null;

  // REVERTED (2026-08-27): a fix here on 2026-08-26 excluded "1st
  // Edition"-labeled variants whenever Gemini's stampType read was
  // "none", on the theory that Gemini's own visual read was more
  // trustworthy than PPT's `primaryPrinting` field. The very next live
  // test proved that theory backwards: the user physically confirmed a
  // card WAS 1st Edition (visible stamp) that Gemini had read as "none"
  // — a false negative on stamp detection, not the code being wrong.
  // `primaryPrinting` was correct on every card checked against a
  // physical original so far. Back to trusting it first — the dropdown's
  // "AI's best guess — switch if it looks wrong" caption plus the manual
  // selector remain the real safety net, since neither signal alone is
  // fully reliable.
  const lowerToActual = {};
  for (const k of keys) lowerToActual[k.toLowerCase()] = k;

  if (primaryPrinting) {
    if (tag) {
      const taggedKey = `${String(primaryPrinting).toLowerCase()} (${String(tag).toLowerCase()})`;
      if (lowerToActual[taggedKey]) return lowerToActual[taggedKey];
    }
    if (lowerToActual[String(primaryPrinting).toLowerCase()]) {
      return lowerToActual[String(primaryPrinting).toLowerCase()];
    }
  }

  const is1st = String(read.stampType || "").toLowerCase() === "1st edition";
  const preferenceOrder = is1st
    ? ["1st edition holofoil", "1st edition normal", "holofoil", "reverse holofoil", "normal", "unlimited holofoil", "unlimited"]
    : ["holofoil", "reverse holofoil", "normal", "unlimited holofoil", "unlimited", "1st edition holofoil", "1st edition normal"];
  for (const pref of preferenceOrder) {
    if (lowerToActual[pref]) return lowerToActual[pref];
  }
  return keys[0];
}

// REMOVED (2026-08-30): buildAggregatePricing used to live here — it was
// the CONDITION_MULTIPLIERS-based fallback for when a candidate had no
// per-printing `_rawVariants` at all, built off PPT's own aggregate
// `card.prices` field instead. There is no multiplier fallback left
// anywhere in this file (see the live-pricing section above); a card with
// no usable live TCGplayer data now surfaces a `pricingError` instead.

function stripSubtypeSuffix(name) {
  return String(name || "").replace(/\s+(VMAX|VSTAR|GX|EX|ex|V|BREAK)\s*$/i, "").trim();
}

// FIX (2026-08-28, live test — Nidoran♂, blorgotron stream): Gemini reads
// the gender symbol straight off the card ("Nidoran♂" / "Nidoran ♀"), but
// PokemonPriceTracker's own card names spell it out as a letter instead
// ("Nidoran M" / "Nidoran F" in the raw candidate data confirmed via
// logs). Our own client-side name filter did a strict, case-insensitive
// substring check (`candidateName.includes(wantedName)`) — "nidoran m"
// does NOT contain "nidoran♂", so EVERY real candidate (raw candidate
// count=30, genuine Nidoran cards in the sample) got thrown out by our
// own filter before scoring ever ran, on 4 separate repeat scans in a
// row. This has nothing to do with PPT's search itself (it already
// returns the right raw pool for "Nidoran♂" as the query) — it's purely
// our own post-filter being too literal about a symbol PPT doesn't use.
// Fixed by normalizing both sides of the comparison: spell out the
// gender symbols as letters and strip remaining punctuation before doing
// the substring check, so "Nidoran♂" and "Nidoran M" (and "Nidoran ♀" /
// "Nidoran F") line up correctly. This likely also protects other
// special-character names (e.g. "Mr. Mime", "Farfetch'd", "Type: Null")
// from the same class of bug going forward, though those haven't
// actually failed in a live scan yet.
function normalizeNameForMatch(name) {
  return String(name || "")
    // FIX (2026-08-28, live test — Pokémon Collector, blorgotron stream):
    // Gemini reads the accented card name straight off the card ("Pokémon
    // Collector"), but PokemonPriceTracker's own card names are spelled
    // without the accent ("Pokemon Collector" in the raw candidate data
    // confirmed via logs). Without stripping diacritics first, the "é"
    // survived toLowerCase() and then got replaced by the punctuation-strip
    // regex below with a bare space (since it's not a-z0-9), producing
    // "pok mon collector" — which is NOT a substring match against PPT's
    // "pokemon collector" (extra space breaks it) and vice versa. Every
    // single Pokémon Collector scan hit "zero candidates survived the name
    // filter" as a result, despite 11 real raw candidates coming back from
    // PPT. Normalizing to NFD form and stripping the combining diacritical
    // marks before lowercasing collapses "é" -> "e" so it matches PPT's
    // unaccented spelling. Same class of bug as the earlier Nidoran♂ fix
    // (Gemini's literal on-card read vs. PPT's plainer spelling).
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/♂/g, " m")
    .replace(/♀/g, " f")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function lookupCardPPT(read, requestId, legacyReadPromise = null) {
  const cacheKey = pptCacheKey(read);
  if (cacheKey && getCache) {
    try {
      const cached = await getCache({ namespace: PPT_CACHE_NAMESPACE }).get(cacheKey);
      // Only trust a cache entry that actually looks like a successful
      // lookupCardPPT() result — never `notFound`/`error` responses (see
      // the write side below for why those are never cached), and never
      // a malformed/unexpected shape (e.g. a stale entry from a schema
      // this function no longer produces).
      if (cached && cached.found && cached.pricingLookup) {
        console.log(`[requestId=${requestId}]`, "[lookup] PPT CACHE HIT — skipping PokemonPriceTracker entirely, key=", cacheKey);
        // stampType comes straight from THIS read (see the return
        // statement below — it was never derived from PPT/candidate
        // data), so it's refreshed from the current read rather than
        // trusted from the cached one, even on a hit.
        return { ...cached, pricingLookup: { ...cached.pricingLookup, stampType: read.stampType } };
      }
    } catch (e) {
      console.error("[lookup] PPT cache get failed (treating as a miss):", e && e.message);
    }
  }

  // See normalizeNameForSearchQuery above — every PPT search built from
  // the read's card name in this function uses this hyphen-normalized
  // form, never read.cardName directly. read.cardName itself is left
  // untouched for every other use below (matchName/wantedName, via
  // normalizeNameForMatch, already handles hyphens fine for local
  // filtering) — this only ever changes what gets sent to PPT's own
  // search endpoint.
  const searchCardName = normalizeNameForSearchQuery(read.cardName);

  let data = await fetchPokemonPriceTracker(searchCardName, { language: read.language });
  if (!data) return { error: "card-db-unavailable" };
  if (data.error === "rate-limited") return { error: "rate-limited", retryAfter: data.retryAfter, isDailyLimit: data.isDailyLimit };

  let rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  console.log(`[requestId=${requestId}]`, "[lookup] search=", searchCardName, "language=", read.language, "raw candidate count=", rawList.length, "sample=", JSON.stringify(rawList.slice(0, 3)).slice(0, 2500));

  let matchName = read.cardName;

  if (rawList.length === 0) {
    const stripped = stripSubtypeSuffix(read.cardName);
    if (stripped && stripped.toLowerCase() !== String(read.cardName || "").toLowerCase()) {
      console.log(`[requestId=${requestId}]`, "[lookup] zero raw results for full name, retrying search with base species name=", stripped);
      const retryData = await fetchPokemonPriceTracker(normalizeNameForSearchQuery(stripped), { language: read.language });
      if (retryData) {
        rawList = Array.isArray(retryData.data) ? retryData.data : Array.isArray(retryData) ? retryData : [];
        console.log(`[requestId=${requestId}]`, "[lookup] retry search=", stripped, "raw candidate count=", rawList.length);
        if (rawList.length > 0) matchName = stripped;
      }
    }
  }

  const wantedName = normalizeNameForMatch(matchName);
  let filtered = rawList.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));

  // FIX (2026-08-30, test #63 — "AZ's Comfort"/"AZ's Solace"): this branch
  // used to give up immediately and unconditionally the moment the name
  // filter passed zero candidates — even when Gemini had read a specific,
  // legible cardNumber on this or a prior attempt. Real logs showed an
  // untranslated Japanese Supporter card where Gemini invented 3 different
  // English names across repeat scans, none matching PPT's actual name
  // ("AZ's Tranquility") — a wrong/mistranslated cardName permanently
  // blocked the page-2/combined-search fallbacks further down, since both
  // are gated on `best` existing, which requires the name filter to have
  // passed at least one candidate first. This is a different failure point
  // than every crowding/coverage-gap case those fallbacks already handle
  // (tests #35/#37/#49/#60/#66) — this one fails BEFORE ever reaching them,
  // and no amount of pagination or query-widening helps when the name
  // itself is wrong.
  //
  // Rescue path: if a legible cardNumber was read, try ONE more search
  // combining name+number — the same query shape as the combined-search
  // fallback below, already proven to work against PPT's real API (tests
  // #49/#50) — then filter the results STRICTLY BY NUMBER, never by name.
  // This is deliberate: live testing (test #63) confirmed PPT's `search`
  // endpoint silently returns unrelated filler results instead of an empty
  // array for multi-word queries that match nothing, so a nonzero raw
  // candidate count here proves nothing on its own — only a candidate
  // whose own cardNumber field exactly matches the read number is ever
  // accepted. The (already-proven-wrong) name is never trusted again in
  // this branch. If no legible cardNumber exists, or the rescue search
  // still finds no exact number match, behavior is unchanged from before:
  // `{ notFound: true }`.
  let nameFilterRescuedByNumber = false;
  if (filtered.length === 0) {
    console.log(`[requestId=${requestId}]`, "[lookup] zero candidates survived the name filter for name=", read.cardName);

    if (read.cardNumber) {
      const rescueQuery = `${searchCardName} ${read.cardNumber}`;
      console.log(`[requestId=${requestId}]`, `[lookup] zero name-filter survivors but a legible cardNumber was read — trying number-scoped rescue search= "${rescueQuery}"`);
      const rescueResult = await fetchPokemonPriceTracker(rescueQuery, { language: read.language });
      if (rescueResult && rescueResult.error === "rate-limited") return { error: "rate-limited", retryAfter: rescueResult.retryAfter, isDailyLimit: rescueResult.isDailyLimit };
      const rescueList = rescueResult
        ? Array.isArray(rescueResult.data)
          ? rescueResult.data
          : Array.isArray(rescueResult)
          ? rescueResult
          : []
        : [];
      console.log(`[requestId=${requestId}]`, "[lookup] rescue search raw candidate count=", rescueList.length);
      const rescueFiltered = rescueList.filter((c) => numbersMatch(read.cardNumber, c.cardNumber).match);
      console.log(`[requestId=${requestId}]`, "[lookup] rescue search candidates with exact number match=", rescueFiltered.length);
      if (rescueFiltered.length > 0) {
        filtered = rescueFiltered;
        nameFilterRescuedByNumber = true;
      }
    }

    if (filtered.length === 0) {
      return { notFound: true };
    }
  }

  let candidates = filtered.map(normalizePptCard);
  console.log(`[requestId=${requestId}]`, "[lookup] scored candidates=", JSON.stringify(candidates.map((c) => ({ name: c.name, number: c.number, hp: c.hp, subtypes: c.subtypes, rarity: c.rarity, hasVariants: !!c._rawVariants }))).slice(0, 3000));

  let { best, bestScore, tieCount, bestDetail, tiedCandidates } = pickBestCandidate(candidates, read, `[lookup][requestId=${requestId}]`);

  // FIX (2026-08-27, live test — the SAME Squirtle rescanned again right
  // after the earlier "cardNumber" fix, which turned out to be a no-op —
  // see the correction on fetchPokemonPriceTracker above for why. The
  // real bug (a valuable card, SV2a "151" Squirtle AR 170/165, crowded
  // out of a `limit=30` raw pool by irrelevant same-species filler cards
  // like "Intro Pack (Squirtle)") was STILL happening on this rescan,
  // confirmed via logs: raw candidate count exactly 30, nothing scored
  // above the match floor. This is the real fix: when nothing on the
  // first page clears the match floor AND the page came back completely
  // full (rawList.length === 30, meaning PPT very likely has more
  // results beyond it), fetch ONE more page via `offset=30` — confirmed
  // as a genuinely accepted PPT param via its own 400 error response,
  // unlike the fabricated `cardNumber` one — merge it in, and re-score
  // once. This only costs an extra PPT call on the pathological "total
  // miss" cases that are already failing today, not on ordinary
  // successful lookups, so the rate-limit fix's credit savings stay
  // intact for the common case.
  //
  // WIDENED (2026-08-28, live test — Charizard V "017/172", Brilliant
  // Stars): the trigger above only covered the case where NOTHING cleared
  // the match floor (`!best`). Real logs from this scan showed a
  // different, more common shape of the same crowding-out bug: Gemini
  // read a specific, legible, perfectly real card number ("017/172" —
  // Brilliant Stars Charizard V), page 1 came back completely full
  // (raw candidate count=30), and the genuine 017/172 printing was never
  // in that page — but a WRONG candidate ("Charizard V - SWSH260") still
  // cleared the match floor on secondary signals (hp/subtype) alone, so
  // `best` was truthy and the page-2 fallback never fired at all. The
  // existing "NO NUMBER MATCH IN POOL" note further down correctly
  // detected and warned about this exact mismatch — but only after
  // already giving up and settling for the wrong card + its (wrong)
  // price, instead of trying page 2 first. Fixed by also triggering page
  // 2 whenever Gemini read a specific card number that matches NONE of
  // the page-1 candidates (regardless of whether some other candidate
  // cleared the floor via other signals) and page 1 came back full.
  const numberMissingFromPool =
    !!read.cardNumber && !candidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
  if ((!best || numberMissingFromPool) && rawList.length === 30) {
    console.log(
      `[requestId=${requestId}]`,
      !best
        ? "[lookup] no match above the floor and page 1 came back full — fetching page 2 via offset=30"
        : `[lookup] best=${best.name} cleared the floor on other signals but read number=${read.cardNumber} matches nothing on page 1, which came back full — fetching page 2 via offset=30`
    );
    const page2 = await fetchPokemonPriceTracker(searchCardName, { language: read.language, offset: 30 });
    if (page2 && page2.error === "rate-limited") return { error: "rate-limited", retryAfter: page2.retryAfter, isDailyLimit: page2.isDailyLimit };
    const page2List = page2 ? (Array.isArray(page2.data) ? page2.data : Array.isArray(page2) ? page2 : []) : [];
    console.log(`[requestId=${requestId}]`, "[lookup] page 2 raw candidate count=", page2List.length);
    if (page2List.length > 0) {
      const page2Filtered = page2List.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
      if (page2Filtered.length > 0) {
        filtered = filtered.concat(page2Filtered);
        candidates = filtered.map(normalizePptCard);
        console.log(`[requestId=${requestId}]`, "[lookup] re-scoring with page 1 + page 2 merged, total candidates=", candidates.length);
        ({ best, bestScore, tieCount, bestDetail, tiedCandidates } = pickBestCandidate(candidates, read, `[lookup:page1+2][requestId=${requestId}]`));
      }
    }
  }

  // FIX (2026-08-29, live test — Eevee SVP "173", test #49): even the
  // page-1+page-2 pagination above (60 total candidates) can still fail
  // to surface a specific printing for an extremely common species name
  // — "Eevee" alone has hundreds of real printings across 25+ years of
  // sets, so a specific newer/lower-profile promo number can get crowded
  // out of even a 60-result pool. Confirmed via PokemonPriceTracker's own
  // live API docs (read directly off the rendered docs page, not a
  // summarized/cached fetch — see the `cardNumber`-param lesson from an
  // earlier session on why that distinction matters) that `search` is a
  // genuine multi-word search across name, setName, cardNumber, rarity,
  // AND cardType simultaneously, and explicitly "Supports 'X/Y' card
  // number format" — documented example: `search=charizard base set
  // holo`. So when the read card number still isn't anywhere in the
  // page-1+2 pool, try ONE more search combining name + number in a
  // single query (e.g. "Eevee 173") — this lets PPT's own relevance
  // ranking surface the specific printing directly instead of depending
  // on getting lucky within a fixed page count. Purely additive: only
  // runs when the number is still missing after everything above has
  // already failed to find it, so it can only help cases that are
  // already broken today — it never changes behavior for a lookup that
  // already succeeds. Needs a live rescan of the same Eevee (or any other
  // card that hit this gap) to confirm it actually surfaces the real
  // printing before trusting this broadly.
  const stillMissingAfterPage2 =
    !!read.cardNumber && !candidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
  if (stillMissingAfterPage2) {
    // FIX (2026-09-27, Mewtwo/Nidoking Base Set 2): try the unpadded
    // number exactly as read first (unchanged from before), and ONLY if
    // that fails to surface an exact match, retry once with a
    // zero-padded variant (see buildZeroPaddedNumberVariant above). For
    // any card whose number doesn't parse a total, or whose numerator is
    // already the same/greater width than its total (every case that
    // already worked before this fix — modern sets, promo codes, and any
    // vintage set Gemini happens to read already-padded), the padded
    // variant is null or identical to the original and this loop runs
    // exactly once, exactly as before — purely additive.
    const paddedNumberVariant = buildZeroPaddedNumberVariant(read.cardNumber);
    // CHANGED 2026-10-18: also try the three-digit/three-digit form — see
    // buildWideZeroPaddedNumberVariant. Deduped against what is already in
    // the list, so a read whose two conventions coincide (e.g. Base Set
    // "10/130", where both produce "010/130") adds no extra request. This
    // list is only ever walked on the combined-search path, which by
    // construction runs only when the read number matched nothing in the
    // fetched pool, so ordinary scans are untouched.
    const wideNumberVariant = buildWideZeroPaddedNumberVariant(read.cardNumber);
    const numberVariantsToTry = [read.cardNumber];
    for (const variant of [paddedNumberVariant, wideNumberVariant]) {
      if (variant && !numberVariantsToTry.includes(variant)) numberVariantsToTry.push(variant);
    }
    for (const numberVariant of numberVariantsToTry) {
      const combinedQuery = `${searchCardName} ${numberVariant}`;
      console.log(`[requestId=${requestId}]`, `[lookup] number still missing after page1+2 — trying combined name+number search= "${combinedQuery}"`);
      const combinedResult = await fetchPokemonPriceTracker(combinedQuery, { language: read.language });
      if (combinedResult && combinedResult.error === "rate-limited") return { error: "rate-limited", retryAfter: combinedResult.retryAfter, isDailyLimit: combinedResult.isDailyLimit };
      const combinedList = combinedResult
        ? Array.isArray(combinedResult.data)
          ? combinedResult.data
          : Array.isArray(combinedResult)
          ? combinedResult
          : []
        : [];
      console.log(`[requestId=${requestId}]`, "[lookup] combined name+number search raw candidate count=", combinedList.length);
      if (combinedList.length > 0) {
        const combinedFiltered = combinedList.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
        if (combinedFiltered.length > 0) {
          const combinedCandidates = combinedFiltered.map(normalizePptCard);
          const foundExactNumber = combinedCandidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
          if (foundExactNumber) {
            filtered = filtered.concat(combinedFiltered);
            candidates = filtered.map(normalizePptCard);
            console.log(`[requestId=${requestId}]`, "[lookup] combined name+number search surfaced the missing number — re-scoring, total candidates=", candidates.length);
            ({ best, bestScore, tieCount, bestDetail, tiedCandidates } = pickBestCandidate(candidates, read, `[lookup:combined][requestId=${requestId}]`));
            break;
          } else {
            console.log(`[requestId=${requestId}]`, "[lookup] combined name+number search returned results but still no exact number match — keeping prior best");
          }
        }
      }
    }
  }

  // ADDED 2026-10-02 (Southern Islands Mew 01/18, $624 — see
  // docs/test-cases.md): OPTIONS 1 + 2. Ten consecutive scans failed on a
  // $624 card because its PPT record was NEVER RETRIEVED, not mis-scored.
  // Every search above is keyed on card NAME, and `search=Mew&limit=30` at
  // offsets 0/30/60 does not contain tcgPlayerId 46466 anywhere in the
  // first 90 results — the Mew catalog crowds it out. Page 2 and the
  // combined name+number fallback cannot reach it either (the models never
  // read the real number, 1/18), and the legacy number rescue only searches
  // the already-fetched pool rather than re-querying.
  //
  // But the answer was already in the data: the legacy shadow model read
  // `setName: "Southern Islands"` on several of those scans while the
  // primary read it as null every time, and `search="Mew Southern Islands"`
  // returns EXACTLY ONE result — the correct card. So:
  //   OPTION 2: take the set name from the primary read if present, else
  //     from the legacy shadow read (already in flight for the number
  //     rescue — no new model call, no new cost). It is a HINT, never a
  //     fact: it only chooses a query and must then survive the exact-match
  //     rules below.
  //   OPTION 1: one extra PPT search, `"<cardName> <setName>"`, accepted
  //     only under strict rules.
  //
  // Acceptance is deliberately strict because PPT returns unrelated FILLER
  // results (not an empty array) for multi-word queries that match nothing
  // — documented in test #63. A nonzero result count proves nothing. A
  // candidate qualifies only if ALL hold:
  //   - its name passes the same name filter used everywhere else;
  //   - its setName equals the read set name after normalization;
  //   - if a number was read AND parses, the candidate's number matches it.
  // EXACTLY ONE qualifier is accepted. Several or none -> do nothing at
  // all, existing behavior. Confidence is capped at Medium with an explicit
  // disclosure, same honesty bar as every other rescue path here.
  //
  // Scope guards, so this can never make an already-good answer worse:
  //   - never runs when the current best already has a confirmed exact
  //     number match (that path is strictly better evidence);
  //   - never runs when the read supplied no usable set name;
  //   - never replaces a High-confidence normal-path match, because it
  //     only runs when no number-confirmed best exists and it caps at
  //     Medium.
  //
  // NOTE on "&" vs "and": normalizeSetNameForMatch folds "&" to "and" so
  // "EX Team Magma vs Team Aqua" style names and "Diamond & Pearl" vs
  // "Diamond and Pearl" compare equal. This is used ONLY for the
  // acceptance check in this block. It deliberately does NOT touch
  // scoreCandidate's `set` signal — per the Burger King Chimchar entry in
  // CLAUDE.md, fixing that comparison in isolation would make the BASE
  // card win more firmly and bury a promo reprint further.
  let setNameSearchRescued = false;
  let setNameSearchHintSource = null;
  let setNameSearchHintValue = null;
  // True only when the rescue below accepted a candidate on
  // denominator-only equality, i.e. the numerator we read disagreed with
  // the printing we found. Drives the extra sentence in the disclosure
  // note so the user is told the number itself was probably misread,
  // rather than being shown a note that implies the number checked out.
  let setNameSearchNumeratorDisagreed = false;
  // ADDED 2026-10-07 — see the SUB-FLOOR LEGACY-MODEL NUMBER RESCUE block
  // below `if (!best)` for the full rationale. Declared here alongside the
  // other rescue flags because the two override blocks much further down
  // (the no-number-match floor and the null-cardNumber floor) both have to
  // be able to exempt this rescue, exactly as they already exempt
  // setNameSearchRescued.
  let subFloorLegacyRescued = false;
  let subFloorLegacyNumber = null;
  // WEAKNESS GATE (added 2026-10-02 after review): the first draft of this
  // block ran on any scan whose best match was not number-confirmed, which
  // silently included scans that had already resolved WELL on a null
  // cardNumber — the real Meditite 56/100 scan is exactly that shape
  // (cardNumber null, bestScore 10 = hp 6 + attackName 4, tieCount 1,
  // Match: High). Those scans would have paid an extra PPT call, an extra
  // ~30 credits, the latency of awaiting legacyReadPromise, and risked
  // having a perfectly good High match replaced by a Medium one. The
  // comment claimed "never replaces a High-confidence normal-path match";
  // the code did not enforce it. This does.
  //
  // Only genuinely weak results qualify: nothing matched at all, the score
  // did not reach HIGH_THRESHOLD, or the field is tied. Evaluated BEFORE
  // the legacyReadPromise await below, so a strong scan does zero extra
  // work and takes zero extra latency.
  //
  // `numberAlreadyConfirmed` is kept as a second guard because it states
  // the intent directly and costs nothing.
  //
  // CORRECTED 2026-10-03: this comment used to claim "any exact or weak
  // number match scores at least 14, which already clears HIGH_THRESHOLD",
  // which made the guard sound redundant with the score check. It is not,
  // and the arithmetic was wrong. An EXACT match scores SCORE.number = 20,
  // but a WEAK (asymmetric promo-vs-numbered-set) match scores
  // SCORE.number * 0.35 = 7 — the 0.7 multiplier that would have given 14
  // was removed in commit 42429a5 (test #67). 7 does NOT clear
  // HIGH_THRESHOLD (10), so on a weak match `resultIsWeak` is TRUE and
  // `numberAlreadyConfirmed` is the ONLY thing blocking this rescue —
  // because numbersMatch's asymmetric branch returns `match: true` for a
  // coincidental numerator. That is exactly how three real Southern
  // Islands Mew scans ("8/18" x2, "8/64") came back as a $37.25 WoTC Promo
  // instead of a $624.04 Southern Islands card.
  //
  // ADDED 2026-10-03 — the orphan bypass. When the read's own DENOMINATOR
  // appears nowhere in the fetched pool (see readTotalMissingFromPool
  // above), `numberAlreadyConfirmed` is not trustworthy: whatever it
  // matched can only have been a bare promo-style number sharing a
  // numerator by chance, since no candidate we retrieved even belongs to a
  // set of that size. In that one case the guard is bypassed.
  //
  // Scope, deliberately narrow:
  //   - `resultIsWeak` is STILL REQUIRED (this is inside that branch), so a
  //     High-scoring, untied match is never replaced, orphan total or not;
  //   - numbersMatch, scoreCandidate, resultIsWeak and
  //     numberAlreadyConfirmed are all left exactly as they were;
  //   - a read with no "/total" can never set this flag, so the bare-
  //     numerator population is untouched;
  //   - when the flag is false, every line below behaves byte-identically
  //     to before this change.
  const resultIsWeak = !best || bestScore < HIGH_THRESHOLD || tieCount >= 2;
  if (!setNameSearchRescued && resultIsWeak) {
    const numberAlreadyConfirmed = !!(read.cardNumber && best && numbersMatch(read.cardNumber, best.number).match);
    const readTotalOrphan = readTotalMissingFromPool(read.cardNumber, candidates);
    if (readTotalOrphan) {
      const orphanParsed = normalizeNumber(read.cardNumber);
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] READ TOTAL ORPHAN: read=${read.cardNumber}, no candidate in pool carries total ${orphanParsed.total}`
      );
    }
    if (!numberAlreadyConfirmed || readTotalOrphan) {
      let setNameHint = read.setName || null;
      setNameSearchHintSource = setNameHint ? "primary" : null;
      if (!setNameHint && legacyReadPromise) {
        // Capped race, not a bare await — see LEGACY_SETNAME_HINT_TIMEOUT_MS.
        // The .catch here is what keeps a rejected legacy read from becoming
        // an unhandled rejection; the real number-rescue path below has its
        // own try/catch and is unaffected by this derived promise. The timer
        // is cleared either way so a resolved race never holds the function
        // open waiting on it.
        let hintTimer = null;
        try {
          const timeoutPromise = new Promise((resolve) => {
            hintTimer = setTimeout(() => resolve({ __hintTimedOut: true }), LEGACY_SETNAME_HINT_TIMEOUT_MS);
          });
          const legacyRead = await Promise.race([legacyReadPromise.catch(() => null), timeoutPromise]);
          if (legacyRead && legacyRead.__hintTimedOut) {
            console.log(
              `[requestId=${requestId}]`,
              `[lookup] legacy setName hint not ready within ${LEGACY_SETNAME_HINT_TIMEOUT_MS}ms — continuing without it`
            );
          } else if (legacyRead && legacyRead.found && legacyRead.setName) {
            setNameHint = legacyRead.setName;
            setNameSearchHintSource = "legacy-shadow";
          }
        } catch (e) {
          console.error(`[requestId=${requestId}]`, "[lookup] legacy setName hint unavailable (treating as absent):", e && e.message);
        } finally {
          if (hintTimer) clearTimeout(hintTimer);
        }
      }

      if (setNameHint) {
        const setQuery = `${searchCardName} ${normalizeNameForSearchQuery(setNameHint)}`;
        console.log(
          `[requestId=${requestId}]`,
          `[lookup] no number-confirmed match — trying setName-scoped search= "${setQuery}" (setName hint from ${setNameSearchHintSource})`
        );
        const setResult = await fetchPokemonPriceTracker(setQuery, { language: read.language });
        if (setResult && setResult.error === "rate-limited") {
          return { error: "rate-limited", retryAfter: setResult.retryAfter, isDailyLimit: setResult.isDailyLimit };
        }
        const setList = setResult
          ? Array.isArray(setResult.data)
            ? setResult.data
            : Array.isArray(setResult)
            ? setResult
            : []
          : [];
        console.log(`[requestId=${requestId}]`, "[lookup] setName-scoped search raw candidate count=", setList.length);

        const wantedSet = normalizeSetNameForMatch(setNameHint);
        const readNumberParsed = read.cardNumber ? normalizeNumber(read.cardNumber) : null;
        const qualifiers = setList
          .filter((c) => normalizeNameForMatch(c.name).includes(wantedName))
          .filter((c) => normalizeSetNameForMatch(c.setName) === wantedSet)
          .filter((c) => {
            if (!readNumberParsed) return true;
            const nm = numbersMatch(read.cardNumber, c.cardNumber);
            if (!readTotalOrphan) return nm.match;
            // RELAXED ACCEPTANCE, orphan path only (added 2026-10-03).
            // Gated entirely on readTotalOrphan: when the flag is false
            // this line is unreachable and the filter is byte-identically
            // as strict as before. The orphan signal means the read's
            // denominator is absent from everything we retrieved, so the
            // NUMERATOR is the part we have reason to distrust (the models
            // read 7/18, 8/18, 8/64 and null on a card printed 01/18) while
            // the denominator is the part that identifies the set. So fall
            // back to denominator-only equality here.
            //
            // This is NOT a loosening of acceptance overall — the three
            // other guards are unchanged and each one is load-bearing:
            // the name filter, exact normalized set-name equality, and
            // EXACTLY ONE distinct qualifier. Verified against live PPT:
            // "Mew Southern Islands" -> 1 qualifier (the correct card),
            // but "Mew WoTC Promo" -> 4 and "Lapras SV2a: Pokemon Card
            // 151" -> 3, both of which therefore rescue nothing.
            //
            // NOTE, and this is load-bearing — found by regression case R3:
            // on the orphan path a WEAK numbersMatch is REJECTED, even
            // though the unchanged path accepts it. A weak match is a
            // coincidental numerator against a bare promo number, which is
            // precisely what the orphan signal tells us not to trust. Left
            // in, the hint "WoTC Promo" made bare candidate "8" the single
            // qualifier for read "8/18" and relabelled the same wrong
            // $37.25 card from `weak-number` to `setname-search`, dropping
            // its weak-number warning — a disclosure regression. So the
            // orphan path requires a NON-weak exact match, or denominators
            // that agree, and nothing else.
            if (nm.match && nm.strength !== "weak") return true;
            return numberTotalsMatch(read.cardNumber, c.cardNumber);
          });

        // ADDED 2026-10-09: same stamp-agreement narrowing as the two legacy
        // rescues — see filterCandidatesByStampAgreement above. Applied to
        // raw PPT rows here rather than normalizePptCard output, which is
        // equivalent: normalizePptCard passes `name`/`setName` through
        // untouched and those are the only fields candidateStampType reads.
        // Covers the READ TOTAL ORPHAN path too, since the orphan relaxation
        // lives inside the filter chain directly above.
        const stampFilteredQualifiers = filterCandidatesByStampAgreement(qualifiers, read);

        const distinctQualifiers = [];
        const seenQualifierKeys = new Set();
        for (const q of stampFilteredQualifiers) {
          const key = candidateDedupKey(normalizePptCard(q));
          if (seenQualifierKeys.has(key)) continue;
          seenQualifierKeys.add(key);
          distinctQualifiers.push(q);
        }

        if (distinctQualifiers.length === 1) {
          const accepted = normalizePptCard(distinctQualifiers[0]);
          setNameSearchNumeratorDisagreed = !!(
            read.cardNumber && !numbersMatch(read.cardNumber, accepted.number).match
          );
          console.log(
            `[requestId=${requestId}]`,
            `[lookup] SETNAME SEARCH RESCUE: accepted ${accepted.name} ${accepted.number} (${accepted.setName}, tcgPlayerId=${accepted.tcgPlayerId}) via setName hint "${setNameHint}" from ${setNameSearchHintSource}${
              setNameSearchNumeratorDisagreed ? ` — ACCEPTED ON SET SIZE ONLY, read number ${read.cardNumber} disagrees` : ""
            }`
          );
          best = accepted;
          setNameSearchHintValue = setNameHint;
          bestScore = Math.max(bestScore, MATCH_FLOOR);
          tieCount = 1;
          bestDetail = null;
          tiedCandidates = [accepted];
          setNameSearchRescued = true;
        } else {
          console.log(
            `[requestId=${requestId}]`,
            `[lookup] setName-scoped search did not resolve to exactly one qualifying candidate (${distinctQualifiers.length} qualified) — keeping prior behavior`
          );
        }
      }
    }
  }

  // FIX (2026-10-07, live full-art Trainer run — 51 of 73 real production
  // scans in a single 25-minute window came back notFound): the
  // LEGACY-MODEL NUMBER RESCUE further down exists precisely to recover a
  // misread card number using the legacy shadow model's independent read of
  // the same frame — but it is gated on `best` already existing, and sits
  // ~150 lines AFTER the `if (!best) return { notFound: true }` on the next
  // line, so it can never run on the scans that need it most.
  //
  // Why those scans have no `best` at all: on a Trainer/Supporter card `hp`
  // and `attackName` are null BY CARD TYPE, so once the number misreads the
  // only signal scoreCandidate can still award is `rarity` (2). 2 is below
  // MATCH_FLOOR (3), so pickBestCandidate returns best=null and we bail out
  // one line below. 37 of those 73 real scans scored EXACTLY 2. On a Pokémon
  // card the same misread still leaves hp (6) + attackName (4), which clears
  // the floor, which is why the existing rescue works there (Medicham) and
  // fired only 3 times across this whole Trainer-heavy session.
  //
  // Measured on the preserved logs from that session: 8 of the 51 failures
  // had the legacy model read a number that was ALREADY SITTING in the pool
  // this function had already fetched — recoverable at zero extra API cost
  // and thrown away (3x Shauna -> Shauna (Full Art) 263/264, Nessa ->
  // 183/185, Dancer -> 259/264, 2x Melony -> 195/198, Melony -> 218/198).
  // 2 of those 8 had read.cardNumber === null, so this deliberately does NOT
  // gate on read.cardNumber the way the downstream block does.
  //
  // Acceptance is deliberately STRICTER than the downstream rescue, because
  // this one fires with no scoring signal whatsoever behind it:
  //   - searches ONLY `candidates`, the pool already fetched above — no new
  //     PPT call, so this cannot cost a credit or trip the minute limit;
  //   - re-applies the SAME name filter expression used to build `filtered`
  //     above. This is NOT redundant, and the reachability argument is
  //     subtle enough to write down, because it looks redundant at first
  //     glance: page-1, the page-2 merge and the combined-search merge all
  //     name-filter their own rows, so normally every row in `candidates`
  //     has already passed. The exception is `nameFilterRescuedByNumber`,
  //     where `filtered` was replaced by rows matched on NUMBER ONLY and
  //     never name-checked. Those rows score >= 7 from the number signal,
  //     so you would think they can never reach this `!best` branch — but
  //     scoreCandidate SUBTRACTS SCORE.stampMismatch (8) when the read says
  //     stampType "none" and the candidate name carries a stamp keyword,
  //     which is the common case. A weak number match (7) minus 8 is -1,
  //     below MATCH_FLOOR, so `best` is null with a wrong-name row sitting
  //     in `candidates`. Verified by direct test: without this filter, a
  //     read of "Testmon"/"263" against a pool row
  //     "CompletelyDifferentCard - 263/264 (Staff)" is rescued and priced
  //     at Medium. With it, the scan correctly stays notFound;
  //   - requires a NON-weak exact numbersMatch. A "weak" match is the
  //     asymmetric bare-promo-numerator case, i.e. a coincidence, which is
  //     the one thing we must not trust when nothing else corroborates
  //     (same reasoning already written out on the orphan path above);
  //   - requires EXACTLY ONE distinct candidate (candidateDedupKey) to
  //     qualify — two or more and we genuinely cannot tell them apart, so
  //     nothing happens and the notFound below stands.
  // scoreCandidate, MATCH_FLOOR and HIGH_THRESHOLD are untouched; bestScore
  // is only floored to MATCH_FLOOR so downstream code sees a consistent
  // shape, exactly as the setName-search rescue already does.
  if (!best && !setNameSearchRescued && legacyReadPromise) {
    try {
      const legacyRead = await legacyReadPromise;
      if (legacyRead && legacyRead.found && legacyRead.cardNumber) {
        const qualifiers = candidates
          .filter((c) => normalizeNameForMatch(c.name).includes(wantedName))
          .filter((c) => {
            const nm = numbersMatch(legacyRead.cardNumber, c.number);
            return nm.match && nm.strength !== "weak";
          });
        // ADDED 2026-10-09: drop printings whose own stamp contradicts the
        // read before the exactly-one-distinct test. Without it the real
        // Snorlax 33/95 pool presents three distinct same-number, same-hp
        // printings, this rescue declines, and the correct Call of Legends
        // card is never found — safe, but a miss. See
        // filterCandidatesByStampAgreement above.
        const stampFilteredQualifiers = filterCandidatesByStampAgreement(qualifiers, read);
        const distinctQualifiers = [];
        const seenQualifierKeys = new Set();
        for (const q of stampFilteredQualifiers) {
          const key = candidateDedupKey(q);
          if (seenQualifierKeys.has(key)) continue;
          seenQualifierKeys.add(key);
          distinctQualifiers.push(q);
        }
        if (distinctQualifiers.length === 1) {
          best = distinctQualifiers[0];
          subFloorLegacyRescued = true;
          subFloorLegacyNumber = legacyRead.cardNumber;
          bestScore = Math.max(bestScore, MATCH_FLOOR);
          tieCount = 1;
          bestDetail = null;
          tiedCandidates = [best];
          console.log(
            `[requestId=${requestId}]`,
            `[lookup] SUB-FLOOR LEGACY-MODEL NUMBER RESCUE: primary read number=${read.cardNumber} produced no match above MATCH_FLOOR, but legacy shadow read number=${legacyRead.cardNumber} matched exactly one pool candidate: ${best.name} ${best.number} (tcgPlayerId=${best.tcgPlayerId})`
          );
        } else if (distinctQualifiers.length > 1) {
          console.log(
            `[requestId=${requestId}]`,
            `[lookup] sub-floor legacy number rescue declined: legacy read number=${legacyRead.cardNumber} matched ${distinctQualifiers.length} distinct candidates — cannot tell them apart, keeping notFound`
          );
        }
      }
    } catch (e) {
      console.error(`[requestId=${requestId}]`, "[lookup] sub-floor legacy-model rescue check failed (treating as unavailable):", e && e.message);
    }
  }

  if (!best) return { notFound: true };

  // FIX (2026-09-26, Gemini read-consistency investigation — null
  // cardNumber driving wide ties on popular multi-printing species, e.g.
  // Mew EX/151 ex prints): when cardNumber comes back null, SCORE.number
  // (20, the single largest weight — more than 3x the next-highest signal)
  // contributes nothing, and none of the number-based rescue logic above
  // (page-2 pagination, combined name+number search) can run either, since
  // it's all gated on read.cardNumber being truthy. For a species with many
  // printings, that alone is enough to leave a wide field tied. When Gemini
  // did manage to read a setName even without a number, use it as an
  // explicit narrowing filter over the tied candidates — not just its
  // existing +3 score contribution in scoreCandidate, which can get diluted
  // across multiple tied candidates that each pick up +3 or none uniformly.
  // Deliberately tight scope: only fires when cardNumber is null (so this
  // can never override a real number mismatch — the NO NUMBER MATCH IN POOL
  // check below still owns that case), there IS a tie, and narrowing by
  // setName leaves at least one but strictly fewer candidates than before.
  // A zero-match narrow means Gemini's setName read doesn't string-match
  // anything in the tied set — not trustworthy enough to act on, so the
  // original tie is left alone rather than forcing a pick off that.
  let nullNumberTieNarrowedToOne = false;
  if (!read.cardNumber && tieCount >= 2 && read.setName && Array.isArray(tiedCandidates)) {
    const wantedSet = String(read.setName).toLowerCase();
    const setNarrowed = tiedCandidates.filter((c) => c.setName && String(c.setName).toLowerCase().includes(wantedSet));
    const distinctNarrowed = [];
    const seenNarrowed = new Set();
    for (const c of setNarrowed) {
      const key = candidateDedupKey(c);
      if (!seenNarrowed.has(key)) {
        seenNarrowed.add(key);
        distinctNarrowed.push(c);
      }
    }
    if (distinctNarrowed.length > 0 && distinctNarrowed.length < tieCount) {
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] NULL-NUMBER TIE NARROWED BY SET NAME: read setName="${read.setName}" narrowed ${tieCount} tied candidates down to ${distinctNarrowed.length}`
      );
      best = distinctNarrowed[0];
      tieCount = distinctNarrowed.length;
      tiedCandidates = distinctNarrowed;
      nullNumberTieNarrowedToOne = tieCount === 1;
    }
  }

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  // ADDED 2026-10-02 (queued item b): a machine-readable companion to
  // `ambiguousNote`. The note's English text is the only signal clients
  // have today, which makes anything downstream that needs to tell these
  // paths apart brittle — notably the extension's alternate-printing
  // banner gate, which currently has to treat every Medium alike even
  // though some Mediums are identity-confirmed and others are genuine
  // product uncertainty. Set alongside each path below; returned in the
  // response. No frontend change ships with this.
  let matchBasis = "score-only";

  // ADDED (2026-10-05): orthogonal to matchBasis — matchBasis says HOW
  // this candidate was chosen, this says a positive signal CONTRADICTS
  // it. Set only by the ATTACK MISMATCH block near the end of this
  // function; never overwrites matchBasis.
  let attackMismatch = false;

  // Companion to the narrowing rescue above: when it fully resolved the tie
  // to a single candidate, the generic `tieCount >= 2` disclosure below
  // never fires (tieCount is now 1) — but the number is still genuinely
  // unverified (this pick came from a setName string-match, not an exact
  // card number), so High confidence would overstate it. Disclose plainly,
  // same honesty bar as every other rescue path in this function.
  if (nullNumberTieNarrowedToOne) {
    matchConfidence = matchConfidence === "High" ? "Medium" : matchConfidence;
    matchBasis = "setname-narrowed";
    ambiguousNote =
      `The card number wasn't legible this scan, so this match was narrowed down using the set name that was read ("${read.setName}") instead of the number — it's our best guess based on set alone, not confirmed by card number. Verify the exact printing before trusting this match or price.`;
    console.log(`[requestId=${requestId}]`, `[lookup] NULL-NUMBER TIE RESOLVED VIA SET NAME: setName="${read.setName}" picked best=${best.name} ${best.number}`);
  }

  // FIX (2026-08-27, live test — Baxcalibur, Japanese SV2P): the generic
  // tie-break note below ("...the card number is the only thing that
  // tells them apart, and it wasn't legible this scan") used to fire
  // FIRST whenever candidates tied, even when the real, more useful
  // explanation was available: Gemini read a perfectly specific, legible
  // number ("077/071", set "SV2P", language Japanese) that simply doesn't
  // exist ANYWHERE in the 9 candidates PPT returned for "Baxcalibur" — all
  // 9 were English-market printings (SV02: Paldea Evolved, Paldean Fates,
  // etc), none Japanese. The generic note was actively misleading here
  // (falsely implying the number "wasn't legible" when it was read fine
  // and just isn't in our database), and it masked the real, more
  // actionable explanation: this is very likely a Japanese-printing data
  // gap in PokemonPriceTracker, and the price/image shown is for an
  // unrelated ENGLISH printing, not a mere "which similar card is it"
  // ambiguity. Check for "read a specific number that matches nothing in
  // the pool at all" FIRST, since when it applies it's a strictly more
  // accurate diagnosis than a generic tie-break note.
  // FIX (2026-09-26, Medicham misidentification investigation — see
  // CLAUDE.md's "print variant misdetection" entry): a real live scan
  // showed the primary model (gemini-3.5-flash-lite) confidently misread a
  // card's number TWICE in a row ("241/203", then "247/203"), both times
  // anchoring toward "203" — a denominator shared by three unrelated
  // candidates already sitting in this same pool — while the
  // `[legacy-model-shadow-test]` call (gemini-3.6-flash, same two frames)
  // correctly read "241/217" both times. Since the primary's number
  // matched nothing, the code below used to fall straight through to a
  // weak-signal-only match (HP=120 alone, score 6) that beat the real
  // candidate (score 2, rarity only — its own PPT record has null
  // hp/attacks) purely by coincidence, and showed a $0.06 price for what
  // was really a $3.15 card. This fires often, not rarely — 14 real "NO
  // NUMBER MATCH IN POOL" cases turned up in one hour of live scanning.
  //
  // Two-part fix, tried in order:
  //   1. RESCUE: before giving up on the number, check whether the legacy
  //      shadow-test model's cardNumber read (already in flight for
  //      logging via `legacyReadPromise` — never a second API call, see
  //      handler() above) matches a real candidate in this same pool. If
  //      it does, prefer that candidate. This is a genuine cross-model
  //      agreement signal, not a confirmed primary read, so it's capped at
  //      Medium confidence — same bar as the setName-narrowing rescue
  //      above — never High.
  //   2. WEAK-SIGNAL FLOOR: if neither the primary number nor the legacy
  //      rescue can pin a real candidate down, count how many INDEPENDENT
  //      signals beyond number actually corroborate `best`
  //      (hp/subtype/set/attackName/stampMatch, from `bestDetail` —
  //      deliberately NOT rarity, a candidate-only prior true of almost
  //      any valuable candidate regardless of correctness; see the note
  //      at the actual check below for the real case that caught this).
  //      A single weak signal (e.g. HP alone — many unrelated cards share
  //      an HP value, this is exactly the Medicham case) is coincidence-
  //      prone enough that showing that candidate's specific price reads
  //      as a confirmed match rather than a guess. Two or more independent
  //      signals is treated as enough real corroboration to still show a
  //      specific (Low-confidence, disclosed) match, same as before this
  //      fix. The "2+ signals" line is a judgment call, not a hard rule
  //      derived from anything — tune it here if real scans show it's too
  //      strict (good matches needlessly withheld) or too loose (bad
  //      matches still getting through).
  // EXCLUSION ADDED 2026-10-03 (`!setNameSearchRescued`): same rationale as
  // the null-cardNumber exemption in the `else if` further down, and found
  // by regression case C2. A setName-search rescue that was accepted on
  // denominator-only equality will BY CONSTRUCTION fail
  // `numberMatchedForBest` — the numerator is the part we already concluded
  // was misread. Without this guard the block below immediately overrode a
  // correct rescue (real Mew read "7/18" resolved to 46466 and was then
  // withheld again by the insufficient-corroboration floor). Once the
  // rescue has replaced `best` with a candidate located by exact set-name
  // equality, number comparisons against the read describe a different card
  // and carrying them forward is meaningless — the same reasoning already
  // written out at the `matchBasis = "setname-search"` assignment below.
  // When the rescue's number DID match, `numberMatchedForBest` is true and
  // this block was already a no-op, so this guard only ever affects the
  // numerator-disagreed case.
  if (read.cardNumber && best.number && !setNameSearchRescued && !subFloorLegacyRescued) {
    const { match: numberMatchedForBest } = numbersMatch(read.cardNumber, best.number);
    if (!numberMatchedForBest) {
      const anyNumberMatch = candidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
      if (!anyNumberMatch) {
        let legacyRescued = false;
        if (legacyReadPromise) {
          try {
            // CHANGED (2026-10-15): was a bare `await legacyReadPromise`,
            // bounded only by GEMINI_TIMEOUT_MS. See
            // LEGACY_NUMBER_RESCUE_TIMEOUT_MS and awaitLegacyReadCapped —
            // this await is the one that logged the only runtime error in
            // the 2026-10-14 deploy window. A null result here lands on the
            // same corroboration floor as "no legacy read at all", which is
            // exactly what an aborted read already did.
            const legacyRead = await awaitLegacyReadCapped(legacyReadPromise, requestId, "the downstream number rescue");
            if (legacyRead && legacyRead.found && legacyRead.cardNumber) {
              // FIX (2026-10-09, live Snorlax 33/95): this was a bare
              // candidates.find(...) — the FIRST number match in PPT's own
              // array order, with no uniqueness check and no stamp check.
              // See filterCandidatesByStampAgreement above for the real case
              // and the $499.99-vs-$30.23 cost of getting it wrong. It now
              // mirrors the sub-floor rescue's own discipline: name filter,
              // stamp agreement, then EXACTLY ONE distinct printing or no
              // rescue at all (falling through to the existing
              // corroboration-floor / withhold behavior below).
              //
              // The name re-filter is defense-in-depth and provably a no-op
              // today: the only way `candidates` is not already name-filtered
              // is nameFilterRescuedByNumber, and that path replaces
              // `filtered` with rows that every one matched read.cardNumber
              // exactly — which makes the enclosing `!anyNumberMatch` guard
              // false, so this block is unreachable. Kept explicit so a
              // future change to that guard cannot silently reintroduce a
              // rescue over never-name-checked rows, exactly the reasoning
              // already written out on the sub-floor rescue's name filter.
              const legacyNumberMatches = candidates
                .filter((c) => normalizeNameForMatch(c.name).includes(wantedName))
                .filter((c) => numbersMatch(legacyRead.cardNumber, c.number).match);
              const legacyDistinct = distinctByDedupKey(
                filterCandidatesByStampAgreement(legacyNumberMatches, read)
              );
              // `let`, not `const` (2026-10-15): the two guards below can
              // veto a candidate that passed every filter above.
              let legacyMatch = legacyDistinct.length === 1 ? legacyDistinct[0] : null;
              if (!legacyMatch && legacyDistinct.length > 1) {
                console.log(
                  `[requestId=${requestId}]`,
                  `[lookup] LEGACY-MODEL NUMBER RESCUE DECLINED: legacy read number=${legacyRead.cardNumber} matched ${legacyDistinct.length} distinct printings after stamp filtering (read stampType=${read.stampType}) — cannot tell them apart, falling through`
                );
              }

              // GUARD 1 (2026-10-15, Alakazam 33/165 — DENOMINATOR) — see
              // totalsContradict above for the full case. The primary read
              // is not worthless just because its numerator matched nothing:
              // its DENOMINATOR is an independent piece of the same read,
              // and when it positively disagrees with the rescue target's,
              // the two models are not corroborating each other at all.
              // Real case: primary "1/18" vs target "001/165" — the "/18"
              // was evidence against 001/165 the whole time.
              //
              // Applied as a veto on the already-selected single match
              // rather than as a filter before the uniqueness test, which
              // is deliberately the NARROWING direction: filtering first
              // could let a pool that currently declines (2+ distinct
              // matches) collapse to one and start rescuing where it never
              // did before. This can only ever stop a rescue, never start
              // one.
              if (legacyMatch && totalsContradict(read.cardNumber, legacyMatch.number)) {
                console.log(
                  `[requestId=${requestId}]`,
                  `[lookup] LEGACY-MODEL NUMBER RESCUE DECLINED (DENOMINATOR CONTRADICTION): primary read number=${read.cardNumber} and rescue target ${legacyMatch.name} ${legacyMatch.number} disagree on the set total — legacy read number=${legacyRead.cardNumber}, falling through`
                );
                legacyMatch = null;
              }

              // GUARD 2 (2026-10-15, Alakazam 33/165 — SIBLING AMBIGUITY) —
              // see sameSiblingGroup above. The rescue is about to replace a
              // candidate that ALREADY won scoring outright with a sibling
              // printing of the same card, on the strength of a number read
              // that the primary model contradicts. In the real scan the
              // pre-rescue `best` was the CORRECT card (Alakazam (33),
              // bestScore 10, tieCount 1 at the first pass) and the rescue
              // installed the 11.7x holo sibling, taking the Suggested Bid
              // from $11.20 to $92.62.
              //
              // Within a sibling group the number is the only discriminator
              // (identical HP and attack list by construction), so when the
              // two models disagree about the number there is no
              // cross-check left — only two guesses. The honest answer is
              // that we cannot tell, so neither price is shown and both
              // cards are named. This is the same conclusion the existing
              // `tieCount >= 2` rule reaches, applied to a rescue that
              // bypasses scoring entirely.
              //
              // Deliberately does NOT pick one: not the pre-rescue best, not
              // the rescue target, and above all not the more expensive one.
              if (
                legacyMatch &&
                bestScore >= MATCH_FLOOR &&
                sameSiblingGroup(best, legacyMatch) &&
                !numbersMatch(read.cardNumber, legacyRead.cardNumber).match
              ) {
                const ambiguousPair = [best, legacyMatch].sort((x, y) => {
                  const nx = normalizeNumber(x.number);
                  const ny = normalizeNumber(y.number);
                  return (nx ? Number(nx.num) : 0) - (ny ? Number(ny.num) : 0);
                });
                const describe = (c) => {
                  const mkt = c.prices && typeof c.prices.market === "number" ? c.prices.market : null;
                  return `${c.name} ${c.number}${mkt != null ? ` (market ~$${mkt.toFixed(2)})` : " (no market price available)"}`;
                };
                console.log(
                  `[requestId=${requestId}]`,
                  `[lookup] SIBLING AMBIGUITY — RESCUE REFUSED: primary read number=${read.cardNumber}, legacy read number=${legacyRead.cardNumber}; pre-rescue best=${best.name} ${best.number} (tcgPlayerId=${best.tcgPlayerId}) and rescue target=${legacyMatch.name} ${legacyMatch.number} (tcgPlayerId=${legacyMatch.tcgPlayerId}) are the same card in the same set — withholding price for both`
                );
                return {
                  found: true,
                  cardName: read.cardName,
                  setName: best.setName || null,
                  cardImageUrl: null,
                  matchConfidence: "Low",
                  matchBasis: "sibling-ambiguous",
                  ambiguousNote:
                    `This set prints the same card twice — once holo, once not — and the two printings are told apart ONLY by their card number. The two AI models disagreed about that number ("${read.cardNumber}" vs "${legacyRead.cardNumber}"), so this is either ${describe(ambiguousPair[0])} or ${describe(ambiguousPair[1])}. They share the same HP and the same attack, so nothing else can break the tie. No price or bid is shown, because guessing wrong here is wrong by a wide margin — read the card number off the physical card.`,
                  tcgplayerUrl: null,
                  pricingLookup: null,
                  printingUndetermined: true,
                };
              }

              if (legacyMatch) {
                best = legacyMatch;
                matchConfidence = "Medium";
                matchBasis = "legacy-number-rescue";
                ambiguousNote =
                  `The card number we read ("${read.cardNumber}") didn't match anything in our database, but a second AI model's independent read of the same card ("${legacyRead.cardNumber}") matched this printing exactly — using that as a cross-check rescue. This isn't a fully confirmed read; verify the exact printing before trusting this price.`;
                legacyRescued = true;
                console.log(
                  `[requestId=${requestId}]`,
                  `[lookup] LEGACY-MODEL NUMBER RESCUE: primary read number=${read.cardNumber} matched nothing, but legacy shadow read number=${legacyRead.cardNumber} matched best=${best.name} ${best.number}`
                );
              }
            }
          } catch (e) {
            console.error(`[requestId=${requestId}]`, "[lookup] legacy-model rescue check failed (treating as unavailable):", e && e.message);
          }
        }

        if (!legacyRescued) {
          // NOTE: deliberately excludes "rarity" from this list, unlike the
          // corroboration comment above might suggest at a glance. Every
          // other key here compares a piece of THIS read against THIS
          // candidate (hp/subtype/set/attackName/stampMatch) — real,
          // if individually weak, evidence the read and candidate are the
          // same card. `rarity` is a candidate-only prior (see
          // NOTABLE_RARITY_PATTERN above) that's true for almost any
          // valuable-looking candidate regardless of whether it's the
          // right one — confirmed by a real test case (the Wigglytuff
          // scan below): a "Shiny Secret Rare" candidate matched on HP
          // alone would have cleared a naive "2+" bar by picking up a
          // free rarity point, defeating the whole point of this check.
          // Counting it here would make the floor easiest to clear on
          // exactly the priciest, riskiest-to-get-wrong candidates.
          const corroboratingSignals = ["hp", "subtype", "set", "attackName", "stampMatch"].filter(
            (k) => bestDetail && bestDetail[k]
          ).length;
          if (corroboratingSignals < 2) {
            console.log(
              `[requestId=${requestId}]`,
              `[lookup] NO NUMBER MATCH, INSUFFICIENT CORROBORATION (${corroboratingSignals} signal(s)): read number=${read.cardNumber}, language=${read.language}, best=${best.name} ${best.number} — withholding specific price`
            );
            return {
              found: true,
              cardName: read.cardName,
              setName: null,
              cardImageUrl: null,
              matchConfidence: "Low",
              ambiguousNote:
                `Read the name "${read.cardName}" but the card number ("${read.cardNumber}") didn't match any printing in our database, and no other model's read helped narrow it down — the closest candidate on other details shares only ${corroboratingSignals === 0 ? "no other signal" : "one weak signal"}, not enough to trust a specific printing or price. Verify the exact printing on the physical card.`,
              tcgplayerUrl: null,
              pricingLookup: null,
              printingUndetermined: true,
            };
          }
          matchConfidence = "Low";
          // CORRECTED (2026-08-27): this used to add a Japanese-specific
          // caveat blaming a "database doesn't carry Japanese cards"
          // data gap. That diagnosis was wrong — see the FIX comment on
          // fetchPokemonPriceTracker for the real bug (a missing
          // `language` query param) — so the language-specific blame is
          // removed. This generic message (a legible number simply not
          // present in whatever pool was searched) still applies to both
          // languages equally.
          ambiguousNote =
            `No printing in our database has the exact card number that was read ("${read.cardNumber}") — this may be a set or promo PokemonPriceTracker doesn't track yet. Showing the closest match found on other details (HP/attack/set) as a rough estimate only; verify the exact printing before trusting this price.`;
          console.log(`[requestId=${requestId}]`, `[lookup] NO NUMBER MATCH IN POOL: read number=${read.cardNumber}, language=${read.language}, best=${best.name} ${best.number} (matched on other signals only)`);
        }
      }
    }
  } else if (!read.cardNumber && !setNameSearchRescued && !subFloorLegacyRescued) {
    // EXCLUSION ADDED 2026-10-02 (Southern Islands Mew): a setName-search
    // rescue is deliberately exempt from this floor. The floor exists for
    // "we picked a candidate out of a broad name-search pool on one
    // coincidental weak signal" — but a setName-search rescue is the
    // opposite situation: the candidate was located by a targeted
    // `"<name> <setName>"` query and then had to be the EXACTLY ONE row
    // that passed the name filter, an exact normalized set-name equality
    // check, and the number check. Without this exclusion the Mew case
    // resolves correctly to 46466 and is then thrown away by a signal
    // count of 0 (the rescue sets bestDetail to null, since the candidate
    // was never scored against the read), which is precisely the $624
    // miss this change exists to fix. The rescue already caps confidence
    // at Medium and carries its own disclosure, so the honesty bar is
    // still met.
    //
    // FIX (2026-09-27, live scan — Lapras "Start Deck 100" false positive):
    // the weak-signal floor directly above only ever ran when
    // read.cardNumber was PRESENT but matched no candidate — a read.cardNumber
    // of null skipped this entire `if (read.cardNumber && best.number)`
    // block outright, including the corroboration check, so a candidate
    // that cleared MATCH_FLOOR on a single coincidental signal (e.g.
    // attackName alone, worth 4 points) got shown as a real, specific,
    // Low-confidence-but-priced match with no disclosure at all beyond the
    // generic "Low-confidence match" badge — no `printingUndetermined`,
    // no explanation of WHY. Confirmed live: a real Lapras (Master Ball
    // Pattern, SV2a: Pokemon Card 151, 131/165, $21.88) scan had both
    // cardNumber AND hp come back null (glare), and the only surviving
    // signal — a misread attackName "Water Gun" — happened to match an
    // unrelated candidate (Lapras, Start Deck 100 Battle Collection,
    // 159/742, bestScore=4, tieCount=1) that then got shown with full
    // confidence-badge treatment and a real price for the wrong card.
    // Reproduced mechanically against real PPT data before this fix (see
    // docs/test-cases.md) — this is the exact same corroboratingSignals
    // check as the block above, applied to the other half of the
    // "we don't actually know this candidate's number" problem: a number
    // that doesn't match anything, and a number that was never read at
    // all, are both cases where `best` was picked on non-number signals
    // alone, and deserve the identical scrutiny. Deliberately does NOT
    // add the legacy-model rescue here — a null primary read has no
    // number for the legacy model's read to be "rescuing" against in the
    // same sense (that mechanism is specifically about a primary
    // MISREAD being corrected by a second read, not a primary NON-read);
    // out of scope for this narrowly-targeted fix. Deliberately placed in
    // an `else if`, mutually exclusive with the block above by
    // construction (`read.cardNumber` can't be both truthy and falsy) —
    // every case where cardNumber is present, matched or unmatched, is
    // completely unaffected; this branch is reachable only when
    // cardNumber was never read at all.
    const corroboratingSignals = ["hp", "subtype", "set", "attackName", "stampMatch"].filter(
      (k) => bestDetail && bestDetail[k]
    ).length;
    if (corroboratingSignals < 2) {
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] NULL CARDNUMBER, INSUFFICIENT CORROBORATION (${corroboratingSignals} signal(s)): language=${read.language}, best=${best.name} ${best.number} — withholding specific price`
      );
      return {
        found: true,
        cardName: read.cardName,
        setName: null,
        cardImageUrl: null,
        matchConfidence: "Low",
        ambiguousNote:
          `The card number wasn't legible this scan, and the closest candidate on other details shares only ${corroboratingSignals === 0 ? "no other signal" : "one weak signal"}, not enough to trust a specific printing or price. Verify the exact printing on the physical card.`,
        tcgplayerUrl: null,
        pricingLookup: null,
        printingUndetermined: true,
      };
    }
  }

  // FIX (2026-08-30, test #63): honest disclosure for the rescue path
  // above — this match was found ONLY because its card number matched
  // exactly; the card's NAME never matched anything in our search at all
  // (most likely an untranslated or mistranslated read). Distinct from
  // the "weak number match" case below (different numbering schemes) —
  // here the number match is exact and trustworthy, but the name is
  // outright unverified, which is unusual enough to always disclose
  // regardless of how high the underlying score is.
  if (!ambiguousNote && setNameSearchRescued) {
    // Set outright rather than "cap at Medium from whatever the score
    // said", matching the legacy-number-rescue precedent directly below.
    // The rescue REPLACED `best` with a candidate that was never scored
    // against the read, so the surviving bestScore describes a different
    // card and carrying it forward would be meaningless — in the Mew case
    // it yields Low purely because the synthesized floor score (3) sits
    // under MEDIUM_THRESHOLD (5). Medium is the right level on the merits:
    // this candidate was the exactly-one row to pass the name filter, an
    // exact normalized set-name equality check, and the number check — but
    // it was found via a set name that may itself be a second model's
    // guess, so it is explicitly not High.
    matchConfidence = "Medium";
    matchBasis = "setname-search";
    ambiguousNote =
      `We couldn't find this card by name or number, so it was located using the set name "${setNameSearchHintValue}"${
        setNameSearchHintSource === "legacy-shadow" ? ", which came from a second AI model's independent read of the card" : " read from the card"
      }. Exactly one printing in that set matched the name${
        setNameSearchNumeratorDisagreed
          ? `, but its number (${best.number}) does NOT match the number we read (${read.cardNumber}) — only the set size matched, so the number was very likely misread`
          : " and number we had"
      }. This isn't a fully confirmed match; verify the exact set and printing before trusting this price.`;
  }

  // ADDED 2026-10-07, paired with the SUB-FLOOR LEGACY-MODEL NUMBER RESCUE
  // above. Set outright rather than capped from the score, for the same
  // reason as the setName-search rescue directly above: the rescue replaced
  // a null `best` with a candidate that was never scored against the read,
  // so `bestScore` is the synthesized MATCH_FLOOR and says nothing about
  // this candidate. Medium is the right level on the merits — exactly one
  // pool row passed the name filter AND a non-weak exact number match — but
  // the number came from a second model's read, not the primary one, so it
  // is explicitly never High. matchBasis is the existing
  // "legacy-number-rescue" code: this is the same rescue mechanism as the
  // downstream block, just reached on the sub-floor path, and the frontend
  // should treat the two identically.
  if (!ambiguousNote && subFloorLegacyRescued) {
    matchConfidence = "Medium";
    matchBasis = "legacy-number-rescue";
    ambiguousNote = read.cardNumber
      ? `The card number we read ("${read.cardNumber}") didn't match anything in our database, but a second AI model's independent read of the same card ("${subFloorLegacyNumber}") matched this printing exactly — using that as a cross-check rescue. This isn't a fully confirmed read; verify the exact printing before trusting this price.`
      : `We couldn't read a card number off this scan at all, but a second AI model's independent read of the same card ("${subFloorLegacyNumber}") matched exactly one printing in our database — using that as a cross-check rescue. This isn't a fully confirmed read; verify the exact printing before trusting this price.`;
  }

  if (!ambiguousNote && nameFilterRescuedByNumber) {
    matchConfidence = matchConfidence === "High" ? "Medium" : matchConfidence;
    matchBasis = "name-rescued-by-number";
    ambiguousNote =
      `The card name we read ("${read.cardName}") didn't match anything in our database — this match was found using only the card number ("${read.cardNumber}"), which matched exactly. This may mean the name was misread or mistranslated; verify the card name/printing before trusting this match or price.`;
    console.log(`[requestId=${requestId}]`, `[lookup] NAME FILTER RESCUED BY NUMBER: read name="${read.cardName}" matched nothing, but number=${read.cardNumber} matched best=${best.name} ${best.number} exactly`);
  }

  if (!ambiguousNote && tieCount >= 2) {
    matchConfidence = "Low";
    matchBasis = "tie";
    const shadowlessTie = isShadowlessVsPlainTie(tiedCandidates);
    ambiguousNote = shadowlessTie ? shadowlessAmbiguousNoteText() : ambiguousNoteText(!!read.cardNumber);
    console.log(
      `[requestId=${requestId}]`,
      `[lookup] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}${shadowlessTie ? " (Shadowless vs. non-Shadowless pair)" : ""}`
    );
  }

  // FIX (2026-08-27, live test — Mewtwo/SVP 052): a "weak" number match
  // (see numbersMatch) means the only real signal tying this candidate to
  // the read card is a numerator that happens to coincide despite the two
  // using different numbering schemes (promo vs numbered-set) — flag it
  // explicitly rather than let whatever score it landed at imply more
  // certainty than that coincidence deserves.
  if (!ambiguousNote && bestDetail && bestDetail.numberStrength === "weak") {
    matchConfidence = matchConfidence === "High" ? "Medium" : matchConfidence;
    matchBasis = "weak-number";
    ambiguousNote =
      "The card number that matched uses a different numbering format than this printing normally would (e.g. a promo-style number vs. a numbered-set card) — the shared digits may be coincidental rather than confirming this is the same printing. Verify the exact set/number on the physical card before trusting this match or price.";
    console.log(`[requestId=${requestId}]`, `[lookup] WEAK NUMBER MATCH: read=${read.cardNumber}, best=${best.name} ${best.number} (numbering schemes differ, digits may coincide by chance)`);
  }

  // FIX (2026-08-27, live test — Brock's Onix): a real scan read
  // cardNumber "21/132" (which exactly matched a real candidate) but
  // ALSO read hp "100 HP" — and HP 100 only belongs to a DIFFERENT
  // candidate (069/132, HP 100) than the one the number pointed to
  // (021/132, HP 70). The number match outscored HP and won with false
  // "High" confidence, showing the wrong printing's price and image.
  // Gemini's cardNumber OCR can simply misread a digit (especially with
  // multiple cards visible in frame, as here), and pure number-string
  // matching has no way to catch that on its own. Detect the conflict:
  // if the winning candidate's own hp contradicts what was read, AND a
  // DIFFERENT candidate's hp matches exactly, that's a strong signal one
  // of Gemini's fields is wrong — downgrade to Low confidence and warn
  // rather than present a specific wrong card with false certainty.
  if (!ambiguousNote && read.hp && best.hp) {
    const readHpDigits = String(read.hp).match(/\d+/);
    const bestHpDigits = String(best.hp).match(/\d+/);
    if (readHpDigits && bestHpDigits && readHpDigits[0] !== bestHpDigits[0]) {
      const hpMatchElsewhere = candidates.some((c) => {
        if (c === best || !c.hp) return false;
        const cHpDigits = String(c.hp).match(/\d+/);
        return cHpDigits && cHpDigits[0] === readHpDigits[0];
      });
      if (hpMatchElsewhere) {
        matchConfidence = "Low";
        ambiguousNote =
          "The matched printing's HP doesn't match what was read off the card, but a different printing's HP does — the card number may have been misread (especially if multiple cards were visible in frame). Verify the exact printing before trusting this match or price.";
        console.log(`[requestId=${requestId}]`, `[lookup] NUMBER/HP CONFLICT: best=${best.name} ${best.number} hp=${best.hp}, read hp=${read.hp}, matches elsewhere`);
      }
    }
  }

  // FIX (2026-10-05, live scan — "ME: 30th Celebration" Pikachu 038/128,
  // requestId 930b7ccd): a real scan read attackName "Targeted Spark" —
  // the genuine attack on 038/128 (tcgPlayerId 712942, market $0.96) —
  // but fabricated cardNumber "005/025", which happens to match a REAL
  // card exactly: Celebrations 005/025 Pikachu (tcgPlayerId 250303),
  // same classic Base Set artwork, same HP 60, market $4.58. That scored
  // 29 (number 20 + set 3 + hp 6) with tieCount 1 and was presented at
  // High confidence with the wrong card's price. The one signal that
  // positively DISPROVED the match — an attack name on neither of the
  // candidate's attacks — was worth exactly zero, because scoreCandidate
  // only ever ADDS SCORE.attackName on a match and never penalizes a
  // mismatch. Both Gemini models independently produced the same wrong
  // number, so this is artwork/set-logo anchoring, not glare OCR noise;
  // no amount of rescanning would have fixed it.
  //
  // Deliberately NOT a scoring penalty. A penalty changes which
  // candidate WINS across the whole corpus, and here it would buy
  // nothing: with the number misread, the correct card is not in the
  // fetched pool at all, so penalizing only reaches "withhold" by a
  // longer route with far more blast radius. This is a confidence cap
  // plus an honest disclosure instead — strictly additive, and it cannot
  // change which card wins or what price is computed for it.
  //
  // Each guard is load-bearing:
  //   - read.confidence === "High": a hedged read's attack name isn't
  //     trustworthy enough to disprove anything.
  //   - best.attackNames must be non-empty: Trainers, Energy and
  //     incomplete PPT rows carry no attack data at all, and silence is
  //     not evidence of a mismatch.
  //   - compares against EVERY attack, not best.attackName (which is
  //     only attack #1) — otherwise a correct read of a card's second
  //     attack would be flagged. See extractAttackNames above.
  //   - tries attackNameEnglish too, so a Japanese card whose English
  //     translation matches is not flagged on the as-printed name alone.
  //   - ENGLISH READS ONLY. On a non-English card the attack name has to
  //     survive OCR *and* translation, two failure modes an English read
  //     doesn't have, and the only false positive this rule produced in
  //     measurement was exactly that: a real Japanese Mega Eelektross ex
  //     225/193 whose number AND hp both matched the candidate exactly
  //     (so the card was right), read as "ばくれつだん" and translated to
  //     "Focus Blast" when the real attack is Split Bomb / ぶんれつだん — a
  //     single-kana confusion plus a wrong translation. A false Low is
  //     not free: it also suppresses the extension's alternate-printing
  //     banner, which has already cost a real find once (see the Corphish
  //     entry in CLAUDE.md). Japanese cards therefore lose this
  //     protection entirely, deliberately. Missing/null language is
  //     treated as English, matching `String(read.language || "English")`
  //     elsewhere in this file.
  // matchBasis is left untouched: the basis on which this candidate was
  // chosen hasn't changed, and this flag is a separate axis.
  // FIX (2026-10-15, Alakazam 33/165 — "Psymimic" false positive): two
  // suppressions added below. Every guard above is UNCHANGED — still
  // English-only, still High-confidence reads only, still requires a
  // non-empty parsed attack list, still compares against every attack. The
  // trigger condition is now computed into a boolean first only so the two
  // suppression checks (one of which must await the legacy read) can run
  // before the cap is applied. A suppressed mismatch leaves
  // matchConfidence, ambiguousNote and attackMismatch exactly as they were,
  // so it cannot change which card wins or what price is computed.
  const readLanguageIsEnglish = String(read.language || "English").trim().toLowerCase() === "english";
  const readAttackNamesToTry = [read.attackName, read.attackNameEnglish].filter(Boolean);
  const attackMismatchTriggered =
    read.attackName &&
    readLanguageIsEnglish &&
    read.confidence === "High" &&
    Array.isArray(best.attackNames) &&
    best.attackNames.length &&
    !readAttackNamesToTry.some((readAttack) =>
      best.attackNames.some((candAttack) => attackNamesFuzzyMatch(readAttack, candAttack))
    );

  if (attackMismatchTriggered) {
    // SUPPRESSION 1 — the read name is somewhere in this card's own text.
    // A Poké-POWER/Poké-BODY/Ability name read instead of the attack name
    // is a CORRECT read of the card, so it is not evidence against the
    // match. See attackNameAppearsInCardText for the verified limit: PPT
    // carries no power/ability field, so this only fires where the name
    // sits inside an attack entry's description text.
    const candidateCardText = Array.isArray(best.attacks) ? best.attacks.join(" \n ") : "";
    const textSuppressedName = readAttackNamesToTry.find((n) => attackNameAppearsInCardText(n, candidateCardText)) || null;

    // SUPPRESSION 2 — the OTHER model read an attack that IS on this
    // card's list. The mismatch rule's whole claim is "no model can see
    // this attack on this card"; once the second independent read lands on
    // a real attack of the matched candidate, the primary read's attack
    // name is a single-model misread (here: the Poké-POWER instead of the
    // attack), not disproof of the card. On the real clean-image scan the
    // legacy model read "Syncroblast", which is exactly 83500's attack.
    // Capped await — a legacy read that is not ready in time is treated as
    // absent and the cap applies as before.
    let crossModelAttack = null;
    if (!textSuppressedName && legacyReadPromise) {
      const legacyRead = await awaitLegacyReadCapped(legacyReadPromise, requestId, "the attack-mismatch check");
      if (legacyRead && legacyRead.found) {
        crossModelAttack =
          [legacyRead.attackName, legacyRead.attackNameEnglish]
            .filter(Boolean)
            .find((legacyAttack) => best.attackNames.some((candAttack) => attackNamesFuzzyMatch(legacyAttack, candAttack))) || null;
      }
    }

    if (textSuppressedName || crossModelAttack) {
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] ATTACK MISMATCH SUPPRESSED (${textSuppressedName ? `read name "${textSuppressedName}" appears in the card's own text` : `legacy model read "${crossModelAttack}", which is on this card's attack list`}): read="${readAttackNamesToTry.join('" / "')}" candidate attacks=[${best.attackNames.join(", ")}] best=${best.name} ${best.number} (tcgPlayerId=${best.tcgPlayerId})`
      );
    } else {
      matchConfidence = "Low";
      attackMismatch = true;
      const attackMismatchNote = `The attack we read, "${read.attackName}", isn't on this printing's attack list.`;
      ambiguousNote = ambiguousNote ? `${ambiguousNote} ${attackMismatchNote}` : attackMismatchNote;
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] ATTACK MISMATCH: read="${readAttackNamesToTry.join('" / "')}" candidate attacks=[${best.attackNames.join(", ")}] best=${best.name} ${best.number} (tcgPlayerId=${best.tcgPlayerId})`
      );
    }
  }

  // -------------------------------------------------------------------------
  // SIBLING-DISAGREEMENT CAP (2026-10-15, test #102)
  // -------------------------------------------------------------------------
  // The #101 guards stopped the legacy-number RESCUE from swapping in a holo
  // sibling, but a production scan (requestId 159a5822) reached the same
  // wrong card by a completely different route: the primary model read
  // "1/165" off an Expedition Alakazam whose real number is 033/165, that
  // number matched Alakazam (1) 001/165 EXACTLY, and so the $250 holo won on
  // plain scoring — bestScore 26, tieCount 1, `score-only`, **High**. No
  // rescue ran, so nothing in #101 could see it.
  //
  // Worse, #101 made that scan's disclosure strictly weaker. The old ATTACK
  // MISMATCH rule had been capping it to Low by accident: the primary model
  // misreads the attack and the number together, so the garbage attack name
  // was correlating with the garbage number. Once the cross-model suppression
  // (correctly) stopped treating a Poké-POWER misread as disproof, the Low
  // went away and the wrong card was presented at High. Measured against the
  // pre-fix commit on that exact read: Low/attackMismatch=true before,
  // High/false after. Both siblings share `[2P] Syncroblast (80)`, so the
  // attack signal carries NO card-identity information inside a sibling group
  // — it was never diagnosing this, only coinciding with it.
  //
  // So the check belongs here, after every path has chosen a winner
  // (score-only, any rescue, setname-*), and it is about the ONE signal that
  // actually separates sibling printings: the card number.
  //
  // Rule: if the pool holds an above-floor sibling of the winner, the number
  // must be CORROBORATED — the legacy model's number has to point at the same
  // member of the group as the primary's. If it points at a different
  // sibling, or there is no usable legacy number at all, we genuinely do not
  // know which printing this is, and the measured sibling price gap (5.9x
  // median on Expedition, worst 15.2x) makes a confident single answer the
  // most expensive possible mistake.
  //
  // FAIL SAFE on a missing/slow legacy read, per explicit instruction: no
  // corroboration means ambiguous, not "assume the primary is right". The
  // legacy read is normally the SLOWER of the two (~2.6s vs ~1.9s measured),
  // but it starts in parallel and this check runs after the primary read AND
  // the PPT lookups, so it has usually long since resolved; the 500ms cap is
  // the same one the other legacy consumers use. `[sibling-cap]` logs the
  // readiness outcome on every firing so the real rate is measurable from
  // organic traffic rather than estimated.
  //
  // Scope: this can only ever LOWER confidence and withhold a single price.
  // It cannot change which candidate won, and it is unreachable unless two
  // products share a base name AND a set — the e-Card double-print structure
  // (94 such groups across Expedition/Aquapolis/Skyridge) plus same-set
  // same-name pairs like Expedition's Blastoise (36)/(37).
  let siblingAmbiguity = null;
  if (best && bestScore >= MATCH_FLOOR && matchBasis !== "sibling-ambiguous") {
    const poolSiblings = distinctByDedupKey(
      (candidates || []).filter(
        (c) => sameSiblingGroup(best, c) && scoreCandidate(c, read).score >= MATCH_FLOOR
      )
    );
    if (poolSiblings.length) {
      const primaryPointsAtBest = numberPointsAtCandidate(read.cardNumber, best);
      const legacyRead = await awaitLegacyReadCapped(legacyReadPromise, requestId, "the sibling-disagreement cap");
      const legacyNumberFirst = legacyRead && legacyRead.found ? legacyRead.cardNumber || null : null;

      // SCOPE CORRECTION (2026-10-15, test #104). The first cut capped on ANY
      // uncorroborated sibling scan, which was far too broad: because
      // candidateSiblingBaseName strips the " - 125/197" suffix,
      // "Charizard ex - 125/197" and "Charizard ex - 223/197" (Obsidian
      // Flames regular vs Special Illustration Rare) are a sibling pair — as
      // are every V/alt-art, ex/SIR and regular/full-art-Trainer twin in the
      // modern era. With the legacy read's cardNumber null ~43% of the time
      // (56.9% non-null baseline), that would have turned a large share of
      // ordinary modern chase-card scans into two-card ambiguous results.
      //
      // So the two cases are now treated differently, split on which
      // direction the error runs:
      //
      //   DISAGREEMENT (each model's number points at a DIFFERENT member of
      //   the group) — always ambiguous. Two independent reads actively
      //   contradicting each other about the one discriminating signal is
      //   real evidence that we cannot tell them apart, and it is rare.
      //
      //   NO CORROBORATION (legacy number missing, timed out, or pointing at
      //   nothing in this group) — cap ONLY if the winner is the MORE
      //   EXPENSIVE sibling. If the winner is the cheapest in its group,
      //   let it stand at its normal confidence with a note naming the
      //   pricier twin, because the residual error then runs toward
      //   UNDERbidding, which costs nothing. This is the same
      //   err-cheap principle as the Snorlax stamped-twin rule: never let a
      //   coincidence put the expensive printing's price on screen, but do
      //   not punish the cheap printing for having an expensive relative.
      //
      // Market figures come from PPT's own `prices.market` on the already-
      // fetched rows — no extra call. If any market in the group is missing
      // we cannot prove the winner is the cheap one, so that falls to the
      // capping side rather than being assumed safe.
      const bestMarket = typeof best.prices?.market === "number" ? best.prices.market : null;
      const siblingMarkets = poolSiblings.map((c) => (typeof c.prices?.market === "number" ? c.prices.market : null));
      const allMarketsKnown = bestMarket != null && siblingMarkets.every((m) => m != null);
      const winnerIsCheapest = allMarketsKnown && siblingMarkets.every((m) => bestMarket <= m);
      const pricierSiblings = poolSiblings.filter(
        (c, i) => siblingMarkets[i] == null || bestMarket == null || siblingMarkets[i] > bestMarket
      );

      // FIX 1 (2026-10-18): a second, longer wait — but ONLY when the sole
      // reason we are about to withhold is that no legacy number has turned
      // up yet. See SIBLING_CAP_LEGACY_TOTAL_WAIT_MS. Deliberately not a
      // longer first wait: corroborated and disagreement decisions are final
      // on the evidence already in hand and must not pay for this.
      let legacyNumber = legacyNumberFirst;
      let legacyPointsAtBest = numberPointsAtCandidate(legacyNumber, best);
      let legacySibling = poolSiblings.find((c) => numberPointsAtCandidate(legacyNumber, c)) || null;
      let legacyWaitExtended = false;
      if (!legacyNumber && legacyReadPromise) {
        const extraMs = SIBLING_CAP_LEGACY_TOTAL_WAIT_MS - LEGACY_NUMBER_RESCUE_TIMEOUT_MS;
        if (extraMs > 0) {
          const extendedStart = Date.now();
          const legacyRetry = await awaitLegacyReadCapped(
            legacyReadPromise,
            requestId,
            "the sibling-disagreement cap (extended wait)",
            extraMs
          );
          legacyWaitExtended = true;
          const retryNumber = legacyRetry && legacyRetry.found ? legacyRetry.cardNumber || null : null;
          console.log(
            `[requestId=${requestId}]`,
            `[sibling-cap] extended legacy wait +${Date.now() - extendedStart}ms (budget ${extraMs}ms) -> legacyNumber=${retryNumber || "still null"}`
          );
          if (retryNumber) {
            legacyNumber = retryNumber;
            legacyPointsAtBest = numberPointsAtCandidate(legacyNumber, best);
            legacySibling = poolSiblings.find((c) => numberPointsAtCandidate(legacyNumber, c)) || null;
          }
        }
      }

      const corroborated = legacyPointsAtBest && !legacySibling;
      const modelsDisagree = !!legacySibling;
      // FIX 2 (2026-10-18): `stands-cheaper` now also requires the PRIMARY
      // read's number to point at the winner. Live case 7eb57832: a Flareon
      // read as "4/105" matched nothing in the pool, scoring fell through
      // NO NUMBER MATCH IN POOL and picked Flareon (19) 19/64 Jungle
      // ($48.62) on hp/attack alone — with a same-set sibling at $337.50,
      // a 6.9x gap. "Cheapest of the group" was never meant to excuse a
      // winner that no number confirms: with neither model's number pointing
      // at it, being the cheap one is a coincidence, not evidence, and the
      // panel would have shown a confident $48.62 for a card that could be
      // the $337.50 printing. Now that case discloses both instead.
      const decision = corroborated
        ? "corroborated"
        : modelsDisagree
        ? "ambiguous-disagreement"
        : winnerIsCheapest && primaryPointsAtBest
        ? "stands-cheaper"
        : "ambiguous-uncorroborated";

      console.log(
        `[requestId=${requestId}]`,
        `[sibling-cap] best=${best.name} ${best.number} (tcgPlayerId=${best.tcgPlayerId}) siblings=${poolSiblings.length} ` +
          `legacyReady=${legacyRead ? "yes" : "no"} legacyNumber=${legacyNumber || "null"} ` +
          `primaryPointsAtBest=${primaryPointsAtBest} legacyPointsAtBest=${legacyPointsAtBest} ` +
          `legacyPointsAtSibling=${legacySibling ? `${legacySibling.name} ${legacySibling.number}` : "no"} ` +
          `bestMarket=${bestMarket == null ? "null" : bestMarket} siblingMarkets=${JSON.stringify(siblingMarkets)} ` +
          `winnerIsCheapest=${winnerIsCheapest} legacyWaitExtended=${legacyWaitExtended} decision=${decision}`
      );

      if (decision === "stands-cheaper") {
        // Normal confidence, normal price, one honest line. The winner is the
        // cheapest printing in its group, so the worst case is understating
        // what the card is worth — the direction this project has always
        // chosen to err in.
        const pricier = pricierSiblings
          .slice()
          .sort((x, y) => (y.prices?.market || 0) - (x.prices?.market || 0))[0];
        if (pricier) {
          const pm = typeof pricier.prices?.market === "number" ? ` market ~$${pricier.prices.market.toFixed(2)}` : "";
          const standsNote =
            `This set also prints ${pricier.name} ${pricier.number}${pricier.rarity ? ` (${pricier.rarity})` : ""},${pm} — ` +
            `a more valuable version of the same card, and the second AI model didn't read a card number to rule it out. ` +
            `The price shown is for the cheaper printing. ${SIBLING_DISAMBIGUATION_HINT}`;
          ambiguousNote = ambiguousNote ? `${ambiguousNote} ${standsNote}` : standsNote;
        }
      } else if (decision !== "corroborated") {
        // Ordered by card number ascending — deterministic, and never
        // price-ranked, so the panel cannot imply the expensive one is the
        // likely answer.
        siblingAmbiguity = await buildAmbiguityDisclosure(
          [best, ...poolSiblings],
          read,
          requestId,
          {
            prompt: SIBLING_DISAMBIGUATION_HINT,
            reason: legacySibling
              ? `the two AI models read different card numbers ("${read.cardNumber || "unreadable"}" vs "${legacyNumber}"), each pointing at a different one of these printings`
              : `only one AI model produced a usable card number ("${read.cardNumber || "unreadable"}"), and the printing it picked is the more valuable one here`,
            label: "sibling-cap",
          }
        );
        const group = siblingAmbiguity.candidates;
        matchConfidence = "Low";
        matchBasis = "sibling-ambiguous";
        const siblingNote =
          `This set prints this card in more than one version, told apart ONLY by the card number — and ${siblingAmbiguity.reason}. ` +
          `Both printings are shown below with their own price and bid. ${siblingAmbiguity.prompt}`;
        ambiguousNote = ambiguousNote ? `${ambiguousNote} ${siblingNote}` : siblingNote;
        console.log(
          `[requestId=${requestId}]`,
          `[lookup] SIBLING DISAGREEMENT CAP (${decision}): ${group.map((c) => `${c.name} ${c.number} (${c.rarity || "?"}, tcgPlayerId=${c.tcgPlayerId})`).join(" | ")} — capped to Low, no single price`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // EXACT-NUMBER TIE ACROSS DIFFERENT PRODUCTS (2026-10-18)
  // -------------------------------------------------------------------------
  // `tieCount >= 2` already forces Low, but the panel still showed ONE of the
  // tied candidates and priced it — and which one is decided by PPT's array
  // order, which carries no meaning. When every tied candidate genuinely
  // matches the read number, the number cannot break the tie and neither can
  // anything else we have; picking by array order is the same coin-flip the
  // sibling cap was built to stop.
  //
  // Real case from the Rayquaza run: once the padding fix puts the card in
  // the pool, "3/17" matches BOTH Rayquaza 003/017 POP Series 1 ($325.30)
  // and Rayquaza - 003/017 (2006) Blister Exclusives ($135.30) — same hp 80,
  // same two attacks ("Fly", "Dragon Claw"), different sets, a 2.4x spread.
  // The 2026-10-17 window also held Rayquaza SWSH029 (two products, score 30,
  // tie 2) and Radiant Charizard 020/159 (score 32, tie 2).
  //
  // Distinct from the sibling cap: those are printings of one card inside one
  // set, told apart by finish and artwork. These are different PRODUCTS that
  // happen to share a number, so the tell is the set symbol or the packaging
  // — hence its own prompt and its own `matchBasis`. The payload and the
  // panel are shared (see buildAmbiguityDisclosure), including per-row graded
  // pricing for slabs.
  //
  // Runs only when the sibling cap did not already fire, and cannot change
  // which candidate scoring chose — the disclosed group always contains it.
  if (
    !siblingAmbiguity &&
    best &&
    read.cardNumber &&
    tieCount >= 2 &&
    Array.isArray(tiedCandidates) &&
    tiedCandidates.length >= 2 &&
    tiedCandidates.every((c) => numberPointsAtCandidate(read.cardNumber, c))
  ) {
    const distinctTied = distinctByDedupKey(tiedCandidates).filter(
      (c, i, arr) => arr.findIndex((o) => String(o.tcgPlayerId) === String(c.tcgPlayerId)) === i
    );
    if (distinctTied.length >= 2) {
      siblingAmbiguity = await buildAmbiguityDisclosure(distinctTied, read, requestId, {
        prompt: "Check the set symbol, or the pack or box it came from, to tell these apart.",
        reason: `the card number that was read ("${read.cardNumber}") belongs to ${distinctTied.length} different products, and nothing else on the card separates them`,
        label: "number-tie",
      });
      matchConfidence = "Low";
      matchBasis = "number-tie-ambiguous";
      const tieNote =
        `The card number ("${read.cardNumber}") is used by ${distinctTied.length} different products, so the number cannot tell them apart. ` +
        `All of them are shown below with their own price and bid. ${siblingAmbiguity.prompt}`;
      ambiguousNote = ambiguousNote ? `${ambiguousNote} ${tieNote}` : tieNote;
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] EXACT-NUMBER TIE DISCLOSED: read=${read.cardNumber} -> ${distinctTied
          .map((c) => `${c.name} ${c.number} [${c.setName}] (tcgPlayerId=${c.tcgPlayerId}, market=${c.prices?.market ?? "null"})`)
          .join(" | ")} — capped to Low, no single price`
      );
    }
  }

  // NOTE (2026-08-27): the "read a specific number that matches nothing in
  // the pool at all" check (originally added for the Hitmontop/Crimson
  // Haze case) now runs FIRST, above, before the tie-break check — see the
  // Baxcalibur fix comment near the top of this function for why. This
  // spot intentionally left without a duplicate check.

  // CORRECTED (2026-08-27, user correction): a blanket "Japanese reads are
  // unverified, our data is English-only" caveat + confidence cap USED TO
  // live here. That was based on a wrong root-cause conclusion — see the
  // FIX comment on fetchPokemonPriceTracker above. The real bug was that
  // fetchPokemonPriceTracker never passed PPT's own `language` query
  // parameter, so every "Japanese" scan was silently searching PPT's
  // ENGLISH card database. The user (who specifically pays for PPT's
  // Japanese card data) caught this. Now that the language param is
  // passed correctly, Japanese reads get no special penalty here — they
  // go through the exact same scoring/confidence logic as English reads.
  // Removed rather than left in "just in case," since a blanket caveat
  // that used to fire on every Japanese scan regardless of match quality
  // would now just be noise on what should be normal, accurate matches.

  console.log(`[requestId=${requestId}]`, "[lookup] raw variants object for best match:", JSON.stringify(best._rawVariants).slice(0, 1500));

  // FIX (2026-08-28, feature request — Shadowless dropdown option): see
  // stripShadowlessSuffix/isShadowlessSetName above for the real-log
  // evidence this is based on. PPT models Base Set's Shadowless print run
  // as an entirely separate candidate (same number/hp/attack, different
  // setName — "Base Set (Shadowless)" vs plain "Base Set"), not as an
  // extra key inside one card's `variants` object — and, relevantly here,
  // a DIFFERENT tcgPlayerId/product entirely, so it needs its own live
  // TCGplayer fetch. The scoring/dedup logic above only ever picks ONE of
  // these two as `best`. Rather than trying to detect which one the
  // physical card actually is (the user explicitly asked NOT to add a new
  // Gemini-detected signal for this), just find the sibling candidate
  // (same number, opposite Shadowless status, same underlying set name
  // once the "(Shadowless)" suffix is stripped) among whatever candidates
  // were already fetched and merge its live prices into the same
  // dropdown, tagged so they're never confused with the winning
  // candidate's own prices. This only ever ADDS options; it never changes
  // the default selection below.
  const bestIsShadowless = isShadowlessSetName(best.setName);
  const bestBaseSetName = stripShadowlessSuffix(best.setName);
  const shadowlessSibling = bestBaseSetName
    ? candidates.find(
        (c) =>
          c !== best &&
          isShadowlessSetName(c.setName) !== bestIsShadowless &&
          stripShadowlessSuffix(c.setName) === bestBaseSetName &&
          numbersMatch(best.number, c.number).match
      )
    : null;

  // DECOUPLED (2026-09-10, see docs/test-cases.md test #88): live
  // TCGplayer per-condition pricing used to run inline right here,
  // `await`ed before this function (and therefore the whole /api/identify
  // response) could return — a real, measured problem: a single failing
  // price fetch (2 attempts x TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS) added
  // up to ~5.3s of pure dead time to a response whose identification was
  // otherwise ready in ~1.5s, well inside the 1-3s target. Test #88 ruled
  // out self-inflicted rate-limiting and confirmed TCGplayer itself is
  // fundamentally healthy (direct curls of the exact failing productIds
  // all returned real data) — the blocking architecture, not TCGplayer's
  // reliability, was the actionable finding. So: this function no longer
  // fetches live pricing at all. It returns identification immediately,
  // plus a `pricingLookup` payload carrying everything the separate
  // POST /api/price endpoint needs to do exactly what used to run here
  // (see api/price.js, which requires buildLiveVariantsForCandidate/
  // pickDefaultVariantKey UNCHANGED from this file rather than
  // duplicating them).
  const siblingIsShadowless = shadowlessSibling ? isShadowlessSetName(shadowlessSibling.setName) : null;

  const tcgSearchName = String(best.name).replace(/\s*-\s*\S+\/\S+\s*$/, "").trim();

  const lookupResult = {
    found: true,
    cardName: best.name,
    setName: best.setName,
    cardImageUrl: best.cardImageUrl || null,
    matchConfidence,
    ambiguousNote,
    // ADDED 2026-10-02 (queued item b): machine-readable companion to
    // ambiguousNote — see the matchBasis declaration above.
    matchBasis,
    // ADDED 2026-10-05: see the ATTACK MISMATCH block above. Orthogonal
    // to matchBasis — true means a confidently-read attack name is on
    // none of this printing's attacks, i.e. a positive contradiction,
    // whatever basis the match was made on.
    attackMismatch,
    tcgplayerUrl: best.tcgPlayerUrl || null,
    pricingLookup: {
      tcgPlayerId: best.tcgPlayerId || null,
      tag: bestIsShadowless ? "Shadowless" : null,
      siblingTcgPlayerId: shadowlessSibling ? shadowlessSibling.tcgPlayerId || null : null,
      siblingTag: siblingIsShadowless ? "Shadowless" : null,
      // ADDED (2026-09-17, live scan — Chansey Base Set (Shadowless),
      // user-reported bug): the header (cardName/setName) is fixed at
      // render time from `best` and never updates when the user picks a
      // different print-variant from the price dropdown — so switching
      // to the sibling's (opposite-Shadowless) price left the header
      // still naming the WRONG print run, even though the price itself
      // was correctly updated. `siblingSetName` (a real field already on
      // the sibling candidate, not derived/guessed) lets the extension
      // swap the displayed set name to match whichever side of the
      // Shadowless/non-Shadowless pair is actually selected. Null
      // whenever there's no sibling at all (the ordinary, non-ambiguous
      // case), matching every other sibling-* field here.
      siblingSetName: shadowlessSibling ? shadowlessSibling.setName || null : null,
      stampType: read.stampType,
      primaryPrinting: best.prices?.primaryPrinting ?? null,
      // ADDED 2026-09-13 (liquidity metric): PPT's raw `prices.listings`
      // for the matched candidate — confirmed live (real PPT API queries
      // across ~30 varied cards, including Japanese and low-value promos)
      // to be populated on essentially every real candidate, never the
      // dead-signal case attackName/subtype were before their own fixes.
      // This is a per-card figure from PPT's primaryPrinting record, not
      // tracked per print-variant, so it's shown as-is regardless of which
      // variant the dropdown later selects in api/price.js — an accepted
      // approximation for a supplementary liquidity signal, not the
      // authoritative price itself.
      listingCount: best.prices?.listings ?? null,
    },
    _tcgSearchName: tcgSearchName,
  };

  // SIBLING-DISAGREEMENT CAP (2026-10-15, test #102): withhold the single
  // confident price and hand the panel BOTH printings instead, each with its
  // own ready-to-use pricingLookup so the extension can price them
  // separately. Deliberately a mutation of the assembled result rather than a
  // second literal: every other field (cardName, setName, image,
  // matchConfidence, matchBasis, ambiguousNote, attackMismatch) is already
  // correct for this case and must not drift from the normal shape.
  if (siblingAmbiguity) {
    lookupResult.pricingLookup = null;
    lookupResult.siblingAmbiguity = siblingAmbiguity;
    // ADDED (2026-10-18, test #107): the header must not link ONE of the
    // candidates it just said it cannot choose between. Found in e2e: a
    // Rayquaza tie disclosed both POP Series 1 and Blister Exclusives in the
    // rows while `tcgplayerUrl` still pointed at whichever product PPT's
    // array order put first. Every disclosed row carries its own
    // `tcgplayerUrl`, so nulling the top-level one loses nothing and removes
    // the implied pick. The rescue-path cap already returns
    // `tcgplayerUrl: null` in its own literal; this brings the two
    // score-path cases in line with it.
    lookupResult.tcgplayerUrl = null;
    lookupResult.ambiguousNote = stripBestGuessClause(lookupResult.ambiguousNote);
  }

  // Only a genuine `found: true` result is ever cached — never
  // `notFound`/`error` (rate-limited, card-db-unavailable) responses.
  // Caching a failure would be actively harmful here: a cached
  // rate-limited response would keep telling every request within the
  // TTL "rate limited" even after PPT's own minute window has reset,
  // and a cached notFound could hide a result that a moment's PPT
  // recovery (or a differently-timed fallback chain) would have found.
  // Fire-and-forget via waitUntil — never awaited before responding, so
  // a slow or failing cache write can't add latency or break a real
  // scan (same pattern as the shadow-test logging above).
  if (cacheKey && getCache) {
    try {
      const writePromise = getCache({ namespace: PPT_CACHE_NAMESPACE })
        .set(cacheKey, lookupResult, { ttl: PPT_CACHE_TTL_SECONDS })
        .catch((e) => console.error("[lookup] PPT cache set failed:", e && e.message));
      if (waitUntil) waitUntil(writePromise);
    } catch (e) {
      console.error("[lookup] PPT cache set threw synchronously (non-fatal):", e && e.message);
    }
  }

  return lookupResult;
}

// ---------------------------------------------------------------------------
// Graded slab pricing (Japanese or English) — PokemonPriceTracker w/ eBay comps
// ---------------------------------------------------------------------------

// FIX (2026-10-11, Phase 0c — the graded path could never have worked):
// this function used to read `c.gradedSales || c.ebayComps || c.ebay`.
// The first two field names do not exist in PPT's API and appear nowhere
// in any research in this repo — only on that one line. The real field is
// `card.ebay.salesByGrade`. So `rawComps` always resolved to the `c.ebay`
// WRAPPER object, whose keys are `salesByGrade`/`priceHistory`/
// `salesVelocity`/... and not grades at all; the Object.entries branch
// then produced `{grader:"salesByGrade", grade:null, price:undefined}`,
// `comp.price != null` failed, and the function returned null on every
// call. The graded-with-price render branch has therefore almost
// certainly never executed in production, which is also why neither bug
// fixed here was ever visible.
//
// Verified against a real `includeEbay=true` response (Charizard EX XY29,
// 21 buckets) rather than against PPT's docs, which have been wrong
// before in this project (see the `cardNumber` param story in
// fetchPokemonPriceTracker).
const GRADED_BUCKET_KEY_RE = /^([a-zA-Z]+)(\d+(?:[._]\d+)?)$/;

// PPT's real bucket keys use an UNDERSCORE for half grades — `cgc8_5`,
// `cgc7_5`, `tag6_5`, `bgs9_5` — not a period. The old regex was
// `/^([a-zA-Z]+)\s*(\d+(?:\.\d+)?)$/`, which failed to parse every half
// grade (5 of the 21 real keys on the probe card). That mattered most for
// BGS, whose signature grade IS 9.5. This was new information rather than
// a correction: the existing research recorded these keys only with
// wildcards (`cgc*`, `bgs*`) and whole-grade examples, so the half-grade
// case had simply never been observed.
//
// Returns null for anything that is not a grader+grade bucket — notably
// PPT's `ungraded` key, which is deliberately NOT a graded comp and is
// handled separately (as an explicitly-labeled raw reference) rather than
// being allowed to masquerade as one.
function parseGradedBucketKey(key) {
  const m = GRADED_BUCKET_KEY_RE.exec(String(key));
  if (!m) return null;
  return { grader: m[1].toUpperCase(), grade: m[2].replace("_", ".") };
}

// The vision read transcribes what is printed on the label, which is not
// what PPT keys on: a BGS slab says "BECKETT", and a grade may be read as
// "9.5", "PSA 10" or "Gem Mint 10". Normalize both sides to the same
// {grader, grade} shape before comparing, so a correct read is not thrown
// away over formatting.
const GRADER_ALIASES = {
  PSA: "PSA",
  BGS: "BGS",
  BECKETT: "BGS",
  CGC: "CGC",
  SGC: "SGC",
  TAG: "TAG",
  ACE: "ACE",
};

function normalizeGraderForCompare(grader) {
  if (grader == null) return null;
  const m = /[a-zA-Z]+/.exec(String(grader));
  if (!m) return null;
  const token = m[0].toUpperCase();
  return GRADER_ALIASES[token] || token;
}

function normalizeGradeForCompare(grade) {
  if (grade == null) return null;
  const m = /(\d+(?:[._]\d+)?)/.exec(String(grade));
  if (!m) return null;
  // "10.0" and "10" are the same grade; PPT keys the latter.
  return m[1].replace("_", ".").replace(/\.0$/, "");
}

// PHASE 0d — THIN-DATA GATE.
//
// The reason this is non-negotiable, in one real number: on the probe
// card the `cgc10` bucket is a SINGLE sale at $7,999.95, against a
// `psa10` median of $500.00 across 57 sales. Surfacing that $7,999.95 as
// "graded value" on a 10-second live bid decision is precisely the
// failure mode this whole project is built to avoid. 13 of the 21 real
// buckets on that one card had count <= 2, so thin buckets are the normal
// case, not the exception.
//
// THRESHOLD = 3 recent sales. PPT's bucket `count` is scoped to its own
// ~90-day eBay window (verified: the 21 bucket counts sum to exactly the
// card's `totalSales` of 203, over dateRangeStart 2026-07-11 ->
// dateRangeEnd 2026-10-07), so this reads as "at least 3 sales at this
// exact grade in the last ~90 days". 3 is the lowest threshold that
// eliminates every single-sale bucket (10 of 21 on the probe card) and
// the n=2 buckets that are equally meaningless; it keeps 9 buckets,
// including every one a real slab is likely to be in.
const GRADED_MIN_SALES = 3;

// A bucket whose newest sale predates this is stale even if it cleared
// the count gate. A pure safety net: PPT's own window is ~90 days, so on
// the probe card this excluded nothing that count>=3 had already kept.
const GRADED_MAX_LAST_SALE_AGE_DAYS = 90;

// DELIBERATELY NOT WITHHOLD CONDITIONS — both of these were measured and
// both would have broken the feature rather than protected it:
//
//   - `smartMarketPrice.confidence === "low"` holds for 16 of the 21 real
//     buckets, INCLUDING cgc9 (n=10) and cgc8_5 (n=9). It tracks how far
//     back the smart price had to reach (`daysUsed`), not how trustworthy
//     the median is. Withholding on it would suppress buckets with ~10
//     real sales.
//   - `smartPriceOutlierByGrade[key] === true` is set on psa10 (n=57) and
//     ungraded (n=20) on the probe card — the two single most useful
//     buckets. It flags that the SMART price is outlier-affected, which is
//     exactly why the smart price is not what we show.
//
// Both are carried through as advisory caveats on the displayed figure
// instead, so the user sees the uncertainty without losing the number.
function assessGradedBucket(bucket, outlierFlag, nowMs = Date.now()) {
  if (!bucket || typeof bucket !== "object") return { ok: false, reason: "no-bucket" };

  // medianPrice, NEVER smartMarketPrice/averagePrice/maxPrice. Measured
  // reason, not taste: on the probe card psa10's median is $500.00 while
  // its smartMarketPrice is $1,175.50 (2.35x, outlier-flagged, 14-day
  // window), and `ungraded` reads $19.99 median vs $70.00 smart. The
  // median is the robust statistic here and the smart price is the one
  // that gets dragged by a single high sale. This also corrects the
  // recommendation in the original research write-up, which had suggested
  // preferring smartMarketPrice when its confidence was not "low".
  const price = bucket.medianPrice;
  if (price == null || !(Number(price) > 0)) return { ok: false, reason: "no-price" };

  const count = Number(bucket.count) || 0;
  if (count < GRADED_MIN_SALES) return { ok: false, reason: "too-few-sales", count, price: Number(price) };

  if (bucket.lastSaleDate) {
    const ageDays = (nowMs - new Date(bucket.lastSaleDate).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > GRADED_MAX_LAST_SALE_AGE_DAYS) {
      return { ok: false, reason: "stale", count, price: Number(price), ageDays: Math.round(ageDays) };
    }
  }

  const smart = bucket.smartMarketPrice || {};
  return {
    ok: true,
    price: Number(price),
    count,
    lastSaleDate: bucket.lastSaleDate || null,
    // Advisory only — see the comment block above for why neither of
    // these withholds the price.
    lowConfidence: smart.confidence === "low",
    outlierAffected: outlierFlag === true,
  };
}

// ---------------------------------------------------------------------------
// PHASE 2-LITE — SLAB LABEL PARSING AND LABEL-DRIVEN LOOKUP (2026-10-11)
// ---------------------------------------------------------------------------
//
// Built from the FIRST real slab evidence this project has ever had: five
// PSA slab scans on 2026-10-11 ~18:57Z, three of them the same Zapdos G
// PSA 8 (cert 153791833). Full trace in docs/history.md.
//
// WHAT ACTUALLY FAILED, measured rather than assumed. The working theory
// going in was that the name filter rejects Platinum-era suffix names
// ("Zapdos G"). It does not. PPT stores this card as EXACTLY
// `name: "Zapdos G"`, `cardNumber: "12/99"`, `setName: "Arceus"`
// (tcgPlayerId 90726), so `normalizeNameForMatch` produces "zapdos g" on
// both sides and the filter would have accepted it immediately. The card
// never reached the filter: **PPT's own search ranking does not return it**.
// `search="Zapdos G"` yields 30 other Zapdos cards (Galarian Zapdos V,
// Zapdos ex, Moltres & Zapdos & Articuno GX...) and not this one — the
// trailing "G" token contributes nothing to PPT's relevance ranking. So
// this is a RETRIEVAL failure, and no amount of name normalization fixes
// it. Confirmed by re-running production's exact query.
//
// What does fix it, both verified live against the real API:
//   search="Zapdos G Arceus"  -> exactly 1 result, the right card
//   search="Zapdos G 12/99"   -> exactly 1 result, the right card
//   search="Zapdos G 12"      -> 2 results, both wrong (PPT filler)
//
// The label carries both missing pieces. "2009 POKEMON PLATINUM #12 ZAPDOS
// G-REV.FOIL NM-MT ARCEUS 8 153791833" gives the set word ARCEUS and the
// number #12 — and once the set is known its total (99) completes "12" to
// "12/99", which is what turns a weak bare-number match into an exact one.
// The bare "12" was the second half of the failure: the existing by-number
// rescue searched "Zapdos G 12", got PPT filler, found no exact number
// match, and returned notFound BEFORE control could ever reach the
// setName-scoped rescue further down.
//
// Everything here is gated on a slab read with BOTH grader and grade. It
// cannot touch a raw card.

// PSA prints the set across two places: a brand-ish prefix ("POKEMON
// PLATINUM", "POKEMON SWSH") and the actual set ("ARCEUS", "CROWN
// ZENITH"). PPT drops era prefixes — the set is "Arceus", not "Platinum:
// Arceus" (that query returns 0 results), and "Supreme Victors", not
// "Platinum: Supreme Victors". So the words most likely to be PPT's set
// name are the ones that are NOT era/brand noise.
const SLAB_LABEL_NOISE_WORDS = new Set([
  "POKEMON", "POKÉMON", "TCG", "PSA", "BGS", "BECKETT", "CGC", "SGC", "TAG", "ACE",
  "GEM", "MT", "MINT", "NM", "NMMT", "NM-MT", "EX-MT", "VG", "EX", "GOOD", "PR",
  "AUTHENTIC", "ALTERED", "TRADING", "CARD", "GAME", "JAPANESE", "ENGLISH",
  // Era/brand prefixes PPT does not carry in setName.
  "PLATINUM", "SWSH", "SM", "XY", "BW", "HGSS", "DP", "SV", "EX",
]);

// Printing qualifiers as PSA abbreviates them, mapped onto the printing
// names PPT uses in `printingsAvailable`.
const SLAB_VARIETY_TO_PRINTING = [
  [/\bREV(?:ERSE)?[.\-\s]?FOIL\b|\bREVERSE\s+HOLO(?:FOIL)?\b/i, "Reverse Holofoil"],
  [/\bHOLO(?:FOIL)?\b/i, "Holofoil"],
];

// Stamp-ish label qualifiers. Deliberately returned as a SEPARATE field
// from the printing: per this project's standing rule, a label stamp may
// inform matching but must never silently flip a default printing.
const SLAB_LABEL_STAMPS = [
  [/\b1ST\s*EDITION\b|\b1ST\s*ED\b/i, "1st Edition"],
  [/\bSHADOWLESS\b/i, "Shadowless"],
  [/\bSTAFF\b/i, "Staff"],
  [/\bPRERELEASE\b/i, "Prerelease"],
];

// Parses a PSA/CGC/BGS-style label transcription into structured hints.
// Pure and total: any unparseable field comes back null rather than
// throwing or guessing. Exported for unit testing.
function parseSlabLabel(labelText) {
  if (!labelText || typeof labelText !== "string") return null;
  // Labels arrive either space-separated or newline-separated depending on
  // how the model transcribed them (both shapes were seen on the SAME card
  // within three scans), so normalize whitespace first.
  const text = labelText.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : null;

  // "#12" is the reliable number form on a PSA label. Deliberately NOT
  // falling back to any bare integer: the label also carries a grade, a
  // year and a 8-9 digit cert, and mistaking one of those for a card
  // number would be worse than having no number at all.
  const numMatch = text.match(/#\s*([A-Za-z]{0,3}\d+[A-Za-z]?)(?:\s*\/\s*(\d+))?/);
  const cardNumber = numMatch ? (numMatch[2] ? `${numMatch[1]}/${numMatch[2]}` : numMatch[1]) : null;

  let printing = null;
  for (const [re, name] of SLAB_VARIETY_TO_PRINTING) {
    if (re.test(text)) { printing = name; break; }
  }
  let stamp = null;
  for (const [re, name] of SLAB_LABEL_STAMPS) {
    if (re.test(text)) { stamp = name; break; }
  }

  // Candidate set words: alphabetic tokens that aren't noise, aren't the
  // year, and aren't part of the card name. Kept in label order; the
  // caller tries them most-specific-last first, because PSA writes the
  // era prefix before the set ("POKEMON PLATINUM ... ARCEUS").
  // Split on hyphens as well as spaces. PSA joins the card name to its
  // variety with a hyphen ("ZAPDOS G-REV.FOIL"), so without this the
  // whole thing stays one token, survives both the name and variety
  // filters, and becomes a bogus set phrase — which cost a wasted
  // 30-credit PPT query on the real Zapdos scans before it was fixed.
  const tokens = text.split(/[\s\-]+/);
  const setWords = [];
  for (const rawTok of tokens) {
    const tok = rawTok.replace(/[^A-Za-z&'.]/g, "").trim();
    if (!tok || tok.length < 2) continue;
    const upper = tok.toUpperCase();
    if (SLAB_LABEL_NOISE_WORDS.has(upper)) continue;
    if (/^\d+$/.test(tok)) continue;
    setWords.push(tok);
  }

  return {
    year,
    cardNumber,
    printing,
    stamp,
    setWords,
    raw: text,
  };
}

// Builds the set-name candidate phrases to try, longest/most-specific
// first. For "2009 POKEMON PLATINUM #12 ZAPDOS G-REV.FOIL NM-MT ARCEUS 8"
// with cardName "Zapdos G", the surviving set words are ZAPDOS, G,
// REV.FOIL, ARCEUS -> after dropping the card's own name tokens and the
// variety, "ARCEUS" is what's left, which is exactly PPT's setName.
function slabLabelSetPhrases(label, cardName) {
  if (!label || !Array.isArray(label.setWords)) return [];
  const nameTokens = new Set(
    String(cardName || "")
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-z]/g, "").toUpperCase())
      .filter(Boolean)
  );
  const varietyTokens = new Set([
    "REVFOIL", "REV", "FOIL", "HOLO", "HOLOFOIL", "REVERSE", "FA", "FULLART",
    "REVFOILNMMT", "NMMT", "GEMMT", "SHADOWLESS", "STEDITION", "EDITION", "ST",
  ]);
  const kept = label.setWords.filter((w) => {
    const u = w.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!u) return false;
    if (nameTokens.has(u)) return false;
    if (varietyTokens.has(u)) return false;
    return true;
  });
  if (!kept.length) return [];
  const phrases = [];
  // The whole remaining run, then each single word from the end backwards
  // (PSA writes the specific set after the era prefix).
  if (kept.length > 1) phrases.push(kept.join(" "));
  for (let i = kept.length - 1; i >= 0; i--) phrases.push(kept[i]);
  return [...new Set(phrases)];
}

// One label-driven retrieval attempt. Returns a single candidate or null.
// Guards are the same ones every other rescue in this file uses, for the
// same reasons: name filter, stamp awareness, and EXACTLY ONE distinct
// survivor — see the "DO NOT select a candidate by number alone" rule.
async function lookupCardFromSlabLabel(read, label, requestId) {
  if (!label) return null;
  const searchName = normalizeNameForSearchQuery(read.cardName);
  if (!searchName) return null;

  const phrases = slabLabelSetPhrases(label, read.cardName);
  // The completed-number query is tried FIRST when the label gave a number
  // with a total, since "Zapdos G 12/99" was verified to return exactly the
  // right card on its own.
  const queries = [];
  if (label.cardNumber && label.cardNumber.includes("/")) queries.push(`${searchName} ${label.cardNumber}`);
  for (const p of phrases) queries.push(`${searchName} ${normalizeNameForSearchQuery(p)}`);

  const wantedName = normalizeNameForMatch(read.cardName);
  const labelNum = label.cardNumber ? normalizeNumber(label.cardNumber) : null;

  for (const q of queries.slice(0, SLAB_LABEL_MAX_QUERIES)) {
    console.log(`[requestId=${requestId}]`, `[lookup] SLAB LABEL SEARCH: "${q}"`);
    const res = await fetchPokemonPriceTracker(q, { language: read.language });
    if (res && res.error === "rate-limited") return { error: "rate-limited", retryAfter: res.retryAfter, isDailyLimit: res.isDailyLimit };
    const rows = res && Array.isArray(res.data) ? res.data : [];
    if (!rows.length) continue;

    // `normalizePptCard` deliberately does not carry `printingsAvailable`
    // (it is not a scoring signal and nothing on the raw path reads it),
    // but the label-variety printing selection below needs it to check
    // that a printing the LABEL claims actually exists in the catalog
    // rather than asserting one. Attached here, on this path only, rather
    // than widening normalizePptCard — which is shared with the whole raw
    // matching engine and is deliberately held byte-identical.
    let pool = rows
      .map((raw) => {
        const c = normalizePptCard(raw);
        c.printingsAvailable = Array.isArray(raw.printingsAvailable) ? raw.printingsAvailable : [];
        return c;
      })
      .filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
    if (!pool.length) {
      console.log(`[requestId=${requestId}]`, `[lookup] SLAB LABEL SEARCH: ${rows.length} rows, 0 survived the name filter for "${read.cardName}"`);
      continue;
    }

    // If the label gave a number, require it to match. The label number is
    // the most trustworthy number available on a slab — it is printed flat
    // and horizontal, where the card's own number is small, angled and
    // behind glare. A bare label numerator ("12") is allowed to match a
    // catalog "12/99", which is exactly the completion the old by-number
    // rescue could not do.
    if (labelNum && labelNum.num != null) {
      const byNumber = pool.filter((c) => {
        const cn = normalizeNumber(c.number);
        if (!cn || cn.num == null) return false;
        if (cn.prefix !== labelNum.prefix) return false;
        if (cn.num !== labelNum.num) return false;
        // A label total, when present, must agree.
        if (labelNum.total != null && cn.total != null && labelNum.total !== cn.total) return false;
        return true;
      });
      if (byNumber.length) pool = byNumber;
      else {
        console.log(`[requestId=${requestId}]`, `[lookup] SLAB LABEL SEARCH: no candidate matched label number ${label.cardNumber}`);
        continue;
      }
    }

    pool = filterCandidatesByStampAgreement(pool, read);
    const distinct = distinctByDedupKey(pool);
    if (distinct.length !== 1) {
      console.log(
        `[requestId=${requestId}]`,
        `[lookup] SLAB LABEL SEARCH DECLINED: ${distinct.length} distinct candidates survived (need exactly 1) for "${q}"`
      );
      continue;
    }

    const accepted = distinct[0];
    console.log(
      `[requestId=${requestId}]`,
      `[lookup] SLAB LABEL RESCUE: accepted ${accepted.name} ${accepted.number} (${accepted.setName}, tcgPlayerId=${accepted.tcgPlayerId}) via "${q}"`
    );
    return accepted;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PHASE 3 — GRADED SUGGESTED BID (2026-10-11)
// ---------------------------------------------------------------------------
//
// Same fee model as the raw path, with ONE deliberate difference: shipping.
// `computeBreakEvenMaxBid` uses `assumedSalePrice < 20 ? 0.955 : 5.80`,
// where $0.955 is a plain-envelope rate for a raw card in a sleeve. A slab
// cannot ship that way — it is rigid, ~4-5oz in a bubble mailer, and
// effectively requires tracked shipping. So a sub-$20 slab costed at $0.955
// would be OVER-bid, which is the expensive error direction. Graded
// shipping is therefore flat.
//
// computeBreakEvenMaxBid itself is deliberately NOT modified: it is shared
// with the whole raw pricing path and is held byte-identical. This is a
// parallel function, not a parameterization of that one.
const GRADED_SHIPPING_PER_CARD = 5.8;

function computeGradedBreakEven(gradedMedianPrice) {
  if (gradedMedianPrice == null || !Number.isFinite(gradedMedianPrice)) return null;
  let assumedSalePrice = gradedMedianPrice * LISTING_MARKUP_MULTIPLIER + LISTING_ADD_AMOUNT;
  const tier = LISTING_PRICE_TIERS.find((t) => assumedSalePrice >= t.min && assumedSalePrice <= t.max);
  if (tier) assumedSalePrice = tier.newPrice;
  const fixedFee = assumedSalePrice <= 10 ? 0.3 : 0.4;
  const ebayFee = EBAY_FEE_RATE_ON_LIST_PRICE * assumedSalePrice + fixedFee;
  return {
    listPrice: Math.round(assumedSalePrice * 100) / 100,
    breakEven: Math.round((assumedSalePrice - ebayFee - GRADED_SHIPPING_PER_CARD) * 100) / 100,
  };
}

// Sell-through for a SINGLE graded bucket.
//
// CORRECTION to the obvious implementation (`count / 3`): PPT's eBay
// window is NOT always 90 days. Measured on two real cards the same day —
// Zapdos G 12/99 spans 2026-07-21 -> 2026-10-09 (80 days) while
// Moltres & Zapdos & Articuno GX SM210 spans 2026-03-27 -> 2026-10-10
// (197 days, i.e. ~6.5 months). Dividing a 197-day count by 3 would
// overstate that card's monthly pace by ~2.2x and could push a Slow card
// into Normal, which directly loosens the bid. So the pace is computed
// against the window PPT actually reports, falling back to 90 days only
// when the window is missing or nonsensical.
//
// Tier cutoffs are the raw path's, unchanged, via classifySellThroughTier.
const GRADED_DEFAULT_WINDOW_DAYS = 90;
const DAYS_PER_MONTH = 30.44;

function computeGradedSellThrough(bucketCount, windowStart, windowEnd) {
  if (bucketCount == null || !Number.isFinite(Number(bucketCount))) return null;
  let windowDays = null;
  if (windowStart && windowEnd) {
    const ms = new Date(windowEnd).getTime() - new Date(windowStart).getTime();
    if (Number.isFinite(ms) && ms > 0) windowDays = ms / 86400000;
  }
  if (!windowDays || windowDays < 1) windowDays = GRADED_DEFAULT_WINDOW_DAYS;
  const monthlyPace = Number(bucketCount) / (windowDays / DAYS_PER_MONTH);
  return {
    monthlyPace,
    tier: classifySellThroughTier(monthlyPace),
    totalSold: Number(bucketCount),
    windowDays: Math.round(windowDays),
  };
}

// Full graded bid for one bucket. Returns null unless the bucket already
// passed the thin-data gate — a bid on 1-2 sales is exactly the thing the
// gate exists to prevent, and a bid is a stronger claim than a price.
function computeGradedBidForBucket(verdict, windowStart, windowEnd) {
  if (!verdict || !verdict.ok || verdict.price == null) return null;
  const be = computeGradedBreakEven(verdict.price);
  if (!be || be.breakEven == null) return null;
  const sellThrough = computeGradedSellThrough(verdict.count, windowStart, windowEnd);
  if (!sellThrough) return null;
  const suggestedBid = computeSuggestedBid(be.breakEven, sellThrough.tier);
  return {
    gradedListPrice: be.listPrice,
    gradedBreakEven: be.breakEven,
    gradedSuggestedBid: suggestedBid,
    gradedSellThrough: sellThrough,
  };
}

// PHASE 0a predicate — see the long rationale at its call site in the
// handler. A slab is only treated as a slab when the label yielded a
// grader or a grade; a bare `isSlab` flag with nothing read off the label
// is ignored and the card takes the ordinary raw path.
//
// Note this is deliberately tolerant of the empty string and of
// whitespace-only values: a model that "fills in" grader with "" or " "
// has told us nothing, and must not be allowed to trip the slab branch.
function shouldTreatAsSlab(read) {
  if (!read || read.isSlab !== true) return false;
  const hasGrader = typeof read.grader === "string" && read.grader.trim() !== "";
  const hasGrade = read.grade != null && String(read.grade).trim() !== "";
  return hasGrader || hasGrade;
}

// Fetches ONE card by its TCGplayer id, with eBay/graded data.
//
// Separate from fetchPokemonPriceTracker on purpose: that function is the
// raw path's shared search and is held byte-identical. This is a
// single-card lookup with three behaviours that differ, all confirmed
// against the live API (2026-10-11):
//   1. A `tcgPlayerId` query returns `data` as a SINGLE OBJECT, not an
//      array. The array-shaped guard used everywhere else yields an empty
//      pool for it.
//   2. Japanese cards need `language=japanese`, or the query returns 0
//      rows (the default pool is English) — Mega Dragonite ex 232/193
//      returns nothing without it.
//   3. `limit=1` costs 2 credits with includeEbay, against 60 for the
//      limit=30 name search this replaces: 30x cheaper AND correct.
async function fetchPptCardByTcgPlayerId(tcgPlayerId, language) {
  if (tcgPlayerId == null || String(tcgPlayerId).trim() === "") return null;
  const params = new URLSearchParams({
    tcgPlayerId: String(tcgPlayerId),
    limit: "1",
    includeEbay: "true",
  });
  if (String(language).toLowerCase() === "japanese") params.set("language", "japanese");
  const url = `${PPT_BASE_URL}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${process.env.POKEMONPRICETRACKER_API_KEY}` };

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    console.error("[lookup] graded by-id request threw:", e && e.message, "- retrying once");
    try {
      resp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
    } catch (eRetry) {
      console.error("[lookup] graded by-id retry also threw:", eRetry && eRetry.message);
      return null;
    }
  }

  if (!resp.ok) {
    if (resp.status === 429) {
      const body = await resp.text().catch(() => "");
      const isDailyLimit = /daily/i.test(body);
      console.error("[lookup] graded by-id RATE LIMITED:", body.slice(0, 200));
      return { error: "rate-limited", isDailyLimit };
    }
    console.error("[lookup] graded by-id FAILED - status=", resp.status, "tcgPlayerId=", tcgPlayerId);
    return null;
  }

  const json = await resp.json().catch(() => null);
  if (!json) return null;
  const d = json.data;
  if (!d) return null;
  if (Array.isArray(d)) return d.length ? d[0] : null;
  return d;
}

// FIX (2026-10-11) - THE GRADED LOOKUP NOW USES THE MATCHED CARD ONLY.
//
// What this replaces, and why. The previous implementation ran its OWN
// search on `read.cardName`, filtered by a NAME SUBSTRING only (no card
// number, no setName, no uniqueness rule), and returned the FIRST card in
// PPT's array order that happened to have a bucket for the scanned
// grader+grade. It never received the tcgPlayerId that lookupCardPPT had
// already matched. Two real production scans show what that cost:
//
//   Mega Dragonite ex 232/193 CGC 10 (requestId d6e8d6e9, 21:58Z) matched
//   correctly as tcgPlayerId 665895 (raw NM $14.27, bestScore 40,
//   tieCount 1). The panel showed CGC 10 $348 / bid $180.36. Every
//   displayed figure belonged to sibling 665921 (250/193 MUR, raw
//   $192.43) - CGC 8.5 n=2 $144, CGC 9 $231.50, CGC 10 n=15 $348, all
//   byte-identical. 665895's OWN data is correct and plausible: CGC 10
//   $40.00 on n=527, CGC 9 $16.20, CGC 8.5 $11.90, matching the real
//   market. The siblings simply sorted first.
//
//   Toxtricity 109/103 CGC 10 (tcgPlayerId 716911) has
//   `salesByGrade: {}` and totalSales 0 - PPT has NO graded data for it.
//   The "$24.99" shown came from Toxtricity VMAX 315/190 (571238), a
//   different card and a different card TYPE, which passed the filter
//   only because its name contains "toxtricity".
//
// SM210 was right purely by luck of array order; had the Hidden Fates
// 44/68 printing been scanned, it would have been shown SM210's $155.20
// against its own real $54.97.
//
// So: no name search, and no fallback to one. Graded data comes from the
// matched card's own record or not at all. `matchedCard` carries the
// tcgPlayerId and number that lookupCardPPT (or the slab-label path)
// already established.
async function lookupGradedPrice(read, matchedCard) {
  const wantGrader = normalizeGraderForCompare(read.grader);
  const wantGrade = normalizeGradeForCompare(read.grade);
  if (!wantGrader || !wantGrade) return null;

  // No identified card means no graded price. There is deliberately no
  // fallback here: a graded figure attached to a card we could not
  // identify is exactly the error this fix exists to remove.
  const wantId = matchedCard && matchedCard.tcgPlayerId != null ? String(matchedCard.tcgPlayerId) : null;
  if (!wantId) return null;

  const card = await fetchPptCardByTcgPlayerId(wantId, read.language);
  if (!card) return null;
  if (card.error === "rate-limited") return { error: "rate-limited", isDailyLimit: card.isDailyLimit };

  // Identity verification. PPT should only ever return the id we asked
  // for, but this is the exact invariant the bug violated, so it is
  // checked rather than assumed.
  const gotId = card.tcgPlayerId != null ? String(card.tcgPlayerId) : null;
  if (gotId !== wantId) {
    console.error(
      `[lookup] GRADED ID MISMATCH: asked for tcgPlayerId=${wantId}, PPT returned ${gotId} (${card.name}) - refusing to price`
    );
    return null;
  }
  // Number cross-check. lookupCardPPT's result object does not carry the
  // winning candidate's number, so fall back to the vision read's own
  // number - which is arguably the stronger check anyway, since it
  // validates the priced card against what was physically read off the
  // slab rather than against another derived value.
  const expectNumber = matchedCard.number || read.cardNumber || null;
  if (expectNumber && card.cardNumber && !numbersMatch(expectNumber, card.cardNumber).match) {
    console.error(
      `[lookup] GRADED NUMBER MISMATCH: expected ${expectNumber} but tcgPlayerId=${wantId} is ${card.cardNumber} - refusing to price`
    );
    return null;
  }

  const salesByGrade = card.ebay && card.ebay.salesByGrade;
  if (!salesByGrade || typeof salesByGrade !== "object" || !Object.keys(salesByGrade).length) {
    console.log(`[lookup] no graded sales at all for tcgPlayerId=${wantId} (${card.name})`);
    return null;
  }
  const outliers = (card.ebay && card.ebay.smartPriceOutlierByGrade) || {};

  const comps = [];
  for (const [key, bucket] of Object.entries(salesByGrade)) {
    const parsed = parseGradedBucketKey(key);
    if (!parsed) continue;
    comps.push({ key, ...parsed, bucket, outlier: outliers[key] === true });
  }

  // LOG-ONLY SANITY TRIPWIRE (2026-10-11). A card graded 9 or below is a
  // played-to-near-mint copy and should not trade far above raw NM, so a
  // large multiple hints that a bucket may not belong to this card.
  // DELIBERATELY LOG-ONLY, gating nothing: measured against real data it
  // has no false positives on the cards checked so far, but it also
  // MISSES the Toxtricity case (2.3x), and vintage cards legitimately run
  // high - Zapdos G 12/99's own correct PSA 7 is 2.2x and PSA 8 is 2.7x
  // raw. A ratio cap on grade 10 is unusable outright: that same card's
  // own correct PSA 10 is $1,999.99 against raw $18.46, i.e. 108x. Real
  // traffic first, before this ever suppresses anything.
  // Raw NM from the RETURNED card: it is the matched card by construction
  // (ids verified equal above), so this works on both call paths without
  // depending on what the caller happened to carry.
  const rawNm = card.prices && card.prices.market != null ? Number(card.prices.market) : null;
  if (rawNm && rawNm > 0) {
    for (const x of comps) {
      const gradeNum = parseFloat(x.grade);
      const med = x.bucket && x.bucket.medianPrice != null ? Number(x.bucket.medianPrice) : null;
      if (!Number.isFinite(gradeNum) || gradeNum > 9 || med == null) continue;
      const ratio = med / rawNm;
      if (ratio > GRADED_SANITY_LOW_GRADE_RATIO) {
        console.log(
          `[lookup] GRADED SANITY TRIPWIRE (log only, nothing suppressed): tcgPlayerId=${wantId} ${card.name} ` +
            `${x.grader} ${x.grade} median=$${med} vs rawNM=$${rawNm} ratio=${ratio.toFixed(1)}x ` +
            `threshold=${GRADED_SANITY_LOW_GRADE_RATIO}x n=${x.bucket.count}`
        );
      }
    }
  }

  const exact = comps.find((x) => x.grader === wantGrader && x.grade === wantGrade);
  if (!exact) {
    console.log(`[lookup] no ${wantGrader} ${wantGrade} bucket for tcgPlayerId=${wantId} (${card.name})`);
    return null;
  }

  const verdict = assessGradedBucket(exact.bucket, exact.outlier);
  if (!verdict.ok) {
    return {
      gradedPrice: null,
      gradedThin: true,
      gradedThinReason: verdict.reason,
      gradedSampleCount: verdict.count ?? 0,
      grader: wantGrader,
      grade: wantGrade,
    };
  }

  const gradedBid = computeGradedBidForBucket(verdict, card.ebay.dateRangeStart, card.ebay.dateRangeEnd) || {};

  return {
    gradedPrice: verdict.price,
    gradedSampleCount: verdict.count,
    gradedLastSaleDate: verdict.lastSaleDate,
    gradedLowConfidence: verdict.lowConfidence,
    gradedOutlierAffected: verdict.outlierAffected,
    gradedWindowStart: card.ebay.dateRangeStart || null,
    gradedWindowEnd: card.ebay.dateRangeEnd || null,
    ...gradedBid,
    grader: wantGrader,
    grade: wantGrade,
    nearbyGradedPrices: comps
      .filter((x) => x !== exact && x.bucket && x.bucket.medianPrice != null)
      .sort((a, b) => Number(b.bucket.count || 0) - Number(a.bucket.count || 0))
      .slice(0, 5)
      .map((x) => ({
        label: `${x.grader} ${x.grade}`,
        price: Number(x.bucket.medianPrice),
        count: Number(x.bucket.count) || 0,
      })),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handler(req, res) {
  withCors(res);

  // FLAG FEATURE (2026-09-04, see CLAUDE.md): every request gets a short
  // unique id, included in the JSON response (`requestId`) and in every
  // [identify]/[lookup] log line below, so a specific scan can be traced
  // end-to-end by this id alone — no more finding the right Vercel log
  // window by matching timestamps or card names against a screenshot (see
  // the Wailord/Dragalge mix-up, test #70, that this replaces). The
  // extension keeps this id alongside the response it renders and sends it
  // back unchanged to POST /api/flag if the user flags the result.
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // DEBUG (2026-08-31): deploy-verification endpoint. Added specifically
  // because (a) no Vercel MCP tool can fetch deployed source for a byte
  // diff against local — a real, repeated gap noted in CLAUDE.md's
  // "Known gotchas" — and (b) the manual chunk-based deploy of this exact
  // file hit the SAME diacritic-stripping regex transcription corruption
  // twice in a row during the rarity-signal deploy (see
  // test #6x in test-cases.md), with no way at the time to confirm the
  // third (final) attempt didn't repeat it. `sourceHash` lets any future
  // deploy be verified with a one-line comparison against `shasum -a 1
  // api/identify.js` run locally before deploying, instead of hoping.
  // `normalizeDiacriticTest` runs the ACTUAL deployed normalizeNameForMatch
  // on a fixed known input, so a corrupted diacritic-stripping regex is
  // directly and permanently observable via a plain GET request instead
  // of staying an open question until a Pokémon Collector-style card
  // happens to come up live on stream. The real extension only ever
  // POSTs an image — GET is never used by real user traffic, so this
  // carries zero behavioral risk to production scans.
  if (req.method === "GET") {
    let sourceHash = null;
    try {
      const crypto = require("crypto");
      const fs = require("fs");
      sourceHash = crypto.createHash("sha1").update(fs.readFileSync(__filename)).digest("hex");
    } catch (e) {
      sourceHash = null;
    }
    res.status(200).json({
      ok: true,
      sourceHash,
      // ADDED 2026-10-11: makes the Phase 1 probe's deployed state
      // directly observable, the same way sourceHash makes the deployed
      // source observable. Env vars are snapshotted at build time on
      // Vercel, so "is the probe actually off on production?" is otherwise
      // unanswerable without waiting for a real scan to log it.
      slabLabelProbe: SLAB_LABEL_PROBE_ENABLED ? "on" : "off",
      // Correct value MUST be exactly "pokemon collector" (diacritic
      // stripped, lowercased, punctuation normalized to spaces, trimmed).
      // If this ever shows "pok mon collector" or literal combining-mark
      // characters instead, the diacritic-stripping regex got corrupted in
      // transit during deploy — the same failure class as test #6x.
      normalizeDiacriticTest: normalizeNameForMatch("Pokémon Collector"),
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed", requestId });
    return;
  }

  // TIMING (added 2026-08-27): real end-to-end latency has never been
  // measured against the 2-5s target — every prior "speed pass" tuned
  // timeout ceilings, not actual response time. Log + return real
  // wall-clock splits so this can finally be checked from real scans
  // instead of guessed at.
  const tStart = Date.now();

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    res.status(400).json({ error: "Missing imageBase64", requestId });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY not configured", requestId });
    return;
  }

  const geminiPromise = identifyWithGemini(imageBase64, geminiKey);

  // See the big comment block above ("CLAUDE HAIKU 4.5 — SHADOW-TEST
  // LOGGING + ACTIVE FALLBACK") for the full story. Entirely gated on
  // ANTHROPIC_API_KEY: a complete no-op for anyone without that key set
  // (no extra call, no extra cost, no extra latency, no behavior change —
  // Gemini-only, same as before 2026-09-03).
  //
  // haikuPromise is fired here, in parallel with geminiPromise, whether or
  // not Gemini ends up failing — this is what keeps a fallback response
  // bounded by max(geminiMs, haikuMs) instead of additive (see the comment
  // block above for the full latency reasoning). tHaikuStart is captured
  // here too so both the fallback path below and the shadow-test logger
  // measure from the same real start time.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tHaikuStart = Date.now();
  const haikuPromise = anthropicKey ? identifyWithHaiku(imageBase64, anthropicKey) : null;

  // Shadow-test comparison logging: fires in the background regardless of
  // outcome (including when Haiku ends up used as the real fallback below —
  // that's still a valid, interesting comparison data point). Awaits the
  // SAME geminiPromise/haikuPromise the code below uses, so this never
  // triggers a second Haiku API call. Not awaited here so it can never
  // delay the response; waitUntil (when available) keeps it alive after
  // the response is sent, and the .catch() is a second safety net so a bug
  // in the logger itself can never throw into the real request path.
  if (anthropicKey) {
    const shadowPromise = runHaikuShadowTest(geminiPromise, haikuPromise, tStart, tHaikuStart).catch((e) => {
      console.error("[haiku-shadow-test] shadow test itself threw:", e && e.message);
    });
    if (waitUntil) waitUntil(shadowPromise);
  }

  // See "LEGACY-MODEL REGRESSION SHADOW TEST — GEMINI 3.6 FLASH VS
  // CURRENT MODEL" above for the full story. Entirely gated on
  // LEGACY_GEMINI_SHADOW_MODEL — a complete no-op unless that env var is
  // explicitly set. timePromise() subscribes to geminiPromise here (a
  // promise can have any number of .then() subscribers without affecting
  // what the main handler below sees or does — this never fires a second
  // real Gemini call and never touches the response), so its own
  // success/failure and elapsed time is captured independently of
  // whether the legacy model's call is faster or slower. Not awaited
  // here, so it can never delay the response; waitUntil (when available)
  // keeps it alive after the response is sent, and the .catch() is a
  // second safety net.
  // ADDED (2026-09-26, Medicham misidentification investigation — see
  // CLAUDE.md's "print variant misdetection" entry): `legacyReadPromise` is
  // hoisted to function scope, unlike the shadow-test-only locals below, so
  // lookupCardPPT can use it later as a rescue signal (see the "NO NUMBER
  // MATCH IN POOL" handling there). This is the SAME already-in-flight
  // call the shadow-test logging below uses — not a second Gemini call, no
  // added cost. Stays null (a complete no-op for the rescue) whenever
  // LEGACY_GEMINI_SHADOW_MODEL isn't set, exactly like the shadow test
  // itself.
  let legacyReadPromise = null;
  if (LEGACY_GEMINI_SHADOW_MODEL) {
    const timedCurrentPromise = timePromise(geminiPromise, tStart);
    const tLegacyStart = Date.now();
    // PHASE 1 SLAB-LABEL PROBE (2026-10-11): the legacy shadow call — and
    // ONLY the legacy shadow call — gets the label-reading prompt/schema.
    // The primary Gemini prompt and the Haiku prompt are deliberately
    // untouched. See LEGACY_LABEL_PROBE_PROMPT above for the full
    // rationale and the honestly-flagged caveat about this read also
    // feeding three production rescue paths.
    // `undefined` when the probe is switched off, so identifyWithGemini's
    // own `= {}` default kicks in and prompt/schema fall back to
    // GEMINI_PROMPT/GEMINI_SCHEMA — a byte-identical request body to the
    // one this call site built before the probe existed.
    const legacyShadowOptions = SLAB_LABEL_PROBE_ENABLED
      ? { prompt: LEGACY_LABEL_PROBE_PROMPT, schema: LEGACY_LABEL_PROBE_SCHEMA }
      : undefined;
    const legacyPromise = identifyWithGemini(imageBase64, geminiKey, LEGACY_GEMINI_SHADOW_MODEL, legacyShadowOptions);
    legacyReadPromise = legacyPromise;
    const timedLegacyPromise = timePromise(legacyPromise, tLegacyStart);
    const legacyShadowPromise = runLegacyModelShadowTest(timedCurrentPromise, timedLegacyPromise, requestId).catch((e) => {
      console.error(`[legacy-model-shadow-test] requestId=${requestId} shadow test itself threw:`, e && e.message);
    });
    if (waitUntil) waitUntil(legacyShadowPromise);
  }

  let read;
  let visionProvider = "gemini";
  try {
    read = await geminiPromise;
    console.log(`[identify] requestId=${requestId} Gemini read:`, JSON.stringify(read));
  } catch (e) {
    const geminiErrorMsg = (e && e.message) || String(e);
    console.error(`[identify] requestId=${requestId} Gemini call failed:`, geminiErrorMsg, "after ms=", Date.now() - tStart);

    // FALLBACK (2026-09-03): Gemini's call itself failed (timeout, 5xx,
    // unparseable response, etc.) — if we have a Haiku key, haikuPromise is
    // already in flight (fired above, in parallel with Gemini, not started
    // just now), so awaiting it here adds at most the remaining slice of
    // max(GEMINI_TIMEOUT_MS, HAIKU_TIMEOUT_MS), not a second full timeout.
    if (haikuPromise) {
      let haikuResult = null;
      let haikuErrorMsg = null;
      try {
        haikuResult = await haikuPromise;
      } catch (he) {
        haikuErrorMsg = (he && he.message) || String(he);
      }

      if (haikuResult && haikuResult.found && haikuResult.cardName) {
        console.log(`[identify] requestId=${requestId} Gemini failed — using Haiku fallback read:`, JSON.stringify(haikuResult));
        read = haikuResult;
        visionProvider = "haiku-fallback";
      } else {
        console.error(
          `[identify] requestId=${requestId} Gemini failed and Haiku fallback unavailable too:`,
          haikuErrorMsg || "Haiku returned found:false or no cardName"
        );
        res.status(200).json({
          found: false,
          error: "gemini-failed",
          detail: geminiErrorMsg,
          haikuFallbackError: haikuErrorMsg || "Haiku fallback also did not identify a card",
          requestId,
        });
        return;
      }
    } else {
      // No ANTHROPIC_API_KEY — degrade to the exact pre-fallback behavior.
      res.status(200).json({ found: false, error: "gemini-failed", detail: geminiErrorMsg, requestId });
      return;
    }
  }

  const tGemini = Date.now();
  console.log(`[timing] requestId=${requestId} gemini ms=`, tGemini - tStart);

  // Cost estimate must key off whichever provider actually produced `read`
  // — a Haiku-fallback read carries `_haikuUsage`, not `_geminiUsage`, and
  // estimateGeminiCostUsd would silently return null (no cost shown) for
  // it otherwise.
  const usage = visionProvider === "haiku-fallback" ? estimateHaikuCostUsd(read._haikuUsage) : estimateGeminiCostUsd(read._geminiUsage);

  if (!read.found || !read.cardName) {
    res.status(200).json({ found: false, reason: read.reason || "Couldn't identify the card. Try again when it's clearly visible.", usage, requestId });
    return;
  }

  let result;
  // PHASE 0a (2026-10-11) — IGNORE A BARE isSlab FLAG.
  //
  // `isSlab` alone is not yet a trustworthy signal, and acting on it costs
  // real raw-card scans. Measured across 73 consecutive real scans with
  // all three models on the byte-identical prompt: both Gemini models
  // fired isSlab on 0 of ~142 found reads, while Haiku fired it on 39 of
  // 73 (53%) — on the same frames, during what the card names show was a
  // modern Trainer-singles run. 31 of those 39 Haiku reasons explicitly
  // claim a slab/case/holder, so it believes it sees one; glare is not the
  // discriminator (mentioned in 37/39 slab-true AND 33/34 slab-false
  // reasons alike). The pre-existing suspicion is already on record in
  // docs/test-cases.md ("Haiku over-calling a sleeve/toploader as a
  // slab").
  //
  // Haiku is an ACTIVE fallback whenever Gemini throws, so a bare isSlab
  // flag was routing real raw-card scans onto the slab branch — where they
  // got a scary warning, no price at all, and a wasted 60-credit PPT call.
  // Sized honestly against the CURRENT primary's own measured failure
  // rate (gemini-3.5-flash-lite: 3.8% in test #85, 5.6% in test #86, 1.4%
  // in the 2026-10-07 window) times the 37-of-39 share of Haiku slab
  // reads that carry no label at all, that is roughly 0.7-2.8% of all
  // scans. NOT the 14-17% an earlier draft of this reasoning used — that
  // figure is the OLD primary's baseline (gemini-3.6-flash, tests
  // #70/#71/#76), and that model is now the legacy SHADOW, not the
  // primary. Small, but it is pure loss: these are ordinary raw cards that
  // already had a perfectly good price available.
  //
  // A slab we cannot read the label of is, for
  // every purpose this extension has, just a card: the raw path gives a
  // genuine price and the correct error direction (a raw price UNDER-values
  // a slab, and underbidding costs nothing — the project's own standing
  // reasoning).
  //
  // So: a slab is only treated as a slab when the label gave us something.
  // Requiring grader OR grade (not both) keeps a partial label useful —
  // the graded FETCH separately requires both (Phase 0b below).
  //
  // Extracted as shouldTreatAsSlab (exported) so this decision can be
  // replayed directly against real logged reads in the test harness
  // instead of being re-implemented there.
  const slabHasLabel = shouldTreatAsSlab(read);
  if (read.isSlab && !slabHasLabel) {
    console.log(
      `[identify] requestId=${requestId} SLAB FLAG IGNORED: no grader/grade — treating as raw card.`,
      "visionProvider=",
      visionProvider,
      "cardName=",
      read.cardName,
      "certNumber=",
      read.certNumber
    );
  }

  if (slabHasLabel) {
    // PHASE 0b: only fetch graded comps when BOTH grader and grade are
    // present — lookupGradedPrice can only ever match an exact
    // grader+grade bucket, so without both it is a guaranteed-useless
    // call that still costs 60 PPT credits (limit=30 doubled by
    // includeEbay). It also no longer blocks lookupCardPPT: the two are
    // independent PPT reads and were being awaited one after the other,
    // adding a full extra round-trip to the slowest path in the app.
    // Uses the same normalizers lookupGradedPrice itself guards on, so a
    // whitespace-only or non-numeric label read is recognized as "no
    // usable label" here rather than buying a 60-credit PPT call that the
    // function would then reject anyway.
    const canFetchGraded = !!(normalizeGraderForCompare(read.grader) && normalizeGradeForCompare(read.grade));
    // CHANGED 2026-10-11: the graded fetch is now SEQUENTIAL, after
    // identification, instead of running in parallel with it. It has to
    // be: graded data is now looked up by the matched card's own
    // tcgPlayerId, which does not exist until lookupCardPPT (or the
    // slab-label path below) has finished. Correctness over speed - the
    // parallel version was fast because it was guessing, and on real
    // scans it priced the wrong card (see lookupGradedPrice's comment).
    //
    // The cost is bounded and small: the by-id call is `limit=1`, far
    // lighter than the limit=30 name search it replaces, and it only runs
    // on a slab whose label gave both grader and grade.
    //
    // The `.catch` on the base lookup closes a pre-existing asymmetry
    // rather than changing intended behaviour: the raw branch below has
    // always wrapped lookupCardPPT in a try/catch, but the slab branch
    // awaited it bare, so a throw there became an unhandled rejection and
    // a 500 on the one path that already shows the least. A throw now
    // degrades to the same `{found:true, cardName}` fallback that a
    // non-found baseLookup has always produced here — the slab badge and
    // the honest "no graded price" message still render.
    const tGradedStart = Date.now();
    const baseLookup = await lookupCardPPT(read, requestId, legacyReadPromise).catch((e) => {
      console.error(`[identify] requestId=${requestId} slab-path base lookup threw:`, e && e.message);
      return null;
    });

    if (!canFetchGraded) {
      console.log(
        `[identify] requestId=${requestId} GRADED FETCH SKIPPED: partial label (grader=${read.grader} grade=${read.grade}) — saved one includeEbay PPT call.`
      );
    }

    // PHASE 2-LITE (2026-10-11): the ordinary lookup failed to identify the
    // card in this slab, so fall back to the LABEL. See
    // lookupCardFromSlabLabel above for the measured reason this exists —
    // the Zapdos G PSA 8 failure was PPT retrieval, not name matching, and
    // the label carries the two things that fix it (the set word and a
    // number that can be completed with the set total).
    //
    // Deliberately only on a FAILED slab lookup: a slab the normal path
    // already identified is left completely alone, so this cannot regress
    // a working scan, and it costs nothing on the common path.
    let slabLabel = null;
    let slabLabelRescued = null;
    const baseFailed = !baseLookup || !baseLookup.found;
    if (baseFailed && legacyReadPromise) {
      let labelTimer = null;
      try {
        // Capped race, never a bare await — same pattern and same reason
        // as LEGACY_SETNAME_HINT_TIMEOUT_MS.
        const timeoutPromise = new Promise((resolve) => {
          labelTimer = setTimeout(() => resolve({ __labelTimedOut: true }), SLAB_LABEL_WAIT_MS);
        });
        const legacyRead = await Promise.race([legacyReadPromise.catch(() => null), timeoutPromise]);
        if (legacyRead && legacyRead.__labelTimedOut) {
          console.log(`[identify] requestId=${requestId} slab labelText not ready within ${SLAB_LABEL_WAIT_MS}ms — continuing without it`);
        } else if (legacyRead && legacyRead.labelText) {
          slabLabel = parseSlabLabel(legacyRead.labelText);
          if (slabLabel) {
            console.log(
              `[identify] requestId=${requestId} SLAB LABEL PARSED:`,
              "number=", slabLabel.cardNumber,
              "printing=", slabLabel.printing,
              "stamp=", slabLabel.stamp,
              "year=", slabLabel.year,
              "setWords=", JSON.stringify(slabLabel.setWords)
            );
          }
        }
      } catch (e) {
        console.error(`[identify] requestId=${requestId} slab label unavailable (treating as absent):`, e && e.message);
      } finally {
        if (labelTimer) clearTimeout(labelTimer);
      }

      if (slabLabel) {
        try {
          const found = await lookupCardFromSlabLabel(read, slabLabel, requestId);
          if (found && !found.error) slabLabelRescued = found;
        } catch (e) {
          console.error(`[identify] requestId=${requestId} slab label lookup threw (non-fatal):`, e && e.message);
        }
      }
    }

    // PHASE 0e: spread `baseLookup` FIRST on both paths, exactly as the
    // fallback path already did. The old graded-with-price path rebuilt
    // this object field-by-field and so silently dropped `ambiguousNote`,
    // `attackMismatch`, `matchBasis`, `pricingLookup`, `listingCount` and
    // `printingUndetermined` — meaning a graded slab could show a
    // confident dollar figure with every uncertainty disclosure
    // suppressed, including the attack-mismatch cap (which reaches the
    // user only by being appended to ambiguousNote). That inverted this
    // project's core design principle on the one path where a wrong
    // number is most expensive. It also stops defaulting matchConfidence
    // to "Medium", which was quietly upgrading an unmatched slab.
    // PHASE 2-LITE: a label-rescued candidate becomes the identification
    // when the ordinary lookup found nothing. Capped at Medium, exactly
    // like every other rescue path in this file — the label is strong
    // evidence but it is still one model's transcription of small text,
    // and `matchBasis` records how the match was actually made.
    let slabIdentity = null;
    if (slabLabelRescued) {
      // PHASE 2-LITE (c): the label's variety picks the printing. PSA
      // prints "REV.FOIL" for a reverse holo, and PPT exposes the real
      // printing list per card, so this selects among printings the
      // catalog actually has rather than asserting one. Falls back to the
      // catalog's own primaryPrinting when the label said nothing — never
      // a guess, and never an auto-flip on a vision read of the CARD (the
      // standing rule); this is the printed label, a different and much
      // stronger signal.
      const available = Array.isArray(slabLabelRescued.printingsAvailable) ? slabLabelRescued.printingsAvailable : [];
      const labelPrinting = slabLabel && slabLabel.printing && available.includes(slabLabel.printing) ? slabLabel.printing : null;
      if (slabLabel && slabLabel.printing && !labelPrinting) {
        console.log(
          `[identify] requestId=${requestId} SLAB LABEL PRINTING "${slabLabel.printing}" not in catalog printings ${JSON.stringify(available)} — falling back to primaryPrinting`
        );
      }
      const chosenPrinting = labelPrinting || slabLabelRescued.prices?.primaryPrinting || null;
      console.log(
        `[identify] requestId=${requestId} SLAB LABEL IDENTIFIED: ${slabLabelRescued.name} ${slabLabelRescued.number} (${slabLabelRescued.setName}) printing=${chosenPrinting}${
          labelPrinting ? " (from label variety)" : " (catalog default)"
        }`
      );
      slabIdentity = {
        found: true,
        cardName: slabLabelRescued.name,
        setName: slabLabelRescued.setName,
        cardImageUrl: slabLabelRescued.cardImageUrl || null,
        matchConfidence: "Medium",
        matchBasis: "slab-label",
        ambiguousNote: null,
        attackMismatch: false,
        tcgplayerUrl: slabLabelRescued.tcgPlayerUrl || null,
        pricingLookup: {
          tcgPlayerId: slabLabelRescued.tcgPlayerId || null,
          tag: null,
          siblingTcgPlayerId: null,
          siblingTag: null,
          siblingSetName: null,
          stampType: read.stampType,
          primaryPrinting: chosenPrinting,
          listingCount: slabLabelRescued.prices?.listings ?? null,
        },
      };
    }

    const slabBase = {
      ...(baseLookup && baseLookup.found ? baseLookup : slabIdentity || { found: true, cardName: read.cardName }),
      cardLanguage: read.language,
      confidence: read.confidence,
      isSlab: true,
      grader: read.grader,
      grade: read.grade,
      certNumber: read.certNumber,
      // PHASE 2-LITE (d): lets the panel distinguish "we never identified
      // the card in this slab" from "we identified it but the graded
      // bucket is too thin" — two very different things that previously
      // shared one misleading message about graded sales.
      slabCardIdentified: !!((baseLookup && baseLookup.found) || slabIdentity),
      // PHASE 3: label variety/stamp for the panel's badge line. Shown as
      // what the LABEL says, never used to override a printing the
      // catalog does not list (that check lives in the printing selection
      // above).
      slabLabelPrinting: slabLabel ? slabLabel.printing : null,
      slabLabelStamp: slabLabel ? slabLabel.stamp : null,
    };

    // GRADED FETCH (2026-10-11): runs here, after identification, against
    // the card we actually matched - from the ordinary lookup or, when
    // that failed, from the slab-label path. No matched card means no
    // graded price, full stop.
    //
    // `matchedCard` is built from whichever path won. The slab-label path
    // yields a full normalized candidate (number and prices included);
    // lookupCardPPT's result object carries only the tcgPlayerId, which is
    // enough - lookupGradedPrice falls back to the vision read's number
    // for the cross-check and reads raw NM off the card PPT returns.
    const matchedCard = slabLabelRescued
      ? { tcgPlayerId: slabLabelRescued.tcgPlayerId, number: slabLabelRescued.number, prices: slabLabelRescued.prices }
      : baseLookup && baseLookup.found && baseLookup.pricingLookup
      ? { tcgPlayerId: baseLookup.pricingLookup.tcgPlayerId, number: null, prices: null }
      : null;

    let gradedResult = null;
    if (canFetchGraded && matchedCard && matchedCard.tcgPlayerId) {
      try {
        gradedResult = await lookupGradedPrice(read, matchedCard);
      } catch (e) {
        console.error(`[identify] requestId=${requestId} graded lookup threw:`, e && e.message);
        gradedResult = null;
      }
      console.log(
        `[identify] requestId=${requestId} GRADED LOOKUP by tcgPlayerId=${matchedCard.tcgPlayerId} took ${
          Date.now() - tGradedStart
        }ms total (identification + graded)`
      );
    } else if (canFetchGraded) {
      console.log(
        `[identify] requestId=${requestId} GRADED FETCH SKIPPED: no card matched, so there is nothing to price graded sales against.`
      );
    }
    if (gradedResult && gradedResult.error === "rate-limited") gradedResult = null;

    if (gradedResult && gradedResult.gradedPrice != null) {
      result = {
        ...slabBase,
        gradedPrice: gradedResult.gradedPrice,
        gradedSampleCount: gradedResult.gradedSampleCount,
        gradedLastSaleDate: gradedResult.gradedLastSaleDate,
        gradedLowConfidence: gradedResult.gradedLowConfidence,
        gradedOutlierAffected: gradedResult.gradedOutlierAffected,
        nearbyGradedPrices: gradedResult.nearbyGradedPrices,
        // PHASE 3: a graded bid is only ever attached when the bucket
        // cleared the thin-data gate AND the card was actually identified
        // — a bid is a stronger claim than a price, so it gets the
        // stricter precondition of the two.
        ...(slabBase.slabCardIdentified
          ? {
              gradedListPrice: gradedResult.gradedListPrice,
              gradedBreakEven: gradedResult.gradedBreakEven,
              gradedSuggestedBid: gradedResult.gradedSuggestedBid,
              gradedSellThrough: gradedResult.gradedSellThrough,
            }
          : {}),
      };
      if (slabBase.slabCardIdentified && gradedResult.gradedSuggestedBid != null) {
        console.log(
          `[identify] requestId=${requestId} GRADED BID: ${gradedResult.grader} ${gradedResult.grade} median=$${gradedResult.gradedPrice} list=$${gradedResult.gradedListPrice} breakEven=$${gradedResult.gradedBreakEven} bid=$${gradedResult.gradedSuggestedBid} tier=${gradedResult.gradedSellThrough?.tier} pace=${gradedResult.gradedSellThrough?.monthlyPace?.toFixed(1)}/mo over ${gradedResult.gradedSellThrough?.windowDays}d`
        );
      }
    } else if (gradedResult && gradedResult.gradedThin) {
      // PHASE 0d: the exact grader+grade bucket EXISTS but is too thin to
      // price from. Distinct from "never found" so the panel can say which
      // — and so the single-sale $7,999.95 class of number is named as
      // insufficient data rather than shown as a price.
      result = {
        ...slabBase,
        gradedPriceUnavailable: true,
        gradedThin: true,
        gradedThinReason: gradedResult.gradedThinReason,
        gradedSampleCount: gradedResult.gradedSampleCount,
      };
      console.log(
        `[identify] requestId=${requestId} GRADED PRICE WITHHELD (thin data): grader=${gradedResult.grader} grade=${gradedResult.grade} reason=${gradedResult.gradedThinReason} count=${gradedResult.gradedSampleCount}`
      );
    } else {
      result = {
        ...slabBase,
        gradedPriceUnavailable: true,
      };
    }
    // PHASE 0f: no graded Suggested Bid — that is Phase 3. Nothing above
    // sets conditionsSuggestedBid or any bid field on a slab result, and
    // the raw reference price the panel shows for a slab is rendered
    // without bids (see renderSlabReferencePrice in extension/content.js).
  } else {
    try {
      result = await lookupCardPPT(read, requestId, legacyReadPromise);
    } catch (e) {
      console.error(`[identify] requestId=${requestId} lookup threw:`, e && e.message);
      result = { error: "lookup-failed" };
    }

    if (!result || result.error) {
      // FIX (2026-08-27, live test — Palkia GX): a burst of rapid rescans
      // hit PPT's real per-minute credit limit (confirmed via logs: a 429
      // with "Minute rate limit exceeded"), but this always showed the
      // same generic "intermittently flaky" message regardless of cause —
      // misleading here, since this is a specific, real, and temporary
      // condition, not a mystery outage. See fetchPokemonPriceTracker
      // above for the actual fix (lower request limit to use fewer
      // credits per call); this just makes the user-facing message
      // honest about what's happening when it does still occur.
      //
      // FIX (2026-08-29, live — Sudowoodo/Charizard ex): this used to say
      // "per-minute limit" for EVERY 429, but confirmed via real logs that
      // PPT also returns 429 for a completely different, non-transient
      // reason — the account's DAILY credit allowance being fully spent
      // ("Daily credit limit exceeded", 0 purchased credits remaining).
      // Telling the user to "wait Ns and try again" for that case is
      // actively wrong advice (retryAfter there is ~1000s+ until the
      // daily reset, not a short cooldown) and doesn't mention the real
      // fix (wait for the daily reset, or buy more credits). Now branches
      // on `isDailyLimit` (set in fetchPokemonPriceTracker from PPT's own
      // `error` field) to show the correct explanation and action for
      // each real, distinct cause.
      const isRateLimited = !!(result && result.error === "rate-limited");
      const reason = isRateLimited
        ? result.isDailyLimit
          ? `PokemonPriceTracker's daily credit allowance is used up for today (resets in ~${Math.ceil((result.retryAfter || 3600) / 60)} min) — wait for the reset, or buy more credits at pokemonpricetracker.com/api-keys to keep scanning today.`
          : `Our card database's per-minute limit was hit from scanning quickly — wait about ${result.retryAfter || 15}s and try again.`
        : "Couldn't reach our card database right now (it's been intermittently flaky) — try again in a moment.";
      // ADDED (2026-09-12, client-side auto-retry — see docs/test-cases.md
      // "Research: PPT per-minute rate limit hit during normal
      // single-click scanning"): retryAfter/isDailyLimit were already
      // computed above but only ever reached the client baked into the
      // English `reason` string — fine for a human to read, useless for
      // content.js to act on programmatically. Exposed as real fields so
      // the extension can auto-retry a per-minute rate limit without
      // parsing prose. `retryAfter`/`isDailyLimit` are only meaningful
      // (non-null) when `rateLimited` is true — a generic "intermittently
      // flaky" failure has no known wait time and should never be
      // auto-retried blindly.
      res.status(200).json({
        found: false,
        reason,
        usage,
        requestId,
        rateLimited: isRateLimited,
        retryAfter: isRateLimited ? result.retryAfter || null : null,
        isDailyLimit: isRateLimited ? !!result.isDailyLimit : null,
      });
      return;
    }

    if (result.notFound) {
      // CORRECTED (2026-08-27): this used to append a Japanese-specific
      // hint blaming a database coverage gap for Japan-exclusive cards.
      // That diagnosis was wrong (see the FIX comment on
      // fetchPokemonPriceTracker — the real bug was a missing `language`
      // query param, now fixed), so the hint is removed. This message
      // applies equally regardless of language now.
      res.status(200).json({
        found: false,
        reason: `Read the name "${read.cardName}" but couldn't confidently match it to a specific printing.`,
        usage,
        requestId,
      });
      return;
    }

    result = {
      ...result,
      cardLanguage: read.language,
      confidence: read.confidence,
      stampType: read.stampType,
      stampNote:
        read.stampType && read.stampType !== "none" && read.stampType !== "1st Edition"
          // CORRECTED (2026-10-05): the previous wording made two claims
          // that are both false. It asserted our data source "doesn't
          // track pricing for stamped promos separately from the
          // standard printing" — it often does (a set-stamped EX card is
          // carried as that product's Reverse Holofoil printing; a Burger
          // King / 30th Celebration promo is a separate tcgPlayerId
          // entirely) — and it asserted the price "likely understates its
          // real value", which has the sign backwards whenever the stamp
          // belongs to a CHEAPER printing than the one matched. On the
          // 30th Celebration Pikachu scan it overstated by 5x ($4.83
          // shown vs. $0.96 real), i.e. the only warning on screen was
          // pushing toward bidding MORE on a wrong, cheaper card.
          // Neutral, direction-free wording instead.
          ? `This card appears to carry a set stamp or logo ("${read.stampType}") — the printing it belongs to may not be the one priced here. Verify the exact printing before relying on this price.`
          : null,
    };
  }

  const tEnd = Date.now();
  console.log(`[timing] requestId=${requestId} lookup ms=`, tEnd - tGemini, "total ms=", tEnd - tStart);

  result.usage = usage;
  result.timingMs = { gemini: tGemini - tStart, lookup: tEnd - tGemini, total: tEnd - tStart };
  // Always explicit ("gemini" on the normal path, not just omitted) so the
  // extension can reliably tell which provider actually identified the
  // card — see the "CLAUDE HAIKU 4.5" comment block above.
  result.visionProvider = visionProvider;
  // FLAG FEATURE (2026-09-04): lets the extension send this exact id back
  // to POST /api/flag if the user flags this result — see the comment on
  // `requestId`'s declaration above.
  result.requestId = requestId;
  res.status(200).json(result);
}

module.exports = handler;
// DECOUPLED PRICING (2026-09-10, see docs/test-cases.md test #88):
// exported so api/price.js can `require("./identify.js")` and reuse
// these two functions UNCHANGED — same closures, same access to
// TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS/fetchTCGPlayerPriceHistory/
// buildLivePriceVariantsFromTCGPlayer defined earlier in this file —
// rather than duplicating ~150 lines of pricing logic across two files
// and risking the two copies drifting apart. Vercel still treats this
// file's default export as the /api/identify handler; attaching named
// properties to that same function value doesn't change that.
module.exports.buildLiveVariantsForCandidate = buildLiveVariantsForCandidate;
module.exports.pickDefaultVariantKey = pickDefaultVariantKey;

// GRADED-SLAB HELPERS (2026-10-11, Phase 0) — exported for unit testing
// only. Nothing requires these except the test harness; api/price.js does
// not touch them. Same mechanism and same zero-risk rationale as the two
// exports above: attaching named properties to the handler function value
// does not change how Vercel treats this file's default export.
module.exports.shouldTreatAsSlab = shouldTreatAsSlab;
module.exports.parseSlabLabel = parseSlabLabel;
module.exports.computeGradedBreakEven = computeGradedBreakEven;
module.exports.computeGradedSellThrough = computeGradedSellThrough;
module.exports.computeGradedBidForBucket = computeGradedBidForBucket;
module.exports.GRADED_SHIPPING_PER_CARD = GRADED_SHIPPING_PER_CARD;
module.exports.slabLabelSetPhrases = slabLabelSetPhrases;
module.exports.lookupCardFromSlabLabel = lookupCardFromSlabLabel;
module.exports.identifyWithGemini = identifyWithGemini;
module.exports.SLAB_LABEL_PROBE_ENABLED = SLAB_LABEL_PROBE_ENABLED;
module.exports.LEGACY_LABEL_PROBE_PROMPT = LEGACY_LABEL_PROBE_PROMPT;
module.exports.LEGACY_LABEL_PROBE_SCHEMA = LEGACY_LABEL_PROBE_SCHEMA;
module.exports.GEMINI_PROMPT = GEMINI_PROMPT;
module.exports.GEMINI_SCHEMA = GEMINI_SCHEMA;
module.exports.parseGradedBucketKey = parseGradedBucketKey;
module.exports.normalizeGraderForCompare = normalizeGraderForCompare;
module.exports.normalizeGradeForCompare = normalizeGradeForCompare;
module.exports.assessGradedBucket = assessGradedBucket;
module.exports.lookupGradedPrice = lookupGradedPrice;
module.exports.fetchPptCardByTcgPlayerId = fetchPptCardByTcgPlayerId;
module.exports.GRADED_SANITY_LOW_GRADE_RATIO = GRADED_SANITY_LOW_GRADE_RATIO;
module.exports.GRADED_MIN_SALES = GRADED_MIN_SALES;
module.exports.GRADED_MAX_LAST_SALE_AGE_DAYS = GRADED_MAX_LAST_SALE_AGE_DAYS;

// ADDED (2026-10-15): exported for the local test suite in test/. Nothing
// in the request path reads these off module.exports — lookupCardPPT is
// called directly by the handler in this same file — so exporting them
// cannot change runtime behavior.
module.exports.lookupCardPPT = lookupCardPPT;
// Lets the local test suite assert that its Runtime Cache stub actually took
// effect. The 30s process-global cache keyed on language+name+number silently
// couples unrelated test cases together (see test/alakazam.test.js), so the
// suite stubs @vercel/functions out and checks this flag rather than trusting
// that it worked. Always false in production, where the package is present.
// Must live down here: `module.exports = handler` above replaces the whole
// exports object, so anything assigned earlier is discarded.
module.exports.__cacheDisabledForTests = !getCache;
module.exports.SIBLING_CAP_LEGACY_TOTAL_WAIT_MS = SIBLING_CAP_LEGACY_TOTAL_WAIT_MS;
module.exports.SIBLING_GRADED_MAX_LOOKUPS = SIBLING_GRADED_MAX_LOOKUPS;
module.exports.buildZeroPaddedNumberVariant = buildZeroPaddedNumberVariant;
module.exports.buildWideZeroPaddedNumberVariant = buildWideZeroPaddedNumberVariant;
module.exports.stripBestGuessClause = stripBestGuessClause;
module.exports.totalsContradict = totalsContradict;
module.exports.numbersMatch = numbersMatch;
module.exports.sameSiblingGroup = sameSiblingGroup;
module.exports.candidateSiblingBaseName = candidateSiblingBaseName;
module.exports.attackNameAppearsInCardText = attackNameAppearsInCardText;
module.exports.awaitLegacyReadCapped = awaitLegacyReadCapped;
module.exports.LEGACY_NUMBER_RESCUE_TIMEOUT_MS = LEGACY_NUMBER_RESCUE_TIMEOUT_MS;
module.exports.extractAttackNames = extractAttackNames;
module.exports.normalizePptCard = normalizePptCard;
module.exports.computeBreakEvenMaxBid = computeBreakEvenMaxBid;
module.exports.computeSuggestedBid = computeSuggestedBid;
module.exports.computeSellThrough = computeSellThrough;
