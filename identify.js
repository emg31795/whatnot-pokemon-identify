// api/identify.js
//
// REBUILT 2026-08-24. The original source for this file was lost when the
// chat session that wrote it ended without ever being saved to a git repo
// (this Vercel project has no linked repo — confirmed via the Vercel API).
// The only surviving record of how this file behaved is the project's
// build-status doc (env vars, scoring weights, response shape) and live
// Vercel runtime logs pulled from this exact project, which is what this
// rewrite is based on. Where the real upstream schema (specifically
// PokemonPriceTracker's exact endpoint/response shape) wasn't fully
// recoverable from the logs, that's called out inline — test those paths
// live and adjust if the real API disagrees.
//
// PRIORITY FIX IN THIS REWRITE: the confirmed bug where a Japanese lookup
// picked a completely wrong candidate (a "369/742" Medicham, HP 120) even
// though the candidate matching Gemini's read exactly (number "054/083")
// was present in the pool. This rewrite fixes that by (a) using ONE shared
// scoring function for both English and Japanese paths instead of two
// independently-maintained copies (the "duplicated scoring logic" risk the
// build-status doc had flagged as a future risk — it appears to have
// actually caused this bug), and (b) making the number comparison robust
// to formatting noise (leading zeros, missing "/total", stray whitespace)
// instead of requiring an exact string match, since Gemini's own OCR of
// the printed number is itself somewhat noisy across rescans of the same
// physical card.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 6500;
const CARDDB_TIMEOUT_MS = 3500;
const CARDDB_RETRY_TIMEOUT_MS = 1500;
const GRADED_TIMEOUT_MS = 1500;

// Per-token estimate, see build-status doc's "Tracking $ spend per scan"
// section. Adjust if Google changes pricing — Google AI Studio / Cloud
// Console billing is the source of truth, this is just for the running
// on-screen estimate.
const GEMINI_INPUT_USD_PER_1M = 0.30;
const GEMINI_OUTPUT_USD_PER_1M = 2.50;

// Condition-price multipliers applied to the market price to build the
// NM/LP/MP/HP/DMG table content.js renders. Reverse-engineered from the
// exact figures shown in the build-status doc's live examples (e.g.
// Market $1.00 -> NM $1.00 / LP $0.85 / MP $0.70).
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
// Shared scoring — ONE function used by both the English and Japanese
// lookup paths. Consolidating this (previously two independently-maintained
// copies, per the build-status doc's flagged "code-quality risk") is a
// direct part of the fix: divergence between the two copies is the leading
// theory for how the Japanese path stopped correctly rewarding an exact
// number match.
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
// in the build-status doc. Shared by both lookup paths.
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
// English path — pokemontcg.io
// ---------------------------------------------------------------------------

async function fetchPokemonTcgIo(name) {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`;
  const headers = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    console.error("[EN lookup] pokemontcg.io request threw:", e && e.message);
    return null;
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[EN lookup] pokemontcg.io request FAILED — status=`, resp.status, "body=", body.slice(0, 300), "name=", name);
    if (resp.status >= 500) {
      // One retry on a transient gateway/server error, not on 4xx.
      try {
        const retryResp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
        if (retryResp.ok) return await retryResp.json();
        const retryBody = await retryResp.text().catch(() => "");
        console.error(`[EN lookup] pokemontcg.io request FAILED (after retry if 5xx) — status=`, retryResp.status, "body=", retryBody.slice(0, 300), "name=", name);
      } catch (e2) {
        console.error("[EN lookup] pokemontcg.io retry threw:", e2 && e2.message, "name=", name);
      }
    }
    return null;
  }

  return await resp.json();
}

