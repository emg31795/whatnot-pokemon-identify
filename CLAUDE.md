# CLAUDE.md — Whatnot Pokémon Card ID Extension

This file is the **source of truth** for this project. It exists because
prior work happened across many Claude chat sessions, and chat context
compression repeatedly caused lost history (see "Continuity note" in
`docs/whatnot-pokemon-extension-build-status.md`). Going forward:

- **Claude Code, working in this repo, should read this file first** at
  the start of any session and keep it updated as things change — new
  fixes, new open items, architecture changes, env var changes.
- **Don't let real project history live only in chat.** If something is
  worth remembering next session, it belongs in this file or in
  `docs/test-cases.md` (the live-test log), not just in a chat reply.
- The full historical narrative (every bug found, every fix, every wrong
  turn and correction) lives in `docs/whatnot-pokemon-extension-build-status.md`
  and `docs/test-cases.md` — snapshots through 2026-08-28/29, migrated
  from a Claude Project into this repo on 2026-08-30 so they're available
  on disk, not just inside a chat product. This CLAUDE.md is the
  *condensed, current* summary; the docs/ files are the detailed archive.

## What this is

A free personal Chrome extension that replicates pallet.trade's core
feature (pallet.trade charges $9.99/mo): while watching a Pokémon card
auction on Whatnot, click "Identify Card," it captures the current video
frame, sends it to a backend that identifies the card via AI vision and
looks up real market pricing, and shows the result in an on-page panel.
Personal use only, not for distribution.

Full reverse-engineering notes on how pallet.trade itself works are in
`docs/pallet-trade-reverse-engineering.md`. Short version: pallet's
extension is a thin client — real work happens server-side. This project
follows the same shape.

## Architecture (as-built, current)

```
extension/          Chrome extension (Manifest V3), Whatnot content script + panel UI
  manifest.json
  content.js         Injects the "Identify Card" UI, captures frames, calls the backend, renders results
  content.css
  background.js
  popup.html / popup.js
  icons/
api/
  identify.js         Single Vercel serverless function — the entire backend
docs/                 Historical narrative + live-test log (see above)
```

**Request flow**: `content.js` captures a video frame as JPEG → base64 →
POSTs to `/api/identify` → `identify.js`:
1. Sends the image to **Gemini** (vision model) with a structured-output
   prompt asking for card name, set, number, HP, attack, language, stamp
   type, confidence, etc.
2. Searches **PokemonPriceTracker (PPT)**, `/api/v2/cards`, using the
   extracted name (+ language param when Japanese) for candidate cards.
