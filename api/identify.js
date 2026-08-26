// api/identify.js
//
// REBUILT 2026-08-24 after the original source was lost to a dropped chat
// session; see the project's build-status doc for that history. That
// rewrite used pokemontcg.io (free) for English cards and PokemonPriceTracker
// (paid, $9.99/mo) for Japanese cards + graded slabs.
//
// CONSOLIDATED 2026-08-26, then PARTIALLY REVERTED same day: pokemontcg.io
// was briefly dropped entirely in favor of PokemonPriceTracker for both
// languages, trading away the Normal/Holofoil/Reverse Holofoil/1st-Edition
// print-variant picker for reliability. User feedback made clear that
// trade-off is unacceptable for this use case: this tool exists to make a
// real-money buy/bid decision on live cards, and losing per-finish pricing
// costs real accuracy. So the architecture is now:
//
//   ENGLISH cards -> pokemontcg.io FIRST (variant picker + card image),
//                    falling back to PokemonPriceTracker automatically if
//                    pokemontcg.io fails or times out (never silently
//                    returning nothing just because one source hiccuped).
//   JAPANESE cards -> PokemonPriceTracker only (pokemontcg.io's dataset is
//                    English-market only).
//   GRADED SLABS   -> PokemonPriceTracker eBay-comp lookup either way, with
//                    the raw-card lookup above (which now also tries
//                    pokemontcg.io first) as the underlying estimate.
//
// This keeps the reliability win from the 2026-08-26 consolidation (a
// pokemontcg.io outage no longer means "couldn't identify the card" — it
// falls through to the paid source instead) while restoring the accuracy
// win of per-finish pricing for the common case. pokemontcg.io's own
// reliability is also meaningfully improved by setting POKEMONTCG_API_KEY
// (free registration at pokemontcg.io/register raises the rate limit from
// 1,000/day & 30/min to 20,000/day) — recommended, not required, since the
// PPT fallback covers the gap either way.
//
// SPEED: this tool needs to return in ~2-5s so it's useful for a live
// buy/bid decision, not just eventually-correct. Timeouts below are tuned
// tight on that assumption: pokemontcg.io gets ONE fast attempt with NO
// retry (a slow/failing English lookup should fall through to PPT
// immediately, not burn time retrying the same flaky source first).
// PokemonPriceTracker (no fallback available for it) keeps one retry on a
// real 5xx since there's nowhere else to fall through to. Gemini's own
// timeout was trimmed from 6.5s to 5s for the same reason. These are
// timeout CEILINGS (safety nets against a hung request), not the expected
// latency — actual latency depends on how fast Gemini + the card APIs
// respond, which hasn't been benchmarked against a live stream yet. Watch
// `usage`/response time on real scans and tighten further if needed.
//
// PokemonPriceTracker's base URL, endpoint path, and Bearer-auth header
// format were confirmed correct against its live docs during the
// 2026-08-26 work.
//
// Also fixed 2026-08-26: fetchPokemonPriceTracker used to treat a plain 404
// from PokemonPriceTracker (which, per its docs, just means "no results
// matched this search" — normal, not an outage) the same as a real 5xx
// failure, surfacing a scary "couldn't reach our card database" message
// instead of the correct "couldn't confidently match a printing" one. Now a
// 404 returns an explicit empty result set instead. This fix is unaffected
// by the pokemontcg.io restoration above.
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
// physical card. This shared scoring function is now used by THREE lookup
// paths (pokemontcg.io, PokemonPriceTracker, and the graded-slab path) —
// still the single source of truth for "which candidate is the real card."

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
// Shared scoring — ONE function used by EVERY lookup path (pokemontcg.io,
// PokemonPriceTracker, and the graded-slab path). Consolidating this
// (previously two independently-maintained copies, per the build-status
// doc's flagged "code-quality risk") is a direct part of the Medicham-bug
// fix: divergence between copies is the leading theory for how the
// Japanese path stopped correctly rewarding an exact number match. Keeping
// it as ONE function even as sources multiplied (2026-08-26) is deliberate
// — every new lookup path reuses this instead of growing its own copy.
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
// in the build-status doc. Shared by every lookup path.
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
// Card lookup + pricing, ENGLISH path — pokemontcg.io (free, variant-aware)
//
// Restored 2026-08-26 (see top-of-file comment) specifically to keep the
// Normal/Holofoil/Reverse Holofoil/1st-Edition print-variant picker, which
// PokemonPriceTracker's response shape doesn't support (one aggregate
// market price per card, not a per-finish breakdown).
// ---------------------------------------------------------------------------

