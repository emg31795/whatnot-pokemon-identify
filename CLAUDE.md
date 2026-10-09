# CLAUDE.md — Whatnot Pokémon Card ID Extension

Condensed working guide. **Full narrative history is in `docs/history.md`**
(the former 5,866-line CLAUDE.md, moved 2026-10-09 because it loaded into
every session and ate context). **Live test log: `docs/test-cases.md`.**
Archived scope/roadmap docs: `docs/archive/`.

When something here is not enough, grep `docs/history.md` — it has the full
trace for every fix, incident and reversal referenced below.

## What this is

A free personal Chrome extension replicating pallet.trade's core feature:
while watching a Whatnot Pokémon auction, click "Identify Card" and it
captures the video frame, identifies the card via AI vision on a Vercel
backend, looks up real market pricing, and renders it in an on-page panel.
Personal use only. **Scope is Pokémon raw cards (Phase 1).** Graded slabs
(Phase 2) and sealed packs (Phase 3) are not built out — don't start them
without an explicit go-ahead.

**Key design principle, learned the hard way: when the data doesn't support a
confident answer, say so.** Low confidence + an explicit warning is a feature.
A confidently-wrong price on a 10-second auction decision is the failure mode
this whole project is built to avoid.

## Standing rules

**Always ask first and wait for an explicit go-ahead:**
- deploying to Vercel (production *or* preview)
- `git push`
- anything that spends money or API credits (buying PPT credits, paid tiers)
- deleting any file

A prompt containing detailed post-deploy verification steps is **not** a
go-ahead to deploy. This was violated once (2026-09-03) and corrected.

**Free rein, no need to ask:** local edits, local commits, updating the docs
below, reading logs, research, running things locally.

**Working model:** a separate claude.ai assistant independently verifies Claude
Code's reports against real state (Vercel, the repo) and drafts the prompts
that come back here. So report **verifiable facts** — hashes, deployment IDs,
requestIds, counts — not impressions, and expect them to be checked.

**Other standing rules:**
- **Never print, log or commit an API key.** `.env.local` is git-ignored and
  holds the real PPT/Anthropic keys; `source` it for verification, never echo it.
- **Vercel runtime logs are retained ONE HOUR (Hobby).** When a scan is
  reported, save the raw lines to scratch **before** anything else; any "since
  X?" question older than ~1h is structurally unanswerable. The MCP log tool
  truncates long lines (~3000 chars) — that's the tool, not Vercel.
