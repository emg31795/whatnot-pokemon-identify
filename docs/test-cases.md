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

## Related docs

- `whatnot-pokemon-extension-build-status.md` — architecture history and
  rationale for every backend decision.
- `../api/identify.js` — current backend source.

---

*Snapshot through test #51 (2026-08-29), migrated into the repo as
durable on-disk reference 2026-08-30. See CLAUDE.md at the repo root for
the current, condensed summary.*