const POKEMONTCG_BASE_URL = "https://api.pokemontcg.io/v2/cards";

// NO retry here on purpose — see the SPEED comment at the top of the file.
// A slow/failing pokemontcg.io request should fall through to the
// PokemonPriceTracker fallback (lookupCardEnglish below) immediately
// rather than burning another ~1-2s retrying the same flaky source first.
async function fetchPokemonTcgIo(name) {
  const q = encodeURIComponent(`name:"${name}"`);
  const url = `${POKEMONTCG_BASE_URL}?q=${q}&pageSize=100`;
  const headers = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  let resp;
  try {
    resp = await fetchWithTimeout(url, { headers }, CARDDB_TIMEOUT_MS);
  } catch (e) {
    console.error("[lookup:en] pokemontcg.io request threw:", e && e.message, "name=", name);
    return null;
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[lookup:en] pokemontcg.io request FAILED — status=", resp.status, "body=", body.slice(0, 300), "name=", name);
    return null;
  }

  try {
    return await resp.json();
  } catch (e) {
    console.error("[lookup:en] pokemontcg.io returned unparseable JSON:", e && e.message);
    return null;
  }
}

// pokemontcg.io's tcgplayer.prices object has one entry per print
// finish/edition (normal, holofoil, reverseHolofoil, 1stEditionNormal,
// 1stEditionHolofoil, unlimited, unlimitedHolofoil — not every card has
// every key). Build one priced+labeled variant object per key so the
// frontend's dropdown (priceVariants/priceVariantUsed, see content.js) can
// show ALL of them and let the user override the AI's guess.
const VARIANT_LABELS = {
  normal: "Normal",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse Holofoil",
  "1stEditionNormal": "1st Edition",
  "1stEditionHolofoil": "1st Edition Holofoil",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited Holofoil",
};

function buildPriceVariants(tcgplayer) {
  if (!tcgplayer || !tcgplayer.prices) return null;
  const variants = {};
  for (const [key, p] of Object.entries(tcgplayer.prices)) {
    if (!p) continue;
    const basePrice = p.market ?? p.mid ?? p.high ?? p.low;
    if (basePrice == null) continue;
    const conditions = {};
    for (const [tier, mult] of Object.entries(CONDITION_MULTIPLIERS)) {
      conditions[tier] = Math.round(basePrice * mult * 100) / 100;
    }
    variants[key] = {
      label: VARIANT_LABELS[key] || key,
      printEdition: VARIANT_LABELS[key] || key,
      basePrice,
      conditions,
    };
  }
  return Object.keys(variants).length ? variants : null;
}

// Picks which variant is pre-selected in the dropdown. Gemini's stampType
// read is the main signal (did the card actually show a legible "1st
// Edition" stamp) — everything else defaults to preferring the
// highest-quality finish PokemonTCG actually has data for, on the
// assumption that's the most commonly relevant one for a live-stream
// buy/sell decision. This is a reasonable reconstruction, not a confirmed-
// original algorithm; the whole point of a manual dropdown is that a wrong
// guess here costs nothing — the user just switches it.
function pickDefaultVariantKey(priceVariants, read) {
  const keys = Object.keys(priceVariants);
  if (!keys.length) return null;
  const is1st = String(read.stampType || "").toLowerCase() === "1st edition";
  const preferenceOrder = is1st
    ? ["1stEditionHolofoil", "1stEditionNormal", "holofoil", "reverseHolofoil", "normal", "unlimitedHolofoil", "unlimited"]
    : ["holofoil", "reverseHolofoil", "normal", "unlimitedHolofoil", "unlimited", "1stEditionHolofoil", "1stEditionNormal"];
  for (const k of preferenceOrder) {
    if (keys.includes(k)) return k;
  }
  return keys[0];
}