- **Verify via real logs before asserting a root cause.** Code-reading, a
  screenshot or a docs summary is not enough (tests #27, #48, #67).
- **Don't trust a report at face value** — not Eric's relay from the chat
  assistant, not a prior session's claims. Re-verify against real state.
- **Avoid heavy PPT use while Eric scans live.** Check
  `x-ratelimit-minute-remaining` (60/min, ~3 units per `limit=30`); well under
  60 means a stream is running. **Stop on any 429.** Prefer a mocked harness.
- **A lookup/pricing change isn't done until a real end-to-end scan passes**
  on production, not just `GET`/`POST {}`. A clean deploy ≠ a confirmed fix.
- **Project facts belong in this repo, not Claude Code's own memory store.**
- If a step is dragging (many calls, no progress, workarounds on workarounds),
  stop and report instead of grinding.

## Deploy checklist

**Deploy from disk via the Vercel CLI. Never go back to the MCP
`create_deployment` inline-content path** — that caused years of
transcription corruption, including a ~6.5-minute production outage from a
dropped function. CLI deploys have produced byte-exact hashes every time.

```bash
npx vercel deploy --yes --scope leasedraftai          # preview
npx vercel deploy --prod --yes --scope leasedraftai   # production
npx vercel inspect <url> --scope leasedraftai
npx vercel curl <preview-url>/api/identify --scope leasedraftai
```

1. **`--scope leasedraftai` on every subcommand.** Without it the CLI returns
   a bare `{"message":"Not authorized"}` and builds nothing. This is not an
   expired login.
2. **If you get "Not authorized": run `npx vercel ls --scope leasedraftai`
   FIRST** to confirm no deployment was created, then retry with `--debug`,
   which has succeeded immediately both times this happened.
3. **Fresh `Read` of every file in the payload, same turn** — only relevant
   if you ever hand-assemble one; a CLI deploy from disk makes it moot.
4. **`sourceHash` from live `GET /api/identify` must equal
   `shasum api/identify.js`.** That is the whole verification.
5. A preview URL needs `npx vercel curl` — a plain curl gets a 302.
6. **`vercel promote` cannot promote a preview** (production rebuilds with
   production env vars), so expect two deployment IDs sharing one `sourceHash`.
7. Real end-to-end scan + `get_runtime_errors` before calling it done.
8. Update `CLAUDE.md` / `docs/test-cases.md` in the same session.

**Env vars change requires a redeploy** — Vercel snapshots them at build time.

## Architecture

```
extension/     Chrome MV3: content.js (panel UI, frame capture, both fetches),
               content.css, background.js, popup.html, manifest.json
api/identify.js  Vision read + PPT catalog match. The whole matching engine.
api/price.js     Live TCGplayer per-condition pricing + break-even/bid math.
api/flag.js      "Flag this scan" -> one greppable log line.
docs/history.md  Full project history (was CLAUDE.md).
docs/test-cases.md  Live test log.
docs/archive/    ROADMAP.md, build-status.md.
```

**Request flow:** `content.js` captures a frame → `POST /api/identify` returns
identification **immediately** plus a `pricingLookup` object → `content.js`
renders that, then fires a **separate** `POST /api/price` for live pricing and
fills the price section in place. The two stages were decoupled 2026-09-10
because a slow TCGplayer fetch used to hold the whole response hostage.

**Chrome does NOT auto-reload an unpacked extension.** Any `extension/` change
needs a manual reload in `chrome://extensions` — and that strands already-open
Whatnot tabs until they're hard-refreshed (known, unfixed; see history.md).

### Data sources
- **Gemini** (`GEMINI_API_KEY`), default `gemini-3.5-flash-lite`, 5000ms —
  the primary vision read.
- **Claude Haiku** (`ANTHROPIC_API_KEY`), `claude-haiku-4-5-20251001`, 5000ms.
  Fires in parallel every scan; an **active fallback** only if Gemini throws,
  plus `[haiku-shadow-test]` logging. Decided 2026-09-04: keep as-is, don't
  tune the timeout, don't revert.
- **`LEGACY_GEMINI_SHADOW_MODEL`** (`gemini-3.6-flash`) — regression watch
  (`[legacy-model-shadow-test]`, every request). Its read is ALSO consumed for
  real by the number-rescue and setName-hint paths.
- **PokemonPriceTracker** — $9.99/mo, the only catalog source. 60 units/min,
  20,000 credits/day; `limit=30` = 3 units / ~30 credits, so a long stream can
  exhaust the day. 30s `lookupCardPPT` cache keyed on language+name+number; a
  numberless read skips the cache entirely.
- **TCGplayer** `infinite-api.tcgplayer.com` price history — unauthenticated
  but **requires a User-Agent header** or it 403s. 2500ms, one retry on abort.

## Current production

- Deployment **`dpl_2j5pUPQdssRsjfncoRem8Mvyvb4E`**, aliased to
  `whatnot-pokemon-identify.vercel.app`.
- **`sourceHash dc41b8624d9ed1458ff5349f9c6e45fa62537b4e`** — byte-exact to the
  `api/identify.js` it was built from (CLI deploy from disk). Note the working
  tree is currently AHEAD of this (see Open items), so a local
  `shasum api/identify.js` will not match until the next deploy.
- Project `prj_eS2DCNOeX82nyDOA9o5OHVhBwxCA`, team `leasedraftai`
  (`team_DZEpR5n7heCyZsNFjxZmxUP1`). **Not git-linked** — no build-on-push.
  GitHub: `https://github.com/emg31795/whatnot-pokemon-identify`.

## Matching / scoring model

```js
SCORE = { number: 20, hp: 6, subtype: 5, set: 3, attackName: 4,
          stampMatch: 3, stampMismatch: 8 /* subtracted */, rarity: 2 }
MATCH_FLOOR = 3    MEDIUM_THRESHOLD = 5    HIGH_THRESHOLD = 10
```

`pickBestCandidate` scores every name-filtered candidate, counts distinct top
scorers by `candidateDedupKey` (`baseName|number|setName|shadowless`) as
`tieCount`, prefers a non-oddity candidate, and returns `null` below
`MATCH_FLOOR`. `tieCount >= 2` forces `matchConfidence = "Low"`.

`numbersMatch` strengths: **exact** (both totals agree, or neither side has a
total) and **weak** (asymmetric — one bare promo number vs. a numbered-set
card; coincidental, worth 0.35x). A *disagreeing* total is **not** a match.

`matchBasis` (machine-readable reason code on the response): `score-only`,
`tie`, `weak-number`, `legacy-number-rescue`, `setname-search`,
`setname-narrowed`, `name-rescued-by-number`.

### Rescue paths, in order, with their guards

Each exists because retrieval or the read failed, not because scoring did.

1. **Page-2 pagination** — read number absent from a *full* page 1 → one
   `offset=30` fetch, merge, re-score.
2. **Combined name+number search** — still missing → search `"Name 25/99"`,
   then retry with a zero-padded numerator derived from the read's own total
   (Base Set/Base Set 2 pad to 3, Jungle/Fossil to 2). Accepted only on an
   exact number match.
3. **Name-filter rescue by number** (`name-rescued-by-number`) — zero name
   survivors + a legible number → one search, filtered **strictly by number,
   never by name** (PPT returns unrelated *filler*, not an empty array, for
   multi-word queries that match nothing). Capped Medium.
4. **setName-scoped search** (`setname-search`) — result is weak
   (`!best || bestScore < HIGH_THRESHOLD || tieCount >= 2`) and the number
   isn't already confirmed → take a setName hint from the primary read, else
   the legacy shadow read (**500ms cap**, `LEGACY_SETNAME_HINT_TIMEOUT_MS`) →
   search `"Name SetName"`. Guards, all load-bearing: name filter, **exact
   normalized set-name equality**, and **exactly one distinct** qualifier.
   Capped Medium.
   - **READ TOTAL ORPHAN relaxation**: if the read's denominator appears on no
     candidate in the pool, the set was never retrieved, so accept
     denominator-only equality — but **reject weak matches** on this path.
5. **setName tie-narrowing** (`setname-narrowed`) — null cardNumber + a tie +
   a read setName → narrow the tied set. Capped Medium, never promoted High.
6. **Sub-floor legacy-model number rescue** (`legacy-number-rescue`, when
   `best` is null) — searches only the already-fetched pool, **no new PPT
   call**. Guards: name filter, **non-weak exact** number match, **exactly one
   distinct** candidate. Capped Medium. Built for full-art Trainers, where
   `hp`/`attackName` are null by card type so a misread number leaves nothing
   above the floor.
7. **Downstream legacy-model number rescue** (`legacy-number-rescue`, when
   `best` exists but nothing matches the read number). Capped Medium.
8. **Weak-signal floors** — if no number match (or a null cardNumber) and the
   winner corroborates on fewer than **2** of
   `hp/subtype/set/attackName/stampMatch`, **withhold the price entirely**
   (`pricingLookup: null`, `printingUndetermined: true`). `rarity` is
   deliberately excluded: it's a candidate-only prior true of almost any
   expensive-looking card.
9. **Attack-mismatch cap** — English High reads only, candidate must have a
   non-empty parsed attack list; if the read attack is on none of them, cap to
   Low and **append** to `ambiguousNote`. English-only on purpose: a Japanese
   attack must survive OCR *and* translation, and a false Low also suppresses
   the alternate-printing banner.

PPT fetch aborts retry **once** at `CARDDB_RETRY_TIMEOUT_MS` (1200ms), scoped
to the abort branch only — by construction it can never retry a 429.

## Pricing model (all live in production)

**1. List price** — what Eric actually lists at on eBay:
```
marked = market * LISTING_MARKUP_MULTIPLIER (1.0) + LISTING_ADD_AMOUNT (1.00)
LISTING_PRICE_TIERS, first match wins, replaces outright:
    marked in [0.00, 2.48]   -> 2.49
    marked in [20.00, 25.58] -> 19.99
```
The "market + $1.00" template is a **test running to ~mid-Oct 2026**; revert is
two constants (`1.2` / `0`).

**2. Break-even** — the eBay-side zero-profit figure, knows nothing about Whatnot:
```
feeRate  = (0.1235 + 0.022) * 1.07 = 0.155685   // Basic Store + Promoted, on the
                                                // tax-inclusive total (7% assumed)
fixedFee = list <= 10 ? 0.30 : 0.40
shipping = list < 20 ? 0.955 : 5.80
breakEven = list - feeRate*list - fixedFee - shipping
```
Use the exact product `0.155685`, never a rounded 15.57%. The 2.2% ad rate is
applied to every sale deliberately — conservative, so it can only understate
bid room. Reference: market $5 → **$3.81**, $10 → **$7.93**, $30 → **$19.97**,
$100 → **$79.08**.

**3. Suggested Bid** — the only place Whatnot purchase costs appear:
```
suggestedBid = (breakEven / (1 + margin) - WHATNOT_SHIPPING_PER_CARD)
               / (1 + WHATNOT_PURCHASE_TAX_RATE)
margin by tier: Fast-flip 15%, Normal 30%, Slow 50%, Stagnant 100%
WHATNOT_PURCHASE_TAX_RATE = 0.06625   // CONFIRMED: 48 real orders, 7 sellers
WHATNOT_SHIPPING_PER_CARD = 0.00
```
Rounded to cents once, at the end. A `suggestedBid <= 0` renders `(Bid: Skip)`.

**Sell-through tier** = total sold across **all five condition tiers** ÷ 3
months: `>=600/mo` Fast-flip, `>=50` Normal, `>=5` Slow, else Stagnant.

Displayed market price and per-condition prices are **raw market** — none of
this fee math touches them.

**Caution on the standard regression card:** Pikachu XY95 (tcgPlayerId 114004)
has TCG NM ~**$207**, but 2026-10-05 research found real eBay sales at
~**$98-115** (PriceCharting agrees independently). Its documented break-even
$169.79 / Bid $106.16 are a **formula check only** — do not treat them as a
sane bid for that card.

## DO NOT (each cost real money or a real regression once)

- **DO NOT select a candidate by number alone without being stamp-aware and
  requiring exactly one distinct survivor.** A stamped twin sharing a number
  (`Snorlax 33/95`: $30.23 vs $499.99 vs $1975) will otherwise win on PPT's
  array order. `scoreCandidate` already docks 8 for a stamp the read says isn't
  there; the rescues bypass scoring, so they must apply it themselves.
- **DO NOT loosen the `set` substring test** so `"Celebrations"` reaches
  `"ME: 30th Celebration"`. Burger King Chimchar precedent: it makes the wrong
  candidate win *harder*.
- **DO NOT "fix" the `"&"`/`"and"` set-name comparison inside `scoreCandidate`
  alone.** A promo reprint genuinely isn't in the base set, so that change
  buries it further. `&`/`and` folding is correct *only* in the setName-rescue
  acceptance check, where it already is.
- **DO NOT auto-flip the default printing on a vision stamp read.** Tried
  2026-08-26, reverted the next day on a confirmed stamp false-negative. A
  vision signal may inform a *warning*, never the default. Today's error
  direction is underbidding (costs nothing); auto-flipping inverts it.
- **DO NOT loosen setName-rescue acceptance** because a hint looked bad. The
  gate is right; the hints are bad.
- **DO NOT derive a completion-rate or regression-watch count from logs
  filtered on `query="[timing]"`.** A `[timing]` line is only written *after*
  the vision call succeeds, so every failure is structurally invisible. This
  silently inflated the numbers twice (tests #85, #86). Filter on
  `legacy-model-shadow-test` (fires unconditionally) or pull unfiltered and
  grep `[identify]`. `[timing]` is fine for latency only.
- **DO NOT base64-encode a file "for safety" before deploying.** Caused a
  truncated-file outage and a 50-minute stall. Moot now, don't reinvent it.
- **DO NOT send a `data:image/...;base64,` prefix** in a hand-built test scan.
  The API wants raw base64 and 400s, manufacturing a fake error cluster.

## Open items

**Committed locally, NOT pushed, NOT deployed (2026-10-09):** the Snorlax
stamped-twin fix (stamp-aware + unique by-number selection), the PPT `" - "`
attack-format parser fix with a prose fail-safe, and suppressing the `none`
stamp badge. 73/73 Trainer replay unchanged, controls pass, 48/50 functions
byte-identical. Production is still `dc41b862` until a deploy happens.

**Open: the legacy-read `await` on both legacy-rescue paths has no time cap.**
It is a bare `await legacyReadPromise`, bounded only by `GEMINI_TIMEOUT_MS`,
unlike the 500ms `LEGACY_SETNAME_HINT_TIMEOUT_MS` race the setName-hint path
uses. Capping both with the same `Promise.race` pattern is the obvious
follow-up.

**Queued corrections to fold into the next real `api/identify.js` change**
(deliberately not done as comment-only edits, to preserve deploy-hash parity):
1. The `WHATNOT_PURCHASE_TAX_RATE` comment still says "ASSUMPTION, NOT YET
   VERIFIED" — the 48-receipt check disproved that.
2. `stampNote` still claims our data source "doesn't track pricing for stamped
   promos separately" — false for set-stamped EX cards (they're a Reverse
   Holofoil printing or a separate product).
3. If `WHATNOT_SHIPPING_PER_CARD` is ever set to a real value, **move the
   shipping term outside the division** — receipts confirm Whatnot taxes
   shipping, so the correct form is `target / (1 + tax) - shipping`. A no-op
   at 0.00; a few cents too generous otherwise.

**Fixed locally, not deployed:** the attack-mismatch false positive on PPT's
third attack format (`"[3] Name - description"`). `extractAttackNames` now cuts
at `" - "` and returns `[]` for prose-looking output so the rule skips;
`extractFirstAttackName` stays byte-identical so scoring cannot move.

**Watching, no action needed:** `SUB-FLOOR LEGACY-MODEL NUMBER RESCUE` and the
PPT abort retry have not yet fired on organic traffic.

**Not decided:** switching the Vercel project to git-linked deploys.
