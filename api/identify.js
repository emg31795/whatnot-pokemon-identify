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

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 5000;
const CARDDB_TIMEOUT_MS = 2500;
const CARDDB_RETRY_TIMEOUT_MS = 1200;

const GEMINI_INPUT_USD_PER_1M = 0.30;
const GEMINI_OUTPUT_USD_PER_1M = 2.50;

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
const SCORE = { number: 20, hp: 6, subtype: 5, set: 3, attackName: 4, stampMatch: 3, stampMismatch: 8 };
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

cardNumber and hp are the two most important fields — they're the strongest signals for telling apart printings that otherwise look identical, so spend extra effort trying to find them even if other parts of the card are unclear or at an angle. If multiple cards are visible in the frame, make sure cardNumber, hp, and every other field describe the SAME single card being held up or highlighted — do not mix a number from one card with the HP or name of a different card in the background.

If the card text is in Japanese, translate the species name to its standard English name for cardName (e.g. チャーレム -> Medicham), and set language to "Japanese". Otherwise language is "English".

attackName is just the short name of the top/first attack (e.g. "Continuous Tumble"), not a full transcription of its text or damage.

For stampType: only report "1st Edition" if the specific black/red "1st Edition" logo is actually visible and legible on the card — being an old-looking vintage holo is NOT evidence on its own. Default to "none" (meaning standard/Unlimited) whenever the stamp area is unclear, out of frame, or not confidently seen. Other tournament/promo stamps (Staff, Prerelease, Winner, Pokemon Center, World Championship) should only be reported if their text/logo is actually legible; use "other" for a visible-but-unrecognized stamp.

If the card appears to be inside a graded slab (a thick plastic holder with a printed label, e.g. PSA/BGS/CGC/SGC), set isSlab true and fill in grader, grade, and certNumber from the label if legible, otherwise leave them null.

