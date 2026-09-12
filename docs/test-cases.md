# Test Cases — Whatnot Pokémon Card ID

Live-stream test log. Every real scan reported gets a row here to track
accuracy and speed over time instead of relying on memory.

## How to report a test

Tell me, for each scan:
1. What the physical card actually was (name, set, number, variant/edition,
   language) — the ground truth.
2. What the extension showed (name, set, price, variant selected, image
   yes/no).
3. Roughly how long it took (or paste the Vercel timing if you have it).
4. Anything that looked wrong.

## Log

| # | Date | Card (ground truth) | Language | Result shown | Variant picker shown? | Price accuracy | Latency | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-08-26 | Toxtricity VMAX, Shiny Star V, 060/190, HP 320 | Japanese | "couldn't confidently match" | N/A | N/A | Not measured | FAIL → root-caused in #2-6 | Real cause: broken API endpoint (see #2-6). |
| 2-6 | 2026-08-26 | Carbink, Timburr, Slurpuff, Beautifly, Scorbunny (common English cards) | English | All 5: "couldn't confidently match" | N/A | N/A | Not measured | FAIL → ROOT CAUSE FIXED | Backend was calling a nonexistent `/api/v2/prices` endpoint — 100% failure rate regardless of card. Fixed to `/api/v2/cards`. |
| 7 | 2026-08-26/27 | Koffing, Team Rocket, 58/82, HP 40, **1st Edition (visible stamp, confirmed by user)** | English | Matched at High confidence, showed "1st Edition" price $2.20 | Yes | **Actually correct** — see notes | Not measured | PASS (initially misdiagnosed as a bug) | First successful match since the endpoint fix. I incorrectly assumed the 1st-Edition default was wrong because Gemini's stampType read said "none," and shipped a fix forcing the default away from 1st Edition whenever the stamp isn't read. User then confirmed the card **was** physically 1st Edition — Gemini just missed the stamp. That fix was **reverted**; PPT's own `primaryPrinting` field turned out to be the more reliable signal. |
| 8 | 2026-08-27 | Brock's Onix, Gym Heroes, 069/132, HP 100, attacks "Bellow"/"Rock Throw" | English | Matched "Brock's Onix (21)" 021/132, HP 70, attacks "Bind"/"Tunneling" — **wrong printing** | Yes (1st Edition $15.29 shown) | **Wrong card entirely** | Not measured | FAIL → FIXED | Gemini read cardNumber "21/132" (matched a real but wrong candidate) while also reading hp "100 HP" (matches a *different* candidate, 069/132). Number match outscored HP and won with false High confidence. Two bugs found: (1) HP comparison used exact string match, so "100 HP" never matched a bare "100" — HP silently scored zero. (2) No safeguard existed for "number matches, but HP clearly points to a different candidate." Fixed both, plus nudged the Gemini prompt to not mix fields between multiple cards in frame. |
| 9 | 2026-08-27 | Gourgeist ex, physical card read as 067/182 | English | Matched "Gourgeist ex - 102/086" (ME04: Chaos Rising), Low confidence, ambiguous-match warning shown | Yes (Holofoil $1.27) | Uncertain — flagged as such | Not measured | **Working as intended** | Only 2 candidates existed in the search pool, neither matched the read number, so the system correctly showed Low confidence rather than false certainty. Not a bug. |
| 10 | 2026-08-27 | Hitmontop, Japanese, Crimson Haze (SV5a), 067/066, HP 100, attacks "Spin Draw"/"Cyclone Kick" | Japanese | Matched "Hitmontop" 072/172 (SWSH09: Brilliant Stars), Medium confidence, "Normal" price $0.13, no warning shown | Yes (Normal $0.13) | Wrong printing, resting on weak evidence shown as more certain than it was | Not measured | FAIL → FIXED | Read cardNumber/set matched NONE of the 18 real PPT candidates — match rested entirely on one HP coincidence. Two bugs found: (1) PPT never exposes a scalar `attackName` field, only an `attacks[]` array — the 4-point attackName scoring signal had been completely dead since the PPT-only rewrite. Fixed with `extractFirstAttackName()`. (2) No safeguard for "read number matches nothing in the pool" — added a downgrade to Low confidence with an explanatory note. |
| 11 | 2026-08-27 | Stonjourner VMAX, SWSH01 Sword & Shield Base Set | English | Matched correctly, High/High, Holofoil $1.76 | Yes | Correct | ~1.7-2.3s range | PASS | Part of an 8-scan batch testing the latency fix. Old (pre-fix) deployment. |
| 12 | 2026-08-27 | Gardevoir V (Magical Shot / Swelling Pulse) | English | Matched correctly, High read / Low match confidence, ambiguous-match warning, Holofoil $1.99 | Yes | Correct, but flagged Low | Not measured | PASS | Old deployment. Ambiguous-match safety net fired but the guess was right — expected, honest behavior. |
| 13 | 2026-08-27 | Steelix V, SWSH04 Vivid Voltage | English | Matched correctly, High/High, Holofoil $0.96 | Yes | Correct | Not measured | PASS | Old deployment. |
| 14 | 2026-08-27 | Zoroark GX (Trade ability / Riotous Beating), Trickster GX | English | Matched correctly, High read / Low match, ambiguous-match warning, Holofoil $3.66 | Yes | Correct despite Low flag | Not measured | PASS | Old deployment. Same pattern as #12. |
| 15 | 2026-08-27 | Slaking V ("Kinda Lazy" ability / Heavy Impact) | English | Matched correctly, High read / Low match, ambiguous-match warning, Holofoil $0.74 | Yes | Correct despite Low flag | Not measured | PASS | Old deployment. |
| 16 | 2026-08-27 | Kommo-o GX, SM Guardians Rising, HP 240 | English | Matched correctly, High/High, Holofoil $3.81 | Yes | Correct | Not measured | PASS | Old deployment (just before the latency-fix deploy went live). |
| 17 | 2026-08-27 | Zarude (partially obscured behind card sleeve/glare) | — | "Couldn't identify the card. Try again when it's clearly visible." | N/A | N/A | Not measured | FAIL — no bug found | Logs show no code error/timeout — Gemini itself returned found:false. Most likely a genuinely hard frame. |
| 18 | 2026-08-27 | Silvally GX (English promo, likely SM91 or 116/156) | English | Repeated scans gave inconsistent reads ("SM91" vs "116/156") and inconsistent results: one scan matched Hidden Fates: Shiny Vault at Low confidence ($13.24, wrong printing), a later rescan matched 116/156 at High confidence ($4.32, correct) | Yes | Wrong on the flagged scan; correct on a later rescan | 1637-2280ms across 4 attempts (first real measured numbers) | FAIL → FIXED | `normalizeNumber`'s regex required the number to start with a digit, so alphanumeric promo numbers ("SM91") never parsed. When Gemini read "SM91" correctly, the number signal silently scored zero, and the pick fell back to a 7-way HP/attack tie, landing on the wrong printing. Fixed: `normalizeNumber` now captures an optional leading letter prefix and requires prefixes to match. |
| 19 | 2026-08-27 | Cramorant V (normal-size holofoil, no oversize markings) | English | Matched a "Jumbo Cards" oversized promo listing, $2.62 | Yes | Wrong product line entirely | Not measured | FAIL → FIXED | Exact "SWSH086" number read tied at the same score with 3 other candidates matching only via hp+attackName coincidence, because `SCORE.number` (10) could be tied/beaten by the other signals combined (17). Fixed: bumped `SCORE.number` to 20 (dominates any combination of other signals) and added `isOddityCandidate()` to prefer non-oddity candidates among tied top scorers. |
| 20 | 2026-08-27 | Shaymin V (normal holofoil, no "Prize Pack" stamp visible) | English | Matched under "Prize Pack Series Cards", $33.10 | Yes | Wrong product line entirely | Not measured | FAIL → FIXED | PPT's data contained two literal duplicate rows for the same printing, tied at score 25 — old dedup key treated a name-suffix difference as two distinct candidates. Fixed: `candidateDedupKey()` strips the trailing "- number" name suffix before computing dedup identity, plus the same oddity-preference fix as #19. |
| 21 | 2026-08-27 | Galarian Moltres, SWSH284 (Sword & Shield Promo), HP 120, none stamp | English | Matched correctly, High/High, Holofoil $14.38 | Yes | Correct | Not measured | PASS | First scan since the Cramorant V/Shaymin V fix — a promo-numbered card matched cleanly. |
| 22 | 2026-08-27 | Pikachu ex, 179/131, SV: Prismatic Evolutions, HP 200, none stamp | English | Matched correctly, High/High, Holofoil $59.70 | Yes | Correct | Not measured | PASS | Clean match, no tie/oddity issues. |
| 23 | 2026-08-27 | Mewtwo, SVP 052 (Scarlet & Violet Black Star Promo) | English | Matched "Mewtwo EX" 52/108 (XY - Evolutions), High/High, Holofoil $10.45 — wrong printing entirely | Yes | Wrong card | Not measured | FAIL → FIXED | Two issues: (1) Gemini's own reads were inconsistent across repeat scans, once a full hallucination ("GG44/GG70", "Crown Zenith" — text not on the card at all, matched a real candidate and returned $274.61 at High confidence). Vision-reliability issue, not fixable in our code — flagged as an open concern. (2) When Gemini read the bare promo number "052" correctly, number-matching gave FULL credit for matching an unrelated numbered-set card "52/108" — a coincidental digit match between different numbering schemes. Fixed: `numbersMatch` now only gives full credit when both numbers share the same scheme; an asymmetric match scores much lower plus an explicit warning note. |

## Latency fix — CONFIRMED with real numbers (2026-08-27)

The 4 Silvally GX scans in test #18 are the first requests on the
post-latency-fix deployment (`dpl_93uCTCS8zVA7WidUhYEef2PQNG5s`):

| Gemini ms | Lookup ms | Total ms |
|---|---|---|
| 1637 | 141 | 1778 |
| 1851 | 131 | 1982 |
| 2157 | 123 | 2280 |
| 1906 | 88 | 1994 |

All four land at 1.8-2.3 seconds total — comfortably inside the 2-5s
target, a real, measured improvement over the pre-fix behavior (16
confirmed timeout aborts in a single 24h window on the old deployment).

## Known-good baselines (for regression comparison)