function buildPriceVariants(tcgplayer) {
  if (!tcgplayer || !tcgplayer.prices) return null;
  const labelFor = {
    normal: "Normal",
    holofoil: "Holofoil",
    reverseHolofoil: "Reverse Holofoil",
    "1stEditionNormal": "1st Edition Normal",
    "1stEditionHolofoil": "1st Edition Holofoil",
  };
  const variants = {};
  for (const [key, priceObj] of Object.entries(tcgplayer.prices)) {
    if (!priceObj) continue;
    const basePrice = priceObj.market ?? priceObj.mid ?? priceObj.low ?? null;
    if (basePrice == null) continue;
    const conditions = {};
    for (const [tier, mult] of Object.entries(CONDITION_MULTIPLIERS)) {
      conditions[tier] = Math.round(basePrice * mult * 100) / 100;
    }
    variants[key] = {
      label: labelFor[key] || key,
      basePrice,
      conditions,
      printEdition: key.startsWith("1stEdition") ? "1st Edition" : "Unlimited",
    };
  }
  return Object.keys(variants).length ? variants : null;
}

function pickDefaultVariantKey(priceVariants, read) {
  const keys = Object.keys(priceVariants);
  if (read.stampType === "1st Edition") {
    const withEdition = keys.find((k) => k.startsWith("1stEdition"));
    if (withEdition) return withEdition;
  }
  const preference = ["holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil", "1stEditionNormal"];
  for (const p of preference) {
    if (keys.includes(p)) return p;
  }
  return keys[0];
}

async function lookupCard(read) {
  const data = await fetchPokemonTcgIo(read.cardName);
  if (!data) return { error: "card-db-unavailable" };

  const raw = data.data || [];
  if (raw.length === 0) {
    console.log("[EN lookup] zero candidates for name=", read.cardName);
    return { notFound: true };
  }
  if (raw.length === 1) {
    console.log("[EN lookup] single-candidate short-circuit, name=", read.cardName, "id=", raw[0].id);
  }

  const candidates = raw.map((c) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    hp: c.hp,
    subtypes: c.subtypes || [],
    setName: c.set?.name,
    attackName: c.attacks?.[0]?.name,
    tcgplayer: c.tcgplayer,
    images: c.images,
  }));

  const { best, bestScore, tieCount } = pickBestCandidate(candidates, read, "[EN lookup]");
  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  if (tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
  }

  const priceVariants = buildPriceVariants(best.tcgplayer);
  const priceVariantUsed = priceVariants ? pickDefaultVariantKey(priceVariants, read) : null;
  const variant = priceVariants ? priceVariants[priceVariantUsed] : null;

  let noPriceNote = null;
  if (!priceVariants) {
    noPriceNote =
      "This printing hasn't synced a price into our free data source (pokemontcg.io) yet. TCGPlayer itself may already have real listings/pricing — check the link below for the current price.";
  }

  return {
    found: true,
    cardName: best.name,
    setName: best.setName,
    cardImageUrl: best.images?.large || best.images?.small || null,
    matchConfidence,
    ambiguousNote,
    noPriceNote,
    tcgplayerUrl: best.tcgplayer?.url || null,
    printEdition: variant ? variant.printEdition : null,
    priceVariants,
    priceVariantUsed,
    marketPrice: variant ? variant.basePrice : null,
    conditionPrices: variant ? variant.conditions : null,
  };
}

// ---------------------------------------------------------------------------
// Japanese path — PokemonPriceTracker
//
// NOTE: this project's real PokemonPriceTracker endpoint/query shape was
// only partially recoverable from Vercel logs (we can see the shape of the
// data it returns, not the exact request URL the original code used). The
// base URL/path below is a reasonable reconstruction — verify against a
// live scan and adjust PPT_BASE_URL / the query params if needed.
// ---------------------------------------------------------------------------

const PPT_BASE_URL = process.env.PPT_BASE_URL || "https://www.pokemonpricetracker.com/api/v2/prices";

