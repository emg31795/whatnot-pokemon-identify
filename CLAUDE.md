# CLAUDE.md — Whatnot Pokémon Card ID Extension

This file is the **source of truth** for this project. It exists because
prior work happened across many Claude chat sessions, and chat context
compression repeatedly caused lost history (see "Continuity note" in
`docs/whatnot-pokemon-extension-build-status.md`). Going forward:

- **Claude Code, working in this repo, should read this file first** at
  the start of any session and keep it updated as things change — new
  fixes, new open items, architecture changes, env var changes.
- **Don't let real project history live only in chat.** If something is
  worth remembering next session, it belongs in this file, in
  `docs/ROADMAP.md` (scope/checklist), or in `docs/test-cases.md` (the
  live-test log) — not just in a chat reply.
- The full historical narrative (every bug found, every fix, every wrong
  turn and correction) lives in `docs/whatnot-pokemon-extension-build-status.md`
  and `docs/test-cases.md` — snapshots through 2026-08-28/29, migrated
  from a Claude Project into this repo on 2026-08-30 so they're available
  on disk, not just inside a chat product. This CLAUDE.md is the
  *condensed, current* summary; the docs/ files are the detailed archive.

## Current priority

**Phase 1 of `docs/ROADMAP.md`: stabilize raw-card (English + Japanese)
identification accuracy and speed before expanding scope.** Do not start
Phase 2 (graded slabs) or Phase 3 (sealed packs) work until Phase 1's
checklist in ROADMAP.md is substantially complete — every build should
serve a specific roadmap item, not just whatever a live scan happens to
surface next. See `docs/ROADMAP.md` for the full phase breakdown, north
star, and definition of done.

Immediate next step: the Gemini read-consistency fix (commit 3e895b1) is
now deployed and verified live (see "Recent / in-flight work" below) —
what's still needed is a live rescan of a hard card to confirm it
actually helps, then update ROADMAP.md's Phase 1 checklist.

## When to ask before acting

- **Free rein, no need to ask**: local file edits, local git commits,
  updating CLAUDE.md/ROADMAP.md/docs/test-cases.md, reading logs,
  research (WebFetch/docs lookups), running the app locally.
- **Always ask first, explain what you're about to do, and wait for a
  go-ahead**: deploying to Vercel (production), `git push` to GitHub,
  anything that spends money or API credits (buying more PPT credits,
  etc.), deleting any file. These are irreversible or user-facing —
  the user has explicitly said they want to approve these, not just
  review after the fact.

**Project facts belong in this repo, not Claude Code's own memory feature.**
Claude Code has a separate per-project memory store outside git (e.g.
`~/.claude/projects/<project>/memory/`). Do not use it for anything project-
specific — autonomy rules, architecture facts, deploy status, open
questions, anything that belongs in CLAUDE.md/ROADMAP.md/docs/test-cases.md.
This repo's git-tracked files are the ONLY source of truth for this project,
on purpose, so any session (or the user, reading via the device bridge) can
see the same state. A per-project fact saved outside git is invisible to
both and was already caught and deleted once (2026-08-30) for exactly this
reason.

## What this is

