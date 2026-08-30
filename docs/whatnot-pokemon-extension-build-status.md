# Build Status — Whatnot Pokémon Card ID (Personal use)

*Last updated 2026-08-28*

## 2026-08-28 (part 10, CURRENT): part 9's `offset` fix was real but too narrow — it only fired when NOTHING cleared the match floor; widened to also cover "a wrong candidate cleared the floor on secondary signals while the real numbered card was never on page 1"

User reported a Charizard V (Brilliant Stars, 017/172) scanned wrong,
verbatim: "Got this one wrong." The panel showed "Charizard V - SWSH260"
(a different, promo printing) at Holofoil $51.13, Read: High / Match: Low,
with the honest "no exact card number match" warning already visible —
so the safety net correctly flagged the uncertainty, but the underlying
lookup still settled for the wrong card instead of finding the right one.

**Root cause, confirmed via `mcp__Vercel__get_runtime_logs`** (3 repeat
scans of the same card, all consistent): Gemini read cardNumber "017/172"
correctly every time — a real, legible Brilliant Stars printing.
`search=Charizard V` came back with `raw candidate count=30` (page 1
completely full), and the genuine 017/172 printing was never in that
page. This is the same crowding-out shape as part 9's Squirtle case — but
part 9's `offset`-based page-2 fallback only fires when `!best` (nothing
at all clears the match floor). Here, a WRONG candidate ("Charizard V -
SWSH260") still cleared the floor via secondary signals alone (hp 220 +
subtype V = 11 points, no number credit) — so `best` was truthy, and the
page-2 fallback never fired. The "NO NUMBER MATCH IN POOL" note (from an
earlier fix) correctly detected the mismatch and downgraded to Low match
confidence, but only after already settling for the wrong card/price
instead of trying page 2 first.

**Fix deployed** (`dpl_GHM6daBHFawRuRopgi2Rwe5PGCVy`, confirmed READY):
widened the page-2 trigger in `lookupCardPPT()` to also fire whenever
Gemini read a specific card number that matches NONE of the page-1
candidates — regardless of whether some other candidate cleared the match
floor via other signals — as long as page 1 came back completely full.
Still only spends the extra PPT call on lookups where the read number
doesn't match anything on page 1, so part 7's rate-limit-driven credit
savings hold for ordinary successful lookups where the number matches on
page 1.

**Process note this turn**: an initial deploy attempt
(`dpl_As1p8yi4y1PjWk1Pvqkn9F2Kv6sN`) trimmed the file's historical
FIX-comment headers to save space in the tool call. That would have left
the live deployment diverged from the documented/committed source — the
exact class of drift the md5-verification discipline exists to prevent.
Caught before syncing docs; redeployed (`dpl_GHM6daBHFawRuRopgi2Rwe5PGCVy`)
with the byte-identical file content, verified via a local diff against
the source file before redeploying.

Logged as test #33 in `test-cases.md`. **Status: code-correctness
confirmed (syntax-checked, diffed byte-identical against the source before
deploy); live-rescan outcome still open** — whether this surfaces the
real 017/172 printing depends on whether it's within the first 60 results
(2 pages × 30) PPT returns for a plain "Charizard V" search.

## 2026-08-27 (part 9): part 8's `cardNumber` fix was a complete no-op — real root cause found via a live 400 error, real fix is `offset`-based pagination

