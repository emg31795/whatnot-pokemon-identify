# Roadmap — Whatnot Pokémon Card ID Extension

This is the project's scope document — what "done" looks like at each
stage, and what's next. `CLAUDE.md` points here for current priority;
this file is where the checklist actually lives so it can grow and get
checked off without bloating the file re-read every session.

**Scope is fixed to Pokémon.** Not planned: other TCGs (Magic, sports
cards, etc.), even though pallet.trade's own API hints at multi-game
support via its `game` field. Revisit only if explicitly requested.

## North star

Identify any Pokémon card shown on a Whatnot stream, on demand, with
accuracy and speed matching or beating pallet.trade ($9.99/mo) — for
free. Pricing must be real, live, TCGplayer-accurate per condition, never
a synthetic estimate. End state: raw cards, graded slabs, and sealed
packs all identifiable, English and Japanese.

## Definition of done (applies to every phase below)

A phase is "done" when live-test failures for its scope trend toward
zero in `docs/test-cases.md` — not a fixed pass-rate number, since the
underlying data (PPT's catalog coverage, Gemini's read reliability) isn't
fully within this project's control. Latency target: 2-5 seconds
end-to-end (already consistently met for raw-card lookups as of the
2026-08-30 migration).

---

## Phase 1 — Raw ungraded cards, English + Japanese (IN PROGRESS — current priority)

Status: working, not yet fully stable. See `docs/test-cases.md` for the
full test log (51+ tests) and `docs/whatnot-pokemon-extension-build-status.md`
for the fix history.

- [x] Card identification pipeline (Gemini vision read → PPT candidate
      search → scoring/matching → best-candidate selection)
- [x] Real per-condition pricing via TCGplayer's own endpoint (replaced
      synthetic multiplier estimates entirely, test #42/#44)