function normalizeTcgIoCard(raw) {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number || null,
    hp: raw.hp || null,
    subtypes: Array.isArray(raw.subtypes) ? raw.subtypes : [],
    setName: raw.set?.name || null,
    attackName: raw.attacks?.[0]?.name || null,
    tcgPlayerUrl: raw.tcgplayer?.url || null,
    cardImageUrl: raw.images?.large || raw.images?.small || null,
    _tcgplayer: raw.tcgplayer || null,
    _priceSource: "pokemontcg.io",
  };
}

async function lookupCardEnglish(read) {
  const data = await fetchPokemonTcgIo(read.cardName);
  if (!data) return { error: "card-db-unavailable" };

  const rawList = Array.isArray(data.data) ? data.data : [];
  console.log("[lookup:en] search=", read.cardName, "raw candidate count=", rawList.length);

  if (rawList.length === 0) {
    return { notFound: true };
  }

  const candidates = rawList.map(normalizeTcgIoCard);
  const { best, bestScore, tieCount } = pickBestCandidate(candidates, read, "[lookup:en]");
  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  if (tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
    console.log(`[lookup:en] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}`);
  }

  const priceVariants = buildPriceVariants(best._tcgplayer);
  const priceVariantUsed = priceVariants ? pickDefaultVariantKey(priceVariants, read) : null;
  const chosenVariant = priceVariantUsed ? priceVariants[priceVariantUsed] : null;

  let noPriceNote = null;
  if (!priceVariants) {
    noPriceNote = "This printing hasn't synced a price into pokemontcg.io/TCGPlayer yet. Check the link below for current listings.";
  }

  return {
    found: true,
    cardName: best.name,
    setName: best.setName,
    cardImageUrl: best.cardImageUrl,
    matchConfidence,
    ambiguousNote,
    noPriceNote,
    tcgplayerUrl: best.tcgPlayerUrl,
    marketPrice: chosenVariant ? chosenVariant.basePrice : null,
    conditionPrices: chosenVariant ? chosenVariant.conditions : null,
    priceVariants,
    priceVariantUsed,
    _tcgSearchName: best.name,
  };
}

