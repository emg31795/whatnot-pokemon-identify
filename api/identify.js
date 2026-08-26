// api/identify.js
//
// REBUILT 2026-08-24 after the original source was lost to a dropped chat
// session; see the project's build-status doc for that history.
//
// ARCHITECTURE HISTORY (all same day, 2026-08-26 — see build-status doc for
// full narrative):
//   1. Consolidated onto PokemonPriceTracker only, dropping pokemontcg.io
//      (which was unreliable at real usage volume) — but this also dropped
//      the Normal/Holofoil/Reverse-Holo/1st-Edition print-variant picker,
//      which turned out to be essential, not optional, for this project's
//      real use case (making real-money buy/bid decisions off the price
//      shown).
//   2. Restored pokemontcg.io as the English-card source specifically to
//      get the variant picker back, with PokemonPriceTracker as an
//      automatic fallback.
//   3. THIS VERSION: discovered pokemontcg.io itself has been folded into
//      Scrydex (Pallet Trade's own paid data source) and is no longer a
//      free/standalone API at all — it now requires a $29+/mo Scrydex
//      plan, more than Pallet itself charges. Dead end. BUT: deeper
//      research into PokemonPriceTracker's own docs (not just its
//      marketing page, which is all the 2026-08-26-step-1 research
//      looked at) found it actually DOES expose per-variant pricing via a
//      `variants` object on each card (e.g. `variants.Holofoil.marketPrice`,
//      `variants["Reverse Holofoil"]`, etc.) plus real CDN image URLs
//      (`imageCdnUrl`/`imageCdnUrl200`) — fields the earlier research
//      simply never looked for. So the FINAL architecture is: ONE data
//      source (PokemonPriceTracker, the subscription already being paid
//      for) for English, Japanese, AND graded slabs, using its real
//      variants + image fields to keep the print-variant picker and card
//      thumbnail without needing a second API at all.
//
// This is simpler (one source, no cross-API fallback dance), faster (no
// double network round-trip when a fallback triggers), and costs nothing
// new. The exact `variants` key names (e.g. is it "Holofoil" or
// "holofoil"? does every card have a "Reverse Holofoil" key?) are taken
// from PokemonPriceTracker's documentation examples, NOT yet confirmed
// against a live API response with a real key — this file is defensive
// about it (case-insensitive key matching, falls back to the old flat
// `prices.market` aggregate if `variants` is missing or empty) and logs
// the raw variants object on every request so a real scan will reveal the
// true shape and this can be corrected fast if the docs were imprecise.
//
// SPEED: this tool needs to return in ~2-5s so it's useful for a live
// buy/bid decision, not just eventually-correct. Timeouts below are
// tuned tight on that assumption — see the constants just below. These
// are timeout CEILINGS (safety nets against a hung request), not the
// expected latency — actual latency depends on how fast Gemini + PPT
// respond, which hasn't been benchmarked against a live stream yet.
// Watch `usage`/response time on real scans (log to test-cases.md in the
// project) and tighten further if needed.
//
// PokemonPriceTracker's base URL, endpoint path, and Bearer-auth header
// format were confirmed correct against its live docs on 2026-08-26.
//
// Also fixed 2026-08-26: fetchPokemonPriceTracker used to treat a plain 404
// from PokemonPriceTracker (which, per its docs, just means "no results
// matched this search" — normal, not an outage) the same as a real 5xx
// failure, surfacing a scary "couldn't reach our card database" message
// instead of the correct "couldn't confidently match a printing" one. Now a
// 404 returns an explicit empty result set instead.
//
// PRIOR FIX (2026-08-24 rewrite, still in effect): the confirmed bug where
// a Japanese lookup picked a completely wrong candidate (a "369/742"
// Medicham, HP 120) even though the candidate matching Gemini's read
// exactly (number "054/083") was present in the pool. Fixed by (a) using
// ONE shared scoring function for every lookup path instead of independently
// -maintained copies, and (b) making the number comparison robust to
// formatting noise (leading zeros, missing "/total", stray whitespace)
// instead of requiring an exact string match, since Gemini's own OCR of the
// printed number is itself somewhat noisy across rescans of the same
// physical card.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 5000;
const CARDDB_TIMEOUT_MS = 2500;
const CARDDB_RETRY_TIMEOUT_MS = 1200;