- **PokemonPriceTracker search returns real candidates**: confirmed live.
- **Variant object shape**: `{"1st Edition": {...}, "Unlimited": {...}}` and also `{"Holofoil": {...}}` alone on modern cards.
- **Default variant selection trusts PPT's `primaryPrinting` field** (Gemini's stamp read can miss real stamps).
- **HP comparison is digits-only**.
- **Number/HP conflict detection**: if the winning candidate's number matches but its HP contradicts the read, while a different candidate's HP matches exactly, confidence drops to Low with an explicit warning.
- **attackName scoring signal**: parses the move name out of the first `attacks[]` string (PPT never returns a scalar field).
- **No-number-match-in-pool warning**: read number matches nothing in the pool → Low confidence + note.
- **Card image (`imageCdnUrl`)**: confirmed present and rendering.
- **Name-filter Unicode normalization**: gender symbols (♂/♀ → "m"/"f") and diacritics (é → e) normalized before name-filter comparison.
- **Condition prices are real, live per-condition TCGplayer data or an explicit error — never a flat multiplier or a guess** (rearchitected 2026-08-30, see test #42; extended in test #44; confirmed working live in test #46): a printing shows whichever conditions TCGplayer has real data for, missing tiers dashed out; `pricingError` only fires when NONE of the 5 conditions have any real data. The old `CONDITION_MULTIPLIERS` synthetic-estimate table has been deleted entirely.

| 24-26 | 2026-08-27 | Raichu (Japanese AR, 074/071), Psyduck (Japanese AR, 199/193), Lapras (Japanese AR, s12a 177/172) | Japanese | Raichu: "couldn't confidently match". Psyduck/Lapras: matched wrong English promo printings, Low confidence | Yes (Psyduck/Lapras) | Wrong card/language on all 3 | Not measured | FAIL → misdiagnosed, then correctly fixed (see #27) | Initially concluded (WITHOUT checking PPT's own API docs) this was a structural data-source gap. **User correctly pushed back** — they specifically pay for PPT's Japanese card data. Re-checking PPT's docs found the real cause — see #27. |
| 27 | 2026-08-27 | (fix, not a new scan) | Japanese | N/A | N/A | N/A | N/A | **REAL ROOT CAUSE FOUND & FIXED** | PPT's `/api/v2/cards` endpoint has a documented `language` query parameter that `fetchPokemonPriceTracker()` had never been passing — every "Japanese" scan all session silently searched PPT's English-only pool. Fixed: passes `language=japanese` whenever Gemini's read says the card is Japanese, threaded through `lookupCardPPT` and `lookupGradedPrice`. Removed the blanket Japanese-caveat/confidence-cap workaround. Lesson: absence of evidence for a mechanism doesn't confirm the data doesn't exist upstream — should have checked the API docs before concluding a data-source limitation. |
| 28 | 2026-08-27 | Dark Gengar, わるいゲンガー (Neo Destiny JP), HP70, in a TAG 9 graded slab | Japanese | Matched correctly, Medium confidence, Holofoil $223.00 (raw estimate, honest slab warning) | Yes | **Correct card and price, per user** | 2371ms Gemini / 231ms lookup / 2602ms total | **PASS — confirms the language-param fix (#27) works** | First live confirmation via real logs since the fix deployed — genuinely Japanese-market candidates came back this time. Medium (not High) confidence is separately honest: no `cardNumber` field to verify against. |
| 29 | 2026-08-27 | Eevee, SV: Scarlet & Violet Promo Cards, 173, HP 50, no Pokemon Center stamp visible | English | Matched "Eevee - 173 (Pokemon Center Exclusive)", Low confidence, ambiguous-match warning, Holofoil $91.24 | Yes | Wrong printing | Not measured | FAIL → FIXED | Two real, distinct PPT rows tied at score 30 (number+hp+attackName all matched identically); no tie-break signal existed to prefer the plain promo, even though Gemini's own stampType read said "none". Fixed: added a soft stamp-keyword scoring signal cross-referencing Gemini's `stampType` read. |
| 30 | 2026-08-27 | Palkia GX / Origin Forme Palkia VSTAR, Japanese (rapid rescans) | Japanese | "Couldn't reach our card database right now (it's been intermittently flaky)." | N/A | N/A | Not measured | FAIL → FIXED | 4 rapid rescans in ~30s hit a real PPT 429 ("Minute rate limit exceeded") — not flakiness. `fetchPokemonPriceTracker()` was requesting `limit=100` per search, far more than ever needed. Fixed: dropped default limit to 30 (~3x credit savings), added explicit 429 detection, honest rate-limit message with wait estimate. |
| 31 | 2026-08-27 | Squirtle, SV2a "151" (Japanese), 170/165, AR, HP 60 | Japanese | "couldn't confidently match" | N/A | N/A | Not measured | FAIL → FIXED (attempt 1 — turned out to be a no-op, see #32) | Exactly the regression flagged as a risk in #30: `limit=30` crowded out a real valuable card behind unrelated filler cards sharing the species name. "Fixed" with a `cardNumber` query param based on a WebFetch summary of PPT's docs — **turned out to be completely wrong, see #32.** |
| 32 | 2026-08-27 | Same Squirtle card, rescanned again | Japanese | Still "couldn't confidently match" | N/A | N/A | Not measured | FAIL → FIXED for real (attempt 2, still had a gap — see #33) | **User caught the #31 fix didn't work.** PPT returned an explicit 400 on every request with `cardNumber` — it was never a real parameter; my earlier WebFetch summary was simply wrong. Real fix: removed `cardNumber`, added a genuine `offset`-based page-2 fallback — but only triggered when nothing at all cleared the match floor (`!best`). Test #33 found this trigger still too narrow. |
| 33 | 2026-08-28 | Charizard V, SWSH: Brilliant Stars, 017/172, HP 220 | English | Matched "Charizard V - SWSH260" (promo), Holofoil $51.13, Read: High / Match: Low, honest "no exact number match" warning | Yes | Wrong printing | Gemini 1412-1799ms, lookup ~100ms | FAIL → FIXED | A wrong candidate cleared the match floor via secondary signals even without the number matching, so `best` was truthy and #32's `!best`-only trigger never fired. Fixed: widened the page-2 trigger to also fire whenever the read number matches NONE of the page-1 candidates, regardless of whether something else cleared the floor. |
| 34 | 2026-08-28 | Dragonite, Fossil, 4/62, HP 100, Holo Rare | English | Matched "Dragonite (19)" 19/62, Read: High / Match: Low, honest warning, variant picker only "1st Edition"/"Unlimited" (no separate Holo) | Yes | Card/price correct; question was about the missing Holo/non-Holo distinction | Gemini ~1550ms, lookup 204-374ms | **PASS — no bug; confirms #33's widened fix works in production** | PPT's `variants` object genuinely has no separate "Holofoil" key for this card — Fossil-era rares were only ever printed as Holo, so 1st Edition/Unlimited prices ARE the holo prices. Also confirmed #33's fix firing correctly in production across multiple cards this window. |
| 35 | 2026-08-28 | Zoroark, SV: White Flare (2025), 062/086, HP 120 | English | Matched "Zoroark - SM89" (SM Promos, 2017), Read: High / Match: Low, honest warning, Holofoil $1.22 | Yes | Wrong printing | Gemini ~1480-1505ms, lookup 104-173ms | FAIL — real cause is a PPT catalog gap, not a code bug | Page-1+2 search (28 real, deduplicated candidates) came back with genuinely zero White Flare printings — PPT's catalog for a plain "Zoroark" search simply doesn't carry this newer (2025) set yet. Safety net worked as intended (Low confidence + explicit warning). No code fix available. |
| 36 | 2026-08-28 | Nidoran♂, HP 60, attack "Double Scratch", none stamp | English | "couldn't confidently match" on all 4 repeat scans | N/A | N/A | Gemini 1433-1736ms | FAIL → FIXED (real code bug) | Gemini reads the gender as a Unicode symbol ("Nidoran♂"), PPT spells it as a letter ("Nidoran M") — the name filter's strict substring check rejected every real candidate before scoring ever ran. Fixed: `normalizeNameForMatch()` spells out ♂/♀ as letters and strips punctuation. Likely also protects Mr. Mime, Farfetch'd, Type: Null. |

## Tests #37-40 (2026-08-28, 4 scans reported together)

**User report, verbatim**: "Right name- wrong card (tyranitar). Same deal
with psyduck. Iron treads didn't identify the stamp. Pokemon collector
card could not be identified." One was a real, fixable code bug; the
other three were genuine data/OCR limitations.

| # | Date | Card (ground truth) | Language | Result shown | Latency | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|
| 37 | 2026-08-28 | Tyranitar, read "122/193" and "130/193", HP 180 | English | Matched "Tyranitar - 222/193" (Paldea Evolved), $73.79 — wrong printing, honest warning shown | Gemini 1637-1938ms | FAIL — PPT catalog-coverage gap | Page-1+2 pagination merged 60 candidates; neither read number was anywhere in the pool. A 3rd scan of a different physical Tyranitar matched correctly on page 1 alone — confirms the matching logic is fine when the printing is actually fetched. No code fix without deeper pagination (real latency/credit cost). |
| 38 | 2026-08-28 | Psyduck, HP 70, cardNumber obscured, Detective Pikachu stamp visible | English | Ambiguous match warning, matched "Psyduck - SM199 (Detective Pikachu Stamped)", $36.69 | Gemini 1577-2026ms | FAIL — genuine OCR limitation | Gemini's read explicitly said `cardNumber: null` (correct — obscured by hand/marker). 6 candidates tied at the floor; safety net fired correctly. No code fix possible — number physically not visible. |
| 39 | 2026-08-28 | Iron Treads ex, HP 220, Paldean Fates holo-overlay watermark | English | Scan 1: ambiguous 2-way tie ($0.83). Scan 2: matched wrong SV01 Base Set printing ($1.06) | Gemini 1504-1517ms | FAIL — two distinct non-code-bug causes | Scan 1: Gemini's `stampType` enum has no slot for a set-branding overlay, so "none" was the closest honest answer — tie is expected given no stamp signal. Scan 2: Gemini misread the printed number ("233/091" isn't real for a 91-card set), which happened to number-match an unrelated candidate at exact-match strength. Not fixable client-side. Widening the stampType enum flagged as a possible future improvement, not shipped. |
| 40 | 2026-08-28 | Pokémon Collector (accented), HP null, "97/123" visible on 2 of 3 scans | English | "couldn't confidently match" on all 3 repeat scans | Gemini 1502-1555ms | FAIL → FIXED (real code bug) | Same class of bug as #36: Gemini reads the literal accent ("Pokémon Collector"), PPT spells it without ("Pokemon Collector"). `normalizeNameForMatch` stripped punctuation but never diacritics. Fixed: runs `.normalize("NFD")` and strips combining marks before lowercasing. |

## Shadowless dropdown option (feature request, 2026-08-28)

Added a Shadowless price option to the dropdown as a pure post-processing
step (zero extra network calls, zero Gemini prompt changes) —
`stripShadowlessSuffix()`/`isShadowlessSetName()` helpers find the
Shadowless sibling candidate among candidates already fetched and fold
its prices into the same dropdown, tagged "(Shadowless)". Default variant
selection unchanged.

**Process note**: the first deploy attempt base64-encoded the file to
avoid retyping risk, but the blob was too large to view/verify in full
and only a truncated prefix got pasted — silently shipping a broken file
(Vercel still reported "READY" since it doesn't syntax-check). Caught and
corrected using the exact plain-text content already captured via prior
Read calls, verified byte-identical via md5 before committing. **Lesson**:
for very large files, read the plain-text source in ordered chunks small
enough to view in full and concatenate faithfully — don't reach for
base64 as a shortcut.

## Corrected — Japanese Pokémon cards ARE supported by PokemonPriceTracker (2026-08-27)

Superseded the earlier wrong conclusion that PPT lacked Japanese-market
data. Real cause (test #27) was a missing `language=japanese` query
parameter on our own requests. Confirmed fixed via test #28.

## Open reliability concern — Gemini's own reads can be inconsistent/hallucinated on the same physical card

Test #23 (Mewtwo): 3 different cardNumber reads on the same physical
card within seconds, once a full hallucination. Test #35 (Zoroark): two
scans of the same card produced two different `stampType` values. Test
#45 (Snorlax): `setName` read as "s10a" once and "s10b" on a repeat scan.
Not a code bug — Gemini's vision output varying/hallucinating between
calls on harder reads. Escalated significantly in test #50 (see below).
**Test #63 (2026-08-30) adds a new flavor**: inconsistent *English
translation* of the same untranslated Japanese card name across 3 repeat
scans ("AZ's Solace" twice, "AZ's Comfort" once) — and all 3 guesses were
simply wrong; PPT's real name for the card is "AZ's Tranquility." Distinct
from prior instability cases (which varied a structured field like
cardNumber/stampType/setName) — here the free-text name itself is
unstable AND inaccurate, which is a harder problem since there's no
"correct" deterministic translation for Gemini to converge on without
already knowing PPT's specific chosen English name.

## Number-weight / oddity tie-break fix (2026-08-27)

Bumped `SCORE.number` from 10 to 20 (dominates any combination of the
other four signals, which max out at 18) and added dedup + oddity-
avoidance logic to `pickBestCandidate()` — see tests #19/#20. This also
moves the scoring model closer to pallet.trade's own approach, which
treats the card number as authoritative (see
`pallet-trade-reverse-engineering.md`).

## PPT `limit` vs. real-candidate-coverage tradeoff (2026-08-27 → 2026-08-28)

Test #30 lowered PPT's default search `limit` from 100 to 30 to fix a
real rate-limit bug. Test #31 confirmed the regression risk this flagged:
a real card can get crowded out of a `limit=30` pool by unrelated
same-species filler. Test #31's own fix (`cardNumber` param) was
completely wrong and did nothing — see #32. Test #32's `offset`-based
pagination was real but too narrow (`!best`-only trigger) — see #33.
**Real fix, test #33**: widened the trigger to fire whenever the read
number matches nothing on page 1, whether or not something else cleared
the floor. Confirmed firing correctly across multiple card types since.
**Test #35 surfaces a deeper limit**: even with page 2 fetched, PPT's own
catalog can genuinely not contain a printing at all for a newer/less
common set — pagination alone can't fix a coverage gap in the source data.

## Speed benchmarks (target: 2-5s total, end to end)

First real numbers captured 2026-08-27 (test #18): 1778-2280ms. Test #33:
1511-1799ms. Test #35: 1584-1678ms. Tests #37-40: 1584-2119ms across
successfully-completed lookups, including the pagination path and the
ambiguous-tie path. Test #43 (Hitmontop): 2001-2182ms including a failed
live TCGplayer fetch. Tests #44-45: 1988-2602ms, confirming the
partial-condition-data fix adds no meaningful latency. Comfortably inside
target throughout.

## Condition-price accuracy investigation (2026-08-28) — RESOLVED, then rearchitected (see test #42, confirmed in test #46)

**User report, verbatim**, with screenshots of both our result panel and
the real TCGplayer product page: "I think we may have a bigger issue at
hand. Price inaccuracies... seeing the market price of $10.52 on the
tcgplayer website. We need to fully investigate this." Card: Togepi,
Undaunted 70/90, Reverse Holofoil. Our panel showed Market $37.50 (real
NM data, correct) but Lightly Played $31.88 — TCGplayer's actual live LP
market was $10.52, roughly a 3x overestimate.

**Root cause, confirmed empirically**: every LP/MP/HP/DMG price shown
anywhere in this tool, on every card, has been a synthetic extrapolation
— `CONDITION_MULTIPLIERS` (85%/70%/55%/40% of the single Near-Mint
`marketPrice` PPT returns) — with zero real per-condition backing.

A temporary debug block requesting PPT's `includeHistory=true` param on a
real live scan (Raichu, Stormfront) confirmed PPT DOES return genuine,
non-uniform, real per-condition prices when asked — nowhere close to the
flat 85/70/55/40% ratios assumed. `includeHistory=true` had simply never
been requested before this investigation.

**First fix (2026-08-28, superseded)**: always request
`includeHistory=true`, read PPT's real per-condition breakdown where it
existed, fall back to the old multiplier only for tiers PPT didn't have.
Superseded by test #42's Ditto case — the remaining multiplier fallback
was badly wrong for older WotC-era cards (real 43% LP/NM ratio vs. the
assumed 85%). **Replaced entirely by the live-TCGplayer-or-explicit-error
architecture in test #42.**

## Test #41 — NM-estimated-flag bug found and fixed (2026-08-29)

Card: Charizard ex - 223/197 (Obsidian Flames), Market (Holofoil)
$108.59. All five condition tiers were marked "*" (estimated) — including
NM, the actual real market price itself.

**Root cause**: PPT's raw `variants` object for this printing was the old
single-number shape with zero per-condition breakdown, so `hasRealData`
was false for every tier. The multiplier-fallback loop correctly fell
back for LP/MP/HP/DMG but incorrectly did the same for NM too — even
though `basePrice` (used for NM) is ALWAYS the genuine PPT/TCGPlayer
market price on every code path, never itself a multiplier product.

**Fix**: explicit `tier === "NM"` branch that always sets
`estimated.NM = false` regardless of which branch produced `basePrice`.
Committed as `aea450d`.

## Test #42 — condition pricing rearchitected: real TCGplayer data, not PPT (2026-08-30)

Card: Ditto (18/62, Fossil). User: "Got this one very wrong. LP is
currently $6.84." Real cause: multiplier fallback was tuned loosely off
modern-card examples (75-85% LP/NM ratios) and is badly wrong for older
WotC-era cards — this Ditto's real ratio is 43%.

**User's direction**: pull real per-condition prices straight from
TCGplayer instead of PPT. Confirmed via live browser network inspection
that TCGplayer's own storefront calls a public, unauthenticated,
CORS-open, cacheable JSON endpoint:
`https://infinite-api.tcgplayer.com/price/history/{tcgPlayerId}/detailed?range=quarter`
— real transaction-based market prices broken out by condition and
printing, refreshed weekly.

**Real fix, shipped**: PPT still supplies card identification and each
candidate's `tcgPlayerId`. Pricing is completely rearchitected:
`fetchTCGPlayerPriceHistory()` calls TCGplayer's own endpoint directly;
`buildLivePriceVariantsFromTCGPlayer()` groups the response by printing.
`CONDITION_MULTIPLIERS` is deleted entirely — no synthetic fallback
exists anywhere in the file. Per explicit user instruction, a printing
with no genuine live data for any condition throws and is surfaced as an
explicit `pricingError` field, shown as a distinct red banner
("🛑 NO LIVE PRICE"), never paired with a fabricated number.

**Deploy process failure, disclosed in full**: the first deploy attempt
shipped a placeholder stub module that doesn't exist — and unlike a prior
near-miss, this one actually went live on production, meaning real scans
were broken (`Cannot find module`) for a window. A second attempt
accidentally omitted `api/identify.js` from the file list (failed to
build, no harm). A third deployed another placeholder as a rollback
marker. The actual fix was the fourth deploy, verified via `node -c` +
sha1 check and a live test request before declaring it fixed. Root cause:
rushing a large (75K-char) file-content paste instead of reading the
source in full, non-truncated chunks and transcribing exactly. Committed
as `6ff729e` (backend) and `ed64de1` (frontend).

## Test #43 — Hitmontop scan: backend correct, stale Chrome extension was the real culprit (2026-08-29)

Card showed "Market: —", all condition rows blank, the OLD caption text,
and no error banner. Real logs showed the backend behaved exactly as
designed: TCGplayer had only 1 SKU (NM) with zero LP/MP/HP/DMG sales data
for this ultra-rare Japanese promo, `pricingError` correctly set. The
actual bug: the OLD caption text can't be produced by the shipped code —
the user's Chrome extension was still running pre-fix `content.js`.
**Chrome extensions require a manual reload** (chrome://extensions →
reload icon) to pick up file changes; they do not auto-reload.

This also raised a real product question (partial-condition-data display)
— initially decided to keep strict all-or-nothing, reversed within the
same session in test #44 once the user showed concrete counter-evidence.

## Test #44 — partial condition pricing shipped after concrete counter-evidence; a real deploy near-miss along the way (2026-08-29)

User pushed back with concrete TCGplayer screenshots (Cinccino: 26 active
NM + 3 LP listings; Snorlax: same pattern) showing real data existed for
some conditions that our all-or-nothing rule was discarding entirely.

**Fix**: `buildLivePriceVariantsFromTCGPlayer` no longer requires all 5
conditions — a printing is included as soon as it has real data for at
least one. Missing tiers render as "—", never guessed. Added a `partial`
flag so the frontend can caption partial coverage differently.
`pricingError` now only fires when literally none of the 5 conditions
have any real data.

**Deploy process — a real near-miss, disclosed in full**: repeated the
same class of mistake as test #42. A deploy including a literal
placeholder string (`"PLACEHOLDER_WILL_REPLACE"`) as the entire content
of `api/identify.js` built successfully and went live on production
(Vercel doesn't check a serverless function's actual logic) — a real user
scan surfaced the breakage directly. The actual fix was built by reading
the local source in full via plain-text `cat` in ordered chunks and
transcribing exactly. Committed as `9166b09`, pushed to GitHub.

**Structural fix worth considering, not yet acted on**: git-integrated
Vercel deploys (auto-build from a GitHub push) would eliminate this whole
class of manual-paste mistake. Flagged for a future explicit conversation
rather than switched mid-incident.

## Test #45 — Snorlax: same partial-pricing pattern, plus a possible number-mismatch worth watching

Same root cause/fix as test #44. Separate wrinkle: two scans read
`cardNumber` "077/071" but matched a candidate whose real number is
"077/096" — a numerator match but denominator mismatch that normally
should trigger the "no number match" warning — worth checking on a future
rescan whether it fired.

## Test #46 — Glaceon ex: partial-pricing fix confirmed correct on a live scan (2026-08-29)

Glaceon ex, Prismatic Evolutions, 026/131. NM $2.82 / LP $2.01 / MP $1.99
/ HP — / DMG $1.43. **Confirmed correct, exact match** — user's own
TCGplayer screenshot shows no Heavily Played category exists for this
listing (hence the dash), and LP $2.01 exactly matches TCGplayer's own
displayed Market Price. First live confirmation of test #44's fix.

## Test #47 — Banette: another clean partial-pricing success (2026-08-29)

Banette, Shrouded Fable, 090 Holofoil. NM $10.94 / LP $11.06 / MP — / HP
— / DMG $9.66. Confirmed correct per user. LP slightly higher than NM —
tool reports TCGplayer's real weekly data as-is, no artificial ordering
imposed. Second live confirmation.

## Test #48 — Braviary: apparent discrepancy investigated, turned out to be correct (2026-08-29)

User flagged our NM $10.63 vs. a TCGplayer page showing "$9.16". Live
logs + a live TCGplayer page load confirmed: the page had landed with
"Lightly Played" as its default-selected condition filter, not Near Mint
— its own "Near Mint Comparison Prices" box explicitly lists $10.63,
matching our figure exactly. Both of our numbers were correct all along.
Third live confirmation of the partial/live-pricing architecture, and the
first case this session where an apparent discrepancy was investigated
and closed as "working correctly."

## Test #49 — Eevee SVP 173: same card as test #29, real cause is a PPT catalog-crowding gap (2026-08-29)

Same physical card as test #29. Matched "Eevee - SM184 (Cosmos Holo)"
instead, honest Low-confidence warning shown, $15.33 — wrong card/price.
Gemini's read was correct and consistent; page-1+2 pagination merged 60
real, distinct Eevee printings and genuinely none of them was the SVP 173
promo. Same class as test #35 (Zoroark) and #37 (Tyranitar) — an
extremely common search name with hundreds of real printings, where even
60 results isn't guaranteed to surface every specific promo number. No
code fix shipped this session (deeper pagination trades latency/credit
for a gain that only helps rare crowding cases).

## Fix shipped for test #49's crowding-out gap: name+number combined search fallback (2026-08-29)

Confirmed via PPT's own live API docs page that `search` supports
multi-word queries across name/setName/cardNumber/rarity/cardType
(`search=charizard base set holo`). **Fix**: in `lookupCardPPT`, after
page-1+page-2 pagination still fails to find the read number, try ONE
more search combining name + number as a single query before giving up.
Purely additive — only fires when the number is already missing after
everything else has failed. Committed as `5b9c54c`.

## Test #50 — Cornerstone Mask Ogerpon ex: severe Gemini read instability, not a matching-code bug (2026-08-29)

Japanese Ogerpon ex card, Start Deck 100 Battle Collection. 6 repeat
scans in the investigated window produced wildly inconsistent Gemini
reads: twice `cardNumber: null` (honest — correctly triggered the
ambiguous-tie safety net across 18 real tied candidates); once a
nonexistent number ("225/200" — confirmed the new combined-search
fallback executing correctly end-to-end, finding nothing since the number
wasn't real); once a real number for a DIFFERENT Ogerpon variant (Teal
Mask, not Cornerstone Mask) that cleared the floor and returned a wrong
card/price with no warning; once a full hallucination (invented a Chinese
attack name and language on a Japanese card).

**Root cause: a Gemini vision-reliability failure worse than any prior
instance of the tracked reliability concern** — no plausible code fix;
this is the first time a scan both invented a nonexistent number AND
hallucinated an entire wrong language/attack text on the same card.

## Test #51 — "wait 1041s" rate-limit message was actually PokemonPriceTracker's daily credit quota, not per-minute (2026-08-29)

Real PPT response: `{"error":"Daily credit limit exceeded", ...}` — this
is PPT's **daily** API credit quota being fully spent, not the
per-minute rate limit from test #30. Our own message conflated the two.

**Fix shipped**: `fetchPokemonPriceTracker`'s 429 handler now detects
`isDailyLimit` from PPT's own `error` field and branches the user-facing
message accordingly (daily-limit case gives the real reset ETA and points
to pokemonpricetracker.com/api-keys; true per-minute case keeps the
original short-wait message). Committed as `02e3942`.

**Resolved by the user directly**: bought 200,000 more PPT credits for $5.

## Test #52 — Great Tusk ex: clean PASS, first live scan after repo migration (2026-08-30)

Great Tusk ex, SV01: Scarlet & Violet Base Set, 246/198, English,
Holofoil. Extension showed "Great Tusk ex - 246/198", SV01: Scarlet &
Violet Base Set, Read: High / Match: High, none stamp, Market
(Holofoil) $13.28. Condition prices: NM $13.28, LP $12.08, MP $8.52, HP
$7.93, DMG $5.68. Scan cost $0.0007. **PASS — correct card and price.**

Confirms two things end-to-end: (1) the reloaded Chrome extension from
`~/Documents/whatnot-pokemon-extension/extension` (post repo migration)
works correctly against the live backend; (2) the current deployed
backend (post Gemini `thinkingLevel`/`media_resolution` fix, commit
`3e895b1`) behaves correctly on a straightforward English card. **Not a
hard/failure-class card** (see the "Open reliability concern" section
above and CLAUDE.md's "What 'rescan' means" note) — doesn't confirm the
read-instability fix itself. Still watching for that on a Japanese,
promo/alphanumeric-number, or full-art/ex card as one naturally comes up
on stream.

## Test #53 — Drayton (Trainer/Supporter): first non-Pokémon card scanned, real card-type gap confirmed via logs (2026-08-30)

Drayton, SV08: Surging Sparks, English Trainer/Supporter card (no HP, no
attacks). Two repeat scans 10s apart both showed "couldn't confidently
match." Vercel runtime logs (`dep=dpl_5eUq8D9vMY755WTnSRrNvggYQKvX`)
pulled per CLAUDE.md convention before proposing anything:

- **Scan 1**: Gemini read `cardNumber: null`, own `reason` field said
  glare obscured the number. HP/attackName genuinely null (not
  applicable to a Trainer card). PPT returned 4 real "Drayton"
  candidates (different printings: 244/191, 232/191, 174/191, 172/131).
  Zero usable signal on any axis → `bestScore=0, tieCount=4` → safety net
  correctly fired. Same pattern as test #38 (Psyduck) — genuine OCR
  limitation, not a bug.
- **Scan 2** (same physical card, 10s later): Gemini read
  `cardNumber: "212/191"` — a different read than 10s prior (another
  instance of the tracked Gemini read-instability concern). "212"
  doesn't match any of the same 4 candidates' numerators; the
  name+number combined-search fallback for "Drayton 212/191" returned
  **0 results** — that number doesn't exist anywhere in PPT's catalog
  for this card. Given scan 1 already flagged glare over that exact
  digit region, a bad/hallucinated read is more likely than a genuine
  catalog gap, though a catalog gap can't be fully ruled out.

**Real code bug found**: `normalizePptCard`'s subtype extraction
(`api/identify.js:750-754`) only scans candidate names for Pokémon power
tags (`VMAX/VSTAR/GX/EX/ex/V/BREAK`) — never Trainer subtypes
(Supporter/Item/Stadium/Tool), even though PPT's raw payload carries
this directly (`"cardType":"Trainer","pokemonType":"Trainer -
Supporter"`, confirmed in the raw log). So even though Gemini correctly
read `subtype: "Supporter"` on both scans, every candidate's `subtypes`
array is `[]`, and the 5-point subtype signal silently never fires for
any Trainer card. Same class of dead-signal bug as the already-fixed
`attackName` bug (`api/identify.js:728-738`, Hitmontop, test #33-ish).
**Not yet fixed** — checked whether it would have saved this scan: it
would not have, since all 4 real candidates share the identical subtype
("Supporter"), so subtype can never discriminate between different
printings of the same Trainer card even once fixed.

**Structural finding, not just a bug**: for Trainer cards, `number` and
`set` are the *only* signals that can ever break a tie between same-name
printings — HP and attackName are permanently inapplicable by card type,
unlike Pokémon cards which get three independent tie-break signals in
reserve. This makes Trainer-card matching inherently more fragile to a
bad number read than Pokémon-card matching. **FAIL — real card-type gap,
root-caused this session.** See new Phase 1 checklist item in
ROADMAP.md.

**Update (2026-08-30): subtype-extraction bug fixed and deployed as its
own isolated change**, per explicit instruction NOT to bundle it with
the deeper tie-break design question. `normalizePptCard` now extracts
Trainer subtypes (Supporter/Item/Stadium/Tool/etc.) from PPT's
`pokemonType` field (`"Trainer - <subtype>"`), mirroring the earlier
attackName fix. Committed `d589d46`; deployed
(`dpl_GnxKLpHTkcN8QuVXhY1gPgpmpk1P`), build log confirms 3 files
downloaded, live `POST /api/identify {}` returns the real `400
{"error":"Missing imageBase64"}`, runtime logs confirm that exact
request was served by this deployment ID. **Deployed and verified
serving — not yet confirmed via a live scan**, since as established
above this fix would not have changed either of this test's two
specific scans (all 4 real Drayton candidates shared the same
subtype). What it *does* fix going forward: any future Trainer-card
scan where distinguishable subtypes exist among same-name candidates
(e.g. an Item vs. a Supporter sharing a name) will now use that signal
instead of silently discarding it. Needs a live Trainer-card scan
where that scenario actually applies to confirm in practice. The
deeper tie-break design question (same-subtype same-name printings)
remains open — see ROADMAP.md.

## Tests #54-60 (2026-08-30, 7 scans reported together from screenshots; #60 root-caused via real Vercel logs below)

User shared 7 panel screenshots from a live `cavemancraw` stream with one
explicit correction: "The Porygon e-reader was incorrect." No other card
was flagged as wrong, but for the rest we only have "no complaint raised,"
not an explicit ground-truth confirmation — logged as such rather than
marked PASS, per the project's own honesty-over-guessing principle.

| # | Date | Card shown | Set | Read/Match | Stamp | Price | Notes |
|---|---|---|---|---|---|---|---|
| 54 | 2026-08-30 | Roaring Moon ex - 262/182 | SV04: Paradox Rift | High/High | none | Holofoil $5.88 | No issue reported. |
| 55 | 2026-08-30 | Mega Lucario ex - 033 (Japanese, メガブレイブ) | ME: Mega Evolution Promo | High/High | none | Holofoil $12.16 | No issue reported. |
| 56 | 2026-08-30 | Marshadow - shown as "146/132" | ME01: Mega Evolution | High/Low | none | Holofoil $13.57 | Ambiguous-match warning fired: banner says the actual Gemini read was card number **"204/197"**, i.e. the title/header shows the *matched candidate's* number while the warning shows the *read* number — same pattern as test #9, working as designed, not a bug. No ground truth given for which number is correct. |
| 57 | 2026-08-30 | Crobat VMAX | Shining Fates | High/High | none | Holofoil $1.61 | No issue reported. |
| 58 | 2026-08-30 | Grimsley's Move - 120/094 (Trainer/Supporter) | ME02: Phantasmal Flames | High/High | none | Holofoil $1.08 | **First live Trainer-card scan since the subtype-extraction fix (commit `d589d46`, deployed 2026-08-30) that wasn't flagged as wrong.** Clean High/High match with no ambiguous-tie warning. Doesn't fully confirm the fix was decisive (don't know from a screenshot alone how many same-name candidates existed or whether subtype broke a tie), but it's a real data point for the "Open: Trainer/Supporter same-name tie-break" question in CLAUDE.md — worth pulling logs on a future Trainer scan to see the subtype signal actually firing. |
| 59 | 2026-08-30 | Mega Heracross ex - 108/094 | ME02: Phantasmal Flames | High/High | none | Holofoil $1.89 | No issue reported. |
| 60 | 2026-08-30 | Porygon2, **Aquapolis, 028/147** (English, WotC e-Card era, "Hypnotic Ray" attack, HP 70) — ground truth confirmed live against PPT's own API, see below | Matched to **Great Encounters** (a Diamond & Pearl-era set with no e-Reader strip) | High/Low | none | Normal $2.80 | **FAIL, per explicit user correction** ("The Porygon e-reader was incorrect"). Root-caused via real Vercel logs, then ground-truth-confirmed via a live scoped PPT API query — see below. **Confirmed: genuine PPT crowding-out gap, not a nonexistent card or a bad Gemini read** — Gemini's read was fully correct. |

### Test #60 root cause — CONFIRMED via real Vercel runtime logs (2026-08-30)

```
[identify] Gemini read: cardName="Porygon2", cardNumber="28/147", hp="70", attackName="Hypnotic Ray", setName=null, confidence=High
[lookup] search=Porygon2 language=English — page 1: 30 candidates, page 2: 30 candidates, merged/deduped: 17
[lookup] combined name+number search "Porygon2 28/147" — raw candidate count = 0
[lookup] NO NUMBER MATCH IN POOL: read number=28/147 matches nothing anywhere in the fetched pool
[lookup] best = "Porygon2" 49/106 (Great Encounters), bestScore=6, tieCount=4 — landed here purely on secondary signals (hp+attackName), not the number
```

Same failure class as tests #35 (Zoroark/White Flare), #37 (Tyranitar),
and #49 (Eevee SVP 173): the read number ("28/147") never appeared in
any of the three search passes (page 1, page 2, combined name+number) —
a genuine **PPT catalog-coverage/crowding gap** on a common species
name, not a scoring or matching-code bug. All three of PPT's own search
fallbacks executed correctly and still came back empty for this number.

### Ground truth confirmed live — CORRECTED from the initial Skyridge hypothesis (2026-08-30)

The "/147" total-set-count reasoning was right in spirit but named the
wrong specific set. Live queries against PPT's own API (`.env.local`
created locally, key confirmed loaded, never committed — see
"`.env.local` now exists locally" below) found:

- `search=Porygon2&setName=Skyridge` → **0 results**. Sanity-checked the
  param itself works (`search=Xatu&setName=Skyridge` → 2 real results),
  and confirmed **PPT's catalog has zero Porygon-line cards of any kind
  under Skyridge** (`search=Porygon&setName=Skyridge` → 0 results). The
  Skyridge-specific hypothesis was simply wrong.
- **Real reason /147 wasn't unique to Skyridge**: Aquapolis, the *other*
  e-Card-era set with a matching e-Reader dot-code strip, *also* totals
  147 cards. An unscoped `search=Porygon2` page-2 dump (offset=30,
  matching the app's own real pagination) turned up two Aquapolis
  Porygon printings at `103a/147`/`103b/147` — confirming both sets
  legitimately share that denominator, so "/147 → Skyridge" was never a
  unique inference to begin with.
- **`search=Porygon2&setName=Aquapolis` → exact match, ground truth
  confirmed**:
  ```json
  { "name": "Porygon2", "cardNumber": "028/147", "setName": "Aquapolis",
    "hp": "70", "attacks": ["[2] Hypnotic Ray (20) ..."], "rarity": "Rare" }
  ```
  Every field (`name`, `cardNumber` → normalizes to 28/147, `hp`,
  attack name) matches Gemini's read exactly. **Gemini's read was
  entirely correct on this scan** — the miss is 100% on the lookup/
  matching side, a genuine PPT crowding-out gap: a real, correctly
  cataloged card that PPT's default relevance-sorted search never
  surfaces within 60 merged Porygon2-name candidates (page 1 + page 2),
  crowded out by dozens of Porygon/Porygon-Z promo and modern-set
  variants.

### Open design question — NOT built, needs explicit sign-off

Given ground truth is confirmed and the card genuinely exists in PPT's
catalog, a **4th search-fallback tier** — "read number's denominator
matches a known set's total card count → scope the search to that set,"
the same shape as test #49's combined name+number fallback — is worth
considering. Real complexity worth weighing before building it:

1. **The denominator isn't unique to one set.** This exact case (147)
   collides between Aquapolis and Skyridge — a real fallback would need
   to try multiple candidate sets per denominator, not assume a 1:1
   mapping.
2. **PPT provides no queryable `totalSetNumber`.** Every card record
   returned had `"totalSetNumber": null` — there's no live field to
   join against; this would require a hardcoded static map of
   `{total count → [known set names]}`, maintained by hand and prone to
   going stale as new sets release.
3. **Cost**: each candidate set in the map adds one more PPT search
   call (credits + latency) to an already-multi-step fallback chain
   (page 1 → page 2 → combined name+number → this).

Flagging for a deliberate decision, not shipping speculatively — see
CLAUDE.md's "Recent / in-flight work" for the same note.

## Still outstanding (as of 2026-08-30, see CLAUDE.md for current state)

- Hitmontop, Cinccino, Snorlax (tests #43-45): can only be re-verified
  opportunistically if those specific cards come up again on stream.
- Ditto (test #42): rescan to confirm LP now shows in the real ~$6-8
  range.
- Snorlax's possible number-mismatch (test #45): needs a clean rescan.
- The name+number combined search fallback: confirmed executing correctly
  in production (test #50), but hasn't yet had a case where a real,
  findable number was actually missing from the pool. Test #60
  (Porygon2) is now a second confirmed case of that same fallback
  executing correctly and still coming back empty — a genuine
  catalog-coverage gap, not a fallback bug.
- Trainer/Supporter tie-break question (test #53/#58): test #58
  (Grimsley's Move) is one clean-looking data point since the
  subtype-extraction fix deployed, but not confirmed decisive without
  logs — needs a Trainer-card scan where multiple same-name candidates
  with genuinely different subtypes are pulled, then checked via logs
  that the subtype signal actually broke the tie.
- **Test #63's name-filter rescue-path fix (NEW, 2026-08-30/31)**:
  deployed (`dpl_2hK8UGLwx2kMMkxHuhCZTSsjooBz`, commit `6708bca`) and
  build/live-endpoint/runtime-log verified, but has not yet been
  exercised by any real scan — needs a live rescan that actually hits
  the targeted path (zero name-filter survivors + a legible cardNumber)
  to confirm it works in production. Watch for the `ambiguousNote`
  disclosure text ("this match was found using only the card number...")
  or the `[lookup] NAME FILTER RESCUED BY NUMBER` log line as the signal
  this fix fired. Gemini's underlying mistranslation problem (the reason
  test #63 hit this path at all) remains separately unsolved.

## Research: options to improve Gemini scan consistency (2026-08-29)

Prompted by test #50's severity. Read Google's current Gemini API docs
directly before proposing anything:

1. **Explicitly set `generationConfig.media_resolution = "MEDIA_RESOLUTION_HIGH"`.** Free/negligible cost, may be a no-op for gemini-3.6-flash specifically (unspecified may already equal HIGH per the docs) but removes reliance on an undocumented default.
2. **Raise `thinkingLevel` from `minimal` to `low`.** A real documented middle step; should cost less than the 400-600 thinking-token `medium` default. Needs real timing measurement to confirm it stays inside the 2-5s target.
3. **Dual-frame capture in one request.** Capture two frames, send both in the SAME Gemini call, cross-check. Targets the actual "one bad exposure" failure mode directly — not yet built.
4. **Prompt tightening** — explicit instruction to only report a field if literally visible, prefer null over inventing content. Free, unproven.
5. **True self-consistency** (call Gemini twice, compare). Most robust in theory, least proven, most expensive.

**Recommendation, approved and partially shipped**: options 1+2 shipped
2026-08-30 (uncommitted at the time of the CLAUDE.md migration — see
CLAUDE.md "Recent / in-flight work"). Option 3 (dual-frame) is the most
structurally promising follow-up if 1+2 don't move the needle. Options 4
and 5 remain lower priority.

## Research: additional scoring/matching signals beyond number/hp/subtype/set/attackName/stampType (2026-08-30/31)

Prompted by wanting to know if any other card traits are worth adding as
tie-break signals, especially for the Trainer/Supporter tie-break gap
(test #53) — Trainer cards structurally lack HP/attackName/subtype
discrimination today. Investigated via live PPT API queries (not
assumption) and a source-code check of what's actually scored today, per
this project's standing "verify, don't guess" convention. **Findings
below are a write-up of an open decision — nothing built.**

### 1. `weakness` / `resistance` / `retreatCost` — reliably populated, but genuinely useless for the failure classes this project actually has

Live-checked across 4 species/eras (Pikachu, Charizard, Magikarp, Ditto,
~60 real candidate records): `weakness` and `retreatCost` are populated
on essentially every Pokémon-type candidate; `resistance` is frequently
either a real value or a genuine "None" (not missing data, an actual
game fact), with some real gaps.

**But**: checked directly against the real tie set from test #61
(Chien-Pao ex, 8 candidates genuinely tied on HP/attack/subtype) — every
single one shares the *identical* `weakness` ("Mx2") and `retreatCost`
("2"). This isn't a coincidence: weakness/resistance/retreat cost are
fixed by a card's exact game text, the same text that already determines
HP and attack — so within any group that already ties on HP+attack
(the actual recurring failure mode in this project's history, e.g. tests
#9/#12/#14/#15/#19/#20/#61/#65), these fields will essentially always be
identical too. Reliably populated ≠ useful signal here.

**Also**: confirmed all three are structurally `null` for every real
Trainer/Supporter candidate checked (Drayton, test #53's own case) —
this is a TCG game-rules fact (only Pokémon cards have weakness/
resistance/retreat cost), not a PPT data gap. **Zero help for the
Trainer/Supporter tie-break gap specifically.**

**Verdict: not worth adding.**

### 2. `artist` — real signal sometimes, too unreliable on both ends to trust

Live-checked: roughly 40-60% populated across a spot sample (much
sparser on promo-heavy pools — many `null`). Does occasionally differ
*within* a real tie group (test #61's Chien-Pao ex: 261/193 = "kodama"
vs the 061/193 reprints = "CG Works" vs several `null`), so it's not
purely redundant like weakness/retreat. But two independent reliability
problems stack: (a) PPT's own coverage is spotty even when the signal
would help, and (b) the on-card artist credit is small printed text —
a much higher-risk OCR ask for a live video-frame capture than
`cardNumber`/`hp`, which this project's own history (Gemini
read-instability, tests #23/#35/#45/#50/#63) already shows Gemini
struggles with on *easier* text. Gemini also isn't currently asked for
this field at all.

**Verdict: not recommended without further work** — real but weak on
both the data-coverage and Gemini-legibility axes.

### 3. `rarity` — the one genuinely promising candidate; a real dead-signal bug, same class as the historical `attackName`/Trainer-subtype fixes

Live-checked: `rarity` was populated on **100% of every real candidate**
pulled across every query this session (Pikachu/Charizard/Magikarp/
Ditto/Chien-Pao ex/Drayton — dozens of records, zero nulls). Source-code
check (`grep -n "\.rarity" api/identify.js`) confirms **zero references
anywhere in the codebase** — `normalizePptCard` doesn't even copy it
onto the normalized candidate object, despite it being fetched on every
single lookup already, at zero extra API cost. This is the exact same
"reliably-present-in-data-we-already-have, silently unused" pattern as
the historical `attackName` bug (test #33-ish) and the Trainer-subtype
bug (test #53) — both real, both previously fixed.

**Does it actually break ties the current signals can't?** Checked
against the real test #61 tie set: the 8 tied Chien-Pao ex candidates
carry rarities of Hyper Rare / Special Illustration Rare / Ultra Rare /
Double Rare (×4, correctly — those four are literal duplicate reprint
rows for the same nominal 061/193 printing) — genuinely discriminates
most of an otherwise-fully-tied group.

**Critically, for the Trainer/Supporter gap specifically** (test #53):
rarity is the ONE reliably-populated field left unused for Trainer
cards, since weakness/resistance/retreatCost/energyType are all
structurally null there. Checked against the real Drayton tie set (test
#53's own case): rarity populated on 3 of 4 real candidates
(Special Illustration Rare / Ultra Rare / Uncommon / Special Illustration
Rare) — discriminates 2 of the 4 from each other and from the SIR pair,
though the two Special Illustration Rare printings (different sets)
still share it, so this is a real, meaningful partial improvement, not
a complete fix on its own.

**Can Gemini plausibly read it?** Gemini isn't currently asked for
rarity at all. Unlike a literal tiny rarity *symbol* (a small corner
icon) or the regulation mark below, the *rarity tier itself* corresponds
to dramatically different visual card treatments in modern Pokémon TCG
(full-art vs. extended-art vs. plain small-art border) — plausibly a
much easier, more holistic visual read than fine print, similar in kind
to how Gemini already reads `stampType`. This is a plausibility argument
only, not a confirmed one — **would need a live-scan check of Gemini's
actual read reliability before trusting it**, same as every other new
signal added to this project historically.

**Verdict: worth a deliberate build decision.** Two separable pieces:
(a) start scoring on `rarity` using data already fetched today, zero new
Gemini prompt/schema change, zero extra API cost — the safer, more
contained piece; (b) additionally ask Gemini to read/infer rarity from
the frame, which needs live-scan validation of read reliability before
being trusted as a scoring input. Not built — flagging for sign-off.

### 4. `energyType` — same conclusion as weakness/retreat: reliably populated, but redundant for the failure classes this project has

Live-checked: consistently populated for Pokémon-type candidates
(structurally `null` for Trainer cards, same as weakness/etc). Checked
directly against the test #61 tie set: all 8 tied Chien-Pao ex
candidates share identical `energyType: ["Water"]` — again, same root
cause as weakness/retreat (a Pokémon's elemental type is tied to its
game text, which is what already determines the existing HP/attack tie
group). A genuine exception exists for classic-era "Delta Species" cards
(confirmed live: "Charizard (Delta Species)" carries `energyType`
`"Lightning Metal"` instead of the expected Fire) — but this is a
narrow, decades-old niche mechanic from one specific 2005 set line, not
relevant to the failure classes actually tracked in this project's test
log.

**Verdict: not worth adding** — same redundancy problem as
weakness/resistance/retreatCost, for the same underlying reason.

### 5. Regulation mark — hard dead end, confirmed via PPT's own schema, not assumed

Dumped every field PPT's raw card record actually contains (`jq '.data[0]
| keys'` on a live query): `artist, attacks, cardNumber, cardType,
createdAt, dataCompleteness, energyType, externalCatalogId, flavorText,
hp, id, imageCdnUrl*, name, needsDetailedScrape, pokemonType, prices,
printingsAvailable, rarity, resistance, retreatCost, setId, setName,
stage, tcgPlayerId, tcgPlayerUrl, totalSetNumber, updatedAt, variants,
weakness` — **no field resembling a regulation mark exists anywhere in
PPT's schema.** This settles the question regardless of how reliably
Gemini could read the small corner letter from a live video frame (a
real, separate risk the user flagged, and one worth taking seriously
given this project's documented history of small/subtle-detail read
failures) — there's nothing in PPT's data to match it against even with
a perfect read.

**Verdict: dead end. Not worth pursuing** unless PPT adds this field to
their own API in the future.

### Summary table

| Trait | PPT population | Redundant with existing signals? | Helps Trainer/Supporter gap? | Gemini currently asked? | Verdict |
|---|---|---|---|---|---|
| weakness/resistance/retreatCost | High (Pokémon only) | Yes — always ties with HP/attack | No (always null on Trainer) | No | Not worth adding |
| artist | ~40-60%, spotty | No, but unreliable both ways | Unclear, too sparse to test | No | Not recommended yet |
| **rarity** | **100% in every sample** | **No — genuinely discriminates** | **Yes — only usable signal left for Trainer cards** | No | **Worth a build decision** |
| energyType | High (Pokémon only) | Yes — always ties with HP/attack | No (always null on Trainer) | No | Not worth adding |
| regulation mark | **Not in PPT's schema at all** | N/A | N/A | No | Dead end |

## Fix shipped: `rarity` as a scoring signal — DEPLOYED 2026-08-31, partial answer to the test #53 Trainer/Supporter tie-break question

Per explicit sign-off, implemented option (a) from the research above:
score on `rarity` data already fetched on every lookup, no new Gemini
prompt/schema change.

**What shipped**: `SCORE.rarity = 2` — the smallest weight in `SCORE`,
below every other signal including the previously-softest one (`set: 3`)
— so it can never on its own outweigh a single real matched signal, let
alone override an actual number/hp mismatch. `NOTABLE_RARITY_PATTERN` is
a small allow-list of rarity-tier strings confirmed via live PPT queries
this session (Double Rare, Hyper Rare, Illustration/Special Illustration
Rare, Secret Rare, Shiny Holo Rare, Ultra Rare, Prism Rare, Radiant
Rare, Rare BREAK, Mega Attack Rare) — deliberately opt-in rather than a
deny-list of "ordinary" tiers, since new rarity names get invented most
sets (this session's own live sweep surfaced "Mega Hyper Rare"
unprompted). Architecturally different from every other `scoreCandidate`
signal: it's a candidate-side-only prior (no `read.x` comparison exists,
since Gemini was never asked to read rarity), grounded in this project's
own test history — virtually none of 66+ real test cases are plain
Common/Uncommon pulls.

**Verified against the real test #53 Drayton tie set** before deploying
(via a local Node script running the actual `scoreCandidate`/
`pickBestCandidate` functions, not just reasoning about it): a fresh
live re-pull of the same 4 real candidates (Special Illustration Rare /
Ultra Rare / Uncommon / Special Illustration Rare), with subtype scoring
isolated as a control (one candidate's PPT record was independently
missing `pokemonType`, an unrelated data-completeness quirk patched out
to avoid confounding the test) — rarity alone narrows bestScore/tieCount
from 5/4 to 7/3. Confirms the design goal exactly: **helps narrow this
real tie, does NOT fully resolve it** — the two Special Illustration
Rare printings (different sets) remain genuinely tied, so this is a
**partial answer**, not a fix, to the structural issue that Trainer
cards have fewer independent tie-break signals than Pokémon cards. That
structural gap remains open — see the ROADMAP.md checklist item.

**Deploy discipline**: same chunk-read/scratch-file/hash-verify process
as test #60/#63's fixes, given the file is 91-97KB and grew again this
session. **The exact same diacritic-regex transcription corruption
from the test #63 deploy recurred a THIRD time** during this
deploy's own hash-verify step (caught before deploying, fixed via the
same mechanical non-generative copy-from-source technique) — confirming
this is a systemic, reproducible failure in how manual retyping handles
this specific byte sequence, not a one-off fluke. See "Deploy-
verification tooling" below for the real fix built in response.

Deployed (`dpl_FpQNxCVS1P1YiDrtLif8ViGsbgKv`, commit `d941eb8` +
comment-accuracy correction `d35ddc6`) — build/live-endpoint verified per
CLAUDE.md's deploy checklist (`READY`, 3 files, live `400
{"error":"Missing imageBase64"}`). Confirmed working on real live
traffic immediately after: runtime logs show several real scans served
cleanly on this exact deployment, including "Roxie's Performance" (a
Trainer/Supporter card) correctly discriminating 3 same-name printings
by number+rarity (`rarity` now appears in every `[lookup] scored
candidates=` log line).

**Not yet confirmed**: needs a live rescan of an actual ambiguous
Trainer-card tie (zero number/hp signal, multiple same-name candidates)
to see the rarity signal narrow a real tie in production, not just in
the isolated Drayton re-test above.

## Deploy-verification tooling: GET debug endpoint — DEPLOYED 2026-08-31, closes the diacritic-regex open question from test #63

The rarity-signal deploy above hit the SAME diacritic-regex
transcription corruption as test #63's deploy, for a third time, with no
way at the time to confirm the final attempt didn't repeat it (no
Vercel MCP tool can fetch deployed source for a byte diff against
local — confirmed genuinely absent this session, though Vercel's own
REST API does have `GET /v8/deployments/{id}/files/{fileId}` for this,
gated behind a personal access token this session doesn't have).

**What shipped**: `GET /api/identify` (previously unused — the real
extension only ever POSTs an image, so this adds zero behavioral risk to
production scans) now returns `{ ok, sourceHash, normalizeDiacriticTest
}`. `sourceHash` is a runtime `sha1` of `__filename`.
`normalizeDiacriticTest` runs the ACTUAL deployed `normalizeNameForMatch`
against a fixed input (`"Pokémon Collector"`) — the correct value is
exactly `"pokemon collector"`.

**Deployed and tested live** (`dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec`, commit
`194facb`): `GET https://whatnot-pokemon-identify.vercel.app/api/identify`
returned:
```json
{"ok":true,"sourceHash":"c6cd14b416280d19e536449eed0c4eaa3a11f2ad","normalizeDiacriticTest":"pokemon collector"}
```

**`normalizeDiacriticTest` is exactly correct — this is a direct,
live, behavioral confirmation that the diacritic-stripping regex
deployed correctly**, closing the open question from test #63/this
session's rarity deploy without needing to wait for a Pokémon
Collector-style card to come up live on stream.

**Real finding, honestly reported**: `sourceHash` did **NOT** match the
local `shasum -a 1 api/identify.js` (`85e51bf5...` local vs.
`c6cd14b4...` live), even though the file was confirmed byte-identical
to source before deploying (hash-verified pre-deploy, same as every
other fix this session) and `node -c`/local behavior both checked out.
Investigated rather than dismissed: local file has no CRLF, no trailing-
byte anomaly, clean `};\n` ending — ruling out an obvious local cause.
The most likely explanation is that Vercel's own Node.js function build
pipeline (bundling via `@vercel/node`, even with `"framework": null` and
no custom build command) transforms the file in some way before it's
what `fs.readFileSync(__filename)` actually reads at runtime — meaning
`sourceHash` reflects the **post-build bundle**, not the raw uploaded
source, so it can *not* be directly compared against a local `shasum` as
originally intended. This is a real limitation of the tool as built, not
a deploy failure — the `normalizeDiacriticTest` behavioral check is
unaffected by this and remains the reliable, decisive signal. **Open
follow-up, not urgent**: correct the code comment (currently overclaims
a "one-line comparison against local shasum") next time this file is
touched — not worth a dedicated deploy on its own given how fragile this
file's manual-deploy process has already proven to be this session.

## Tests #61-66 (2026-08-30, 6 scans from `blorgotron`'s stream, root-caused via real Vercel logs + live PPT API queries)

User reported "a lot of incorrect scannings" across 6 screenshots with no
specific ground truth given. Investigated via real Vercel runtime logs
(matching the exact scan timestamps) plus live PPT API queries (using the
new local `.env.local`) rather than guessing from the screenshots alone.
**Result: 2 of 6 are confirmed correct, 3 of 6 are the system honestly
flagging genuine ambiguity/gaps (working as designed, not bugs), and 1 of
6 is a real, new, previously-undocumented failure class.**

| # | Date | Card shown | Gemini read (from logs) | Verdict |
|---|---|---|---|---|
| 61 | 2026-08-30 | Chien-Pao ex - 274/193, SV02: Paldea Evolved | `cardNumber: null` (both repeat scans identical) | **No bug.** 8 real PPT candidates share identical HP/attack/subtype ("ex", 220 HP, "Hail Blade") differing ONLY by number (274/193 down to 061/193) — a genuine holo-glare legibility miss, not a code issue. Low confidence + explicit warning shown correctly. |
| 62 | 2026-08-30 | Eternatus V, SWSH03: Darkness Ablaze | `cardNumber: "116/189"` (both scans identical) | **Confirmed correct.** Exact match against a real PPT candidate (SWSH03: Darkness Ablaze, 116/189), clean score, no warning. |
| 63 | 2026-08-30 | "AZ's Comfort" / "AZ's Solace" (Japanese Supporter) | 3 different reads across repeat scans: `"AZ's Solace"`/null, `"AZ's Comfort"`/null, `"AZ's Solace"`/"087/066" | **FAIL — real, new root cause, see below.** |
| 64 | 2026-08-30 | Quaquaval ex - 260/193, SV02: Paldea Evolved | `cardNumber: "260/193"` (both scans identical) | **Confirmed correct.** Exact match (SV02: Paldea Evolved, Hyper Rare), bestScore=35, tieCount=1, no warning. |
| 65 | 2026-08-30 | Mega Darkrai ex - 120/084, ME05: Pitch Black | `cardNumber: null` (both scans identical) | **No bug.** Same shape as #61 — 4 real candidates tied on HP/attack/subtype, differing only by number, genuinely unreadable this scan (foil glare). Low confidence + warning shown correctly. |
| 66 | 2026-08-30 | Tauros (Mirror Holo), Japanese, shown as "Start Deck 100 Battle Collection" | `cardNumber: "172/165"` (both scans identical) | **No code bug — same class as #35/#37/#49/#60.** Full fallback chain executed correctly (page 1: 30 + page 2: 26 = 56 merged candidates, then combined name+number search "Tauros 172/165") and genuinely found nothing — "172/165" doesn't exist anywhere in PPT's Tauros catalog. Real PPT does carry OTHER "/165"-denominator Tauros prints (128/165, 3 pattern variants) — worth noting as a real coverage gap, not proof Gemini misread the number. |

### Test #63 root cause — CONFIRMED via real Vercel logs + live PPT API queries (2026-08-30): a new failure class, distinct from every prior documented one

Real log trace (3 repeat scans of the same physical card, ~30s apart):

```
[identify] Gemini read: cardName="AZ's Solace",  cardNumber=null,        language=Japanese
[lookup]   search=AZ's Solace  language=Japanese  raw candidate count=30  sample=[Alakazam V - 105/100, ...]
[lookup]   zero candidates survived the name filter for name= AZ's Solace

[identify] Gemini read: cardName="AZ's Comfort", cardNumber=null,        language=Japanese
[lookup]   search=AZ's Comfort language=Japanese  raw candidate count=30  sample=[Alakazam V - 105/100, ...]
[lookup]   zero candidates survived the name filter for name= AZ's Comfort

[identify] Gemini read: cardName="AZ's Solace",  cardNumber="087/066",   language=Japanese
[lookup]   search=AZ's Solace  language=Japanese  raw candidate count=30  sample=[Alakazam V - 105/100, ...]
[lookup]   zero candidates survived the name filter for name= AZ's Solace
```

**Live PPT API verification** (`search=` queries run directly against
`pokemonpricetracker.com/api/v2/cards`, not from logs):

- `search=AZ's Comfort` / `search=AZ Comfort` (with `language=japanese`)
  → 30 results, but **every one is unrelated filler** (Alakazam V,
  Rayquaza, Zamazenta — none contain "AZ" as a substring). Confirmed
  PPT's search endpoint does NOT return an empty array when a multi-word
  query matches nothing — it silently falls back to unrelated results. A
  narrower `search=AZs Comfort` (apostrophe removed as a contraction) and
  `search=Comfort` alone both correctly returned 0.
- `search=AZ` alone (bare) → exactly 4 real, correct "AZ" (the Trainer
  character) cards. Confirms the search endpoint filters correctly on
  short/single-token queries.
- `search=AZ's` → **3 real results, all named "AZ's Tranquility"**
  (`M4: Ninja Spinner`, Japanese, numbers 118/083, 108/083, 075/083). A
  broader unscoped search for `"AZ's Tranquility"` also surfaced 3
  English-market printings (`ME04: Chaos Rising`, 120/086, 106/086,
  076/086 — the English-set counterpart of the Japanese `M4` set).

**Real root cause, confirmed**: PPT's actual card name for this printing
is **"AZ's Tranquility"** — a name Gemini never produced in 3 attempts
("Solace" twice, "Comfort" once). This is a genuine **English-translation
mismatch**: the card has no widely-known official English name (Japan-
market Supporter), so Gemini is inventing its own plausible translation
of the Japanese text each time, and none of its 3 guesses happened to
match PPT's actual chosen translation. The app's own name filter
(`normalizeNameForMatch(c.name).includes(wantedName)`) correctly rejected
every attempt — it did NOT get fooled by the unrelated 30-result filler
PPT returned — so the honest "couldn't confidently match" message shown
to the user was the right call given what the pipeline had to work with.
**Note**: none of the 6 real "AZ's Tranquility" printings found (3 JP +
3 EN) have the denominator "066" that Gemini read on attempt 3
("087/066") — so even a perfect name match wouldn't have resolved this
scan; that specific read is either a misread (glare/instability, same
tracked concern as tests #23/#35/#45/#50) or a printing PPT doesn't
carry. Ground truth for the *exact* printing is not fully confirmed —
only the real card *name* is.

**A real architectural gap, confirmed by reading `lookupCardPPT` in
`api/identify.js`**: when the name filter yields **zero** survivors
(`filtered.length === 0`, `api/identify.js:1073-1076`), the function
returns `{ notFound: true }` immediately — this happens **before** the
page-2 pagination fallback and the combined name+number search fallback
(both further down, gated on `best` existing, i.e. on at least one
candidate having survived the name filter). So even on the 3rd scan,
where Gemini read a specific, legible card number ("087/066"), that
number was never used at all — the wrong translated name killed the
lookup before number-matching ever had a chance to run. This is a
different failure point than every previously-documented crowding/
coverage-gap case (#35/#37/#49/#60/#66 above), which all fail *after*
clearing the name filter.

### Fix shipped — number-scoped rescue path, DEPLOYED 2026-08-30/31 (`dpl_2hK8UGLwx2kMMkxHuhCZTSsjooBz`)

Per explicit sign-off, scoped narrowly to exactly the architectural gap
above (item (1) from the design write-up) — deliberately NOT attempting
anything for Gemini's mistranslated-name problem itself (item (2),
remains open/unsolved, see below).

**What shipped**: in `lookupCardPPT` (`api/identify.js`), when
`filtered.length === 0` (zero name-filter survivors) AND a legible
`read.cardNumber` exists, try ONE combined name+number search (same
query shape as the existing combined-search fallback), then filter the
raw results **strictly by exact number match on the raw `cardNumber`
field — never by name, and never trusting a nonzero raw count** (per the
live-confirmed PPT filler-result quirk from this test). If that finds a
match, an honest disclosure note fires (caps confidence at Medium,
explicitly tells the user the name never matched, only the number did).
If no cardNumber was read, or the rescue search still finds nothing,
behavior is byte-for-byte unchanged from before: `{ notFound: true }`.
Purely additive — doesn't touch the page-2/combined-search fallbacks
used once a candidate already clears the name filter, so no regression
risk to the crowding-gap cases those already handle (tests
#35/#37/#49/#60/#66).

**Deploy process**: file is 91KB/1700 lines — too large to safely
transcribe in a single pass per this project's established large-file
discipline. Read in 4 verified chunks, reconstructed to a local scratch
file, and hash-compared against the real source (`sha1
1d9c2d5bcd8512afc45fe6860d6b33468e3e9c23`) *before* deploying — this
caught a real transcription error (the diacritic-stripping regex got
mangled into literal Unicode combining characters on the first attempt),
fixed via a direct non-generative copy from the verified source (Python
line-replace, not retyped), then re-verified hash-identical before
the actual deploy. Confirmed: deployment state `READY`, aliased to
production; build log confirms exactly 3 files downloaded; live `POST
/api/identify {}` returns the real `400 {"error":"Missing
imageBase64"}` (not a stub); runtime logs confirm that exact request was
served by `dpl_2hK8UGLwx2kMMkxHuhCZTSsjooBz`. A real live scan
(Riolu, GG26/GG70, Crown Zenith Galarian Gallery) also came through
cleanly on this exact deployment moments after shipping — confirms the
deploy isn't broken generally, though it's not a scan of the specific
rescue-path scenario this fix targets.

**Not yet confirmed**: needs a live rescan that actually hits the
targeted path — zero name-filter survivors AND a legible cardNumber.
"AZ's Tranquility" itself won't retest cleanly (Gemini's translation
problem is untouched, so it may or may not read a number at all on a
future attempt) — needs either that exact card recurring on stream, or
another card that hits the same failure shape (wrong/unmatched name +
legible number).

**Left alone, per explicit instruction**: item (2) — getting Gemini to
converge on PPT's actual chosen translation for untranslated Japanese
card names — remains unsolved, with no proposed design. Not attempted
this round.

## Test #67 — Froakie (056/197, Cosmos Holo?): real logs contradict the panel's own warning text — two distinct, confirmed findings (2026-08-31)

User flagged a live scan (`poke_yak`'s stream) and asked "what happened
here?" from a screenshot alone. Panel showed: Read=High, Match=Low,
matched "Froakie - 056/197 (Cosmos Holo)", Market (Holofoil) $0.75, with
the generic ambiguous-match warning ("Multiple different printings of
this card share identical HP, attack, and type — the card number is the
only thing that tells them apart, and it wasn't legible this scan.").

**Process note**: the first answer given in chat, based on the
screenshot alone, called this "normal, correct behavior, not a bug" —
without pulling logs first. That's a direct violation of this project's
own standing convention (verify via real logs before concluding
anything — CLAUDE.md "Standing working conventions" #1, now reworded to
close this gap explicitly). Pulling the real Vercel logs for this exact
scan (`dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec`, the current production
deployment, UTC 2026-09-01T01:02:16Z–01:02:32Z — 4 repeat scans of the
same physical card, ~16s apart) showed the screenshot-only explanation
was wrong on two separate, confirmable counts.

**Finding A — the warning text's own claim ("wasn't legible this scan")
is false for what actually happened.** Gemini reported `confidence:
"High"` and a specific, non-null `cardNumber` on all 4 scans — never
"illegible" or null. But the number was different, and wrong, every
single time:

| Scan (UTC) | Gemini `cardNumber` read | Confidence |
|---|---|---|
| 01:02:16 | `056/066` | High |
| 01:02:23 | `056/066` | High |
| 01:02:27 | `056/086` | High |
| 01:02:32 | `056/064` | High |

None of the 4 reads equals `056/197` — the number of the candidate the
panel actually displayed. Every read shares the numerator "056" but the
denominator is wrong and inconsistent across repeats — never matching.
Same class of read-instability as tests #50/#63, and this scan ran on
the deployment that already includes the `thinkingLevel`/
`media_resolution` consistency fix (commit `3e895b1`, still present in
the code as of `dpl_41kEm9oM4u4gAMQsM3CDJtnkHdec`). This is a real, live
data point for that fix's still-open "needs live confirmation" status
(see CLAUDE.md "Immediate next step") — and on this card it's an
unfavorable one: the fix did not produce a stable, consistent number
read across 4 back-to-back scans of the identical physical card. One
hard card is not proof the fix doesn't help in general, but it's real
evidence, not a clean confirmation.

**Finding B — a genuine, un-shipped code bug: `numbersMatch()`'s
partial-credit "totalMismatch" branch masks a real non-match from the
more accurate warning path, so the misleading generic message fires
instead.** Traced through `api/identify.js`:

- `numbersMatch()` (`api/identify.js:394-417`) parses "056/066" (or
  /086, /064) against candidate number "056/197": same prefix (none),
  same numerator ("56"), but a different denominator/total ("66"/"86"/
  "64" vs "197"). This hits the `bothHaveTotal` branch
  (`api/identify.js:403-405`) and returns `{ match: true, points:
  SCORE.number * 0.7 = 14, strength: "totalMismatch" }` — **`match:
  true`**, even though these are not actually the same card number.
- That spurious `match: true` causes the more accurate warning check at
  `api/identify.js:1334-1352` ("No printing in our database has the
  exact card number that was read...") to be **skipped**, since it only
  fires when `numberMatchedForBest` is false.
- The score math confirms this exactly: `14` (totalMismatch number
  credit) `+ 6` (`SCORE.hp`, read HP "70" = candidate HP "70") `= 20`,
  matching the logged `bestScore= 20` precisely.
- Two raw PPT candidates for "Froakie" literally share the number
  "056/197" — `"Froakie - 056/197 (Cosmos Holo)"` (rarity Promo) and
  `"Froakie"` (rarity Common) — both score 20 identically, producing
  `tieCount= 2`, which falls through to the generic hardcoded
  `ambiguousNoteText()` (`api/identify.js:633-634`) — the "...wasn't
  legible this scan" text — because Finding A's more accurate branch
  never got the chance to fire ahead of it.

Net effect: the panel told the user the number "wasn't legible," when
the log-confirmed story is Gemini read a specific, high-confidence,
wrong number four different times, and the code's own partial-credit
logic for near-miss numbers silently absorbed that mismatch instead of
surfacing the more honest "no candidate has the number that was read"
message that already exists in the code for exactly this situation.
**Not yet fixed** — needs a design decision (should a "totalMismatch"
result still count as `match: true` for the Finding-A check, given a
differing denominator usually means a genuinely different printing/
set?). See CLAUDE.md "Recent / in-flight work" for the open item.

**Verdict**: two distinct, confirmed findings from real logs — a live
(unfavorable, one-card) data point on the still-open Gemini-consistency
question, and a real, un-shipped messaging bug in how the ambiguous-
match warning text is chosen when a "totalMismatch"-strength number is
involved. The underlying candidate shown (`Froakie - 056/197 (Cosmos
Holo)`, $0.75) is **not independently confirmed correct or incorrect**
— no ground truth was given for this card, and Gemini's own number
reads never matched it, so the match rests on name+HP alone. Treat this
as inconclusive on identification, confirmed on the messaging bug.

### Fix shipped: `numbersMatch()` "totalMismatch" no longer counts as a match — FIXED, DEPLOYED, AND CONFIRMED IN PRODUCTION 2026-08-31

Scoped narrowly to Finding B above only — deliberately leaves Finding A
(the Gemini read-instability observation) untouched as a passive
tracked data point; this fix does not and cannot address that, since
it's a Gemini vision-read issue, not a scoring bug.

**What changed** (`api/identify.js`, in `numbersMatch()`): the
`bothHaveTotal` branch used to return `{ match: true, points:
SCORE.number * 0.7, strength: "totalMismatch" }` whenever the numerator
matched but the total/denominator differed. Now returns `{ match:
false, points: 0, strength: "none" }` for that case — treated as no
match at all, the same as a numerator mismatch. A genuinely different
total normally means a genuinely different set/printing, not a
near-miss worth partial credit. The `neitherHasTotal` ("exact", both
bare promo-style numbers) and asymmetric ("weak", one side has a total
and the other doesn't) branches are **unchanged** — those are the
legitimate partial/coincidental-match cases from tests #18 and #23
respectively, a different situation from two candidates that both carry
totals and disagree on what they are. Re-read both original fix
comments before touching this function again; do not conflate the three
cases.

**Verification** (local, before any deploy — same discipline as the
rarity-signal fix in test #53):

1. **Unit-level**, calling the real (edited) `numbersMatch()` directly:
   - `numbersMatch("056/066", "056/197")` → `{ match: false, points: 0,
     strength: "none" }` (same for the "056/086" and "056/064" reads
     from the other 3 real test #67 scans) — confirms the bug case is
     fixed.
   - `numbersMatch("056/197", "056/197")` → `{ match: true, points: 20,
     strength: "exact" }` — a true exact match is unaffected.
   - `numbersMatch("052", "52/108")` (test #23's original case) → `{
     match: true, points: 7, strength: "weak" }` — unchanged, confirms
     no regression of the earlier fix.
   - `numbersMatch("SM91", "SM91")` (test #18's original case) → `{
     match: true, points: 20, strength: "exact" }` — unchanged.
2. **`scoreCandidate()` check**: the two real tied test #67 candidates
   (`Froakie - 056/197 (Cosmos Holo)` and `Froakie` 056/197, both HP 70)
   now score 6 each (HP match only) instead of 20 — the spurious 14-point
   number credit is gone from both.
3. **End-to-end against LIVE PokemonPriceTracker data** — the real,
   unmodified `lookupCardPPT()` was called (via a local harness that
   loads the actual `api/identify.js` source, not a reimplementation)
   with the exact Gemini read from the 2026-09-01T01:02:16Z test #67 log
   entry (`cardName: "Froakie"`, `cardNumber: "056/066"`, `hp: "70"`,
   `subtype: "Basic"`, `attackName: "Collect"`, `language: "English"`)
   against a live `search=Froakie&language=english` PPT fetch. The live
   fetch returned the **same 23-candidate raw pool** seen in the
   original production log (byte-for-byte matching sample), confirming
   this is a faithful replay, not a cherry-picked fixture. Result:
   ```
   [lookup] best= { name: 'Froakie - 088/086', number: '088/086', hp: '70',
     setName: 'ME04: Chaos Rising' } bestScore= 12 tieCount= 1
   [lookup] number still missing after page1+2 — trying combined name+number
     search= "Froakie 056/066"
   [lookup] combined name+number search raw candidate count= 0
   [lookup] NO NUMBER MATCH IN POOL: read number=056/066, language=English,
     best=Froakie - 088/086 088/086 (matched on other signals only)
   matchConfidence: Low
   ambiguousNote: No printing in our database has the exact card number that
     was read ("056/066") — this may be a set or promo PokemonPriceTracker
     doesn't track yet. Showing the closest match found on other details
     (HP/attack/set) as a rough estimate only; verify the exact printing
     before trusting this price.
   ```
   The spurious 056/197 tie is gone; the accurate "NO NUMBER MATCH IN
   POOL" warning fires instead of the misleading "wasn't legible"
   generic tie-break note. As a side benefit, the fix also let the
   page-2 → combined-search fallback chain run for this case (it
   correctly tried `"Froakie 056/066"` and correctly found nothing) —
   the old spurious `match:true` had been silently short-circuiting that
   chain (`stillMissingAfterPage2` was false whenever a totalMismatch
   candidate existed), so this is a secondary correctness improvement,
   not just a messaging fix.

**Not independently re-confirmed**: which candidate is the *actual*
correct Froakie printing for the real physical card in test #67 is
still unknown — no ground truth was ever given for that card, and this
fix doesn't change that; it only ensures the system is now honest about
not having a confident number match, instead of showing a specific
wrong-but-confident-sounding candidate under a false "illegible" excuse.

**Deployed 2026-08-31** after explicit user go-ahead (commit `42429a5`,
`dpl_DjjbNMqE5nHb45MGYb3Sjby6JXXB`, aliased to
`whatnot-pokemon-identify.vercel.app`). Deploy checklist followed in
full — real source read directly (not base64), transcribed to a scratch
file, **diff-verified byte-for-byte against the real source file before
deploying**. This caught a real transcription error on the first
attempt: the diacritic-stripping regex got rendered as literal Unicode
combining characters instead of the escape sequence `̀-ͯ` —
the exact same corruption class documented in test #63's deploy and the
GET-debug-endpoint commit. Fixed non-generatively (copied the correct
line directly from the real source via `sed`/Python, not retyped),
re-diffed clean, then deployed. Confirmed: deployment `READY`, aliased
to production; build log shows exactly 3 files downloaded; live `GET
/api/identify` returns `normalizeDiacriticTest: "pokemon collector"` —
direct behavioral proof the exact regex that almost got corrupted
deployed intact; live `POST /api/identify {}` returns real `400
{"error":"Missing imageBase64"}`; runtime logs confirm both were served
by the new deployment.

**CONFIRMED in production** — not just the synthetic checklist
requests. Runtime logs from minutes after deploy show a real, organic
live scan (Mega Excadrill ex, 2026-09-01T01:38:46Z) that read
cardNumber "111/108," matching neither of the 2 real PPT candidates
("103/084" Ultra Rare, "065/084" Double Rare). The log shows `NO NUMBER
MATCH IN POOL: read number=111/108 ... best=Mega Excadrill ex - 103/084
(matched on other signals only)` firing correctly — not the generic
"wasn't legible" tie-break note the bug would have produced. Different
card than the one that found the bug, but the same failure shape
(read number missing from the pool + a tie among the remaining
candidates) — satisfying this project's own "confirm via rescan"
standard (any card in the same failure class, not literally the same
physical card — see CLAUDE.md "Standing working conventions"). This fix
is fully confirmed, not just deployed.

## Research: latency and PPT rate-limit options (2026-09-01) — options only, nothing built

Two separate questions, kept separate below. Pulled from real Vercel
runtime-error data (`get_runtime_errors`, 7-day window — raw per-request
`[timing]` log lines were NOT available: this project is on Vercel's
Hobby-tier 1h log retention, and there had been no live scans in the
prior 24h, so no fresh per-request breakdown could be pulled; the
pre-aggregated error table was the real data source instead) and one
live, read-only PPT API request (existing `.env.local` key, `limit=1`,
no card lookup logic touched — consistent with "running the app
locally" being free rein per CLAUDE.md).

### 1. Latency

**Real finding — Gemini is the dominant, and sometimes total, latency
cost.** `GEMINI_TIMEOUT_MS = 5000` (`api/identify.js:107`). Real error
data: **31 real "Gemini call failed: This operation was aborted after
ms= 5002-5004" full timeouts** between 2026-08-31T00:18:32Z and
2026-09-01T01:40:53Z (~25h window), all on deployments that already
include the `thinkingLevel: "low"` + `media_resolution: HIGH` fix
(commit `3e895b1`). These are complete scan failures (no card ID
returned at all), not just slow ones — worse than a latency problem.
The code's own comment trail (`api/identify.js:279-295`) already flags
the likely cause: `thinkingLevel` was deliberately raised
`"minimal" → "low"` on 2026-08-29 for accuracy (test #50's hallucination
case), an explicitly acknowledged latency trade-off that was never
confirmed with a real timing measurement afterward — this 31-timeout
count in the following ~25h is the first real evidence that trade-off
has a cost. No fresh successful-scan `[timing] gemini ms=` /
`lookup ms=` breakdown could be pulled (see retention note above) to
compare against the pre-fix baseline (1511-2602ms total, recorded
pre-rescue-path/pre-rarity/pre-`low` in the "Speed benchmarks" section
above) — that comparison needs a live rescan once retention/traffic
allows.

Known sequential timeout ceilings (worst case, not typical latency):
Gemini 5000ms → PPT page-1 2500ms (+1200ms retry on 5xx) → PPT page-2
2500ms (+1200ms retry) → PPT combined-search 2500ms (+1200ms retry) →
TCGplayer price-history 2500ms. Only Gemini's ceiling has real evidence
of being hit in practice; no runtime-error data shows PPT/TCGplayer
`fetchWithTimeout` aborts as a meaningful contributor to total latency
recently.

**Options, most to least clearly worth it:**

1. **Lower `thinkingLevel` back toward `"minimal"`, or cap Gemini's own
   timeout below 5000ms with a fallback.** Directly targets the
   confirmed 31-timeout data point. Real trade-off: `"low"` was raised
   specifically to fight test #50's hallucination class — reverting
   risks reopening that (unconfirmed either direction; test #50 was
   never re-run at `"low"` under controlled conditions). A live-scan
   comparison (several scans at `"low"` vs `"minimal"`, real timing +
   real accuracy) would settle this without guessing.
2. **Raise `GEMINI_TIMEOUT_MS` above 5000ms.** Would convert some of
   the 31 hard failures into slow-but-successful scans instead — but
   directly conflicts with the project's own "2-5s target for a live
   buy/bid decision" design goal (`api/identify.js:93`), so this trades
   completeness for staying inside the window that makes the tool
   useful at all. Only worth it if most of the 31 timeouts are "just
   barely" over 5000ms (real data available: all three sampled were
   5002-5004ms, i.e. right at the edge) rather than genuinely hung
   calls — the sample suggests the model IS finishing, just marginally
   too slowly, which favors this option over a real hung-request theory.
3. **Drop `includeHistory=true` from every PPT search call** (see
   credit-cost finding in section 2 below) — pure latency win is
   secondary here (smaller response payload) but real: this flag was
   added for a pricing architecture (`buildPriceVariantsFromPPT`/
   `buildAggregatePricing`) that no longer exists in the code (removed
   2026-08-30, replaced by direct TCGplayer live pricing) but was never
   removed from the request. Confirmed live: a `limit=1` PPT request
   with `includeHistory` omitted still returns the full `prices` object
   (`market`, `low`, `primaryPrinting`, `variants`) — the only field of
   `prices` still read anywhere in the code (`best.prices?.primaryPrinting`,
   `api/identify.js:1525`) does not require `includeHistory=true` at
   all. Zero accuracy risk (the removed data is provably unused); the
   real payoff is on the rate-limit side (question 2) more than raw
   latency.
4. **Don't touch page-2/combined-search/rarity fallback logic to save
   latency.** Explicitly flagging per the research brief: no evidence
   in the error data that these fallbacks are a meaningful latency
   contributor (no timeout aborts attributed to them), and cutting them
   would reopen the catalog-coverage-gap and Trainer-tie-break problems
   they were built to fix (tests #35/#37/#49/#53/#63). Not recommended.

### 2. Rate limiting

**Real finding — PPT bills by requested `limit`, not by result count,
and every one of this project's search calls already pays a hidden 2x
multiplier.** Confirmed via PPT's own live docs (pokemonpricetracker.com/docs,
fetched via browser, not a cached WebFetch summary — same discipline as
the `cardNumber` doc-summary lesson from test #31/#32) and cross-checked
against a real API response:

- **Credit formula**: `limit × (1 + includeHistory + includeEbay +
  includeCardmarket + premiumGranularity)`. Billed on the *requested*
  `limit`, not the number of cards actually returned.
- **This project's every search call** (`api/identify.js:740`) requests
  `limit=30, includeHistory=true` → **60 credits per call**, confirmed
  exactly against a real production 429 body from test #51: `"Request
  requires 60 credits, you have 17 daily... remaining"`.
- **`includeHistory=true` is the entire reason it's 60 and not 30.**
  Per the latency section above, nothing in the code reads the deep
  history time-series this flag adds — only `prices.primaryPrinting`,
  which is present on every card object regardless (verified live: a
  bare `limit=1` request with no `includeHistory` param returned
  `apiCallsConsumed.breakdown.history: 0` and still included
  `prices.primaryPrinting`). This looks like leftover cost from the
  pre-2026-08-30 PPT-sourced pricing architecture that TCGplayer
  live-pricing replaced.
- **Fallback chain cost, concretely**: a scan that needs page-1 only =
  60 credits. Page-1 + page-2 = 120. Page-1 + page-2 + combined-search
  (the test #63 rescue path) = 180 credits — a single hard scan can
  cost 3x a clean one, on top of the extra latency.
- **Plan/limits** (confirmed live via docs + real response headers):
  current plan is "API" ($9.99/mo) = 20,000 daily credits + 60
  calls/min, same per-minute cap as every paid tier below Business
  ($99/mo, 500/min). A large prepaid balance exists right now
  (~191,550 credits remaining from the 2026-08-29 $5 top-up per test
  #51) — daily-quota exhaustion is NOT an near-term risk at current
  balance, but the **per-minute cap (60/min, unchanged by prepaid
  credits)** is: real per-minute 429s already happened twice (test #30,
  Palkia, 4 rescans/30s; 2026-08-31, Celebi VMAX) and a 3-call fallback
  chain burns through that per-minute budget 3x faster than a 1-call
  scan during a burst of rapid rescans on one card.

**Options:**

1. **Drop `includeHistory=true`.** Cuts every call from 60→30 credits
   (33% → 50% more daily headroom depending on how you count it; a
   3-call worst-case scan drops from 180→90 credits). No known accuracy
   or behavior change — the data it adds is unread. Lowest-risk item in
   this whole list; worth verifying once more against a second real
   card before shipping (confirm `primaryPrinting` isn't sometimes
   `includeHistory`-only for some card types), but nothing found in
   PPT's docs suggests that.
2. **Client-side caching of recent identical-card lookups** (real
   option, since PPT's own docs explicitly permit this: "Caching in
   your own database and serving your own first-party apps is
   permitted"). A short-lived in-memory or KV cache keyed on Gemini's
   `cardName`+`cardNumber`+`language` read would eliminate PPT calls
   entirely on the rapid-rescan pattern that caused test #30 and the
   2026-08-31 Celebi 429 — the same physical card scanned 2-4x in
   under a minute is exactly this project's own real usage pattern
   (per "What 'rescan' means in this project" above). Real trade-off:
   a cache keyed on Gemini's *read* (not ground truth) would also cache
   a wrong read's wrong result for its TTL — needs a short TTL (e.g.
   30-60s) to stay inside the "rapid rescan" window without persisting
   a bad match across a genuinely different card later in the stream.
3. **Smarter fallback triggering** (e.g. skip page-2 pagination when
   page-1's candidate pool is small enough that a missing number is
   more likely a genuine catalog gap than a crowding-out problem) —
   real option, but no data in this pull suggests fallback *frequency*
   is currently a problem (only 2 real per-minute 429s found across the
   full log history checked); flagging this as lower-priority than
   options 1-2 rather than dropping it, since it wasn't the brief's
   focus and deserves its own accuracy-tradeoff analysis before
   changing when fallbacks fire.
4. **Accept current limits as a cost of accuracy.** Legitimate given
   the daily quota isn't under near-term pressure (large prepaid
   balance) and per-minute hits have been rare (2 confirmed instances).
   Options 1-2 above are low-risk enough that "do nothing" doesn't look
   like the strongest choice here, but it's the honest baseline this
   list should be compared against.

## Fix shipped: removed `includeHistory=true` from every PPT search call — DEPLOYED 2026-09-01

Option 1 from the research above (commit pending push, deploy
`dpl_6z5qNTuhHbmWzuK5WD4ryA4kmTTm`, aliased to
`whatnot-pokemon-identify.vercel.app`). `fetchPokemonPriceTracker`
(`api/identify.js`) requested `limit=30, includeHistory=true` on every
single PPT search — confirmed via PPT's own live docs and a real 429
body that this costs 60 credits/call, not 30 (PPT bills
`limit × (1 + includeHistory + ...)`). `includeHistory=true`'s only
purpose was feeding `buildPriceVariantsFromPPT`/`buildAggregatePricing`,
both removed 2026-08-30 when pricing moved to live TCGplayer
per-condition fetches — the flag kept running anyway, silently doubling
cost for data nothing reads anymore.

**Verified live before removing, not just via code inspection**: queried
PPT's real API twice (once with `includeHistory=true`, once without) for
the same card. `prices.primaryPrinting` — the only field of `prices`
still read downstream (`pickDefaultVariantKey` via
`best.prices?.primaryPrinting`) — and the top-level `variants` field
(source of `_rawVariants`, used only in diagnostic `console.log` calls,
never in scoring/pricing) were byte-identical in both responses
(Charizard, both returned `primaryPrinting: "Holofoil"` and an identical
`variants` object). `includeHistory=true` only added `prices.variants`'
per-condition breakdown, a `prices.conditions` object, and a top-level
`priceHistory` key — confirmed via `grep` that none of the three are
referenced anywhere else in the file. Zero behavior change; halves the
credit cost of every PPT call and every fallback (page-2/combined-search
each drop from 60→30 the same way — a full page1+page2+combined scan
drops from 180→90 credits).

**Deploy checklist followed in full**, including a scratch-file
diff-verify step before deploying (per "Before you deploy" above): the
first transcription attempt reproduced the SAME diacritic-regex
corruption documented in test #63 and the rarity-signal deploy
(`[̀-ͯ]` rendered as literal Unicode combining characters) —
caught by diffing the scratch file against the real source *before*
constructing the deploy call, fixed non-generatively via a small Python
script that copied the exact bytes for the two mismatched lines
straight from the source file, then re-diffed clean (0 differences,
identical sha1 `2a439c3181c72a810482e5f42a33ca8979148b9f`) before
deploying. Separately, the first deploy call itself was sent with only
`package.json`/`vercel.json` and no `api/identify.js` — a real mistake,
caught immediately from the tool's own response rather than by a later
check. That deployment (`dpl_FaZ4vErw1WGgtmAUfJRDihBvwjur`) errored at
the Vercel build step (`unused_function` — `vercel.json` referenced a
function file that wasn't in the uploaded tree) and was confirmed via
`get_deployment` to have never reached `READY` or the production alias
— zero production impact, but flagging it here rather than glossing
over it, since it's exactly the kind of mistake this project's deploy
discipline exists to catch downstream of. The corrected redeploy
(`dpl_6z5qNTuhHbmWzuK5WD4ryA4kmTTm`) confirmed: `READY`, aliased to
production; build log shows "Downloading 3 deployment files"; live
`GET /api/identify` returns `normalizeDiacriticTest: "pokemon collector"`
(the same live canary from the earlier debug-endpoint work, confirming
this deploy's diacritic regex is intact); live `POST /api/identify {}`
returns real `400 {"error":"Missing imageBase64"}`; runtime logs confirm
both requests were served by `dpl_6z5qNTuhHbmWzuK5WD4ryA4kmTTm`.

**Not yet behaviorally confirmed via a live scan** — this is a
credit-cost/latency optimization with no intended behavior change (the
pre-deploy live PPT comparison already confirmed the removed data is
unused), so there's no accuracy claim to verify via rescan the way a
matching-logic fix would need. The real-world confirmation this needs
instead: a live scan's real `X-API-Calls-Consumed` / rate-limit headers
(not currently logged — `fetchPokemonPriceTracker` doesn't read PPT's
response headers today) or a lower observed daily-credit burn rate over
time.

## Decision: revert thinkingLevel "low" -> "minimal" (2026-09-01)

Resolves the open trade-off flagged at the end of the "Research: latency
and PPT rate-limit options (2026-09-01)" section above. `thinkingLevel`
was raised from `"minimal"` to `"low"` on 2026-08-29 (test #50, the
Ogerpon hallucination case) to try to reduce Gemini read instability. It
never showed a confirmed benefit: tests #63 and #67, both on deployments
that already included the `"low"` change, still showed the same
instability class (wrong translations, wrong card numbers returned at
self-reported High confidence). Meanwhile a real cost showed up in the
2026-09-01 research pass: 31 confirmed hard Gemini timeouts in a ~25h
window (2026-08-31 to 2026-09-01), all landing at 5002-5004ms — right at
the `GEMINI_TIMEOUT_MS = 5000` wall. No confirmed benefit, confirmed
cost -> reverted `thinkingLevel` back to `"minimal"` in `api/identify.js`.
`media_resolution: MEDIA_RESOLUTION_HIGH` (the other half of the
2026-08-29 fix) is untouched — only `thinkingLevel` was in question here.
Scope deliberately excludes the still-open rate-limiting options
(client-side caching, etc.) from the same research pass.

**Deployed 2026-09-01** (commit `d25584b`, deployment
`dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP`, aliased to
`whatnot-pokemon-identify.vercel.app`). Deploy checklist followed in
full: read the real file, reconstructed it to a scratch file, and
hash-verified byte-for-byte against the real source before deploying —
this caught the SAME recurring diacritic-stripping-regex transcription
corruption documented in test #63/#6x one more time on the first attempt
(`.replace(/[̀-ͯ]/g, "")` came out as literal Unicode combining
characters), fixed non-generatively by copying the exact bytes for that
one line directly from the source file via a small Python script, then
re-verified a clean 0-diff / matching sha1
(`9ed91b96052cebaa952893f768f3ac85b92fb25b`) before deploying. Confirmed:
deployment state `READY`, aliased to production; build log shows
"Downloading 3 deployment files"; live `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (direct proof the
diacritic regex deployed intact); live `POST /api/identify {}` returns
real `400 {"error":"Missing imageBase64"}`; runtime logs confirm both
requests were served by `dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP`. Pushed to
GitHub (`cbbf8b1..d25584b`).

**Not yet confirmed via live rescan.** Two things to watch now that this
is deployed and back on live traffic: (1) whether the timeout rate
actually drops over the following ~24h (compare against the 31-in-25h
baseline above), and (2) whether the #50/#63/#67 instability pattern
(wrong reads, hallucinated fields, at High confidence) recurs, holds
steady, or improves now that `thinkingLevel` is back at `"minimal"` —
reverting removes an unproven mitigation, so a recurrence wouldn't be a
regression from this change, just the original problem still being
unsolved.

## Test #68 — User saw "Couldn't identify the card" on a Japanese Absol scan; real logs show a Gemini timeout, not an unclear image (2026-09-02)

User asked "did something break?" after a scan (foil Japanese Absol,
held in hand, clearly visible on stream) returned the generic panel
message "Couldn't identify the card. Try again when it's clearly
visible." Per the standing convention, pulled real Vercel runtime logs
for the exact scan before answering, rather than trusting the
screenshot alone.

**Root cause, confirmed via logs**: not a vague image at all — a hard
Gemini timeout. `[identify] Gemini call failed: This operation was
aborted after ms= 5002`, hitting the `GEMINI_TIMEOUT_MS = 5000` wall
(`api/identify.js:107`). On that path the backend returns `{ found:
false, error: "gemini-failed", detail }` with no `reason` field
(`api/identify.js:1707`), so the extension falls back to its generic
default text (`extension/content.js:427`) — this is *always* what that
exact wording means; it does not mean the card itself was hard to read.
A second scan seconds later succeeded cleanly (Gemini read Absol
071/072 AR correctly; PPT just doesn't carry that exact printing —
`[lookup] NO NUMBER MATCH IN POOL`, a separate, already-known
catalog-coverage gap, same class as tests #35/#37/#49/#60).

**Relevant to the open thinkingLevel-revert confirmation item above**:
this happened on `dpl_5omfXcn98uMcZ4ZzUNpaTvVN38VP` — the deployment
that already reverted `thinkingLevel` back to `"minimal"` specifically
to reduce timeouts. Pulling a 24h window of `"Gemini call failed"`
log lines found 5 total timeouts, but all 5 were bunched into a single
~3-minute window (00:35:32-00:37:41 UTC), all at 5002-5009ms, right
before/around this report. Not a clean confirmation either way: 5 in
24h is far below the pre-revert 31-in-25h baseline, but a tight
same-session cluster like this also looks more like a transient Gemini
API slowdown at that moment than a steady baseline rate — one cluster
isn't enough to say the revert fixed the rate. Still counts as a real,
live data point for the "not yet confirmed via live rescan" item on the
thinkingLevel revert above; keep watching for further clusters.

No code change made — this was a report-only investigation, nothing to
fix. The "Couldn't identify the card" wording itself is working as
designed for this failure path (honest failure, no false answer), so no
action item here beyond continuing to watch the timeout rate.

**Update, same session, ~5 minutes later**: user reported "another
instance" with a screenshot showing the identical generic message, plus
`This scan: $0.0007 · Total: $0.35`. Investigated again via real logs
rather than assuming it was the same story:

- **Same root cause** — another Gemini timeout. Confirmed by wording:
  the panel showed the exact generic default text, not a Gemini-supplied
  `reason`; a different scan in the same window that Gemini *did*
  respond to (found:true, but confidence Low, cardName/cardNumber all
  null) carried its own distinct reason text ("The main held card is
  severely motion-blurred and illegible") — proving the generic default
  and a real Gemini-supplied reason render differently, so the generic
  text reliably means "no `reason` field at all," i.e. the timeout path.
- **New finding: the `$0.0007` figure was stale, not evidence of a paid
  call for this attempt.** `recordScanCost()` (`extension/content.js:162`)
  returns early — leaving `#wnpk-cost` untouched — whenever
  `response.data.usage` is missing, which it always is on the
  `gemini-failed` timeout response (`api/identify.js:1707` never
  includes a `usage` key). So the dollar figure on screen after a
  timeout is always left over from whatever scan last succeeded, not
  the cost of the failed attempt. Cosmetic/informational only — doesn't
  affect identification or actual billing — but worth knowing so a
  nonzero "This scan" figure is never read as proof a failed-looking
  scan was actually billed or completed.
- **Escalation, not a blip.** Widening the log window to the last ~7
  minutes (00:35-00:42 UTC) found **13 Gemini timeouts total**, not the
  5-in-24h seen minutes earlier when this test was first written — the
  rate was actively climbing in real time while this was being
  investigated, clustered right in the middle of this live stream
  session. This is a materially stronger, live-in-progress signal for
  the open thinkingLevel-revert confirmation item above: whatever's
  driving 5s timeouts is currently hitting this session hard, well above
  the pre-revert 31-in-25h baseline's implied rate. Not yet clear
  whether this is a genuine regression, a transient Gemini-side slowdown
  unrelated to the revert, or the same unsolved problem the revert never
  touched (media_resolution/prompt size, not thinkingLevel) — needs
  more data across sessions/times of day before concluding anything,
  but it's no longer a single isolated cluster.

## Research: is Gemini the right vision provider? (2026-09-02, research only — no code/deploy)

Prompted directly by the severe live cluster in test #68's update above
(13 hard timeouts out of 21 scan attempts in the 00:35-00:42 UTC window)
stacked on top of the already-open read-instability trend (tests #50,
#63, #67) and the fact that the one lever already pulled on this
(`thinkingLevel` revert, decided 2026-09-01) didn't meaningfully fix it.
Per standing process, this is a written-up open design question for
sign-off, not a build — no code changed, no live comparison test run
(no second provider's API key exists in this project's environment to
test against; if the user wants a real side-by-side accuracy test, that
needs a new key provisioned first — a separate ask, not assumed here).
All pricing/limits below pulled from each provider's own current docs
(`platform.claude.com`, `developers.openai.com`), not from memory or
aggregator blogs.

### 1. Real options and real current pricing/latency

**Our current profile** (from real production logs, e.g. the Absol scan
in test #68 above): ~1551 input tokens per call (~1100 image + ~451 text
instruction/schema), ~80-120 output tokens for the ~14-field JSON
response.

> **Correction (2026-09-03)**: the numbers below were originally computed
> against `GEMINI_INPUT_USD_PER_1M = 0.30` / `GEMINI_OUTPUT_USD_PER_1M =
> 2.50`, which turned out to be stale — found and fixed while
> independently fact-checking this same table against Google's live
> pricing page. Real current pricing for `gemini-3.6-flash` (confirmed
> live at `ai.google.dev/gemini-api/docs/pricing`, and confirmed it's
> priced separately from 3.7/3.8 Flash, not grouped with them) is
> $0.75/$3.75 per MTok, not $0.30/$2.50 — see the `GEMINI_INPUT_USD_PER_1M`
> fix in `api/identify.js`. Gemini's real cost/scan is **~$0.0016**, not
> ~$0.0007, and every "Nx Gemini" multiple below is recomputed
> accordingly (roughly half the multiple originally stated). This was a
> *display*-accuracy bug only (the extension's own "This scan: $X" cost
> shown to the user was undercounting real spend by ~2x) — it does not
> change any of this research's other findings (structured-output
> support, timeout behavior, migration cost, rate limits), only the
> relative cost comparison here.

At Gemini's corrected $0.75/$3.75 per-MTok rate, our profile comes out
to **~$0.0016/scan**.

| Provider / model | Input $/MTok | Output $/MTok | Est. cost at our token profile | Structured JSON output | Notes |
|---|---|---|---|---|---|
| **Gemini 3.6 Flash** (current) | $0.75 | $3.75 | ~$0.0016 | Yes (`responseSchema`, in production use) | Baseline. Corrected 2026-09-03 — was computed against stale $0.30/$2.50 constants, see note above |
| **GPT-4o** | $2.50 | $10.00 | ~$0.005 (~3.1x Gemini) | Yes, confirmed vision-compatible | Image-token formula (85 base + 170/512px tile) gives ~1105 image tokens for a similarly-sized frame — coincidentally close to Gemini's own 1100 |
| **GPT-5** | $1.25 | $10.00 | ~$0.003 (~1.9x Gemini) | Yes (strict JSON schema, `gpt-4o-2024-08-06`-and-later family) | Vision-input token formula for GPT-5 specifically not confirmed by docs fetched — flagged unknown, not assumed identical to GPT-4o's |
| **GPT-5-mini** | $0.25 | $2.00 | ~$0.0006 (~0.4x Gemini — cheaper than Gemini at corrected pricing) | Presumed yes (same family) | Cheapest real alternative found, and now clearly cheaper than Gemini (not "roughly parity" as this doc said before the pricing correction) — but a smaller model, no accuracy data either way for a 14-field structured-extraction task; genuinely unknown without live test |
| **Claude Haiku 4.5** | $1.00 | $5.00 | ~$0.0023-0.0026 (~1.4-1.6x Gemini) | Yes, GA (not beta) — `output_config.format`, confirmed supported on `claude-haiku-4-5-20251001` | Image tokenization is patch-based (28x28px = 1 visual token); a comparable frame likely runs ~1300-1600 image tokens (docs example: 1092x1092px = 1521 tokens), somewhat higher than Gemini's 1100 |
| **Claude Sonnet 5** | $2.00 | $10.00 | ~$0.0047-0.0053 (~2.9-3.3x Gemini) | Yes, GA, confirmed supported on `claude-sonnet-5` | Same image-token profile as Haiku; this is the accuracy-favored tier if Haiku turns out too weak |
| **xAI Grok 4.3/4.5** | $1.25 | $2.50 | ~$0.0022 (~1.4x Gemini) | Yes (`response_format` JSON schema) | Least-documented of the four for this specific use case — real pricing/structured-output support confirmed, but no vision-token formula or accuracy data found; would need its own deeper look before being a real contender |

**Honest gap**: none of this tells us anything about *accuracy* on our
specific task (transcribe a handheld trading-card photo into structured
fields) — every number above is priced/latency data, not a quality
comparison. That can only be settled by a live test, which per the
task's own scope was explicitly not run here.

### 2. Timeout / rate-limit behavior

**Important finding, not assumed going in**: `GEMINI_TIMEOUT_MS = 5000`
in `api/identify.js` is **our own client-side `AbortController` timeout**
(`fetchWithTimeout`), not a limit Gemini itself imposes or documents.
Checked both alternatives' own docs directly: OpenAI's SDKs default to a
600000ms (10 min) client timeout, Anthropic's SDKs default to 10
minutes — both fully configurable per-request down to any value,
exactly like our own `fetchWithTimeout` wrapper. **This means the 5s
ceiling is equally achievable (or not) on any of the three** — it's not
a Gemini-specific constraint we'd be trading away. The real open
question a migration wouldn't resolve on its own is whether the
*alternative provider's actual response time* for this workload
comfortably clears a 5s budget — genuinely unknown without a live
timing test.

Rate limits: OpenAI's tiers scale with account spend (Tier 1: 500 RPM /
200k TPM for gpt-4o after $5 spent; Tier 5: 10,000 RPM / 30M TPM).
Anthropic's Start tier is roughly 50 RPM with tens-of-thousands TPM,
scaling up through Build/Scale tiers. Our real observed usage (worst
case so far: 13 calls in 7 minutes, test #68 above) is well under even
the lowest published tier on either platform — rate limits are very
unlikely to be the binding constraint for either alternative, unlike the
PPT per-minute/per-day credit exhaustion problem documented elsewhere in
this file (that's a genuinely different, tighter-budget dependency; this
question doesn't carry the same risk).

One additional, Vercel-specific wrinkle found in the docs and worth
flagging: both OpenAI's and Anthropic's structured-output features note
that **the first request against a given JSON schema pays extra
"compile" latency**, cached afterward (Anthropic: schema grammar cached
24h; OpenAI: same idea, unspecified duration). Since our schema never
changes between calls, this is a one-time cost in a long-lived server —
but on **Vercel serverless**, a cold-started function instance may not
share that cache with a prior instance, so this could recur more often
than either provider's docs assume for a traditional always-on backend.
Not something the current Gemini integration hits (Gemini's
`responseSchema` mechanism isn't documented as having this same
compile-and-cache behavior) — a real, provider-specific risk worth
testing for, not just assuming away.

### 3. Migration cost — genuinely contained, verified by reading the code

Read `identifyWithGemini()` and its call sites directly
(`api/identify.js:250-334`, called once at `api/identify.js:1703`) to
assess this honestly rather than guess. The finding: **this is a real,
contained swap, not a scoring/matching-logic ripple** —

- `identifyWithGemini(imageBase64, apiKey)` is fully self-contained: it
  builds one provider-specific HTTP request, parses one provider-specific
  response shape, and returns a plain JS object with the fields
  everything downstream actually consumes (`found`, `confidence`,
  `cardName`, `cardNumber`, `hp`, `subtype`, `setName`, `attackName`,
  `language`, `stampType`, `isSlab`, `grader`, `grade`, `certNumber`,
  `reason`), plus a `_geminiUsage` field used only for cost display.
- Every downstream consumer — `scoreCandidate`, `pickBestCandidate`,
  `numbersMatch`, `lookupCardPPT`, `lookupGradedPrice`, the whole
  scoring/matching system — reads only those generic fields. None of it
  is Gemini-aware. **A new provider function that returns the identical
  shape requires zero changes anywhere else in the file.**
- `estimateGeminiCostUsd()` (`api/identify.js:199`) is the one other
  provider-specific piece — Gemini's own per-token pricing constants and
  its `usageMetadata` field names. A new provider needs its own parallel
  cost function (small, ~10 lines, same pattern).
- The two call sites that would change: `api/identify.js:1703`
  (`read = await identifyWithGemini(...)`) and `:1714`
  (`estimateGeminiCostUsd(read._geminiUsage)`), plus the env var name
  (`GEMINI_API_KEY` → e.g. `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`) and the
  `GEMINI_MODEL`/`GEMINI_TIMEOUT_MS` constants.
- **Real, non-trivial part of the swap**: the prompt (`GEMINI_PROMPT`,
  `api/identify.js:236`) and the JSON schema (`GEMINI_SCHEMA`,
  `api/identify.js:211`) would need to be re-expressed in the new
  provider's own schema syntax (OpenAI's `response_format.json_schema`;
  Anthropic's `output_config.format`) and very likely re-tuned — a
  prompt engineered against Gemini's specific behavior (e.g. the
  Japanese-name-translation instruction, the "don't guess" framing, the
  multi-card-in-frame warning added after the Brock's Onix bug) is not
  guaranteed to produce equally good results verbatim on a different
  model. This is the part of "migration cost" that's honestly hardest to
  size without live testing — the code-level swap is small and
  contained; the prompt-tuning-to-match-current-behavior work is real
  but open-ended.

**Bottom line on migration cost**: contained at the code level (one
function + one small cost helper + two call sites + env var), NOT
contained at the prompt-quality level — that part is genuinely unknown
effort until tested live against real cards.

### 4. Dual-provider option — feasibility only, not designed

Two different ideas got conflated in the original framing; worth keeping
separate:

- **Race (call two providers, use whichever responds first)**: this
  really is low-complexity given finding #3 above — since
  `identifyWithGemini`-shaped functions already return an identical
  object shape, wrapping two of them in `Promise.any()` (or a manual
  race with a small preference tie-break) is a small, mechanical addition
  once a second provider function exists at all. The real cost is
  doubling per-scan spend (both providers get called and billed on every
  scan, even though only one result is used) — at either OpenAI's or
  Anthropic's per-scan cost above, that's a meaningfully bigger ongoing
  cost than Gemini alone, not a free win.
- **Cross-check (compare two providers' reads, reconcile or flag
  disagreement)**: this is NOT low-complexity — it's a materially bigger
  feature (new comparison/reconciliation logic, new confidence rules for
  when providers disagree) and should not be assumed to come "for free"
  alongside racing. Flagging its existence as an option, not designing
  it — per the task's own scope.

### Open question — no recommendation made, decision left to the user

This write-up deliberately does not recommend "switch to X." Real,
documented tradeoffs, clearly marked confirmed vs. unknown:

- **Confirmed**: OpenAI and Anthropic both cost more per scan than
  Gemini at current (corrected 2026-09-03) pricing — roughly 1.4-3.3x
  across the realistic mid/high-tier models (GPT-5, Claude Haiku 4.5,
  Claude Sonnet 5, Grok), with GPT-4o the priciest real option at ~3.1x.
  The cheapest real alternative, GPT-5-mini, is actually **cheaper** than
  Gemini at corrected pricing (~0.4x) — not "roughly parity" as this
  entry said before the pricing correction — but still unproven on
  accuracy for this exact task. Both OpenAI and Anthropic support real
  JSON-schema-constrained structured output. Both have configurable
  client timeouts,
  so the 5s budget isn't a Gemini-specific constraint being traded away.
  Rate limits are not expected to bind at our usage scale on either.
  The code-level swap is small and contained; prompt re-tuning is real
  extra work.
- **Genuinely unknown, not answerable without a live test**: whether
  either alternative is actually more accurate/consistent than Gemini on
  this specific task (the entire reason this research got triggered),
  and whether either alternative's real observed latency for this
  workload comfortably clears our 2-5s target. No second provider API
  key currently exists in this project's environment to test this — a
  new key is a separate ask if the user wants to pursue a live
  comparison.

## Shadow test: Claude Haiku 4.5 vs. Gemini, live data (started 2026-09-03)

Answers the "genuinely unknown" item directly above — the one question
the research couldn't settle from docs. **Not built into the extension**:
`identifyWithHaiku()`/`runHaikuShadowTest()` in `api/identify.js` are a
read-only shadow call, gated entirely on `ANTHROPIC_API_KEY` being set in
Vercel's environment. Gemini remains the sole source of what the user
sees and what matching/pricing runs on; Haiku's read is logged to Vercel
runtime logs only (`[haiku-shadow-test]` lines), never consumed anywhere
else. Fully removable — see the "TEMPORARY SHADOW TEST" comment block in
`api/identify.js`. This section is pure doc-tracking, updated as the user
reports real scans; no comparison logic lives in the app itself.

**How entries get added**: the user reports a real scan (directly, or via
a screenshot); pull the matching `[haiku-shadow-test]` line from Vercel
runtime logs for that deployment/timestamp (never take the user's
paraphrase as the record — same standing convention as everywhere else in
this file) and log it below in the fixed format, then update the running
tally.

**Recommended before drawing any conclusion**: ~20-30 real scans covering
the failure classes that actually motivated this (Japanese cards, promo/
alphanumeric numbers, foil glare), including a few 2-3-scan-while-the-
card-is-on-screen sequences to compare each provider's own consistency,
not just single-shot accuracy — see the full reasoning in CLAUDE.md's
"Recent / in-flight work". Extend further if the first batch is mixed.

### Running tally (updated as each data point is added)

| Metric | Count |
|---|---|
| Total data points | 14 |
| Both succeeded, all compared fields agree | 0 |
| Both succeeded, fields disagree | 1 |
| Gemini failed/timed out, Haiku succeeded | 13 |
| Gemini succeeded, Haiku failed/timed out | 0 |
| Both failed | 0 |
| Ground truth confirmed — Gemini correct | 0 |
| Ground truth confirmed — Haiku correct | 0 |
| Ground truth confirmed — both correct | 0 |
| Ground truth confirmed — both wrong | 0 |
| Ground truth confirmed — disagreed, unresolved | 1 |

Of the 13 Gemini failures: 11 hard timeouts (5002-5010ms, the
`GEMINI_TIMEOUT_MS = 5000` wall) and 2 confirmed `503 "This model is
currently experiencing high demand"` errors — a new Gemini failure mode
for this project, distinct from every timeout documented so far (see
ROADMAP.md's "Gemini read-consistency fix" item for the full cluster
write-up). No ground-truth row has a real confirmed count yet — the one
disagreement (#5 below) has strong *indirect* evidence favoring Gemini's
read (it matched a real PPT candidate cleanly, `tieCount=1`), but that's
not the same as a confirmed ground truth from the physical card, so it's
tracked as "disagreed, unresolved" rather than a confirmed-correct count.

**Latency:**

| Provider | n | min | max | mean | note |
|---|---|---|---|---|---|
| Gemini | 1 (successful calls only) | 2445ms | 2445ms | 2445ms | 13 failed calls excluded — see per-entry notes for their abort/error timings |
| Haiku | 14 (every call succeeded) | 2273ms | 3414ms | ~2879ms | includes the one low-value "nothing legible" result (#12) — a valid response, not an error |

### Data points

#### #1 — 2026-09-03 02:15:59 UTC (`dpl_C8BLGSCBXJn7geR1DETfbQuVgVAk`)

- **Gemini**: FAILED — hard timeout, aborted at 5008ms (the `GEMINI_TIMEOUT_MS
  = 5000` wall). This is the "Couldn't identify the card" message the user
  saw in the panel.
- **Haiku**: SUCCEEDED — 2705ms, High confidence. `cardName="Shadowark"`,
  `cardNumber="082/071"`, `hp="120"`, `language="Japanese"`,
  `attackName="Mind Shock"`, `stampType="none"`, `subtype=null`,
  `setName=null`. Cost $0.002999 (2354 input / 129 output tokens) — notably
  higher input-token count than Gemini's typical ~1551 for a comparable
  frame, consistent with the research doc's expectation that Anthropic's
  patch-based image tokenization runs higher than Gemini's for a real
  (non-tiny) photo.
- **Ground truth**: not available from this data point alone — since
  Gemini itself failed, there's nothing to cross-check Haiku's read
  against yet. Real ground truth (e.g. from the physical card, or from a
  successful Gemini rescan of the same/a similar card) would be needed to
  confirm Haiku's read was actually correct, not just confident.
- **Relevance**: a direct, real example of Haiku succeeding on a frame
  where Gemini hard-timed-out — exactly the failure mode that prompted
  this whole shadow test (see the severe timeout cluster in test #68's
  update, 2026-09-02).

**Data points #2-#14 below were backfilled 2026-09-03 from the same
`dpl_C8BLGSCBXJn7geR1DETfbQuVgVAk` runtime logs already pulled and
verified for the ROADMAP.md cluster write-up — not individually reported
live by the user at the time each scan happened, unlike #1 above. Noted
here so the trail stays accurate: these are real, log-verified data
(same standard as every other entry in this file), just added to this
doc in a batch after the fact rather than one at a time as they occurred.**

#### #2 — 2026-09-03 02:20:29 UTC

- **Gemini**: FAILED — timeout, 5003ms.
- **Haiku**: SUCCEEDED — 3002ms, Medium confidence. `cardName="Lapras"`,
  `cardNumber="072/063"`, `hp="110"`, `language="Japanese"`,
  `attackName="いしじょおよぐ"`, `stampType="none"`. Cost $0.003124.
- **Ground truth**: not available (Gemini failed).

#### #3 — 2026-09-03 02:20:40 UTC

- **Gemini**: FAILED — timeout, 5003ms.
- **Haiku**: SUCCEEDED — 3371ms, High confidence. `cardName="Ditto"`,
  `cardNumber="070/078"`, `hp="60"`, `language="Japanese"`,
  `attackName="てらしてもやす"`, `stampType="none"`. Cost $0.003044.
- **Ground truth**: not available (Gemini failed).

#### #4 — 2026-09-03 02:20:49 UTC

- **Gemini**: FAILED — timeout, 5004ms.
- **Haiku**: SUCCEEDED — 2273ms, High confidence. `cardName="Litwick"`,
  `cardNumber="259"`, `hp="60"`, `language="Japanese"`, `attackName=null`,
  `stampType="none"`. Cost $0.002959.
- **Ground truth**: not available (Gemini failed).

#### #5 — 2026-09-03 02:21:04 UTC

**The one Gemini success in this batch — and the first real same-frame
accuracy comparison, not just a failure-mode data point.**

- **Gemini**: SUCCEEDED — 2445ms (per the request's own
  `[timing] gemini ms=` line; the shadow-test log's own `geminiMs=2910`
  for this entry is inflated because `runHaikuShadowTest` awaits Haiku
  *before* re-awaiting the already-resolved `geminiPromise`, so its
  `geminiMs` reflects elapsed time including Haiku's own call, not
  Gemini's true latency — worth knowing for any future entry where
  Gemini resolves faster than Haiku; use the main request's own timing
  line when the two disagree). High confidence. `cardName="Minior"`,
  `cardNumber="070/062"`, `hp="70"`, `language="Japanese"`,
  `subtype="AR"`, `attackName="じゅうりょくタックル"`. Matched a real PPT
  candidate cleanly downstream (`bestScore=26`, `tieCount=1`,
  `SV3a: Raging Surf`) — strong indirect evidence this read was correct,
  though not a confirmed ground truth.
- **Haiku**: SUCCEEDED but DISAGREED — 2906ms, High confidence.
  `cardName="Meteono"`, `cardNumber="070/102"`, `hp="70"` (agrees),
  `subtype=null`, `attackName="ひらりよくタックル"`,
  `language="Japanese"` (agrees), `stampType="none"` (agrees). Cost
  $0.003089.
- **Field agreement** (from the real log line): `hp` ✓, `setName` ✓,
  `language` ✓, `stampType` ✓, `isSlab` ✓, `confidence` ✓ — but
  `cardName` ✗, `cardNumber` ✗, `subtype` ✗, `attackName` ✗. Overall
  `match=false`.
- **Ground truth**: not confirmed (no physical-card check) — tracked as
  "disagreed, unresolved" in the tally above. The PPT-match evidence
  leans toward Gemini's read being right here, but that's inference, not
  confirmation.
- **Relevance**: the only entry in this batch where both providers
  produced a confident, structured read of the SAME frame and disagreed
  — exactly the comparison this shadow test needs more of. One data
  point isn't a pattern; needs more like this to say anything about
  relative accuracy rather than relative availability.

#### #6 — 2026-09-03 02:21:33 UTC

- **Gemini**: FAILED — timeout, 5004ms.
- **Haiku**: SUCCEEDED — 3329ms, Medium confidence. `cardName="Vanillite"`,
  `cardNumber=null`, `hp="150"`, `language="Japanese"`, `attackName=null`,
  `stampType="none"`, **`isSlab=true`** (Haiku's reasoning: "Card is in a
  clear protective slab but grader, grade, and certification number are
  not legible" — worth watching for whether this is a real slab detection
  or Haiku over-calling a sleeve/toploader as a slab; no way to confirm
  from this data point alone). Cost $0.003109.
- **Ground truth**: not available (Gemini failed).

#### #7 — 2026-09-03 02:21:40 UTC

- **Gemini**: FAILED — timeout, 5003ms.
- **Haiku**: SUCCEEDED — 2599ms, High confidence. `cardName="Palafin"`,
  `cardNumber="112/093"`, `hp="150"`, `language="Japanese"`,
  `attackName="ぶつかる"`, `stampType="none"`. Cost $0.003079.
- **Ground truth**: not available (Gemini failed).

#### #8 — 2026-09-03 02:22:03 UTC

- **Gemini**: FAILED — timeout, 5002ms.
- **Haiku**: SUCCEEDED — 2773ms, High confidence. `cardName="Silthous"`,
  `cardNumber=null`, `hp="70"`, `language="Japanese"`,
  `attackName="Psychoshot"`, `stampType="none"`. Cost $0.003064.
- **Ground truth**: not available (Gemini failed).

#### #9 — 2026-09-03 02:22:09 UTC

- **Gemini**: FAILED — **`503 UNAVAILABLE`, "This model is currently
  experiencing high demand"**, 1577ms (not a timeout — Gemini's own API
  actively rejected the request). The first confirmed instance of this
  error in the batch.
- **Haiku**: SUCCEEDED — 3005ms, Medium confidence. `cardName="Iono"`,
  `cardNumber="083/070"`, `hp="30"`, `language="Japanese"`,
  `attackName="Iono Shot"`, `stampType="none"`. Cost $0.003179.
- **Ground truth**: not available (Gemini failed).

#### #10 — 2026-09-03 02:23:27 UTC

- **Gemini**: FAILED — timeout, 5003ms.
- **Haiku**: SUCCEEDED — 3040ms, Medium confidence. `cardName="Yamper"`,
  `cardNumber="073/071"`, `hp="70"`, `language="Japanese"`,
  `attackName=null`, `stampType="none"`. Cost $0.003159.
- **Ground truth**: not available (Gemini failed).

#### #11 — 2026-09-03 02:24:06 UTC

- **Gemini**: FAILED — **`503 UNAVAILABLE`, "This model is currently
  experiencing high demand"**, 981ms. Second confirmed instance in this
  batch.
- **Haiku**: SUCCEEDED — 3414ms, High confidence. `cardName="Oinkologne"`,
  `cardNumber=null`, `hp="120"`, `language="Japanese"`,
  `attackName="Mind Jack"`, `stampType="none"`. Cost $0.003044.
- **Ground truth**: not available (Gemini failed).

#### #12 — 2026-09-03 02:24:08 UTC

- **Gemini**: FAILED — timeout, 5003ms.
- **Haiku**: technically SUCCEEDED (valid 200 response) but low-value —
  2741ms, Low confidence, every field null except `stampType="none"`/
  `isSlab=false`. Haiku's own reason: the card was "too blurry and
  obscured to legibly read any text, numbers, HP, attack names." A
  genuine "neither provider could read this frame" case, not a Haiku
  failure — an honest low-confidence non-answer is the correct behavior
  here, same design principle this whole project already follows for
  Gemini. Cost $0.003104.
- **Ground truth**: not available (Gemini failed; Haiku found nothing to
  cross-check either).

#### #13 — 2026-09-03 02:24:14 UTC

- **Gemini**: FAILED — timeout, 5002ms.
- **Haiku**: SUCCEEDED — 2657ms, Medium confidence. `cardName="Shaymin"`,
  `cardNumber=null`, `hp="120"`, `language="Japanese"`,
  `attackName="Mind Jack"`, `stampType="none"`. Cost $0.003099.
- **Ground truth**: not available (Gemini failed).

#### #14 — 2026-09-03 02:24:21 UTC

- **Gemini**: FAILED — timeout, 5002ms.
- **Haiku**: SUCCEEDED — 2485ms, Medium confidence. `cardName="Zoroark"`,
  `cardNumber=null`, `hp="120"`, `language="Japanese"`,
  `attackName="Mind Jack"`, `stampType="none"`. Cost $0.003059.
- **Ground truth**: not available (Gemini failed).

**Observation across #6, #9, #11, #13, #14** (Vanillite/Iono/Oinkologne/
Shaymin/Zoroark): several of these share `hp="120"` + `attackName="Mind
Jack"` (or its Japanese `マインドジャック`) with entry #1 (Shadowark) and
#2 (Zoroark again at #14) — plausibly the same physical card or a small
set of cards being rescanned repeatedly during this cluster (consistent
with rapid-fire rescanning during a real timeout streak), not 13
independent unique cards. Worth keeping in mind when eyeballing this
batch for variety — the *language*/*failure-mode* coverage is real, but
the *card* coverage is probably much narrower than 13 distinct cards.

## Test #69 — User reported a Mega Dragalge ex scan "got the name wrong twice before getting it correct" (2026-09-03)

User shared a screenshot of a Low-confidence Mega Dragalge ex result
(`118/086`, ME04: Chaos Rising, "no printing in our database has the
exact card number that was read") with the comment "This one got the
name wrong twice before getting it correct." Per the standing
convention, pulled real Vercel runtime logs for the exact scan and the
two preceding ones before accepting that framing.

**The successful scan itself, confirmed via logs**
(`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`, 21:12:55 UTC): Gemini read
`cardName="Mega Dragalge EX"` (correct), `cardNumber="117/086"`
(wrong — off by one digit; the real printing is `118/086`),
`hp="330"`, High confidence. None of the 3 real PPT candidates
(`118/086` Special Illustration Rare, `104/086` Ultra Rare, `065/086`
Double Rare) match `117/086` exactly, so `lookup` correctly fell
through page-1/2 and the combined name+number fallback, found nothing,
and logged `NO NUMBER MATCH IN POOL` — the honest Low-confidence
"closest match on other details" warning shown in the screenshot is
this safety net working as designed (per the project's "Key design
principle"), not a name bug. The Haiku shadow-test call on this same
frame also misread the name (`"Mega Dracalge EX"`, HP `230`, no card
number) — a real, useful shadow-test disagreement data point, but not
what the user saw (Haiku's read never reaches the panel outside a
fallback).

**The "wrong twice" claim did not hold up against the logs**: the two
prior `/api/identify` calls on this deployment (21:11:21 and 21:11:43,
22s and 94s before the Dragalge scan) were not misreads of the same
physical card at all — they were two entirely different, unrelated
cards: a Japanese Galarian Zapdos V and a Japanese Maushold, both
correctly identified as such (Zapdos: Low confidence/ambiguous 5-way
tie, a real but separate issue; Maushold: High confidence, clean
match). A 2-hour log search for any Gemini call mentioning "Dragalge"
before 21:12:55 returned zero results. The most consistent explanation
given the evidence: on this fast-moving live stream, the two earlier
clicks captured different physical cards in frame (plausible if
several cards were being flipped through quickly), not the AI
hallucinating the same Dragalge card's name twice — no log evidence
supports the latter.

**No code change** — the number-read miss (117 vs. 118) is exactly the
kind of single-digit Gemini misread this project already tracks as a
known, unsolved read-instability class (see the `thinkingLevel`
history above), and the safety-net response it triggered here is
correct behavior, not a bug. Recorded because it's a real, log-verified
data point on that open question, and because the "wrong twice" framing
from the screenshot alone would have been misleading without pulling
logs — consistent with the test #67/#68 pattern of screenshot-only
readings getting the mechanism wrong.

## Test #70 — First real production firing of the Haiku active fallback (`visionProvider: "haiku-fallback"`) — and it was wrong (2026-09-03)

Separate, unrelated incident from test #69 above (different scan,
different failure shape — do not conflate). User independently confirmed
via real Vercel runtime logs (`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`,
2026-09-03T21:14:15 UTC) before relaying, and this write-up re-confirms
the same log entry plus traces the downstream PPT lookup and the actual
response sent to the client — none of which had been pulled yet.

**What happened, confirmed via logs**:

- Gemini timed out: `[identify] Gemini call failed: This operation was
  aborted after ms= 5002` — a genuine call failure, the exact condition
  the active-fallback feature (see CLAUDE.md "Recent / in-flight work")
  exists for.
- The Haiku fallback fired — **the first confirmed live-production
  firing of `visionProvider: "haiku-fallback"` since that feature
  deployed** (commit `633b008`, `dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`,
  2026-09-03). Haiku returned: `found:true`, **High confidence**,
  `cardName="Wailord"`, `language="Japanese"`, `cardNumber="181/165"`,
  `hp="150"`, `attackName="Bathyspheres"`. User confirms the physical
  card was not a Wailord — this read was wrong.
- **Haiku's own reasoning text contains an internal contradiction**:
  `"Japanese text with カビゴン visible, but the main card being
  highlighted is Wailord (ワイルド) with 150 HP shown at top."` —
  カビゴン is Snorlax's Japanese name. Haiku's own OCR surfaced
  conflicting evidence (Snorlax's name legible in the frame) and it
  still committed to "Wailord" as the answer. Cost: haikuMs=3108,
  haikuCostUsd=$0.003269.

**PPT lookup result, traced through the actual matching code (not just
the raw log line)**: search `"Wailord"` + `language=Japanese` returned
29 raw candidates. `pickBestCandidate` scored all of them — the top
score was only **2**, which is *below* `MATCH_FLOOR = 3`
(`api/identify.js:158,930-931`), so `best` was discarded and set to
`null` even though the log's `[lookup] best=` line prints the
would-be-best candidate *before* that floor check runs (`Magikarp &
Wailord GX - 111/095`, tieCount=4 — a weak, junk-tier tie, not a real
close call). The page-1+2 pagination fallback did **not** trigger
(`rawList.length` was 29, not the full 30 that fallback requires). The
combined name+number search (`"Wailord 181/165"`) did run and returned
0 candidates. With `best` still null after every fallback,
`lookupCardPPT` hit `if (!best) return { notFound: true };`
(`api/identify.js:1639`).

**What was actually shown to the user, confirmed via the response-
construction code** (`api/identify.js:2170-2182`): `{ found: false,
reason: 'Read the name "Wailord" but couldn't confidently match it to a
specific printing.' }`. So this was **not** a confidently-wrong result
displayed with a price — it degraded to the same honest "couldn't
confidently match" failure message the app already shows for other
no-match cases, just naming the wrong (Haiku-hallucinated) species in
the message text. Confirms the user's own framing ("couldn't properly
identify") over a literal "showed the user a wrong Wailord card."

**Assessment — this is the "Definition of done" data point the active-
fallback item has been waiting on, and it's a miss, not a success**:
the fallback path fired end-to-end in production for the first time,
and on that first real firing, Haiku's read was wrong (with a visible
internal contradiction in its own reasoning). The failure was contained
— no wrong price shown, an honest non-match message instead — but this
is 1 data point, not a trend, and should not be logged as a clean
confirmation. CLAUDE.md and ROADMAP.md updated to change "not yet
observed" to "observed once, and it was wrong" for this item; no
revert or code change made based on 1 data point alone.

**Flagged, research-only, not built**: `identifyWithHaiku` reuses
`GEMINI_PROMPT` verbatim (`api/identify.js:496`), which includes: *"If
multiple cards are visible in the frame, make sure cardNumber, hp, and
every other field describe the SAME single card being held up or
highlighted — do not mix a number from one card with the HP or name of
a different card in the background."* Haiku's own reasoning language
("the main card being highlighted is Wailord") tracks this instruction
almost verbatim — plausible hypothesis: when multiple cards are in
frame, this wording may push the model to pick a card by visual
prominence/highlighting first and then backfill a name, rather than
anchoring the name to whatever text it actually OCR'd — which would
explain why it surfaced カビゴン in its own reasoning and still didn't
use it. This is a hypothesis from one data point, not a confirmed root
cause, and no prompt change should be made from a single scan — noted
here for whenever this comes up again.

## Test #71 — 10-minute production window: Haiku itself is timing out at a higher rate than Gemini, undermining the active fallback (2026-09-04)

User asked to check logs on how recent scans were doing. Pulled real
Vercel runtime logs for the last 10 minutes (`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`,
2026-09-04T22:02:51–22:12:51 UTC) rather than answering from the panel
or from memory of prior sessions' cluster data.

**Volume**: 23 real `POST /api/identify` calls in ~10 minutes — an
active stream session.

**Gemini**: 4 of 23 timed out (~17%, aborted at the `GEMINI_TIMEOUT_MS
= 5000` wall) — consistent with the ongoing failure rate documented
elsewhere in this file, nothing new on its own.

**The new finding — Haiku's own reliability, checked independently of
whether it was needed as a fallback**: tallied every
`[haiku-shadow-test]` line's `haiku=` result across all 23 calls (not
just the 4 where Gemini failed), since Haiku fires in parallel on every
scan regardless. **12 of 23 (52%) came back `{"error":"This operation
was aborted"}`** — Haiku timing out at its own `HAIKU_TIMEOUT_MS =
5000` wall more often than not, on scans where Gemini succeeded fine.
This is a materially worse failure rate than Gemini's in this same
window (52% vs. 17%) and had not been reported before — the shadow-test
tally elsewhere in this file only tracked Haiku's *accuracy* when it
succeeded, not its own raw completion rate.

**Direct consequence for the active fallback (the exact feature test
#70 flagged as "1 data point, inconclusive")**: of the 4 real Gemini
failures in this window, **3 of 4 also had Haiku time out at the same
moment** — both providers dead together, degrading to the generic
`{found:false, error:"gemini-failed", haikuFallbackError:...}` response
(no `reason` field, so the extension shows its generic default
"Couldn't identify the card" text per the established test #68 rule —
confirmed by reading `api/identify.js:2060-2066` directly, not
assumed). Only **1 of 4** got a real Haiku fallback response
(`cardName="Wattrel"`, Medium confidence, `cardNumber=null`) — and even
that one still failed to produce a match: PPT returned 21 candidates,
none scored above `MATCH_FLOOR` (`bestScore=0`, `tieCount=20`, no
number to try the page-2/combined-search fallbacks with since Haiku
read `cardNumber=null`), so it degraded to the same honest "couldn't
confidently match" message as test #70's Wailord case — contained, but
not a genuine rescue either. **Net effect this window: the active
fallback recovered 0 of 4 real Gemini failures into an actual match.**

**Assessment**: this reframes the open fallback-status question from
test #70. It's no longer only "the one real fallback firing was wrong";
it's that **Haiku's own uptime, at least in this window, is the
bottleneck** — a fallback that is itself unavailable roughly half the
time can only rescue a minority of the failures it exists for, before
even getting to whether its read is accurate. One 10-minute window is
not enough to call this a lasting trend (could be a transient Anthropic-
side slowdown, same class as the Gemini `503 "high demand"` cluster
documented elsewhere in this file) — but it's a second real, concerning
data point in the same direction as test #70, not a contradicting one.
No action taken beyond recording this — CLAUDE.md/ROADMAP.md updated to
reflect both data points together.

## Test #72 — Ferrothorn scan showed "NO LIVE PRICE" for a card the user confirmed has real, visible pricing on TCGplayer (2026-09-04)

User flagged a Ferrothorn - 145/086 (SV11W: White Flare) scan: correct
card identified (High/High, clean match, `tieCount=1`), but pricing
showed "🔴 NO LIVE PRICE: TCGplayer price-history request failed for
productId=636698: This operation was aborted" — and linked the real
TCGplayer product page (`tcgplayer.com/product/636698`) as proof
pricing data genuinely exists there. Investigated via real logs before
concluding anything, per the standing convention.

**Confirmed via logs** (`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`,
2026-09-04T22:25:50 UTC): the card match was correct and clean
(`bestScore=29`, `tieCount=1`) — this was purely a pricing-fetch
failure, not a matching bug. `[lookup] LIVE TCGPLAYER PRICING FAILED:
TCGplayer price-history request failed for productId=636698: This
operation was aborted` — an `AbortController` timeout
(`fetchWithTimeout`, `api/identify.js:202-210`) against
`TCGPLAYER_PRICE_HISTORY_TIMEOUT_MS = 2500` (`api/identify.js:1232`),
with no retry on failure (`fetchTCGPlayerPriceHistory`,
`api/identify.js:1234-1241` — a single `try` that immediately throws on
any abort/error). `[timing] lookup ms= 2579` — the lookup step took
just over the 2500ms wall, consistent with this exact request being the
one that got cut off.

**Confirmed the user's claim directly, independent of the logs**: live
`curl` against the exact same endpoint
(`infinite-api.tcgplayer.com/price/history/636698/detailed?range=quarter`)
returned **200 OK in 173ms**, with real sales data — Near Mint Japanese,
`marketPrice: "5.49"` — matching PPT's own cached `$5.51` for the same
product almost exactly. The data is real and the endpoint is normally
fast; this scan's specific request was a one-off slow response from
TCGplayer that happened to exceed the timeout, not a genuine "TCGplayer
has no data for this card" case. Also checked recent frequency: only
**1 occurrence** of `LIVE TCGPLAYER PRICING FAILED` in the last 2 hours
of runtime logs — not a systemic pattern, a rare transient blip.

**Assessment**: the "Key design principle" (honest failure over a
guessed number) worked exactly as designed here — no fabricated price
was shown, a clear warning was — but the specific wording ("NO LIVE
PRICE... request failed... aborted") can read as "TCGplayer has no
data" when the real story is "our own 2.5s budget was too tight for one
slow response." Given normal response time is ~170ms (2500ms is
generous ~14x headroom) and this fired only once in 2h, this looks like
genuine occasional network/latency noise rather than an undersized
timeout constant — but a single retry-on-abort would plausibly catch
most one-off cases like this for free, since a transient blip on one
attempt is unlikely to repeat immediately on a second. **Fix built, deployed, and pushed 2026-09-04** (commit `d8fd732`,
`dpl_9HeecDEMGF4uHcW7wxsPh7ffZ1x7`, aliased to
`whatnot-pokemon-identify.vercel.app`, pushed to GitHub `df0b2af..d8fd732`),
per explicit user go-ahead — a single retry after a timeout/abort on
`fetchTCGPlayerPriceHistory`'s fetch specifically (`api/identify.js`,
around line 1234), deliberately not touching the HTTP-error/invalid-
JSON/zero-SKU branches below it, which are real TCGplayer answers a
retry can't fix. Deploy checklist followed in full given this file's
history: read the full file in 3 chunks (each fitting the Read tool's
25000-token cap), wrote each to a scratch file, and diff-verified
byte-for-byte against the real source before deploying — this caught
the SAME recurring diacritic-regex transcription corruption documented
repeatedly elsewhere in this file on the very first attempt (chunk 2
came out with literal Unicode combining characters instead of the
source's `̀-ͯ` escape sequence), fixed non-generatively by
splicing the exact byte-correct line from the source via a small Python
script (not retyping), then re-diffed clean. Final assembled file
matched the local source byte-for-byte (`sha1
8a0707337dda0f53cd63055b06a809a42be7f936`, identical before and after
assembly). Confirmed live post-deploy: build log shows exactly 3 files
downloaded; `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (the diacritic regex
deployed intact); `POST {}` returns the real `400
{"error":"Missing imageBase64"}`; runtime logs confirm both test
requests plus real organic traffic (a clean Mimikyu V match) were
served by the new deployment within a minute of going live. **Not yet
confirmed via a live rescan that actually hits this exact abort path**
— this fix has no accuracy claim to verify beyond the deploy itself;
real confirmation would be a future TCGplayer-fetch abort recovering on
its retry instead of surfacing `pricingError`, visible as a new
`[tcgplayer-price]` success line immediately following a
`This operation was aborted` line for the same productId in the logs.

## Test #73 — "This card couldn't be properly identified after 4 tries" (Slakoth, Japanese) — confirmed as the known PPT catalog-coverage gap, not a new bug (2026-09-04)

User reported a Japanese Slakoth (screenshot showing "No printing in our
database has the exact card number that was read (\"068/066\")") failed
to properly identify across 4 rapid clicks. Pulled real logs for all 4
scans (`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`, 22:45:24–22:45:36 UTC) rather
than accepting "couldn't identify" at face value.

**All 4 Gemini reads succeeded (no timeouts) and were highly
consistent** — every attempt read `cardName="Slakoth"`,
`hp="60"`, `attackName="のんびりする"` ("Take It Easy") at High
confidence; 2 of 4 also read `cardNumber="068/066"` (the other 2 read
`null` for that field only — plausibly a hard angle on a small number,
not a hallucination, since every other field agreed across all 4).
This is NOT the read-instability pattern from tests #50/#63/#67 (no
invented/contradictory values) and NOT a Gemini/Haiku-fallback issue
(Gemini never failed, so the fallback never needed to fire — separate
from today's tests #70/#71 concerns).

**Root cause, confirmed via logs**: PPT's real "Slakoth" + `language=
japanese` search returned 16 raw candidates, none numbered `068/066` —
confirmed exhausted via the full fallback chain (page-1+2 pagination
condition didn't even trigger, since raw count was 16 not a full 30;
the combined name+number search `"Slakoth 068/066"` ran and returned 0
candidates). On the 2 scans that read `cardNumber=null`, the tie
degraded to `AMBIGUOUS MATCH` instead (`bestScore=6, tieCount=5`) —
same underlying gap, different note text depending on which field
Gemini managed to read that click. Both are the same, already-
documented **PPT catalog-coverage gap** class as tests #35/#37/#49/
#60/#66 — a real Japanese promo/starter-deck printing (denominator 66
suggests a small theme-deck-style set) that simply isn't in PPT's
catalog, not a matching-code bug or a Gemini misread.

**Not a false-confidence miss**: every one of the 4 responses correctly
showed Low confidence with the honest disclosure note and a genuine
(if wrong-printing) $0.99 candidate/price — the "Key design principle"
worked as intended each time. "Couldn't be properly identified" is a
fair plain-language description of 4 consecutive Low-confidence misses,
even though the API technically returned `found:true` each time rather
than a hard failure — worth knowing the distinction, but not something
to fix; no false certainty was ever shown.

**No code change** — this is the known, already-accepted PPT-coverage
limitation (a hand-maintained set-total-to-set-name map was
considered and explicitly deferred in test #60, not to be built
without sign-off). Recorded as a new data point in that same class,
distinct from the Haiku-fallback questions raised in tests #70/#71
earlier today.

## Test #74 — Answering the open question from tests #70/#71: has Haiku's timeout rate been sustained since deploy, or was it one bad window? Real answer: unanswerable beyond ~1 hour back — Vercel Hobby-plan log retention (2026-09-04)

User asked the one open analytical question nobody had answered yet:
was test #71's 52% Haiku timeout rate a brief 10-minute blip, or has it
been consistently bad since the active-fallback deploy
(`dpl_AwfeEUnSthwazAFHvvpLPsn9Ayjy`, 2026-09-03T11:25:28 UTC)? Pulled
real logs to check, walking backward in time from now.

**What the retained logs actually show**: extended the window well past
test #71's original 10 minutes — 22:03:38 to 22:47:54 UTC today
(~44 minutes, 129 total `[haiku-shadow-test]` samples spanning both the
pre-deploy-fix and post-deploy-fix (test #72) traffic) — and the
failure rate held essentially steady: **69 of 129 (53.5%)**, consistent
with test #71's original 52% (12/23). Not a brief blip within anything
actually checkable — it was sustained for at least this entire retained
window.

**But the real, decisive finding is a hard constraint, not a trend**:
querying anything older than ~1 hour back (attempted `until=2026-09-
04T22:03:38Z`, well short of the 2026-09-03 deploy) returned Vercel's
own explicit message: *"No logs found. The requested window likely
exceeds your plan's runtime-log retention (Hobby 1h, Pro 1 day,
Enterprise 3 days)."* This project's Vercel team is confirmed on the
Hobby plan (`list_teams` → `"plan": "hobby"`). **Vercel's runtime logs
are only retained for 1 hour on this plan — full stop.** The
deploy-to-now comparison the user actually asked for (is this sustained
since 2026-09-03T11:25 UTC, ~35 hours ago?) is not just hard to answer
from logs — it is now structurally impossible, permanently, for
anything before roughly the last hour. Test #70's and #71's original
incidents are safe (their raw log lines are already quoted verbatim in
this file), but no future session can re-query them, and this same
1-hour wall will apply to every future investigation in this project
going forward, not just this one.

**Honest answer to the user's question, given that constraint**:
confirmed sustained (not a blip) for the ~44 minutes of history that
still exist; genuinely unknown, and now unknowable via Vercel logs,
whether it was also bad in the ~34 hours before that. Doesn't change
the "two data points, not enough to decide" status from tests #70/#71
— if anything it weakens confidence in ever assembling a longer trend
this way, since roughly 34 of every 35 hours' worth of history
evaporates within the hour.

**Recorded as a new standing constraint** (see "Known gotchas" in
CLAUDE.md) rather than something to fix reactively — if longer-horizon
trend-watching on this Haiku-fallback question (or anything else) turns
out to matter enough, the real options are: upgrade to Vercel Pro
(1-day retention), or start persisting a lightweight log/summary
outside Vercel (e.g. appending a running tally to this file after each
live-checked session, which is close to what's already happening
manually). Neither decided nor needed yet — flagging only.

## Test #75 — Are Haiku's shadow-test failures real timeouts or something else? Answer: 100% genuine timeouts, bimodal latency, no rescue evidence either way (2026-09-04)

User is weighing keep/tune/revert on the active fallback (tests #70/
#71/#74 all pointing the same direction) and asked one specific,
decision-relevant question before deciding: when Haiku fails in the
shadow-test logs, is it consistently hitting the `HAIKU_TIMEOUT_MS =
5000` wall (a pure latency problem) or something else (rate limit, API
error, fast failure)? Pulled the exact `haikuMs` values and error text
for every failed `[haiku-shadow-test]` line from the two saved log
batches behind tests #71/#74 (129 total samples, 22:03:38–22:47:54 UTC
today) — no new live query needed, this data was already captured.

**Answer: unambiguous, no ambiguity at all.**

- **Error message**: all 69 failures, zero exceptions, are the exact
  same text: `"This operation was aborted"` — no rate-limit responses,
  no HTTP error statuses, no auth/model-availability errors, no
  unparseable-JSON errors. Every single Haiku failure in this sample is
  a genuine client-side timeout, not a distinct error class.
- **`haikuMs` distribution for the 69 failures**: tightly clustered at
  `5001, 5002(×25), 5003(×32), 5004(×8), 5006, 5007` — i.e. every one
  aborted within 7ms of the 5000ms wall, exactly as `fetchWithTimeout`'s
  `AbortController` is coded to do (`api/identify.js:202-210`).
- **`haikuMs` distribution for the 60 successes, for contrast**: min
  2024ms, median 2749ms, mean 2880.5ms, **max 4988ms**. This is the more
  interesting finding: there is a hard, clean gap between "successful
  and comfortably under 5s" (nothing above 4988ms) and "aborted right
  at 5000ms" (nothing below 5001ms) — no smooth continuum of near-misses
  in the 4900-5000ms range. That bimodal shape is suggestive (not
  proof, only 129 samples from one evening) that the failing calls
  aren't merely "just a bit too slow" — something (queueing,
  backend-side retry, throttling-adjacent delay) likely pushes them well
  past 5s, which a modest timeout bump might not actually catch.

**Real, honest limitation**: because every failure is a hard client
abort, the TRUE completion time for those 69 calls is unknown and
unknowable from these logs — the abort truncates measurement at
exactly 5000ms regardless of whether the real answer would have arrived
at 5100ms or 20000ms. The bimodal shape above is a hint, not proof,
that raising `HAIKU_TIMEOUT_MS` wouldn't rescue most of them. The only
way to know for certain is a live, out-of-band test hitting Anthropic's
API directly with no artificial timeout to measure the real tail — not
run here (real API cost, and per explicit instruction this was research
only, no build/deploy).

**Recommendation given to the user** (their call to make, not decided
here): **(a) keep as-is** is the safest default on current evidence —
it's additive, always disclosed (`visionProvider: "haiku-fallback"`),
never regresses below the pre-fallback honest-failure behavior, and
still rescues a real (if partial, and worse-than-average during
simultaneous-failure moments per test #71) fraction of Gemini failures
at zero cost when unused. **(b) tune `HAIKU_TIMEOUT_MS`** is the most
evidence-motivated experiment given the 100%-timeout finding, but two
things cut against just raising it blindly: the bimodal gap above
suggests it may not help much, and the app's own explicit design goal
(the "SPEED" comment at the top of `api/identify.js`: ~2-5s so a result
is still useful for a live buy/bid decision) means a rescued read that
now takes 8-10s+ may be technically "successful" but practically
useless for the actual use case — recommend gating this behind the
out-of-band latency probe above rather than picking a new timeout
value blind. **(c) revert to Gemini-only** is a legitimate
simplification if the complexity isn't judged worth a currently-partial,
correlated-failure safety net — a values call the data doesn't resolve
on its own. No code change made; awaiting the user's decision.

## Test #76 — 10-minute production window during a heavy scanning session (2026-09-04, 23:29–23:39 UTC)

User ran many scans back-to-back; checked real logs for the window
(`23:29:19–23:39:19 UTC`) rather than relying on the panel alone.

**Volume**: 49 real scans in 10 minutes — a genuinely busy session, ~2x
test #71's 23-scan window.

**Gemini/Haiku, consistent with the recent decision (tests #70/#71/
#75)**: 7 of 49 Gemini timeouts (14%, in line with the established
rate). Haiku's own completion rate: 23 succeeded / 26 timed out (53%
failure) — a third window landing right at the same ~52-54% figure from
tests #71/#75, not a new data point that would change anything, just
further confirmation of the pattern the "keep as-is" decision already
accounted for. Of the 7 Gemini timeouts, 3 got a real Haiku-fallback
rescue and 4 had both providers fail together — a somewhat *better*
rescue ratio (43%) than test #71's window (25%), consistent with this
being noisy/variable rather than a stable number worth re-deciding
over.

**New observation this window — match-quality mix**: checked cardName
variety behind every warning rather than assuming repeats, since past
sessions (e.g. test #73's Slakoth) had a few cards inflating counts via
repeat clicks. This time it's genuinely broad: **32 distinct card names
across 49 scans**, and the 17 `AMBIGUOUS MATCH` instances +
5 `NO NUMBER MATCH IN POOL` instances are spread across 16 and 5
distinct cards respectively (only one card, Mega Gardevoir ex, hit
`AMBIGUOUS MATCH` twice) — not a handful of cards driving the count via
rescans. That's **22 of 49 scans (45%) landing in some Low-confidence
warning state** this session — notably high, though every one of them
is the existing honest-disclosure design working as intended (a real,
if wrong-printing, price shown with an explicit warning — no false
certainty anywhere in this sample; zero `pricingError`s, zero
`notFound`s). Most of the affected names are modern ex/V-era cards
(Mega Gardevoir ex, Zekrom ex, Cobalion ex/GX, Mega Lucario ex/EX,
Zarude V, Hoopa V, Hisuian Decidueye V) — plausibly a real batch of
naturally tie-prone same-HP/same-attack printings from whatever set(s)
were on stream this session, consistent with the already-documented
structural tie-break weakness (see the Trainer/Supporter tie-break
discussion and the general V/VMAX/ex reprint-tie pattern elsewhere in
this file) rather than a new bug — no code in the scoring/matching path
changed since the last confirmed-clean session. Not deep-dived per
card (would need 16+ individual log pulls); flagged as a real, higher-
than-usual ambiguous-tie rate worth keeping in mind if it recurs, not
as an action item today.

## Test #77 — Continued heavy-scanning window, 23:40–23:50 UTC (2026-09-04)

Immediate continuation of test #76 (contiguous window, no overlap:
23:40:23–23:50:23 UTC). 50 more real scans.

**Gemini timeout rate ran a bit hot this window — 12/50 (24%)**, above
the ~14-17% baseline from tests #71/#76. Checked whether this was a new
failure mode (like the `503 "high demand"` type documented earlier in
this file) — it wasn't: **all 12 are the identical genuine timeout**
(`"This operation was aborted"`, 5001-5003ms, right at
`GEMINI_TIMEOUT_MS=5000`). Same known failure class, just a somewhat
elevated rate this window — plausibly normal variance (sample sizes
this small swing a lot; 24% of 50 vs 14-17% of 23-49 isn't a huge
absolute gap), not evidence of a new problem. Worth a mention in case a
future window shows the same elevated rate again.

**Haiku, consistent with the decided-and-closed status**: 23/50 failed
(46%) — same pattern, no new information, no action taken (per the
2026-09-04 decision in CLAUDE.md). Of the 12 Gemini timeouts, 7 got a
real fallback rescue and 5 had both fail together (58% rescue ratio —
the third different ratio seen across tests #71/#76/#77, underscoring
that this specific number swings a lot session to session and isn't
worth chasing further).

**Match quality, same continuing pattern as test #76**: 31 distinct
card names across 50 scans; the 9 `AMBIGUOUS MATCH` + 9 `NO NUMBER
MATCH IN POOL` instances are spread across 8 and 7 distinct cards
respectively (only `Zeraora VMAX` and `Mewtwo` repeated within their
category) — genuinely broad, not a few rescanned cards inflating the
count, same as test #76. 18/50 (36%) landed in a Low-confidence warning
state — in the same range as test #76's 45%, not a new or worsening
trend, still zero `pricingError`s and zero false-certainty results.

No action items from this window; recorded to keep the running picture
current per the user's own "casual log-checks" cadence.

## Test #78 — Continued heavy scanning, ~9-minute window, and the Gemini timeout uptick is now a 2-window trend, not noise (2026-09-04, 23:49–23:58 UTC)

Roughly contiguous continuation of tests #76/#77 (small ~1-minute
overlap with #77's tail end, not deduplicated — negligible at this
sample size). Volume nearly doubled again: **100 scans in ~9 minutes**
(hit the query's 100-result cap).

**Gemini timeout rate: 24/100 (24%) — same elevated rate as test #77
(12/50, 24%), not test #76's baseline (14%).** Two consecutive
independent windows landing at the identical 24% figure, covering
~150 scans over ~19 minutes, is enough to stop calling this "small-
sample noise" the way test #77 provisionally did — this looks like a
real, moderate uptick from the earlier ~14-17% baseline (tests #70/
#71/#76), not yet confirmed as a lasting trend (still just this one
session), but no longer dismissible either. **Checked and it's still
the same known failure type** — every failure message is the identical
genuine `"This operation was aborted"` timeout at the
`GEMINI_TIMEOUT_MS=5000` wall; no `503 "high demand"` or other new
error class reappeared. If this rate holds up in a future session, it
may be worth revisiting the `thinkingLevel`/timeout research history
already tracked in CLAUDE.md's "Immediate next step" — not done here,
just flagged.

**Haiku and rescue ratio, consistent with the closed decision**: ~54%
Haiku failure (in line with tests #71/#75/#76/#77); roughly 14 of the
Gemini timeouts got a real fallback rescue, consistent with the ~55-58%
rescue ratio seen the last two windows. No new information, no action
per the 2026-09-04 "keep as-is" decision.

**Match quality, same continuing pattern**: 30 distinct card names; the
20 `AMBIGUOUS MATCH` + 14 `NO NUMBER MATCH IN POOL` instances span 10
and 7 distinct cards respectively (most hit exactly twice each this
round, consistent with the user scanning each card twice rather than
one card being scanned 10+ times) — still broad, not concentrated.
34/100 (34%) landed in a Low-confidence warning state, in the same
range as tests #76/#77; zero `pricingError`s, zero false-certainty
results.

**Net for this check**: only the Gemini timeout-rate uptick is worth
carrying forward as something to keep watching specifically (now a
2-window pattern); everything else (Haiku behavior, match-quality mix,
pricing) is steady-state, already-understood behavior.

## Audit: scan accuracy and scan speed, full pipeline review (2026-09-05, research only — no code changed)

User asked for a real, evidence-backed audit of accuracy and speed with
prioritized recommendations, explicitly NOT a build — grounded in this
file (tests #50-78), ROADMAP.md, and fresh log data pulled live during
the audit rather than re-litigating settled decisions (Haiku
keep-as-is, thinkingLevel=minimal, PPT coverage gaps were all treated
as closed per explicit instruction).

**Fresh data pulled this session**: real `[timing]`/`[haiku-shadow-test]`
Vercel runtime logs, production, 100 requests,
**2026-09-05T00:22:27–00:47:38 UTC** (a live scanning session happening
during the audit itself, spanning deploys `dpl_9HeecDEMGF4uHcW7wxsPh7ffZ1x7`
and `dpl_AbrKkW5kAtzPpk3QRwMELtH2fCTq`).

### Speed findings

**Real latency breakdown** (100 Gemini samples, 92 completed lookups):
Gemini call ms — min 1720, median 3953, mean 3760, max 5007. Lookup ms
(PPT search + TCGplayer price, combined, no sub-breakdown exists) — min
77, median 142, mean 190, max 1050. Total ms (successful) — min 1855,
median 3777, mean 3887, max 6051. Confirms and sharpens the 2026-09-01
research: Gemini is ~95%+ of end-to-end latency; lookup is not a real
lever (20-40x faster than Gemini already). Noted gap: the `lookup ms=`
bucket bundles PPT pagination and the TCGplayer price fetch with no way
to tell which sub-step to blame if it ever became slow — not worth
splitting today given how small the whole bucket is.

**New, escalating data point — Gemini timeout rate**: **40 of 100 Gemini
calls timed out (40%) + 2 more `503 "high demand"` errors (42% total
failure)** in this 25-minute window — a THIRD independent window, not
test #78's already-flagged 24% two-window pattern (tests #77/#78,
~50 minutes earlier the same evening), and nearly double it. The `503`
error type reappearing is the same one last seen only in the severe
2026-09-03 cluster. All 40 timeouts are still the identical genuine
`"This operation was aborted"` at the `GEMINI_TIMEOUT_MS=5000` wall — no
new failure shape, just a materially higher rate. This crosses the
threshold CLAUDE.md's own "Immediate next step" already set for
revisiting the `thinkingLevel`/timeout research — flagged as the
single highest-priority open item from this audit, not acted on (research
only, per explicit scope).

**Haiku fallback, same window — good news, supports the 2026-09-04
decision rather than reopening it**: Haiku's own failure rate was 32%
(better than the ~52-54% in tests #71/#75/#76/#77), and **all 42 real
Gemini failures this window got a completed Haiku fallback response —
0 overlapped with a Haiku failure** (a reversal from test #71's "3 of 4
died together"). One read worth flagging, same class as test #70's
Wailord miss and not a new decision point: a fallback response read
`cardName: "Pikakazam"` (not a real card) on a slab scan — plausibly a
Haiku hallucination. The 2026-09-04 "keep as-is" decision already priced
in exactly this risk class as acceptable given the fallback's strictly
additive/safe design.

**PPT page-1/page-2 parallelization**: confirmed via code read
(`lookupCardPPT`, `api/identify.js:1452+`) the chain is sequential and
deliberately so — pre-firing page-2 in parallel on every scan would
double PPT credit cost on the majority of scans that never need it, to
save at most a few hundred ms against a lookup step that's already only
~150ms median. Idea, but the real timing + real rate-limit data (2026-09-01
research) both argue against it.

**Caching repeat scans**: real repeats do occur (42 distinct card names
across ~100+ reads this window, consistent with the project's own
established rescan pattern), but since lookup is already ~150ms median,
caching is a rate-limit/credit lever, not a speed lever — nothing new
beyond the existing 2026-09-01 research option 2.

**Prompt/schema token reduction**: real usage data (a Marill scan)
showed `promptTokenCount=1551`, of which **1100 are fixed image tokens**
(from `media_resolution: HIGH`, independent of prompt length) — the
prompt text + schema is only ~451 tokens. Halving it saves at most
~150-200 tokens (~10-13% of input) with no evidence of any latency
effect (thinkingLevel is already "minimal"). Not worth the risk of
clipping wording that's currently doing real work.

### Accuracy findings

**Image resolution — a real blind spot, not yet a confirmed fix**:
`extension/content.js`'s `captureFrame()` (line 345-376) captures at the
video element's native `videoWidth`/`videoHeight`, only downscaling if
the longer edge exceeds `MAX_CAPTURE_DIMENSION=1280`. Nothing has ever
logged what that native resolution actually is on a live Whatnot stream
— a cheap, real diagnostic (log `videoWidth`/`videoHeight` + post-scale
dimensions once per scan) would settle whether raising the 1280 cap
could possibly help before touching it, especially since
`media_resolution: HIGH` already gives Gemini a fixed ~1120 image
tokens regardless of input pixel count on `gemini-3.6-flash` per the
code's own sourced comment — meaning more input pixels than the
encoder's own canonical resolution may be a no-op. Also found:
`captureFrame()` never sets `ctx.imageSmoothingQuality` before the
downscale draw — a free, zero-cost `"high"` setting whenever downscaling
actually happens.

**Scan-area cropping — the most concrete new finding this pass**:
confirmed crop happens on native pixel coordinates BEFORE any resize
(so tighter crops should only ever help resolution), but `scanZone` is a
**static, one-time-drawn rectangle** that does not track a moving card,
and — confirmed by reading `startZoneSelection()` (content.js:267-326)
— the selection box is only rendered during the drag gesture and
removed immediately on mouseup. Once set, there is **zero persistent
visual feedback** showing where the box currently sits relative to the
live video. This is a much better explanation for "a card held at a
distance in a cluttered frame failed constantly" than a resolution
ceiling: if the card moves after the box was drawn, every subsequent
Identify click silently crops the wrong region (possibly clipping the
card out entirely) with no way for the user to notice before clicking —
a stale tight crop can be worse than no crop. Low-risk fix: render a
persistent, low-opacity outline of the active scan zone over the video
at all times, not just while dragging. Auto-tracking a moving card would
need real object detection — a genuine ceiling, not proposed.

**Shared prompt wording**: the "same single card being held up or
highlighted" phrasing (test #70's hypothesis) is unchanged, and no new
evidence this session ties to it (the fresh Haiku-fallback reads pulled
look like single-card low-legibility misses, not multi-card mix-ups) —
correctly left alone per explicit instruction not to act on unproven
ideas. New finding: across 106 real `read=` log blocks this session,
**`setName` was populated only 10 times (~9%)** — including on a clean,
unambiguous, High-confidence, `tieCount=1` match (Marill 204/193) where
it was still `null`. `GEMINI_PROMPT` gives explicit "spend extra effort"
instructions for `cardNumber`/`hp` but zero instruction at all for
`setName`, even though it's already wired into scoring
(`SCORE.set=3`, `api/identify.js:812-815`) and is precisely the signal
that would help disambiguate the dominant real failure class right now
— same-name/same-HP/same-attack reprint ties across different sets
(V/VMAX/ex era), which tests #76-78 already documented at a 34-45%
ambiguous-tie rate. Low-risk fix: one added sentence asking for the set
symbol/name near the card number — additive only, no schema/scoring
change, can't introduce false confidence since illegible still returns
null.

**Matching/scoring logic**: reviewed `numbersMatch`/`scoreCandidate`/
`pickBestCandidate` in full. Checked whether `attackName`'s exact-string
match (line 817) is at real risk from PPT-side formatting (e.g. damage
numbers baked into the name) — confirmed `normalizePptCard` already
strips these (real logged examples are clean: "Bubble Drain", "Curly
Terrain") — no evidence of a real bug here, a theoretical risk that
isn't manifesting. No other unused-but-fetched signal found beyond
`rarity` (already shipped) — the setName-prompt gap above is the one
concrete, evidence-backed matching improvement this pass surfaced.

**Ceiling vs. fixable**: PPT catalog-coverage gaps and inherent OCR
difficulty on small/angled/slabbed text remain real external ceilings,
not revisited here per explicit instruction.

### Prioritized recommendations (none built — awaiting individual go-ahead)

1. Revisit the `thinkingLevel`/`GEMINI_TIMEOUT_MS` question given the
   fresh 40-42% failure window (decision conversation, not a code change
   by itself).
2. Log `video.videoWidth`/`videoHeight` + post-scale dimensions once per
   scan (cheap diagnostic).
3. Render a persistent scan-area outline over the live video (low-risk
   UI fix).
4. Add set-symbol/set-name guidance to `GEMINI_PROMPT` (low-risk,
   additive).
5. `ctx.imageSmoothingQuality = "high"` on the capture canvas (trivial).
6. Not recommended given current data: PPT page-1/2 parallelization,
   caching as a speed lever, prompt/schema token trimming, attackName
   fuzzy-matching.

## Test #79 — Severe, sustained live Gemini failure cluster, confirmed ongoing in real time (2026-09-04/09-05, ~00:00-01:01 UTC)

User independently noticed a heavy run of Gemini timeouts + double-failures
(both Gemini and Haiku dead) + at least one 503, within ~15-20 minutes of
their message, and asked for an urgent real-log check plus a concrete
keep/tune/revert recommendation — not just more logging. This follows
directly from today's earlier audit (which caught a 40-42% window an hour
before this) and test #78's already-flagged 24% two-window pattern.
CLAUDE.md's own "Immediate next step" already named this exact scenario
("if a future session reproduces ~24%+ or worse") as the trigger to
revisit, not just log — this is that trigger, confirmed with real numbers.

**Methodology note, worth keeping**: the first pass at this query used
`query="[timing]"` as the log filter, which structurally MISSES every
double-failure request — `[timing] gemini ms=` only fires on the success/
fallback-success path (`api/identify.js` ~line 2103), not on the early
`return` in the Gemini-failed-and-Haiku-failed branch (line ~2094). That
first pass showed 0 double-failures across 30 minutes, which was wrong —
re-querying with the actual log strings (`"Gemini call failed"`, `"Gemini
failed and Haiku fallback unavailable too"`, `"using Haiku fallback
read"`, `"Gemini read:"`) surfaced the real picture. Any future timeout-
rate check should query these strings directly, not `[timing]`.

**Real numbers, six sequential ~10-minute windows,
2026-09-04T23:59:02Z-2026-09-05T00:59:02Z, plus a final freshest 5-minute
check ending 01:01:20Z**:

| Window (UTC) | Total | Gemini fail | Fail % | Double-fail | Rescued |
|---|---|---|---|---|---|
| 23:59-00:09 | 5 | 1 | 20% | 1 | 0 |
| 00:09-00:19 | 54 | 34 | 63% | 14 | 20 |
| 00:19-00:29 | 50 | 42 | 84% | 16 | 26 |
| 00:29-00:39 | 52 | 26 | 50% | 16 | 10 (+4x 503) |
| 00:39-00:49 | 52 | 28 | 54% | 22 | 6 |
| 00:49-00:59 | 14 | 11 | 79% | 8 | 3 |
| Last ~5 min (00:56-01:01, freshest) | 12 | 10 | 83% | 5 (50%) | 5 (50%) |

Every single failure across all windows is still the identical
`"This operation was aborted"` timeout at `GEMINI_TIMEOUT_MS=5000` (plus
4 confirmed `503 "This model is currently experiencing high demand"`
errors in the 00:29-00:39 window) — no new failure shape, just a much
higher rate than anything previously documented outside the 2026-09-03
cluster, sustained far longer (~60+ min here vs. that cluster's ~9 min)
and with meaningfully worse Haiku-rescue coverage (double-failure share
of all Gemini failures ran 20-73% across these windows, vs. 0% during
the 2026-09-03 cluster, where Haiku rescued all 13 failures).

**Confirmed ongoing, not tapering**: the freshest window (last 5 minutes
as of the check) shows 83% failure — the highest instantaneous rate of
any window measured, not a decline.

**Ruled out as self-inflicted**: spans two production deployments
(`dpl_9HeecDEMGF4uHcW7wxsPh7ffZ1x7` and the flag-feature deploy
`dpl_AbrKkW5kAtzPpk3QRwMELtH2fCTq`, confirmed via `list_deployments`)
that differ only by the unrelated flag-endpoint addition — no Gemini-
calling code changed between them. Request volume this session (~5/min)
is also lower than test #78's 24%-failure window (~11/min), arguing
against "our own traffic volume is the cause." This looks like a genuine
Google-side Gemini reliability event, same signature class as the
2026-09-03 cluster.

**Recommendation given to the user (research only — nothing deployed)**:
do NOT revert `thinkingLevel` to `"low"` — it is already at `"minimal"`
(the fastest setting) and Gemini is still failing 50-84% of calls at
that setting; raising it back would add thinking-token latency on top of
calls already blowing the 5000ms wall and, per the 2026-09-01 finding
(31 timeouts in 25h at `"low"`, no confirmed accuracy benefit), would
plausibly make the failure rate worse, not better, mid-cluster. A
`GEMINI_TIMEOUT_MS` bump (e.g. 5000->7000-8000ms) is the one lever with
real supporting logic — every failure aborts right at the wall
(5001-5007ms), consistent with the 2026-09-01 finding that these calls
are "just barely" too slow rather than genuinely hung — but this is
unproven for this specific event (no out-of-band probe exists to
confirm the real completion tail, same blind spot as test #75's Haiku
analysis) and trades directly against the 2-5s design target. **Primary
recommendation: wait, don't change code right now** — this matches the
2026-09-03 cluster's signature, which resolved on its own with no code
change; nothing here is self-inflicted, and the one obvious "fix"
(reverting thinkingLevel) is actively likely to make it worse. Decision
left to the user; no action taken.

## Research: hitting a 1-3s latency target for sudden-death auctions (2026-09-05, research only — no code changed)

User set a real product requirement — scans need to resolve in 1-3s
because they're often used in ~10s Whatnot sudden-death auctions — and
asked for a proper research pass on options, not a build. Analyzed
using real logs already pulled this session (2026-09-04 audit + test
#79 incident data, 208 unique request blocks — the most recent data
available given Vercel's 1h retention and no live traffic at research
time) plus fresh web research, since the last vision-provider comparison
in this file is ~7 months stale relative to today.

**Methodology finding, worth fixing later, not urgent**: the
`[haiku-shadow-test]` log line's `geminiMs` field
(`runHaikuShadowTest`, `api/identify.js:576+`) is mislabeled/unreliable
whenever Haiku is the slower of the two promises — the function awaits
`haikuPromise` first, then `geminiPromise`, so `geminiMs` ends up
measuring "however long we waited on the slower promise" in that case,
not Gemini's true completion time. `haikuMs` is unaffected (always
measured first). Any future session reusing this log line for Gemini
timing should cross-check against the main handler's own
`[timing] gemini ms=` line instead, or fix the label.

**1. Real comparative latency, successful calls only** (corrected for
the above): Gemini true success — n=76, min 1720ms, **median 2489ms**,
p90 4319ms, max 4776ms. Haiku success (any context) — n=91, min 2013ms,
**median 3470ms**, p90 4762ms, max 4964ms. This corrects the earlier
2026-09-04 audit's reported Gemini median of ~3953ms, which was
contaminated by blending true successes with mislabeled fallback-totals
(~5000ms each) from the same log line bug above — the real number is
meaningfully faster and closer to the 1-3s target than previously
stated. Head-to-head on the same frame where both succeeded (n=32):
Gemini was faster 72% of the time (avg 2605ms vs. Haiku's 3118ms);
Haiku won 28% of the time by a median margin of only 240ms.

**2. Racing evaluation — real, quantified accuracy risk, not just
speed**: of the 32 same-frame both-succeeded cases, full 10-field
agreement was only 6% (2/32) — but that's dominated by soft fields
(setName/stampType agree 91-94%, mostly because both return null).
`cardName` agreed 41%, `cardNumber` agreed only 22%. Breaking
`cardNumber` down further: 7/32 both null (trivial agreement), 20/32
had exactly one side null, and of the 5 cases where BOTH committed to a
specific populated number, **all 5 disagreed** (0 agreed) — one pair
was a flat-out different card identity (Gemini: "Timburr 109/101" vs.
Haiku: "Dodocolo 192/250"). Of the 9 cases where Haiku was the faster
provider, all 9 disagreed with Gemini on the full field set. Given
`cardNumber` is the dominant scoring signal (`SCORE.number=20`), racing
on raw completion time would frequently substitute a less-reliable read
for Gemini's with no way to detect it — a real risk, consistent with
the two already-documented Haiku-fallback misses (test #70's Wailord,
this session's "Pikakazam"). **Recommendation: do not race on time —
keep the current sequential-fallback design.**

**3. Continuous/background scanning**: architecturally the most
promising path to a "feels instant" click, but it hides latency rather
than reducing it. Real cost multiplier: 5-10x more Gemini/Haiku calls
for however long the loop runs during a stream. Real, more severe risk:
PPT's 60-calls/minute cap (confirmed live, 2026-09-01 research) — a
1-2s full-pipeline background loop alone would consume the entire
per-minute PPT budget, leaving nothing for pagination fallbacks. Real
mitigation, not built: scope background scanning to vision-only
(cache the raw read; defer PPT search + pricing, already only
~150-200ms, to the actual on-demand click). Real UX gap: no
card-in-frame detection exists today; a client-side frame-differencing
heuristic could reduce waste during genuinely idle stream time but is
unbuilt and imperfect (a motionless held-up card would also look
"unchanged").

**4. Fresh vision-provider check** (prior comparison in this file is
~7 months stale): **Gemini 3.5 Flash-Lite** (released July 2026) is
marketed as the fastest in the 3.5 line and is cheaper than the
`gemini-3.6-flash` in use today ($0.30/$2.50 per 1M vs. $0.75/$3.75) —
the lowest-effort real candidate, since `GEMINI_MODEL` is already an
env-var override in this codebase; no new integration needed, just a
shadow-test-style comparison. Public TTFT benchmarks for it were wildly
inconsistent between sources (10.9s vs. 2.7s) — almost certainly
measuring default "thinking" behavior this project's own code already
suppresses, so neither number should be trusted without a real live
test, same lesson as the original Haiku shadow test. **GPT-5.4/5.5
Mini** is now reported (fresh web research, not from this project's
~7-month-old comparison) as faster than Claude Haiku 4.5 on both TTFT
and sustained throughput and cheaper on output tokens — a real update,
but requires a full new provider integration, same scope of work as
the original Haiku build. Self-hosted specialized OCR models
(GLM-OCR, PaddleOCR-VL) reportedly beat frontier LLMs on raw OCR speed
but are a much bigger scope jump (self-hosted infra vs. this project's
thin-client/hosted-API design) — not a comparable same-day swap.
Sources: [Gemini 3.8 Flash — Artificial Analysis](https://artificialanalysis.ai/models/releases/gemini-3-8-flash),
[Gemini 3.5 Flash-Lite — OpenRouter](https://openrouter.ai/google/gemini-3.5-flash-lite),
[Gemini 3.5 Flash-Lite — Artificial Analysis](https://artificialanalysis.ai/models/gemini-3-5-flash-lite/providers),
[Introducing Gemini 3.6 Flash / 3.5 Flash-Lite — Google](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/),
[Fastest LLM API in 2026 — Kunal Ganglani](https://www.kunalganglani.com/blog/llm-api-latency-benchmarks-2026),
[Claude Haiku 4.5 vs GPT-5 Mini — CallSphere](https://callsphere.ai/blog/td30-anth-haiku45-vs-gpt5-mini),
[Best OCR Models 2026 — Reducto](https://reducto.ai/guides/best-ocr-models-accuracy-speed-cost).

**5. Honest ceiling assessment**: real data from this exact pipeline is
more trustworthy than public benchmarks here. Even at the fastest
shipped Gemini setting (`thinkingLevel: minimal`), true success-only
latency is ~1.7s best-case, ~2.5s median, ~4.3s at p90 — on a calm
night; test #79 showed the same call regularly hitting its 5s wall
during provider-side degradation. The PPT+TCGplayer lookup step is
already a rounding error (~150-200ms) — essentially all latency budget
is vision-model inference time, which prompt/schema trimming is
unlikely to meaningfully beat further (already tried, reflected in the
"minimal" thinking level). **Straight answer: 1-3s reliably, on every
fresh on-demand call, is not realistically achievable with any current
hosted cloud vision-LLM API** based on real measured data here. A
lighter model (Flash-Lite) might pull the median down — worth testing —
but the 1.7s best-case observed today is already close to what these
models can do; consistently hitting that as the *typical* case, not
just the lucky case, would be a first for this model class, not a
config change. The one strategy that can plausibly deliver a "feels
under 1s" experience is decoupling when the AI call happens from when
the user sees a result (item 3, background scanning) — paying today's
same ~2.5s latency continuously in the background so the click just
reads a cache. A faster model is a nice-to-have on top of that, not a
substitute for it.

**Prioritized options for the user to choose from** (none built): (1)
shadow-test Gemini 3.5 Flash-Lite — lowest effort, real data instead of
noisy public benchmarks; (2) do NOT race Gemini/Haiku on response time —
keep sequential fallback, given the accuracy risk above; (3) scoped
background scanning (vision-only, defer PPT/pricing to the click) —
the one path that can actually meet the requirement, needs an explicit
$ budget decision and a card-in-frame detection plan first; (4) new
GPT-5.4/5.5 Mini integration — real candidate, but full integration
effort, worth trying only after Flash-Lite; (5) accept and communicate
the honest ceiling if background caching isn't wanted — 1-3s isn't a
realistic promise for a strictly on-demand fresh call with current
cloud vision APIs.

**Build: Gemini 3.5 Flash-Lite shadow test — DEPLOYED AND PUSHED
2026-09-05** (commit `d4285c7`, `dpl_3gWk2KV9dc9mn7n3vzrjJP4zjpVW`,
aliased to `whatnot-pokemon-identify.vercel.app`; pushed to GitHub
`d6f6690..d4285c7`). Implements option 1 above — same non-disruptive,
read-only shadow-call pattern as the existing Haiku shadow test, gated
entirely on a new `FLASH_LITE_SHADOW_MODEL` env var (unset = complete
no-op). `identifyWithGemini()` now takes an optional `model` param
(defaults to `GEMINI_MODEL`, so every existing call site is
unaffected), letting the shadow call reuse it directly with
`"gemini-3.5-flash-lite"` instead of duplicating the function. Logs one
`[flash-lite-shadow-test]` line per scan with both models' reads,
per-field agreement, and independently-correct latency for each (see
below). Verified locally via a mocked-fetch smoke test before
deploying: response is byte-identical with the flag on vs. off (except
the always-random `requestId`), the Flash-Lite call only fires when the
env var is set, and a simulated Flash-Lite failure is caught and logged
without ever reaching the real response.

**Real bug found and fixed while building this, not yet fixed in the
original**: the existing Haiku shadow test's `geminiMs` field is
mislabeled whenever Haiku is the slower promise (it awaits sequentially
and stamps elapsed time only after each wait completes, so the second
stamp measures "however long we waited on the slower promise," not the
first promise's own time) — this directly explains why the earlier
2026-09-04 audit's reported Gemini median (~3953ms) was inflated
against the corrected ~2489ms found in the 2026-09-05 latency research
above. The new Flash-Lite shadow test avoids this via a `timePromise()`
helper that subscribes to each promise independently at creation time,
so its own `currentMs`/`flashLiteMs` figures are correct regardless of
which model finishes first. The Haiku shadow test itself was left
untouched (out of scope for this build) — documented in a comment for
whoever touches that pattern next.

**Deploy checklist followed in full**: read the full 2396-line source
across 4 chunks (fitting the Read tool's per-call cap), deployed via
`deploy_to_vercel` with 4 files (`api/identify.js`, `api/flag.js`,
`vercel.json`, `package.json` — build log confirms "Downloading 4
deployment files," matching this file set exactly). Confirmed `READY`;
live `GET /api/identify` returns `normalizeDiacriticTest: "pokemon
collector"` (the historically fragile diacritic regex deployed intact);
live `POST /api/identify {}` returns the real `400
{"error":"Missing imageBase64","requestId":"..."}`; runtime logs
scoped to this exact deployment ID confirm both test requests were
served by it.

**Not yet collecting data**: no Vercel MCP tool exposes environment-
variable management (confirmed via a thorough search of every tool this
session has access to — only `deploy_to_vercel`, `get_project`,
`update_project_deployment_protection`, and read-only log/deployment
tools exist, none of them env vars) — same real tooling gap as the
missing "fetch deployed source" gap noted in the GET debug endpoint's
own history. `FLASH_LITE_SHADOW_MODEL=gemini-3.5-flash-lite` still
needs to be added to Vercel's Production environment manually (same
step the Haiku shadow test needed for `ANTHROPIC_API_KEY` before it
collected any real data) before this shadow test produces any log
lines. Recommended volume before drawing a real conclusion: at least
50-100 real scans with both models succeeding, based on how few
same-frame comparisons (32) it took the Haiku shadow test to reveal a
stark, decision-relevant pattern.

**Env var added, redeploy confirmed needed and done, data collection
now CONFIRMED LIVE — 2026-09-05** (`dpl_AdJmrGEjVW1MJtcw9hqmY4TNEjcL`,
aliased to `whatnot-pokemon-identify.vercel.app`). User added
`FLASH_LITE_SHADOW_MODEL=gemini-3.5-flash-lite` to Vercel's Production
environment via the dashboard and asked whether a redeploy was needed —
confirmed yes: Vercel env vars are snapshotted into a deployment at
build time, not read live by an already-running Lambda, matching this
project's own precedent (the Haiku shadow test was "originally deployed
as `dpl_ERt8X...`" and only "confirmed collecting real data on
`dpl_C8BLG...`" — a different deployment, after `ANTHROPIC_API_KEY` was
added). Redeployed identical code (no changes, hash-verified against
the prior deploy before redeploying) purely to pick up the env var.
Deploy checklist passed (4 files, clean build, live `GET`/`POST` checks,
`whatnot-pokemon-identify.vercel.app` confirmed directly in the new
deployment's alias list).

**Confirmed via a real scan, not assumed** — per explicit instruction
not to repeat the `ANTHROPIC_API_KEY` gap where the env var silently
collected zero data for a while before anyone checked: sent a real
POST with a genuine (synthetic solid-color) JPEG straight to the live
endpoint and pulled the real runtime log line for that exact
`requestId`:

```
[flash-lite-shadow-test] requestId=06a9631e-f0f4-42a8-a517-ca34cc4f3c9c
currentModel=gemini-3.6-flash flashLiteModel=gemini-3.5-flash-lite
current={"error":"This operation was aborted"}
flashLite={"found":false,...,"reason":"No Pokemon card is visible in the frame."}
currentMs=5005 flashLiteMs=1596 flashLiteCostUsd=0.00077
```

Confirms the env var took effect (`flashLiteModel` correctly resolved),
the shadow call is a real, separate API call (real `_geminiUsage`
token counts, real cost), and — one data point only, not yet a
pattern — Flash-Lite completed correctly in 1596ms on the same frame
where the current model timed out at 5005ms. Data collection is now
genuinely live. Recommended volume before drawing a conclusion
unchanged: 50-100 real scans with both models succeeding.

### Test #80 (2026-09-06) — real batch: 3 user-flagged failures, plus a
strong same-window Flash-Lite signal

User ran a real scanning session on a live stream and used the "Flag"
feature (test #76/build above) on 3 scans that came back with no
result. Pulled via real Vercel runtime logs (`get_runtime_logs`,
window 2026-09-06T14:51-15:51 UTC), not assumed from the panel alone,
per this project's own "verify via logs" convention.

**The 3 flagged scans** (`requestId`s `854cd634…`, `6be4907a…`,
`4b36a451…`) are all the identical failure shape: the current model
(`gemini-3.6-flash`) timed out at the `GEMINI_TIMEOUT_MS=5000` wall
(`"This operation was aborted"`, 5002-5004ms), AND the Haiku fallback
timed out too (`"Gemini failed and Haiku fallback unavailable too"`) —
both primary and fallback down together, degrading to the generic
"couldn't identify" message per the existing, working contain-the-miss
design (same failure class as test #71's "0 of 4 rescued" finding, now
a third data point in that direction). **On all 3 of these exact
frames, the Flash-Lite shadow call succeeded** — High confidence,
plausible real card reads (Lapras/Crown Zenith, Walking Wake ex x2) —
in 1871-4051ms, comfortably under the 5s wall the other two providers
hit.

**Broader same-window data** (26 total scans logged in this ~1h
window, not just the 3 flagged ones):
- Current model (`gemini-3.6-flash`) timeout rate: **15/26 = 58%** —
  consistent with, and worse than, the elevated-failure pattern
  already flagged in tests #77/#78/#79 (24-84%); still reads as the
  same ongoing provider-side condition, not a new failure shape (no
  new error text observed).
- Haiku shadow/fallback: of those 15 Gemini failures, 13 also had
  Haiku time out at the same moment — **0 Haiku rescues in this
  window**, same direction as test #71 (0/4) and consistent with the
  2026-09-04 "keep fallback as-is" decision's own acknowledgment that
  it's "additive and safe" but not reliably a rescue.
- **Flash-Lite: 23/26 = 88% succeeded**, with most successful timings
  clustering **1.3s-2.7s** (several sub-2s) — meaningfully faster than
  the current model's frequent 5s timeouts, and squarely inside the
  1-3s latency target from the 2026-09-05 research. Only 3/26 Flash-
  Lite calls failed (all aborted at ~5000ms); 2 of those 3 coincided
  with the current model ALSO failing on the same frame (suggesting
  shared provider-side congestion at that instant rather than
  something Flash-Lite-specific), but the 3rd failed on a frame where
  the current model succeeded, so the correlation isn't total.

**Status**: this is real, decision-relevant progress toward the
recommended 50-100-scan volume (26 new data points this window, on top
of the earlier single data point) — genuinely promising on both axes
(higher completion rate AND faster than the current model in this
sample), but still short of that volume and only one session's worth
of traffic. **No action taken** — no code changed, nothing promoted;
this is exactly the kind of accumulating evidence the shadow test was
built to collect. Worth flagging to the user directly as a strong
early signal worth continuing to watch, not yet a "switch the primary
model" decision.

### Test #81 (2026-09-06) — fuller re-pull, and a real gap: no
healthy-Gemini comparison window exists in available data

User's explicit direction after test #80: stay in shadow-test/data-
collection mode only (no promotion, no code changes) — the 88%/58%
split is a strong signal, but it came from a single window during
what's been an elevated-failure period for the current model (tests
#77-#79), so it's unclear whether Flash-Lite is genuinely better or
just "any model that isn't currently degraded looks good by
comparison." Asked to: (1) check the current accumulated shadow-test
count across all windows, not just test #80's, and (2) specifically
look for a healthy-Gemini window in the data already collected.

**Re-pulled runtime logs** (`get_runtime_logs`, `query=flash-lite-
shadow-test`, `since=1h`) a few minutes after test #80. The 1h lookback
window shifted forward and now captures **49** real flash-lite-shadow-
test records (up from 26) — this supersedes, not adds to, test #80's
count: the two pulls overlap on the same underlying scanning burst
(same requestIds/timestamps reappear), just with a later cutoff
catching more of it. **Current running total of real, currently-
queryable shadow-test data points: 49**, plus the 1 already-documented
point from the 2026-09-05/06 deploy-confirmation scan (no longer
itself re-queryable — see "Known gotchas," Vercel Hobby's 1h retention
— but durably recorded above) — **~50 total**, right at the low end of
the recommended 50-100.

**Split on the fuller pull**: current model 17/49 = **35%** success
(65% failure); Flash-Lite 44/49 = **90%** success. This is *wider*,
not narrower, than test #80's 58%/88% split — because the later
cutoff captured more of the same active elevated-failure episode, not
less of it.

**Healthy-Gemini window check — none found, and a real structural
gap**: bucketed the 49 records into two 10-minute windows. Both show
the current model well below its documented ~14-17% baseline failure
rate (tests #70/#71/#76):
- 15:40-15:49: current model 10/22 (45% success, 55% failure)
- 15:50-15:54: current model 7/27 (26% success, 74% failure)

Every available bucket is degraded — **no healthy-Gemini comparison
window exists in the data collected so far.** (For reference, the
current model's own *successful*-call latencies in this window ranged
1806-4824ms, median ~2906ms — well above Flash-Lite's typical
1.3-2.7s, but this compares favorably-for-Flash-Lite numbers gathered
entirely during a bad Gemini stretch, exactly the confound in
question.) Because Vercel's Hobby-plan runtime logs retain only ~1h
(the same wall this project's own Haiku-timeout trend question hit in
tests #70/#71/#74), there's no way to look further back to check
whether an earlier healthy window this session or on a prior day
already has usable Flash-Lite data sitting in the logs — it's just
gone. **This is now a flagged, standing gap**: the 50-ish data points
collected so far are all from a degraded-Gemini period, so the
88-90%-vs-35-58% comparison cannot yet be trusted as "Flash-Lite is
better than healthy Gemini" — only as "Flash-Lite held up better than
Gemini during Gemini's bad stretch," a real but different finding.
**Next step, not yet done**: watch for a casual log-check during a
period when Gemini's failure rate looks back to its ~14-17% baseline,
and specifically capture flash-lite-shadow-test data from that window
before it rolls off the 1h retention window. No code changed, nothing
promoted, per explicit instruction.

### Test #82 (2026-09-06) — head-to-head accuracy cut: the metric that
actually decides promotion, not just the success-rate gap

Tests #80/#81 tracked *completion* rate (did the call succeed at all).
That's not the same as *accuracy* — a record where one side times out
has nothing to compare against. This pass isolates only the records
where **both** the current model and Flash-Lite returned a real read
on the same frame (no `error` on either side) and looks at whether
they actually agree, specifically on `cardName`/`cardNumber` — the two
fields the matching/pricing pipeline depends on — since `setName`/
`subtype` mismatches are frequently just Gemini leaving a field null
that Flash-Lite fills in, not a real disagreement, and aren't
comparable without independent ground truth.

**Fresh pull**, `get_runtime_logs`, `query=flash-lite-shadow-test`,
window 2026-09-06T15:01-16:01 UTC. Raw pull returned 100 lines but
only **50 unique records** — Vercel is delivering each log line
duplicated exactly once (a real log-delivery quirk worth knowing for
any future raw-count read on this project; every prior count in
tests #80/#81 was already de-duplicated by the underlying record
count, so those aren't affected, but a naive `grep -c` on raw lines
going forward should divide by 2 or dedupe first).

**1. Both-succeeded (head-to-head comparable) records: 19 of 50.**
The other 31 are cases where one or both sides timed out/errored —
not usable for an accuracy comparison, only for the completion-rate
tracking tests #80/#81 already cover.

**2. Full-field `match` (the app's own computed field, not a
re-derivation): 3/19 (16%) `match:true`, 16/19 (84%) `match:false`.**
This number alone is misleading, though — most of those 16 "mismatches"
are driven by `setName`/`subtype` divergence exactly as described
above (`setName` agreed only 10/19, `subtype` only 8/19 — both fields
Gemini frequently leaves null), not by the two fields that actually
matter for matching.

**3. `cardName`/`cardNumber`-specific breakdown** (the fields that
matter): `cardName` agreed 18/19 (95%); `cardNumber` agreed 16/19
(84%). Narrowing to records where **both** core fields agree (a
cleaner "would this have produced the same match" proxy): **15/19
(79%) core-agree, 4/19 core-disagree.**

**4. The 4 core disagreements, quoted directly from the raw log
records** (3 real two-sided conflicts + 1 one-side-missing case):

- `requestId=26215661-6d11-40d3-8d6b-d4eb23236911` — **cardName
  conflict**: current = `"Dusknoir"`, Flash-Lite = `"Dusknorr"` (same
  `cardNumber` "TG06/TG30" both sides — matches the user's
  independently-found example exactly).
- `requestId=c55d5aa3-9628-4bb8-9e6b-3b6a56616fe3` — **cardNumber
  conflict**, Mega Charizard X ex: current = `"023"`, Flash-Lite =
  `"MEP 04"` (same `cardName` both sides — matches the user's second
  independently-found example exactly).
- `requestId=a33ddc00-3646-459c-b1be-8838fb8b666f` — **cardNumber
  conflict**, Mega Dragonite ex: current = `"271/217"`, Flash-Lite =
  `"231/217"` (a new example, not previously flagged by the user —
  same `cardName` both sides, single-digit numerator disagreement).
- `requestId=fc3c2297-7333-4b02-8c84-cdf08e90dab8` — **cardNumber
  one-side-missing**, Riolu: current read no number at all (`null`,
  with `reason: "The set card number at the bottom is small and
  blurry."`), Flash-Lite read `"GG26/GG70"`. Not a two-sided conflict
  (current didn't commit to a wrong answer, it just didn't read one) —
  flagged for completeness since `fieldAgreement.cardNumber` is
  `false`, but a structurally different case from the 3 above.

**Status**: this head-to-head accuracy metric — not the raw
success-rate gap from tests #80/#81 — is now the one that actually
decides whether Flash-Lite is a real promotion candidate, and needs
tracking as its own number going forward. Current reading: 79% core
(cardName+cardNumber) agreement on 19 comparable samples is a real
but small sample, with 3 genuine conflicting misreads already found
(same order of magnitude as this project's own prior same-frame
Gemini/Haiku comparison, which found 22% `cardNumber` agreement and
was explicitly rejected as a basis for racing the two models — see
the 2026-09-05 latency research). Not enough samples yet to draw a
real conclusion, and this subset is still entirely from the same
degraded-Gemini window flagged in test #81 as a confound. **No
promotion action taken** — data/logging pass only, per explicit
instruction. Next step: keep accumulating both-succeeded samples
(ideally from a healthy-Gemini window too, per test #81) toward a
real sample size before this ratio means anything decisive.

### Test #83 (2026-09-06) — real ground-truth accuracy test: 18 known
cards, scored independently, not agreement-based

Tests #80-82 all measured *agreement* (does Flash-Lite match the
current model, or does the current model complete at all) — neither
can answer "which one is actually right when they disagree," since
neither shadow-test path has independent ground truth. This test
does: the user supplied 18 physical cards from their own inventory
(off-stream, no time pressure) with pre-known correct `cardName` +
`cardNumber` for each, in a fixed scan order.

**Method, run in the foreground with visible per-step output** (a
prior attempt at this same test silently hung for 3 hours in the
background on a shell-quoting bug in a nested `python3 -c` call inside
a bash loop — killed, and redone as a standalone script instead of
inline bash to avoid the same failure mode): the 18 source `.HEIC`
photos were converted to JPEG via macOS `sips` (the backend hardcodes
`mime_type: "image/jpeg"` for both the Gemini and Haiku calls —
`api/identify.js:296`/`532` — so HEIC bytes labeled as JPEG would have
silently fed the vision models garbage), then a small Python script
(`urllib`, no extra dependencies) POSTed each JPEG's base64 straight to
the live `POST https://whatnot-pokemon-identify.vercel.app/api/identify`
endpoint in order, printing status/latency/`requestId` per image as it
went, and saving all 18 responses. All 18 calls returned real `200`s
(5.4-8.2s each, this endpoint's actual latency including the parallel
Haiku-fallback/Flash-Lite-shadow calls it fires internally — not
comparable to the client-side video-frame-capture latency numbers
elsewhere in this doc). Real Vercel logs
(`get_runtime_logs`, `query=flash-lite-shadow-test`, window
2026-09-06T18:35-19:05 UTC) were then pulled and matched 1:1 by
`requestId` — all 18 requestIds had exactly one matching
`[flash-lite-shadow-test]` record, no gaps.

**Caveat, stated plainly**: these are well-lit, in-hand static photos,
not live-stream video-frame captures — likely higher visual quality
than a typical on-stream scan. This test answers "who's more accurate
when given a clear image of a known card," not "who's more accurate
under real stream conditions" — that's still only answerable from the
ongoing shadow-test data (tests #80-82).

**1. Current model (`gemini-3.6-flash`) vs. ground truth: cardName
correct 14/18 (78%), cardNumber correct 13/18 (72%).** All 5 misses:

| Image | Ground truth | Current model result |
|---|---|---|
| IMG_4935 (Riolu, GG26/GG70) | — | `503` "high demand" — call failed |
| IMG_4923 (Charizard ex, 006/165) | — | `"This operation was aborted"` — timed out |
| IMG_4926 (Melony, 195/198) | — | `"This operation was aborted"` — timed out |
| IMG_4922 (Dolliv, 200/198) | — | `503` "high demand" — call failed |
| IMG_4931 (Tyranitar, DPBP#298) | name correct | read `cardNumber: "17/123"` — wrong |

**2. Flash-Lite (`gemini-3.5-flash-lite`) vs. ground truth: cardName
correct 18/18 (100%), cardNumber correct 17/18 (94%).** The one miss:

| Image | Ground truth | Flash-Lite result |
|---|---|---|
| IMG_4931 (Tyranitar, DPBP#298) | name correct | read `cardNumber: "17/123"` — wrong |

**3. Flash-Lite's errors are a strict subset of the current model's —
not different failure cases.** Flash-Lite's only miss (Tyranitar) is
also one of the current model's 5 misses, and both models produced the
*exact same* wrong number (`"17/123"`) for it — not two different
wrong guesses, the same fabricated one. `DPBP#298` is a Diamond &
Pearl-era Black Star Promo code (`#`-prefixed, not the usual `N/M`
fraction format), and this looks like a shared systematic blind spot
across both models for that specific numbering scheme, not a
Flash-Lite-specific weakness. Every one of the current model's other 4
misses were outright call failures (2x `503` "high demand", 2x
timeout) that Flash-Lite did not share — 0/18 Flash-Lite calls failed
outright in this batch.

**Reframed as accuracy on completed calls only** (removing the
confound of call failures, which tests #80-82 already track
separately): current model got 13/14 completed calls fully right
(93%); Flash-Lite got 17/18 fully right (94%) — **essentially
identical accuracy per completed call.** The practical gap in this
batch is almost entirely a *completion-rate* story (current model
4/18 = 22% outright failures here vs. Flash-Lite's 0/18), not an
accuracy story — consistent with, and now backed by real ground
truth rather than inference, what tests #80-82's agreement data
already suggested.

**Status**: first true ground-truth (not agreement-based) accuracy
data point for this comparison, and it's a clean, encouraging result
for Flash-Lite — but still a single 18-card batch, still under
favorable (well-lit, static) image conditions, and the current
model's 22% failure rate in this batch happened to land close to its
documented ~14-17% healthy baseline rather than the elevated 35-74%
seen in tests #80-82, so this batch does NOT resolve the "healthy vs.
degraded Gemini" confound from test #81 either way — it's a separate,
useful axis (ground truth vs. agreement), not a replacement for that
open question. **No promotion action taken** — data/logging pass
only, per explicit instruction. Raw script and results saved to the
session scratchpad, not the repo (throwaway test tooling, not part of
the shipped codebase).

### Test #84 (2026-09-06) — DECISION: promote Gemini 3.5 Flash-Lite to
primary model, healthy-window precondition explicitly waived

Following test #83, the user directed promoting Flash-Lite from shadow
test to the real, user-facing primary model, citing tests #80-83 as
the combined basis. This entry documents the decision and the explicit
precondition waiver, separately from the code build itself (see
CLAUDE.md "Current priority," 2026-09-06 entry, for the build details —
`GEMINI_MODEL` default, the reversed `LEGACY_GEMINI_SHADOW_MODEL`
shadow test, and the pricing-constant swap).

**The gap being waived**: test #81 set an explicit precondition before
any promotion — a comparison from a period where the old primary
(`gemini-3.6-flash`) was in its normal, healthy state (~14-17% failure
rate), not the elevated 35-74% failure state tests #80-82's data came
from. That comparison was never obtained; Vercel's Hobby-plan 1h log
retention (see "Known gotchas," CLAUDE.md) made it impossible to look
back far enough to find one, and no live-stream session happened to
land on a healthy window during data collection.

**The user's own reasoning for waiving it, recorded verbatim for future
reference**: *"test #83's batch had the current model's failure rate
(22%) close to its documented healthy baseline (14-17%), not the
degraded 35-74% range from tests #80-82, and Flash-Lite still won
cleanly on completion (0/18 vs 4/18) with matched accuracy even there.
That's not the exact live-stream healthy-window experiment originally
asked for, but it's real evidence against the specific worry (that
Flash-Lite only looks good because Gemini's having a bad week). Given
the priority on speed, I'm proceeding on the completion-rate +
ground-truth-accuracy evidence as sufficient, explicitly accepting
that residual uncertainty rather than waiting further."*

**Why this is a real, if partial, answer to the original worry**: test
#83's 18-scan batch is a genuinely different sample than tests #80-82
(different cards, different time, and critically a failure rate for
the old primary — 22% — that's much closer to documented baseline than
the degraded windows the completion-rate numbers came from) — and
Flash-Lite still showed the same pattern (perfect completion, matched
accuracy) in that closer-to-healthy sample. It is not literally the
live-stream healthy-window experiment test #81 specified, and the
sample is small (18 cards, 1 batch), so this is a reasoned business
decision to act on the available evidence and accept residual risk,
not a claim that the original open question has been fully closed.

**Decision**: promote `gemini-3.5-flash-lite` to `GEMINI_MODEL`,
reverse the shadow-test harness into a regression watch on
`gemini-3.6-flash` (the old primary) so any real-world weakness in the
new primary that only shows up at volume or under real stream
conditions gets caught quickly, and keep the rollback a one-line
change per the code comments.

**DEPLOYED AND LIVE-CONFIRMED 2026-09-06**
(`dpl_85riwwo36JvLUuBkTcHKfeiAv25T`, aliased to
`whatnot-pokemon-identify.vercel.app`). Deploy checklist followed in
full: the 2428-line source was read in 3 chunks, diff-verified byte-
for-byte against the real source before deploying — caught the same
recurring diacritic-regex transcription corruption documented
elsewhere in this project on the very first attempt (plus two smaller
indentation/truncation slips), all fixed non-generatively by splicing
exact lines from source via a Python script, then re-verified a clean
0-diff and matching sha1 (`f644ab63b64f94955d9b23bdabd881bb6b5066f8`).
First deploy attempt omitted `api/identify.js` from the files array —
caught immediately, state went to `ERROR` (`unused_function`), never
reached `READY`, never touched production; second attempt with all 4
files deployed clean. Confirmed: build log shows "Downloading 4
deployment files"; live `GET` returns the correct
`normalizeDiacriticTest`; live `POST {}` returns the real `400`; a real
end-to-end scan (one of the 18 ground-truth photos from test #83)
returned a correct High-confidence match
(`cardName: "Iono's Wattrel - 231/217"`) with `visionProvider:
"gemini"`, `timingMs.gemini: 1929ms` (inside the 1-3s target), and
`usage.estCostUsd: 0.000787` hand-verified against the new Flash-Lite
pricing constants; `get_runtime_logs` confirms that exact `requestId`
was served by this deployment; `get_runtime_errors` shows zero errors
in the surrounding window.

**Gap flagged 2026-09-06, then RESOLVED same day**: the real-scan logs
first showed the existing `[haiku-shadow-test]` line firing normally
but no `[legacy-model-shadow-test]` line —
`LEGACY_GEMINI_SHADOW_MODEL` was not yet set in Vercel's Production
environment (it's a brand-new variable name). Per this project's own
precedent (the Haiku and original Flash-Lite shadow tests both needed
a redeploy after the env var was added via the dashboard, since Vercel
snapshots env vars at build time), the regression-watch shadow test
would collect zero data until the user added
`LEGACY_GEMINI_SHADOW_MODEL=gemini-3.6-flash` in the dashboard AND the
deployment was redeployed to pick it up.

**CONFIRMED COLLECTING REAL DATA 2026-09-06**, after the user added the
env var and triggered a redeploy (`dpl_22F3PPBwEjkB5UPAPt9oo23m1QXD`,
confirmed `READY`, aliased to `whatnot-pokemon-identify.vercel.app`,
`meta.action: "redeploy"` of the prior deployment). Not assumed —
verified the same way every prior env-var addition on this project has
been: sent a real scan to the live endpoint (an M Sceptile EX ground-
truth photo from test #83) and pulled the exact runtime log line for
that `requestId`:

```
[legacy-model-shadow-test] requestId=47cb4f3f-223e-448e-b471-c5d2e74b1efc
currentModel= gemini-3.5-flash-lite legacyModel= gemini-3.6-flash
current={"cardName":"M Sceptile EX","cardNumber":"8/98",...}
legacy={"cardName":"M Sceptile-EX","cardNumber":"8/98","setName":"Ancient Origins",...}
match= false fieldAgreement= {"cardName":false,"cardNumber":true,"hp":true,
"subtype":true,"setName":false,"attackName":true,"language":true,
"stampType":true,"isSlab":true,"confidence":true}
currentMs= 1966 legacyMs= 2988 legacyCostUsd= 0.00152625
```

Confirms: `legacyModel` resolved to the real value (`gemini-3.6-flash`,
not null/unset); a genuine separate legacy Gemini API call fired (real
token usage, 2988ms real latency); and `legacyCostUsd` math checks out
against the `LEGACY_GEMINI_INPUT/OUTPUT_USD_PER_1M` constants —
(1515/1e6)×0.75 + (104/1e6)×3.75 = 0.00152625, exact match, confirming
the old pricing is correctly preserved for this shadow path. One real
data point only, but a genuinely interesting one right out of the
gate: the legacy model disagreed with the new primary on `cardName`
("M Sceptile EX" vs "M Sceptile-EX" — a hyphenation difference, not a
different card) and `setName` (null vs "Ancient Origins" — the new
primary simply didn't read a set name, not a conflict), while agreeing
on `cardNumber`/`hp`/`subtype`/`attackName`. Not itself concerning
(the disagreements are formatting/completeness, not a wrong card), but
exactly the kind of granular signal this regression watch exists to
surface over time.

**Status: promotion now fully verified end-to-end.** New primary
(`gemini-3.5-flash-lite`) is live and confirmed serving real, correct
scans (test #84's first deploy-verification scan and this one both
matched ground truth); the old-model regression watch is confirmed
collecting real comparison data, closing the gap flagged immediately
after the initial deploy. No further action needed on this item — next
step is simply watching `[legacy-model-shadow-test]` logs accumulate
over time, the same way tests #80-83 watched `[flash-lite-shadow-test]`
before this promotion decision.

### Test #85 (2026-09-06) — first real post-promotion stats pull: completion
rate, latency, and regression-watch data with Flash-Lite as the live
primary, not the shadow test

Requested by the user as a stats/monitoring pass (no code changes, no
deploy) to check how the promoted primary (`gemini-3.5-flash-lite`,
decided in test #84) is actually performing now that it's live traffic,
not shadow-test traffic. Pulled real `get_runtime_logs` covering as much
of the retained window as Vercel's Hobby-plan 1h limit allows (see
"Known gotchas").

**Window and deployment**: the retained log history (`since=1h`, queried
~2026-09-06T22:27 UTC) only contained real traffic from
**2026-09-06T22:04:32Z–22:26:43Z** (~22 minutes) — the rest of the
nominal 1h window was simply quiet (no scans), not a retention artifact.
Confirmed via `get_deployment` that this entire window was served by a
single deployment, `dpl_22F3PPBwEjkB5UPAPt9oo23m1QXD` (`createdAt`
22:01:23Z, `meta.action: "redeploy"` of `dpl_85riwwo...`) — the exact
redeploy from test #84 that picked up `LEGACY_GEMINI_SHADOW_MODEL`. This
is genuinely the first stats pull that's 100% post-promotion, live-
primary traffic — tests #80-83 were shadow-test-only data collected
while `gemini-3.6-flash` was still the real primary.

**1. Completion rate.** 52 real `/api/identify` attempts identified by
requestId (50 with a full `[timing]` trace = real successes; 2 more
found only via `get_runtime_errors`, both "Gemini failed and Haiku
fallback unavailable too"):

- Full success (Flash-Lite alone, no fallback needed): **50/52 = 96.2%**
- Fallback rescue: **0/52 = 0%** (the only 2 real failures this window
  had Haiku fail simultaneously too — same "both down together" shape
  documented in tests #71/#80, not a new pattern)
- Both providers failed: **2/52 = 3.8%** — both are the identical
  genuine `GEMINI_TIMEOUT_MS=5000` wall (`"This operation was aborted"`
  at 5001-5002ms), no new error type.

Compared to the old primary's documented baseline: **healthy 14-17%
failure** (tests #70/#71/#76) and **degraded 24-84% failure** (tests
#77-#79). This window's 3.8% failure rate is well below even the old
primary's best healthy-window performance — a real, large completion-
rate improvement holding up on genuine mixed live-stream traffic (35
distinct card names across the 50 successes, not a handful of repeats),
not just the favorable conditions of the pre-promotion shadow tests.

(Note: section 3 below documents one additional current-model-failure
case, `requestId=5c0aaf3b...`, found during the correction pass — it
fell at 22:29:00 UTC, a few minutes after this section's stated window
end, so it's new data rather than something missed from this specific
52-count.)

**2. Latency**, from real `[timing]` lines (n=50, de-duplicated — Vercel
still delivers every log line twice, per the quirk documented in test
#82):

- `gemini ms`: median **1830.5ms** (range 1362-3861ms). **47/50 (94%)
  land inside the 1-3s target**; 3/50 above 3s; 0 below 1s.
- `total ms` (gemini + lookup): median **1952.5ms** (range 1552-4040ms).
  **46/50 (92%) inside 1-3s**; 4/50 above 3s.

The old primary's documented successful-call median was ~2.5s (2026-09-
05 latency research) and ~2.26s-2.9s across various same-window checks
in tests #80/#81. This window's new-primary median (~1.83-1.95s) is
meaningfully faster and sits comfortably inside the 1-3s sudden-death-
auction target on the large majority of real scans.

**3. Regression watch** (`[legacy-model-shadow-test]`, comparing live
Flash-Lite reads against a parallel, unused `gemini-3.6-flash` call on
the same frame): **50 data points** collected in this window — the
first batch collected as a genuine background regression watch rather
than a promotion-decision shadow test.

**Correction (caught by the user's own re-check of the raw logs, same
day)**: the first pass through this write-up derived the regression-
watch dataset from the same file already filtered by `query="[timing]"`
(pulled for section 2's latency numbers). That's a real methodology bug
— a request where the *current* model itself fails never produces a
`[timing]` line at all (it never reaches that checkpoint), so any such
case was structurally invisible to that dataset. The fix was a fresh,
independent pull filtered only on `query="legacy-model-shadow-test"`
(not `[timing]`), which correctly includes current-model failures too.
**Corrected counts, out of 50 total comparisons**:

- **1/50 had the current model (Flash-Lite) itself fail** — completely
  missed the first time through:
  `requestId=5c0aaf3b-fdfc-44cd-84ec-e3c5095316a7`, `current=
  {"error":"This operation was aborted"}` at 5003ms, while legacy
  (`gemini-3.6-flash`) succeeded (`cardName="Rayquaza"`, 4784ms). Per
  the separate `get_runtime_errors` trace, this exact request also had
  Haiku fallback fail (`"Gemini failed and Haiku fallback unavailable
  too"`) — a real double-failure the user saw as the generic "couldn't
  identify" message, at 22:29:00 UTC.
- **2/50 had the legacy model fail** while Flash-Lite succeeded (not
  1/50 as originally written): `requestId=41c12b2d...`
  (`cardName="Mega Excadrill EX"`, `currentMs=1493` vs. legacy timeout
  at `legacyMs=5001`) and `requestId=6ce8e7ec...`
  (`cardName="Totodile"`, `currentMs=1906` vs. legacy timeout at
  `legacyMs=5001`) — the second one was simply absent from the original,
  incomplete 50-record sample.
- **47/50 (not 49/50) are both-succeeded comparisons.** Re-run on the
  corrected 47-record set: **`cardName` agreed 45/47 (96%)**, not
  100% as originally reported — **`cardNumber` agreed 27/47 (57%)**.

**The 2 real `cardName` disagreements, quoted directly** (both missed in
the original write-up):

- `requestId=317f6b45-872b-4a7e-8583-156410b1f362` — current
  (Flash-Lite) = `"Galarian Slowpoke"`, `cardNumber="042/198"`; legacy
  (`gemini-3.6-flash`) = `"Slowpoke"`, `cardNumber=null` (legacy simply
  didn't read a number here, not a numeric conflict). Flash-Lite is the
  side that *kept* the regional-variant qualifier here; legacy dropped
  it.
- `requestId=627f3552-4b0e-4609-a50b-54805cd60fe5` — current
  (Flash-Lite) = `"Rampardos"`, `cardNumber="045/064"`, `subtype=null`;
  legacy = `"Rampardos ex"`, `cardNumber="045/084"`, `subtype="Stage
  2"`. Here Flash-Lite is the side that *dropped* the `"ex"` qualifier
  (and the 330 HP read is itself more consistent with an actual
  `ex`-tier card, suggesting legacy's read is likelier correct on this
  one).

**Named pattern to watch, not yet confirmed**: both disagreements are
variant-qualifier drops (a regional-form prefix in one case, an `"ex"`
suffix in the other) — genuine identity differences, not spelling
noise, and exactly the kind of miss that would matter for matching
(different printings, different prices). But the *direction* is
inconsistent across the 2 examples — Flash-Lite added the qualifier
legacy dropped in the Slowpoke case, and dropped the qualifier legacy
kept in the Rampardos case — so this is **not yet evidence of Flash-
Lite systematically dropping variant qualifiers**, just two data points
worth tracking as a named, specific question going forward: *does
Flash-Lite (or either model) show a consistent one-directional bias on
regional-variant/`"ex"`-type qualifiers as more `[legacy-model-shadow-
test]` volume accumulates?* Watch for this pattern by name in future
log pulls rather than letting it blend into the generic `cardName`
agreement percentage.

**Does this meet the bar for revisiting the promotion?** No, even with
the corrected numbers. CLAUDE.md's own bar is "a live, out-of-band
test, or a sustained worsening over an extended window, not a single
bad data point." This window shows: (a) `cardName` agreement is 96%,
not 100% — 2 real disagreements exist and are now named and tracked
above, but 2/47 is still a small sample with no consistent direction,
not a systematic new failure class; (b) of the 3 completion-rate
disagreements in the corrected sample, 2 favor the new primary (legacy
timed out, current succeeded) and 1 favors the old primary (current
timed out, legacy succeeded) — a mixed, not one-sided, result; (c) the
~57% `cardNumber` disagreement rate is high in absolute terms but is the
same order of magnitude as test #82's own pre-promotion finding (also
real conflicts like Dusknoir/Dusknorr, `023` vs `MEP 04`) and this pass
has no independent ground truth to say which side is right on these 20
disagreements — same caveat test #82 already flagged, not a new one.
One ~22-minute window is also short of the 50-100-scan volume this
project has used as its own bar for a real conclusion elsewhere (tests
#80/#81), so this reads as **a good, reassuring first data point with
one named pattern to keep watching, not a closed verdict** — worth
another casual pull in the coming days exactly as CLAUDE.md's
"Immediate next step" already calls for, specifically checking whether
the qualifier-drop pattern recurs and whether it shows a consistent
direction.

**4. User-facing misses (flag reports).** Checked for `[user-flagged]`
lines both via a direct substring grep on the raw pull and a separate
`get_runtime_logs` call with `query="user-flagged"` over the same
window — **zero flags in the available ~1h retention window.** No
"couldn't identify" reports to trace this time (unlike test #80's 3
flagged scans). Cannot say anything about flags from before this
retention window; they're gone per Vercel's Hobby-plan 1h log limit.

**Secondary check — match-quality on the lookup/pricing side (unrelated
to the vision-model swap, included for continuity with tests #76-79):**
of the 50 successful scans, 2 hit `AMBIGUOUS MATCH` and 18 hit `NO
NUMBER MATCH IN POOL` (both de-duplicated counts) — **20/50 (40%)**
landed in some Low-confidence warning state, in the same 34-45% range
tests #76-78 documented for the old primary. Zero `pricingError`s, zero
`"found":false` (no fully-failed matches). This side of the pipeline
looks unaffected by the model swap, as expected since matching/scoring
code wasn't touched.

**Status**: no code changes, no deploy — stats/monitoring pass only, per
explicit instruction. Real numbers now exist for all four things asked:
completion rate is dramatically better than any pre-promotion baseline
(3.8% vs 14-84% failure), latency is meaningfully faster and mostly
inside the 1-3s target, the regression watch has its first 50 data
points with no concerning pattern (and one point favoring the new
primary), and there are no flag reports to investigate this window.
Recommend one more casual pull in the next few days once more
`[legacy-model-shadow-test]` volume accumulates, particularly hoping to
catch a window during one of the old primary's own degraded periods to
see whether the new primary's advantage holds or widens under exactly
the conditions that motivated this promotion.

### Test #86 (2026-09-07) — second real post-promotion stats pull, corrected:
94.4% completion (not the originally-reported 100%), latency holding,
and the qualifier-drop pattern recurs in the opposite direction

Requested by the user as a stats/monitoring pass (no code changes, no
deploy) after a real ~20-30 minute scanning session, to check whether
test #85's promising first pull holds up. Pulled real `get_runtime_logs`
for `since=30m` against `prj_eS2DCNOeX82nyDOA9o5OHVhBwxCA`.

**Correction (caught by the user's own re-check of the raw logs, same
day)**: the original pass through this write-up derived section 1's
completion-rate count from a `get_runtime_logs` pull filtered on
`query="[timing]"` — the **exact same structural methodology bug test
#85 already found and corrected once**: a request where the *current*
model itself fails never reaches the `[timing]` checkpoint, so it's
structurally invisible to a dataset built that way. That pull found 34
requests and reported 34/34 = 100% completion. The user's own re-check
of the raw records found **36 unique comparisons, not 34**, including 2
where the current model genuinely failed — both silently absent from
the first pass because of the query filter, not because they didn't
happen. A fresh, independent re-pull (`since=40m`, filtered on
`query="legacy-model-shadow-test"` directly, cross-referenced against
the real `[identify]` log lines for both flagged requestIds) confirmed
the user's correction exactly: **36 total requests in the
2026-09-07T21:11:50Z–21:28:25Z window, not 34.** Section 3's agreement
percentages (94% `cardName`, 45% `cardNumber` on the 33 both-succeeded
records) were unaffected by this bug and check out as originally
reported — both missing records are failures, not both-succeeded
comparisons, so they never touched that subset. The corrected numbers
below replace the originally-reported ones throughout; nothing here was
guessed or re-derived from memory — every number below is quoted
directly from real log lines.

**Window and deployment**: actual scan traffic spanned
**2026-09-07T21:11:50Z–21:28:25Z** (~16.5 minutes) inside the requested
30-minute lookback — the rest of the window was quiet. All 36 requests
in the window returned HTTP 200 (a Gemini/Haiku failure still resolves
to a 200 with an honest `found:false` body, not a 5xx — see section 1),
and `grep`-ing for 5xx/4xx statuses on `/api/identify` returned nothing.

**1. Completion rate — corrected.** **36 real scans**, not 34. Two of
them had the current model (the live primary, Flash-Lite) genuinely
fail, confirmed via the real `[identify]` log lines for each exact
`requestId` (not inferred from the shadow-test comparison alone):

- `requestId=56487257-da17-4aa8-bcde-5c3fd47dac4d` (21:13:10 UTC):
  `"Gemini call failed: This operation was aborted after ms= 5003"`,
  immediately followed by `"Gemini failed and Haiku fallback
  unavailable too: This operation was aborted"`. **Both providers
  failed together** — the real, honest "couldn't identify" message is
  what the user actually saw for this scan. (The legacy shadow call
  also timed out here, at the same 5003ms — irrelevant to the user's
  outcome, but confirms this was a genuinely hard moment for the
  provider, not just a current-model-specific issue.)
- `requestId=4125832a-e0a0-414c-abc2-c279b787dbb4` (21:25:28 UTC):
  `"Gemini call failed: This operation was aborted after ms= 5001"`,
  immediately followed by `"Gemini failed and Haiku fallback
  unavailable too: This operation was aborted"`. **Haiku did NOT rescue
  this one** — despite the legacy shadow call succeeding cleanly on the
  same frame (`cardName="Corviknight VMAX"`, `cardNumber="110/163"`,
  High confidence, 4806ms — a real, correct-looking read that simply
  wasn't the model in the user-facing path), the user still saw the
  generic "couldn't identify" message, not a rescued result.

So, corrected:

- **Full success (current model alone): 34/36 = 94.4%**
- **Fallback rescue: 0/36 = 0%** — neither of the 2 real failures this
  window was rescued; both had Haiku fail simultaneously, the same
  "both down together" shape documented repeatedly in this project's
  history (tests #71/#80/#85).
- **Both providers failed: 2/36 = 5.6%**

Compared to the old primary's baseline (14-17% healthy / 24-84%
degraded failure), 94.4% is still a large, real improvement. Compared
to test #85's 96.2%, this window is **close to, not better than**, that
first pull — the original write-up's "even cleaner than test #85"
claim was wrong and is retracted. Two real data points now sit in the
94-96% range on live traffic, both far above the old primary's
documented ceiling — a second real point in the same direction, just
not a strictly-improving one.

**2. Latency**, from real `[timing]` lines — **unaffected by the
correction above**, since `[timing]` lines only ever exist for calls
that reached that checkpoint, i.e. exactly the 34 successful current-
model calls (the 2 failed calls hit the 5000ms wall as failures,
logged as `"Gemini call failed... after ms= 5001/5003"`, not as
`[timing]` lines — they are correctly excluded from a latency stat,
not missing from one):

- `gemini ms`: n=34 (successful calls only), median **1853ms** (range
  1463-4803ms). One outlier at 4803ms (`requestId=8b2727ab...`, a
  Tyranitar V scan) came close to the `GEMINI_TIMEOUT_MS=5000` wall
  without crossing it — notably, this is the same request where the
  legacy-model shadow call *did* time out (see section 3), suggesting a
  genuinely slow round-trip that hit, not a fluke.
- `total ms` (gemini + lookup): n=32 (2 of the 34 successful calls never
  emit a `total ms` line — one because `cardName` came back `null` (Low
  confidence, back-of-card-only frame, so the lookup step is skipped
  entirely — a legitimate no-lookup path, not a failure), one because it
  took the page1+page2 merged-fallback branch, which doesn't emit that
  specific timing tag). Median **2082ms**, range 1572-5114ms. **30/32
  (94%) land inside the 1-3s target**; the 2 outside are 3091ms (the
  page1+page2 merge, just over) and 5114ms (the same slow-Gemini-call
  outlier from above).

This closely matches test #85's ~1.83-1.95s median (gemini-ms median
here is 1853ms, right in that range; total-ms median is a bit higher at
2082ms but still comfortably inside the 1-3s target on the large
majority of successful scans). Latency-when-successful is holding, not
drifting, on a second real session.

**3. Regression watch** (`[legacy-model-shadow-test]`, comparing live
Flash-Lite against a parallel, unused `gemini-3.6-flash` call on the
same frame) — **corrected denominator, same agreement percentages**.
Re-pulled filtered on `legacy-model-shadow-test` directly, not
`[timing]`, so a current-model failure couldn't be structurally
invisible to the count (this is what surfaced the 2 missing failures
above).

**36/36 requests fired the shadow test** (100% coverage — the
regression-watch safety net from test #84 is still fully collecting
data on this deployment, `dpl_22F3PPBwEjkB5UPAPt9oo23m1QXD`), not 34/34
as originally reported.

- **2/36 current-model (Flash-Lite) failures** (not 0/34 as originally
  reported): `56487257...` (both sides failed together) and
  `4125832a...` (current failed, legacy succeeded with `"Corviknight
  VMAX"`) — both detailed in section 1 above.
- **2/36 legacy-model failures** (not 1/34 as originally reported):
  `56487257...` (both sides failed together, already counted above) and
  `requestId=8b2727ab-28bb-4b5b-9be1-7e2805fae908` — legacy
  (`gemini-3.6-flash`) returned `{"error":"This operation was aborted"}`
  while current succeeded (slowly — this is the 4803ms outlier from
  section 2).
- **33/36 are both-succeeded comparisons** (36 total minus the 3 records
  above — the 56487257 double-failure counts once, not twice). This
  part of the original write-up was correct: `cardName` agreed **31/33
  (94%)** — close to test #85's 96%. `cardNumber` agreed **15/33
  (45%)** — same order of magnitude as test #85's 57% and the older
  test #82 finding; still no independent ground truth to say which
  side is right on the disagreements.

**Completion-rate disagreements, by direction**: of the 2 records where
exactly one side succeeded and the other failed, 1 favored the new
primary (`8b2727ab`: current succeeded, legacy timed out) and 1 favored
the old primary (`4125832a`: current timed out, legacy succeeded) — a
mixed, not one-sided, result, plus 1 record where neither side succeeded
(`56487257`). Same "mixed, not one-sided" shape test #85 documented on
its own completion-rate disagreements.

**The 2 real `cardName` disagreements, quoted directly:**

- `requestId=149f3943-f0d8-4b48-a43d-6f2a25aff54e` — current
  (Flash-Lite) = `"Galarian Moltres V"` (`hp="220"`, `subtype="VMAX"`,
  confidence Low, reasoning explicitly says it inferred the name from
  "artwork, dark color scheme, and HP 220" despite motion blur); legacy
  = `null` (everything null, reasoning says the frame was "extremely
  blurry... making text, HP, and set numbers completely illegible").
  **This is not the qualifier-drop pattern** — it's a "guessed from
  partial visual cues vs. declined to guess" disagreement on a genuinely
  bad frame, a different and arguably more concerning shape (Flash-Lite
  committing to a specific card name from indirect visual cues alone on
  a blurry frame) worth its own watch, separate from the qualifier
  question.
- `requestId=b71ffb85-ed2f-472f-a549-9dfd3c1f6347` — current
  (Flash-Lite) = `"Crobat V"` (single cardName field, `subtype=null`);
  legacy = `"Crobat"` with `subtype="V"` (split into two fields). **This
  is the named qualifier-drop pattern from test #85**, and it recurs —
  but in the **opposite direction** from both of test #85's examples:
  there, Flash-Lite was the side that both added (Slowpoke) and dropped
  (Rampardos) a qualifier relative to legacy; here, **legacy** is the
  side that split the qualifier out of `cardName`, while Flash-Lite kept
  the fuller single-string form intact.

**Pattern status, updated**: across the two pulls (test #85 + this one),
there are now 3 named qualifier-related `cardName` disagreements total,
split roughly evenly in direction — still **not confirmed as a
systematic Flash-Lite bias in either direction** (dropping or adding
qualifiers), consistent with test #85's own hedge. Keep watching by
name rather than folding this into the generic `cardName` agreement
percentage, per the standing instruction.

**Does this meet the bar for revisiting the promotion?** No. Completion
rate (94.4%) sits close to test #85's 96.2%, not clearly better and not
clearly worse — both real data points on live traffic sitting far above
the old primary's documented 14-84% failure range. Latency-when-
successful is holding in the same range, and the regression watch's
only new disagreement of the named-pattern type is a small,
direction-inconsistent data point, not a worsening trend. Of the 2 real
completion-rate failures this window, 1 was a genuine double-failure
(both providers down) and the other had Haiku fail to rescue a case
where the legacy model actually had a good read available — worth
naming honestly as a real, if small, gap between "the fallback exists"
and "the fallback reliably rescues," consistent with this project's
already-decided 2026-09-04 position (test #75) that the Haiku fallback
is being kept as strictly-additive-but-unreliable, not tuned or
reverted. CLAUDE.md's bar for revisiting the *model promotion*
specifically (a live out-of-band test or sustained worsening over an
extended window) is not met — this is a real, mixed-but-still-good data
point, not a verdict either way.

**4. Sanity check for the toolbar-icon double-injection bug** (the
2026-09-07 fix added a `document.getElementById("wnpk-root")` guard
against a failed content-script ping triggering a duplicate
`chrome.scripting.executeScript` injection, which could double every
event listener including the Identify Card click handler). Looked for
pairs of `/api/identify` requests with near-identical timestamps that
could indicate one click firing two billed calls.

Several close-timestamp clusters exist in this window (e.g. four
Tyranitar V scans at 21:17:48/18:01/18:05/18:08/18:12, four Gardevoir
scans at 21:24:32-21:24:43, three Tornadus VMAX scans at
21:25:08-21:25:16) — but every one of these pairs is **2-13 seconds
apart**, each with its own distinct `requestId`, its own independent
Gemini API call and token usage, and (in several cases) a genuinely
*different* `cardNumber` read across the repeats on the same physical
card (e.g. the Tyranitar V cluster reads 151/163, then 097/163, then
097/163, then 151/163, then 057/163) — the well-documented Gemini
read-instability behavior from this project's history, not evidence of
a resent duplicate payload. A true double-injection duplicate would be
expected to fire within the same browser event tick (well under a
second), not several seconds apart, and these timestamp gaps read as
the user manually re-clicking "Identify Card" several times per card —
exactly this project's own documented "scan 2-3 times back-to-back
while a card is still on screen" rescan convention.
**No evidence of the double-injection bug in this window.** Caveat:
Vercel's pulled log headers only carry second-level timestamp
granularity, so a true sub-second duplicate pair can't be fully ruled
out by this method alone — but combined with the differing reads on
repeated cards, this is a reasonably strong (not airtight) negative
result. Only the core toggle behavior has been individually
live-confirmed per CLAUDE.md; this check adds indirect evidence the
injection-fallback path isn't currently double-firing, without being a
direct test of that specific code path.

**5. Flag reports.** `grep -c "user-flagged"` on the full pulled window
returned **0** — no flagged scans to investigate this session.

**Status**: no code changes, no deploy — stats/monitoring pass only, per
explicit instruction. **Corrected same day** after the user's own
re-check of the raw logs caught the same `[timing]`-filter methodology
bug test #85 already found once — see the "Correction" note above
section 1. Second real post-promotion data point, corrected: completion
rate **94.4% (34/36)**, not the originally-reported 100% (34/34) —
2 real failures existed and were initially invisible to the query used;
neither was rescued by Haiku, one of them despite the legacy model
having a good read available on the same frame. Latency-when-successful
median is in line with test #85 (~1.85-2.08s, 94% inside the 1-3s
target), the regression watch is at **36/36 coverage** (not 34/34) with
2 current-model and 2 legacy-model failures (not 0 and 1 as originally
reported) — agreement percentages on the 33 both-succeeded records were
correct as originally reported and are unchanged — plus a small,
direction-inconsistent addition to the named qualifier-drop watch list,
no sign of the double-injection bug in this window's traffic pattern,
and zero flag reports. Nothing here changes the "keep as-is" status of
either the Flash-Lite promotion or the Haiku fallback — the corrected
94.4% is still far above the old primary's baseline, and the 2 real
misses are consistent with the already-decided, already-accepted shape
of the fallback's limitations (test #75), not new evidence. Recommend
continuing casual pulls, still hoping to eventually catch a live-stream
window during one of the old primary's degraded periods to see if the
new primary's advantage holds there too — and, per this correction,
always deriving completion-rate counts from a query that cannot
structurally exclude current-model failures (`legacy-model-shadow-test`
or an unfiltered pull), never from a `[timing]`-filtered one.

## Research: does "EX Delta Species" need a new stampType / pricing-variant, or is it already fully handled by card identification? (2026-09-06, research only — no code/schema changed)

Triggered by a real user-flagged scan: a Koffing was correctly identified
as `"EX Delta Species"` (the setName badge was right), but the stamp/
variant panel showed `stampType: "none"` and the Print Variant dropdown
only offered `"Normal (detected)"` — no way to flag the card's Delta
Species stamp. Asked to research before building anything, per this
project's own "research before building on new variant/schema
questions" convention.

**1. What does `stampType` actually enumerate, and was Delta Species
ever meant to be in scope?** Grepped `GEMINI_SCHEMA`/`HAIKU_SCHEMA` and
`GEMINI_PROMPT` in `api/identify.js` (lines 263-300, 490-527): the enum
is `["none", "1st Edition", "Staff", "Prerelease", "Winner", "Pokemon
Center", "World Championship", "other"]`. The prompt's own framing
(line 296) confirms the intent: *tournament/promo stamps* — small
logos applied to a subset of copies of an otherwise-normal printing
(1st Edition vs. Unlimited print runs; Staff/Prerelease/Winner/Pokemon
Center/World Championship event stamps on promos). **Delta Species was
never a category this enum was built to catch, and isn't a "stamp" in
the same sense at all** — it's a set-wide mechanic (a Pokémon reprinted
with an altered elemental type, marked with a small "δ" glyph next to
the name) that's baked into being a specific numbered card from a
specific set, not a per-copy finish/event marking that varies across
otherwise-identical copies. Categorizing it alongside "1st Edition"/
"Staff" would be a category error, not just a missing enum value.

**2. Does PPT/TCGplayer need a variant-level split for this, or is it
already a distinct catalog entry?** Live-queried PPT's `/api/v2/cards`
(`search=Koffing`, the same endpoint/params `fetchPokemonPriceTracker`
already uses) and got 30 real results — `"EX Delta Species" | Koffing`
is its own fully distinct catalog row, `cardNumber="72/113"`,
`tcgPlayerId=86495`, completely separate from every other Koffing
printing (Team Rocket, EX Team Rocket Returns, Great Encounters, Base
Set, etc. — 30 separate entries total). Pulled the full record: its own
`prices.variants` object has exactly two printings — `"Normal"`
($3.39 market) and `"Reverse Holofoil"` ($28.66 market) — the same
Normal/Reverse-Holo axis every other set's cards have; there is no
third "Delta Species" SKU/printing at the TCGplayer level, because
Delta-Species-ness isn't a purchasable finish choice — it's permanently
true of card 72/113 in this set, the same way "is a Charizard" is.
**Real, concrete confirmation this is already fully captured without
any stamp/variant field**: this Koffing's own `pokemonType` field reads
`"Grass"` — Koffing's real type is Poison, so this off-type value in
PPT's own catalog data IS the delta-species type-swap mechanic, already
present via existing fields (`setName` + `cardNumber` + `pokemonType`),
with zero need for a new stampType category. **Conclusion: card
identification (setName="EX Delta Species") is the correct and
complete answer here — this scan already got that half right, and the
other "half" the user expected (a stamp/variant flag) isn't something
that needs to exist at all.** The Print Variant dropdown showing
`"Normal (detected)"` is correct and unrelated to Delta Species — it's
TCGplayer's own Normal/Reverse-Holofoil finish axis for this exact,
correctly-identified card.

**3. Scope, if this were ever a real catalog-family question.** Confirmed
live that PPT's `/api/v2/cards` accepts a `setName=` exact-filter param
(not previously used anywhere in this codebase — worth remembering for
future set-scoped queries): `EX Delta Species` = **114 total cards**
(95 Pokémon, 14 Trainer, 5 Energy) — matches the real published set
size. Sibling "Holon-era" sets that also mix in some delta-mechanic
cards: EX Team Rocket Returns (111), EX Holon Phantoms (111), EX Legend
Maker (93), EX Dragon Frontiers (101), EX Power Keepers (108) — roughly
638 cards total across the 6-set family, though not every card in every
one of those sets carries the mechanic (Trainer/Energy cards never do,
and plenty of Pokémon reprints in the same sets are ordinary, non-delta
prints). Within EX Delta Species itself, **34 of the 95 Pokémon cards
have `"(Delta Species)"` explicitly written into PPT's own `name`
field** (e.g. `"Latios (Delta Species)"`) — but **the flagged Koffing is
not one of them**, despite its off-type `pokemonType` proving it really
is a delta card. This is a real, catalog-level labeling inconsistency
in PPT's own data (some delta cards get the explicit name suffix, some
don't) — not a bug in this project's code, and not something a
stampType field would fix either, since it's a naming-completeness gap
in the upstream catalog, not a missing category in our schema.

**Bottom line / recommendation**: no schema, prompt, or dropdown change
is needed. The user-flagged gap reads as a UI-expectation mismatch, not
a real pricing or matching gap — the correct card, and correct live
pricing for both its real printings, were already being shown. If
anything is worth a small follow-up, it's cosmetic: surfacing *some*
on-panel acknowledgment that a matched card is a Delta Species card
(e.g. reading it off `pokemonType`/name-suffix, purely for user
reassurance) — not a new stampType enum value, not a new PPT
variant/pricing model, and not something this pass is proposing to
build. Flagging as a possible future nice-to-have only, not a decision.

## Test #87 — User-flagged "NO LIVE PRICE" on an Irida (Secret) scan — identification was clean, root cause is a real, ongoing TCGplayer price-history reliability issue (2026-09-10)

User flagged a panel screenshot showing a card that identified cleanly
(`Irida`, Trainer/Supporter, `Read: High`, `Match: High`) but with a red
`NO LIVE PRICE` banner: `TCGplayer price-history request failed for
productId=272459 (after 1 retry): This operation was aborted`. Per
standing convention, pulled real logs before characterizing anything —
found the exact matching request
(`requestId=23390985-b21c-4f94-9d81-abca92d9c5ca`, 2026-09-10T00:40:31Z).

**Identification side: fully correct, nothing to fix.** Gemini read
`cardName: "Irida"`, `cardNumber: "204/189"`, High confidence;
`lookupCardPPT` scored it cleanly against `Irida (Secret)` (SWSH10:
Astral Radiance, `tcgPlayerId=272459`) at `bestScore=25, tieCount=1` —
an unambiguous top match, matching what the panel showed
(`Match: High`).

**Pricing side: the existing single-retry logic (test #72,
2026-09-04) fired exactly as designed and still failed** —
`TCGplayer price-history request failed for productId=272459 (after 1
retry): This operation was aborted`, `lookup ms=5283` (two
`AbortController` timeouts back to back, ~2500ms each, matching
`fetchTCGPlayerPriceHistory`'s existing 2500ms-per-attempt design).
This is TCGplayer's own price-history endpoint
(`infinite-api.tcgplayer.com/price/history/...`) timing out, not
malformed data or a bug in this codebase's request — same failure
signature test #72 first found, just not rescued by the retry this
time.

**Checked whether this was a one-off**: pulled the full available
30-minute window (2026-09-10T00:11-00:41 UTC) and counted every
`[tcgplayer-price]` success line against every `LIVE TCGPLAYER PRICING
FAILED` line. **9 failures out of 43 total pricing attempts — 20.9%.**
All 9 failures show the identical `lookup ms≈5070-5283` signature (both
attempts timing out), across 8 distinct `productId`s (one,
`productId=89470`, failed twice on two separate scans 15 seconds
apart), spread across the whole window rather than one tight burst
(00:18, a 00:22-00:24 cluster of 4, a 00:40-00:41 cluster of 3) — reads
as an ongoing elevated failure rate on TCGplayer's side during this
window, not a single transient blip.

**User impact, and why this isn't a "wrong answer" bug**: every one of
these 9 cases correctly showed `NO LIVE PRICE` / `—` for every
condition rather than a stale or fabricated price — exactly the
"honest uncertainty over false confidence" design principle this
project follows (see CLAUDE.md "Key design principle"). The
identification itself (name/set/number/confidence) was unaffected in
all 9 cases.

**No code changed.** This reads as the same class of external,
provider-side flakiness as the Gemini timeout clusters documented
throughout this project's history (tests #77-79, #85, #86) — just on
TCGplayer's price-history endpoint instead of Gemini's API. Per this
project's own pattern for this kind of finding (transient/external,
already degrading honestly, no user-facing wrong-answer risk): **worth
noting, not worth reacting to with a code change yet.** If a future
session sees this rate sustained or worsening (test #72's own retry-add
was itself a reaction to a single occurrence, so there's already one
precedent for tightening this further — e.g. a 2nd retry, or a longer
per-attempt timeout), that's the trigger to revisit
`fetchTCGPlayerPriceHistory`'s retry/timeout tuning — not a single
20%-over-30-minutes data point.

## Test #88 — Follow-up on test #87: why is TCGplayer price-history failing, and does it change the "just watching" status? Answer: not self-inflicted, TCGplayer is basically healthy, but the fetch blocks the whole response — that last part changes the status (2026-09-10)

Direct follow-up to test #87 (same day, ~10-30 minutes later, same
~00:11-00:41 UTC window plus fresh direct testing at ~00:49 UTC).
Four questions, in order, all backed by real logs and live direct
requests — no guessing.

**1. Self-inflicted rate limit? Ruled out.** Mapped all 43 requests in
test #87's window chronologically and checked whether the 9 pricing
failures cluster around bursts of rapid scanning (the exact shape of
this project's own test #30 PPT rate-limit bug). They don't — the
opposite, if anything. The single densest, most rapid scanning burst in
the entire window (00:35:45-00:39:44 UTC, ~14 requests as close as 3-4s
apart) had **zero** TCGplayer pricing failures — every one succeeded in
58-358ms. Most of the 9 failures are isolated, preceded by 30-107s gaps
from the prior request (00:18:22, 00:24:19, 00:40:31, 00:41:05). Two
pairs are closer together (00:22:37/52/00:23:07, three ~15s apart; and
00:40:03/00:40:08, 5s apart — likely genuinely overlapping server-side
invocations) but even these don't come close to the density of the
zero-failure burst. Also confirmed via `fetchTCGPlayerPriceHistory`'s
own code (`api/identify.js` ~line 1401-1421): every one of the 9
failures is a bare client-side `AbortError` ("This operation was
aborted") from our own `AbortController`/2500ms timeout — none show the
`TCGplayer price-history returned HTTP ###...` message that would fire
if TCGplayer had actually responded with an error/block status. Before
this investigation we had zero visibility into whether TCGplayer was
actually down, slow, or blocking us — this confirms it was never an
HTTP-level rejection, at least for these 9.

**2. Direct testing of the failed productIds: TCGplayer is healthy.**
Curled 5 of the exact failing `productId`s directly against
`infinite-api.tcgplayer.com` (real, public, unauthenticated endpoint —
no key needed) with a generous 12s timeout, outside the app's own fetch
path entirely. **Every single one returned real HTTP 200 data with
actual pricing** — `272459` (the original Irida), `89470`, `90000`,
`241854`, `241856` — no exceptions, no error statuses, no genuine
non-response. First pass: 4 of 5 came back in 150-500ms (matching test
#72's documented ~170ms baseline); one (`90000`) came back in 2.65s —
just over our own 2500ms per-attempt budget. Repeated `90000` 5 more
times immediately after: 185-449ms every time — the 2.65s was a one-off
spike, not a persistent per-ID problem. A broader batch of 20 sequential
calls across a mix of IDs (including several other cards from the same
window) all came back in 155-327ms, zero exceeding 2.5s. A batch of 6
concurrent requests fired at once also all returned in ~200-230ms — no
sign that concurrent load from a single client induces slowness either.

Net: of ~36 total direct calls made across all these batches, exactly 1
(≈3%) exceeded our 2500ms timeout — far below the app's own observed
21% (9/43) failure rate for the same period. **This is possibility (a)
from the brief: TCGplayer eventually responds, just occasionally slower
than its documented baseline — a timeout-tuning problem, not (b) a real
outage/gap or (c) a block/rate-limit signal.** The gap between my ~3%
locally-observed slow-tail rate and the app's 21% is itself worth
noting as unresolved — it suggests something about the Vercel-to-
TCGplayer path specifically (egress routing, per-invocation DNS/TLS
cost on a cold serverless function, or a header/fingerprint difference —
`fetchWithTimeout` sends no custom headers at all, just Node's default
fetch) may be adding latency beyond what a well-connected direct client
sees. Not confirmed — I have no way to test from Vercel's actual
egress IP — flagged as an open question, not a finding to act on by
itself.

**3. Does the failing fetch block the response? Confirmed yes, and
this is the real finding.** Traced the call chain: `res.status(200).
json(result)` (`api/identify.js:2427`) comes after `await
lookupCardPPT(...)` (line 2314/2347), which itself `await`s
`buildLiveVariantsForCandidate` (line 1987), which `await`s
`fetchTCGPlayerPriceHistory`. There is no fire-and-forget path here —
pricing is fully synchronous with the response the user sees. The
numbers prove the cost directly: the original Irida scan
(`requestId=23390985-...`) had `gemini ms=1533` — the identification
itself was ready in 1.5s, well inside the 1-3s target — but `total
ms=6816`, because the failing price fetch (2 attempts × ~2.5s) added
**~5.3 extra seconds of pure dead time** before the user saw anything
at all, correct ID included. All 9 failures in the window show the same
shape: `total ms` in the 6444-6816 range vs. a healthy scan's
1552-2727ms. Every one of these turns a sub-2-second result into a
6.5-6.8 second wait — against this project's own 1-3s target, and
worse, against the 10-second sudden-death-auction framing that target
exists for, over half the auction can elapse waiting on a price for a
card whose name was already known 5+ seconds earlier.

**Does this change the "just watching" status from test #87? Yes —
but not for the reason originally flagged.** Item 1 (self-inflicted
rate limit) is ruled out. Item 2 shows TCGplayer itself is fundamentally
healthy, not in an outage or actively blocking us — so "TCGplayer is
flaky, nothing to do" is not quite right either, but tuning the retry/
timeout against TCGplayer's reliability alone is not the highest-value
target. **Item 3 is the real, actionable finding**: independent of
whether TCGplayer's own tail latency ever gets tuned away, a correct,
already-ready identification should not be held hostage for 5+ extra
seconds by a pricing fetch that's failing anyway. That's an
architecture question (e.g. return the identification immediately and
let pricing resolve separately/async), not a timeout-tuning question,
and per the brief's own framing this is a legitimate trigger to move
from "just watching" to "worth a fix" — specifically the blocking
behavior, not the retry count or timeout duration. **No code changed
in this investigation** — per explicit instruction, this is a report
only; see CLAUDE.md's "Current priority" for the corresponding status
update.

**CLOSED OUT — FIX BUILT, DEPLOYED, AND LIVE-CONFIRMED, 2026-09-10**
(same day, later, per explicit user go-ahead — deploy verified good by
the chat assistant independently first: sha1
`90fcfa1b86600f41b45fd38cbe67dc13711626e8` on `api/identify.js`, full
diff, and `node -c` on both files, via the device bridge). The
architectural fix this test's own finding pointed to is now live:
`lookupCardPPT` (`api/identify.js`) no longer fetches live TCGplayer
pricing inline — it returns identification immediately plus a
`pricingLookup` payload, and a new `POST /api/price` endpoint
(`api/price.js`, reusing `buildLiveVariantsForCandidate`/
`pickDefaultVariantKey` unchanged via `require`) does the actual
TCGplayer fetch on a second, independent request. `extension/content.js`
renders the card ID immediately with a "Loading price…" placeholder,
then updates just the price section in place once `/api/price` resolves.
Full build/local-test detail in CLAUDE.md's "Current priority" (the
"Built, 2026-09-10" entry) — this section covers the live deploy
verification only.

**Deployment**: `dpl_99HuujYGdMKpsPnpY5Rh2LE6Lk8Y`, target production,
aliased to `whatnot-pokemon-identify.vercel.app` (confirmed via
`get_deployment`: `readyState: "READY"`, `aliasError: null`, alias list
includes the real production domain). Two earlier attempts in this same
deploy session both failed with `errorCode: "unused_function"` (omitted
`api/identify.js` from the `files` array — the same historically-
documented mistake this file has recorded before) — both caught
immediately via `get_deployment`, both confirmed to have never gone
`READY` and never touched the real production alias (live `curl`
against `whatnot-pokemon-identify.vercel.app` immediately after each
failure showed the prior deployment still serving, unaffected). The
third attempt included all 5 files (`api/identify.js`, `api/price.js`,
`api/flag.js`, `vercel.json`, `package.json`) and deployed clean.
Manual transcription of `api/identify.js` (2407 lines, over the Read
tool's single-call cap) hit the SAME recurring diacritic-regex
corruption documented repeatedly elsewhere in this file — caught via a
byte-for-byte `diff`/`shasum` verification against the real source
BEFORE deploying (scratch reconstruction initially diffed non-clean:
the escaped `̀-ͯ` regex literal had been transcribed as
actual combining Unicode characters), fixed non-generatively by
splicing the exact correct line from source via a Python script, then
re-verified a clean 0-diff and matching sha1
(`90fcfa1b86600f41b45fd38cbe67dc13711626e8`) before using that content
for the deploy.

**Confirmed live, full checklist**:
- `GET /api/identify` → `normalizeDiacriticTest: "pokemon collector"`
  (diacritic regex deployed intact, despite the close call above).
- `POST /api/identify {}` → real `400 {"error":"Missing imageBase64","requestId":"..."}`.
- `POST /api/price {}` → real `400 {"error":"Missing pricingLookup.tcgPlayerId"}`
  — new endpoint live and validating correctly.
- **Real end-to-end scan** (a real Hitmonchan HGSS Promo card photo
  fetched from TCGplayer's own public CDN, POSTed the same way the
  extension would): `/api/identify` returned `found:true`, correct
  identification (`cardName: "Hitmonchan - HGSS24"`, matching the real
  product), a fully-populated `pricingLookup`
  (`tcgPlayerId: "86097"`), and **zero old pricing fields present**
  (no `marketPrice`/`conditionPrices`/`priceVariants`/`pricingError`/
  `noPriceNote`/`priceVariantUsed` — confirms the decoupling is real in
  production, not just in the mocked tests) — `timingMs: {gemini: 1704,
  lookup: 257, total: 1961}`, i.e. **identification alone completed in
  1961ms**, inside the 1-3s target. A second, separate `POST /api/price`
  call with that exact `pricingLookup` returned in **435ms** (curl
  wall-clock) with real, complete 5-tier TCGplayer data (NM $22.53, LP
  $9.20, MP $5.73, HP $4.99, DMG $3.40, `conditionPricesPartial: false`)
  — two real, independently-timed stages, not one combined round-trip.
- **Forced pricing failure**, live: `POST /api/price` with a fabricated
  `tcgPlayerId` (`999999999999`) returned `pricingError: "TCGplayer
  price-history returned zero SKUs for productId=999999999999"`,
  `HTTP 200`, all other fields correctly `null`, no exception — and
  since this ran as a fully separate request fired well after the real
  scan's identification had already returned, it directly demonstrates
  (not just implies) that a pricing failure can no longer delay or
  break the identification the user already sees; the old blocking
  architecture structurally cannot recur since `/api/identify` no
  longer calls TCGplayer at all.
- **Flag button, both before and after pricing** (POSTed directly to
  `/api/flag` with the exact payload shapes `content.js` would send):
  a "before" flag with the raw identify response (no price fields) and
  an "after" flag with `Object.assign`-style merged identify+price
  fields both returned `{"ok":true}`; `get_runtime_logs` confirms both
  `[user-flagged]` lines landed with the expected shape — the "before"
  entry has no `marketPrice`, the "after" entry has the full real price
  data merged in. Confirms the `requestId`-guarded merge in
  `fetchAndRenderPricing` produces the intended shape when it actually
  runs.
- `get_runtime_logs` for the full test window and `get_runtime_errors`
  (1h) show exactly one error group — the forced-failure test above,
  intentional and expected — nothing else. `[haiku-shadow-test]` and
  `[legacy-model-shadow-test]` both fired normally on the real scan
  too, confirming those unrelated features are unaffected by this
  change.

**Status: live and confirmed, not just deployed.** Pushed to GitHub
(`9fb24e8..e8b1db0`, `main`). The one known, explicitly-scoped-out gap
(the graded-slab `gradedPriceUnavailable` raw-price fallback no longer
having synchronous `marketPrice`/`conditionPrices` to show) is tracked
as a separate, non-urgent open item — see CLAUDE.md's "Current
priority".

**Update, 2026-09-11 (~00:26-00:27 UTC) — two more real occurrences of
the same pricing-timeout signature, more data for this still-open item,
not a new bug.** User flagged two scans; pulled real Vercel logs for
both.

- `requestId=96fe83d0-99f6-46d6-b210-345da1550713` (Solgaleo Prism
  Star, 00:26:34-36 UTC): clean, correct identification — Gemini read
  `cardName=Solgaleo`, `number=89/156`, `hp=160`, exact match to
  "Solgaleo Prism Star" (SM - Ultra Prism, 89/156), `bestScore=32`,
  `tieCount=1`, `gemini ms=1350`, `total ms=1430` (inside the 1-3s
  target). `/api/price` for `tcgPlayerId=157706` failed: `TCGplayer
  price-history request failed for productId=157706 (after 1 retry):
  This operation was aborted`.
- `requestId=0629778d-41d5-4fd1-9779-ae970681f6ca` (Bunnelby,
  00:27:05-08 UTC): also correct behavior, not a bug — Gemini read
  `cardNumber=SV092/SV122`, which doesn't exist in PPT's catalog (page
  1+2 and a combined name+number search all came up empty for that
  exact number); the code correctly fell back to the closest same-
  name/HP candidate (Shining Fates: Shiny Vault, SV097/SV122) with an
  honest Low-confidence "no printing has the exact card number that was
  read" warning — same class as tests #35/#37/#49/#60, working as
  designed. `gemini ms=2063`, `total ms=2198`. `/api/price` for
  `tcgPlayerId=232485` failed with the identical signature: `This
  operation was aborted` after 1 retry.

Both `/api/price` failures are the same known `TCGPLAYER_PRICE_HISTORY_
TIMEOUT_MS=2500`-plus-one-retry abort documented in tests #72/#87/#88 —
TCGplayer price-history timing out, not an identification failure (both
identifications were correct or correctly honest). No code changed, no
action taken — just another data point for the still-open pricing-
timeout gap; see CLAUDE.md's "Current priority" for the item this rolls
up into.

## Research: PPT per-minute rate limit hit during normal single-click scanning (2026-09-12, research only — no code changed)

**Trigger**: real 429s confirmed via live logs — three scans 7 seconds
apart (21:58:44-51 UTC) each got `"Minute rate limit exceeded"` from
PokemonPriceTracker (`required:3` minute-credits, `available` down to
0-2), during completely normal single-click use, not a burst/retry
loop. Investigated per explicit request; nothing built yet, pending a
decision on tradeoffs.

**1. Real PPT call count per scan, measured against live traffic.**
`lookupCardPPT()` (`api/identify.js`) can fire up to 5 separate PPT
calls in an extreme worst case (initial search → zero-result retry with
a stripped species name → name-filter rescue-by-number → page-2
`offset=30` fallback → combined name+number search), but the realistic
worst case the code's own comments describe is 3 (initial + page-2 +
combined). Pulled real runtime logs for a 2-hour live window
(2026-09-12, ~20:05-22:05 UTC) and de-duplicated a log-tool artifact
that returned every line twice (confirmed via byte-identical repeated
blocks for the same `requestId` at two different line offsets in the
raw pull — a `get_runtime_logs` quirk, not a real double-invocation).
**50 real scans reached PPT in that window:**
- 18/50 (36%) — cheap 1-call path
- 14/50 (28%) — 2-call path (9 page-2-only + 5 combined-only)
- 18/50 (36%) — full 3-call worst-case path (page-2 AND combined both fired)
- 2/50 (4%) additionally hit the name-filter rescue call

Total ≈ 102 PPT calls for 50 scans → **~2.04 calls/scan average**. At
`limit=30` (30 daily-credits/call, confirmed unchanged since the
2026-09-01 `includeHistory` removal), that's **~61 credits/scan on
average, up to 90 credits/scan on the 36% of scans hitting the 3-call
path**. Conclusion: the 3-call worst case is not a rare edge case in
real use — it's more than a third of all scans — so both frequency
(fewer scans) and cost-per-scan (fewer PPT calls/scan) are real levers,
not just one or the other.

**2. PPT's real rate-limit tiers/pricing — verified live, not just from
docs** (per this project's own standing rule that a docs summary has
been wrong before — see the `cardNumber`-param saga). A live test call
against `/api/v2/cards` with the real production API key returned
these headers: `x-ratelimit-daily-limit: 20000`,
`x-ratelimit-minute-limit: 60`, `x-ratelimit-minute-remaining` dropped
from 60→57 after exactly one `limit=30` call — confirming the per-
minute budget is consumed proportionally to the `limit` param (3 units
per `limit=30` call), not 1 unit per raw HTTP call, and confirming the
account is genuinely on the documented **$9.99/mo "API" tier** (daily
limit matches). `x-ratelimit-minute-reset` was `now + 60s` (a rolling
window, not a fixed clock-minute boundary). Pricing page
(pokemonpricetracker.com/pricing), fetched live:

| Tier | $/mo | Daily credits | Per-minute limit |
|---|---|---|---|
| Free | $0 | 100 | 60 |
| **API (current)** | $9.99 | 20,000 | **60** |
| Business | $99 | 200,000 | **500** |
| Enterprise | $300 | 1,000,000 | 1,000 |

No intermediate add-on exists for the minute limit specifically (only
"purchase additional credits" for the daily quota, price unlisted) —
raising the per-minute ceiling means the full jump to Business, a 10x
price increase for an 8.3x larger minute budget. Math: at 60 units/min
÷ ~6.1 units/scan (2.04 calls × 3), real sustainable throughput today
is only **~9-10 scans/minute (~1 every 6s)** before saturating — a
short burst of 3-call (9-unit) scans exhausts it in under 7 scans,
exactly matching the observed live incident. Business tier would raise
that to ~80-98 scans/minute, comfortably past what one live user could
ever need.

**3. Caching option — a free, already-available fix, not a new paid
service.** Vercel serverless functions don't share plain in-memory
state reliably across invocations (confirmed, not assumed). But
Vercel's own first-party **Runtime Cache** (`getCache()` from
`@vercel/functions`) is a real cross-invocation, cross-region,
TTL-aware KV-style cache, confirmed available on the **Hobby plan for
free** — no Vercel KV/Redis/Upstash purchase needed. This project
**already depends on `@vercel/functions`** (used today for
`waitUntil()` in the Haiku/legacy-model shadow tests), so this needs
zero new dependencies and zero new cost. One caveat found in research:
on Hobby, the Runtime Cache is shared across every project on the
team's account (Pro/Enterprise get per-project isolation) — trivially
mitigated with `getCache()`'s own `namespace` option. Proposed shape:
cache key = normalized `cardName + language`; cache the whole
`lookupCardPPT()` result (post-fallback-chain), not just the raw first
PPT response, so a cache hit skips every one of the up-to-5 calls, not
just the first; TTL 30-60s per the user's own suggestion.

**4. Fallback triggers — real evidence they often don't earn their
credit spend.** From the same 50-scan window: page-2 fired 27 times,
but only 9 of those (33%) resolved without needing the combined-search
call on top — the other 18 (67%) spent the page-2 call and still
needed (or still failed even with) the 3rd call. Combined-search fired
23 times; only ~5 (~22%) actually logged "surfaced the missing number
— re-scoring" (the rest returned nothing that changed the outcome). Net:
of the 18 scans that paid for the full 90-credit 3-call path, only
about 5 actually resolved the exact card number — the other ~13 (72%)
spent all 3 calls and still landed on a same-signals-only match or an
ambiguous-tie note, an outcome the 1-call result would likely have
reached anyway. Real, measured evidence the fallback chain is not very
selective today — worth tightening, but unlike caching this one carries
real risk to match recall on genuinely hard-to-find cards (the exact
cases tests #35/#37/#49/#60/#63 fixed), so it needs care and a real
before/after comparison, not just a credit-savings argument.

**5. Client-side softening — cheap, orthogonal, no credit-spend
change.** The API already computes `retryAfter`/`isDailyLimit`
internally (`fetchPokemonPriceTracker`) but today only folds them into
an English `reason` string in the JSON response
(`res.json({found:false, reason, ...})`) — not as structured top-level
fields. `content.js`'s `identifyCard()` just calls `setStatus(reason)`
on any non-ok response and stops; there is no retry logic anywhere in
the identify path today. Proposed: expose `retryAfter`/`isDailyLimit`
as real JSON fields (small, non-breaking), and have `identifyCard()`
auto-retry once after `retryAfter*1000`ms — but only when
`isDailyLimit` is false (never auto-retry a daily-quota exhaustion;
that's not fixed by a short wait).

**Recommendation given to the user, nothing decided or built**:
caching (3) + client-side auto-retry (5) first — both free, additive,
and carry no matching-accuracy risk, and caching directly targets the
"same card visible for several seconds, or a manual re-scan" scenario
the user described. Reassess whether the minute limit is still being
hit after that before spending on the Business-tier bump (2) — a 10x
cost increase that may be disproportionate for a single-user tool if
caching alone resolves most real-world bursts. Fallback-tightening (4)
is the one option with real behavioral risk (could reduce recall on
already-hard cards); worth a follow-on only if caching doesn't fully
solve it, with its own dedicated before/after test.

## Related docs

- `whatnot-pokemon-extension-build-status.md` — architecture history and
  rationale for every backend decision.
- `../api/identify.js` — current backend source.

---

*Snapshot through test #51 (2026-08-29), migrated into the repo as
durable on-disk reference 2026-08-30. See CLAUDE.md at the repo root for
the current, condensed summary.*
