# Whatnot Pokémon Card ID (Free)

A free clone of [Pallet Trade](https://pallet.trade/)'s $9.99/mo card-identification
feature, built as a Chrome extension + serverless backend for Whatnot livestreams.

## What's in this repo

- **`api/identify.js`** — the backend, deployed as a Vercel serverless
  function at `/api/identify`. Takes a base64 video frame, identifies the
  Pokémon card with Gemini vision, looks up the exact printing via
  PokemonPriceTracker (English, Japanese, and graded slabs all through the
  one subscription, including a Normal/Holofoil/Reverse-Holo/1st-Edition
  variant picker via PPT's own per-printing data), and returns pricing by
  condition. Tuned to answer in a few seconds — this is meant to inform a
  real-time buy/bid decision on a live stream, not just eventually be
  correct.

This file was rebuilt from scratch on 2026-08-24 after the original source
was lost (the chat session that wrote it never got saved to a repo — see
"History" below). It went through two more architecture changes on
2026-08-26 alone: first consolidating onto PokemonPriceTracker only
(losing the variant picker), then trying to restore it via pokemontcg.io
—  only to discover pokemontcg.io itself had been folded into Scrydex and
was no longer free. The final fix was realizing PokemonPriceTracker
already exposes per-variant pricing and real card images that earlier
research had missed. See the top-of-file comment in `api/identify.js`
for the full history.

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
- `POKEMONPRICETRACKER_API_KEY` — required (the single data source for
  everything: English, Japanese, graded slabs, variant pricing, images)
- `PPT_BASE_URL` — optional override

## Known issues / open items

- pokemontcg.io is no longer usable as a free data source — it's been
  folded into Scrydex (Pallet Trade's own paid source), starting at
  $29/mo. It was briefly tried as an English-only source on 2026-08-26
  before this was discovered; that code path has been removed entirely.
- The per-variant pricing (`priceVariants`/`priceVariantUsed`) and card
  thumbnail (`cardImageUrl`) now come from PokemonPriceTracker's own
  `variants` and `imageCdnUrl` fields. **These exact field names are from
  PPT's documentation, not yet confirmed against a live API response** —
  `buildPriceVariantsFromPPT` and `normalizePptCard` log the raw shape on
  every request specifically so this can be corrected fast from real
  traffic if the docs turn out to be imprecise. Check Vercel logs
  (`[lookup] raw variants object for best match:`) after the next live
  scan.
- If a card has no per-variant data at all, the code falls back to the
  old flat `prices.market` aggregate rather than showing nothing.
- A 404 from PokemonPriceTracker now correctly means "no match found"
  instead of being treated as a database outage.
- Graded-slab (PSA/BGS/CGC/SGC) pricing has never been empirically
  verified against a real slab scan, and the eBay-comps parsing now
  defensively handles two possible response shapes (array of comps, or an
  object keyed by grade) since the exact shape isn't confirmed either.
- A confirmed scoring bug (Japanese lookup picking a completely wrong
  printing even when the correct one was in the candidate pool) was fixed
  by unifying all lookup paths into one shared scoring function with
  fuzzier number matching. Deployed, but not yet confirmed against a real
  rescan in an actual live stream — check Vercel logs for the
  `[lookup] best=` line next time.
- Timeouts are tuned for a ~2-5s target response but that's a ceiling,
  not a benchmarked number — actual latency against a real stream hasn't
  been measured yet. See `test-cases.md` in the Claude project for real
  numbers once testing resumes.

## History

The original backend source was lost when the chat session that built it
ended without ever being committed anywhere. It was reconstructed from
this project's own documentation (env vars, scoring weights, response
shapes) plus live Vercel runtime logs, then redeployed directly to the
existing (unlinked) Vercel project. This repo is the fix for that — now
that the code has a real home, a lost session should never mean losing
the only copy again.
