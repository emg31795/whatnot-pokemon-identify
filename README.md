# Whatnot Pokémon Card ID (Free)

A free clone of [Pallet Trade](https://pallet.trade/)'s $9.99/mo card-identification
feature, built as a Chrome extension + serverless backend for Whatnot livestreams.

## What's in this repo

- **`api/identify.js`** — the backend, deployed as a Vercel serverless
  function at `/api/identify`. Takes a base64 video frame, identifies the
  Pokémon card with Gemini vision, looks up the exact printing (English via
  pokemontcg.io — with a Normal/Holofoil/Reverse-Holo/1st-Edition variant
  picker — falling back to PokemonPriceTracker if pokemontcg.io fails;
  Japanese and graded slabs via PokemonPriceTracker), and returns pricing
  by condition. Tuned to answer in a few seconds — this is meant to inform
  a real-time buy/bid decision on a live stream, not just eventually be
  correct.

This file was rebuilt from scratch on 2026-08-24 after the original source
was lost (the chat session that wrote it never got saved to a repo — see
"History" below). On 2026-08-26 it was briefly consolidated onto
PokemonPriceTracker only, then partially reverted the same day after
testing made clear the print-variant picker is essential, not optional —
see the top-of-file comment in `api/identify.js` for the full history.

**Not included here yet:** the Chrome extension frontend (`manifest.json`,
`content.js`, the draggable panel UI). Only the backend source survived
into a durable location; the extension currently exists as a built zip
the user has locally, not as source in this repo. Worth adding here too —
ask for it next time this project is touched.

## Live deployment

- Vercel project: `whatnot-pokemon-identify` (team `leasedraftai`)
- Production URL: `https://whatnot-pokemon-identify.vercel.app/api/identify`
- The Chrome extension is already pointed at this URL.

## Environment variables

Set these in the Vercel project's Environment Variables settings (see
`.env.example` for the full list with notes):

- `GEMINI_API_KEY` — required
- `GEMINI_MODEL` — optional, defaults to `gemini-3.6-flash`
- `POKEMONTCG_API_KEY` — optional but recommended (raises pokemontcg.io's
  rate limit; English lookups still work and auto-fall-back without it)
- `POKEMONPRICETRACKER_API_KEY` — required (Japanese cards, graded slabs,
  and the English fallback path)
- `PPT_BASE_URL` — optional override

## Known issues / open items

- pokemontcg.io was briefly dropped entirely on 2026-08-26, then restored
  the same day — the print-variant picker it provides turned out to be
  essential for this project's actual use case (accurate per-finish
  pricing to inform real-money buy/bid decisions), not a nice-to-have.
  English lookups now try pokemontcg.io first and automatically fall back
  to PokemonPriceTracker (single aggregate price, no variant picker) if
  it fails — see the top-of-file comment in `api/identify.js`.
- pokemontcg.io's free tier is rate-limited without a key (1,000/day,
  30/min) — 35 separate error groups were logged in one week prior to
  this fallback being added. Getting a free `POKEMONTCG_API_KEY` (no
  payment, just registration at pokemontcg.io/register) raises that to
  20,000/day and should reduce how often the fallback triggers at all.
- The English-card thumbnail (`cardImageUrl`) and TCGPlayer link come
  from pokemontcg.io directly when that path succeeds; if it falls back
  to PokemonPriceTracker, the image field is unconfirmed (see
  `normalizePptCard`'s defensive field-name checks).
- A 404 from PokemonPriceTracker (fixed 2026-08-26) now correctly means
  "no match found" instead of being treated as a database outage.
- Graded-slab (PSA/BGS/CGC/SGC) pricing has never been empirically
  verified against a real slab scan.
- A confirmed scoring bug (Japanese lookup picking a completely wrong
  printing even when the correct one was in the candidate pool) was fixed
  by unifying all lookup paths into one shared scoring function with
  fuzzier number matching. Deployed, but not yet confirmed against a real
  rescan in an actual live stream — check Vercel logs for the
  `[lookup:*] best=` lines next time.
- Timeouts are tuned for a ~2-5s target response but that's a ceiling,
  not a benchmarked number — actual latency against a real stream hasn't
  been measured yet. See "Test cases" tracking doc in the Claude project
  for real numbers once testing resumes.

## History

The original backend source was lost when the chat session that built it
ended without ever being committed anywhere. It was reconstructed from
this project's own documentation (env vars, scoring weights, response
shapes) plus live Vercel runtime logs, then redeployed directly to the
existing (unlinked) Vercel project. This repo is the fix for that — now
that the code has a real home, a lost session should never mean losing
the only copy again.