async function fetchPokemonPriceTracker(name, { graded = false } = {}) {
  const params = new URLSearchParams({ search: name, limit: "100" });
  if (graded) params.set("includeEbay", "true");
  const url = `${PPT_BASE_URL}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${process.env.POKEMONPRICETRACKER_API_KEY}` };

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    console.error("[JP lookup] PokemonPriceTracker request threw:", e && e.message);
    return null;
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[JP lookup] PokemonPriceTracker request FAILED — status=`, resp.status, "body=", body.slice(0, 300), "name=", name);
    if (resp.status >= 500) {
      try {
        const retryResp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
        if (retryResp.ok) return await retryResp.json();
      } catch (e2) {
        console.error("[JP lookup] PokemonPriceTracker retry threw:", e2 && e2.message, "name=", name);
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
    prices: raw.prices || null,
    _priceSource: "PokemonPriceTracker",
  };
}

function buildJapaneseVariantPricing(card) {
  if (!card.prices || card.prices.market == null) return null;
  const basePrice = card.prices.market;
  const conditions = {};
  for (const [tier, mult] of Object.entries(CONDITION_MULTIPLIERS)) {
    conditions[tier] = Math.round(basePrice * mult * 100) / 100;
  }
  return { basePrice, conditions };
}

async function lookupCardJapanese(read) {
  const data = await fetchPokemonPriceTracker(read.cardName);
  if (!data) return { error: "card-db-unavailable" };

  const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  console.log("[JP lookup] search=", read.cardName, "raw candidate count=", rawList.length, "sample=", JSON.stringify(rawList.slice(0, 8)).slice(0, 2000));

  // Hard name filter — PPT's `search` is fuzzy, not a strict name match
  // (this is the fix for the earlier Arceus-matched-to-Raticate bug
  // documented in the build-status doc). Keep only candidates whose name
  // actually contains the read species name.
  const wantedName = String(read.cardName || "").toLowerCase();
  const filtered = rawList.filter((c) => String(c.name || "").toLowerCase().includes(wantedName));

  if (filtered.length === 0) {
    console.log("[JP lookup] zero candidates survived the name filter for name=", read.cardName);
    return { notFound: true };
  }

  const candidates = filtered.map(normalizePptCard);
  console.log("[JP lookup] scored candidates=", JSON.stringify(candidates.map((c) => ({ name: c.name, number: c.number, hp: c.hp, subtypes: c.subtypes }))).slice(0, 3000));

  const { best, bestScore, tieCount } = pickBestCandidate(candidates, read, "[JP lookup]");
  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  if (tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
    console.log(`[JP lookup] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}`);
  }

  const pricing = buildJapaneseVariantPricing(best);
  let noPriceNote = null;
  if (!pricing) {
    noPriceNote =
      "This printing hasn't synced a price into PokemonPriceTracker yet. Check the link below for current listings.";
  }

  const tcgSearchName = String(best.name).replace(/\s*-\s*\S+\/\S+\s*$/, "").trim();

  return {
    found: true,
    cardName: best.name,
    cardLanguage: "Japanese",
    setName: best.setName,
    matchConfidence,
    ambiguousNote,
    noPriceNote,
    tcgplayerUrl: best.tcgPlayerUrl || null,
    marketPrice: pricing ? pricing.basePrice : null,
    conditionPrices: pricing ? pricing.conditions : null,
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

  // Look for a sold-comp entry matching the read grader+grade.
  for (const c of filtered) {
    const comps = c.gradedSales || c.ebayComps || [];
    for (const comp of comps) {
      if (
        read.grader &&
        read.grade &&
        String(comp.grader || "").toLowerCase() === String(read.grader).toLowerCase() &&
        String(comp.grade || "") === String(read.grade || "")
      ) {
        return {
          gradedPrice: comp.price,
          nearbyGradedPrices: comps
            .filter((x) => x !== comp)
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
    const baseLookup = read.language === "Japanese" ? await lookupCardJapanese(read) : await lookupCard(read);

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
      result = read.language === "Japanese" ? await lookupCardJapanese(read) : await lookupCard(read);
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
          ? `This is a "${read.stampType}" stamped promo — neither of our data sources track pricing for stamped promos separately from the standard printing, so the price shown likely understates its real value.`
          : null,
    };
  }

  result.usage = usage;
  res.status(200).json(result);
};