If no card is visible in the frame at all, set found to false.`;

async function identifyWithGemini(imageBase64, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
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
      thinkingConfig: { thinkingLevel: "minimal" },
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
function normalizeNumber(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
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
function numbersMatch(readRaw, candRaw) {
  const a = normalizeNumber(readRaw);
  const b = normalizeNumber(candRaw);
  if (!a || !b) return { match: false, points: 0, strength: "none" };
  if (a.prefix !== b.prefix || a.num !== b.num) return { match: false, points: 0, strength: "none" };

  const bothHaveTotal = a.total && b.total;
  const neitherHasTotal = !a.total && !b.total;

  if (bothHaveTotal) {
    if (a.total !== b.total || a.totalPrefix !== b.totalPrefix) {
      return { match: true, points: SCORE.number * 0.7, strength: "totalMismatch" };
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

  if (read.attackName && candidate.attackName && String(candidate.attackName).toLowerCase().trim() === String(read.attackName).toLowerCase().trim()) {
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

function candidateDedupKey(candidate) {
  const baseName = String(candidate.name || "")
    .replace(/\s*-\s*\S+\/\S+\s*$/, "")
    .trim()
    .toLowerCase();
  return `${baseName}|${candidate.number}`;
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

  console.log(
    `${logPrefix} best=`,
    best ? { name: best.name, number: best.number, hp: best.hp, setName: best.setName } : null,
    "bestScore=",
    bestScore,
    "tieCount=",
    tieCount,
    "read=",
    { cardName: read.cardName, cardNumber: read.cardNumber, hp: read.hp, subtype: read.subtype, setName: read.setName, attackName: read.attackName }
  );

  if (!best || bestScore < MATCH_FLOOR) {
    return { best: null, bestScore, tieCount };
  }

  const bestDetail = pickPool.length ? pickPool[0].detail : null;
  return { best, bestScore, tieCount, bestDetail };
}

function confidenceForScore(score) {
  if (score >= HIGH_THRESHOLD) return "High";
  if (score >= MEDIUM_THRESHOLD) return "Medium";
  return "Low";
}

function ambiguousNoteText() {
  return "Multiple different printings of this card share identical HP, attack, and type — the card number is the only thing that tells them apart, and it wasn't legible this scan. This is our best guess only; verify the exact set/number on the physical card before trusting this match or price.";
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
// simply never being requested. Turning it on here (permanently, on the
// existing request — NOT a second network call, so no latency hit) and
// reading the real per-condition breakdown in buildPriceVariantsFromPPT /
// buildAggregatePricing below. CONDITION_MULTIPLIERS is now only a
// fallback for whichever specific condition(s) PPT doesn't have real data
// for on a given printing (e.g. Raichu GX SM90 above was missing a real
// "Heavily Played" figure) — the UI marks exactly those estimated tiers,
// not the whole table, since most of the table is now real.
async function fetchPokemonPriceTracker(name, { graded = false, language = "English", offset = null } = {}) {
  const params = new URLSearchParams({ search: name, limit: "30", includeHistory: "true" });
  if (graded) params.set("includeEbay", "true");
  if (String(language).toLowerCase() === "japanese") params.set("language", "japanese");
  if (offset) params.set("offset", String(offset));
  const url = `${PPT_BASE_URL}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${process.env.POKEMONPRICETRACKER_API_KEY}` };

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    console.error("[lookup] PokemonPriceTracker request threw:", e && e.message);
    return null;
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
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.retryAfter) retryAfter = parsed.retryAfter;
      } catch (e3) {
        // ignore, use default
      }
      console.log(`[lookup] RATE LIMITED by PokemonPriceTracker: retryAfter=${retryAfter}s name=`, name);
      return { error: "rate-limited", retryAfter };
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
  const m = first.match(/^\s*\[[^\]]*\]\s*([^(\r\n<]+)/);
  return m ? m[1].trim() : null;
}

function normalizePptCard(raw) {
  const nameSuffixMatch = String(raw.name || "").match(/-\s*(\d+\/\d+)\s*(?:\(.*\))?\s*$/);
  const number = raw.cardNumber || raw.number || (nameSuffixMatch ? nameSuffixMatch[1] : null);

  const subtypes = [];
  const n = String(raw.name || "");
  for (const tag of ["VMAX", "VSTAR", "GX", "EX", "ex", " V", "BREAK"]) {
    if (n.includes(tag)) subtypes.push(tag.trim());
  }

  return {
    id: `${raw.name}|${number}`,
    name: raw.name,
    number,
    hp: raw.hp || null,
    subtypes,
    setName: raw.setName || null,
    attackName: raw.attackName || extractFirstAttackName(raw.attacks) || null,
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

async function fetchTCGPlayerPriceHistory(tcgPlayerId) {
  const url = `https://infinite-api.tcgplayer.com/price/history/${tcgPlayerId}/detailed?range=quarter`;
  let resp;
  try {
    resp = await fetchWithTimeout(url, {}, TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`TCGplayer price-history request failed for productId=${tcgPlayerId}: ${e && e.message}`);
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

// Groups TCGplayer's flat per-SKU result list into
// { <printingLabel>: { label, printEdition, basePrice, conditions: {NM,LP,MP,HP,DMG}, estimated, partial } }
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
    byVariant[label][tier] = Math.round(price * 100) / 100;
  }

  const variants = {};
  for (const [label, conditions] of Object.entries(byVariant)) {
    const presentTiers = CONDITION_TIERS.filter((t) => conditions[t] != null);
    if (!presentTiers.length) continue;
    // Prefer NM as the headline "Market" price shown above the table
    // (matches how every other part of this tool has always defined
    // "market price"); if TCGplayer's data happens not to include NM for
    // this printing, fall back to whichever tier IS present, preferring
    // the best-condition one available.
    const basePrice = conditions.NM != null
      ? conditions.NM
      : conditions[presentTiers[0]];
    variants[label] = {
      label,
      printEdition: label,
      basePrice,
      conditions,
      estimated: { NM: false, LP: false, MP: false, HP: false, DMG: false },
      partial: presentTiers.length < CONDITION_TIERS.length,
    };
  }
  return Object.keys(variants).length ? variants : null;
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
  if (!tag) return variants;
  const tagged = {};
  for (const [k, v] of Object.entries(variants)) {
    const label = `${k} (${tag})`;
    tagged[label] = { ...v, label, printEdition: label };
  }
  return tagged;
}

