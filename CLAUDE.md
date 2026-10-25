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
Personal use only. **Scope is Pokémon raw cards (Phase 1).** Sealed packs
(Phase 3) are not built out — don't start without an explicit go-ahead.

**Graded slabs: Phase 0, shadow Phase 1 and Phase 2-lite shipped 2026-10-11**
(tests #96, #97). Phase 2-lite identifies a slab from its LABEL when the
ordinary lookup fails: `parseSlabLabel` -> `slabLabelSetPhrases` ->
`lookupCardFromSlabLabel` (max 2 PPT queries, 900ms capped label wait, same
guards as every other rescue, capped Medium, `matchBasis "slab-label"`).
Printing comes from the label variety (REV.FOIL -> Reverse Holofoil) only
when the catalog lists it. **This depends on `SLAB_LABEL_PROBE` staying on**
— `labelText` comes from the legacy shadow read, so switching the probe off
to protect the legacy rescues also disables slab identification.

Three traps found the hard way and worth not re-discovering: **PPT set names
drop era prefixes** (`"Arceus"`, not `"Platinum: Arceus"` — the latter
returns 0 and still bills 30 credits, since `limit` is billed, not results),
**`normalizePptCard` drops `printingsAvailable`**, so anything needing
it must read the raw row, and **PPT stores one card number under two padding
conventions** (#109): Base Set is `002/102` while its Celebrations: Classic
Collection reprint is `2/102`, so `search="Blastoise 2/102"` returns ONLY the
$13 reprint and `"Blastoise 002/102"` ONLY the $227/$896 originals. Because
`normalizeNumber` strips leading zeros, `buildZeroPaddedNumberVariant`
returns a non-null **identical** form for an already-padded read — use
`storedNumeratorIsUnpadded` (raw digit widths) to ask "is this unpadded?",
never the variant builder's truthiness.

Earlier context (test #96). The graded path now actually works mechanically — before this it could
never return a price at all (it read two field names that don't exist in
PPT's API) — but **it is UNPROVEN end-to-end: no genuine slab has ever been
scanned through it.** Both Gemini models fired `isSlab` zero times across 73
consecutive real scans, so proving it needs a slab-heavy stream. A bare
`isSlab` flag with no readable label is now deliberately ignored and the card
takes the raw path. No graded Suggested Bid yet (Phase 3) — graded bid math
needs its own shipping constant first, since a slab can't ship at the raw
path's $0.955 sub-$20 rate. Don't start Phase 2/3 proper without a go-ahead.

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
test/            Local suite, `node test/alakazam.test.js` (108 tests, no
                 network — mocks global.fetch over real captured PPT rows).
                 Excluded from deploys via .vercelignore. Two tests replay
                 against the pinned pre-fix commit `PRE_FIX_REF` (`1960cd5`)
                 and assert the old bug reproduces there, so the suite cannot
                 pass vacuously. Pinned to a SHA, not HEAD — they silently
                 inverted the moment the fix was committed.
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
- **`SLAB_LABEL_PROBE`** (default **on** when unset; set to `off` to disable)
  — Phase 1 slab-label probe. Adds `labelText` + label instructions to the
  **legacy shadow model's prompt/schema only**; primary and Haiku prompts are
  untouched. Logs `[slab-label-probe]`. Because the legacy read also feeds
  three production rescue paths, `off` makes that call send a byte-identical
  pre-probe body. **Env vars are snapshotted at build time — flipping this
  needs a redeploy.** Deployed state is readable from `GET /api/identify` →
  `slabLabelProbe`. Watch metric + baseline: legacy `cardNumber` non-null rate
  **56.9%** (41/72, preserved 2026-10-07 window); a drop of more than a few
  points over a comparable sample is the trigger to set it `off`.
- **Graded data must come from the MATCHED card.** `lookupGradedPrice` takes
  the matched `tcgPlayerId` and fetches by id (`fetchPptCardByTcgPlayerId`),
  verifying the returned id and card number before pricing. There is NO
  name-search fallback — it used to search by name and take PPT's first
  array match, which priced the wrong sibling on both live graded bids ever
  produced (test #99). Three API facts: a `tcgPlayerId` query returns `data`
  as a **single object, not an array**; Japanese needs `language=japanese`;
  `limit=1` costs 2 credits vs 60 for a `limit=30` search.
- **`salesByGrade` is NOT purely eBay data** despite living under
  `card.ebay` — Dragonite 232 measured 87% Fanatics / 13% eBay. The fee model
  assumes an eBay sale. No per-sale titles or numbers exist in the API.
- **PokemonPriceTracker** — $9.99/mo, the only catalog source. 60 units/min,
  20,000 credits/day; `limit=30` = 3 units / ~30 credits, so a long stream can
  exhaust the day. 30s `lookupCardPPT` cache keyed on language+name+number; a
  numberless read skips the cache entirely.
- **TCGplayer** `infinite-api.tcgplayer.com` price history — unauthenticated
  but **requires a User-Agent header** or it 403s. 2500ms, one retry on abort.

## Current production

- Deployment **`dpl_7wxvxxSE9Sw1PN66LWQcQQmZxWh6`** (2026-10-24, the
  sibling-cap reason wording, test #110), aliased to
  `whatnot-pokemon-identify.vercel.app`. **`sourceHash
  b170c6e88ae4b1713426cf96979f1da5f5e6f394`** == disk at commit `882b400`,
  checked twice; production e2e 4/4, zero runtime errors.
- Previous production **`dpl_AXU1YDAzmw4sBp78BjY2Dyip8USz`** (2026-10-24, the
  Blastoise anniversary-reprint fixes, test #109).
- **`sourceHash 5723ac8d14360a76f5b42b8602a305615a1155e0`** == `shasum
  api/identify.js` on disk at commit `87bc426`. `GET /api/identify` reports
  **`slabLabelProbe: "on"`**. The alias served the new hash on the first
  check (checked twice).
- E2E verified on production 2026-10-24, four scans, **zero runtime errors**:
  **Base Set Blastoise 42360** Low / `sibling-ambiguous` / price **withheld**,
  three rows disclosed (42360 $227.27, 106997 $896.06, 250319 $13.01),
  1664ms; **Celebrations Blastoise 250319** same three-row disclosure
  including itself, 1706ms; **Pikachu XY95** High / `score-only` / 114004,
  linked, 1320ms; **Alakazam 33** 83500, linked, 1871ms.
  E2E payloads were the real TCGplayer product scans (`imageCdnUrl`), not
  livestream frames — a cleaner read than reality, and the 200x275 Alakazam
  thumbnail misreads its number, which is why its confidence varies per run.
- **`extension/content.js` and `content.css` last changed in the 2026-10-17
  builds** — #109 and #110 are backend-only and need no reload, but if the
  extension has not been reloaded since 2026-10-17 the sibling/tie rows (with
  set names) and per-row graded medians still will not render.
- **No real slab has been scanned end-to-end through Phase 2-lite**, and
  #109's Pichu investigation found it is **unreachable** on a weak-signal
  withhold (see the open item below). The graded bid path HAS fired on
  organic traffic.
- **BUILT, NOT DEPLOYED: #111 + #112** (`09f7a90`, `sourceHash 02ff9590…`),
  preview `https://whatnot-pokemon-identify-n3slnvafe-leasedraftai.vercel.app`,
  **168 local tests**, e2e verified on four real images. Awaiting approval.
  #111 makes the slab-label rescue reachable (first real slab ever identified
  end-to-end: PSA 9 Pichu -> 607842, graded $139.79, bid $52.83); #112 stops
  the #109 reprint disclosure firing on a plural.
- Earlier production: `dpl_7jFrzJVGmHPwQkLanpvqYKVCVFBV` (2026-10-18,
  `2fe9412d…`, `6247b40`); `dpl_3f4sgBW1BVdLjA4mvFk383thicTg` (2026-10-17,
  `9f08298e…`, `0601fcc`); `dpl_Eih1EtRbrtHgktna9QiRhq5D4259` (2026-10-17,
  `b170a4e3…`, `90b7d23`); `dpl_7EmniEgDDAdRmGvmDxJMMta53eZg` (2026-10-16,
  `c8f57029…`, `a939d95`).
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
`setname-narrowed`, `name-rescued-by-number`, `sibling-ambiguous`,
`number-tie-ambiguous`, `anniversary-reprint-ambiguous`.

**`number-tie-ambiguous`** (2026-10-18, test #106) — when `tieCount >= 2` and
EVERY tied candidate matches the read number, the number cannot break the tie,
so the result is Low with `pricingLookup: null` and the shared
`siblingAmbiguity` payload (via `buildAmbiguityDisclosure`, which both this
and the sibling cap now use, per-row graded pricing included) instead of
pricing whichever candidate PPT's array order put first. Its own prompt —
*"Check the set symbol, or the pack or box it came from"* — because unlike the
sibling cap these are different PRODUCTS sharing a number (Rayquaza 003/017
POP Series 1 $325.30 vs Blister Exclusives $135.30). The sibling cap takes
precedence. Measured on 46 saved real scans: fires on **2** (~4%).
**FIXED 2026-10-18 (#107):** a disclosure result now nulls the top-level
`tcgplayerUrl` (every disclosed row carries its own) and strips the stale
"This is our best guess only…" clause from `ambiguousNote` via
`stripBestGuessClause`, both at the single point where `pricingLookup` is
nulled — so the score-path sibling cap and the number tie are covered
together, and a genuinely priced result keeps its link and its wording.

### Rescue paths, in order, with their guards

Each exists because retrieval or the read failed, not because scoring did.

1. **Page-2 pagination** — read number absent from a *full* page 1 → one
   `offset=30` fetch, merge, re-score.
2. **Combined name+number search** — still missing → search `"Name 25/99"`,
   then retry with a zero-padded numerator derived from the read's own total
   (Base Set/Base Set 2 pad to 3, Jungle/Fossil to 2), **then, when the read
   total has fewer than 3 digits, the three-digit/three-digit form**
   (`buildWideZeroPaddedNumberVariant`, 2026-10-18, test #106): PPT stores POP
   Series as `003/017`, so `"3/17"` and `"03/17"` both return ZERO rows and a
   $325.30 Rayquaza was unreachable for seven straight scans. Accepted only on
   an exact number match. **Skipped entirely when the read is classified as a
   Pokédex number** (#108): `classifyPokedexNumberRead` fires only after page
   1 AND page 2 have both failed to match N and N appears in the pool's own
   `pokedexNumbers`, logs `[dex-number]`, and makes `cardNumber` count as
   absent for the floor. **Never a scoring signal, never counts toward the
   2-signal floor** — every printing of a Pokémon shares its dex number.
   Ordering is load-bearing: `"No. N"` is ALSO a real card-number format
   (SV2a: Pokémon Card 151, Lapras "No. 131" == 131/165, the 2026-09-26
   `NUMBER_LABEL_PATTERN` fix), and on those cards number == dex number, so
   only retrieval can separate the two cases. Adds **one** extra request,
   only on this path, only for sub-3-digit totals — and on a rapid rescan burst it brings the PPT
   minute-limit 429 forward (one fired live at 22:25:19 on 2026-10-17).
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
   Legacy read awaited through `awaitLegacyReadCapped` at **500ms**
   (`LEGACY_NUMBER_RESCUE_TIMEOUT_MS`); a timed-out read is treated as absent.
   Two guards added 2026-10-15 (Alakazam 33/165, test #101), both of which can
   only ever STOP a rescue:
   - **DENOMINATOR** (`totalsContradict`): if the primary read's total
     positively disagrees with the rescue target's, the rescue does not fire.
     The primary read's denominator is independent evidence even when its
     numerator matched nothing — real case, primary "1/18" vs target
     "001/165". Same rule as `numbersMatch`'s `bothHaveTotal` disqualification,
     which `numbersMatch` itself cannot answer (it short-circuits on
     `a.num !== b.num`). A veto on the chosen match, never a pre-filter.
   - **SIBLING AMBIGUITY** (`sameSiblingGroup`): if the rescue would replace an
     above-floor `best` with a same-base-name, same-set sibling and the two
     models disagree on the number, it returns Low /
     `matchBasis "sibling-ambiguous"` / `pricingLookup: null` /
     `printingUndetermined: true`, naming BOTH cards with number and market
     price. It picks neither, and **never the more expensive one**. Base-name
     matching strips only numeric/H-numeric parentheticals ("(33)", "(H1)") —
     never "(Full Art)"/"(Secret)"/"(Glossy Finish)" — and the set test is
     exact normalized equality, not the forbidden substring test.
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
   the alternate-printing banner. **Two suppressions (2026-10-15, test #101),
   every other guard untouched:** the read name appears as a whole token in the
   candidate's own card text, or **the other model read an attack that IS on
   the card's list**. Built for the Expedition Alakazam, where the primary
   model read the **Poké-POWER** "Psymimic" as the attack and capped the
   CORRECT card. **PPT has no Poké-Power/Poké-Body/Ability field at all**
   (verified on an e-Card row and a modern V row), so the text check cannot
   recover that case — the cross-model check is what does, and it is
   live-confirmed (`ATTACK MISMATCH SUPPRESSED`).

10. **Sibling-disagreement cap** (`sibling-ambiguous`, tests #103, #104, #105)
    — runs AFTER every path above has chosen a winner, including plain
    `score-only`. Fires only when the fetched pool holds an above-floor
    `sameSiblingGroup` sibling of the winner (same base name, same set).
    **This is a BIG class**: `candidateSiblingBaseName` strips the
    `" - 125/197"` suffix, so every modern ex/SIR, V/alt-art and
    regular/full-art-Trainer twin qualifies — 19 popular names gave **92
    sibling pairs**, and SV03 Charizard ex alone has four same-set versions.
    Corroboration = `numberPointsAtCandidate(legacyRead.cardNumber, best)`
    (a **non-weak** `numbersMatch` AND no `totalsContradict`), and that number
    must not point at a sibling instead. Decision table:
    - legacy points at the winner → **corroborated**, normal confidence, no note.
    - legacy points at a DIFFERENT sibling → **ambiguous**, always.
    - no usable legacy number, winner is **cheapest** in its group **AND the
      primary read's number points at the winner** → **stands** at normal
      confidence with a note naming the pricier twin. The
      `primaryPointsAtBest` requirement was added 2026-10-18 (#105) after a
      live Flareon scan whose number matched nothing stood at $48.62 beside a
      $337.50 sibling — being cheapest is not evidence when no number
      confirms the winner.
    - otherwise → **ambiguous**.
    An **unknown market** anywhere in the group counts as "not provably
    cheapest" and caps (real case `Judge - 167/182`,
    `siblingMarkets=[null,null,19.88]`). Market comes from PPT's
    `prices.market` on already-fetched rows — no extra call.
    **Legacy wait is two-stage** (#105): 500ms first, then the rest of
    `SIBLING_CAP_LEGACY_TOTAL_WAIT_MS` (1200) **only** when the cap is about
    to say `ambiguous-uncorroborated` purely because no legacy number has
    arrived. Corroborated/disagreement decisions never wait. Measured cost:
    **+399ms** on that one class, and it flipped a correctly-identified PSA 10
    from withheld to priced.
    Ambiguous returns **Low**, `pricingLookup: null`, and a
    `siblingAmbiguity` payload listing every candidate with number, rarity and
    **its own ready-made `pricingLookup`**; ordered by card number, never
    price-ranked. Hint text is generic — *"Check the finish and artwork to
    tell these apart."*
    **Graded slabs are priced PER ROW** (#105): when the read carries a
    grader+grade, each disclosed sibling gets its own
    `lookupGradedPrice` by tcgPlayerId, in parallel —
    **2 credits per row** (`limit=1`, not the 30 a search costs), capped at
    `SIBLING_GRADED_MAX_LOOKUPS` (6), ~+600ms. The thin-data gate applies
    **independently per row**. Each candidate carries `graded` with
    `gradedPrice` / **`gradedSuggestedBid`** (note the prefix — reading
    `suggestedBid` silently yields "Bid: —"). Before this, three real slabs
    hit `GRADED FETCH SKIPPED: no card matched` and showed no graded figure.
    Cannot change which candidate won; adds no PPT *searches*.
    **Pool-dependent**: it only sees a sibling that was actually fetched.
    `[sibling-cap]` logs the full decision, `winnerIsCheapest`,
    `legacyWaitExtended` and `PER-SIBLING GRADED` on every firing.

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

**Graded slabs (Phase 3, 2026-10-11):** same fee model and margin table,
with **flat $5.80 shipping** (`GRADED_SHIPPING_PER_CARD`) instead of the
raw `< 20 ? 0.955 : 5.80` split — a slab cannot ship in a plain envelope,
so the raw rate would over-bid a cheap slab. A graded bid is computed only
when the exact grader+grade bucket passed the thin-data gate AND the card
was identified. **Graded sell-through is window-aware, never `count / 3`**:
PPT's eBay window varies a lot (80 days on one real card, 197 on another
the same day) and a naive divide can flip Slow to Normal. Reference: SM210
PSA 9 median $155.20 → list $156.20 → BE $125.68 → Normal → bid $90.67.
**PPT's `ungraded` bucket is NOT a safe raw proxy** — SM210's reads $200
median against a $153.84 raw market, catching the box set.

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

**DEPLOYED TO PRODUCTION 2026-10-24 (#109) — Base Set Blastoise 2/102 was
priced as a $13 Celebrations reprint.** Commits `11c04df` + `87bc426`,
production `dpl_AXU1YDAzmw4sBp78BjY2Dyip8USz`, `sourceHash 5723ac8d…`
byte-exact with disk, 142 local tests (122 before), production e2e 4/4 with
zero runtime errors. Root cause
is the padding-convention trap above: a correct read of "2/102" matched the
reprint EXACTLY, so every existing net — page-2, combined search, both
weak-signal floors, number-tie, sibling cap — was keyed on a condition that
was false. Three changes: **padded-number retrieval** (one extra `limit=30`
search, ~150ms, gated on a collision tell because 62 of 278 real rows store
numbers unpadded across 31 ordinary sets); **`extractAttackNames` strips HTML
markup** (43 of 271 rows change, ALL `[]` → a parsed list,
`extractFirstAttackName` untouched so scoring cannot move); and
**`anniversary-reprint-ambiguous`** disclosure keyed on rarity
`"Classic Collection"`, never on a stamp read. Blastoise now discloses all
three printings ($227.27 / $896.06 / $13.01) at Low with no single price.
**No `extension/` change** — reuses the existing `siblingAmbiguity` and
`printingUndetermined` shapes. Full write-up: `docs/test-cases.md` #109.

**FIXED, AWAITING PRODUCTION APPROVAL (#110)** — the sibling cap's `reason`
string contradicted itself (*"the two AI models read different card numbers
("2/102" vs "2/102")"*). `numberShared` now splits the
`ambiguous-shared-number` case from a genuine `ambiguous-disagreement`, the
lead clause stops claiming the number tells the printings apart, and the row
count is real rather than a hardcoded "Both printings" (#109 can disclose
three). Wording only — a replay through `4296deb` pins identical confidence,
price and disclosed ids. Commit `882b400`, preview
`dpl_HxM8eitpYEE7wgQcaWH9AmsnEJFK`, 146 local tests.

**OPEN — Phase 2-lite slab-label rescue is UNREACHABLE on a weak-signal
withhold (#111 investigation, 2026-10-24, NOT fixed).** `baseFailed =
!baseLookup || !baseLookup.found`, but the weak-signal floors return
`found: true` (with `pricingLookup: null`, `setName: null`,
`cardImageUrl: null`), so `lookupCardFromSlabLabel` never runs for a slab
that produced a junk above-floor match. Confirmed live on a Japanese PSA 9
Pichu (cert 115602100): a clean 73-char label was read by the probe, no
`SLAB LABEL PARSED` line ever appeared, and the correct card (**607842 "Neo
Premium File 2", NM $42.02, PSA 9 median $139.79 → bid $52.83**) was sitting
in the pool tied at score 6. Two further blockers behind it: the label's
"#172" is a **Pokédex** number and 607842's PPT `cardNumber` is an **empty
string**, so the label-number filter would decline it (the slab path has no
`classifyPokedexNumberRead`); and the label's "REVERSE FOIL" printing is not
in that row's `printingsAvailable` (`["Holofoil"]` only). Full write-up:
`investigations/2026-10-24-pichu-slab/findings.md`.

**First live firings on organic traffic, 2026-10-24:** `[dex-number]` (#108,
on the Pichu "no. 172" read) and a real `[slab-label-probe]` label
(`legacyLabelTextLen=73`). Both had been listed as never-yet-observed.

**DEPLOYED TO PRODUCTION 2026-10-18 (#108) — the Japanese Meganium
Pokédex-number fix.** Commit `6247b40`, production
`dpl_7jFrzJVGmHPwQkLanpvqYKVCVFBV`, `sourceHash 2fe9412d…` byte-exact with
disk, 122 local tests (108 before). A Japanese Neo-era card prints no
collector number — the only number on it is the Pokédex "No. 154" — and the
pipeline spent it as a collector number (~10 searches / 300 credits across
the real 5-scan burst). Now classified **after** retrieval fails, so SV2a's
"No. XXX" card numbers still match. Measured: Meganium 10→8 searches
(300→240 credits); SV2a Lapras/Victreebel unchanged; Azumarill/Typhlosion
2→1 search and Medium+priced → **Low+withheld** (a latent floor hole: the
old gate also needed `best.number`, which these empty-`cardNumber` rows
lack, so BOTH floor branches were skipped). Preview e2e: XY95
High/`score-only`, the Rayquaza two-row disclosure intact, zero runtime
errors; production e2e re-ran all three cleanly on 2026-10-18. **The dex
path is not e2e-verified** — no Japanese Neo-era frame exists in any saved
payload. The Meganium outcome is deliberately unchanged (still Low, still
withheld): this removes waste and a dishonest message, it does not identify
the card.

**OPEN — the empty-number-WINNER floor hole, measured 2026-10-18 (#108
follow-up, NOT fixed).** #108 routes the floor on effective-absence, which
closed the hole only for a **dex-classified** read. Probed before/after:
a NON-dex read (e.g. `"94/105"`) whose winner has an empty `cardNumber`
still skips BOTH floor branches and is priced at Medium on **one** signal.
Scale: across all saved windows, **103 winner observations, zero with an
empty number** — never observed firing, but the Meganium 7-way tie came one
tie-break from it (the true `575820` was tied at the top with an empty
number). Fix is the same shape: treat an empty-number winner as "no number
to match" for the floor regardless of what the read holds. Note the
**≥2-signal allowance already exists** — the floor's bar is
`corroboratingSignals < 2`, so hp+attack or hp+set already price today; the
only thing withheld is the 1-signal case. Evidence for keeping that: of the
14 weak-signal-floor scans on record (all 1-signal), the candidate that
would have been priced was **wrong in all 9 where ground truth is known**
(Meganium ×4, Rayquaza ×5). The one known counter-case, test #28 Dark
Gengar at $223, predates the floor (2026-08-27 vs 2026-09-27).

**OPEN — the Haiku fallback is DEAD (#108).** Every scan in the 2026-10-18
window logged `Haiku error 400 ... "Your credit balance is too low to
access the Anthropic API"`, so vision is a single point of failure if Gemini
throws. Costs money to fix → Eric's call. Measured cost when it was funded:
**median $0.00325/scan** across 56 real `haikuCostUsd` values (~$3.25 per
1,000 scans; input ~2738 tokens, output ~99). Note the Haiku API call and
the `[haiku-shadow-test]` logging are **not separable by an env var** —
`haikuPromise` is fired unconditionally whenever `ANTHROPIC_API_KEY` is set,
and the shadow test only consumes that same promise, so silencing the log
saves nothing. Stopping the spend means making the call lazy (the fallback
becomes serial, additive latency on a Gemini failure), which reverses the
2026-09-04 "keep as-is" decision.


**DEPLOYED TO PRODUCTION 2026-10-17 — the Rayquaza fixes + disclosure
polish** (tests #106 and #107, 108 local tests),
`dpl_3f4sgBW1BVdLjA4mvFk383thicTg`, `sourceHash 9f08298e…`, commit `0601fcc`. Two changes: the
three-digit/three-digit number padding (recovers a $325.30 POP Series
Rayquaza that was unreachable for seven straight scans) and
`number-tie-ambiguous` disclosure for exact-number ties across different
products. **`extension/content.js` changed — the sibling/tie rows now show
the SET, which is the only field separating a cross-set tie. Reload the
extension.** Preview e2e: 3/3 Rayquaza runs give the two-row disclosure where
all three previously withheld; XY95 and Alakazam 33 unchanged; zero errors.

**OPEN — PPT minute-limit pressure on rescan bursts (#106, not fixed).** A
real 429 fired mid-burst on 2026-10-17: `22:25:19Z`,
`[lookup] PokemonPriceTracker request FAILED — status= 429 {"error":"Minute
rate limit exceeded", ... "required":3,"available":2} name= Rayquaza`. Seven
scans of the same card in 44 seconds, each firing 3-5 searches at 3 units
apiece, exhausted the 60-unit minute budget — so at least one scan ran on a
degraded or empty pool through no fault of the matching logic (it is why
`ba35511a`'s outcome line is missing). **The #106 padding fix adds a sixth
search to exactly those scans**, so it brings the 429 forward on a burst. On
a single scan the trade is clearly right (30 credits to recover a $325.30
card); on a rescan storm it is not free. Three options, none measured yet:
1. **A per-scan PPT search budget** — hard cap on searches per request, so
   one scan can never consume a third of the minute allowance. Simplest, but
   it would silently disable the later rescues on the hardest cards, which
   are the ones that need them.
2. **Short-circuit the combined-search loop** once a query returns a row that
   matches the read number exactly. Already half-true (the loop `break`s on
   success), so the win is narrower: it would only skip the WIDE variant when
   the narrow one already worked. Cheap and safe.
3. **Client-side debouncing of repeat scans of the same frame** in
   `extension/content.js` — the burst was seven scans of one card, several
   with near-identical reads. The 30s PPT cache already absorbs identical
   reads; this would absorb the near-identical ones that currently each pay
   full price. Most effective, and the only option that reduces the Gemini
   spend too.
Measure which bursts actually occur before building any of them.

**Noted, not built (test #101): Expedition Reverse Holofoil price curves can
be inverted.** 83500's Reverse Holofoil reads NM **$16.00** (sold 0) against
LP $73.30 / MP $59.78 / HP $43.66 / Damaged $26.84 — NM below every worse
condition. `basePriceTier` prefers NM, so the panel shows $16.00 for a
printing worth $70+, and break-even/bid follow. Error direction is
**underbidding**, so it costs nothing today. A **"NM below LP" sanity check**
would catch a broken condition curve cheaply — flag the variant, never guess a
replacement price. Needs its own measurement pass first.

**Deployed 2026-10-11 — graded-slab Phase 0 + shadow-only Phase 1** (test
#96; 199 local tests). Watch two things on organic traffic: (1) the legacy
`cardNumber` non-null rate against its **56.9%** baseline — if it drops, set
`SLAB_LABEL_PROBE=off` and redeploy; (2) `[slab-label-probe]`
`legacyLabelTextLen`, the Phase 1 payoff metric — if a slab label is almost
never legible, Phase 2 proper should NOT be built and the honest answer is
the raw path plus the existing warning. **`extension/content.js` changed, so
the extension needs a manual reload in `chrome://extensions`.** Not yet
observed on organic traffic: `SLAB FLAG IGNORED`, `GRADED FETCH SKIPPED`,
`GRADED PRICE WITHHELD`, any `[slab-label-probe]` line with a real label, and
the graded-price branch firing at all.

**Deployed 2026-10-09** — stamp-aware + unique by-number selection, the PPT
`" - "` attack-format parser fix with a prose fail-safe, and suppressing the
`none` stamp badge. **`extension/content.js` changed, so the extension needs a
manual reload in `chrome://extensions`** before the badge fix is visible.
**Not yet observed on organic traffic:** the new
`LEGACY-MODEL NUMBER RESCUE DECLINED` line and the stamp filter narrowing a
real pool.

**Half-closed 2026-10-15 (test #101): the DOWNSTREAM legacy-rescue await is
now capped** at 500ms via `awaitLegacyReadCapped` /
`LEGACY_NUMBER_RESCUE_TIMEOUT_MS`, the same `Promise.race` pattern as
`LEGACY_SETNAME_HINT_TIMEOUT_MS`. That was the await behind the only runtime
error in the 2026-10-14 window, and it fired again on 2026-10-15
(requestId `63f242c1`). **The SUB-FLOOR rescue's await is still a bare
`await legacyReadPromise`** — left alone deliberately to avoid touching the
full-art Trainer path in the same change. Capping it the same way is the
remaining follow-up.

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

**Fixed and deployed:** the attack-mismatch false positive on PPT's third
attack format (`"[3] Name - description"`). `extractAttackNames` now cuts at
`" - "`, returns `[]` for prose-looking output, and returns `[]` rather than a
partial list when an entry has no leading `[cost]` bracket;
`extractFirstAttackName` stays byte-identical so scoring cannot move.
Confirmed on production: Snorlax 89392 reads `attackName: "Layabout"` and now
comes back **High with no mismatch**, where HEAD would have fired.

**The PPT abort retry HAS NOW BEEN OBSERVED FIRING** (2026-10-16, preview
`dpl_BV2akTyBBnYFPQxXfBgeswQz2YNu`): `[lookup] PokemonPriceTracker request
threw: This operation was aborted — retrying once` on an Alakazam scan
(`ff965e11`, `lookup 2683ms`, total 4061ms). **The single retry succeeded and
the scan returned the correct card** (83500, High, Normal, no note) — exactly
the transient-blip case the retry was built for in `093f551`, so it needs no
action. It surfaced under rapid-fire test scans rather than organic traffic,
and it shows up in `get_runtime_errors` as a one-count group because the line
is a `console.error`; that is expected, not a fault. Still not seen on
organic traffic.

**Watching, no action needed:** `SUB-FLOOR LEGACY-MODEL NUMBER RESCUE` has not
yet fired on organic traffic.

**Not decided:** switching the Vercel project to git-linked deploys.

**OPEN — the 30th Celebration logo reads as a "Pokemon Center" stamp (#112,
NOT fixed).** The primary model returned `stampType: "Pokemon Center"` on the
M6a Shining Celebi, so the panel showed a Pokemon Center badge for what is the
30th Celebration logo. Harmless to scoring (`candidateStampType` is null for
that set, so neither the +3 nor the −8 branch runs) but the badge is wrong.
A vision-read issue, not a matching one.

**Reprint sets store the ORIGINAL card's number — now confirmed on BOTH**
(#109, #112): Celebrations: Classic Collection stores Base Set Blastoise as
`2/102`, and `M6a: MEGA Expansion 30th Celebration` stores Shining Celebi as
`141/103`. Its Classic Collection subset runs `141/103`–`165/103` (25 cards);
`setId 24721` carries denominators of only `103`, `RGB` and none.