// ---------------------------------------------------------------------------
// Card lookup + pricing, JAPANESE path (and English FALLBACK) —
// PokemonPriceTracker
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
    console.error("[lookup:ppt] PokemonPriceTracker request threw:", e && e.message);
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
      console.log("[lookup:ppt] PokemonPriceTracker returned 404 (no match) for name=", name);
      return { data: [] };
    }

    const body = await resp.text().catch(() => "");
    console.error(`[lookup:ppt] PokemonPriceTracker request FAILED — status=`, resp.status, "body=", body.slice(0, 300), "name=", name);
    if (resp.status >= 500) {
      try {
        const retryResp = await fetchWithTimeout(url, { headers }, CARDDB_RETRY_TIMEOUT_MS);
        if (retryResp.ok) return await retryResp.json();
      } catch (e2) {
        console.error("[lookup:ppt] PokemonPriceTracker retry threw:", e2 && e2.message, "name=", name);
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
    // UNCONFIRMED: no image field was visible in PokemonPriceTracker's
    // documented response shape, unlike pokemontcg.io's `images.large`.
    // Checking a few plausible field names defensively — if none of these
    // are real, cardImageUrl just stays null and the frontend already
    // handles that (no thumbnail shown).
    cardImageUrl: raw.imageUrl || raw.image || raw.images?.large || raw.images?.small || null,
    prices: raw.prices || null,
    _priceSource: "PokemonPriceTracker",
  };
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

// Used for Japanese scans always, and as the automatic fallback for
// English scans when pokemontcg.io fails/times out/has no match (see
// lookupCard below). No explicit language filter is applied to the
// PokemonPriceTracker search — its dataset appears to store the
// English-translated species name in `name` regardless of which region a
// printing is actually from (confirmed from logs: a Japanese "Start Deck
// 100 Battle Collection" printing still had name="Medicham", not a
// Japanese string), so a plain name search already returns both regions
// mixed together. The existing number/HP/set scoring below — proven
// correct against a 33-candidate, single-language pool for the Medicham
// bug fix — should disambiguate the SPECIFIC printing the same way
// whether the pool has one region or two. Watch for wrong-region matches
// in logs; add an explicit `language` request param (PPT's marketing
// pages mention one, e.g. `language=japanese`, but the exact accepted
// values weren't confirmed in its docs) if that turns out to be a real
// problem.
//
// NOTE: this path returns a single aggregate market price, NOT a
// priceVariants object — that's the accuracy trade-off PokemonPriceTracker
// doesn't let us avoid for Japanese cards specifically (its response shape
// has one `prices.market` per card entry, not a per-finish breakdown).
async function lookupCardPPT(read) {
  const data = await fetchPokemonPriceTracker(read.cardName);
  if (!data) return { error: "card-db-unavailable" };

  const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  console.log("[lookup:ppt] search=", read.cardName, "raw candidate count=", rawList.length, "sample=", JSON.stringify(rawList.slice(0, 8)).slice(0, 2000));

  // Hard name filter — PPT's `search` is fuzzy, not a strict name match
  // (this is the fix for the earlier Arceus-matched-to-Raticate bug
  // documented in the build-status doc). Keep only candidates whose name
  // actually contains the read species name.
  const wantedName = String(read.cardName || "").toLowerCase();
  const filtered = rawList.filter((c) => String(c.name || "").toLowerCase().includes(wantedName));

  if (filtered.length === 0) {
    console.log("[lookup:ppt] zero candidates survived the name filter for name=", read.cardName);
    return { notFound: true };
  }

  const candidates = filtered.map(normalizePptCard);
  console.log("[lookup:ppt] scored candidates=", JSON.stringify(candidates.map((c) => ({ name: c.name, number: c.number, hp: c.hp, subtypes: c.subtypes }))).slice(0, 3000));

  const { best, bestScore, tieCount } = pickBestCandidate(candidates, read, "[lookup:ppt]");
  if (!best) return { notFound: true };

  let matchConfidence = confidenceForScore(bestScore);
  let ambiguousNote = null;
  if (tieCount >= 2) {
    matchConfidence = "Low";
    ambiguousNote = ambiguousNoteText();
    console.log(`[lookup:ppt] AMBIGUOUS MATCH: ${tieCount} distinct candidates tied at score ${bestScore}`);
  }

  const pricing = buildAggregatePricing(best);
  let noPriceNote = null;
  if (!pricing) {
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
    marketPrice: pricing ? pricing.basePrice : null,
    conditionPrices: pricing ? pricing.conditions : null,
    priceVariants: null,
    priceVariantUsed: null,
    _tcgSearchName: tcgSearchName,
  };
}

// ---------------------------------------------------------------------------
// Top-level lookup dispatcher — routes by language, with automatic
// cross-source fallback for English cards (2026-08-26).
// ---------------------------------------------------------------------------

async function lookupCard(read) {
  if (read.language === "Japanese") {
    return lookupCardPPT(read);
  }

  let result;
  try {
    result = await lookupCardEnglish(read);
  } catch (e) {
    console.error("[lookup] pokemontcg.io path threw:", e && e.message);
    result = { error: "lookup-failed" };
  }

  if (!result || result.error || result.notFound) {
    console.log(
      "[lookup] pokemontcg.io path did not produce a usable match (",
      result && (result.error || "notFound"),
      ") — falling back to PokemonPriceTracker for name=",
      read.cardName
    );
    let pptResult;
    try {
      pptResult = await lookupCardPPT(read);
    } catch (e) {
      console.error("[lookup] PokemonPriceTracker fallback threw:", e && e.message);
      pptResult = null;
    }
    if (pptResult && pptResult.found) {
      pptResult._usedFallback = true;
      return pptResult;
    }
    // Neither source produced a match — return whichever failure shape the
    // primary attempt had, so the handler's existing error messaging still
    // applies correctly (card-db-unavailable vs. notFound).
    return result;
  }

  return result;
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
    // "this under-values a slab" warning path. Goes through the same
    // pokemontcg.io-first dispatcher as a normal scan, so a graded English
    // card still gets its variant picker + image when a raw-card estimate
    // is shown.
    const baseLookup = await lookupCard(read);

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
      result = await lookupCard(read);
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