The user rescanned the exact same physical Squirtle card that failed in
part 8 (a rare live-testing opportunity — live-auction cards normally
can't be rescanned on demand) and it **still** failed to identify,
verbatim: "Funny enough the same Squirtle came back and I scanned it
again, but also couldn't identify that one." Per the standing
instruction, this required a full re-investigation via real Vercel logs
before assuming any new root cause — not just guessing again.

**Root cause, confirmed via `mcp__Vercel__get_runtime_logs`**: part 8's
`cardNumber` query parameter was fabricated. Every single request that
included it got back a real PPT 400 response: `"Unsupported query
parameter(s): cardNumber"`, with an authoritative `allowedParameters`
list straight from PPT's own validator: `tcgPlayerId, cardId, setId,
setName, set, search, rarity, cardType, artist, minPrice, maxPrice,
sortBy, sortOrder, limit, offset, includeHistory, includeEbay,
includeBoth`. `cardNumber` and `number` are not in that list and never
were. The existing fallback logic caught this gracefully on every
request (no crash, fell through to the old plain-name search), which is
exactly why it looked like nothing was wrong — but it also meant the
actual crowding-out bug from part 8's original report was **never
fixed**, on any request, all session. This is why the same card failed
again on rescan: the "fix" never ran.

**Lesson (now written into the code comments and `test-cases.md`)**:
part 8's `cardNumber` parameter was based on a WebFetch summary of PPT's
docs page claiming it existed as a real filter. That summary was simply
wrong. A docs summary is not sufficient verification of an API's actual
behavior — the API's own live error response (naming its real accepted
parameters) is a far stronger, more direct signal, and should be checked
before declaring a fix based on documentation complete.

**Real fix deployed** (`dpl_GWTHVnZt6w5ghxesFUAmEYy4Z63Y`, confirmed
READY): removed `cardNumber` entirely. Added a genuine `offset`-based
pagination fallback (confirmed as a real accepted param via the same 400
error's `allowedParameters` list) — `lookupCardPPT()` fetches page 2
(`offset=30`) only when page 1's best candidate doesn't clear the match
floor AND page 1 came back completely full (`rawList.length === 30`,
implying more results likely exist), merges it in, and re-scores once.
This bounds the extra PPT credit cost to only the pathological "total
miss" cases, preserving part 7's rate-limit-fix credit savings for
ordinary successful lookups.

Logged as test #32 in `test-cases.md` (test #31's row amended to note
the fix was a no-op). Verified via `node -c`, a full read of the file,
and — after an earlier file-transfer mistake this session where
hand-retyping the file into a shell heredoc silently trimmed comments —
confirmed byte-identical (md5 `617c1a3559e124bb4711120709269ff4`) across
the cloud workspace, this Claude Project's `identify.js` doc, and the
user's local Mac git clone.

**Superseded by part 10 above**: this fix's trigger (`!best` only) turned
out to be too narrow — see part 10 for the Charizard V case that exposed
the gap and the widened fix.

## 2026-08-27 (part 8): Squirtle (SV2a "151" Japanese AR) missed entirely — the exact `limit=30` regression risk flagged in part 7, "fixed" with a `cardNumber`-narrowed search instead of raising the limit back up — SUPERSEDED, this fix was a complete no-op (see part 9)

User scanned a real, well-known Japanese card (Squirtle 170/165 AR from
SV2a "151") and got "couldn't confidently match it to a specific
printing" instead of a wrong-but-plausible guess — i.e. the correct card
never even entered the candidate pool.

**Root cause, confirmed via logs + independent web search**: Gemini read
the card correctly and consistently across 4 repeat scans (170/165, HP
60, subtype AR, language Japanese) — confirmed via web search that this
is a genuine, well-known card, not a misread. But
`search=Squirtle language=Japanese` came back with `raw candidate
count=30` — exactly the `limit=30` set in part 7 — and the pool was
dominated by unrelated "Intro Pack (Squirtle)" filler cards (Poliwag,
basic energy, etc — PPT's own relevance ranking for the search term, not
ours). The real 170/165 AR card never made it into the returned pool at
all, so nothing in `pickBestCandidate` ever saw it. This is exactly the
regression flagged as an open risk at the end of part 7: lowering `limit`
from 100 to 30 to fix the rate-limit bug meant a popular/valuable card
sharing a species name with lots of bulk product can get crowded out
before it's ever returned — and that risk turned out to be real, on the
very next Japanese scan involving a valuable card.

**Fix "deployed"** (`dpl_H7mHneLhtx2V8LYn4w2wweNM8c9e`) — **turned out to
be a complete no-op, see part 9**. Was based on a WebFetch summary of
PPT's docs claiming a `cardNumber` filter parameter existed, which was
simply wrong — PPT's own live API rejects it with a 400 error.

Logged as test #31 in `test-cases.md` (amended after part 9's discovery).

## 2026-08-27 (part 7): "Couldn't reach our card database" — real cause was PPT's per-minute rate limit, not flakiness

User hit "Couldn't reach our card database right now (it's been
intermittently flaky) — try again in a moment" on a Japanese Palkia GX
scan during a live stream.

**Root cause, confirmed via logs**: a burst of 4 rapid rescans in ~30
seconds (the user testing/rescanning quickly during the live stream) hit
a real PokemonPriceTracker 429: `"Minute rate limit exceeded"`, with a
credit breakdown of `"required":10,"available":8` — not a timeout, not a
5xx, and not actually "flaky" at all. Checked PPT's own API docs
(`WebFetch`, `pokemonpricetracker.com/api-docs`): PPT bills credits
roughly 1-per-card-returned on top of a per-minute call cap, and
`fetchPokemonPriceTracker()` was requesting `limit=100` on every single
search — far more than any real match has ever needed (18 candidates was
the largest raw pool seen in any log this entire session). Ordinary rapid
rescanning during a live stream was burning through the per-minute credit
budget fast, purely because of an oversized request parameter on our end.

**Fix deployed** (`dpl_F9tH9WAWxGrdh8TevtBvM31hHGkF`, confirmed READY):
- Dropped the default PPT search `limit` from 100 to 30 — plenty of
  headroom over anything actually seen, cutting credit cost per call
  roughly 3x.
- Added explicit 429 detection in `fetchPokemonPriceTracker()`, threaded
  a `rate-limited` error type (with `retryAfter`) through
  `lookupCardPPT()` and `lookupGradedPrice()`.
- Replaced the generic "intermittently flaky" message with an honest one
  naming the real cause and an estimated wait time when this does still
  happen, instead of implying a mystery outage.

Logged as test #30 in `test-cases.md`. **CONFIRMED REGRESSION FOUND**: the
`limit=30` tradeoff flagged as an open risk here turned out to be real —
see part 8/9/10 above for the multi-attempt fix history.

## 2026-08-27 (part 6): Eevee "173" (Pokemon Center Exclusive) tie-break bug — Gemini's own stampType read was captured but never used in scoring

User reported an Eevee scan matched as "Eevee - 173 (Pokemon Center
Exclusive)" even though the physical card had no Pokemon Center stamp.

**Root cause, confirmed via logs**: Gemini read cardNumber "173", hp "50",
attackName "Reckless Charge", and stampType "none" (it looked at the card
and found no Pokemon Center stamp). PPT's data has two real, distinct rows
for this card — the plain promo and "Eevee - 173 (Pokemon Center
Exclusive)" — which tied at score 30 (number+hp+attackName all matched
identically on both, since they're the same base card with only the stamp
differing). The existing oddity tie-break (Jumbo/Prize Pack/etc, from part
4) didn't cover "Pokemon Center Exclusive" naming, so the tie was
arbitrary — and it landed on the wrong one, directly contradicted by
Gemini's own stampType read.

**Fix deployed** (`dpl_5T4hQMGiUXaLRGCu32w7nCgphzW5`, confirmed READY):
added a soft stamp-keyword scoring signal (`candidateStampType`,
`STAMP_KEYWORDS`) that checks a candidate's name/set against known stamp
markers (Pokemon Center, Staff, Prerelease, Winner, World Championship)
and cross-references Gemini's `stampType` read in `scoreCandidate()` — a
bonus when they match, a soft penalty (8 points, less than the number
signal) when Gemini explicitly read "none" and the candidate's name
implies a stamp isn't there. Deliberately soft rather than an outright
exclusion, consistent with the Koffing/1st-Edition lesson from part 1
(2026-08-24) that Gemini's stamp reads can false-negative on a real stamp
— this nudges ties toward the evidence without overriding a stronger
independent signal if one existed.

Logged as test #29 in `test-cases.md`. **Needs a rescan to confirm** — an
Eevee 173 without a visible Pokemon Center stamp should now match the
plain promo at High confidence with no ambiguous-match warning.

## 2026-08-27 (part 5): Japanese cards misdiagnosed as a data-source gap — real bug was a missing `language` API parameter, caught by the user — CONFIRMED FIXED

A batch of Japanese live-test scans (Baxcalibur, Raichu, Psyduck, Lapras —
tests #24-26 in `test-cases.md`) all matched wrong/English printings. I
root-caused this from Vercel logs and concluded PokemonPriceTracker (PPT)
simply had no genuinely Japanese-market data for these modern
special-art-rare/promo cards — a structural data-source gap — and shipped
a fix that just added an honest caveat + confidence downgrade on every
Japanese read, along with a note suggesting a future conversation about
switching data sources for Japanese cards specifically.

**The user correctly caught this as wrong**, verbatim: "We absolutely were
able to get Japanese readings- that's why I am paying for
pokemonpricetracker. I have the API key in my Vercel env variables." That
is a direct, specific rebuttal — not just "try again" — so instead of
re-asserting my prior conclusion, I went to PPT's own API documentation
(`pokemonpricetracker.com` docs, confirmed via `WebFetch`) rather than
Vercel logs alone this time.

**Real root cause, confirmed against PPT's docs**: PPT's `/api/v2/cards`
endpoint has a documented `language` query parameter (`language=japanese`
vs. the default `language=english`). `fetchPokemonPriceTracker()` had
**never set this parameter, ever** — every "Japanese" scan all session was
silently searching PPT's English-only card pool. That's the actual reason
zero genuinely-Japanese candidates ever came back — not a gap in PPT's
underlying data at all, just a missing query parameter on our end.

**Fix deployed** (`dpl_FyfkhuLWuLoFWgDKaUHDZno6k5CM`, confirmed READY):
- `fetchPokemonPriceTracker()` now accepts a `language` option and sets
  `language=japanese` on the PPT request whenever the Gemini read says the
  card is Japanese (defaults to English otherwise, matching PPT's own
  default).
- Threaded through every caller: `lookupCardPPT()` (both its main call and
  its subtype-suffix retry) and `lookupGradedPrice()`.
- Removed the blanket Japanese-caveat + confidence-cap block shipped for
  the wrong diagnosis — Japanese reads now go through identical
  scoring/confidence logic as English reads.
- Reverted the Japanese-specific wording in the "no number match in pool"
  note and the `notFound` handler back to generic, language-neutral
  messages.

**CONFIRMED FIXED via live rescan** (test #28, Dark Gengar, Japanese
promo in a TAG 9 graded slab): real Vercel logs show
`[lookup] search= Dark Gengar language= Japanese` — the parameter is
being sent — and the candidates PPT returned were genuinely Japanese-
market data (set "S10a: Dark Phantasma", condition strings like "Near
Mint Holofoil - Japanese"), correct card and price ($223 raw estimate).
Since live-auction cards can't be rescanned on demand, the exact original
failing cases (Baxcalibur, Raichu, Psyduck, Lapras) may never get a direct
retest, but #28 confirms the underlying mechanism works for Japanese
cards generally.

**Lesson for future sessions**: absence of evidence for a specific
mechanism (zero Japanese candidates returned) doesn't confirm the
mechanism doesn't exist upstream — it can just as easily mean the request
never asked for it correctly. Vercel logs alone answered "what did PPT
return," not "did we ask PPT correctly" — that required checking PPT's
own API documentation, which should have happened before concluding a
data-source limitation the first time, not after the user pushed back.

## 2026-08-27 (part 4): Cramorant V / Shaymin V shown as wrong product lines — number-weight tie + oddity tie-break bug, fixed with an eye toward pallet.trade's approach

User reported two normal cards (Cramorant V, Shaymin V) matching to
oddball product lines instead of the standard printing — Cramorant V
showed as a "Jumbo Cards" 5x-oversized promo ($2.62), Shaymin V showed
under "Prize Pack Series Cards" ($33.10), neither of which was visible on
the physical cards in the photos. The user explicitly asked to step back
and compare our matching strategy against pallet.trade's own approach
rather than keep patching in isolation, so this fix was grounded in
`pallet-trade-reverse-engineering.md` before touching code.

**Root cause, confirmed via logs (two distinct bugs)**:
1. Cramorant V's exact "SWSH086" number read tied at the same score with
   3 other candidates that only matched via hp+attackName coincidence —
   possible because `SCORE.number` (10 points) could be tied or beaten by
   the other four signals combined (hp 6 + subtype 5 + set 2 + attackName
   4 = 17). Modern V/VMAX/GX/ex reprints very often share identical HP
   and attack text across many print runs of the same Pokémon, so this
   isn't a rare coincidence — it's a structurally common false tie.
2. Shaymin V had two literal duplicate rows in PPT's raw data for the
   *same* printing ("Shaymin V - 013/172" and "Shaymin V", identical
   number), and the old candidate-identity key treated the name-suffix
   difference as two separate candidates — so a clean, unambiguous match
   was tied against itself, and the "Prize Pack Series" listing won the
   coin flip.

Neither bug is new — both are the same underlying gap: no tie-break logic
existed to prefer a normal, standard-printing candidate over an
oddity/promotional product line (Jumbo, Prize Pack, Code Card, Premium
Collection, Tin) when scores tie.

**Comparison to pallet.trade**: `pallet-trade-reverse-engineering.md`
documents that pallet's own API treats the card number as authoritative —
a mismatch returns a structured `number_mismatch` error and fails
identification outright, rather than letting weaker signals (HP, attack
text, set) outvote it. We don't do a full reject-on-mismatch model here
(soft scoring is still useful for tolerating one flaky OCR field), but
this fix moves materially closer to that principle: `SCORE.number` is now
20 — mathematically higher than every other signal combined (18) — so an
exact number match can no longer be out-voted by a coincidental pile of
weaker signals. This is a deliberate partial adoption of pallet's
strategy, not a full rewrite; see the "open question" below for whether
to go further.

**Fix deployed** (`dpl_BfKKeHVjshYeQ5K27G4p9sMuJn7K`, confirmed READY):
- `SCORE.number` bumped from 10 to 20 (also bumped `SCORE.set` 2→3, no
  functional effect on the tie itself, just kept proportional).
- New `candidateDedupKey()` strips the trailing "- number" name suffix
  before computing a candidate's dedup identity, so literal duplicate PPT
  rows for the same printing collapse into one.
- New `isOddityCandidate()` flags Jumbo/Prize Pack/Code Card/Premium
  Collection/Tin/Oversize product lines by regex against name/setName;
  `pickBestCandidate()` now prefers non-oddity candidates among tied top
  scorers.

**Confirmed since**: test #21/#22 (Galarian Moltres, Pikachu ex) matched
cleanly post-fix, though neither is a direct re-test of the exact
Cramorant V/Shaymin V scenario. The Eevee/Pokemon Center case in part 6
above is a related-but-distinct tie-break gap (a stamp-variant naming
pattern the oddity regex doesn't cover), now fixed separately.

**Open question for the user — the broader "audit the project" ask**: so
far every fix this project has shipped has been reactive — patch the
specific tie/bug a live test surfaced, cite pallet's approach where it's
directly relevant, and move on. That's kept things moving fast, but it
means the scoring model has been assembled incrementally rather than
designed against pallet's approach up front. Worth deciding explicitly:
keep going this way, or pause the live testing loop for a dedicated pass
that reads through pallet's full matching flow and decides once whether
to adopt something closer to their hard "reject on number mismatch" model
everywhere. No code changed on this question yet — it's a strategy call,
not a bug, and better made by the user than assumed. Still unresolved as
of this update. **Part 9's cardNumber-fabrication episode and part 10's
narrow-trigger episode are both further data points in favor of
eventually doing that dedicated pass.**

## 2026-08-27 (part 3): weak/asymmetric number-match bug (Mewtwo SVP 052) + Baxcalibur warning-ordering fix

**Mewtwo SVP 052** matched "Mewtwo EX" 52/108 (XY - Evolutions) at false
High confidence — the wrong printing entirely. Root cause: when Gemini
read the bare promo number "052" correctly, the number-matching gave it
FULL 20-point credit for matching an unrelated numbered-set card "52/108"
— a coincidental digit match between two different numbering schemes
(promo vs. numbered-set), not real evidence of the same printing. Fixed:
`numbersMatch()` now classifies match `strength` (`exact`/`totalMismatch`/
`weak`/`none`) — a symmetric match (both bare or both "/total") gets full
credit, an asymmetric ("weak") match gets only 0.35x credit plus an
explicit warning note. Separately, this same card exposed a Gemini
vision-reliability issue (three different reads across repeat scans of
the same physical card, once a full hallucination) — not something our
matching code can guard against, flagged as an open reliability concern
in `test-cases.md`.

**Baxcalibur** (Japanese SV2P) — misleading warning ordering: the generic
ambiguous-tie note was firing before the more accurate "number matches
nothing in pool" note, masking the real diagnosis. Fixed by reordering
the checks so the more specific diagnosis wins. This part of the fix
turned out to be independent of and unaffected by the Japanese-language
misdiagnosis in part 5 above.

Deployed `dpl_3deSySQdoeZpa5KkvQt9HaJ7Y6qV`, confirmed READY, committed
`f0a2c52`. Needs a rescan to confirm both fixes.

## 2026-08-27 (part 2): "Identifying card..." latency fix — Gemini was silently running at default thinking depth

User reported the identify step taking ~5 seconds and asked for it to be
faster before continuing testing. Per the standing "verify before
assuming" instruction, pulled real Vercel runtime logs before changing
anything rather than guessing at a fix.

**Root cause, confirmed via logs**: `identifyWithGemini`'s
`generationConfig` never set `thinkingConfig` at all. Gemini 3.x models
default to `thinkingLevel: "medium"` when this is omitted — real
`usageMetadata.thoughtsTokenCount` values in the logs were routinely
400-600+ tokens of internal reasoning burned *before* any output token,
on a task that's pure structured field-extraction from one image (not
something that benefits from deep reasoning). Also found, in the same
log pull, that 16 real requests in a 24h window were fully aborted by the
existing 5000ms Gemini timeout ("This operation was aborted") — meaning
a real fraction of scans were failing outright, not merely slow.

**Fix**: set `generationConfig.thinkingConfig.thinkingLevel` to
`"minimal"` — confirmed via Google's own docs as the lowest documented
latency setting ("matches the 'no thinking' setting for most queries").
Deployed (`dpl_93uCTCS8zVA7WidUhYEef2PQNG5s`, confirmed READY).

**Also added**: real wall-clock timing. The handler now stamps
`tStart`/`tGemini`/`tEnd` and logs `[timing] gemini ms=... lookup ms=...
total ms=...` server-side, and returns the same numbers in the response
as `timingMs: {gemini, lookup, total}`. This closes a long-standing open
item — actual end-to-end latency against the 2-5s target had never once
been measured; every prior "speed pass" only tuned timeout ceilings.

**Confirmed since**: see part 3 below — 4 real scans landed at 1.8-2.3s
total, comfortably inside the 2-5s target.

## 2026-08-27 (part 3, latency confirmation): latency fix CONFIRMED with real numbers + new alphanumeric card-number bug found (Silvally GX)

User tested an 8-scan batch right after the latency deploy. Per the
standing instruction, pulled real logs to verify rather than take the
"felt faster" report at face value.

**Latency fix confirmed working**: the first 4 requests on the new
deployment (a Silvally GX card, rescanned repeatedly) show real
`timingMs` of 1778, 1982, 2280, and 1994 ms total — comfortably inside
the 2-5s target, versus the prior behavior of frequently hitting or
exceeding the 5000ms timeout outright. First real measured numbers ever
captured for this tool.

**New bug found, unrelated to latency**: one of those Silvally GX scans
came back as the wrong printing (Hidden Fates: Shiny Vault, $13.24,
flagged Low confidence) even though a later rescan of the same physical
card correctly matched at High confidence ($4.32). Root-caused via logs:
Gemini's read fluctuated between "SM91" and "116/156" across repeat
scans of the same card (normal vision-model noise), but when it read
"SM91" — an exact match to a real candidate's number field in PPT's
data — the number-matching regex silently failed to credit it, because
`normalizeNumber` required the string to start with a digit. Any
alphanumeric-prefixed card number (promo formats like "SM91",
"SV79/SV94", common on secret rares and black-star promos) has been
unmatchable by number since this scoring system was built. When the
match reverted to HP/attack-only signals, it landed on a 7-way tie among
mechanically-identical Silvally GX printings and picked whichever was
first in the raw list.

**Fix**: `normalizeNumber` now captures an optional leading letter prefix
on both the number and its total, and requires prefixes to match too.
Deployed (`dpl_2rCqpUUcph64wkybbw8skYF5fH2C`, confirmed READY).

**Other results from the same batch**: 6 of 8 scans were correct
(Stonjourner VMAX, Gardevoir V, Steelix V, Zoroark GX, Slaking V,
Kommo-o GX — all on the OLD pre-latency-fix deployment, since they ran
before it went live). One scan (Zarude) failed to identify at all;
checked logs and found no code error or timeout on that request —
Gemini itself just returned "not found," most likely a genuinely hard
frame (glare on a card sleeve). Nothing actionable found.

## 2026-08-27 (part 1): root-cause of total failure found + four live-test bugs fixed via real Vercel-log investigation

Per the user's explicit standing instruction ("before you do further
deployments, make sure we look at everything we can before assuming we
know the root cause"), every fix below was root-caused against real
Vercel runtime logs from actual user-triggered scans, not guessed from
code review alone.

**Root cause of 100% scan failure, found and fixed**: `PPT_BASE_URL`
defaulted to a nonexistent `https://www.pokemonpricetracker.com/api/v2/prices`
endpoint. The real endpoint (confirmed via PPT's own live docs) is
`.../api/v2/cards`. This single wrong URL caused every scan, for any
card, to return zero candidates — confirmed across 6 different failed
scans (Toxtricity VMAX, Carbink, Timburr, Slurpuff, Beautifly, Scorbunny)
before the fix, and immediately resolved once corrected (see test #7
onward in `test-cases.md`).

**Incorrect fix shipped, then reverted (Koffing case)**: after the
endpoint fix, a Koffing scan defaulted to non-1st-Edition pricing even
though PPT's own `primaryPrinting` field said "1st Edition." Assumed
Gemini's `stampType: "none"` read was more trustworthy and shipped a fix
excluding "1st Edition" variants whenever the stamp wasn't detected. The
user then confirmed the card **was** physically 1st Edition (visible
stamp) — Gemini's stamp OCR had a false negative, `primaryPrinting` was
right all along. Reverted; `pickDefaultVariantKey` trusts
`primaryPrinting` first again. Lesson: Gemini's read is not automatically
more reliable than PPT's own data.

**Brock's Onix — wrong printing shown at false High confidence**: Gemini
read cardNumber "21/132" (matched a real but wrong candidate, HP 70)
while also reading hp "100 HP" (which only belongs to a different real
candidate, 069/132). The number match won outright with false High
confidence. Two real bugs found: (1) HP comparison used exact string
match, so "100 HP" never matched a candidate's bare "100" — HP was
silently scoring zero on every match, not just this one. (2) no
safeguard existed for "number matches, but a different candidate's HP
matches better." Fixed both: HP now compares digits-only, and a new
conflict check downgrades to Low confidence with an explicit warning
when this pattern occurs. Also nudged the Gemini prompt to not mix
fields between multiple cards visible in the same frame (there were
several in this scan).

**Gourgeist ex — reported as wrong, actually working as intended**: only
2 real candidates existed in the pool and neither matched the read card
number. The system correctly showed Low confidence + the ambiguous-match
warning rather than guessing. No code change; explained to the user as
the safety net doing its job.

**Hitmontop — weak match overstated as Medium confidence, plus a
separate dead scoring signal found**: read number/set ("067/066",
"Crimson Haze") matched none of 18 real candidates; the match rested
entirely on one HP coincidence, yet showed as Medium confidence. While
investigating, found that PPT's real data never exposes a scalar
`attackName` field — only an `attacks[]` array of full move-text
strings — meaning the codebase's attackName scoring signal (`SCORE.attackName
= 4`) has been completely dead (always null) on every single match since
the PPT-only architecture was adopted, entirely unrelated to what the
user actually reported. Fixed with `extractFirstAttackName()`. Also
added a new safeguard: if the read card number matches nothing at all in
the candidate pool, downgrade to Low confidence with a note that this
may be a set PPT doesn't track yet, instead of showing false Medium
confidence based on a single secondary signal.

**Status**: all four fixes are deployed to production
(`dpl_ARYCvvzWT6Pnpsebvp3SCEeByUyL`).

## New deployment workflow (2026-08-26) — replaces the manual GitHub web-upload flow

- **Backend code**: a real git clone lives at
  `~/Downloads/whatnot-pokemon-identify-repo` on the user's Mac (cloned
  from `https://github.com/emg31795/whatnot-pokemon-identify`) —
  **migrated 2026-08-30 to `~/Documents/whatnot-pokemon-extension`,
  extension files moved into an `extension/` subfolder within the same
  repo.** A session updates file(s) in that clone directly (device
  bridge) and commits locally, then the user runs `git push` themselves
  in their own Mac Terminal.app.
- **Extension code**: lives in `extension/` inside the same repo as of
  the 2026-08-30 migration. Chrome's "Load unpacked" needs to be
  re-pointed at the new `extension/` folder path (one-time manual step).

## Test case tracking

`test-cases.md` (now in this repo's `docs/` folder) is the structured
live-test log (card scanned, language, result shown, variant picker
shown, price accuracy, latency, pass/fail, notes) plus "known-good
baselines" to check against on every retest.

## GitHub repo (2026-08-24): backend source is durable

`api/identify.js` plus `README.md`, `package.json`, `vercel.json` are in
**https://github.com/emg31795/whatnot-pokemon-identify**.

**Still open:**
- `.gitignore` still not in the repo.
- **The Vercel project is NOT git-linked** — deploys are still pushed as
  raw files via the Vercel MCP tools. Ask the user before changing this
  (risk of a duplicate/conflicting Vercel project or moving the
  production domain).

## What's built and live

- **Backend**: deployed to Vercel at
  `https://whatnot-pokemon-identify.vercel.app/api/identify` (project
  `whatnot-pokemon-identify`, team `leasedraftai`, project id
  `prj_eS2DCNOeX82nyDOA9o5OHVhBwxCA`, team id
  `team_DZEpR5n7heCyZsNFjxZmxUP1`).
- **GitHub repo**: `https://github.com/emg31795/whatnot-pokemon-identify`
  — backend + extension source. **Not git-linked to Vercel**.
- **Local git clone**: `~/Documents/whatnot-pokemon-extension` on the
  user's Mac (moved from `~/Downloads/whatnot-pokemon-identify-repo`
  2026-08-30).
- **Extension**: Manifest V3, loaded via Chrome "Load unpacked" pointed
  at the repo's `extension/` subfolder as of the 2026-08-30 migration.

## Env vars (set in Vercel project settings, not passed through chat)

- `GEMINI_API_KEY` — required. Model: `gemini-3.6-flash` (via `GEMINI_MODEL`
  if unset).
- `POKEMONPRICETRACKER_API_KEY` — required. The ONLY card-data source —
  powers English + Japanese lookup, graded slabs, the print-variant
  picker, and card images.
- `PPT_BASE_URL` — optional override.

## IMPORTANT CAVEAT on the ambiguous-match tie-detection feature

Tie-detection only fires when multiple candidates tie for the TOP score.
Watch for a clean (non-tied), flat-out WRONG top-scoring candidate —
don't assume every Low-confidence/ambiguousNote result is "healthy
uncertainty."

## Open feature request (not started, awaiting user go-ahead)

Sealed-pack identification (e.g. "Play! Pokémon Prize Pack Series Seven")
— retail sealed product is feasible via PokemonPriceTracker's
sealed-product tracker; non-retail promotional items aren't (no market
data exists). Two design questions unanswered: build this at all, and
auto-detect vs. a manual mode toggle. Do not start without the user
explicitly returning to it.

## Related docs

- `pallet-trade-reverse-engineering.md` — the reverse-engineering findings
  this build is based on.
- `test-cases.md` — live-test tracking log, report results there.
- `../api/identify.js` — current backend source, kept in sync with every deploy.

---

*This is a snapshot of project history through 2026-08-28, migrated into
the repo as durable on-disk reference. The full, continuously-updated
version (through 2026-08-29 and later) lives in the "Whatnot extension"
Claude Project. See CLAUDE.md at the repo root for the condensed, current
summary meant for day-to-day Claude Code use.*