3. Scores candidates against the Gemini read (`scoreCandidate`/
   `pickBestCandidate` — number match weighted highest, then HP, subtype,
   set, attack name; tie-breaks avoid oddity product lines like Jumbo/
   Prize Pack, prefer matching Gemini's stamp read).
4. For the winning candidate, fetches **real per-condition pricing
   directly from TCGplayer's own public endpoint**
   (`infinite-api.tcgplayer.com/price/history/{tcgPlayerId}/detailed`) —
   never a synthetic/multiplier estimate. Missing-data tiers show as "—",
   never guessed; `pricingError` fires only when zero conditions have any
   real data.
5. Returns identification + pricing + confidence + any warnings to the
   extension, which renders it in the on-page panel.

**Key design principle** (learned the hard way, see docs/): when the
underlying data doesn't support a confident answer, say so — Low
confidence + an explicit warning — rather than showing a wrong answer
with false certainty. This is deliberately closer to pallet.trade's own
"reject on card-number mismatch" behavior than a naive best-effort guess.

## Data sources / paid dependencies

- **Gemini API** (`GEMINI_API_KEY`) — vision read. Metered, ~$0.30/1M
  input, $2.50/1M output tokens. Model: `gemini-3.6-flash` (or
  `GEMINI_MODEL` env override). Cost tracked per-scan, shown in the
  extension panel (`wnpkCostTotal` in `chrome.storage.local`).
- **PokemonPriceTracker (PPT)** (`POKEMONPRICETRACKER_API_KEY`) — the
  only card-identification/catalog data source. $9.99/mo flat +
  per-minute AND per-day credit budgets that can be exhausted (see
  "Known gotchas" below). This is the one paid dependency that remains —
  the original plan to use free pokemontcg.io fell through because it
  was folded into paid-only Scrydex (see
  `docs/pallet-trade-reverse-engineering.md`).
- **TCGplayer's public price-history endpoint** — unauthenticated,
  CORS-open, no API key needed. Used for real per-condition pricing
  (replaced a synthetic multiplier table entirely, see test #42 in
  `docs/test-cases.md`).

## Deployment / environments

- **Backend**: Vercel, project `whatnot-pokemon-identify`, team
  `leasedraftai`. Live at
  `https://whatnot-pokemon-identify.vercel.app/api/identify`.
  **Not git-linked** — deploys currently go through manual file-content
  pushes via the Vercel MCP tools, not automatic build-on-push. This has
  caused at least 2 real (disclosed) production outages from a rushed
  large-file paste (see test #42, #44 in docs/test-cases.md) — **always
  verify a deploy's file content byte-for-byte (sha1/md5) against the
  local source before and after deploying, and confirm the deployed
  handler actually responds correctly** (e.g. `POST /api/identify` with
  `{}` should return `400 {"error":"Missing imageBase64"}`, not a stub
  error) before considering a deploy done. Read large files in full,
  ordered, non-truncated chunks when transcribing — never reconstruct
  from memory, never base64-encode as a shortcut (both have caused real
  incidents).
- **GitHub**: `https://github.com/emg31795/whatnot-pokemon-identify` —
  push destination for this repo. Workflow: Claude Code commits locally,
  the user runs `git push` themselves.
- **Local repo** (this one): `~/Documents/whatnot-pokemon-extension` on
  the user's Mac. Migrated here 2026-08-30 from
  `~/Downloads/whatnot-pokemon-identify-repo` — Downloads was a cluttered
  dumping ground with dozens of unrelated files and many stale duplicate
  copies of this extension; this repo is now the single consolidated
  source of truth, extension files moved into `extension/` (previously
  sitting flat at repo root).
- **Chrome extension loading**: `chrome://extensions` → Developer mode →
  "Load unpacked" → point at this repo's `extension/` folder. **One-time
  action needed after the 2026-08-30 migration**: repoint Chrome's
  existing "Load unpacked" entry from the old
  `~/Downloads/whatnot-pokemon-extension_14` folder to
  `~/Documents/whatnot-pokemon-extension/extension`. Chrome does NOT
  auto-reload on file changes — click the reload icon on the extension
  card after every content.js/content.css/manifest.json change (a stale
  extension has caused real confusion before, see test #43).

## Standing working conventions (established over many sessions — follow these)

1. **Verify via real logs before assuming a root cause.** Vercel runtime
   logs (`mcp__Vercel__get_runtime_logs`) are ground truth; a plausible
   guess from reading the code is not enough, and neither is a
   WebFetch/docs summary of a third-party API (see the `cardNumber`
   parameter saga in docs/test-cases.md test #31/#32 — a docs summary
   claimed a parameter existed; the API's own 400 error, naming its real
   accepted parameters, proved it never had).
2. **If a user pushes back with a specific correction, re-investigate —
   don't just re-assert the prior conclusion.** Several real root causes
   in this project's history were only found because the user corrected
   a wrong diagnosis with specific evidence (see test #27, #48 in
   docs/test-cases.md).
3. **Before declaring a deploy done**: syntax-check, diff against the
   intended source (byte-identical, verified via hash), and confirm the
   live endpoint actually serves the real handler with a real test
   request — not just that Vercel reports "READY" (Vercel does not
   validate a serverless function's actual logic).
4. **Log real, honest uncertainty rather than guessing.** Low confidence
   + an explicit warning is a feature, not a failure — see "Key design
   principle" above.
5. **Report test results to `docs/test-cases.md`** — add a row/section
   with ground truth, what was shown, latency if available, and root
   cause once found. This is what lets accuracy be tracked over time
   instead of relying on memory (or on chat history that gets
   compressed away).
6. **Keep this file updated.** When you ship a fix, land an architecture
   change, or learn something that future-you will need, update the
   relevant section of this CLAUDE.md in the same session — don't leave
   it for later.

## Known gotchas

- **PPT has two separate rate limits**: a per-minute call-rate limit and
  a separate daily credit quota. Exhausting either produces a 429 but
  with different error text (`error` field contains `daily` for the
  quota case) — the user-facing message must distinguish them (fixed in
  test #51). PPT credits can be topped up at
  pokemonpricetracker.com/api-keys.
- **PPT's search `limit` is a real tradeoff**: too high burns rate-limit
  credits fast (fixed by dropping default from 100→30, test #30); too low
  risks a real card getting crowded out of the results by unrelated
  same-species filler (test #31 onward). Current mitigation: page-1 +
  page-2 (`offset`) pagination when the read card number isn't found on
  page 1, plus a name+number combined-search fallback as a last resort
  (test #49) — not a full fix for very common species names with newer/
  lower-profile printings (Eevee, Tyranitar, Zoroark have all hit this).
- **Gemini's vision read can be inconsistent or hallucinate** across
  repeat scans of the identical physical card — worst documented case
  (test #50) invented both a nonexistent card number and a fully
  fabricated language/attack text. Not fixable in matching code; see
  "Recent / in-flight work" below for mitigation options being tried.
- **Chrome extensions require a manual reload** after any file change —
  they do not auto-reload (caused real confusion in test #43).

## Recent / in-flight work (as of 2026-08-30 migration)

- **Uncommitted change in `api/identify.js` at time of migration**:
  raised `thinkingConfig.thinkingLevel` from `"minimal"` to `"low"`, and
  added an explicit `media_resolution: "MEDIA_RESOLUTION_HIGH"` — both
  aimed at test #50's severe Gemini read-instability case (see the
  "Research: options to improve Gemini scan consistency" section at the
  end of `docs/test-cases.md`). This was committed as part of the
  migration reorg commit but **not yet deployed to Vercel, and not yet
  confirmed against a live rescan** — needs a real timing measurement
  (stay inside the 2-5s target) and a recurrence of a hard card to see if
  it actually helps.
- **Open strategy question** (raised repeatedly, never resolved): whether
  to keep patching the matching/scoring model reactively as live tests
  surface issues, or pause for a dedicated pass adopting more of
  pallet.trade's hard "reject on number mismatch" approach throughout.
  See `docs/whatnot-pokemon-extension-build-status.md` part 4 for the
  original framing.
- **Not started**: sealed-pack identification (feature request, awaiting
  explicit user go-ahead — see build-status.md "Open feature request").
- **Not started**: switching the Vercel project to git-linked deploys
  (would eliminate the manual-paste deploy-outage risk described above)
  — an explicit architecture decision for the user to make, not something
  to switch to mid-task.

## Where to look for more detail

- `docs/whatnot-pokemon-extension-build-status.md` — full chronological
  history of every architectural decision and bug fix through 2026-08-28.
- `docs/test-cases.md` — the live-test log (51 tests through 2026-08-29)
  plus known-good baselines to check against on every retest.
- `docs/pallet-trade-reverse-engineering.md` — how pallet.trade's own
  extension actually works, the basis for this project's design.