- [x] Japanese-language support (language param fix, test #27)
- [x] Crowding-out mitigation for common species names (page-2 pagination
      + name+number combined-search fallback, tests #30-33, #49)
- [ ] **Gemini read-consistency fix** — `thinkingLevel: low` +
      `media_resolution: HIGH` (commit 3e895b1) deployed and confirmed
      against a live rescan of a hard card (target: no recurrence of
      test #50's hallucination class of failure). **Still unconfirmed —
      not resolved by tests #61-66** (2026-08-30). Those tests shipped a
      different, separate fix (the name-filter rescue path below), and
      if anything surfaced a further, distinct example of Gemini read
      instability (test #63's Gemini guessing 3 different, all-wrong
      English translations of the same Japanese card name across repeat
      scans) — a different symptom than test #50's hallucination class,
      not evidence for or against this specific fix either way. **Another
      unfavorable data point: test #67** (2026-08-31, Froakie) — 4 repeat
      scans of the same physical card 16s apart on
      `dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec` (which already includes this
      fix) each returned a different, wrong `cardNumber` denominator
      ("056/066", "056/066", "056/086", "056/064" — never the actual
      "056/197"), every one at self-reported High confidence. Same
      symptom class as test #50 (unstable number/field reads across
      identical repeat scans), unlike test #63's mistranslation issue —
      this one bears directly on the fix and isn't favorable. Still not
      a verdict either way (one hard card doesn't settle it), but the
      trend across #50/#63/#67 continues to show no clear resolution.
      **New data point on the LATENCY side of this same trade-off
      (2026-09-01 research pass, see `docs/test-cases.md`'s "Research:
      latency and PPT rate-limit options")**: real Vercel error data
      shows 31 real Gemini calls fully aborted by the 5000ms timeout in
      a ~25h window (2026-08-31 to 2026-09-01), all on deployments that
      already include `thinkingLevel: "low"` — this is a genuinely open
      decision, not yet acted on: lower `thinkingLevel` back toward
      `"minimal"` (risks reopening the accuracy problem it was raised to
      fix, per #50/#63/#67 above) vs. raise `GEMINI_TIMEOUT_MS` above
      5000ms (converts hard failures to slow successes, but conflicts
      with the project's 2-5s target) vs. leave as-is. Explicitly flagged
      as the user's call to make, not something to build speculatively —
      see the research write-up for the full options list with
      trade-offs. Deliberately NOT resolved in this pass.
      **DECIDED (2026-09-01): reverted `thinkingLevel` from `"low"` back
      to `"minimal"`** — no confirmed benefit (tests #63/#67 both landed
      on deployments already carrying `"low"` and still showed the same
      instability class) against a confirmed cost (the 31-timeout data
      point above). `media_resolution: HIGH` is untouched — only
      `thinkingLevel` was in question. See `docs/test-cases.md`'s
      "Research: latency and PPT rate-limit options" for the full
      trade-off writeup and the new dated entry logging this decision.
      **DEPLOYED 2026-09-01** (commit `d25584b`, `dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP`,
      aliased to `whatnot-pokemon-identify.vercel.app`) — deploy checklist
      followed in full (scratch-file byte diff against real source before
      deploying, which caught and fixed the same recurring diacritic-regex
      transcription corruption from test #63/#6x one more time before it
      shipped); confirmed `READY`, build log shows "Downloading 3
      deployment files", live `GET /api/identify` returns
      `normalizeDiacriticTest: "pokemon collector"`, live `POST
      /api/identify {}` returns real `400 {"error":"Missing imageBase64"}`,
      and runtime logs confirm both requests were served by
      `dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP`. Pushed to GitHub
      (`cbbf8b1..d25584b`). Not yet confirmed via live rescan — needs both a
      timeout-rate check over the following ~24h and continued watching for
      any recurrence of the #50/#63/#67 instability pattern now that
      `thinkingLevel` is
      back at `"minimal"`.
      **New, same day (2026-09-02): a severe live timeout cluster (13
      hard timeouts out of 21 scan attempts in a 7-minute window — see
      test #68's update in `docs/test-cases.md`) prompted a research-only
      pass on whether Gemini is even the right vision provider going
      forward, given the thinkingLevel revert alone didn't fix this.**
      Real current pricing/limits pulled from OpenAI's and Anthropic's
      own docs (not memory): both cost more per scan than Gemini at
      current pricing (roughly 1.4-3.3x across the realistic mid/high
      tiers; GPT-5-mini is actually cheaper than Gemini, not parity — a
      correction made 2026-09-03 after `GEMINI_INPUT_USD_PER_1M`/
      `GEMINI_OUTPUT_USD_PER_1M` in `api/identify.js` were found to be
      stale, undercounting Gemini's own real cost by ~2x; see
      `docs/test-cases.md` for the full trace), unproven on accuracy
      here either way, both support real JSON-schema structured output,
      both have fully configurable client timeouts (confirming our 5s
      ceiling is our own choice, not a Gemini-specific constraint), and
      the code-level migration is genuinely contained (one self-contained
      function + small cost helper + two call sites, verified by reading
      `identifyWithGemini()` directly) — but prompt re-tuning for a new
      model and real accuracy comparison are unknowns no docs research
      can answer; that needs a live test with a provisioned second API
      key, which doesn't exist in this project yet. No recommendation
      made — full write-up in `docs/test-cases.md`, "Research: is Gemini
      the right vision provider?" — explicitly the user's call, not
      built speculatively.
      **New, 2026-09-03: the live-test key from the item above now
      exists and the shadow test is confirmed live** — see
      `docs/test-cases.md`'s "Shadow test: Claude Haiku 4.5 vs. Gemini".
      The same evening produced the worst Gemini cluster yet, verified
      directly against real Vercel logs (not the user's live tally alone):
      **13 of 14 scans failed in the 02:15:59-02:24:21 UTC window** (11
      hard timeouts at the `GEMINI_TIMEOUT_MS = 5000` wall, plus **2
      confirmed `503 "This model is currently experiencing high demand"`
      errors** — a genuinely new Gemini failure mode for this project,
      distinct from every timeout documented so far). **Claude Haiku 4.5
      succeeded on all 13 of those failures** (High/Medium confidence,
      plausible structured reads in every case) — direct, real evidence
      that whatever is degrading Gemini right now (rate-limiting/server
      load on Google's side, given the new 503 alongside the existing
      timeouts) is not something Haiku is also hitting. The 1 scan where
      Gemini succeeded (Minior, 070/062, High confidence, clean
      `tieCount=1` PPT match — strong indirect evidence Gemini was
      correct here) also had Haiku succeed but **disagree** on
      cardName/cardNumber/subtype/attackName (Haiku read "Meteono
      070/102" instead) — a first real look at same-frame accuracy, not
      just failure-mode coverage, though with only one such data point
      it's not yet a pattern. This is real-time evidence for the still-
      open strategy question this whole item is about, but with only
      ~14 data points (13 of them are "Gemini failed vs. Haiku succeeded"
      rather than "both succeeded, compare accuracy") it does not yet
      answer the harder question — whether Haiku is actually *more
      accurate*, not just more available right now. See
      `docs/test-cases.md` for the full per-scan log and running tally,
      updated as more scans come in.
- [ ] **Build: promote Claude Haiku 4.5 from shadow-only to an active
      fallback** — decided 2026-09-03, given the severe live Gemini
      cluster above (13 of 14 scans failed in one window). When Gemini
      fails (timeout or error), show the user Haiku's result instead of
      nothing, clearly labeled as a fallback read rather than the
      primary provider — a real, user-facing behavior change, unlike the
      shadow test above. Not yet started. See the shadow-test tally in
      `docs/test-cases.md` and CLAUDE.md's "Current priority" for full
      context before starting.
- [ ] Sustained trend of declining live-test failures in
      `docs/test-cases.md` for at least 2 weeks of real stream use.
      Tests #54-66 (2026-08-30) add more real data points (2 confirmed
      correct, several honest low-confidence non-bugs working as
      designed, 2 real bugs found and fixed — see test-cases.md) but
      this is nowhere near the 2-week bar yet — not checkable.
- [ ] **Name-filter rescue-path fix** (test #63) — when zero candidates
      survive the name filter (e.g. an untranslated or mistranslated
      Japanese card name) but a legible `cardNumber` was read on any
      attempt, retry via a number-scoped search instead of giving up
      immediately; only ever accepts a result via a strict exact-number
      match, never trusting the name or PPT's raw result count (PPT was
      confirmed live to return unrelated filler, not an empty array, for
      multi-word queries that match nothing). Deployed 2026-08-30/31
      (`dpl_2hK8UGLwx2kMMkxHuhCZTSsjooBz`, commit `6708bca`) —
      build/live-endpoint/runtime-log verified per CLAUDE.md's deploy
      checklist, but **not yet confirmed via a live rescan that actually
      exercises this exact path** (zero name-filter survivors + a
      legible number) — no real scan has hit it yet. Deliberately does
      NOT attempt a fix for the underlying Gemini-mistranslation problem
      itself (still open, no proposed design) — see test #63 in
      `docs/test-cases.md` for the full write-up.
- [ ] Decision made on the open strategy question (patch reactively vs.
      a dedicated pass adopting more of pallet.trade's hard
      "reject on number mismatch" model — see build-status.md part 4)
- [x] Trainer subtype-extraction bug fixed — `normalizePptCard` now
      pulls Trainer subtypes (Supporter/Item/Stadium/Tool/etc.) from
      PPT's `pokemonType` field, mirroring the earlier `attackName` fix.
      Deployed 2026-08-30 (`dpl_GnxKLpHTkcN8QuVXhY1gPgpmpk1P`, commit
      `d589d46`), build/live-endpoint/runtime-log verified per CLAUDE.md's
      deploy checklist. Shipped as an isolated fix, deliberately NOT
      bundled with the item below — see test #53 in test-cases.md.
- [ ] **Trainer/Supporter same-name tie-break design question** — test
      #53 (first non-Pokémon card scanned) found this is more than the
      extraction bug above: for Trainer cards, `number`+`set` are the
      ONLY signals that can ever break a tie between same-name printings
      — HP/attackName are always N/A by card type, and subtype (even
      fixed) can't discriminate between printings that share the same
      subtype (e.g. two different-set "Drayton" Supporter printings).
      This makes Trainer-card matching structurally more fragile to a
      bad Gemini number read than Pokémon-card matching, which has three
      independent tie-break signals in reserve.
      **PARTIAL ANSWER shipped 2026-08-31** (`dpl_FpQNxCVS1P1YiDrtLif8ViGsbgKv`,
      commit `d941eb8`): `rarity` added as a small (`SCORE.rarity=2`)
      candidate-side tie-break signal, using PPT data already fetched —
      verified via the real test #53 Drayton candidates (isolated
      subtype-scoring test) to narrow the tie from 4-way to 3-way.
      **Explicitly a partial answer, not a resolution** — it helps some
      ties (distinguishing e.g. an Uncommon reprint from chase-tier
      printings) but does NOT discriminate between two same-rarity
      printings from different sets (Drayton's own case still has 2
      genuinely tied Special Illustration Rare printings even with
      rarity scoring). The underlying structural gap — Trainer cards
      have fewer independent tie-break signals than Pokémon cards — is
      still open. Still needs a live rescan of a real Trainer-card tie
      to confirm the signal fires as designed in production (only
      verified via isolated scoring-logic tests + a clean unambiguous
      live Trainer match so far, not yet a genuinely tied one). See test
      #53/#61-66/"Fix shipped: rarity" in `docs/test-cases.md` for full
      detail. A further, deliberate decision on the remaining structural
      gap (e.g. widen the ambiguous-match safety net's messaging for
      Trainer cards specifically, or something else) is still needed —
      not something to patch reactively.

**Do not start Phase 2 work until this phase's checklist above is
substantially complete** — per the user's explicit direction, each build
should serve a specific roadmap item, not just whatever a live scan
happens to surface next.

## Phase 2 — Graded slabs (NEXT, partially started)

Status: detection exists, live pricing does not.

- [x] Slab detection (`isSlab`/`grader`/`grade`/`certNumber` fields from
      the Gemini read)
- [x] Raw-card-estimate fallback with an honest "graded-market pricing
      not set up yet" warning (confirmed working, test #28)
- [ ] Real graded-market pricing (e.g. PPT's eBay-comp lookup, or a
      TCGplayer-equivalent graded-price source — needs research before
      building, same standing convention as everything else in this
      project)
- [ ] Live-test confirmation on real graded slabs across multiple
      graders (PSA, BGS, CGC, TAG, etc. — only TAG has been tested live
      so far, test #28)

## Phase 3 — Sealed packs / product identification (NOT STARTED)

Status: feature request only, awaiting explicit go-ahead to start design
work. See "Open feature request" in build-status.md for prior framing.

- [ ] Design decision: build at all? (retail sealed product pricing is
      feasible via PPT's sealed-product tracker; non-retail promotional
      items are not — no market data exists for those)
- [ ] Design decision: auto-detect sealed product vs. a manual mode
      toggle in the extension UI?
- [ ] Not started until both decisions above are made explicitly by the
      user — do not build speculatively.

---

## How to use this file

- Check items off as they're confirmed (not just shipped — confirmed via
  a live rescan or real test, consistent with this project's "verify,
  don't assume" convention).
- Update the phase status line and "current priority" pointer in
  CLAUDE.md whenever a phase completes or the priority changes.
- New work should generally map to an item in the current phase's
  checklist. If it doesn't, that's worth a deliberate conversation before
  starting (are we changing priority, or is this a real interrupt like a
  live-stream-blocking bug) — not a silent scope drift.