// Per-token estimate, see build-status doc's "Tracking $ spend per scan"
// section. Adjust if Google changes pricing — Google AI Studio / Cloud
// Console billing is the source of truth, this is just for the running
// on-screen estimate.
const GEMINI_INPUT_USD_PER_1M = 0.30;
const GEMINI_OUTPUT_USD_PER_1M = 2.50;

// Condition-price multipliers applied to a variant's market price to build
// the NM/LP/MP/HP/DMG table content.js renders. Reverse-engineered from the
// exact figures shown in the build-status doc's live examples (e.g.
// Market $1.00 -> NM $1.00 / LP $0.85 / MP $0.70). If a variant already
// carries its own conditionUsed-specific price from PPT, this is still
// used to build the full condition SPREAD around that single number,
// since PPT's `variants` object gives one price per printing, not a full
// per-condition table.
const CONDITION_MULTIPLIERS = { NM: 1.00, LP: 0.85, MP: 0.70, HP: 0.55, DMG: 0.40 };

// Scoring weights per the build-status doc's "accuracy pass" section.
const SCORE = { number: 10, hp: 6, subtype: 5, set: 2, attackName: 4 };
// Below this, we don't consider a candidate a real match at all.
const MATCH_FLOOR = 3;
const HIGH_THRESHOLD = 10;
const MEDIUM_THRESHOLD = 5;

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

cardNumber and hp are the two most important fields — they're the strongest signals for telling apart printings that otherwise look identical, so spend extra effort trying to find them even if other parts of the card are unclear or at an angle.

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
// graded-slab). Consolidating this (previously two independently-
// maintained copies, per the build-status doc's flagged "code-quality
// risk") is a direct part of the Medicham-bug fix: divergence between
// copies is the leading theory for how the Japanese path stopped
// correctly rewarding an exact number match.
// ---------------------------------------------------------------------------

// Pull the leading numeric part out of a "NNN/TTT" or bare "NNN" collector
// number string, stripping leading zeros and whitespace, so "054/083",
// "54/083", " 54 / 083", and "54" can all be recognized as the same number.
function normalizeNumber(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  const m = str.match(/^0*(\d+)\s*(?:\/\s*0*(\d+))?/);
  if (!m) return null;
  return { num: m[1], total: m[2] || null };
}

function numbersMatch(readRaw, candRaw) {
  const a = normalizeNumber(readRaw);
  const b = normalizeNumber(candRaw);
  if (!a || !b) return { match: false, points: 0 };
  if (a.num !== b.num) return { match: false, points: 0 };
  // Leading number matches. Full points if totals agree or either side is
  // missing a total to compare; a small deduction (not zero — the number
  // itself is still the strongest signal) if both totals are present and
  // disagree, since that's more likely a genuinely different printing.
  if (a.total && b.total && a.total !== b.total) {
    return { match: true, points: SCORE.number * 0.7 };
  }
  return { match: true, points: SCORE.number };
}

