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

## Two collaborators, one project — roles

This project is worked on from two separate Claude surfaces that never
talk to each other directly — the user relays context between them.
Keeping the division of labor explicit here (not just in chat) is what
lets either side pick up correctly after the other's work, and why this
file's own "no need to ask" vs. "ask first" rules below apply to both.

- **Claude Code, running locally in this repo**
  (`~/Documents/whatnot-pokemon-extension` on the user's Mac): does
  essentially all the real legwork on this project — writing code,
  running/debugging locally, deploying to Vercel (with go-ahead),
  pushing to GitHub (with go-ahead), and keeping this file / ROADMAP.md /
  `docs/test-cases.md` updated as things change. Read this file first at
  the start of any session, per the intro above.
- **The Claude chat assistant** (claude.ai, the "Whatnot extension"
  Project — reads this repo via a GitHub sync, and can also get a live
  device-bridge link to this same Mac): is not primarily the one writing
  code. Its role is to review what Claude Code reports, independently
  verify it against real state (Vercel logs/deployments via its own MCP
  tools, live git state via the device bridge, live API/docs research)
  rather than take a report at face value, catch discrepancies, and draft
  the next prompt to send back to Claude Code. It also handles things a
  local coding session usually wouldn't: a forwarded email or screenshot,
  broader research, cross-referencing multiple data sources. With a
  working device link it can make small, low-risk, doc-only edits
  directly (e.g. logging a new open item here) rather than only drafting
  a prompt for Claude Code to do it — but substantive code changes stay
  Claude Code's job, not something to build inline in chat.
- **Verification applies to both directions.** "Never trust a report at
  face value, verify against real logs/git state" (see "Standing working
  conventions" below) isn't just Claude Code checking its own work — it's
  also the chat assistant independently checking Claude Code's reports,
  and Claude Code independently checking anything relayed back from chat,
  before either acts on it.

## Current priority

> **STANDING RULE — READ THIS BEFORE ANY STATS / COMPLETION-RATE / REGRESSION-WATCH LOG PULL:**
> **Never derive a completion-rate or regression-watch count from a `get_runtime_logs` pull filtered on `query="[timing]"` alone.** A `[timing]` line only gets logged *after* the Gemini call to the current/primary model succeeds — so a request where the current model itself fails (times out, errors) **structurally never produces a `[timing]` line at all** and is silently absent from any dataset built that way, undercounting failures and inflating the reported completion rate. This is not a hypothetical: it has already happened **twice**, in test #85 and test #86 (`docs/test-cases.md`), both times caught only by the user's own manual re-check of the raw logs, not by the pull itself.
>
> **Always filter on `query="legacy-model-shadow-test"` (it fires unconditionally, on every request, success or failure) or pull unfiltered and grep for `[identify]`/`"Gemini call failed"` instead.** `[timing]` is fine for latency stats specifically (where excluding failed calls is correct and intended), but never for a completion-rate or regression-watch denominator. See test #86's "Correction" section for the full trace of what this looks like when it's missed.

**Phase 1 of `docs/ROADMAP.md`: stabilize raw-card (English + Japanese)
identification accuracy and speed before expanding scope.** Do not start
Phase 2 (graded slabs) or Phase 3 (sealed packs) work until Phase 1's
checklist in ROADMAP.md is substantially complete — every build should
serve a specific roadmap item, not just whatever a live scan happens to
surface next. See `docs/ROADMAP.md` for the full phase breakdown, north
star, and definition of done.

**Immediate next step (updated 2026-09-06)**: the Gemini 3.5 Flash-Lite
promotion is live and fully verified end-to-end (tests #80-84,
`docs/test-cases.md`) — `GEMINI_MODEL` now defaults to
`gemini-3.5-flash-lite` in production
(`dpl_22F3PPBwEjkB5UPAPt9oo23m1QXD`), and the `LEGACY_GEMINI_SHADOW_MODEL`
regression watch on the old primary (`gemini-3.6-flash`) is confirmed
collecting real data via a genuine `[legacy-model-shadow-test]` log
line. Nothing further to build here — what matters now is **watching
the `[legacy-model-shadow-test]` logs over the coming days/weeks** for
any sign the new primary has a real weakness at volume or under live-
stream conditions that the pre-promotion testing (18 ground-truth
photos, off-stream and well-lit) didn't catch. No action needed unless
that watch surfaces something concerning — see the "Decided, 2026-09-04"
precedent above for the kind of bar that would justify revisiting a
model/provider decision (a live, out-of-band test, or a sustained
worsening over an extended window), not a single bad data point. See
test #84 in `docs/test-cases.md` for the full promotion trace and the
rollback plan (a one-line `GEMINI_MODEL` change) if it's ever needed.

**Update, 2026-09-06, same day**: first real stats pull against live
(not shadow-test) traffic on the new primary — see test #85 in
`docs/test-cases.md` for full numbers (corrected same day after the
user's own re-check of the raw logs caught a real methodology bug in
the first pass — see below). Real, reassuring first data point:
completion rate 96.2% (2/52 full failures, both providers down
together, no rescue) vs. the old primary's documented 14-17% healthy /
24-84% degraded failure rates; latency median ~1.83-1.95s with 92-94%
of scans landing inside the 1-3s target; the `[legacy-model-shadow-
test]` regression watch now has its first 50 data points — corrected
breakdown 1 current-model failure / 2 legacy-model failures / 47
both-succeeded (the original write-up derived this from a `[timing]`-
filtered dataset that structurally can't contain current-model-failure
cases, undercounting both failure types). On the 47 both-succeeded
comparisons: `cardName` agreement **96% (45/47)**, not the originally-
reported 100% — **2 real disagreements found**, both variant-qualifier
drops (`"Galarian Slowpoke"` vs. `"Slowpoke"`; `"Rampardos"` vs.
`"Rampardos ex"`), inconsistent in direction (one example each way), so
**not yet confirmed as a systematic Flash-Lite bias** but flagged as a
named pattern to watch specifically in future pulls. `cardNumber`
agreement 57% (27/47) (same order of magnitude as test #82's
pre-promotion finding, no independent ground truth to say which side is
right). Of the 3 completion-rate disagreements in the corrected sample,
2 favored the new primary and 1 favored the old primary — mixed, not
one-sided. Nothing here meets the "sustained worsening / live
out-of-band test" bar for revisiting the promotion — just one
~22-minute window, worth another casual pull in the coming days,
specifically checking whether the qualifier-drop pattern recurs and in
which direction. Zero "flag this scan" reports in the available window.

**Update, 2026-09-07**: what matters most is still the passive
`[legacy-model-shadow-test]` log-watching above — no action needed
there unless it surfaces something. Separately, an off-Phase-1
extension-tooling fix shipped and was pushed today: the toolbar icon
now toggles the on-page Card ID panel (it used to always force-open
Settings and needed a page refresh to respond) — see "Recent /
in-flight work" below for the full root-cause/fix writeup. Core
behavior is live-confirmed by the user; three sub-cases (the gear-icon
inline settings save/load, the stale-tab `chrome.scripting` injection
fallback, and reopening the panel via the icon after closing it with
"×") share the same code path but weren't individually exercised in
that test — worth a specific look next time the extension comes up,
not urgent. (Also closed out today, no action needed: a research-only
question on whether "EX Delta Species" needs its own stampType/pricing
handling — confirmed it's already fully and correctly handled by
existing card identification, no code changed; see
`docs/test-cases.md`'s "Research: does 'EX Delta Species' need a new
stampType / pricing-variant" section for the full trace.)

**Update, 2026-09-07, later same day**: second real post-promotion
stats pull (test #86, `docs/test-cases.md`), a stats/monitoring pass
only (no code, no deploy) covering a real ~16.5-minute scanning session.
**Corrected same day**: the first pass reported 100% completion (34/34)
from a `get_runtime_logs` pull filtered on `query="[timing]"` — the same
structural bug test #85 already caught once (a current-model failure
never reaches the `[timing]` checkpoint, so it's invisible to that
query). The user's own re-check of the raw logs found the real total
was **36 requests, not 34**, including 2 genuine current-model
failures. Corrected: **completion rate 94.4% (34/36)** — close to, not
better than, test #85's 96.2% — with 0/36 fallback rescues (neither
failure was rescued by Haiku; one of the two had the legacy model
succeed with a good read on the same frame, but Haiku still failed,
so the user saw the honest "couldn't identify" message anyway).
Latency-when-successful is holding in the same range (gemini-ms median
1853ms, total-ms median 2082ms, 94% inside the 1-3s target, n=34
successful calls). The `[legacy-model-shadow-test]` regression watch is
at **100% coverage (36/36)**, not 34/34 — 2 current-model failures and
2 legacy-model failures (not 0 and 1 as originally reported); the
agreement percentages on the 33 both-succeeded records (94% cardName,
45% cardNumber) were correct as originally reported and are unchanged.
The named qualifier-drop pattern from test #85 recurs once more
(`"Crobat V"` vs. legacy's `"Crobat"` + `subtype:"V"`) but again in an
inconsistent direction — 3 instances across 2 pulls now, still not
confirmed as a systematic Flash-Lite bias either way. Also checked, per
explicit request, for any sign of the 2026-09-07 toolbar-icon
double-injection bug (two billed calls from one click) — none found in
this window's traffic pattern (every close-timestamp scan cluster is
2-13s apart with independent requestIds and often differing reads,
consistent with manual back-to-back rescans, not a duplicate fire),
though log timestamp granularity can't fully rule out a true sub-second
duplicate. Zero flag reports this window. Nothing here changes the
"keep as-is"
status of the Flash-Lite promotion or the Haiku fallback — just
continued watching, per the "Immediate next step" note above.

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
(Gemini-succeeds) path.** This deploy also hit two real, honestly-logged
mistakes — a ~5-minute production outage (zero real user impact,
confirmed via runtime logs) and a known deviation from the committed
source (comments trimmed, functionality verified intact) — see the
"Haiku active fallback" entry in "Recent / in-flight work" below for the
full incident account, and `docs/test-cases.md`'s full shadow-test tally
for the accuracy context behind the decision.

**Update, 2026-09-03, later same day**: the fallback path itself has now
fired in production for the first time (21:14:15 UTC, a real Gemini
timeout) — **and on that first firing, Haiku's read was wrong** (High-
confidence "Wailord" for a card that wasn't a Wailord; Haiku's own
reasoning noticed the actual Japanese species text — カビゴン/Snorlax —
and still committed to "Wailord" anyway). The miss was contained: the
wrong read scored below the matching code's floor, so the user saw an
honest "couldn't confidently match" message, not a confidently-wrong
priced result. This is 1 data point, not a trend — status changes from
"not yet observed" to **"observed once, and inconclusive/concerning,"**
not to "confirmed working" and not to "should be reverted." See test #70
in `docs/test-cases.md` for the full log trace (including a hypothesis,
not yet acted on, that the shared Gemini/Haiku prompt's "single card
being held up or highlighted" instruction may be a contributing factor)
and the "Haiku active fallback" entry below for the updated status.

**Update, 2026-09-04**: asked the obvious next question — has the
elevated Haiku timeout rate (test #71: 52%) been sustained since
deploy, or was it one bad window? Real answer: confirmed sustained for
the ~44 minutes of log history that still exist (53.5%, 69/129 samples,
extending well past test #71's original 10 minutes) — but the
deploy-to-now comparison itself turned out to be structurally
unanswerable, because Vercel's Hobby-plan runtime logs are only
retained for 1 hour (see "Known gotchas" below, test #74). Status is
unchanged from above (two real data points, not enough to decide) — the
user's own framing was "give it another week of casual log-checks
before a deliberate keep/tune/revert conversation," which still stands;
this just closes out the one specific analytical question that could
still be answered from logs, and flags that any "since X" question
further back than an hour will hit the same wall going forward.

**Decided, 2026-09-04: keep the Haiku active fallback as-is — no
timeout tuning, no revert.** One more data point (test #75) came in
first: every one of the 69 Haiku shadow-test failures across the
129-sample window is the exact same genuine `HAIKU_TIMEOUT_MS=5000`
timeout (`"This operation was aborted"`, clustered 5001-5007ms) — never
a rate limit or API error — but with a hard bimodal gap against the 60
successes (2024-4988ms, nothing near the 5s line from below). **User's
decision and rationale**: a blind timeout bump is as likely to
accomplish nothing (if the real latency on failing calls is far past
any reasonable bump) as to help, and this tool's whole purpose is a
fast answer for a live buy/bid decision — a fallback that takes
8-10+ seconds isn't really serving that even when it technically
succeeds. Reverting isn't warranted either: the fallback is strictly
additive and safe (every failure degrades to exactly the pre-fallback
honest message, never worse), so there's no forcing function to remove
something that isn't broken, just underperforming its original hope.
**This is a decision, not another "still watching" — don't revisit it
without new evidence.** The two things that would justify reopening it:
(1) a live, out-of-band, no-timeout test directly against Anthropic's
API to measure Haiku's true completion-time tail for this exact
workload (real API cost — only if the user decides it's worth it), or
(2) a sustained *worsening* over a longer window (Haiku's own failure
rate climbing well past ~50%, or the fallback rescuing 0 of many real
Gemini failures over an extended period, not just one evening).
Absent either, the fallback stays exactly as deployed. See test #75 in
`docs/test-cases.md` for the full analysis and the "Haiku active
fallback" entry below for the corresponding status note.

**Update, 2026-09-04**: checked a 10-minute real production window (23
scans) and found a second, related concern — **Haiku's own completion
rate in that window was 52% (12 of 23 timed out), worse than Gemini's
17% in the same window**, checked independently of whether Gemini had
failed. Direct effect on the fallback: of 4 real Gemini failures in
that window, 3 also had Haiku time out simultaneously (both providers
down together → generic "couldn't identify" message), and the 1 that
did get a Haiku response still failed to find a PPT match. **0 of 4
real Gemini failures were rescued into an actual match this window.**
See test #71 in `docs/test-cases.md`. Together with test #70, this is
now two real, concerning data points in the same direction (not yet
enough for a revert decision — could be a transient Anthropic-side
slowdown, same class as Gemini's own `503` cluster) — but "1 data
point, inconclusive" understates it now. Worth a longer observation
window before deciding whether to keep, tune, or revert the fallback.

**Update, 2026-09-05: a severe live Gemini failure cluster (test #79),
a new real product requirement (1-3s identification, not 2-5s), and a
Gemini 3.5 Flash-Lite shadow test now deployed to answer it.** During a
routine audit, real logs caught Gemini failing 50-84% across a
sustained ~60-minute window — worse than test #78's already-flagged
24% uptick, confirmed ongoing (not tapering) via the freshest slice
checked (83% failure), and ruled out as self-inflicted (spans two
unrelated deployments, lower traffic than test #78's milder window).
**Recommendation given and followed: do NOT revert `thinkingLevel` to
`"low"`** — it's already at `"minimal"` (the fastest setting) and still
failing this badly, so raising it back would plausibly make things
*worse*, not better. No code changed for this cluster; it read as a
transient provider-side event (same signature as the 2026-09-03
cluster, which self-resolved) and the user chose to wait rather than
act. See test #79 in `docs/test-cases.md` for the full per-window
breakdown.

Separately, the user set a real, explicit product requirement: scans
need to resolve in **1-3 seconds**, not the original 2-5s target,
because they're used in ~10s Whatnot sudden-death auctions. A full
research pass (`docs/test-cases.md`, "Research: hitting a 1-3s latency
target for sudden-death auctions") found the honest ceiling: even at
the fastest shipped Gemini config, true success-only latency is ~1.7s
best-case, ~2.5s median — 1-3s is **not reliably achievable** on a
strictly fresh, on-demand vision-API call with any current provider.
Racing Gemini/Haiku on raw response time was evaluated and rejected —
real same-frame data showed only 22% `cardNumber` agreement between the
two, so racing would frequently substitute a less-reliable read for a
modest, inconsistent speed gain. Background/continuous scanning is the
one path that could actually meet the requirement (by hiding latency
rather than reducing it), but collides with PPT's 60-calls/minute rate
limit unless scoped to vision-only — not built, needs an explicit
go-ahead. `docs/ROADMAP.md`'s Definition of Done latency target was
updated from 2-5s to 1-3s to reflect this as the real, current
requirement.

That research also surfaced a real, cheap thing worth trying: **Gemini
3.5 Flash-Lite**, a lighter/cheaper Gemini model marketed as faster,
requiring no new provider integration since `GEMINI_MODEL` is already
an env-var-driven swap in this codebase. Built as a temporary, read-only
shadow test — same non-disruptive pattern as the Haiku shadow test,
gated entirely on a new `FLASH_LITE_SHADOW_MODEL` env var — logging a
`[flash-lite-shadow-test]` line per scan with both models' reads and
independently-correct latency for each. **Deployed 2026-09-05**
(`dpl_3gWk2KV9dc9mn7n3vzrjJP4zjpVW`, commit `d4285c7`), then
**redeployed 2026-09-05/06** (`dpl_AdJmrGEjVW1MJtcw9hqmY4TNEjcL`, no
code change) after the user added `FLASH_LITE_SHADOW_MODEL=gemini-3.5-flash-lite`
to Vercel's Production environment via the dashboard — a redeploy was
confirmed necessary (env vars are snapshotted at build time, matching
this project's own Haiku-shadow-test precedent) and confirmed
sufficient via a real test scan against the live endpoint, not
assumed: real runtime logs show a genuine Flash-Lite API call firing
with real token usage, and on that one frame Flash-Lite completed in
1596ms vs. the current model's 5005ms timeout. **Data collection is now
confirmed live** — one data point only, not a conclusion; recommended
volume before drawing one is 50-100 real scans with both models
succeeding. See the "Gemini 3.5 Flash-Lite shadow test" entry below and
the latency-research entry in `docs/test-cases.md` for full detail.

**Decided and built, 2026-09-06: promoted Gemini 3.5 Flash-Lite from
shadow test to primary model.** Tests #80-83 (`docs/test-cases.md`)
built up the evidence: #80/#81 found a dramatically better completion
rate for Flash-Lite (88-90% vs. 35-58% for `gemini-3.6-flash` across two
same-window pulls) but flagged a real confound — all of that data came
from a period where the old primary was in an elevated-failure state
(tests #77-79), so it was unclear whether Flash-Lite was genuinely
better or just "any model that isn't currently degraded looks good by
comparison." Test #81 explicitly set a precondition before promotion: a
comparison from a *healthy*-Gemini window, which the available 1h-
retention logs never produced. Test #83 then ran a true ground-truth
test (18 real cards with known answers, scored independently) and found
near-identical per-completed-call accuracy (93% vs. 94%) — the real gap
was entirely completion rate (4/18 outright failures for the old
primary vs. 0/18 for Flash-Lite), not accuracy.

**The user explicitly waived the unmet healthy-window precondition**
rather than waiting further, with this reasoning for the record: test
#83's batch had the old primary's failure rate (22%) close to its
documented healthy baseline (14-17%), not the degraded 35-74% range
from tests #80-82, and Flash-Lite still won cleanly on completion (0/18
vs. 4/18) with matched accuracy even there — not the exact live-stream
healthy-window experiment originally specified, but real evidence
against the specific worry (that Flash-Lite only looks good during a
bad Gemini stretch). Given the priority on scan speed for sudden-death
auctions, the user chose to proceed on completion-rate + ground-truth-
accuracy evidence as sufficient, explicitly accepting the residual
uncertainty rather than waiting for a live-stream healthy-window test.

**Built, DEPLOYED, AND LIVE-CONFIRMED 2026-09-06**
(`dpl_85riwwo36JvLUuBkTcHKfeiAv25T`, aliased to
`whatnot-pokemon-identify.vercel.app`): `GEMINI_MODEL` now defaults to
`gemini-3.5-flash-lite`; the Haiku active-fallback logic is untouched;
the Flash-Lite shadow-test harness is reversed in place into a
regression watch on the old primary (`LEGACY_GEMINI_SHADOW_MODEL` env
var, `[legacy-model-shadow-test]` log prefix) — same `timePromise`/
field-agreement/cost-logging scaffolding, just pointed at
`gemini-3.6-flash` now instead of Flash-Lite. The `GEMINI_INPUT/
OUTPUT_USD_PER_1M` cost-display constants were swapped to Flash-Lite's
real pricing (was $0.75/$3.75, now $0.30/$2.50) so the extension's "This
scan: $X" display doesn't repeat the exact stale-pricing-constant bug
this project already found and fixed once (2026-09-03) — the old
pricing is preserved under `LEGACY_GEMINI_INPUT/OUTPUT_USD_PER_1M` for
the shadow test's own cost logging and as the rollback values. Verified
locally: `node --check` passes, the module loads without reference
errors, and a mocked-fetch smoke test confirms the reversed shadow test
fires correctly (`currentModel=gemini-3.5-flash-lite`,
`legacyModel=gemini-3.6-flash`) with correct cost math on both sides and
no exceptions. **Rollback is a one-line change** of `GEMINI_MODEL`'s
default back to `"gemini-3.6-flash"` (plus un-flipping the shadow-test
env var and swapping the two pricing-constant pairs back — both spelled
out in code comments at each definition) if the legacy-model shadow
test surfaces a real problem with Flash-Lite at volume or under real
stream conditions. See test #84 in `docs/test-cases.md` for the full
promotion write-up.

**Deploy checklist followed in full, given this file's documented
history of transcription corruption on exactly this file**: the 2428-
line source was read in 3 chunks (over the Read tool's single-call
token cap), reassembled in a scratch file, and diff-verified byte-for-
byte against the real source before deploying. This caught the SAME
recurring diacritic-regex transcription corruption documented
repeatedly elsewhere in this file on the very first attempt (literal
Unicode combining characters instead of the source's escaped
`̀-ͯ` form, in the `normalizeNameForMatch` line) plus two
smaller indentation/truncation slips in an unrelated comment block —
all fixed non-generatively by splicing the exact correct lines from
source via a Python script (never by retyping), then re-verified a
clean 0-diff and matching sha1 (`f644ab63b64f94955d9b23bdabd881bb6b5066f8`)
before deploying. **First deploy attempt omitted `api/identify.js`
from the files array** (the same copy-paste mistake documented
elsewhere in this file's history) — caught immediately, state went
straight to `ERROR` (`unused_function`), never reached `READY`, never
touched the production alias (confirmed via a live curl immediately
after). Second attempt included all 4 files (`api/identify.js`,
`api/flag.js`, `vercel.json`, `package.json`) and deployed clean.
**Confirmed live, not just happy-path**: build log shows "Downloading
4 deployment files"; `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (diacritic regex deployed
intact) and a fresh `sourceHash`; `POST {}` returns the real `400
{"error":"Missing imageBase64","requestId":"..."}`; a real end-to-end
scan (one of the 18 ground-truth photos from test #83, POSTed the same
way) returned a correct, High-confidence match
(`cardName: "Iono's Wattrel - 231/217"`, matching ground truth) with
`visionProvider: "gemini"`, `timingMs.gemini: 1929`ms (inside the 1-3s
target) and `usage.estCostUsd: 0.000787` — hand-verified against the
new Flash-Lite pricing constants
((1515/1e6)×0.3 + (133/1e6)×2.5 = 0.000787, confirming the pricing
swap is live and correct); `get_runtime_logs` confirms that exact
`requestId` was served by `dep=dpl_85riwwo36JvLUuBkTcHKfeiAv25T`; and
`get_runtime_errors` over the surrounding 10-minute window shows zero
errors.

**Flagged, not yet resolved**: the real-scan logs show a
`[haiku-shadow-test]` line fired normally (untouched, as intended) but
**no `[legacy-model-shadow-test]` line** — confirming
`LEGACY_GEMINI_SHADOW_MODEL` is not yet set in Vercel's Production
environment (it's a brand-new variable name; only the now-dead
`FLASH_LITE_SHADOW_MODEL` was ever added there). Per this project's own
established precedent (the Haiku shadow test and the original
Flash-Lite shadow test both needed a **redeploy**, not just adding the
env var via the dashboard, since Vercel snapshots env vars at build
time), the regression-watch shadow test will silently collect zero
data until (1) the user adds `LEGACY_GEMINI_SHADOW_MODEL=gemini-3.6-flash`
to Vercel's Production environment via the dashboard, AND (2) this
deployment is redeployed (even with no code change) to pick it up —
explicitly not done automatically here, matching the "ask before
deploying" convention. **Until that redeploy happens, there is no
regression-watch safety net on the new primary model** — worth
prioritizing soon given the whole point of this rollback plan depends
on it.

**Update, 2026-09-09 (from a Claude chat session, not Claude Code)**: two
new items surfaced, neither acted on yet — flagging per standing
convention rather than building speculatively.

1. **Real Gemini timeout / dual-failure cluster found via
   `get_runtime_errors`** (not a `[timing]`-filtered pull — the standing
   rule at the top of this section doesn't apply to this method, since
   Vercel's own error-cluster aggregation isn't gated on a successful
   `[timing]` log line). Over the last 7 days: 210 occurrences of
   `[identify] Gemini call failed: ... aborted after ms=5002` (the
   `GEMINI_TIMEOUT_MS` wall) and 57 occurrences of the worse case,
   `Gemini failed and Haiku fallback unavailable too` (both providers
   dead on the same request — the user sees a bare "couldn't identify").
   Not just historical — both error types recurred on the *current*
   production deployment (`dpl_22F3PPBwEjkB5UPAPt9oo23m1QXD`) as recently
   as **2026-09-07T21:39:16-17Z** (`requestId=1e2cff83...` and
   `8e44729e...`, same scan, back to back). This is the same known
   failure signature documented extensively above (tests #77-79 etc.),
   not a new error shape — but worth a fresh dedicated stats pull
   (following the `[legacy-model-shadow-test]`-or-unfiltered convention,
   never `[timing]` alone) next time Claude Code or this chat is back in
   this project, to see whether the elevated-rate pattern from tests
   #77-79 is still ongoing post-promotion or was specific to the old
   primary. No code changed.
2. **User received a real Google AI Studio email** ("Your Gemini API
   billing account has been moved to a lower tier" / "Suspended Service
   Tier"). Verified via web research (not assumed) that this is a
   currently-widespread, real Google AI Studio behavior — multiple
   concurrent Google AI Developer Forum threads report the same
   automated tier-downgrade, not a phishing pattern. **Not yet
   cross-checked against this project's own billing account** — the
   user was advised to check aistudio.google.com directly (typed
   manually, not via the email's own link/button) rather than trust the
   email alone, and to submit any appeal from the console itself.
   Notably, the error cluster in item 1 above shows zero 429/quota-
   exceeded errors in the last 7 days — only timeouts and 503s — which
   doesn't obviously match an already-throttled billing tier, so treat
   these as two separate open items, not one, until the console
   actually confirms a tier change and its effective date.

   **Resolved, same day**: user fixed the payment issue (no appeal
   needed) and confirmed directly on aistudio.google.com — the account
   is back to a normal **Tier 1** badge, usage nowhere near any cap
   (13/4K RPM, 29.65K/4M TPM, 515/150K RPD on Flash-Lite). **Real
   cross-check, not assumed**: Google's own 28-day error breakdown on
   that same console page shows only `404 NotFound` and
   `503 ServiceUnavailable` — never a `429`/quota-exceeded error, at any
   point — matching Vercel's own error logs (also zero 429s across the
   whole timeout cluster). Two independent sources agreeing on "never a
   429" is real evidence the billing/tier issue was **not** the
   mechanism behind the timeout cluster in item 1 above, even though
   fixing it was still worth doing. Vercel `get_runtime_errors` for the
   last 24h came back clean (zero errors) — a good sign, but one quiet
   day isn't confirmation; the real test is whether the
   `aborted after ms=5002` pattern stays away over several more days of
   real stream use. **Investigated, 2026-09-09 (Claude Code)**: the
   404s in Google's console are almost certainly not this app's own
   traffic — real evidence, not a guess:
   - This repo has **exactly one** Gemini API call site in the entire
     codebase (`api/identify.js:308`,
     `` `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}` ``,
     confirmed via a repo-wide grep for the endpoint string), using
     exactly one env var (`process.env.GEMINI_API_KEY`) for both the
     real primary-model calls and the `LEGACY_GEMINI_SHADOW_MODEL`
     shadow calls.
   - That call site's own error handling (`api/identify.js:373-375`:
     `if (!resp.ok) { ... throw new Error('Gemini error ${resp.status}:
     ${errBody}') }`) logs any non-2xx Gemini response the same way,
     status code and all — this is the exact mechanism that already
     surfaced the 3 real `Gemini error 503: {...}` entries in
     `get_runtime_errors`. A 404 from this app's own calls would show up
     identically, as `Gemini error 404: ...`.
   - Pulled the **full** 7-day `get_runtime_errors` breakdown (all 50
     error groups, not a sample) — **zero** occurrences of any 4xx
     status anywhere in it. Every single Gemini-related failure across
     all 7 days is either the client-side `GEMINI_TIMEOUT_MS` abort or a
     `Gemini error 503`. Direct, real evidence this app's own production
     traffic has not produced one 404 in the entire window.
   - `list_deployments` shows all 20 recent deployments as
     `target: "production"` — no preview/staging deployments exist that
     could be running with a different or misconfigured
     `GEMINI_API_KEY`.
   - Locally, `.env.local` has no `GEMINI_API_KEY` entry at all (only
     `POKEMONPRICETRACKER_API_KEY` and `ANTHROPIC_API_KEY`), and
     `~/Documents` on this Mac contains no other project directory — so
     no local script or other project on this machine can be generating
     stray Gemini traffic under this key either.

   **Working conclusion, not fully closed**: given this app's own real
   traffic demonstrably produces zero 404s (and would surface them
   identically to the 503s if it ever did), the console's 404s most
   likely come from something outside this app entirely — manual
   experimentation directly in the AI Studio playground/console itself
   (e.g. trying an invalid or deprecated model name, an easy way to get
   a `404 NotFound` while poking around a generically-named "My First
   Project") is the leading explanation, not a hidden second production
   consumer of this key. **Not fully confirmed**: no tool available here
   can read the live `GEMINI_API_KEY` value from Vercel's Production
   environment or browse the user's Google account, so a literal
   key/project match against "My First Project" couldn't be verified
   directly. **Concrete next step, for the user**: in Vercel's dashboard,
   reveal the `GEMINI_API_KEY` value configured for Production, and
   compare its prefix against the key(s) listed on
   aistudio.google.com's "API keys" page (each key there is tagged with
   its owning project) to confirm they're literally the same key/project
   as "My First Project." Low priority — this doesn't affect app
   behavior either way (see "Standing rule" evidence above), it's just
   an open curiosity about the console's own numbers.

   **Nothing else changed as a result of today's findings.** Per
   explicit instruction: no retuning of `thinkingLevel`, timeouts, or
   the Flash-Lite promotion based on today's cluster or billing-fix
   alone — the billing fix is confirmed unrelated to the timeout cluster
   (see above), and the real test for whether anything has measurably
   improved is watching `get_runtime_errors`/`[legacy-model-shadow-test]`
   over the next several days of real stream use, always via a query
   that can't structurally exclude current-model failures (never
   `[timing]` alone — see the standing rule at the top of this section).
   Any future stats pull on this gets logged as its own new dated
   `docs/test-cases.md` entry, not folded into today's.

**Update, 2026-09-09, same day, later (from Claude Code, live-log
investigation prompted by the user reporting scans were broken)**: a
NEW, distinct Gemini failure mode found via real runtime logs — this is
NOT the tier-downgrade issue closed out earlier today, and it is
currently ongoing. Every single `/api/identify` request in the full
available 1-hour log retention window (roughly 22:53-23:53 UTC) that
called Gemini got back a fast (~170-290ms) `429 RESOURCE_EXHAUSTED`:
`"Your prepayment credits are depleted. Please go to AI Studio at
https://ai.studio/projects to manage your project and billing."` This
hits both the real primary-model call AND the `[legacy-model-shadow-
test]` call identically (same `GEMINI_API_KEY`, confirmed in the log
lines — `currentModel=gemini-3.5-flash-lite` and
`legacyModel=gemini-3.6-flash` both return the identical 429 body every
time). **100% Gemini failure rate for the entire available window** —
a new, different failure signature from the `aborted after ms=5002`
timeout cluster documented throughout this file (tests #77-79, #85,
#86, item 1 above) — this one fails fast and is a hard billing stop,
not a timeout/overload.

**Effect on what the user sees**: the Haiku active fallback (see
"Recent / in-flight work") is still doing its job where it can — of
roughly 20 requests in the window, a handful got a real Haiku fallback
read through (e.g. `cardName: "Raichu"`, `"Reshiram"`, `"Raidou"`,
each correctly labeled `visionProvider: "haiku-fallback"`) — but
whenever Haiku's own `HAIKU_TIMEOUT_MS=5000` also gets hit (the
already-known, decided-to-keep-as-is Haiku completion-rate issue, see
the "Haiku active fallback" entry and its 2026-09-04 decision), the
user gets the honest "both primary and fallback AI failed" message
instead. This is exactly what "something is broken" looked like from
the user's side.

**No code changed — this is not a code bug.** The single Gemini call
site (`api/identify.js:308`) and error handling are both working
exactly as designed: a non-2xx Gemini response is caught and logged
faithfully (`Gemini error 429: ...`), same mechanism that already
surfaced the real `503`s documented elsewhere in this file. **Action
needed is on Google AI Studio billing, not in this repo**: add
prepayment credit at https://ai.studio/projects (the exact URL the
error itself names) — per this project's own "ask before spending
money" rule, this is the user's call, not something to act on
autonomously. Once credits are added, no redeploy should be needed
(this isn't an env-var change, just the same `GEMINI_API_KEY` starting
to succeed again) — worth a live rescan afterward to confirm normal
service resumes, and worth a fresh log check to see whether the
existing `aborted after ms=5002` timeout cluster (item 1 above) is
still separately present once the 429s clear, since the two are
distinct problems that happened to be visible in the same window.

**Resolved, 2026-09-09, same day, minutes later**: user added prepayment
credit at AI Studio; confirmed via real logs, not just the user's own
sense that it worked. Last 429 was at 23:53:08 UTC
(`requestId=ea49daa1-...`). Two real scans since then, both clean:
23:54:53 UTC (`requestId=5e475698-...`, Necrozma GX, High confidence,
matched correctly against PPT, `gemini ms=1477`, `total ms=1600`) and
23:55:38 UTC (`requestId=48e9fff5-...`, Hitmonchan, High confidence,
matched correctly, `gemini ms=1992`, `total ms=2126`) — both inside the
1-3s latency target. The `[legacy-model-shadow-test]` call
(`gemini-3.6-flash`) also succeeded on both, confirming the whole
`GEMINI_API_KEY` is healthy again, not just the primary model. No
redeploy was needed (as expected — this was never an env-var issue).
Only 2 data points so far; worth a normal amount of continued watching
via `get_runtime_errors` (not a special new watch) to make sure the
429s don't recur, same as any other billing account.

**Update, 2026-09-10: TCGplayer price-history blocking the response is
now a real, actionable open item — status changed from "just
watching" (test #87) to "worth a fix."** Follow-up investigation (test
#88, `docs/test-cases.md`) answered the open question from test #87
("is this happening" → "why, and does it change what we should do").
Four findings: (1) ruled out self-inflicted rate-limiting — the
window's single densest, most rapid scanning burst (~14 requests as
close as 3-4s apart) had zero pricing failures, while the actual
failures cluster during sparser periods; (2) direct curls of the exact
failed `productId`s (real endpoint, no key needed) all returned real
HTTP 200 data — TCGplayer is not down and not blocking us, it's
occasionally just slower than our 2500ms-per-attempt budget (≈3%
observed locally vs. the app's own 21% — an unresolved, not-yet-
actionable gap, possibly something about the Vercel egress path); (3)
**the real finding**: `fetchTCGPlayerPriceHistory` is fully `await`ed
inside `lookupCardPPT`, which is `await`ed before the response is
sent — so a failing price fetch doesn't just show "no price," it holds
the ENTIRE response (including an already-correct identification)
hostage for the full ~5.3s of both timeout attempts. Real example: the
test #87 Irida scan had the identification ready in `gemini ms=1533`
(inside the 1-3s target) but the user didn't see anything until `total
ms=6816` — a 6.8-second wait for a result that was substantively done
in 1.5s. Against this project's own 1-3s target and the 10-second
sudden-death-auction framing that target exists for, this blocking
behavior is arguably worse than the missing price itself.

**Not yet fixed — this is a status change, not a completed fix.** Per
explicit instruction, test #88 was investigation-only, no code changed.
The indicated direction (not yet built, not yet decided) is
architectural — decouple the identification response from the pricing
fetch (e.g. return the ID immediately, resolve pricing separately) —
rather than tuning `TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS` or the retry
count, since TCGplayer itself was shown to be fundamentally healthy.
Worth prioritizing given the direct 1-3s-target/user-experience impact,
but needs an explicit go-ahead before building per this project's
normal conventions — flagging here so it doesn't get lost, not
proposing a specific implementation yet.

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
   **For stats/completion-rate/regression-watch pulls specifically, see
   the standing rule at the top of "Current priority" above** — filtering
   on `[timing]` alone has already silently undercounted failures twice
   (tests #85 and #86).
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

- **Vercel runtime logs are only retained for 1 hour on this project's
  plan (Hobby)** — confirmed live 2026-09-04 (test #74) via Vercel's own
  explicit error message when querying past that window: "No logs
  found. The requested window likely exceeds your plan's runtime-log
  retention (Hobby 1h, Pro 1 day, Enterprise 3 days)." This means any
  "check the logs" investigation — including this project's own
  standing "verify via real logs" convention above — can only ever see
  roughly the last hour of activity. A real, decisive consequence: a
  question like "has X been happening consistently since deploy Y
  (hours/days ago)?" is not just hard to answer, it's structurally
  impossible via Vercel logs once more than ~1 hour has passed — this
  bit a real attempt to answer exactly that question for the Haiku-
  fallback timeout rate (tests #70/#71/#74). Every past test-cases.md
  entry that quotes raw log lines remains valid (the quote itself is the
  durable record), but none of those windows can be re-queried later.
  If longer-horizon trend-watching ever matters enough to need this,
  the real options are upgrading to Vercel Pro (1-day retention) or
  persisting a lightweight log/summary outside Vercel — neither decided
  or needed yet.
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

- **Extension toolbar-icon UX fix — BUILT, COMMITTED, AND CORE BEHAVIOR
  LIVE-CONFIRMED (2026-09-07)**, commits `ae98dfe`/`961eb0a`. Root
  cause investigation: clicking the toolbar icon always opened Settings
  (`popup.html`) and never toggled the on-page Card ID panel, because
  `manifest.json`'s old `action.default_popup` and a `chrome.action.
  onClicked` listener are mutually exclusive in Manifest V3 — there was
  no missing conditional to add, the manifest wiring itself made a
  toggle impossible. Separately confirmed `backendUrl` was NOT actually
  stale/cached anywhere (both `identifyDirect()` in `extension/
  content.js` and `getBackendUrl()` in `extension/background.js` read
  `chrome.storage.sync` fresh at click-time) — the real cause of the
  "need to refresh" friction was that Chrome only auto-injects
  `content_scripts` on *future* navigations, so a tab already open
  before an install/reload never gets `content.js` at all until
  reloaded.

  **Fix**: removed `action.default_popup` from `extension/
  manifest.json`; added a `chrome.action.onClicked` listener in
  `extension/background.js` that pings the active tab's content script
  first, and only falls back to on-demand `chrome.scripting.
  insertCSS`/`executeScript` injection when that ping fails (the
  stale-tab case) — either way followed by a `TOGGLE_PANEL` message.
  `extension/content.js` now has a `TOGGLE_PANEL` listener and a shared
  `setPanelVisible()` function that the existing "×" close button was
  refactored to use too — this incidentally fixes a real pre-existing
  bug where closing the panel via "×" left no way to reopen it short of
  a page reload. Settings moved off the primary click path into a gear
  icon inside the panel's title bar (`#wnpk-settings-btn`), opening an
  inline backend-URL field + Save button styled to match the rest of the
  panel (`extension/content.css`); `popup.html` is unchanged and now
  serves as the `options_ui` page (Chrome's right-click → "Options") as
  a backup entry point. Added the `"scripting"` permission
  (`manifest.json`) for the on-demand injection fallback; `activeTab`
  already covered host access. No first-run special-casing was needed —
  `DEFAULT_BACKEND_URL` in both `content.js` and `background.js` already
  points at the live Vercel deployment, so icon-click-toggles-panel is
  correct even on a fresh install.

  **Follow-up, same day, commit `961eb0a`**: before live-testing, a
  real double-injection risk was flagged in the on-demand fallback
  above — a failed `sendMessage` ping doesn't strictly prove the
  content script is missing (e.g. a timing race right after page load
  could produce the same error), so `chrome.scripting.executeScript`
  could in theory re-run `content.js` on top of an already-injected
  copy, doubling every event listener including the Identify Card
  click handler (→ two real, billed API calls per click). Fixed with a
  guard at the very top of `content.js`'s IIFE:
  `if (document.getElementById("wnpk-root")) return;` — each injection
  is a fresh script execution with its own closure, so a JS flag from a
  prior run wouldn't be visible, but the DOM persists across
  injections. Confirmed this does NOT block a genuine fresh page load:
  the check runs before `#wnpk-root` is created later in the same
  execution, so on a real first load it's always absent at check-time.
  `node --check` passes.

  **Verified pre-reload (doesn't touch the real browser)**: `node
  --check` passes on both `background.js` and `content.js`;
  `manifest.json` parses as valid JSON; full diff reviewed line-by-line
  against the plan.

  **Live-confirmed 2026-09-07**: user reloaded the real installed
  extension and confirmed the core fix — clicking the toolbar icon now
  opens the panel immediately ("it pops right up now"), no page refresh
  needed. **Not individually confirmed by name** (the user's test
  wasn't broken down sub-case by sub-case, so don't assume these are
  separately verified): the specific stale-tab `chrome.scripting`
  injection fallback path, the gear-icon inline settings save/load, and
  reopening the panel via the icon after closing it with "×". These are
  the same code path as the core fix and plausibly exercised, but per
  this project's own "verify, don't assume" convention, treat them as
  open until they're specifically seen working (or a live scan/click
  incidentally proves one of them, the way organic traffic has
  confirmed other fixes elsewhere in this file).

- **Test #79 — severe live Gemini failure cluster (2026-09-05)**: caught
  during a routine audit via real Vercel logs, not the user's own
  report — six sequential ~10-minute windows spanning
  2026-09-04T23:59Z-2026-09-05T01:01Z showed a **50-84% Gemini failure
  rate**, sustained roughly an hour, with the freshest slice checked
  (last ~5 minutes) at 83% — not tapering. Every failure was still the
  identical `"This operation was aborted"` timeout (plus 4 confirmed
  `503 "high demand"` errors), no new failure shape — worse than test
  #78's already-flagged 24% uptick but the same signature class as the
  severe 2026-09-03 cluster, which self-resolved with no code change.
  Ruled out as self-inflicted: spans two unrelated production
  deployments (differing only by the unrelated flag-endpoint addition),
  and traffic volume was lower than test #78's milder window.
  **Recommendation given and followed: do NOT revert `thinkingLevel` to
  `"low"`** — already at `"minimal"` (the fastest setting) and still
  failing this badly, so reverting would plausibly worsen it, not fix
  it; the 2026-09-01 evidence that `"low"` caused 31 timeouts in 25h
  with no confirmed accuracy benefit still stands. **No code changed** —
  the user chose to wait rather than act, consistent with the
  2026-09-03 cluster's own resolution. Full per-window breakdown in
  test #79, `docs/test-cases.md`.

- **Research: 1-3s latency target for sudden-death auctions
  (2026-09-05)** — a real, explicit product requirement change: scans
  are used in ~10s Whatnot sudden-death auctions, so the original 2-5s
  target isn't fast enough. Full research pass in `docs/test-cases.md`
  covered five angles the user asked for: (1) real comparative
  Gemini-vs-Haiku latency on successful calls only (Gemini true success
  median ~2489ms, Haiku ~3470ms — corrected from an earlier audit's
  inflated ~3953ms figure after finding the Haiku shadow test's own
  `geminiMs` field is mislabeled when Haiku is the slower promise); (2)
  racing Gemini/Haiku instead of sequential fallback — **rejected**:
  real same-frame data showed only 22% `cardNumber` agreement between
  providers, and 0 of 5 cases where both committed to a specific number
  actually agreed, so racing on raw speed would frequently substitute a
  less-reliable read; (3) continuous/background scanning — the one
  strategy that could plausibly meet the target (hides latency rather
  than reducing it), but collides with PPT's 60-calls/minute rate limit
  unless scoped to vision-only (defer PPT/pricing to the on-demand
  click) — not built, needs an explicit go-ahead and a $ budget
  decision; (4) a fresh vision-provider check (prior comparison was ~7
  months stale) — surfaced Gemini 3.5 Flash-Lite (cheaper, same-codebase
  env-var swap) and GPT-5.4/5.5 Mini (a newly-faster candidate per fresh
  web research, but a full new integration) as real, untested
  candidates; (5) honest ceiling — **1-3s reliably, on every fresh
  on-demand call, is not realistically achievable with any current
  hosted vision-LLM API** based on real measured data in this pipeline
  (~1.7s best-case, ~2.5s median even at the fastest shipped config).
  `docs/ROADMAP.md`'s Definition of Done latency target updated from
  2-5s to 1-3s to reflect the real requirement; which option (if any)
  to pursue further is still the user's call.

- **Gemini 3.5 Flash-Lite shadow test — DEPLOYED, REDEPLOYED, AND
  CONFIRMED COLLECTING REAL DATA 2026-09-05/06** (commit `d4285c7`;
  first deploy `dpl_3gWk2KV9dc9mn7n3vzrjJP4zjpVW`, redeploy after adding
  the env var `dpl_AdJmrGEjVW1MJtcw9hqmY4TNEjcL`, both aliased to
  `whatnot-pokemon-identify.vercel.app`; pushed to GitHub through
  `e8756e5`). Directly answers option 1 from the latency research
  above — does a lighter Gemini model meaningfully narrow the gap to
  1-3s, using real data instead of noisy public benchmarks. Same
  non-disruptive, read-only shadow-call pattern as the existing Haiku
  shadow test: entirely gated on a new `FLASH_LITE_SHADOW_MODEL` env
  var (unset = complete no-op), fired in parallel via `waitUntil`,
  never awaited before responding, never affects what the user sees or
  what matching/pricing runs on. `identifyWithGemini()` now takes an
  optional `model` param (defaults to `GEMINI_MODEL`, so every existing
  call site is unaffected) so the shadow call can reuse it directly
  with `"gemini-3.5-flash-lite"` instead of duplicating the function.
  Logs one `[flash-lite-shadow-test]` line per scan with both models'
  reads, per-field agreement, and independently-correct latency for
  each — a real bug in the existing Haiku shadow test's timing (its
  `geminiMs` field is mislabeled whenever Haiku is the slower promise,
  since it awaits sequentially and stamps elapsed time only after each
  wait completes) was found and avoided here via a `timePromise()`
  helper that subscribes to each promise independently at creation
  time; the Haiku shadow test itself was left untouched (out of scope).
  Verified locally via a mocked-fetch smoke test before deploying:
  response is byte-identical with the flag on vs. off (except the
  always-random `requestId`), and a simulated Flash-Lite failure never
  reaches the real response. Deploy checklist followed in full (4
  files — `api/identify.js`, `api/flag.js`, `vercel.json`,
  `package.json` — clean build, live `GET`/`POST` checks, runtime logs
  confirming both deployments served real requests).

  **Env var required a redeploy, confirmed rather than assumed**: after
  the user added `FLASH_LITE_SHADOW_MODEL=gemini-3.5-flash-lite` to
  Vercel's Production environment via the dashboard, confirmed a
  redeploy was actually necessary (Vercel env vars are snapshotted into
  a deployment at build time, not read live by an already-running
  Lambda — matching this project's own precedent: the Haiku shadow test
  was "originally deployed as `dpl_ERt8X...`" and only "confirmed
  collecting real data on `dpl_C8BLG...`", a different deployment, after
  `ANTHROPIC_API_KEY` was added). Redeployed identical code (hash-
  verified against the prior deploy, no changes) purely to pick up the
  env var. **Confirmed collecting real data via an actual test scan
  against the live endpoint, not assumed** — per explicit instruction
  not to repeat the exact gap that let `ANTHROPIC_API_KEY` silently
  collect zero data for a while before anyone checked. Real runtime log
  line for that scan: `flashLiteModel=gemini-3.5-flash-lite` resolved
  correctly, a genuine separate Flash-Lite API call fired with real
  token usage and cost, and — one data point only — Flash-Lite
  completed correctly in 1596ms on a frame where the current model
  timed out at 5005ms. Data collection is now genuinely live;
  recommended volume before drawing a real conclusion is 50-100 real
  scans with both models succeeding (roughly what it took the Haiku
  shadow test to reveal its own stark, decision-relevant pattern). Fully
  removable — see the "TEMPORARY SHADOW TEST — GEMINI 3.5 FLASH-LITE VS
  CURRENT MODEL" comment block in `api/identify.js` for the exact

  **Update, 2026-09-06 (test #80)**: a real ~1h scanning session (26
  scans, pulled via real Vercel logs after the user flagged 3
  no-result scans) added a strong batch of new same-window data.
  Current model timeout rate was 58% (15/26) this window — still the
  identical known failure, consistent with the ongoing tests #77-#79
  elevated-rate pattern, not a new problem. Of those 15 failures, 13
  also had the Haiku fallback time out simultaneously (0 rescues this
  window — a third data point in the same direction as test #71's 0/4,
  and exactly what the 3 user-flagged scans were). **Flash-Lite
  succeeded 23/26 (88%)**, with most successful reads landing
  **1.3s-2.7s** — inside the 1-3s latency target — vs. the current
  model's frequent 5s timeouts; on the 3 exact frames the user flagged
  (both primary and fallback dead), Flash-Lite alone returned a
  plausible High-confidence read. This is real, promising evidence on
  both completion-rate and latency, but still short of the
  recommended 50-100-scan volume and only one session's traffic — no
  action taken, nothing promoted. See test #80 in
  `docs/test-cases.md` for the full breakdown.
  removal list.

- **"Flag this scan" feature — DEPLOYED AND PUSHED 2026-09-04** (commits
  `264ac3c`/`2a928fa`, `dpl_AbrKkW5kAtzPpk3QRwMELtH2fCTq`, aliased to
  `whatnot-pokemon-identify.vercel.app`; pushed to GitHub `6dd9467..2a928fa`).
  Built per explicit user request to stop debugging bad scans from
  depending on screenshots and timestamp/card-name guessing (the exact
  friction that led to investigating the wrong scan in the Wailord/
  Dragalge mix-up, test #70). Every `/api/identify` request now gets a
  `crypto.randomUUID()` `requestId`, included in every JSON response —
  success and every error/`found:false` path (missing-imageBase64,
  no-API-key, gemini-failed with/without Haiku fallback, rate-limited,
  notFound, the final success result) — and threaded through every
  `[identify]`/`[timing]`/`[lookup]` log line for that request
  (`lookupCardPPT` in `api/identify.js` now takes `requestId` as a second
  parameter; its `pickBestCandidate` calls pass it via the existing
  `logPrefix` string). A specific scan can now be traced end-to-end in
  Vercel runtime logs by this one id alone — no matching timestamps or
  card names against a screenshot needed. New, tiny `api/flag.js`
  (`POST /api/flag`) accepts `{requestId, data}` and logs it verbatim as
  one greppable `[user-flagged] requestId=<id> data=<json>` line — no
  database, no persistent storage, per explicit scope; a flagged scan is
  found the same way every other investigation in this project already
  works, by grepping Vercel logs and joining on the shared requestId. The
  extension (`extension/content.js`) keeps the last `/api/identify`
  response in memory (already had to, to render the panel) and adds a
  small "🚩 Flag" button next to the cost display (`#wnpk-footer-row` in
  `extension/content.css`) — disabled until a scan has a `requestId`,
  fires the flag request fire-and-forget (never awaited, can't affect or
  delay a future identify call), and shows a brief "✓ Flagged"
  confirmation for 1.5s before re-enabling. Clicking it twice on the same
  result just logs twice — no crash, no dedup needed, per explicit scope.

  **Deploy incident, caught immediately, zero production impact**: the
  first `deploy_to_vercel` call omitted `api/identify.js` from the files
  array entirely (the exact same copy-paste mistake documented elsewhere
  in this file's history) — state went straight to `ERROR`
  (`unused_function`: "the pattern api/identify.js defined in functions
  doesn't match any Serverless Functions"), never reached `READY`, and
  its alias never touched the real `whatnot-pokemon-identify.vercel.app`
  domain (confirmed via a live curl against it immediately after, still
  served by the prior deployment). Second attempt included all 3 files
  and deployed clean.

  **Deploy checklist followed in full**, given this file's history of
  transcription corruption: read the real 2240-line source in 3 chunks,
  wrote each to a scratch file, and diff-verified byte-for-byte against
  the real source before deploying — this caught the SAME recurring
  diacritic-regex transcription corruption documented repeatedly
  elsewhere in this file on the very first attempt (literal Unicode
  combining characters instead of the source's escaped
  backslash-u-0300-to-backslash-u-036f form), fixed non-generatively via a small Python script splicing
  the exact correct line from source (not retyping), then re-diffed
  clean — final assembled file matched local source byte-for-byte
  (`sha1 d2a35ffc89a93bd1dc3f535da78d84c461dc3b4b`).

  **Confirmed live**: build log shows "Downloading 3 deployment files";
  `GET /api/identify` returns `normalizeDiacriticTest: "pokemon
  collector"` (diacritic regex deployed intact); `POST /api/identify {}`
  returns the real `400 {"error":"Missing imageBase64","requestId":"..."}`
  (confirms the new `requestId` field is live); `POST /api/flag` with a
  synthetic test payload returned `{"ok":true}`, and the runtime logs
  confirm the exact expected line —
  `[user-flagged] requestId=deploy-verify-test-001
  data={"found":true,"cardName":"Test Card"}` — served by
  `dpl_AbrKkW5kAtzPpk3QRwMELtH2fCTq`. **Not yet confirmed**: the
  requestId→`[identify]`/`[lookup]` end-to-end trace was verified against
  the real handler code via a local mocked-fetch run (not a
  reimplementation) before deploying, and the flag endpoint itself is
  now live-confirmed, but no real Gemini-backed scan has been flagged on
  this deployment yet — that needs an actual bad result on a live
  Whatnot stream, per this project's own "confirm via rescan" convention
  (see "Standing working conventions" above).
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

  **Fallback path OBSERVED firing in production, 2026-09-03T21:14:15
  UTC — and it was wrong.** A real Gemini timeout triggered the Haiku
  fallback (the first confirmed live firing of `visionProvider:
  "haiku-fallback"` since deploy). Haiku returned High-confidence
  `cardName="Wailord"` for a card the user confirms was not a Wailord;
  Haiku's own logged reasoning noticed the actual Japanese species text
  (カビゴン/Snorlax) and committed to "Wailord" anyway — a real internal
  contradiction, not just a plausible misread. Traced the full path
  (not just the top-level log line): the wrong read's PPT lookup scored
  below `MATCH_FLOOR` (`api/identify.js:930`), so `best` was discarded
  and the response degraded to the existing honest `{found:false,
  reason:'Read the name "Wailord" but couldn't confidently match it to
  a specific printing.'}` message (`api/identify.js:2177-2182`) — the
  miss was contained, not shown to the user as a confident wrong price.
  Full trace in test #70, `docs/test-cases.md`. **Status: 1 real data
  point, and it's a miss, not a clean confirmation** — "not yet
  observed" is no longer accurate, but neither is "confirmed working."
  No revert decided; watching for more real firings before drawing a
  trend conclusion. **Flagged, not built**: `identifyWithHaiku` reuses
  `GEMINI_PROMPT` verbatim, whose multi-card-in-frame instruction talks
  about identifying "the SAME single card being held up or highlighted"
  — Haiku's own wording ("the main card being highlighted is Wailord")
  echoes this closely, a plausible (not confirmed) hypothesis that this
  phrasing pushes the model toward picking a card by visual prominence
  over trusting its own OCR'd name text. One data point only; no prompt
  change made or proposed without further evidence.

  **Second data point, 2026-09-04 (test #71)**: a 10-minute production
  window (23 scans) found Haiku's own completion rate was 52% (12/23
  timed out) vs. Gemini's 17% in the same window — checked across ALL
  scans, not just ones where Gemini failed. Of 4 real Gemini failures in
  that window, 3 also had Haiku time out at the same moment (both dead
  together → generic failure message), and the 4th's Haiku response
  still didn't produce a PPT match. **0 of 4 real Gemini failures were
  rescued this window.** Combined with the Wailord miss above, this is
  two real data points suggesting the fallback's practical value right
  now may be lower than the design assumed — not confirmed as a lasting
  trend (one window, could be transient), and no revert decided. See
  `docs/ROADMAP.md`'s Phase 1 checklist for the matching entry.

  **Third data point (test #75) and DECISION, 2026-09-04: keep the
  fallback as-is.** Broke down every failed `[haiku-shadow-test]` line
  from the same 129-sample dataset: all 69 failures are the identical
  genuine `HAIKU_TIMEOUT_MS=5000` timeout (never a rate limit or API
  error), but with a hard bimodal gap against the 60 successes
  (2024-4988ms) — nothing observed near the 5s line from below. User
  decided: don't tune the timeout (a blind bump could easily rescue
  nothing, if real latency on failing calls is far past any reasonable
  bump, while directly working against this tool's core "fast answer
  for a live buy/bid decision" purpose) and don't revert (the fallback
  is strictly additive/safe — every failure degrades to exactly the
  pre-fallback honest message, never worse — so there's no forcing
  function to remove something that's merely underperforming its
  original hope, not broken). **This is a closed decision, not an
  open "still watching" item** — only two things would reopen it: a
  live out-of-band no-timeout test against Anthropic to measure
  Haiku's true latency tail (real API cost, user's call whether it's
  worth it), or a sustained worsening over a longer window (failure
  rate climbing well past ~50%, or the fallback rescuing 0 of many
  real Gemini failures over an extended period). See test #75 in
  `docs/test-cases.md` for the full analysis.
- **TCGplayer price-history single retry-on-abort (test #72) — DEPLOYED
  AND PUSHED 2026-09-04** (commit `d8fd732`,
  `dpl_9HeecDEMGF4uHcW7wxsPh7ffZ1x7`, aliased to
  `whatnot-pokemon-identify.vercel.app`, pushed to GitHub
  `df0b2af..d8fd732`), per explicit user go-ahead. A Ferrothorn scan
  showed "NO LIVE PRICE" for a card whose TCGplayer product page clearly
  had real listings — logs confirmed the card match was correct and
  clean, and the failure was a 2500ms `AbortController` timeout on our
  own `fetchTCGPlayerPriceHistory` fetch with no retry; a live curl of
  the exact same endpoint immediately after returned real data in
  173ms. Fix: exactly one retry, scoped only to the abort/network-error
  branch of that fetch (`api/identify.js` ~line 1234) — an HTTP error
  status, invalid JSON, or a genuine zero-SKU response are real
  TCGplayer answers a retry can't fix, and are untouched. **Deploy
  checklist followed in full given this file's size** (2220 lines,
  over the Read tool's 25000-token single-call cap): read in 3 chunks,
  wrote each to a scratch file, diff-verified byte-for-byte against the
  real source before deploying — caught the SAME recurring diacritic-
  regex transcription corruption documented repeatedly elsewhere in
  this file on the very first attempt (literal Unicode combining
  characters instead of the source's `̀-ͯ` escape sequence),
  fixed non-generatively via a small Python script splicing the exact
  correct line from source (not retyping), then re-diffed clean. Final
  assembled file matched local source byte-for-byte (`sha1
  8a0707337dda0f53cd63055b06a809a42be7f936`). Confirmed live: build log
  shows 3 files downloaded; `GET` returns
  `normalizeDiacriticTest: "pokemon collector"`; `POST {}` returns the
  real `400 {"error":"Missing imageBase64"}`; runtime logs confirm both
  checks plus real organic traffic (a clean Mimikyu V match) were
  served by the new deployment within a minute of going live. **Not yet
  confirmed via a live rescan that hits this exact abort path** — watch
  for a future `[tcgplayer-price]` success line immediately following a
  `This operation was aborted` line for the same productId.
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

  **Update, 2026-09-04 (tests #77/#78)**: two consecutive ~10-minute
  windows during a heavy same-session scanning burst both showed a
  Gemini timeout rate around **24%** (12/50, then 24/100 — ~150 scans
  over ~19 minutes), above the ~14-17% baseline seen in tests #70/#71/
  #76. Confirmed it's still the identical known failure (`"This
  operation was aborted"` at the `GEMINI_TIMEOUT_MS=5000` wall, no
  `503`/other new error type) — not a new failure class, just a rate
  that ran hotter. Two independent windows at the same figure is enough
  to stop calling it noise, but it's still only one session's worth of
  data, not a confirmed lasting trend, and no cause has been
  identified (could be genuine Gemini-side load, could be something
  specific to that session). **Not actioned** — this is exactly the
  kind of recurrence the still-open item above is watching for; if a
  future session reproduces a ~24%+ rate (or worse), that's the trigger
  to revisit `thinkingLevel`/timeout tuning, not before. See tests
  #77/#78 in `docs/test-cases.md` for the full numbers.
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
