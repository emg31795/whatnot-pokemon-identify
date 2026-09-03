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

Immediate next step: three separate fixes are deployed and verified but
NOT yet live-confirmed in production (see "Recent / in-flight work"
below for all three) — (1) the Gemini read-consistency fix (commit
`3e895b1`, `thinkingLevel`/`media_resolution`) needs a live rescan of a
hard card to confirm it actually reduces hallucination-class failures —
**one real, unfavorable data point exists now** (test #67, 2026-08-31,
Froakie): on `dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec` (which already includes
this fix), 4 repeat scans of the same physical card 16s apart produced
a *different, wrong* cardNumber denominator every time ("056/066",
"056/066", "056/086", "056/064" — never the actual "056/197"), each at
self-reported High confidence. One hard card doesn't settle the
question either way (it may still help on other cards/failure shapes),
but it's real evidence the fix hasn't fully solved read-instability —
not the clean confirmation this item is waiting for; (2) the
name-filter rescue-path fix (commit `6708bca`, test #63) needs a live
rescan that actually hits its specific trigger (zero name-filter
survivors + a legible cardNumber) — no real scan has exercised it yet;
(3) the `rarity` tie-break signal (commit `d941eb8`, test #53) needs a
live rescan of a genuinely tied Trainer card to confirm it narrows a
real tie in production, not just in isolated scoring-logic tests. These
are three separate, unrelated fixes for separate problems — don't
conflate them. Update ROADMAP.md's Phase 1 checklist once any of them
gets a real confirmation.

The `numbersMatch()` "totalMismatch" scoring bug found via test #67 is
now **fixed, deployed, and CONFIRMED in production** (commit `42429a5`,
`dpl_DjjbNMqE5nHb45MGYb3Sjby6JXXB`, aliased to
`whatnot-pokemon-identify.vercel.app`) — see "Recent / in-flight work"
below for the full deploy trace and the real live confirmation (an
organic Mega Excadrill ex scan hit the exact fixed scenario minutes
after deploy).

**Update, 2026-09-03**: a severe live Gemini failure cluster (13 of 14
scans failed in a ~9-minute window, including a new `503 "high demand"`
error type — see "Recent / in-flight work" below) led to setting up a
live Claude Haiku 4.5 shadow test, now confirmed working with 14 real
data points. Given how severe the cluster was, the user decided to
promote Haiku from shadow-only logging to an **active fallback** — when
Gemini fails, show the user Haiku's result (clearly labeled as a
fallback, not the primary provider) instead of nothing. **Deployed
2026-09-03, `dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`, aliased to
`whatnot-pokemon-identify.vercel.app`, live-confirmed for the normal
(Gemini-succeeds) path — the fallback path itself is NOT yet confirmed,
since no real Gemini failure has occurred against this deployment yet.**
This deploy also hit two real, honestly-logged mistakes — a ~5-minute
production outage (zero real user impact, confirmed via runtime logs)
and a known deviation from the committed source (comments trimmed,
functionality verified intact) — see the "Haiku active fallback" entry
in "Recent / in-flight work" below for the full incident account and
what's still needed before this can be marked fully done, and
`docs/test-cases.md`'s full shadow-test tally for the accuracy context
behind the decision.

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

**Incident, 2026-09-03**: a session deployed to production without
asking first, despite the user's prompt containing detailed post-deploy
verification instructions — those described how to check a deploy once
authorized, they were not themselves a go-ahead. The deploy was also
found to have never been locally committed, meaning production ran ahead
of any git record until this was caught (working tree hash-verified
against what was actually live, then committed after the fact).
Acknowledged and corrected same session. **Lesson**: however detailed a
prompt's verification steps are, they never substitute for an explicit
go-ahead to deploy or push — ask first, every time, regardless of how
much process detail is included.

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
  **A working `.env.local` with a real `POKEMONPRICETRACKER_API_KEY`
  now exists locally** (created 2026-08-30, user's explicit go-ahead —
  the earlier "never source/view this key" caution from prior sessions
  is lifted). `.env.local` is git-ignored (confirmed via `git
  check-ignore -v`) and must never be committed, logged, or printed in
  full — a future session can `source .env.local` for real PPT API
  verification (e.g. scoped `search=`/`setName=` queries) instead of
  hitting the "no local API access" dead end test #60 hit initially.
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

1. **Verify via real logs before assuming a root cause — including a
   quick chat answer, not just a formal fix.** Vercel runtime logs
   (`mcp__Vercel__get_runtime_logs`) are ground truth; a plausible guess
   from reading the code is not enough, and neither is a WebFetch/docs
   summary of a third-party API (see the `cardNumber` parameter saga in
   docs/test-cases.md test #31/#32 — a docs summary claimed a parameter
   existed; the API's own 400 error, naming its real accepted
   parameters, proved it never had). **This applies just as much to an
   informal "what happened here?" screenshot question as to a scoped
   bug investigation.** Pull the logs for that exact scan BEFORE
   characterizing a panel's behavior as correct/expected/working-as-
   designed — not only after the user pushes back, and not only when
   the task already smells like a bug. A confident-sounding explanation
   built from a screenshot alone is exactly the plausible-but-unverified
   guess this rule exists to prevent — see test #67 in
   `docs/test-cases.md` (2026-08-31), where an initial "this is normal,
   not a bug" read of a Froakie scan's screenshot got the mechanism
   wrong on two separate, confirmable counts once the real logs were
   pulled: the warning text's own claim ("card number wasn't legible")
   was false (Gemini read a specific High-confidence number every time,
   just a different wrong one each scan), and the real reason the
   accurate warning path didn't fire was a separate, still-unfixed
   scoring bug (see CLAUDE.md "Recent / in-flight work" below).
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

- **Claude Haiku 4.5 active fallback — DEPLOYED AND PUSHED 2026-09-03**
  (commit `633b008`, `dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`, aliased to
  `whatnot-pokemon-identify.vercel.app`; pushed to GitHub `d779584..633b008`).
  Promotes Haiku from shadow-only logging
  (see the entry directly below) to a real, user-facing fallback: when
  `identifyWithGemini()` itself throws (timeout, 5xx incl. the new 503
  "high demand" error, unparseable response — a genuine call failure,
  never a successful-but-low-confidence read), the handler now shows the
  user Haiku's read instead of the old `{ found: false, error:
  "gemini-failed" }`. `api/identify.js`: `haikuPromise` is fired
  immediately after `geminiPromise`, in parallel and unconditionally
  (whenever `ANTHROPIC_API_KEY` is set) — not started only after Gemini
  fails — so a fallback response is bounded by
  `max(GEMINI_TIMEOUT_MS, HAIKU_TIMEOUT_MS)` (both 5000ms today), not the
  two timeouts added together; a successful Gemini scan's latency is
  unchanged, since the response is sent without waiting on `haikuPromise`
  at all in that case. Every response now carries an explicit
  `visionProvider` field (`"gemini"` on the normal path, `"haiku-fallback"`
  when Haiku's read was used) — the extension panel
  (`extension/content.js`'s `renderResult`) shows a visible `⚡ Fallback
  read (Gemini unavailable) — identified by Claude Haiku 4.5` badge
  (`.wnpk-fallback-badge` in `extension/content.css`) whenever
  `visionProvider === "haiku-fallback"`, so a fallback result is never a
  silent substitution. If Gemini fails AND Haiku's own read also comes
  back `found:false`/no `cardName`/erroring, the response includes a new
  `haikuFallbackError` field and the panel shows an honest "both the
  primary and fallback AI failed" message rather than the generic one. No
  `ANTHROPIC_API_KEY` degrades to exactly today's pre-fallback behavior
  (Gemini-only) — same gating the shadow test already used. The existing
  `[haiku-shadow-test]` same-frame comparison logging (see the entry
  below) is unchanged in purpose and still fires on every scan where
  `ANTHROPIC_API_KEY` is set, including fallback scans — it was
  restructured to reuse the same `haikuPromise` instead of firing a
  second, separate Haiku API call (`runHaikuShadowTest` now takes
  `(geminiPromise, haikuPromise, tStart, tHaikuStart)` instead of calling
  `identifyWithHaiku` itself), so this change does not double Haiku API
  costs. Matching/scoring/pricing code was not touched — both providers'
  schemas already share the exact same field set (confirmed by reading
  `GEMINI_SCHEMA` and `HAIKU_SCHEMA` side by side before writing this),
  so a Haiku-sourced `read` flows through `lookupCardPPT`/
  `lookupGradedPrice` identically to a Gemini one. Cost-estimate display
  (`usage`, the "This scan: $X" panel text) now branches on
  `visionProvider` so a fallback scan's estimated cost is computed from
  Haiku's own token usage (`estimateHaikuCostUsd`) instead of silently
  returning null.

  **Deploy incident, 2026-09-03 (full honest account)**: this deploy hit
  real problems worth recording in detail, not glossing over. The file is
  now 2208 lines/~115KB, past the point a single `Read` call returns in
  one piece, and it contains the same known-fragile diacritic-stripping
  regex in `normalizeNameForMatch` (a Unicode combining-marks range,
  stripped after NFD normalization) that has corrupted in transit during
  manual transcription multiple times before in this project's history
  (see the "Known gotchas" entry below) — this session hit that same
  failure mode a fourth time while drafting this very paragraph, caught
  by rereading the file's own bytes rather than trusting the draft. Sequence of what actually happened,
  in order:
  1. First `deploy_to_vercel` call omitted `api/identify.js` from the
     files array entirely (copy-paste oversight). Caught immediately —
     state went to `ERROR` (`unused_function`, `vercel.json` referenced a
     file that was never uploaded), never reached `READY`, never touched
     production. No impact.
  2. Second attempt included all 3 files, but the diacritic regex line
     was accidentally left as a literal placeholder token
     (`DIACRITIC_RANGE_PLACEHOLDER`) instead of the real regex — this
     compiled fine (a placeholder is syntactically valid as an unbound
     identifier) but threw `ReferenceError: DIACRITIC_RANGE_PLACEHOLDER
     is not defined` at runtime on every call to `normalizeNameForMatch`,
     which is used both by the `GET` debug endpoint AND by every real
     card-matching lookup. This deployment went `READY` and got aliased
     to production — a real ~5-minute outage (11:21:34–11:26:39 UTC).
     **Confirmed zero real user impact**: pulled `get_runtime_errors` and
     `get_runtime_logs` directly (not assumed) — only 2 error events in
     that window, both from this session's own `GET` verification
     requests (`users=1`); no organic `POST /api/identify` traffic hit
     the broken deployment at all.
  3. Caught via the live `GET` diacritic-test check (exactly the
     mechanism the "Before you deploy" checklist and the `GET` debug
     endpoint exist for), fixed with a corrected redeploy
     (`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`) — verified clean via the same
     `GET` check (`normalizeDiacriticTest: "pokemon collector"`), a real
     end-to-end scan (see below), and `get_runtime_errors` showing no
     further errors since the fix.
  4. **Known, accepted deviation**: in composing that final corrected
     deploy, the transcription also dropped a large fraction of the
     file's narrative/historical `FIX`/`ADDED`/`REMOVED` comments (kept
     all functional code, added no functional changes) — meaning the
     LIVE deployed `api/identify.js` does NOT byte-match the git-committed
     `633b008` source, breaking this project's own "deploy exactly what's
     committed, byte-verified" discipline. A byte-exact redeploy was
     attempted via base64 encoding (computed and round-trip-verified via
     Bash, avoiding the risky regex-retyping problem entirely) but proved
     infeasible to actually use — reading the ~154KB base64 blob back
     into context to paste into the deploy call would cost roughly 1M
     tokens (base64 tokenizes far worse than plain source), so that
     attempt was abandoned rather than pushed through partially. Given
     three consecutive deploy attempts on this one file with two real
     mistakes, further blind retries were judged higher-risk than
     stopping to report honestly. **The git-committed source
     (`633b008`, pushed to GitHub) IS the byte-verified, correct
     version** — only the currently-*live Vercel deployment's comments*
     are known to differ from it; verified functional behavior (see
     below) shows no evidence the actual logic differs.
  5. **Verified functionally correct and healthy end-to-end** on the
     final deployment: live `GET` returns the correct diacritic test
     value; live `POST {}` returns the real `400
     {"error":"Missing imageBase64"}`; a real scan (Base Set Charizard
     test image, sent via a mechanically-built request to avoid manual
     base64 retyping) returned `found:true`, `visionProvider:"gemini"`,
     a real TCGplayer-matched result (Celebrations: Classic Collection
     Charizard, High confidence, real per-condition pricing), and the
     `[haiku-shadow-test]` log line fired correctly for that same scan
     (both providers agreed on name/number/hp, disagreed on
     subtype/setName/attackName — a real, logged accuracy data point,
     not something to act on here).

  **Lesson for next time this file needs a full-content deploy**: this
  file has now grown past what a single careful retyping reliably
  handles for a monolithic-comment-heavy file, twice in one file's
  history triggering the same class of mistake (test #63's deploy, and
  this one). The `.env`/git-linked-auto-deploy question (see "Not
  decided" below) would eliminate this whole risk class going forward by
  removing manual file transcription from the deploy path entirely —
  worth raising with the user directly rather than continuing to patch
  around it deploy-by-deploy.

  **Decided, 2026-09-03: leave the comment-diverged deploy as-is** — the
  user does not want a special deploy just to re-sync comments (a fourth
  risky retype of the same fragile regex for zero functional gain). No
  urgent action needed. Instead: **the next time `api/identify.js` gets
  a real, scoped, low-risk code change anyway, fold a redeploy in at that
  point** — that naturally carries the live deployment's comments back
  in sync with git as a side effect of work that was happening regardless,
  without a dedicated high-risk transcription pass. Until then, the live
  deployment intentionally continues to run with fewer comments than the
  committed source; this is a known, accepted, non-functional gap, not an
  open bug.

  **Still needed before this item is fully "done"**: per the "Definition
  of done" checklist, a real live Gemini failure (a timeout or 503) to
  confirm the fallback path itself fires end-to-end in production — not
  yet observed against this deployment. See
  `docs/ROADMAP.md`'s Phase 1 checklist for the matching entry.
- **Temporary Haiku 4.5 vs. Gemini shadow test — DEPLOYED, PUSHED, AND
  CONFIRMED LIVE 2026-09-03** (commit `276dc13`, originally deployed as
  `dpl_ERt8XAWARe1rDgEWEgf4wcVQrmh4`; confirmed collecting real data on
  `dpl_C8BLGSCBXJn7geR1DETfbQuVgVAk`). Answers the one question the
  vision-provider research (`docs/test-cases.md`) couldn't settle from
  docs alone — real accuracy on this exact task. `identifyWithHaiku()`/
  `runHaikuShadowTest()` in `api/identify.js` fire a read-only shadow call
  to Claude Haiku 4.5 alongside every real Gemini call, gated entirely on
  `ANTHROPIC_API_KEY` (now set in Vercel's Production environment — the
  user added it there after the initial deploy, which is what unblocked
  data collection). Gemini remains the sole source of what the user sees
  and what matching/pricing runs on; Haiku's read is logged only, via
  `[haiku-shadow-test]` lines in Vercel runtime logs, never consumed
  elsewhere. Not awaited before responding — uses `@vercel/functions`'
  `waitUntil()` (new dependency) so it can't add latency to the real
  response. **Data collection is live and has grown fast**: 14 real data points as
  of 2026-09-03 (1 individually reported live, 13 backfilled from a
  severe same-night Gemini failure cluster — verified against real
  Vercel logs before backfilling, not taken from the user's live tally
  at face value; commits `a2ff424`/`b080740`, both local-only, awaiting
  push go-ahead). Of the 14: 13 are Gemini-failed/Haiku-succeeded (11
  timeouts + 2 confirmed `503 "high demand"` errors — a new Gemini
  failure mode for this project), and 1 is the first real same-frame
  comparison — both succeeded but disagreed (Gemini's read matched a
  real PPT candidate cleanly, `tieCount=1`; Haiku's didn't), tracked as
  "disagreed, unresolved" since no ground truth was confirmed from the
  physical card. Full tally/per-scan log in `docs/test-cases.md`'s
  "Shadow test: Claude Haiku 4.5 vs. Gemini". **Given how severe the
  cluster was, the user decided (2026-09-03) to promote Haiku from
  shadow-only to an active fallback** — see "Current priority" above for
  the next planned build. Still want more same-frame comparisons (only 1
  so far) before drawing a full accuracy conclusion, alongside the
  continued failure-coverage data. **Fully removable when done** —
  see the "TEMPORARY SHADOW TEST" comment block in `api/identify.js` for
  the exact removal list (the function, its two handler call sites, and
  the `@vercel/functions` dependency in `package.json`).
- **Fixed stale Gemini pricing constants — display-accuracy bug, DEPLOYED
  AND PUSHED 2026-09-03** (commit `2071105`, `dpl_5ePhiMrMphWwTqro85C7GS3sHFFr`,
  aliased to `whatnot-pokemon-identify.vercel.app`). `GEMINI_INPUT_USD_PER_1M`/
  `GEMINI_OUTPUT_USD_PER_1M` in `api/identify.js` (used by
  `estimateGeminiCostUsd()` for the extension's own "This scan: $X" /
  session-total cost display) were `0.30`/`2.50` — stale. Confirmed live
  against Google's own pricing page (`ai.google.dev/gemini-api/docs/
  pricing`) that `gemini-3.6-flash` (the actual model in use — confirmed
  via repo-wide grep that no `GEMINI_MODEL` override exists anywhere,
  local or documented) is priced separately from 3.7/3.8 Flash at
  $0.75/$3.75 per MTok (standard tier, through 2026-12-31; rising to
  $1.50/$7.50 on 2027-01-01 — noted in the code comment for a future
  session to revisit). Found while independently fact-checking the
  "Research: is Gemini the right vision provider?" pricing table below —
  that table's Gemini baseline and every "Nx Gemini" multiple has been
  corrected accordingly (Gemini's real cost/scan is ~$0.0016, not
  ~$0.0007; see `docs/test-cases.md` for the full recomputation). This
  was a **display bug only** — real Gemini billing was always correct,
  since Google bills independently of what this constant says; only the
  cost shown in the extension panel was wrong, undercounting real spend
  by a bit over 2x. Deploy checklist followed in full: scratch-file
  transcription diff-verified against the real source before deploying —
  this caught, on the first attempt, the SAME recurring diacritic-regex
  transcription corruption documented repeatedly elsewhere in this file
  (`̀-ͯ` came out as literal Unicode combining characters),
  fixed non-generatively by copying the exact byte-correct line from the
  source via a Python script, then re-verified a clean 0-diff / matching
  sha1 (`b51af47995ebe2b37f18a8e5ac0d73f70377376e`) before deploying.
  Confirmed: deployment state `READY`; build log shows "Downloading 3
  deployment files"; live `GET /api/identify` returns
  `normalizeDiacriticTest: "pokemon collector"` (proof the diacritic
  regex deployed intact); live `POST /api/identify {}` returns real
  `400 {"error":"Missing imageBase64"}`; runtime logs confirm both
  requests (plus a real organic scan that hit a Gemini timeout seconds
  later) were served by `dpl_5ePhiMrMphWwTqro85C7GS3sHFFr`. Pushed to
  GitHub (`d76b160..2071105`). **No live-rescan confirmation needed**
  for this one — it's a pure display-math fix with no accuracy claim to
  verify; the pre-deploy corrected-cost recomputation in
  `docs/test-cases.md` already is the confirmation.
- **Reverted Gemini `thinkingLevel` from `"low"` back to `"minimal"` —
  DECIDED, DEPLOYED, AND PUSHED 2026-09-01** (commit `d25584b`,
  `dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP`, aliased to
  `whatnot-pokemon-identify.vercel.app`). Resolves the open
  latency-vs-accuracy trade-off from the 2026-09-01 research pass (see
  `docs/test-cases.md`'s "Research: latency and PPT rate-limit options").
  `thinkingLevel` was raised `"minimal"` → `"low"` on 2026-08-29 (test
  #50) to try to reduce Gemini read instability, but never showed a
  confirmed benefit — tests #63 and #67, both on deployments already
  carrying `"low"`, still showed the same instability class — while a
  real cost showed up: 31 confirmed hard Gemini timeouts in a ~25h
  window (2026-08-31 to 2026-09-01), all at the `GEMINI_TIMEOUT_MS =
  5000` wall. No confirmed benefit, confirmed cost → reverted.
  `media_resolution: MEDIA_RESOLUTION_HIGH` is untouched — only
  `thinkingLevel` was in question. Deploy checklist followed in full,
  including the scratch-file byte-diff-verify step, which again caught
  the same recurring diacritic-regex transcription corruption (fixed
  non-generatively, re-verified clean before deploying — see
  `docs/test-cases.md` for the full trace). Confirmed `READY`, 3 files in
  the build log, live `GET`/`POST` checks, and runtime logs served by
  this exact deployment; pushed to GitHub (`cbbf8b1..d25584b`). **Not yet
  confirmed via live rescan** — needs a ~24h timeout-rate check and
  continued watching for any recurrence of the #50/#63/#67 instability
  pattern now that `thinkingLevel` is back at `"minimal"`.
- **Removed redundant `includeHistory=true` from every PokemonPriceTracker
  search call — FIXED AND DEPLOYED 2026-09-01** (commit pending push,
  `dpl_6z5qNTuhHbmWzuK5WD4ryA4kmTTm`, aliased to
  `whatnot-pokemon-identify.vercel.app`). Came out of the 2026-09-01
  latency/rate-limit research pass (see `docs/test-cases.md`'s "Research:
  latency and PPT rate-limit options"): PPT bills credits as
  `limit × (1 + includeHistory + includeEbay + ...)`, and every call in
  `fetchPokemonPriceTracker` (`api/identify.js`) was requesting
  `limit=30, includeHistory=true` — 60 credits/call, not 30, confirmed
  against a real production 429 body. `includeHistory=true`'s only
  purpose (feeding `buildPriceVariantsFromPPT`/`buildAggregatePricing`)
  was dead — those functions were removed 2026-08-30 when pricing moved
  to live TCGplayer fetches, but the flag kept running anyway. Verified
  live (two real PPT queries, with/without the flag) that the one field
  still read from `prices` downstream (`primaryPrinting`) and the
  `variants` field (diagnostic-logging only) are byte-identical either
  way — zero behavior change. Halves the credit cost of every PPT call
  and every fallback (page-2/combined-search each drop 60→30; a full
  page1+page2+combined scan drops from 180→90). Deploy checklist
  followed in full, including a scratch-file diff-verify step that again
  caught the same diacritic-regex transcription corruption documented in
  test #63 — fixed non-generatively (copied the exact bytes from source
  via a small script) and re-verified clean before deploying; see the
  full write-up in `docs/test-cases.md` for that story and one other
  real mistake (a deploy call that initially omitted `api/identify.js`
  entirely, caught immediately, never reached `READY`/production). Not
  yet behaviorally confirmed via a live scan — this has no accuracy
  claim to verify via rescan (the pre-deploy live comparison already
  confirmed the removed data was unused); real confirmation would be a
  lower observed daily-credit burn over time. The timeout/thinkingLevel
  latency question from the same research pass is explicitly NOT
  touched here — that's a separate decision still pending the user's
  review of the full options writeup.
- **`numbersMatch()` "totalMismatch" scoring bug (test #67) — FIXED,
  DEPLOYED, AND CONFIRMED IN PRODUCTION 2026-08-31** (commit `42429a5`,
  `dpl_DjjbNMqE5nHb45MGYb3Sjby6JXXB`, aliased to
  `whatnot-pokemon-identify.vercel.app`). `numbersMatch()` (`api/identify.js` — see the FIX
  comment directly above the function) used to treat a candidate whose
  number shares Gemini's read numerator but has a *different*
  denominator/total (e.g. read `056/066`, candidate `056/197`) as
  `match: true` (0.7x partial credit, `strength: "totalMismatch"`) —
  even though that's a different card number, not a legibility issue.
  This spuriously satisfied the `numberMatchedForBest` check
  (`api/identify.js:1334-1352`), which exists specifically to show an
  honest "no candidate has the number that was read" note — so that
  more accurate note got skipped, and when a tie resulted (as in test
  #67, two same-number candidates scoring 20 = 14 totalMismatch + 6 HP),
  the generic hardcoded `ambiguousNoteText()` fired instead, falsely
  claiming the number "wasn't legible this scan." **Fix**: a
  `bothHaveTotal` mismatch now returns `{ match: false, points: 0,
  strength: "none" }` — treated as no match at all, same as a numerator
  mismatch. Deliberately left the `neitherHasTotal`/asymmetric-"weak"
  branches untouched — those are the legitimate partial-match cases
  from test #23 (bare promo number vs. numbered-set candidate, one side
  has no total at all), a different situation from two totals that
  disagree. **Verified two ways**: (1) unit-level — `numbersMatch`
  called directly confirms the totalMismatch pair now returns
  `match:false`, while test #23's case (`"052"` vs `"52/108"` →
  `weak`, 7 points) and test #18's case (`"SM91"` vs `"SM91"` → exact,
  20 points) are unchanged; (2) end-to-end against LIVE PokemonPriceTracker
  data — ran the real `lookupCardPPT()` (not a reimplementation) with
  the exact test #67 read (`cardNumber: "056/066"`, `hp: "70"`, etc.)
  against a live PPT fetch that returned the identical 23-candidate raw
  pool seen in the original production log. Result: `best` is no longer
  the spurious 056/197 tie — it's `Froakie - 088/086` (score 12, tieCount
  1, decided on HP/attackName/rarity signals only), `matchConfidence:
  "Low"`, and `ambiguousNote` is now the accurate "No printing in our
  database has the exact card number that was read (\"056/066\")..."
  message — the misleading "wasn't legible" text no longer fires for
  this case. Also confirmed the fix correctly lets the page-2 →
  combined-search fallback chain run for this exact scenario, which the
  old spurious `match:true` had been silently short-circuiting. See test
  #67's "Fix shipped" note in `docs/test-cases.md` for the full
  verification transcript.

  **Deployed 2026-08-31** after explicit user go-ahead. Deploy checklist
  followed in full: read the real 1825-line source directly (not
  base64), transcribed it into a scratch file, and **diff-verified it
  byte-for-byte against the real source before deploying** — this caught
  a real transcription corruption on the FIRST attempt (the diacritic-
  stripping regex `̀-ͯ` got rendered as literal Unicode
  combining characters, the exact same failure class documented in test
  #63's deploy and the GET-debug-endpoint commit message), fixed
  non-generatively by copying the real line directly from the source via
  `sed`/Python rather than retyping it, then re-diffed clean before
  deploying. Confirmed: deployment state `READY`, aliased to production;
  build log shows exactly 3 files downloaded; live `GET /api/identify`
  returns `normalizeDiacriticTest: "pokemon collector"` (direct
  behavioral proof the exact regex that almost got corrupted deployed
  correctly); live `POST /api/identify {}` returns real `400
  {"error":"Missing imageBase64"}`; runtime logs confirm both requests
  were served by `dpl_DjjbNMqE5nHb45MGYb3Sjby6JXXB`.

  **CONFIRMED in production via real organic traffic**, not just the
  synthetic checklist requests: runtime logs from minutes after deploy
  show a real live scan (Mega Excadrill ex, 2026-09-01T01:38:46Z, served
  by the new deployment) that read cardNumber "111/108" — matching
  neither of the 2 real candidates PPT returned ("103/084" Ultra Rare,
  "065/084" Double Rare) — and the log shows `NO NUMBER MATCH IN POOL:
  read number=111/108 ... best=Mega Excadrill ex - 103/084 (matched on
  other signals only)` firing correctly, NOT the generic "wasn't
  legible" tie-break note that the bug would have produced pre-fix. This
  is a different card than the Froakie case that found the bug, but
  hits the same failure shape (numerator/pool mismatch + a tie among
  remaining candidates) — satisfying this project's own "confirm via
  rescan" standard (any card in the same failure class, not the exact
  same physical card, per "Standing working conventions" above). This
  fix is now fully confirmed, not just deployed.
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
- **Test #58 (2026-08-30)**: first live Trainer/Supporter-card scan since
  the subtype-extraction fix that wasn't flagged wrong (Grimsley's Move,
  clean High/High match, no ambiguous-tie warning). A real but not
  conclusive data point for the Trainer/Supporter tie-break question
  below — doesn't confirm the subtype signal was actually decisive (no
  logs pulled, and a screenshot alone can't show the candidate pool). See
  test #58 in `docs/test-cases.md`.
- **Test #60 (2026-08-30) — FULLY RESOLVED: root cause confirmed via
  real Vercel logs, ground truth confirmed via a live scoped PPT API
  query, no code fix shipped**: Porygon2 scan explicitly flagged wrong
  by the user (matched to "Great Encounters" instead of the real card).
  Logs confirmed the read number "28/147" never appeared in page 1,
  page 2, or the combined name+number search — same class as tests
  #35/#37/#49, a genuine PPT catalog-coverage gap, not a matching-code
  bug. **Ground truth, confirmed live**: the real card is Porygon2,
  **Aquapolis**, 028/147 — every field (name/number/HP/attack) matches
  Gemini's read exactly, so Gemini's read was fully correct too; the
  miss was 100% on the lookup side. The initial hypothesis that this was
  specifically **Skyridge** was wrong — checked live and PPT has zero
  Porygon-line cards under Skyridge at all. The "/147" reasoning wasn't
  unique: Aquapolis, the other e-Card-era set, also totals 147 cards
  (confirmed live — PPT has real `103a/147`/`103b/147` Porygon entries
  under Aquapolis too). This opens a real design question — a 4th
  search-fallback tier ("denominator matches a known set's total card
  count → scope the search to that set," same shape as test #49's
  combined-search fallback) — but real complexity was found worth
  weighing first: the denominator isn't unique to one set (this case
  alone collides between two), and PPT provides no queryable
  `totalSetNumber` field to join against (always `null`), so it'd need a
  hand-maintained static map. **Not to be built without explicit
  sign-off.** See test #60 in `docs/test-cases.md` for the full log
  trace, the live API queries, and the full design write-up.
- **Tests #61-66 (2026-08-30)**: 6-scan investigation of a user report of
  "a lot of incorrect scannings." 2 of 6 confirmed correct (Eternatus V,
  Quaquaval ex — exact PPT number matches). 3 of 6 are the system
  honestly flagging genuine ambiguity — no code bug (2 foil-glare
  unreadable-number ties, 1 genuine PPT catalog-coverage gap same class
  as tests #35/#37/#49/#60). **1 of 6 (test #63) is a real, new failure
  class**: Gemini invented 3 different, all-wrong English translations
  of an untranslated Japanese Supporter card's name across repeat scans
  ("AZ's Solace"/"AZ's Comfort") — PPT's real name is **"AZ's
  Tranquility"**, confirmed via live API query. Also confirmed via a live
  query that PPT's search silently returns unrelated filler results
  (not an empty array) for multi-word queries that match nothing — a
  real API quirk worth remembering when debugging future "raw candidate
  count > 0" logs that don't look right. And confirmed via source read
  that `lookupCardPPT` (`api/identify.js:1073-1076`) gives up immediately
  when the name filter yields zero survivors, entirely before the page-2/
  combined-search number-based fallbacks further down ever get a chance
  to run — even when a legible card number was read on another attempt.
  **Fix scoped, built, and DEPLOYED 2026-08-30/31** (commit `6708bca`,
  `dpl_2hK8UGLwx2kMMkxHuhCZTSsjooBz`, aliased to
  `whatnot-pokemon-identify.vercel.app`): a number-scoped rescue path in
  `lookupCardPPT` that fires only when the name filter finds zero
  survivors AND a legible `cardNumber` was read — tries one combined
  name+number search, then accepts a result only via strict exact-number
  match (never trusting the name or a nonzero raw count, given PPT's
  filler-result quirk found in this test). Purely additive; unchanged
  behavior otherwise. Deliberately does NOT touch the harder,
  Gemini-mistranslation problem itself (still open, no proposed design).
  Deployed via the large-file chunk-and-hash-verify discipline (caught
  and fixed one real transcription error before it shipped — see test
  #63 in `docs/test-cases.md` for the full story); verified `READY`,
  3 files, live `400 {"error":"Missing imageBase64"}`, and runtime logs
  confirming a real live scan succeeded on this exact deployment.
  **New signal to know about**: whenever a result comes from this rescue
  path, `ambiguousNote` carries an explicit honest disclosure ("card name
  we read didn't match anything... this match was found using only the
  card number...") and confidence is capped at Medium even if the score
  would otherwise be High — logged server-side as `[lookup] NAME FILTER
  RESCUED BY NUMBER`. If a future session sees that log line or that
  exact note text in a live panel, that's this fix firing, not a new bug.
  **Not yet confirmed**: needs a live rescan that actually hits the
  targeted path (zero name-filter survivors + a legible number) — no
  real scan has exercised this rescue path yet, only the general-health
  check above. The original AZ's Tranquility card won't necessarily
  retest cleanly since Gemini's translation problem is untouched. See
  test #63 in `docs/test-cases.md` for the full write-up.
- **Research (2026-08-30/31) → shipped: `rarity` as a scoring signal,
  DEPLOYED 2026-08-31** (`dpl_FpQNxCVS1P1YiDrtLif8ViGsbgKv`, commit
  `d941eb8`). Live-checked `weakness`/`resistance`/`retreatCost`/
  `energyType` against real PPT data first: all reliably populated but
  confirmed redundant with existing HP/attack tie groups (identical
  across every tied candidate in the real test #61 tie set), and
  structurally `null` for every Trainer card, so none of them help the
  Trainer/Supporter gap above. `artist` is real but too sparse (~40-60%
  populated) and too hard for Gemini to OCR reliably. **Regulation mark
  is a hard dead end** — confirmed via PPT's own full field list that no
  such field exists in their schema at all. **`rarity` was the real,
  actionable finding and is now shipped**: was 100% populated in every
  sample but completely unused in scoring (confirmed via source before
  the fix — same dead-signal class as the historical `attackName`/
  Trainer-subtype bugs), the only reliably-populated field left unused
  for Trainer cards specifically. `SCORE.rarity = 2` — the smallest
  weight, below every other signal — so it's purely a tie-break prior,
  never able to override a real number/hp mismatch. Verified via a
  local test running the actual scoring functions against the real test
  #53 Drayton candidates: narrows a 4-way tie to 3-way (a **partial
  answer**, explicitly not a full fix — two same-rarity printings from
  different sets still tie). Per explicit instruction, Gemini's own
  mistranslation problem (test #63) was left untouched, and asking
  Gemini to also read rarity remains a separate, not-yet-answered
  question (would need its own live-scan validation). **Not yet
  confirmed**: needs a live rescan of a genuinely tied Trainer card in
  production. See "Fix shipped: rarity" in `docs/test-cases.md` for the
  full write-up and the ROADMAP.md Trainer/Supporter checklist item for
  current status.
- **Deploy-verification tooling: GET debug endpoint, DEPLOYED
  2026-08-31** (`dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec`, commit `194facb`).
  Built after the SAME diacritic-regex transcription corruption from
  test #63's deploy recurred a third time during the rarity deploy above
  (caught pre-deploy via hash-verify each time, but with no way to
  confirm the final attempt didn't repeat it, since no Vercel MCP tool
  can fetch deployed source for a byte diff — a real, repeated gap;
  Vercel's own REST API does have `GET /v8/deployments/{id}/files/
  {fileId}` for this, but it needs a personal access token this session
  doesn't have). `GET /api/identify` (never used by the real extension,
  which only POSTs images — zero production risk) now returns
  `{ sourceHash, normalizeDiacriticTest }`. **Confirmed live**:
  `normalizeDiacriticTest` returned exactly `"pokemon collector"` —
  direct, decisive, behavioral proof the diacritic-stripping regex
  deployed correctly, closing the open question from test #63 without
  waiting for a real accented-name card on stream. **Real finding**:
  `sourceHash` did NOT match local `shasum` even on a confirmed-correct
  deploy — investigated, and the most likely cause is Vercel's own
  Node.js build pipeline transforming the file before runtime, meaning
  `sourceHash` reflects the post-build bundle, not raw source, so it
  can't be used as originally intended (a direct local-vs-deployed byte
  comparison). Doesn't affect `normalizeDiacriticTest`'s reliability.
  Open, low-priority follow-up: fix the code comment that overclaims
  this next time the file is touched.
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
