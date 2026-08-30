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
      test #50's hallucination class of failure)
- [ ] Sustained trend of declining live-test failures in
      `docs/test-cases.md` for at least 2 weeks of real stream use
- [ ] Decision made on the open strategy question (patch reactively vs.
      a dedicated pass adopting more of pallet.trade's hard
      "reject on number mismatch" model — see build-status.md part 4)

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