A free personal Chrome extension that replicates pallet.trade's core
feature (pallet.trade charges $9.99/mo): while watching a Pokémon card
auction on Whatnot, click "Identify Card," it captures the current video
frame, sends it to a backend that identifies the card via AI vision and
looks up real market pricing, and shows the result in an on-page panel.
Personal use only, not for distribution. **Scope is fixed to Pokémon** —
see `docs/ROADMAP.md`.

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
docs/                 Historical narrative, live-test log, and roadmap (see above)
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
  extension panel (`wnpkCostTotal` in `chrome.storage.local`). **No hard
  spend cap defined yet** — if the user wants one enforced (e.g. "warn
  above $X/day"), add it here explicitly; until then, spend is tracked
  but not gated.
- **PokemonPriceTracker (PPT)** (`POKEMONPRICETRACKER_API_KEY`) — the
  only card-identification/catalog data source. $9.99/mo flat +
  per-minute AND per-day credit budgets that can be exhausted (see
  "Known gotchas" below). This is the one paid dependency that remains —
  the original plan to use free pokemontcg.io fell through because it
  was folded into paid-only Scrydex (see
  `docs/pallet-trade-reverse-engineering.md`). **Buying more credits
  requires asking the user first** (see "When to ask before acting").
- **TCGplayer's public price-history endpoint** — unauthenticated,
  CORS-open, no API key needed. Used for real per-condition pricing
  (replaced a synthetic multiplier table entirely, see test #42 in
  `docs/test-cases.md`).

## Deployment / environments

- **Backend**: Vercel, project `whatnot-pokemon-identify`, team
  `leasedraftai`. Live at
  `https://whatnot-pokemon-identify.vercel.app/api/identify`.
  **Not git-linked** — deploys currently go through manual file-content
  pushes via the Vercel MCP tools, not automatic build-on-push. Moving to
  git-linked auto-deploy would eliminate the risks below, but is an
  explicit architecture decision for the user to make (see ROADMAP.md /
  "Recent / in-flight work"), not something to switch to mid-task.
- **GitHub**: `https://github.com/emg31795/whatnot-pokemon-identify` —
  push destination for this repo. Workflow: Claude Code commits locally,
  asks the user before pushing.
- **Local repo** (this one): `~/Documents/whatnot-pokemon-extension` on
  the user's Mac.
- **Chrome extension loading**: `chrome://extensions` → Developer mode →
  "Load unpacked" → point at this repo's `extension/` folder. Chrome does
  NOT auto-reload on file changes — click the reload icon on the
  extension card after every content.js/content.css/manifest.json change
  (a stale extension has caused real confusion before, see test #43).

### Before you deploy — checklist (follow every step, every time)

This project has had **two real production outages** and **one severe
multi-hour stall** from rushing this exact step. Do not skip any of these:

1. Read the source file in full via a normal `Read`/`cat` call. Do
   **not** base64-encode it "to be safe" — this has directly caused a
   multi-hour stall (2026-08-30) by turning a simple read into a
   chunk-and-hash-verify loop for no benefit. If the file is small enough
   to read in one call (this codebase's files all are), just read it
   plainly and pass the content straight through.
2. Compute a hash (sha1/md5) of the exact content you're about to deploy
   and note it.
3. Deploy via the Vercel MCP tools with that exact content.
4. Fetch the deployed content back (or re-read via the deploy tool's
   response) and confirm the hash matches what you intended to ship —
   confirms no truncation/corruption happened in transit.
5. Send a real test request to the live endpoint (e.g. `POST
   /api/identify` with `{}` — should return `400
   {"error":"Missing imageBase64"}`, never a stub/module-not-found error)
   to confirm the real handler is serving, not a broken/placeholder file.
6. Only after 1-5 all pass: tell the user it's deployed, and note that a
   live rescan is still needed to confirm any behavioral fix actually
   works (a clean deploy is not the same as a confirmed fix).
7. Update CLAUDE.md / ROADMAP.md / test-cases.md to reflect the new
   deployed state in the same session — don't leave it for "later."

### Definition of done, for any fix

A fix is not "done" until all of these are true — use this as a literal
checklist before reporting something as finished:

- [ ] Root cause confirmed via real logs (not a guess, not a docs
      summary — see "Standing working conventions" below)
- [ ] Fix implemented and committed locally with a clear message
- [ ] Deployed following the checklist above (if it touches `api/`)
- [ ] Live endpoint verified serving the real handler
- [ ] Reported to the user as deployed but *not yet confirmed* until a
      real rescan happens
- [ ] `docs/test-cases.md` updated with the test row/notes once a
      rescan confirms (or doesn't) the fix
- [ ] `CLAUDE.md`'s "Recent / in-flight work" and/or `docs/ROADMAP.md`
      updated to match reality

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
3. **Follow the "Before you deploy" and "Definition of done" checklists
   above, every time** — don't reconstruct your own process from
   scratch each session (that's exactly what led to the base64 stall).
4. **Log real, honest uncertainty rather than guessing.** Low confidence
   + an explicit warning is a feature, not a failure — see "Key design
   principle" above.
5. **Report test results to `docs/test-cases.md`** — add a row/section
   with ground truth, what was shown, latency if available, and root
   cause once found. This is what lets accuracy be tracked over time
   instead of relying on memory (or on chat history that gets
   compressed away).

   **What "rescan" means in this project**: on a live Whatnot stream, a card
   is shown once and sold — you generally cannot go back and find the exact
   same physical card again later, and won't reliably remember it if you
   could. "Confirm via rescan" means scanning 2-3 times back-to-back *while
   a card is still on screen*, not tracking down a specific previously-seen
   card. Validating a fix means testing it against *any* card in the same
   failure class (e.g. Japanese, promo/alphanumeric numbers, full-art/ex
   cards) as it naturally comes up on stream, and watching the trend across
   many different cards in `docs/test-cases.md` over time — not waiting for
   one specific named card to reappear.

6. **Keep this file and ROADMAP.md updated.** When you ship a fix, land
   an architecture change, complete a roadmap checklist item, or learn
   something future-you will need, update the relevant file in the same
   session — don't leave it for later.
7. **If a single step is taking unusually long** (many tool calls with
   no clear progress, or you find yourself building a workaround for a
   workaround), stop and report the situation plainly instead of
   continuing to grind — flag it so the user can redirect rather than
   losing time to something like the base64 stall.

## Known gotchas

- **Base64-encoding a file "for safety" before deploying is a trap, not
  a safety measure.** It has caused a truncated-file production outage
  once (Shadowless fix, 2026-08-28) and a 50+ minute stall with no actual
  progress once (2026-08-30, the Gemini-consistency-fix deploy). This
  codebase's files are small enough to read and pass through directly —
  see the "Before you deploy" checklist above.
- **PPT has two separate rate limits**: a per-minute call-rate limit and
  a separate daily credit quota. Exhausting either produces a 429 but
  with different error text (`error` field contains `daily` for the
  quota case) — the user-facing message must distinguish them (fixed in
  test #51). PPT credits can be topped up at
  pokemonpricetracker.com/api-keys (requires asking the user first).
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
  "Recent / in-flight work" below for the mitigation currently being
  confirmed.
- **Chrome extensions require a manual reload** after any file change —
  they do not auto-reload (caused real confusion in test #43).

## Recent / in-flight work

- **Trainer-subtype extraction fix (commit `d589d46`) — DEPLOYED
  2026-08-30** (`dpl_GnxKLpHTkcN8QuVXhY1gPgpmpk1P`, aliased to
  `whatnot-pokemon-identify.vercel.app`). First non-Pokémon (Trainer/
  Supporter) card ever scanned (test #53, a Drayton) found via real
  Vercel logs that `normalizePptCard`'s `subtypes` extraction only ever
  recognized Pokémon power tags (VMAX/VSTAR/GX/EX/ex/V/BREAK) in the
  candidate name — Trainer subtypes (Supporter/Item/Stadium/Tool) were
  never captured even though PPT's raw payload carries them directly on
  `pokemonType` (`"Trainer - <subtype>"`), so the subtype scoring signal
  was silently dead on every Trainer card. Same dead-signal class as the
  earlier `attackName` fix. Shipped as an isolated fix, deliberately NOT
  bundled with the deeper tie-break question below. Deployed via the
  Vercel MCP `deploy_to_vercel` tool with plain-text content, verified
  byte-exact against the local file (sha1 match) before transcription
  into the tool call. Verified: deployment state `READY` and aliased to
  production; build log confirms exactly 3 files downloaded; live `POST
  /api/identify` with `{}` returns the real `400
  {"error":"Missing imageBase64"}` (not a stub); runtime logs confirm
  that exact request was served by `dpl_GnxKLpHTkcN8QuVXhY1gPgpmpk1P`.
  **Not yet confirmed via a live scan**: this fix would not have changed
  either of test #53's two specific scans (all 4 real candidates shared
  the same subtype) — what it fixes going forward is any future
  Trainer-card scan where distinguishable subtypes exist among same-name
  candidates. Needs a live scan where that scenario actually applies.
- **Open: Trainer/Supporter same-name tie-break design question** (new,
  from test #53): for Trainer cards, `number`+`set` are the ONLY signals
  that can ever break a tie between same-name printings — HP/attackName
  are always N/A by card type, and subtype (even fixed, above) can't
  discriminate between printings that share the same subtype (e.g. two
  different-set "Drayton" Supporter printings). This makes Trainer-card
  matching structurally more fragile to a bad Gemini number read than
  Pokémon-card matching, which has three independent tie-break signals
  in reserve. Needs a deliberate decision (e.g. widen the
  ambiguous-match safety net's messaging for Trainer cards specifically,
  or something else) — not a reactive patch. See ROADMAP.md's Phase 1
  checklist and test #53 in `docs/test-cases.md`.
- **`thinkingConfig.thinkingLevel: "low"` + explicit
  `media_resolution: "MEDIA_RESOLUTION_HIGH"` (commit `3e895b1`) — DEPLOYED
  2026-08-30** (`dpl_5eUq8D9vMY755WTnSRrNvggYQKvX`, aliased to
  `whatnot-pokemon-identify.vercel.app`), aimed at test #50's severe
  Gemini read-instability case (see the "Research: options to improve
  Gemini scan consistency" section at the end of `docs/test-cases.md`).
  Sat undeployed for ~16h after the 2026-08-30 migration commit before
  this — confirmed via `list_deployments`/`get_deployment` timestamp
  comparison, not assumption. Deployed via the Vercel MCP
  `deploy_to_vercel` tool with plain-text content transcribed from an
  ordered, non-truncated `Read` of `api/identify.js` (NOT base64 — see
  "Known gotchas"). Verified: deployment state `READY` and aliased to
  production; build log confirms exactly 3 files downloaded (matching
  what was sent); live `POST /api/identify` with `{}` returns the real
  `400 {"error":"Missing imageBase64"}` (not a stub); runtime logs
  confirm that exact request was served by
  `dpl_5eUq8D9vMY755WTnSRrNvggYQKvX`. **Not verified**: no Vercel MCP
  tool exposes deployed source for a true byte-diff against local — a
  real tooling gap, not something skipped by choice; flag if the
  deployed function ever needs a source-level audit. **Still needed**: a
  real timing measurement on a live rescan (stay inside the 2-5s target)
  and a recurrence of a hard card to see if the read-instability fix
  actually helps — deployment alone doesn't prove that.
- **Open strategy question** (raised repeatedly, never resolved): whether
  to keep patching the matching/scoring model reactively as live tests
  surface issues, or pause for a dedicated pass adopting more of
  pallet.trade's hard "reject on number mismatch" approach throughout.
  See `docs/whatnot-pokemon-extension-build-status.md` part 4 for the
  original framing. Leaning toward "finish Phase 1 stabilization first"
  per `docs/ROADMAP.md`.
- **Not started**: Phase 2 (graded slab live pricing) and Phase 3
  (sealed-pack identification) — see `docs/ROADMAP.md`. Do not start
  either until Phase 1's checklist is substantially complete.
- **Not decided**: switching the Vercel project to git-linked deploys —
  would eliminate the manual-paste deploy risks described above; an
  explicit decision for the user to make.

## Where to look for more detail

- `docs/ROADMAP.md` — project scope, phases, and checklist. Read this to
  know what's next and why.
- `docs/whatnot-pokemon-extension-build-status.md` — full chronological
  history of every architectural decision and bug fix through 2026-08-28.
- `docs/test-cases.md` — the live-test log (51+ tests) plus known-good
  baselines to check against on every retest.
- `docs/pallet-trade-reverse-engineering.md` — how pallet.trade's own
  extension actually works, the basis for this project's design.
