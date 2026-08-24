# Whatnot Pokémon Card ID (Free)

A free clone of [Pallet Trade](https://pallet.trade/)'s $9.99/mo card-identification
feature, built as a Chrome extension + serverless backend for Whatnot livestreams.

## What's in this repo

- **`api/identify.js`** — the backend, deployed as a Vercel serverless
  function at `/api/identify`. Takes a base64 video frame, identifies the
  Pokémon card with Gemini vision, looks up the exact printing (English via
  pokemontcg.io, Japanese via PokemonPriceTracker), and returns pricing by
  condition.

This file was rebuilt from scratch on 2026-08-24 after the original source
was lost (the chat session that wrote it never got saved to a repo — see
"History" below). It's live in production and reproduces all documented
behavior, but a few specifics are best-effort reconstructions rather than
confirmed originals — see the comments at the top of `api/identify.js`
for exactly which parts to double check if something misbehaves.

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
- `POKEMONTCG_API_KEY` — optional but recommended (English-card lookups
  are unreliable without it — see Known Issues)
- `POKEMONPRICETRACKER_API_KEY` — required for Japanese cards + graded slabs
- `PPT_BASE_URL` — optional override

## Known issues / open items

- `POKEMONTCG_API_KEY` is not currently set in production. Confirmed
  frequent 5xx errors from pokemontcg.io without one (15+ separate 502s,
  30+ separate 500s logged in one ~4hr window). Setting this key is the
  top priority fix.
- The PokemonPriceTracker request URL and auth header format
  (`Authorization: Bearer <key>`) are best-effort reconstructions, not
  confirmed against the real original code. Watch for Japanese-lookup
  failures and check these first.
- Graded-slab (PSA/BGS/CGC/SGC) pricing has never been empirically
  verified against a real slab scan.
- A confirmed scoring bug (Japanese lookup picking a completely wrong
  printing even when the correct one was in the candidate pool) was fixed
  in this rewrite by unifying the English/Japanese scoring into one
  shared function with fuzzier number matching. Deployed, but not yet
  live-tested against a real rescan — next step is to rescan a
  many-printing Japanese card and confirm the right one wins, then check
  Vercel logs for the `[JP lookup] best=` line.

## History

The original backend source was lost when the chat session that built it
ended without ever being committed anywhere. It was reconstructed from
this project's own documentation (env vars, scoring weights, response
shapes) plus live Vercel runtime logs, then redeployed directly to the
existing (unlinked) Vercel project. This repo is the fix for that — now
that the code has a real home, a lost session should never mean losing
the only copy again.