// Picks which variant is pre-selected in the dropdown.
function pickDefaultVariantKey(priceVariants, read, primaryPrinting) {
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

  if (primaryPrinting && lowerToActual[String(primaryPrinting).toLowerCase()]) {
    return lowerToActual[String(primaryPrinting).toLowerCase()];
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

async function lookupCardPPT(read) {
  let data = await fetchPokemonPriceTracker(read.cardName, { language: read.language });
  if (!data) return { error: "card-db-unavailable" };
  if (data.error === "rate-limited") return { error: "rate-limited", retryAfter: data.retryAfter };

  let rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  console.log("[lookup] search=", read.cardName, "language=", read.language, "raw candidate count=", rawList.length, "sample=", JSON.stringify(rawList.slice(0, 3)).slice(0, 2500));

  let matchName = read.cardName;

  if (rawList.length === 0) {
    const stripped = stripSubtypeSuffix(read.cardName);
    if (stripped && stripped.toLowerCase() !== String(read.cardName || "").toLowerCase()) {
      console.log("[lookup] zero raw results for full name, retrying search with base species name=", stripped);
      const retryData = await fetchPokemonPriceTracker(stripped, { language: read.language });
      if (retryData) {
        rawList = Array.isArray(retryData.data) ? retryData.data : Array.isArray(retryData) ? retryData : [];
        console.log("[lookup] retry search=", stripped, "raw candidate count=", rawList.length);
        if (rawList.length > 0) matchName = stripped;
      }
    }
  }

  const wantedName = normalizeNameForMatch(matchName);
  let filtered = rawList.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));

  if (filtered.length === 0) {
    console.log("[lookup] zero candidates survived the name filter for name=", read.cardName);
    return { notFound: true };
  }

  let candidates = filtered.map(normalizePptCard);
  console.log("[lookup] scored candidates=", JSON.stringify(candidates.map((c) => ({ name: c.name, number: c.number, hp: c.hp, subtypes: c.subtypes, hasVariants: !!c._rawVariants }))).slice(0, 3000));

  let { best, bestScore, tieCount, bestDetail } = pickBestCandidate(candidates, read, "[lookup]");

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
      !best
        ? "[lookup] no match above the floor and page 1 came back full — fetching page 2 via offset=30"
        : `[lookup] best=${best.name} cleared the floor on other signals but read number=${read.cardNumber} matches nothing on page 1, which came back full — fetching page 2 via offset=30`
    );
    const page2 = await fetchPokemonPriceTracker(read.cardName, { language: read.language, offset: 30 });
    if (page2 && page2.error === "rate-limited") return { error: "rate-limited", retryAfter: page2.retryAfter };
    const page2List = page2 ? (Array.isArray(page2.data) ? page2.data : Array.isArray(page2) ? page2 : []) : [];
    console.log("[lookup] page 2 raw candidate count=", page2List.length);
    if (page2List.length > 0) {
      const page2Filtered = page2List.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
      if (page2Filtered.length > 0) {
        filtered = filtered.concat(page2Filtered);
        candidates = filtered.map(normalizePptCard);
        console.log("[lookup] re-scoring with page 1 + page 2 merged, total candidates=", candidates.length);
        ({ best, bestScore, tieCount, bestDetail } = pickBestCandidate(candidates, read, "[lookup:page1+2]"));
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
    const combinedQuery = `${read.cardName} ${read.cardNumber}`;
    console.log(`[lookup] number still missing after page1+2 — trying combined name+number search= "${combinedQuery}"`);
    const combinedResult = await fetchPokemonPriceTracker(combinedQuery, { language: read.language });
    if (combinedResult && combinedResult.error === "rate-limited") return { error: "rate-limited", retryAfter: combinedResult.retryAfter };
    const combinedList = combinedResult
      ? Array.isArray(combinedResult.data)
        ? combinedResult.data
        : Array.isArray(combinedResult)
        ? combinedResult
        : []
      : [];
    console.log("[lookup] combined name+number search raw candidate count=", combinedList.length);
    if (combinedList.length > 0) {
      const combinedFiltered = combinedList.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
      if (combinedFiltered.length > 0) {
        const combinedCandidates = combinedFiltered.map(normalizePptCard);
        const foundExactNumber = combinedCandidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
        if (foundExactNumber) {
          filtered = filtered.concat(combinedFiltered);
          candidates = filtered.map(normalizePptCard);
          console.log("[lookup] combined name+number search surfaced the missing number — re-scoring, total candidates=", candidates.length);
          ({ best, bestScore, tieCount, bestDetail } = pickBestCandidate(candidates, read, "[lookup:combined]"));
        } else {
          console.log("[lookup] combined name+number search returned results but still no exact number match — keeping prior best");
        }
      }
    }
  }

  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;

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
  if (read.cardNumber && best.number) {
    const { match: numberMatchedForBest } = numbersMatch(read.cardNumber, best.number);
    if (!numberMatchedForBest) {
      const anyNumberMatch = candidates.some((c) => numbersMatch(read.cardNumber, c.number).match);
      if (!anyNumberMatch) {
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
        console.log(`[lookup] NO NUMBER MATCH IN POOL: read number=${read.cardNumber}, language=${read.language}, best=${best.name} ${best.number} (matched on other signals only)`);
      }
    }
  }

  if (!ambiguousNote && tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
    console.log(`[lookup] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}`);
  }

  // FIX (2026-08-27, live test — Mewtwo/SVP 052): a "weak" number match
  // (see numbersMatch) means the only real signal tying this candidate to
  // the read card is a numerator that happens to coincide despite the two
  // using different numbering schemes (promo vs numbered-set) — flag it
  // explicitly rather than let whatever score it landed at imply more
  // certainty than that coincidence deserves.
  if (!ambiguousNote && bestDetail && bestDetail.numberStrength === "weak") {
    matchConfidence = matchConfidence === "High" ? "Medium" : matchConfidence;
    ambiguousNote =
      "The card number that matched uses a different numbering format than this printing normally would (e.g. a promo-style number vs. a numbered-set card) — the shared digits may be coincidental rather than confirming this is the same printing. Verify the exact set/number on the physical card before trusting this match or price.";
    console.log(`[lookup] WEAK NUMBER MATCH: read=${read.cardNumber}, best=${best.name} ${best.number} (numbering schemes differ, digits may coincide by chance)`);
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
        console.log(`[lookup] NUMBER/HP CONFLICT: best=${best.name} ${best.number} hp=${best.hp}, read hp=${read.hp}, matches elsewhere`);
      }
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

  console.log("[lookup] raw variants object for best match:", JSON.stringify(best._rawVariants).slice(0, 1500));

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

  // LIVE TCGPLAYER PRICING (2026-08-30) — see the big comment above
  // buildLivePriceVariantsFromTCGPlayer for the full story. PPT is done
  // being used at this point except for its `tcgPlayerId`/`tcgPlayerUrl`
  // fields; every dollar figure from here on is either genuine live
  // TCGplayer data or an explicit `pricingError` — never a guess.
  let priceVariants = null;
  let pricingError = null;
  try {
    priceVariants = await buildLiveVariantsForCandidate(best, bestIsShadowless ? "Shadowless" : null);
    if (shadowlessSibling) {
      try {
        const siblingIsShadowless = isShadowlessSetName(shadowlessSibling.setName);
        const siblingVariants = await buildLiveVariantsForCandidate(shadowlessSibling, siblingIsShadowless ? "Shadowless" : null);
        priceVariants = { ...priceVariants, ...siblingVariants };
        console.log(
          `[lookup] merged Shadowless-sibling LIVE prices into dropdown: best=${best.setName}, sibling=${shadowlessSibling.setName}, sibling keys=`,
          Object.keys(siblingVariants)
        );
      } catch (e) {
        // Non-fatal: the sibling is a bonus dropdown option, not the
        // primary match's own price. Log and move on rather than failing
        // the whole scan over a secondary printing's data.
        console.error("[lookup] Shadowless sibling LIVE price fetch failed (non-fatal):", e && e.message);
      }
    }
  } catch (e) {
    console.error("[lookup] LIVE TCGPLAYER PRICING FAILED:", e && e.message, "tcgPlayerId=", best.tcgPlayerId);
    pricingError = (e && e.message) || "Could not fetch live TCGplayer pricing for this card.";
    priceVariants = null;
  }

  const defaultKeyRaw = priceVariants ? pickDefaultVariantKey(priceVariants, read, best.prices?.primaryPrinting) : null;
  const priceVariantUsed = defaultKeyRaw;
  const chosenVariant = priceVariantUsed && priceVariants ? priceVariants[priceVariantUsed] : null;

  let noPriceNote = null;
  if (!chosenVariant && !pricingError) {
    noPriceNote = "TCGplayer doesn't have complete live condition pricing for this printing yet. Check the link below for current listings.";
  }

  const tcgSearchName = String(best.name).replace(/\s*-\s*\S+\/\S+\s*$/, "").trim();

  return {
    found: true,
    cardName: best.name,
    setName: best.setName,
    cardImageUrl: best.cardImageUrl || null,
    matchConfidence,
    ambiguousNote,
    noPriceNote,
    // Loud, explicit failure per user instruction (2026-08-30, active
    // testing phase): set only when live TCGplayer pricing could not be
    // fetched at all. Never paired with a fabricated marketPrice/
    // conditionPrices — those stay null whenever this is set.
    pricingError,
    tcgplayerUrl: best.tcgPlayerUrl || null,
    marketPrice: chosenVariant ? chosenVariant.basePrice : null,
    conditionPrices: chosenVariant ? chosenVariant.conditions : null,
    // Kept for frontend/shape compatibility — always all-false now, since
    // every surviving number is genuine live TCGplayer data (see
    // buildLivePriceVariantsFromTCGPlayer).
    conditionPricesEstimated: chosenVariant ? chosenVariant.estimated : null,
    // NEW (2026-08-29): true when TCGplayer had real live data for SOME
    // but not all 5 condition tiers on the shown printing (see
    // buildLivePriceVariantsFromTCGPlayer) — lets the frontend caption
    // this differently from full 5-condition coverage without implying
    // any of the missing tiers were guessed.
    conditionPricesPartial: chosenVariant ? !!chosenVariant.partial : false,
    priceVariants,
    priceVariantUsed,
    _tcgSearchName: tcgSearchName,
  };
}