function scoreCandidate(candidate, read) {
  let score = 0;
  const detail = {};

  if (read.cardNumber && candidate.number) {
    const { match, points } = numbersMatch(read.cardNumber, candidate.number);
    score += points;
    detail.number = match;
  }

  if (read.hp && candidate.hp && String(read.hp).trim() === String(candidate.hp).trim()) {
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

  return { score, detail };
}

// Runs candidates through scoreCandidate, picks the best, and detects ties
// among DISTINCT candidates (different id/number — not just duplicate
// objects) at the top score, exactly like the ambiguous-match fix described
// in the build-status doc.
function pickBestCandidate(candidates, read, logPrefix) {
  let best = null;
  let bestScore = -1;
  const scored = candidates.map((c) => {
    const { score, detail } = scoreCandidate(c, read);
    return { candidate: c, score, detail };
  });

  for (const s of scored) {
    if (s.score > bestScore) {
      bestScore = s.score;
      best = s.candidate;
    }
  }

  const distinctIds = new Set();
  for (const s of scored) {
    if (s.score === bestScore) {
      distinctIds.add(s.candidate.id || `${s.candidate.name}|${s.candidate.number}`);
    }
  }
  const tieCount = distinctIds.size;

  console.log(
    `${logPrefix} best=`,
    best ? { name: best.name, number: best.number, hp: best.hp } : null,
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

  return { best, bestScore, tieCount };
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
// Card lookup + pricing — PokemonPriceTracker, the ONLY data source as of
// 2026-08-26 step 3 (see top-of-file comment for why pokemontcg.io/Scrydex
// isn't viable and why this is not actually a downgrade).
// ---------------------------------------------------------------------------

// FIX (2026-08-26, ROOT CAUSE of "everything stopped matching"): this was
// pointed at `/api/v2/prices`, which is not a real PokemonPriceTracker
// endpoint at all — confirmed by fetching PPT's own live API docs
// (pokemontcg.io/api page), which document exactly three v2 endpoints:
// /api/v2/cards, /api/v2/sets, /api/v2/sealed-products. There is no
// /api/v2/prices. That wrong path is why EVERY search (including trivial,
// certainly-in-the-database English commons like "Scorbunny", "Timburr",
// "Carbink") came back as a 404/zero-results — it wasn't that any specific
// card couldn't be found, the endpoint itself didn't exist, so PPT 404'd
// every single request regardless of the search term. This bug shipped
// with the 2026-08-26 part-3 rewrite (the one that dropped pokemontcg.io),
// so it affected every scan since then, including the very first
// Toxtricity VMAX test case — the subtype-suffix retry fix from that test
// was real and still worth keeping, but it was never the actual blocker.
// Confirmed correct endpoint + query params from PPT's live docs:
// GET /api/v2/cards?search=<name>&limit=<n>&includeEbay=<bool>&language=<EN|JP>
// (a `language` filter param also exists now, confirmed from docs, but is
// NOT wired in yet — see build-status doc for why: it's a further
// accuracy improvement, not needed for this fix, and untested behavior
// with mixed-region data shouldn't be changed at the same time as this fix).
const PPT_BASE_URL = process.env.PPT_BASE_URL || "https://www.pokemonpricetracker.com/api/v2/cards";

async function fetchPokemonPriceTracker(name, { graded = false } = {}) {
  const params = new URLSearchParams({ search: name, limit: "100" });
  if (graded) params.set("includeEbay", "true");
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
    // FIX (2026-08-26): a plain 404 from PokemonPriceTracker means "no
    // results matched this search" (confirmed against its docs) — that's a
    // normal, expected outcome (e.g. an obscure or newly-scanned name), not
    // an outage. Treating it as a hard failure (the old behavior) surfaced
    // a misleading "couldn't reach our card database" message instead of
    // the correct "couldn't confidently match a printing" one. Only a real
    // 5xx counts as a transient failure worth retrying/logging as an error.
    if (resp.status === 404) {
      console.log("[lookup] PokemonPriceTracker returned 404 (no match) for name=", name);
      return { data: [] };
    }

    const body = await resp.text().catch(() => "");
    console.error(`[lookup] PokemonPriceTracker request FAILED — status=`, resp.status, "body=", body.slice(0, 300), "name=", name);
    if (resp.status >= 500) {
      // Single source now (no cross-API fallback), so a real 5xx is worth
      // one fast retry rather than giving up immediately.
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

// PPT bakes the collector number into `name` for variant-disambiguation
// entries (e.g. "Medicham - 207/193"), but the AUTHORITATIVE number field
// is `cardNumber` on the raw object itself — confirmed from logs showing
// multiple distinct raw candidates that all share the bare name "Medicham"
// but have different `cardNumber` values. Prefer that field; only fall
// back to parsing the name suffix if it's missing.
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
    attackName: raw.attackName || null, // PPT doesn't appear to expose move data — kept for forward-compat
    tcgPlayerUrl: raw.tcgPlayerUrl || null,
    // CONFIRMED (2026-08-26 step 3, from PPT's own docs): real CDN image
    // fields. Checked in priority order, with the earlier guesses kept as
    // further fallbacks in case a given card response omits the CDN
    // fields for some reason.
    cardImageUrl: raw.imageCdnUrl || raw.imageCdnUrl200 || raw.imageUrl || raw.image || raw.images?.large || raw.images?.small || null,
    // Aggregate single-price fallback (used only if the per-variant
    // `variants` object below is missing/empty for this card).
    prices: raw.prices || null,
    // CONFIRMED (2026-08-26 step 3, from PPT's own docs): per-printing
    // pricing object, e.g. { "Holofoil": { marketPrice, lowPrice,
    // conditionUsed }, "Normal": {...}, "Reverse Holofoil": {...} }. Exact
    // key casing/naming not yet confirmed against a live response — see
    // buildPriceVariantsFromPPT below for the defensive handling.
    _rawVariants: raw.variants && typeof raw.variants === "object" ? raw.variants : null,
    _priceSource: "PokemonPriceTracker",
  };
}

// Builds the priceVariants object the frontend's dropdown expects (see
// content.js) from PPT's per-printing `variants` object. Defensive about
// exact field names since this is based on documentation examples, not a
// live-confirmed response — logs the raw shape so a real scan will reveal
// the truth fast if this needs correcting.
function buildPriceVariantsFromPPT(rawVariants) {
  if (!rawVariants) return null;
  const variants = {};
  for (const [key, v] of Object.entries(rawVariants)) {
    if (!v) continue;
    const basePrice = v.marketPrice ?? v.market ?? v.lowPrice ?? v.low;
    if (basePrice == null) continue;
    const conditions = {};
    for (const [tier, mult] of Object.entries(CONDITION_MULTIPLIERS)) {
      conditions[tier] = Math.round(basePrice * mult * 100) / 100;
    }
    variants[key] = { label: key, printEdition: key, basePrice, conditions };
  }
  return Object.keys(variants).length ? variants : null;
}

// Picks which variant is pre-selected in the dropdown. Prefers PPT's own
// stated `primaryPrinting` (from the aggregate `prices` object) if it
// matches one of the actual variant keys, since that's PPT's own signal
// for "the printing most of our data represents." Falls back to Gemini's
// stampType read (did the card actually show a legible "1st Edition"
// stamp) with a Holofoil > Reverse Holo > Normal preference order
// otherwise. Case-insensitive matching throughout since the exact key
// casing PPT uses isn't confirmed. The whole point of a manual dropdown
// is that a wrong guess here costs nothing — the user just switches it.
function pickDefaultVariantKey(priceVariants, read, primaryPrinting) {
  const keys = Object.keys(priceVariants);
  if (!keys.length) return null;

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

function buildAggregatePricing(card) {
  if (!card.prices || card.prices.market == null) return null;
  const basePrice = card.prices.market;
  const conditions = {};
  for (const [tier, mult] of Object.entries(CONDITION_MULTIPLIERS)) {
    conditions[tier] = Math.round(basePrice * mult * 100) / 100;
  }
  return { basePrice, conditions };
}

// Strips a trailing subtype tag (VMAX/VSTAR/GX/EX/ex/V/BREAK) off a card
// name. FIX (2026-08-26, first live test): a real scan of a Japanese
// "Toxtricity VMAX" got a perfect Gemini read (name, number, HP, set,
// attack all correct) but PokemonPriceTracker's search returned a hard
// 404 (zero results) for the exact string "Toxtricity VMAX" — not a
// scoring/matching failure, the search itself found nothing. Read.subtype
// already carries "VMAX" as its own field and is already a scoring
// signal (see scoreCandidate), so nothing is lost by searching on just
// the base species name and letting scoring do the disambiguation, if
// that's what PPT's search wants. See lookupCardPPT's retry logic below.
function stripSubtypeSuffix(name) {
  return String(name || "").replace(/\s+(VMAX|VSTAR|GX|EX|ex|V|BREAK)\s*$/i, "").trim();
}

// Used for BOTH English and Japanese scans. No explicit language filter is
// applied to the PokemonPriceTracker search — its dataset appears to store
// the English-translated species name in `name` regardless of which
// region a printing is actually from (confirmed from logs: a Japanese
// "Start Deck 100 Battle Collection" printing still had name="Medicham",
// not a Japanese string), so a plain name search already returns both
// regions mixed together. The existing number/HP/set scoring below —
// proven correct against a 33-candidate, single-language pool for the
// Medicham bug fix — should disambiguate the SPECIFIC printing the same
// way whether the pool has one region or two. Watch for wrong-region
// matches in logs; add an explicit `language` request param (PPT's
// marketing pages mention one, e.g. `language=japanese`, but the exact
// accepted values weren't confirmed in its docs) if that turns out to be
// a real problem.
async function lookupCardPPT(read) {
  let data = await fetchPokemonPriceTracker(read.cardName);
  if (!data) return { error: "card-db-unavailable" };

  let rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  console.log("[lookup] search=", read.cardName, "raw candidate count=", rawList.length, "sample=", JSON.stringify(rawList.slice(0, 3)).slice(0, 2500));

  // Base species name to filter/match against — updated below if a
  // subtype-stripped retry is needed and succeeds.
  let matchName = read.cardName;

  if (rawList.length === 0) {
    const stripped = stripSubtypeSuffix(read.cardName);
    if (stripped && stripped.toLowerCase() !== String(read.cardName || "").toLowerCase()) {
      console.log("[lookup] zero raw results for full name, retrying search with base species name=", stripped);
      const retryData = await fetchPokemonPriceTracker(stripped);
      if (retryData) {
        rawList = Array.isArray(retryData.data) ? retryData.data : Array.isArray(retryData) ? retryData : [];
        console.log("[lookup] retry search=", stripped, "raw candidate count=", rawList.length);
        if (rawList.length > 0) matchName = stripped;
      }
    }
  }

  // Hard name filter — PPT's `search` is fuzzy, not a strict name match
  // (this is the fix for the earlier Arceus-matched-to-Raticate bug
  // documented in the build-status doc). Keep only candidates whose name
  // actually contains the read species name.
  const wantedName = String(matchName || "").toLowerCase();
  const filtered = rawList.filter((c) => String(c.name || "").toLowerCase().includes(wantedName));

  if (filtered.length === 0) {
    console.log("[lookup] zero candidates survived the name filter for name=", read.cardName);
    return { notFound: true };
  }

  const candidates = filtered.map(normalizePptCard);
  console.log("[lookup] scored candidates=", JSON.stringify(candidates.map((c) => ({ name: c.name, number: c.number, hp: c.hp, subtypes: c.subtypes, hasVariants: !!c._rawVariants }))).slice(0, 3000));

  const { best, bestScore, tieCount } = pickBestCandidate(candidates, read, "[lookup]");
  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  if (tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
    console.log(`[lookup] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}`);
  }

  console.log("[lookup] raw variants object for best match:", JSON.stringify(best._rawVariants).slice(0, 1500));

  const priceVariants = buildPriceVariantsFromPPT(best._rawVariants);
  const priceVariantUsed = priceVariants ? pickDefaultVariantKey(priceVariants, read, best.prices?.primaryPrinting) : null;
  const chosenVariant = priceVariantUsed ? priceVariants[priceVariantUsed] : null;

  // Fall back to the old flat aggregate price if there's no usable
  // per-variant data for this specific card (e.g. a lower-traffic
  // printing PPT hasn't broken down by finish yet).
  const aggregatePricing = !chosenVariant ? buildAggregatePricing(best) : null;

  let noPriceNote = null;
  if (!chosenVariant && !aggregatePricing) {
    noPriceNote = "This printing hasn't synced a price into PokemonPriceTracker yet. Check the link below for current listings.";
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
    tcgplayerUrl: best.tcgPlayerUrl || null,
    marketPrice: chosenVariant ? chosenVariant.basePrice : aggregatePricing ? aggregatePricing.basePrice : null,
    conditionPrices: chosenVariant ? chosenVariant.conditions : aggregatePricing ? aggregatePricing.conditions : null,
    priceVariants,
    priceVariantUsed,
    _tcgSearchName: tcgSearchName,
  };
}

// ---------------------------------------------------------------------------
// Graded slab pricing (Japanese or English) — PokemonPriceTracker w/ eBay comps
// ---------------------------------------------------------------------------

async function lookupGradedPrice(read) {
  const data = await fetchPokemonPriceTracker(read.cardName, { graded: true });
  if (!data) return null;

  const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  const wantedName = String(read.cardName || "").toLowerCase();
  const filtered = rawList.filter((c) => String(c.name || "").toLowerCase().includes(wantedName));
  if (filtered.length === 0) return null;

  for (const c of filtered) {
    const rawComps = c.gradedSales || c.ebayComps || c.ebay || [];

    // Docs suggest `ebay` may be a plain object keyed by grade (e.g.
    // { psa10: { count, avgPrice }, psa9: {...} }) rather than an array of
    // individual comps like the earlier reconstruction assumed. Handle
    // both shapes defensively — this whole path remains unconfirmed
    // against a real graded slab scan either way (see build-status doc).
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
    console.error("[identify] Gemini call failed:", e && e.message);
    res.status(200).json({ found: false, error: "gemini-failed", detail: e && e.message });
    return;
  }

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

    // Still need the underlying raw-card estimate as a fallback / for the
    // "this under-values a slab" warning path.
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
      res.status(200).json({
        found: false,
        reason: "Couldn't reach our card database right now (it's been intermittently flaky) — try again in a moment.",
        usage,
      });
      return;
    }

    if (result.notFound) {
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

  result.usage = usage;
  res.status(200).json(result);
};