// ---------------------------------------------------------------------------
// Graded slab pricing (Japanese or English) — PokemonPriceTracker w/ eBay comps
// ---------------------------------------------------------------------------

async function lookupGradedPrice(read) {
  const data = await fetchPokemonPriceTracker(read.cardName, { graded: true, language: read.language });
  if (!data || data.error) return null;

  const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  const wantedName = normalizeNameForMatch(read.cardName);
  const filtered = rawList.filter((c) => normalizeNameForMatch(c.name).includes(wantedName));
  if (filtered.length === 0) return null;

  for (const c of filtered) {
    const rawComps = c.gradedSales || c.ebayComps || c.ebay || [];

    const comps = Array.isArray(rawComps)
      ? rawComps
      : Object.entries(rawComps).map(([key, v]) => {
          const m = String(key).match(/^([a-zA-Z]+)\s*(\d+(?:\.\d+)?)$/);
          return {
            grader: m ? m[1].toUpperCase() : key,
            grade: m ? m[2] : null,
            price: v && (v.avgPrice ?? v.averagePrice ?? v.price ?? v.market),
          };
        });

    for (const comp of comps) {
      if (
        read.grader &&
        read.grade &&
        String(comp.grader || "").toLowerCase() === String(read.grader).toLowerCase() &&
        String(comp.grade || "") === String(read.grade || "") &&
        comp.price != null
      ) {
        return {
          gradedPrice: comp.price,
          nearbyGradedPrices: comps
            .filter((x) => x !== comp && x.price != null)
            .slice(0, 5)
            .map((x) => ({ label: `${x.grader} ${x.grade}`, price: x.price })),
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

  // TIMING (added 2026-08-27): real end-to-end latency has never been
  // measured against the 2-5s target — every prior "speed pass" tuned
  // timeout ceilings, not actual response time. Log + return real
  // wall-clock splits so this can finally be checked from real scans
  // instead of guessed at.
  const tStart = Date.now();

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    res.status(400).json({ error: "Missing imageBase64" });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    return;
  }

  let read;
  try {
    read = await identifyWithGemini(imageBase64, geminiKey);
    console.log("[identify] Gemini read:", JSON.stringify(read));
  } catch (e) {
    console.error("[identify] Gemini call failed:", e && e.message, "after ms=", Date.now() - tStart);
    res.status(200).json({ found: false, error: "gemini-failed", detail: e && e.message });
    return;
  }

  const tGemini = Date.now();
  console.log("[timing] gemini ms=", tGemini - tStart);

  const usage = estimateGeminiCostUsd(read._geminiUsage);

  if (!read.found || !read.cardName) {
    res.status(200).json({ found: false, reason: read.reason || "Couldn't identify the card. Try again when it's clearly visible.", usage });
    return;
  }

  let result;
  if (read.isSlab) {
    let gradedResult = null;
    try {
      gradedResult = await lookupGradedPrice(read);
    } catch (e) {
      console.error("[identify] graded lookup threw:", e && e.message);
    }

    const baseLookup = await lookupCardPPT(read);

    if (gradedResult && gradedResult.gradedPrice != null) {
      result = {
        found: true,
        cardName: read.cardName,
        cardLanguage: read.language,
        setName: baseLookup?.setName || read.setName,
        cardImageUrl: baseLookup?.cardImageUrl || null,
        confidence: read.confidence,
        matchConfidence: baseLookup?.matchConfidence || "Medium",
        isSlab: true,
        grader: read.grader,
        grade: read.grade,
        certNumber: read.certNumber,
        gradedPrice: gradedResult.gradedPrice,
        nearbyGradedPrices: gradedResult.nearbyGradedPrices,
        tcgplayerUrl: baseLookup?.tcgplayerUrl || null,
      };
    } else {
      result = {
        ...(baseLookup && baseLookup.found ? baseLookup : { found: true, cardName: read.cardName }),
        cardLanguage: read.language,
        confidence: read.confidence,
        isSlab: true,
        grader: read.grader,
        grade: read.grade,
        certNumber: read.certNumber,
        gradedPriceUnavailable: true,
      };
    }
  } else {
    try {
      result = await lookupCardPPT(read);
    } catch (e) {
      console.error("[identify] lookup threw:", e && e.message);
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
      const reason =
        result && result.error === "rate-limited"
          ? `Our card database's per-minute limit was hit from scanning quickly — wait about ${result.retryAfter || 15}s and try again.`
          : "Couldn't reach our card database right now (it's been intermittently flaky) — try again in a moment.";
      res.status(200).json({ found: false, reason, usage });
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
          ? `This is a "${read.stampType}" stamped promo — our data source doesn't track pricing for stamped promos separately from the standard printing, so the price shown likely understates its real value.`
          : null,
    };
  }

  const tEnd = Date.now();
  console.log("[timing] lookup ms=", tEnd - tGemini, "total ms=", tEnd - tStart);

  result.usage = usage;
  result.timingMs = { gemini: tGemini - tStart, lookup: tEnd - tGemini, total: tEnd - tStart };
  res.status(200).json(result);
};
