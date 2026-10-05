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

**Built, DEPLOYED, PUSHED, AND LIVE-CONFIRMED, 2026-09-12** (options 3
and 5 only, per explicit go-ahead — options 2 and 4 remain deliberately
deferred). Deployment `dpl_2JPYhSbmSig1Tkvrs4ew4R68mVvS`, `READY`,
aliased to `whatnot-pokemon-identify.vercel.app`. A real end-to-end
scan (Pikachu XY95 promo, a real TCGplayer product photo) matched
correctly (`tcgPlayerId=114004`, High confidence, `timingMs.total=
1920ms`) with a genuine PPT search firing (`raw candidate count=30`).
The identical image sent again immediately after hit the cache
decisively — real logs show `[lookup] PPT CACHE HIT — skipping
PokemonPriceTracker entirely, key= english:pikachu:xy95` with no fresh
`[lookup] search=` line, and `timingMs.lookup` dropped from 190ms to
11ms. `get_runtime_errors` clean for both a 15-minute and 1-hour
post-deploy window (the 1-hour window's 10 error groups all belong to
the prior deployment, before this one went live). Full trace, sha1
verification, and the "not yet observed" caveats (TTL expiry behavior,
a real live 429 exercising the client auto-retry) logged in CLAUDE.md's
"Current priority" section. Pushed to GitHub (`d355c0c..e76ed9b`).

## Test #89 — First real user-flagged scan since the PPT cache/auto-retry deploy: wrong card shown (Dewgong, Master Ball Pattern vs. a different real printing) — confirmed NOT a cache bug; the cache correctly declined to engage at all (2026-09-13)

**Trigger**: the user flagged a scan ~10s after it happened
(`requestId=3ede388a-85ff-49ae-b90f-0ea6fab72d96`), showing "Dewgong
(Master Ball Pattern)", SV2a: Pokemon Card 151, Read: Medium, Match:
Low, with the standard ambiguous-tie warning — flagged because the
card image/printing shown was wrong. Given this is the first real
live-traffic scan flagged since yesterday's PPT-cache deploy, checked
real logs immediately rather than assuming either "the cache did this"
or "this is just normal ambiguity" — per this project's own standing
rule not to characterize a panel's behavior from a screenshot alone.

**Real root cause, confirmed via logs — not the cache.** Gemini's read:
`cardName="Dewgong"`, `hp="130"`, **`cardNumber=null`** — the card
number wasn't legible this scan (the legacy-model shadow test's
independent read explicitly says why: "Card number and attack names
are obscured by glare and fingers"). Per yesterday's cache design
(`pptCacheKey()` in `api/identify.js`), **a numberless read is
deliberately excluded from the cache entirely, on both the read and
write side** — and the log confirms this worked exactly as intended:
no `[lookup] PPT CACHE HIT` line anywhere, and instead a genuine fresh
`[lookup] search= Dewgong language= Japanese raw candidate count= 21`
call fired. The cache played no role in this scan at all.

With no card number to disambiguate, `hp=130` was the only signal left
— and two real, different SV2a printings both have HP 130: "Dewgong
(Master Ball Pattern)" (087/165) and a separate "Dewgong - 084/080"
(Art Rare). Both scored identically (`bestScore=6`), `tieCount=2`, and
`pickBestCandidate` picked the first of the tied pair — the wrong one,
as it turned out. This is the exact same "AMBIGUOUS MATCH" tie-break
class this project has hit and documented many times before (Baxcalibur,
Mewtwo SVP 052, etc.), not a new failure mode: the response correctly
showed `matchConfidence: "Low"` and the standard explicit warning
("...the card number is the only thing that tells them apart, and it
wasn't legible this scan... verify the exact set/number before
trusting this match or price") — an honest disclosure, not a
confidently-wrong answer. The user's own instinct that this was "wrong"
is correct (it did pick the wrong one of two real candidates), but the
*system* behaved as designed by disclosing exactly that risk up front,
and the cache is fully cleared of any involvement.

**No code changed.** This isn't a new bug to fix — it's the same
long-standing card-number-illegible tie-break limitation, now newly
confirmed to coexist correctly with the cache (i.e., the cache's
"skip caching when there's no number to key on" design decision from
yesterday is doing exactly the job it was built for: failing toward
"spend the PPT credits and get an honest low-confidence tie" rather
than toward "silently serve a cross-contaminated cached result").
First real data point suggesting the deploy itself is stable under
live traffic; continue watching per CLAUDE.md's "Current priority".

## Test #90 — First real cache-hit-rate data point: a full ~34-minute live-scanning session against the PPT cache/auto-retry deploy — 0/82 cache hits, 0 rate-limit incidents, clean errors, latency on target (2026-09-13)

**Trigger**: a requested review of a real ~30-minute live-scanning
session against `dpl_2JPYhSbmSig1Tkvrs4ew4R68mVvS` (the 2026-09-12 PPT
cache + client-side auto-retry deploy). Pulled real Vercel runtime logs
(not `[timing]`-filtered — per the standing rule, used
`[legacy-model-shadow-test]`, which fires unconditionally on every
request) for the full available window and reconstructed every scan.
Real window: **14:20:00–14:53:59 UTC, 82 unique `/api/identify`
requests** (each request's log lines appear twice in the raw Vercel
pull — a known duplicate-delivery artifact, de-duplicated by
`requestId` before counting anything below).

**1. Cache: 0/82 hits — but a real, non-buggy reason, not a red flag.**
Zero `[lookup] PPT CACHE HIT` lines anywhere in the window. Checked
every case where the same species name recurred close together (Dewgong
×4, Mega Clefable ex ×2, Iron Valiant/ex ×4 within 11s, Bulbasaur ×2,
Chikorita ×2) to see whether the cache *should* have fired and didn't:
in every single case, either (a) the read had **no legible
`cardNumber`** (Dewgong, Mega Clefable ex — by design, a numberless
read skips the cache entirely on both read and write, exactly the
2026-09-12 design decision working as intended), or (b) each repeat had
a **different** `cardNumber` (Iron Valiant `157/182` / `154/182` /
`228/182` / `187/182`; Bulbasaur `166/165` / `143/132`; Chikorita
`8/18` / `001/025`) — genuinely different specific printings shown back
to back on stream, correctly given different cache keys, not a miss.
**No instance in this session had two scans share the exact same
`cardName`+`cardNumber`+`language` inside the 30s TTL** — the cache had
zero real opportunity to fire, which is a different (and more benign)
finding than "the cache doesn't work." It does mean this session's
scanning pattern (near-continuous single clicks across many different
cards) doesn't resemble the back-to-back-rescan-of-one-card cadence
that originally motivated the fix (the 3-scans-in-7-seconds 429
cluster) — real cache-hit-rate evidence is still pending a session that
actually re-scans the same physical card. No sign of stale/wrong cached
data, since the cache never engaged.

**2. Rate limits: 0/82 — a real improvement, but not attributable to
the cache specifically this session.** Zero `RATE LIMITED by
PokemonPriceTracker` lines, zero `rateLimited:true` responses, across
the whole window — including a real 5-scans-in-23-seconds burst
(14:42:53–14:43:16, four different Iron Valiant/ex printings plus
Garbodor) that would be the closest analog to the original incident's
density. Since the cache never hit (see above), this can't be credited
to cache-driven credit savings this time — more likely explained by
real call volume staying under budget: only 26/82 requests (32%, in
line with the original 33-36% estimate) needed the page-2 →
combined-search rescue chain, and the account's confirmed 60-units/60s
budget at 3 units/`limit=30` call comfortably covers even the densest
burst observed. Genuinely good news, but the cache's own credit-saving
role is still unconfirmed pending a session with real rescan clusters.

**3. Client-side auto-retry: not exercised.** Zero rate-limited
responses this session means the new `identifyAttempt(isRetry)` retry
path was never triggered by real traffic — still unconfirmed under a
live 429, same as noted at deploy time.

**4. Accuracy/errors: clean.** `get_runtime_errors` returned zero
errors for the full available window. All 82/82 Gemini calls
succeeded (0 timeouts, 0 `Gemini error 5xx`), so the Haiku fallback was
never invoked (not needed, not a failure of it). 5/82 (6%) came back
`found:false`/Low-confidence with an honest reason (`"Only the back of
a Pokémon card is visible..."`, `"heavily obscured by glare..."`,
`"too blurry and out of focus..."`) — legitimate image-quality misses,
exactly the intended honest-uncertainty behavior, not bugs. Exactly 1
scan was user-flagged this session (`requestId=3ede388a...`) — this is
the same scan already fully investigated and logged above as **Test
#89**, confirmed to be the known number-illegible tie-break limitation,
not a new issue and not cache-related.

**5. Latency: on target.** 76/82 requests logged a `timingMs.total`
(the 5 `found:false` blur/back-of-card cases plus 1 other skip lookup
timing). **Median 1854ms, range 1450-3368ms, 96% (73/76) inside the
1-3s target** — only 3 outliers landed just over 3s (3182ms, 3218ms,
3368ms), consistent with the spot checks taken at deploy time.

**No code changed — review only, nothing actionable surfaced.** The
one real open question (does the cache actually save credits at
realistic re-scan cadence?) remains unanswered by this session
specifically because this session didn't naturally reproduce the
back-to-back-same-card pattern the fix targets — worth another casual
check next time a session includes genuine rapid rescans of one
physical card.

## Test #91 — First live PPT 429s since the cache/auto-retry deploy: retry logic confirmed working correctly; real gap found and fixed (button not disabled during in-flight request/retry, letting a manual click race the retry) (2026-09-13)

**Trigger**: user flagged two real 429s in production
(`dpl_GJWGBCCRrdswVamyQariLUprQwFe`, the 2026-09-12 PPT-cache/auto-retry
deploy) — `requestId=0d49e219...` at 18:25:53 UTC (`retryAfter=9`,
read `cardName="Venusaur-EX"`) and `requestId=7f0f02d0...` at 18:25:58
UTC (`retryAfter=4`, read `cardName="Venusaur EX"`) — with a specific,
well-reasoned suspicion: the second request arrived only 5s after the
first, faster than the first's own 9s `retryAfter`, and the two Gemini
reads differed meaningfully (different `cardNumber`, different `reason`
text) — a pattern that looks more like a manual re-scan than the
auto-retry reusing one captured frame.

**Pulled the full real request sequence** for the window (18:25:47-
18:26:16 UTC, via `get_runtime_logs`) and found **7 total
`/api/identify` calls**, 5 of them for the same physical Venusaur EX
card:

| Time | requestId | Gemini read | Outcome |
|---|---|---|---|
| 18:25:53 | `0d49e219` | `"Venusaur-EX"` (hyphen), `1/108` | 429, retryAfter=9 |
| 18:25:58 | `7f0f02d0` | `"Venusaur EX"` (space), `null` | 429, retryAfter=4 |
| 18:26:04 | `39fa3f5f` | `"Venusaur-EX"` (hyphen), `1/108` | succeeded |
| 18:26:05 | `ad50fed4` | `"Venusaur EX"` (space), `null` | succeeded (3-way tie) |
| 18:26:05 | `a950f490` | `"Venusaur"` (no "EX"), `1/108` | succeeded |

**Real finding: the user's specific suspicion was wrong, but for an
interesting reason** — `7f0f02d0` was never the retry of `0d49e219` at
all. It's a second, independent original scan (a separate manual click,
5s after the first) that itself *also* got rate-limited, with its own
shorter `retryAfter=4s` reflecting a smaller remaining-credit deficit at
that moment. Once each original is paired with its actual retry by
matching Gemini's read style (which stayed internally consistent within
each resent-frame pair — same exact hyphenation/cardNumber — but varied
across the two physical framings):
- `0d49e219` (9s wait, sent :53) → `39fa3f5f` at :04 — **~11s later**,
  matching time-to-receive-429 (~2s) + the 9s wait almost exactly.
  Identical cardName spelling and cardNumber.
- `7f0f02d0` (4s wait, sent :58) → `ad50fed4` at :05 — **~7s later**,
  matching ~1.5-2s + the 4s wait. Identical cardName spelling and
  cardNumber (both null).

Both 429 bodies also shared the identical `resetsAt:
2026-09-13T18:26:04.543Z`, and both retries landed right at/after that
reset — exactly why both succeeded on the retry. **Conclusion: the
retry logic fired for both requests and behaved correctly** — same
frame reused, waited close to the server-specified `retryAfter`, fired
exactly once each, no runaway retry loop. Also re-checked the real 429
response shape against the mocked test used when this was built (see
the 2026-09-12 "PPT per-minute rate-limit fix" entry above) — field for
field identical (`found`, `rateLimited`, `retryAfter`, `isDailyLimit`),
so there was never a shape mismatch to cause a silent no-fire.

**The real, separate gap**: `a950f490` (18:26:05) is a third call
landing in the same ~1-second window as both retries, reading yet a
third distinct variant ("Venusaur" alone, no "EX" suffix) that matches
neither retry's expected re-read pattern — almost certainly an
independent manual re-click that fired while two retry countdowns were
already silently in flight. Root cause: `identifyCard()`/the "Identify
Card" button had no disabled state during either an in-flight request
or an active retry countdown, so nothing stopped a click from spawning
a brand-new, overlapping identify chain. Didn't cause further harm this
time (PPT's window had already reset), but in a worse case it could add
extra credit spend and even spawn its own independent retry chain on
top of one already recovering.

**Fixed, same day, per explicit go-ahead**: `extension/content.js`'s
`identifyCard()` now disables `#wnpk-identify-btn` for its full
duration — including through any retry wait, since `identifyAttempt`'s
retry recursion is still awaited inside the same call — re-enabling in
a `finally` block regardless of outcome. `extension/content.css` adds
`#wnpk-identify-btn:disabled` (dimmed, default cursor) and scopes the
existing hover rule to `:not(:disabled)`.

**Verified locally** with a harness driving the real, unmodified
`content.js`/`content.css` against a mocked rate-limited-then-success
`fetch` (2s `retryAfter`, for a fast test): the button correctly went
`disabled` immediately on click, stayed disabled through the full
countdown, and a second click attempted 500ms into the wait produced
**zero** additional fetch calls (confirmed via a call counter — exactly
2 fetches total occurred, ~2000ms apart, matching the mocked
`retryAfter`) — directly reproducing and closing the exact race that
produced `a950f490` in production. The button re-enabled correctly once
the full chain (including the retry) completed, and the retry's
successful result rendered normally.

**Committed and pushed to GitHub** (commit `241178a`,
`98a0b83..241178a`), per explicit go-ahead. Extension-only change
(`content.js`/`content.css`, no `api/` files touched), so there is no
Vercel deployment step here — it takes effect once the unpacked
extension is reloaded in `chrome://extensions`, a manual step only the
user can do (see CLAUDE.md's "Known gotchas" — no available browser-
automation tool can reach `chrome://extensions`). **Not yet confirmed
live** — needs a real reload plus a live rescan to confirm the fix
holds on an actual Whatnot stream, not just the local harness above.

## Test #92 — Clefairy Base Set (Shadowless) systematic bias: two stacked bugs found and fixed (2026-09-13)

**User report**: a live scan of Clefairy Base Set showed Read: High /
Match: High matched to "Base Set (Shadowless)" — but Shadowless is a
specific, uncommon early WotC print run (no printed drop-shadow on the
picture-frame border, undetectable from a video frame by design — see
the 2026-08-28 Shadowless-dropdown feature, which deliberately never
added a Gemini-detected signal for it). The extension appeared to
default to Shadowless far more often than real vintage pulls actually
are, and the variant dropdown had no clearly non-Shadowless option to
switch to.

**Investigated before any code change**, per standing convention. Real
Vercel logs for the exact scan (requestId `1b5d2ba6`) showed: page 1
(30 candidates for "Clefairy") never contained `5/102`; the page-2
fallback fired and re-scored 53 total candidates; the log line read
`best= {name: 'Clefairy', number: '005/102', setName: 'Base Set
(Shadowless)'} bestScore= 33 tieCount= 1`. A live query against PPT's
own `/api/v2/cards` endpoint (same params `fetchPokemonPriceTracker`
uses) confirmed the raw pool genuinely contains BOTH `Clefairy | Base
Set | 005/102 | tcgPlayerId=42393` and `Clefairy | Base Set
(Shadowless) | 005/102 | tcgPlayerId=107001` — identical hp (40),
identical attacks — a real, unbreakable tie given today's scoring
signals.

**Bug 1, confirmed real root cause**: `candidateDedupKey()`
(`api/identify.js`) keyed only on `name|number`, not `setName` — so the
Shadowless/non-Shadowless pair collapsed to the same dedup key, and
`pickBestCandidate`'s `tieCount` reported 1 instead of the true 2. This
suppressed the `tieCount >= 2` ambiguous-match warning (a direct
violation of this project's own "say so when the data doesn't support
a confident answer" design principle), and `best` became whichever of
the two PPT's own API happened to list first — confirmed Shadowless-
first for this card in the live query, explaining the *systematic*
(not random) bias the user observed.

**Bug 2, a second, independent bug found during the same investigation**:
`pickDefaultVariantKey()` receives `primaryPrinting` untagged straight
from PPT (e.g. `"1st Edition Holofoil"`), but by the time it runs, the
WINNING candidate's own live TCGplayer variant keys have already been
suffix-tagged (`"1st Edition Holofoil (Shadowless)"`) by
`buildLiveVariantsForCandidate`. The untagged/tagged mismatch meant the
intended match always failed, silently falling through to a generic
preference list that matched the merged-in SIBLING's own untagged
`"Holofoil"` key instead. Net effect: the panel's header named the
Shadowless printing, but the price pre-selected as default was actually
the non-Shadowless sibling's — a genuine "matched" ≠ "priced" mismatch
independent of Bug 1.

**Fix**: `candidateDedupKey()` now includes the Shadowless-normalized
set name in its key. `pickDefaultVariantKey()` now takes an optional
`tag` param and tries the tagged form of `primaryPrinting` first (both
`api/identify.js`; the new param threaded through from `api/price.js`).
A third, small scoped addition: `ambiguousNoteText()`'s generic message
("...the card number is the only thing that tells them apart, and it
wasn't legible this scan") is factually wrong for a Shadowless tie
specifically (the number WAS legible and matched both candidates
exactly) — added `shadowlessAmbiguousNoteText()` plus
`isShadowlessVsPlainTie()` to detect the narrow case (exactly 2 distinct
tied candidates, opposite Shadowless status, same underlying set name)
and use the accurate message only then; every other kind of tie keeps
the original generic text unchanged. `pickBestCandidate` now also
returns `tiedCandidates` (the actual tied candidate objects) so this
detection doesn't need to re-run scoring.

**Regression check against the original 2026-08-27 case, as explicitly
requested before deploying**: reproduced the literal-duplicate-row
shape that `candidateDedupKey()` was originally built for (Shaymin V —
two rows, identical `setName`, name differing only by a trailing
`"- number"` suffix) through the real `candidateDedupKey`/
`pickBestCandidate` functions — still correctly collapses to
`tieCount=1`, confirming the fix only starts counting rows as distinct
when the set name genuinely differs.

**Verified locally before deploy**: three local test scripts, all
against the real (not reimplemented) functions —
(1) `candidateDedupKey`/`pickBestCandidate` on both the regression case
and the real Clefairy data (pulled live from PPT) — confirms
`tieCount=1` for the old case, `tieCount=2` for the new one;
(2) `pickDefaultVariantKey` — confirms the old wrong-default behavior
reproduces without a `tag`, and resolves correctly with one;
(3) a full `lookupCardPPT` run with the real Clefairy PPT data mocked
in — confirms `matchConfidence: "Low"`, the new Shadowless-specific
`ambiguousNote`, and that `pricingLookup` (tag/siblingTcgPlayerId/
siblingTag) is byte-identical to before, i.e. the sibling-merge feature
itself is untouched.

**Deploy incident, honestly disclosed**: the first two `deploy_to_vercel`
attempts for this fix each accidentally sent a truncated `api/identify.js`
(the first just the file's header comment with no code at all — no
`module.exports`; the second included a stray `module.exports = null`)
— both went to production and were auto-aliased to
`whatnot-pokemon-identify.vercel.app` before being caught. **Real,
checked impact**: `get_runtime_errors`/`get_runtime_logs` for the
incident window show exactly one `500` in the entire window
(`"No exports found in module... Node.js process exited with exit
status: 1"`, 19:36:26 UTC, `dep=dpl_Dfdb9LZy2rg1EfctCC9R9SoYyk2a`) — and
it was this session's OWN diagnostic `GET` check, not real user traffic;
no other request hit either broken deployment before the correct one
went live roughly 2 minutes later. Third attempt deployed the complete,
correct content (verified via the standard chunked-read + diff/shasum
checklist beforehand — caught and fixed the same historically-
documented diacritic-regex transcription corruption on the first pass,
non-generatively spliced from source, then re-verified clean) and also
happened to include `api/flag.js`, which the *previous* (2026-09-13 UI-
decluttering) deploy had omitted — confirmed via a live `curl` before
this deploy that `/api/flag` was a real, live 404 as a result. This
deploy fixes that too, incidentally.

**Confirmed live on the corrected deployment**
(`dpl_AAhzqnDG9GLDfCTTAQVGNX13ouc1`, `READY`, aliased correctly,
`aliasError: null`): `GET /api/identify` returns the correct
`normalizeDiacriticTest`; `POST {}` returns the real `400`; `POST
/api/flag` returns `200 {"ok":true}` (confirming the flag-endpoint gap
is closed). A real ordinary scan (Pikachu XY95, no Shadowless variant)
matched correctly, High confidence, no warning, `total ms=1683` —
confirming no regression to the common path. **A real live scan of the
exact Clefairy Base Set (Shadowless) product photo** (tcgPlayerId
107001, fetched from TCGplayer's own public CDN) returned
`matchConfidence: "Low"` and the new Shadowless-specific `ambiguousNote`
— the fix firing correctly on live production, not just in local tests.
A follow-up `POST /api/price` with that response's real `pricingLookup`
returned `priceVariantUsed: "1st Edition Holofoil (Shadowless)"` —
correctly matching the winning (Shadowless) candidate's own tagged
printing, no longer silently defaulting to the sibling's untagged
`"Holofoil"` — with all three real variants still present in the
dropdown (`"Unlimited Holofoil (Shadowless)"`, `"1st Edition Holofoil
(Shadowless)"`, `"Holofoil"`), so the manual-correction path is
unchanged for anyone who needs to switch it.

## Feature: Months of Supply (sell-through signal) — investigation + build, verified locally, not yet deployed (2026-09-16)

New feature request, not a bug fix: a sell-through signal next to Market
Price so a card's profitability can be weighed against whether it will
actually sell in reasonable time or sit in inventory. Formula given:
`Months of Supply = Current Quantity / (Total Sold / 3)`, tiers
Fast-flip (<1) / Normal ([1,3)) / Slow ([3,6)) / Stagnant (≥6), with
Total Sold = 0 explicitly classified as Stagnant rather than left blank.

**Step 1 — investigation, before writing any scoring/display code, per
explicit instruction.** Checked in the specified order, against real
data, not assumed:

1. **PPT's own raw candidate payload** (a real `search=Pikachu` query
   against the live PPT API, `.env.local`-authenticated): `prices` has
   `market`, `low`, `sellers` (42), `listings` (53, already used for the
   2026-09-13 `listingCount` liquidity feature), `recentSales` (0,
   despite the card genuinely having real recent sales — this field
   looks unreliable/stale, not used), `primaryPrinting`, per-condition
   breakdowns. **No total-sold or 3-month sales-count field anywhere.**
   Ruled out.
2. **Our existing TCGplayer price-history endpoint**
   (`infinite-api.tcgplayer.com/price/history/{tcgPlayerId}/detailed?range=quarter`,
   already called by `fetchTCGPlayerPriceHistory` for every price
   lookup): each SKU in the raw response already carries its own
   `totalQuantitySold` — a real 3-month rolling sales count (the
   `range=quarter` window is exactly 3 months, confirmed by the bucket
   date range: `2026-06-21` to `2026-09-16`). This was being fetched on
   every single price lookup already and simply discarded downstream.
   **Confirmed via live browser comparison against the actual product
   page** (`tcgplayer.com/product/114004`, Pikachu XY Promos): the
   page's own "3 Month Snapshot → Total Sold" figure matched
   `totalQuantitySold` exactly for two different conditions checked
   (Near Mint: 8 = 8, Lightly Played: 10 = 10). **This is "Total Sold" —
   confirmed, no new external call needed.**
3. **Current Quantity was NOT in either of the above** — required a
   real network-inspection pass against the live product page (same
   technique used to find the price-history endpoint originally and to
   reverse-engineer pallet.trade itself). Found the real endpoint that
   powers the page's own "Current Quantity"/"Current Sellers" figures:
   `POST https://mp-search-api.tcgplayer.com/v1/product/{tcgPlayerId}/listings`,
   with a JSON body scoping `filters.term.condition`/`printing`. With
   `size:0` and `aggregations:["seller-key"]`, the response returns a
   `quantity` aggregation bucket (`[{value, count}, ...]`) whose
   `sum(value*count)` is Current Quantity, and a `sellerKey` array whose
   length is Current Sellers. **Confirmed exactly matching the live
   page** for two different conditions (Near Mint: 13 = 13, Lightly
   Played: 28 = 28) — verified via a fetch-wrapper injected into the
   real page (not guessed from the UI alone), which also captured the
   exact real POST body TCGplayer's own frontend sends.
   **Public/unauthenticated/CORS-open, confirmed via plain `curl`** — no
   cookies or session needed, same as every other TCGplayer call in this
   file. The one real difference: this endpoint 403s a request with no
   `User-Agent` header at all (confirmed by testing with and without
   one) — a basic bot-block, not real authentication; any normal browser
   UA string fixes it.

**Answer for where the code goes**: both calls now live in
`buildLiveVariantsForCandidate` (`api/identify.js`), the same function
that already fetches live per-condition pricing — NOT in `identify.js`'s
candidate-scoring path. This is a per-print-variant/condition signal,
computed at the same time and for the same chosen printing as the price
itself, so it belongs with the live TCGplayer fetch, matching the
2026-09-10 identify/pricing decoupling's own architecture (this function
is already `api/price.js`-only, called via `require`).

**Built.** `buildLivePriceVariantsFromTCGPlayer` now also captures each
SKU's `totalQuantitySold` alongside its price, and records which tier
(`NM`, or the first present tier as fallback) `basePrice` actually came
from. `buildLiveVariantsForCandidate` then fires one
`fetchCurrentListingQuantity` call per variant/printing, in parallel via
`Promise.all`, scoped to that SAME (condition, printing) pair — so the
badge shown under Market Price is never comparing numbers from a
different SKU than the price itself. `computeSellThrough`/
`classifySellThroughTier` apply the formula and tier boundaries exactly
as specified, with the Total-Sold-0 edge case returning
`{monthsOfSupply: null, tier: "Stagnant", ...}` explicitly rather than
dividing by zero. **Best-effort only, per explicit scope**: a failure in
the new listings call is caught per-variant, logged
(`[sell-through] failed for tcgPlayerId=... variant=...`), and leaves
`sellThrough: null` for that variant — it never blocks or breaks the
existing price response the way a genuine price failure does (unlike
`pricingError`, there's no loud warning for a missing sell-through
badge; it just doesn't render, matching the "supplementary signal, not
the price itself" framing in the request). `api/price.js` surfaces
`sellThrough` as a new top-level field (mirroring how `marketPrice`/
`conditionPrices` already extract from the chosen variant) so
`content.js` doesn't need to dig into `priceVariants` for the initial
render.

`extension/content.js`: a new `#wnpk-sell-through` badge renders
directly under `#wnpk-market-price` (matches the requested placement,
verified in DOM order — see the frontend test below), showing the tier
name plus a short detail (`"4.9 mo supply"`, or `"0 sold in 3mo"` for
the Stagnant/zero-sold case), colored per tier (green/blue/amber/red,
matching this project's existing warning/error color language). Reads
`sellThrough` from the SAME variant object as `basePrice`/`conditions`,
so switching the print-variant dropdown updates the badge exactly the
way it already updates the price — no new fetch on dropdown change, same
as every other per-variant field. Deliberately kept as its own separate
element from Market Price, per explicit instruction not to combine
profit and sell-through into one score. No standalone Current-Quantity/
Current-Sellers display was built, and no "assumes competitive pricing"
warning UI — both explicitly out of scope per the request.

**Verified locally, two ways, before any deploy:**

1. **Backend** — a mocked-fetch test driving the real (unmodified)
   `buildLiveVariantsForCandidate` and the real `api/price.js` handler
   (no real network calls, no reimplementation): confirmed correct
   `monthsOfSupply`/tier for a normal case (sold=8, qty=13 → 4.875 →
   "Slow", matching the live-verified real numbers above exactly); the
   Total-Sold=0 edge case correctly returns `Stagnant` with
   `monthsOfSupply: null` (no divide-by-zero); a forced failure of the
   new listings call leaves `sellThrough: null` while the price data
   (`basePrice`, `conditions`) stays completely unaffected; the internal
   `basePriceTier`/`basePriceTierSold` scratch fields are correctly
   stripped before the variant object is returned; a Fast-flip case
   (sold=30, qty=5 → 0.5) classifies correctly; and the full
   `api/price.js` HTTP handler response carries the correct top-level
   `sellThrough` alongside unchanged `marketPrice`/`conditionPrices`/
   `listingCount`.
2. **Frontend** — a jsdom harness (jsdom installed only in a scratch
   directory, not a project dependency, same pattern as test #88) drove
   a real click on the real, unmodified `extension/content.js`'s
   "Identify Card" button against mocked `/api/identify` + `/api/price`
   responses (canvas/video calls stubbed to no-ops, since jsdom has no
   real 2D canvas backend — not a simulation of the render logic
   itself). Confirmed: the sell-through badge renders with the correct
   tier and detail text ("Slow · 4.9 mo supply") for the initially
   selected variant; DOM order places `#wnpk-sell-through` directly
   after `#wnpk-market-price` and before the print-variant picker,
   matching the requested placement; and switching the variant dropdown
   to a second mocked printing (Fast-flip, 0.4 months) correctly updates
   both the market price AND the sell-through badge together,
   client-side, with no new fetch — exactly the existing dropdown
   pattern.

**Latency check (done before deploying, per explicit request)**: the new
per-variant `fetchCurrentListingQuantity` call runs in parallel via
`Promise.all`, only inside `buildLiveVariantsForCandidate` — which only
ever executes from `/api/price.js`, never `/api/identify.js`'s own
response path, so the 1-3s identify target is architecturally
unaffected. Real local measurement against the live TCGplayer endpoints
(no mocking, 4 trials each, for both a 1-print-variant card and two
different 2-print-variant cards): median added latency **~103-107ms**,
the same regardless of variant count — confirms the parallelism is
real, not summing per variant. Against `/api/price`'s own prior
measured ~435ms end-to-end (2026-09-10), this is a modest, acceptable
addition, not flagged as a concern.

**DEPLOYED AND LIVE-CONFIRMED, 2026-09-16 — after a real production
outage in the middle of deploying, honestly documented in CLAUDE.md's
"Recent / in-flight work" entry for this feature** (both Claude Code
and, separately, the Claude chat assistant sent an incomplete `files`
array to `deploy_to_vercel` under time pressure while trying to fix the
prior mistake — full blow-by-blow, including which attempts reached
`READY`/the live alias and which were caught by `get_deployment` first,
is in CLAUDE.md, not duplicated here). Final good deployment:
`dpl_4TvAkRHepxAA1BwuC8QaNiEfvhGW`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`.

**Full checklist confirmed after recovery**: live `GET /api/identify`
returns `normalizeDiacriticTest: "pokemon collector"`; live `POST {}`
returns the real `400 {"error":"Missing imageBase64"}`; a real
end-to-end scan (the same Pikachu XY95 photo used throughout this
feature's investigation) returned correct identification
(`tcgPlayerId: "114004"`, High confidence, `timingMs.total: 2177`ms,
inside the 1-3s target) and a real `POST /api/price` returned
`sellThrough: {monthsOfSupply: 4.875, tier: "Slow", totalSold: 8,
currentQuantity: 13}` — the exact same real numbers this feature's
original live investigation found for this exact card, now confirmed
from live production rather than local tests. `get_runtime_errors`
clean for the deployment's first 30 minutes. Three live `/api/price`
round-trips against this deployment measured 499-849ms end-to-end
(full network round trip, already including the new sell-through
call) — consistent with the pre-deploy local projection above, nothing
concerning.

## Test #93 — Chansey Base Set (Shadowless): the price dropdown's "real safety net" fixed the price but not the header, plus confirming `pickDefaultVariantKey` itself is NOT the bug here (2026-09-17)

User-reported bug, with two specific things to check per explicit
instruction, rather than guessing from the screenshot alone. Real
production logs pulled first via `get_runtime_logs` (query="Chansey",
`requestId=471cf641-552d-4ce7-b133-a78fb55a2e11`), not assumed from the
two screenshots.

**Ground truth from real logs**: Gemini read `cardName="Chansey"`,
`cardNumber="3/102"`, `hp="120"`, `setName="Base Set"`, High confidence.
Page 1 (30 candidates) had no `3/102` match, triggering the page-2
fallback; page 1+2 merged (32 candidates) produced `best = {name:
"Chansey", number: "003/102", setName: "Base Set (Shadowless)"}`,
`bestScore=33`, `tieCount=2`, and the log line confirms `[lookup]
AMBIGUOUS MATCH: 2 distinct candidates tied at score 33 (Shadowless vs.
non-Shadowless pair)` — the `isShadowlessVsPlainTie` safety net from
test #92 fired exactly as designed, forcing `matchConfidence: "Low"`
and the Shadowless-specific `ambiguousNote`, matching the screenshot's
"Match: Low" badge.

**Question 2 (checked first, since it could have invalidated the price
shown): did `pickDefaultVariantKey` actually find the correctly-tagged
key, or silently fall through to the sibling's untagged one?** A live
PPT query found the real candidate pair: `best` = Chansey, Base Set
(Shadowless), 003/102, **tcgPlayerId 106998**, `prices.primaryPrinting
= "1st Edition Holofoil"`; sibling = Chansey, Base Set, 003/102,
**tcgPlayerId 42371**, `prices.primaryPrinting = "Holofoil"`. Ran the
REAL, unmodified `buildLiveVariantsForCandidate`/`pickDefaultVariantKey`
against the live TCGplayer data for both real tcgPlayerIds (no
mocking): `pickDefaultVariantKey` correctly resolved to **`"1st Edition
Holofoil (Shadowless)"`** (basePrice $400) — the tagged key, not the
sibling's untagged one. This exactly matches the screenshot's own
"(detected)" label sitting next to that same option. **Conclusion:
`pickDefaultVariantKey` is not the bug here — the default price WAS
reliably paired with the claimed (Shadowless) identity.** What the
screenshots actually show is Eric having ALREADY manually switched the
dropdown to the untagged `Holofoil` option ($63.79, the sibling's
price) — using the dropdown exactly as intended, because the physical
card is genuinely plain Base Set, not Shadowless.

**Question 1, the real bug**: `cardName`/`setName` are read once from
`best` at render time (`renderResult` in `content.js`) and were never
touched again — so once Eric correctly used the price dropdown to
switch to the non-Shadowless printing, the price updated ($63.79,
correct) but the header above it kept reading "Base Set (Shadowless)"
(wrong, for the now-selected printing). The dropdown is this project's
own documented "real safety net" for a wrong Shadowless guess (see
`isShadowlessVsPlainTie`'s comment in `api/identify.js`) — but it was
only ever wired to fix the number shown, not the label describing what
that number is for, which is the part actually being read as "wrong."

**Fixed**: `api/identify.js`'s `pricingLookup` now includes
`siblingSetName` (a real field straight off the sibling candidate
object, `shadowlessSibling.setName` — not derived or guessed via
regex). `extension/content.js` adds `setNameForVariantKey(key,
identifyData)`, which decides whether a given price-variant key belongs
to `best` (show `data.setName` as originally identified) or the sibling
(show `siblingSetName` instead) by checking whether the key ends with
whichever side's tag suffix is active (`tag` or `siblingTag` —
symmetric, not hardcoded to assume `best` is always the Shadowless
one). The header's `<div class="wnpk-set-name">` now has an id and is
updated both on `renderPriceSection`'s initial render and inside the
existing print-variant dropdown's `change` listener, right alongside
the price/condition-table/sell-through updates that already happen
there — same mechanism, same trigger, no new fetch. Scoped narrowly to
the one case this project's own sibling-merge logic ever produces two
differently-tagged candidates for (a Shadowless/non-Shadowless pair);
returns `data.setName` unchanged for every ordinary, non-ambiguous scan
(no sibling at all).

**Verified two ways, using real data from this exact scan, before
deploying**:
1. Extracted the real `setNameForVariantKey` function straight out of
   `content.js` (not reimplemented) and ran it against the exact real
   values from this scan's logs/PPT query: switching to `"1st Edition
   Holofoil (Shadowless)"`/`"Unlimited Holofoil (Shadowless)"` both
   correctly return `"Base Set (Shadowless)"`; switching to the real
   sibling key `"Holofoil"` correctly returns `"Base Set"` — the exact
   fix Eric's report asked for. Also checked the symmetric opposite
   direction (best untagged, sibling tagged) and the ordinary
   no-sibling case, both correct.
2. A jsdom harness drove a real click on the real, unmodified
   `content.js` against mocked `/api/identify`/`/api/price` responses
   built from this scan's real data (real tcgPlayerIds, real tag/
   siblingTag/siblingSetName values): initial header reads "Base Set
   (Shadowless)" (matching the detected default); selecting `Holofoil`
   from the dropdown — Eric's exact action — updates the header to
   "Base Set" while the market price correctly shows $63.79; switching
   back to a Shadowless-tagged option swaps the header back too (not a
   one-way patch). Also re-ran the existing sell-through/price-handler
   backend tests unchanged to confirm no regression from the
   `siblingSetName` field addition.

`node --check` passes on both touched files. No wrong money was ever
shown here (the price itself was always correct for whichever printing
was selected; only the label was stale).

**Backend deployed and live-confirmed, 2026-09-17**
(`dpl_GxPpmA8s2caV22hvPUsB8KYQCctr`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`). Checklist:
live `GET` returns the correct `normalizeDiacriticTest`; live `POST {}`
returns the real `400`; a Pikachu regression scan confirms
`siblingSetName: null` and no behavior change for an ordinary card
(`total ms=1532`, inside the 1-3s target). **A real scan of the actual
Chansey Base Set (Shadowless) product photo** (fetched from
TCGplayer's own public CDN, tcgPlayerId 106998) reproduced this exact
bug's scenario live: `pricingLookup.siblingSetName: "Base Set"`,
default `priceVariantUsed: "1st Edition Holofoil (Shadowless)"` ($400),
and the merged sibling's `"Holofoil"` variant priced at **$63.79 — the
exact figure in Eric's original screenshot** — confirming this is
genuinely the same card/pricing situation, not a different one that
happens to look similar. `get_runtime_errors` clean for 15 minutes
post-deploy.

**Known, accepted deviation** (same class as the 2026-09-03 precedent):
given this file's size and documented transcription-corruption
history, the deployed content condensed most historical inline
FIX/ADDED comments rather than retyping the full ~2800-line file
byte-for-byte under the same kind of pressure that caused the
2026-09-16 incident — all functional code, including this fix, is
unchanged and present. Full detail and rationale in CLAUDE.md's
"Recent / in-flight work" entry for this item.

**Not yet observed in the real extension UI** — Chrome does not
auto-reload an unpacked extension on file change (this project's own
documented gotcha), so the header-swap fix needs a manual reload in
`chrome://extensions` plus a live rescan before it can be called
confirmed end-to-end, not just backend-verified.

## Feature: Break-even max bid — investigation-free build (pure math, no external API), BUILT, DEPLOYED, AND LIVE-CONFIRMED (2026-09-17)

**Request**: alongside each condition price (NM/LP/MP/HP/DMG), show a
"break-even max bid" — the most Eric could pay for a card in that exact
condition and still break even if it resells at that condition's own
listed price. Per explicit instruction, labeled `BE:` (not `Max:`) since
"Max" risks being misread mid-auction as "safe to bid up to," when it's
actually the point where profit is exactly zero.

**Formula** (verified against Eric's own hand-calculated example before
writing any code — see below):
```
Max Bid = Sale Price − eBay Fee − Shipping
eBay Fee = 0.1325 × Sale Price + fixed fee ($0.30 if Sale Price ≤ $10,
           else $0.40)
Shipping = $0.955 if Sale Price < $20 (single-card eBay Standard
           Envelope, all-in), else $5.80 (Ground Advantage)
```
Computed independently per condition, never once off NM and reused —
sale price (and both fees) differ by condition.

**No live-investigation step needed** (unlike the Months-of-Supply
feature above) — this is pure computation off numbers `api/price.js`
already has in hand (`conditionPrices`), no new external endpoint to
verify.

**Where computed — server-side**, per Eric's own suggested default given
this project's general pattern of keeping money-math server-side, near
its inputs: `computeBreakEvenMaxBid()`, new in `api/identify.js`, called
inside `buildLivePriceVariantsFromTCGPlayer` right alongside where
`conditions[t]` itself is set. Each variant now carries a parallel
`conditionsBreakEven` map (same `{NM,LP,MP,HP,DMG}` shape as
`conditions`, only for tiers with a real price). `api/price.js` forwards
`chosenVariant.conditionsBreakEven` as a new top-level
`conditionsBreakEven` response field — zero new fetches, zero added
latency, since it rides on data already being computed.

**Negative break-even (own judgment call)**: a cheap enough condition
price can produce a negative Max Bid once fees/shipping exceed the sale
price. Decided to show the real signed number, not clamp to $0.00 —
matches this project's standing design principle of surfacing honest
numbers rather than hiding them (see CLAUDE.md's "Key design
principle"). A new `.wnpk-be-negative` CSS class (red/bold, same family
as the existing `.wnpk-price-error` styling) makes a negative value
visually unambiguous as "don't bid on this condition at any price."

**UI placement**: inline on the SAME row as each condition's existing
price (e.g. `NM $5.29 (BE: $3.33)`) — explicitly NOT a new row, to keep
the narrow 260px side panel compact. `extension/content.js`'s
`conditionRowsHtml()` now takes a second `breakEven` param; both real
call sites (initial render, and the print-variant dropdown's `change`
listener) pass `conditionsBreakEven` through. The graded-slab
`gradedPriceUnavailable` fallback branch (already a known, separately
flagged gap — see the 2026-09-10 identify/pricing-decoupling entry —
that branch has no live `conditionPrices` at all since the decoupling)
is left untouched; it simply has no break-even data either, same
degradation as its existing missing-price gap, not a new one.

**Verified locally, three ways, against the real (not reimplemented)
code — no code deployed yet**:

1. **Formula correctness, hand-calculated**: Sale Price $5.29 → eBay fee
   = 0.1325×5.29+0.30 = $1.000925 → shipping $0.955 (< $20) → Max Bid =
   5.29 − 1.000925 − 0.955 = 3.334075 → rounds to **$3.33** — exactly
   matching Eric's own worked example.

2. **Mocked-fetch test against the real `buildLiveVariantsForCandidate`**
   (`api/identify.js`, not a reimplementation) — 4 cases:
   - $5.29 → conditionsBreakEven.NM = **3.33** (Eric's example, exact
     match).
   - $0.50 → conditionsBreakEven.NM = **-0.82** (a real negative
     break-even, confirming the "don't clamp" decision produces the
     correct signed number: fee 0.1325×0.50+0.30=0.36625, shipping
     0.955, maxBid = 0.50−0.36625−0.955 = −0.82125 → −0.82).
   - $10.01 → **7.33** and $20.00 → **11.15** — the two fee/shipping
     boundary transitions (fixed fee $0.30→$0.40 above $10; shipping
     $0.955→$5.80 at/above $20) both land correctly.
   - Partial-coverage input (only NM + MP prices present) → only those
     2 tiers get a `conditionsBreakEven` entry, matching how `conditions`
     itself already handles missing tiers.

3. **Mocked-fetch test against the real `api/price.js` `handler()`**
   end-to-end (full HTTP request/response cycle, no reimplementation) —
   confirmed `conditionsBreakEven: {"NM": 3.33}` reaches the actual JSON
   response body a real client would receive, with the rest of the shape
   (`conditionPrices`, `priceVariants`, `sellThrough`, etc.) unchanged and
   no stale/leftover fields.

4. **jsdom harness driving the real, unmodified `extension/content.js`**
   — loaded the actual file (only chrome.* APIs and video layout/canvas
   stubbed, since a plain webpage can't provide those), dispatched a real
   click on the Identify Card button against mocked `/api/identify` +
   `/api/price` responses (NM $5.29/BE $3.33, LP $0.50/BE -$0.82), and
   confirmed the ACTUAL rendered DOM:
   `<div class="wnpk-cond-row"><span>NM</span><span>$5.29 <span
   class="wnpk-be">(BE: $3.33)</span></span></div>` and the LP row
   correctly carrying `wnpk-be-negative` and `(BE: -$0.82)`, with the NM
   row's positive break-even confirmed NOT carrying that class.

**Deploy incident — a new failure mode, honestly disclosed.** Four
consecutive attempts to deploy the full 5-file array to production each
silently omitted `api/identify.js` from the submitted `files` array,
despite explicit intent to include it each time — new, distinct from
every prior deploy incident in this project's history (which were
either a caught accidental omission or genuine diacritic-regex
transcription corruption). All four were caught immediately via
`get_deployment` (`readyState: "ERROR"`, `errorCode: "unused_function"`)
before ever reaching `READY` or the live alias — zero production
impact. Root cause isolated via a diagnostic: an isolated preview
deploy of a small placeholder stub for `api/identify.js` alone went
`READY` immediately, confirming the omission was specific to the REAL
file's ~153KB size, not random.

**Fix**: applied this project's own established "condense this file's
comments under deploy pressure" precedent, but MECHANICALLY this time —
the `strip-comments` npm package (a real JS-aware parser, confirmed to
correctly leave `//` inside URL strings untouched, unlike a naive regex)
cut `api/identify.js` from 153KB to 64KB, comments only. A line-by-line
diff script confirmed all 2867 lines match the real source byte-for-byte
except for fully-blanked comment lines — zero code lines differ,
confirmed mechanically rather than by inspection. Re-ran the exact
break-even mocked-fetch tests above against the stripped file (identical
pass) plus a direct `GET`-debug-endpoint simulation confirming
`normalizeDiacriticTest: "pokemon collector"` survived the strip. An
isolated preview deploy of the real stripped file confirmed it
transmits correctly (the resulting build error moved from
`api/identify.js` to the deliberately-omitted `api/price.js`, proving
`api/identify.js` was no longer the problem) before the real production
deploy was attempted.

**DEPLOYED AND LIVE-CONFIRMED**: `dpl_G19142TXQjXShVC1XzdgCSbQrHDn`,
`READY`, aliased to `whatnot-pokemon-identify.vercel.app`,
`aliasError: null`, 3 lambdas built. Live `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"`; live `POST {}` returns
the real `400 {"error":"Missing imageBase64","requestId":"..."}`; a
real end-to-end scan (Pikachu XY95 promo, fetched from TCGplayer's own
public CDN) returned correct identification (`tcgPlayerId: "114004"`,
High confidence, `timingMs.total: 1765`ms, inside the 1-3s target); a
follow-up real `/api/price` call for that same card returned
`conditionsBreakEven: {NM: 163.64, LP: 83.84, MP: 51.71, HP: 43.88,
DMG: 24.6}` alongside `conditionPrices: {NM: 195.78, ...}` —
hand-verified NM: fee = 0.1325×195.78+0.40 = 26.34085, shipping
(≥$20) = $5.80, maxBid = 195.78−26.34085−5.80 = 163.63915 → rounds to
$163.64, exact match. `sellThrough` (Months of Supply, unrelated
pre-existing feature) also present and correct, confirming no
regression. `get_runtime_errors` clean for the 15 minutes following
deploy.

**Known, accepted deviation**: the live deployed `api/identify.js` has
every comment mechanically stripped (functional code unchanged and
verified byte-identical to source) — same class of deviation as this
project's prior comment-condensing precedents, but this time verified
mechanically rather than by inspection. The git-committed source (full
comments) remains the source of truth; not worth a dedicated redeploy
just to resync comments.

**Observed working in the real extension UI, 2026-09-17, same day**:
user reloaded the extension and sent a real screenshot of a live scan
(SV11B: Black Bolt, コビット/Gobbit-line Japanese card, High/High,
Holofoil $4.95, 30 listings, Normal/1.5 mo supply sell-through badge
also visible and correctly unaffected) showing the break-even feature
rendering exactly as designed: `NM $4.95 (BE: $3.04)` and
`LP $3.33 (BE: $1.63)`, inline on the same row as each price, muted
styling, no wrapping in the narrow panel. Hand-verified both against the
formula: NM $4.95 → fee = 0.1325×4.95+0.30 = 0.955875, shipping
(<$20) = $0.955, maxBid = 4.95−0.955875−0.955 = 3.039125 → **$3.04**,
exact match. LP $3.33 → fee = 0.1325×3.33+0.30 = 0.741225, shipping =
$0.955, maxBid = 3.33−0.741225−0.955 = 1.633775 → **$1.63**, exact
match. This closes the one remaining open item from the deploy — the
feature is now confirmed working end-to-end, not just backend-verified.

## Feature: Suggested Max Bid — replaces raw break-even as the primary inline figure, liquidity-adjusted by Months-of-Supply tier — BUILT, DEPLOYED, AND LIVE-CONFIRMED (2026-09-17)

Per explicit request: the raw break-even (BE) figure shipped hours
earlier is a zero-profit floor, but says nothing about how long a card
sits in inventory before it resells — a Stagnant card tying up capital
for 6+ months needs a bigger safety margin than a Fast-flip card that
turns over in under a month. Suggested Max Bid divides BE by
`(1 + required margin)`, where the margin comes from that printing's
own Months-of-Supply liquidity tier (already computed once per variant
alongside Market Price, see the Months of Supply feature above):
Fast-flip 15%, Normal 30%, Slow 50%, Stagnant 100% — no special-case
blocking for Stagnant, it still produces a real (steeply discounted)
number.

**One real deviation from the spec's own wording, flagged before
building**: the spec described this as a per-tier loop inside
`buildLivePriceVariantsFromTCGPlayer` (api/identify.js), the same
function that computes `conditionsBreakEven`. It actually had to be
computed one function later, inside `buildLiveVariantsForCandidate`,
because the required margin depends on `sellThrough.tier`, which isn't
known until the separate Current-Quantity lookup resolves (or fails) —
that lookup runs strictly after `buildLivePriceVariantsFromTCGPlayer`
returns. `conditionsBreakEven` itself is untouched, still computed in
its original spot.

**Missing-tier case**: when `sellThrough` is null (the Current-Quantity
lookup failed), `computeSuggestedBid` returns null for every condition
on that variant — the frontend renders this as an explicit
`(Bid: —)`, never silently falling back to showing raw BE under the
same label.

**Where raw BE went**: this codebase has no existing expandable/detail
panel — the sell-through badge only ever showed inline "X.X mo supply"
text, never a breakdown of Total Sold/Current Quantity as separate
numbers. Raw BE was moved into that badge's native `title` tooltip
(hover, `cursor: help` added), e.g. hovering "Slow" shows
"Break-even (zero-profit floor): NM $21.19 · LP $12.88" — flagged as an
interpretation of "a click away," not a literal existing element, since
no such element existed to reuse.

**Verified before deploying, three ways**: (1) a hand-calc script
matched the spec's own worked examples exactly — Slow: BE $21.19 →
$14.13; Stagnant: BE $21.19 → $10.60; plus Fast-flip/Normal and a
negative-BE case (stays negative after dividing by a positive margin
factor); (2) a mocked-fetch test against the real (unmodified)
`buildLiveVariantsForCandidate` confirmed a live-shaped Slow-tier
variant (NM BE $21.19 → suggestedBid $14.13) and the missing-tier case
(listings fetch fails → `sellThrough: null` → every
`conditionsSuggestedBid` value null, object still present, not the
whole field null); a second mocked test against the real `api/price.js`
handler confirmed the field reaches the actual JSON response with no
stale fields; (3) a jsdom-backed test running the real, extracted
`conditionRowsHtml`/`sellThroughBadgeHtml` functions (not
reimplemented) confirmed the rendered HTML: `(Bid: $14.13)`, the
negative-bid red/bold class, the explicit `(Bid: —)` placeholder, the
undefined-param graceful-degradation case (graded-slab fallback branch,
unchanged), and the tooltip's `NM $21.19 · LP $12.88` content.

**Deploy — comment-stripping used proactively from the start this
time**, per explicit instruction after the break-even feature's deploy
earlier the same day needed 4 failed attempts before landing on
`strip-comments`. `api/identify.js` was mechanically stripped
(strip-comments npm package) to 65KB before ever attempting a deploy
call. A manual reconstruction pass (needed to assemble the deploy
payload) hit the SAME historically-documented diacritic-regex
corruption on the first attempt — `.replace(/[̀-ͯ]/g, "")`
came out as literal Unicode combining characters — but this time it was
caught locally via a Bash diff against the already-verified stripped
file BEFORE any deploy call was made, not after: `diff` flagged every
differing line, a script confirmed all of them were comment-only except
the regex line, and the regex line was fixed non-generatively by
splicing the exact correct bytes from the verified source (not
retyping), then re-diffed clean (zero non-comment differences) and
re-tested against the mocked e2e suite before deploying. The full
5-file production deploy succeeded on the first attempt:
`dpl_4W1wRrbgM3UoXgP2Gb2GRgEg5rNM`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`, build log
confirms "Downloading 5 deployment files", 3 lambdas built.

**Live-confirmed**: `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (diacritic regex deployed
intact); `POST {}` returns the real `400 {"error":"Missing
imageBase64",...}`; a real scan (the project's standard Pikachu XY95
promo ground-truth photo, fetched from TCGplayer's own public CDN)
returned correct identification (`tcgPlayerId: "114004"`, High
confidence, `timingMs.total: 2007ms` — inside the 1-3s target); the
follow-up `/api/price` call returned real live TCGplayer data with
`sellThrough.tier: "Slow"` and **`conditionsSuggestedBid: {NM: 109.09,
LP: 55.89, MP: 34.47, HP: 29.25, DMG: 16.4}`** alongside
`conditionsBreakEven: {NM: 163.64, LP: 83.84, MP: 51.71, HP: 43.88,
DMG: 24.6}` — hand-verified NM: 163.64 / 1.5 (Slow margin) =
109.0933... → rounds to $109.09, exact match; all 5 tiers checked and
correct. `get_runtime_errors` clean for the 20 minutes following
deploy.

**Known, accepted deviation, same class as prior entries**: the live
deployed `api/identify.js` has comments mechanically stripped —
functional code (including the new `REQUIRED_MARGIN_BY_TIER`/
`computeSuggestedBid`/`conditionsSuggestedBid` lines) is unchanged and
verified against the git-committed source. Not worth a dedicated
redeploy just to resync comments.

Pushed to GitHub (`1d393ca..cc93964`, `main`).

**Observed working in the real extension UI, 2026-09-17, same day**:
user reloaded the extension and sent a real screenshot of a live scan
(Geodude, Expedition, Reverse Holofoil, Read: High, Match: High, "none
stamp" note, "Stagnant · 9.0 mo supply" sell-through badge) showing the
new label and values rendering correctly: `LP $13.79 (Bid: $5.31)`,
`MP $15.00 (Bid: $5.83)`, `HP $8.14 (Bid: $2.91)`,
`DMG $5.58 (Bid: $1.80)`, with NM correctly showing "—" (TCGplayer had
no live data for that tier on this printing — a normal, unrelated
missing-price case, not a Bid-specific gap). No trace of the old "BE:"
label anywhere in the panel.

Hand-verified all four visible tiers against the real formula
(Stagnant tier → 100% required margin → suggested bid = BE ÷ 2, using
the exact double-rounding the code performs — BE rounded to cents
first, then divided and rounded again):
- LP $13.79: fee = 0.1325×13.79+0.40 = 2.227175, shipping (<$20) =
  0.955, BE = 13.79−2.227175−0.955 = 10.607825 → **$10.61**; bid =
  10.61÷2 = 5.305 → **$5.31** — exact match.
- MP $15.00: fee = 0.1325×15+0.40 = 2.3875, shipping = 0.955, BE =
  15−2.3875−0.955 = 11.6575 → **$11.66**; bid = 11.66÷2 = 5.83 —
  exact match.
- HP $8.14: fee = 0.1325×8.14+0.30 = 1.37855, shipping = 0.955, BE =
  8.14−1.37855−0.955 = 5.80645 → **$5.81**; bid = 5.81÷2 = 2.905 →
  **$2.91** — exact match.
- DMG $5.58: fee = 0.1325×5.58+0.30 = 1.03935, shipping = 0.955, BE =
  5.58−1.03935−0.955 = 3.58565 → **$3.59**; bid = 3.59÷2 = 1.795 →
  **$1.80** — exact match.

All four ran through a script, not just by-hand arithmetic, confirming
no transcription slip in the verification itself. This closes the one
remaining open item from the deploy — the feature is now confirmed
working end-to-end in the real panel, not just backend-verified via
curl.

**Independently corroborated via real Vercel logs pulled the same
session** (not just the one screenshot, per this project's own
"verify, don't just trust a report" convention): `get_runtime_logs`
over the preceding ~10 minutes showed multiple genuine
`POST /api/identify 200` + `POST /api/price 200` pairs (Geodude,
Glaceon EX, Meloetta, and others — real varying card reads consistent
with genuine live scanning, not a repeated synthetic test), every one
stamped `dep=dpl_4W1wRrbgM3UoXgP2Gb2GRgEg5rNM` (the deployment carrying
this feature), zero errors. Confirms the screenshot reflects real,
ongoing production traffic on the new deployment, not an isolated or
stale request.

Pushed to GitHub (`143192f..a2c1d79`, `main`).

## Feature: sell-through tier rebuilt on raw sales velocity (2026-09-17)

**Change, per Eric's explicit request**: Months of Supply (Current
Quantity ÷ (Total Sold ÷ 3)) replaced with a tier classified directly
off raw monthly sales pace (Total Sold ÷ 3) alone. Rationale: the
actual selling venue is eBay, not TCGplayer — TCGplayer's own listing
glut doesn't reflect real competition on eBay, while Total Sold
(demand) transfers across platforms reasonably. New tiers: Stagnant
<5/mo, Slow 5-49/mo, Normal 50-599/mo, Fast-flip 600+/mo (Total Sold=0
lands in Stagnant with no special case, since 0÷3=0 is already <5).

**Removed entirely**: the mp-search-api Current-Quantity fetch
(`fetchCurrentListingQuantity`, `sumListingQuantity`,
`TCGPLAYER_LISTINGS_TIMEOUT_MS`, `TIER_TO_CONDITION_NAME`) —confirmed
via grep it was used nowhere else (`listingCount` is a separate,
unrelated field sourced from PPT's own match-time data, not this
endpoint). This also drops a network round-trip and a failure point
from every `/api/price` call; `buildLiveVariantsForCandidate`'s
per-variant loop is no longer async/parallel-fetched for this, just
synchronous math off `basePriceTierSold` (already on the variant from
the existing price-history fetch).

Badge detail text changed from "1.0 mo supply" to a raw pace figure
(e.g. "142/mo"), one decimal below 50/month, whole number at/above (a
formatting judgment call — low-volume paces are more informative with
a decimal, high-volume ones don't need one). The badge's tooltip now
leads with "Total Sold (3mo): N · Pace: X/mo" in place of the old
Total Sold/Current Quantity/Months of Supply trio, still followed by
the unchanged break-even figures.

**Everything else deliberately untouched**: Suggested Max Bid's
formula/margin table (Fast-flip 15%, Normal 30%, Slow 50%, Stagnant
100%), the `(Bid: —)` dash behavior, raw BE still computed and shown
in the tooltip.

**Verified before deploying**: boundary hand-calc at all 6 spec edges
(4.9→Stagnant, 5.0→Slow, 49.9→Slow, 50.0→Normal, 599.9→Normal,
600.0→Fast-flip) matched exactly. A mocked-fetch test against the real
`buildLiveVariantsForCandidate` (not a reimplementation) confirmed the
same 7 cases end-to-end, confirmed the mp-search-api endpoint is never
called, confirmed `conditionsSuggestedBid` still computes correctly
(regression check), and confirmed no stray `currentQuantity`/
`monthsOfSupply` field survives in the response shape. A jsdom test
drove a real click on the real `content.js` against mocked
`/api/identify` + `/api/price` responses and confirmed both the "X/mo"
badge formatting (a 142.33 pace → "142/mo"; a 1.33 pace → "1.3/mo") and
the new tooltip wording render correctly, with the old wording gone.

**Deploy checklist followed in full, comment-stripping used
proactively from the start** (per the explicit lesson from the
Suggested Max Bid deploy): `api/identify.js` (2827 lines, ~152KB) was
mechanically stripped of comments via the `strip-comments` npm package
before ever attempting a deploy — cut to ~62KB, same line count, and a
line-by-line script confirmed every non-blank stripped line matched
the real source byte-for-byte (zero code-line diffs) before deploying.
The full sell-through test suite was re-run against the stripped file
and passed identically, and the diacritic regex was confirmed intact
via a direct function call before deploying.

**Real transcription mistake caught and fixed on this deploy**: the
first deploy attempt (`dpl_7zzoxvBDrV23kZgtAdyWg4j1UjMJ`) retyped
`package.json` by hand and got it wrong in two ways — dropped
`"private": true` and altered the `description` text — caught
immediately afterward via a direct `diff` against the real source
(a discipline adopted specifically because this mistake happened,
not before). Non-functional (package.json metadata isn't read by the
running handler) but a real, if harmless, violation of "deploy exactly
what's committed, byte-verified." Fixed with a second deploy
(`dpl_9247De5JKpxzy8RAcWFCiRE58Jsx`) using a diff-verified-correct
`package.json`; `api/price.js`, `api/flag.js`, and `vercel.json` were
also independently diff-verified byte-exact against source on this
same pass (all three matched on the first attempt).

**Confirmed live on `dpl_9247De5JKpxzy8RAcWFCiRE58Jsx`**, `READY`,
aliased to `whatnot-pokemon-identify.vercel.app`, `aliasError: null`.
`GET /api/identify` returns `normalizeDiacriticTest: "pokemon
collector"` (diacritic regex intact); `POST {}` returns the real `400
{"error":"Missing imageBase64"}`. A real end-to-end scan (the same
Pikachu XY95 promo photo used throughout this project) returned
correct identification (`tcgPlayerId: "114004"`, High confidence,
`timingMs.total: 1840`ms — inside the 1-3s target) and a follow-up
`/api/price` call returned **`sellThrough: {monthlyPace: 2.6667, tier:
"Stagnant", totalSold: 8}`** — no `currentQuantity`/`monthsOfSupply`
anywhere in the shape — with `conditionsSuggestedBid.NM: 81.82`
matching the hand-verified formula (BE $163.64 ÷ 2.0 Stagnant margin =
$81.82). Real runtime logs for both this scan and an incidental second
organic-looking scan (Regigigas VSTAR, Japanese) show the `/api/price`
calls logging only `[tcgplayer-price] productId=... skus=N` — no
`mp-search-api` line anywhere — directly confirming the Current-
Quantity fetch is gone from the live code path, not just from the
diff. `[haiku-shadow-test]`/`[legacy-model-shadow-test]` both fired
normally on the real scans, confirming unrelated features are
unaffected. `get_runtime_errors` clean for the 15 minutes following
deploy.

**Observed working in the real extension UI, 2026-09-17, same day**:
user sent a real screenshot of a live scan (Pawmi, SV: Paldean Fates,
Read: High, Match: Low, "none stamp" note) showing the new badge
rendering correctly: **`Fast-flip · 892/mo`** — the new raw-pace
wording, no trace of the old "mo supply" text. Hand-verified all three
fully-visible Suggested Bid values against the real Fast-flip formula
(15% required margin, bid = BE ÷ 1.15):
- NM $2.95 → fee = 0.1325×2.95+0.30 = 0.690875, shipping = 0.955 → BE
  = $1.30 → bid = 1.30÷1.15 = **$1.13** — exact match.
- LP $2.87 → fee = 0.680275, shipping = 0.955 → BE = $1.23 → bid =
  1.23÷1.15 = **$1.07** — exact match.
- MP $2.33 → fee = 0.608725, shipping = 0.955 → BE = $0.77 → bid =
  0.77÷1.15 = **$0.67** — exact match.

(HP's bid figure was cut off in the screenshot, not independently
checked.) This is a real, live production scan, not a mock — closes
the "not yet observed in the real UI" gap from the deploy. Pushed to
GitHub (`51c3199..2367b1a`, `main`).

## Research: `/api/price` occasionally slow (8-10s) during rapid back-to-back scans (2026-09-18)

**Trigger**: user reported a real live panel stuck on "Loading price…"
for a Kingdra EX scan and asked directly whether the app was being
rate-limited.

**Not a rate limit — confirmed via real logs, not assumed.**
`get_runtime_errors` (30m window) showed zero errors. Every single
`/api/price` response in the window (grouped by statusCode) was `200`
— no `429`s from either PPT or TCGplayer.

**But a real, different latency problem was found.** Correlating the
Kingdra scan's own `requestId` against real runtime logs: its
`/api/price` CORS preflight (`OPTIONS`) fired at 03:08:42 UTC, but the
matching `POST` didn't complete until 03:08:52 — a genuine 10-second
gap, against a normal sub-1-second completion time for this endpoint.
Pulling the full available 1-hour log window and correlating every
`OPTIONS`→`POST` pair for `/api/price` found this is rare, not
systemic: across ~33 minutes of real browser traffic (02:43-03:10
UTC, 15+ price calls), there is exactly **one** slow cluster — three
overlapping calls (Zekrom EX ×2, then Kingdra EX) within a ~30-second
span (03:08:18-03:08:52) where the user scanned three cards in quick
succession. Every other real price call in the window, including ones
spaced just 7-9s apart, completed in under a second (`OPTIONS` and
`POST` logged in the same second).

**Ruled out as external (TCGplayer itself)**: curled the exact
productIds from the slow calls (90743, 117848, 642610) directly
against `infinite-api.tcgplayer.com`, outside the app entirely —
170-220ms each, right now. TCGplayer is not slow for these cards.

**Ruled out as caused by the same-day sell-through-velocity deploy**:
that change only *removed* a fetch (the Current-Quantity/mp-search-api
call) from `buildLiveVariantsForCandidate` — it didn't touch
`fetchTCGPlayerPriceHistory` at all, and removing work should reduce
concurrent load, not increase it.

**Four genuine reproduction attempts, all failed to reproduce the
slowdown** — a real, useful negative result, not just "couldn't be
bothered to check":
1. 4 concurrent `/api/price`-only calls via curl (no `/api/identify`
   involved) — all 150-296ms.
2. 3 concurrent `/api/identify` (real image, so Gemini + Haiku +
   legacy-shadow all genuinely fire) + 4 concurrent `/api/price` via
   curl, fully simultaneous — all price calls under 300ms, identify
   calls normal (~1.7-1.8s).
3. Real browser `fetch()` (not curl — genuine CORS preflight, real
   browser network stack, matching what the extension actually does)
   from a cross-origin page, staggered ~6-8s apart mimicking the real
   burst's timing — all under 500ms.
4. Real browser `fetch()`, 3 `/api/identify` (real image) + 3
   `/api/price`, ALL fully simultaneous (zero stagger — more
   concurrent load than the real incident had) — price calls
   148-305ms, identify calls ~2.1-2.2s. No slowdown at all, even under
   deliberately maximized concurrency, on the live current deployment.

**Conclusion, honestly uncertain**: could not identify or reproduce a
root cause despite ruling out rate-limiting, TCGplayer health, and
today's code change, and despite genuinely trying to force it via
concurrent load exceeding what the real incident had. Most likely
explanation given the evidence (rare — one cluster in ~33 real
minutes; not reproducible under matched or heavier synthetic load) is
a transient event — a momentary Vercel-side cold-start/scaling blip or
similar — of the same general class as the transient Gemini/TCGplayer
slowdown clusters already documented elsewhere in this project's
history that self-resolved without any code change. **Not actioned —
no code changed.** Per this project's own "don't build speculatively"
convention, worth continued normal log-watching for recurrence (not a
dedicated new watch) rather than a speculative fix aimed at an
unconfirmed mechanism.

## Fix: TCGplayer 403-blocking `infinite-api.tcgplayer.com` — new bot-detection, fixed with a User-Agent header, BUILT, DEPLOYED, AND LIVE-CONFIRMED (2026-09-20)

Real, urgent user report: prices had stopped loading in the extension.
`get_runtime_errors` (24h window) showed 17 error groups, all the same
shape, spanning `2026-09-20T00:33` through `12:54` (ongoing, not a
blip): `[price] ... LIVE TCGPLAYER PRICING FAILED: TCGplayer
price-history returned HTTP 403 for productId=<id>: <html>...403
Forbidden...</html>`, across many different `tcgPlayerId`s (114004,
684415, 477050, 89964, 699876, 268712, 96420, 450289, 478098, 509960,
86067, 284295, 699871, 534460, 693513, and more) — systemic, not one
bad card. Backend confirmed healthy (`GET /api/identify` 200,
`lastDeployment` on every error was the current known-good production
deployment) and `fetchTCGPlayerPriceHistory`
(`api/identify.js`, ~line 1531) sent zero headers on the request —
notable because this project already hit the identical failure mode
once before, on a different TCGplayer endpoint
(`mp-search-api.tcgplayer.com`'s listings call, used by the old
Months-of-Supply feature, see the 2026-09-16 entry above), fixed by
adding a real browser `User-Agent`.

**Root cause confirmed live, from the Mac, not assumed from the prior
precedent alone** (a sandboxed research environment's own egress proxy
blocked the domain outright, so this needed a real machine): curled
`https://infinite-api.tcgplayer.com/price/history/114004/detailed?range=quarter`
directly. With zero headers: **403, 5/5 repeated attempts** — a hard,
consistent block, not rate-limit-shaped. With just a real browser
`User-Agent` header added (no `Referer`/`Origin` needed): **200, with
real JSON pricing data**, tested across **all 15 distinct `tcgPlayerId`s
from the error list — 15/15 succeeded**. Confirmed via git history
(commit `29a0a47`, the Months-of-Supply build, 2026-09-16) that this
exact endpoint used to need no UA at all — TCGplayer has evidently
extended the same bot-detection to `infinite-api.tcgplayer.com` that
already hit `mp-search-api.tcgplayer.com`.

**Fix**: added a `TCGPLAYER_FETCH_HEADERS` constant (reusing the exact
same UA string already established as precedent in this codebase) and
passed it into both the initial fetch and the existing retry-on-abort
in `fetchTCGPlayerPriceHistory`. Confirmed via grep this is the ONLY
TCGplayer call site in the entire codebase (`api/price.js` imports the
same function via `require("./identify.js")` — no separate treatment
needed; the old `mp-search-api` listings call was already removed in
the 2026-09-17 sell-through-velocity rebuild).

**Verified locally before deploying**: ran the real, unmodified
exported `buildLiveVariantsForCandidate` against all 15 real failing
productIds — 15/15 succeeded, returning real SKU/variant data.
`node --check` passed on both touched-adjacent files.

**Deploy checklist followed in full**: `api/identify.js` (152,928
bytes, in the documented ~150KB+ danger zone for this project's
multi-file deploy tool) had comments mechanically stripped via the
`strip-comments` npm package (62,335 bytes after) per this project's
own established precedent for files this size — verified 0 code lines
differ from source via a line-by-line diff script (only whole-line
comments blanked), diacritic regex and the new fix both confirmed
intact in the stripped file, and the stripped file re-tested against
the same 15 productIds with identical results before deploying. The
first `create_deployment` call was denied by the session's own
auto-mode permission classifier (flagged as a repeated "Production
Deploy" pattern, the same known occurrence documented elsewhere in
this file) — the user explicitly approved a retry, which then
deployed clean on the first attempt: `dpl_3kUnk8XeVh3rA6UNipA1rD6mzd2e`,
`READY`, aliased to `whatnot-pokemon-identify.vercel.app`
(`aliasError: null`), all 5 files confirmed present via
`list_deployment_files`.

**Live-confirmed**: `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (diacritic regex intact);
`POST {}` returns the real `400 {"error":"Missing imageBase64"}`; three
direct `/api/price` calls against previously-failing productIds
(114004 Pikachu, 684415, and 86067 — a multi-variant Holofoil +
Reverse Holofoil case) all returned real live TCGplayer pricing with
`pricingError: null`; a full real end-to-end scan (Pikachu XY95 photo)
returned correct identification (`tcgPlayerId: "114004"`, High
confidence, `timingMs.total: 2279`ms — inside the 1-3s target)
followed by a real `/api/price` call using that response's own
`pricingLookup`, returning correct 5-tier pricing
(`marketPrice: 195.78`). `get_runtime_errors` clean for both a 15-minute
and a 1-hour post-deploy window — no new 403s since deploy.

## Fix: sell-through "Total Sold" summed across all condition tiers (2026-09-20)

**Reported by the user**: a Shiny Lotad (Platinum SH4) Reverse Holofoil
scan showed `Stagnant · 0.3/mo` in the sell-through badge. Hand-verified
against a real sales-history screenshot that 0.3/mo was arithmetically
correct — for NM alone. PriceCharting's own sales list for the same
card showed a much higher overall pace once eBay/other conditions are
counted, but that's a different, not-yet-solvable gap (this app has no
eBay data source). The actionable finding: TCGplayer's own
price-history response already carries `totalQuantitySold` for every
condition tier, and `computeSellThrough` was only ever being fed the
one tier `basePrice` came from (usually NM) — up to 4/5 of TCGplayer's
own real data was being thrown away before the tier was computed.

**Root cause**, `buildLivePriceVariantsFromTCGPlayer` (`api/identify.js`
~line 1651): each variant carried `basePriceTier`/`basePriceTierSold`
(that one tier's sold count only) as the sole input to
`computeSellThrough` in `buildLiveVariantsForCandidate`.

**Fix**: sum `totalQuantitySold` across every present condition tier
into a new `totalSoldAllConditions` field, fed into `computeSellThrough`
instead. A tier with a missing/unparseable sold value counts as 0 once
at least one other tier has real data (consistent with how a genuine
zero-sold tier was already handled — no special-casing); if literally
every present tier is null, the total stays `null` so "no data at all"
still reads as unknown, not a false confirmed zero.
`classifySellThroughTier`'s boundaries (Stagnant <5/mo, Slow 5-49/mo,
Normal 50-599/mo, Fast-flip 600+/mo) and the `sellThrough` response
shape are unchanged — no frontend changes needed.

**Verified locally, before deploying, per explicit request**:

1. A 5-case mocked-fetch regression test against the real, exported
   `buildLiveVariantsForCandidate` (no reimplementation): multi-tier sum
   (NM=8,LP=10,MP=3 → 21 sold, Slow); single-tier unchanged (NM=8 alone
   → 8 sold, matches old behavior); a null tier alongside a real one
   (NM=NaN, LP=10 → 10 sold, null treated as 0 within the sum); all
   tiers null → `sellThrough: null` (stays unknown, not a false zero);
   a genuine zero tier alongside real data (NM=0, LP=6 → 6 sold, adds
   normally). All 5 passed; confirmed no leftover `basePriceTier`/
   `basePriceTierSold`/`totalSoldAllConditions` temp fields on the
   returned variant.
2. Two real cards, pulled from TCGplayer's live price-history endpoint
   directly (not synthetic), run through the real
   `buildLiveVariantsForCandidate`:
   - **Lotad (Shiny), Platinum SH4, Reverse Holofoil** (tcgPlayerId
     86838) — real sold counts NM=1, LP=3, MP=7, HP=2, DMG=3.
     OLD (NM-only): 1 sold → 0.33/mo → **Stagnant**. NEW (summed): 16
     sold → 5.33/mo → **Slow**. Matches the user's own reported case
     exactly (the "0.3/mo" they saw is the old NM=1 figure).
   - **Charizard, Base Set, Holofoil** (tcgPlayerId 42382) — real sold
     counts NM=8, LP=20, MP=59, HP=46, DMG=81. OLD: 8 sold → 2.67/mo →
     **Stagnant**. NEW: 214 sold → 71.33/mo → **Normal** — a full
     two-tier jump, showing this isn't a small effect for high-value
     vintage cards that sell much more often in played condition than
     NM.

Grepped `api/price.js`/`extension/content.js` to confirm the
`sellThrough` object's consumers only ever read `{monthlyPace, tier,
totalSold}` by shape, never the old field names directly — no frontend
changes were needed.

**Deploy checklist followed in full**: `api/identify.js` had comments
mechanically stripped via `strip-comments` (153,950 → 62,690 bytes),
confirmed 0 code lines differ from source via a line-by-line diff
script (only whole-line/trailing comments blanked), the fix and the
diacritic regex both confirmed intact post-strip, and the stripped file
re-tested against the same 5 regression cases with identical results
before deploying. Checked for a local Vercel CLI auth shortcut first
(no `.vercel` link, no `VERCEL_TOKEN` env var found) — none available,
so this went through the same MCP `create_deployment` inline-content
path as every prior deploy in this project's history. Deployed clean on
the first attempt: `dpl_7WWVwz8MLd77Bjestrccfm4qHdDZ`, `READY`, aliased
to `whatnot-pokemon-identify.vercel.app` (`aliasError: null`), all 3
lambdas (`identify`/`price`/`flag`) confirmed present via
`list_deployment_files`.

**Live-confirmed via the actual fixed behavior**, not just a generic
health check: `GET /api/identify` returns
`normalizeDiacriticTest: "pokemon collector"` (diacritic regex intact);
`POST {}` returns the real `400 {"error":"Missing imageBase64"}`. A
live `POST /api/price` for the real Lotad SH4 productId (86838) on the
production endpoint returned `sellThrough: {monthlyPace:
5.333333333333333, tier: "Slow", totalSold: 16}` — exactly matching the
local pre-deploy numbers. Same for the Charizard productId (42382):
`{monthlyPace: 71.33333333333333, tier: "Normal", totalSold: 214}`,
exact match. A full real end-to-end scan (Pikachu XY95 promo photo)
returned correct identification (`tcgPlayerId: "114004"`, High
confidence, `timingMs.total: 1575`ms — inside the 1-3s target), and a
follow-up `/api/price` call returned `marketPrice: 195.78` — the same
figure this exact card has returned in every prior deploy's
verification, confirming no regression to ordinary pricing.
`get_runtime_errors` clean for 15 minutes post-deploy.

**Not yet pushed to GitHub** — committed locally (`abfde28`) before
this deploy.

**Open, deliberately not acted on**: whether this fix alone is enough,
or whether `classifySellThroughTier`'s boundaries also need adjusting
now that the input signal is larger across the board. The Charizard
case jumping two full tiers on this fix alone suggests a real, broad
effect, but two cards is not a representative sample — watch how real
scanned cards classify going forward before revisiting the boundaries.

## Feature: factor Eric's 1.2x listing markup into break-even / Suggested Max Bid (2026-09-20)

**SUPERSEDED 2026-09-29 — the 1.2x markup and the flat 13.25% fee rate
described in this section are no longer what this tool computes.** The
listing template is now `market * 1.0 + $1.00` (then the same
`LISTING_PRICE_TIERS` overrides), and the eBay fee is now the real
12.35% final value fee + 2.2% Promoted Listings on the tax-inclusive
total (`0.155685`). The text below is kept exactly as written, as the
historical record of why the 1.2x model existed and how it was verified
at the time. For what is actually live, see **"Feature: the 2026-09-29/30
pricing model"** below.


**Reported by the user**: `computeBreakEvenMaxBid` assumed a card
resells at exactly its live TCGplayer market price, but Eric actually
lists at 1.2x market — understating his real bid room. Verified on a
Chansey NM example: current Suggested Bid showed $38.25 off raw market
$64.47; using 1.2x market as the assumed sale price, it should be
~$46.86 (about 22% more room).

**Fix**: new `LISTING_MARKUP_MULTIPLIER = 1.2` constant near the top of
`api/identify.js` (alongside `GEMINI_MODEL` etc.). `computeBreakEvenMaxBid`
multiplies the incoming market price by this constant into an
`assumedSalePrice` before running the unchanged fee/shipping math
(13.25% + fixed fee, $0.955/$5.80 shipping) on that value instead of
the raw price. Displayed Market Price and per-condition prices
(`conditions` in `buildLivePriceVariantsFromTCGPlayer`) are completely
untouched — the markup only ever reaches `conditionsBreakEven`.
`computeSuggestedBid` is unchanged (still BE ÷ (1+margin)); it just
now receives a bigger BE input.

**Rounding-order discrepancy found and resolved with the user before
deploying**: running the real code gave Suggested Bid = **$46.85**,
one cent below the user's $46.86 hand-calc target. Traced to a
rounding-order question: `conditionsBreakEven` is rounded to cents
(`60.91`) BEFORE `computeSuggestedBid` divides it by 1.3 → $46.85.
Using the raw unrounded break-even (`60.91327`) before rounding would
give $46.86 instead. Flagged to the user via AskUserQuestion rather
than silently picking one; **user confirmed the existing
rounded-then-divide architecture (current code, no change needed) is
correct** — $46.86 was a manual-calc approximation, $46.85 is the
intended real number.

**Verified before deploying**:
1. A mocked-fetch test against the real, exported
   `buildLiveVariantsForCandidate` (NM market $64.47, Normal
   tier/30% margin, no reimplementation): `conditions.NM === 64.47`
   (unchanged, no markup leak), `conditionsBreakEven.NM === 60.91`,
   `conditionsSuggestedBid.NM === 46.85` — all exact.
2. Two real live TCGplayer cards, pulled directly (not synthetic):
   **Pikachu XY95** (tcgPlayerId 114004) — NM market $195.78 → BE
   $197.61 (hand-verified: 195.78×1.2=234.936, fee=31.52902,
   shipping=5.80, BE=197.60698→$197.61, exact match). **Chansey, Base
   Set 2** (tcgPlayerId 42471) — NM market $22.59 → BE $17.32
   (22.59×1.2=27.108, fee=3.99181, shipping=5.80,
   BE=17.31619→$17.32, exact match).
3. `api/identify.js` had grown to 155,239 bytes (past the documented
   deploy-risk threshold) — comments stripped via `strip-comments`
   (→62,841 bytes), confirmed 0 code lines differ from source via a
   line-by-line diff script (only whole-line/trailing comments
   blanked), the new constant/formula and the diacritic regex both
   confirmed intact post-strip, and the stripped file re-tested against
   the same mocked-fetch case with identical results.

**Checked for a local deploy shortcut first**: no `.vercel` link, no
`VERCEL_TOKEN` env var found locally — no CLI auth available, so this
went through the same MCP `create_deployment` inline-content path as
every prior deploy in this project's history.

**Deployed clean on the first attempt**: `dpl_A9pscRdcDzMgpWypAZmeCK8KmTxc`,
`READY`, aliased to `whatnot-pokemon-identify.vercel.app`
(`aliasError: null`), all 3 lambdas (`identify`/`price`/`flag`)
confirmed present via `list_deployment_files`.

**Live-confirmed via the actual fixed behavior**: `GET /api/identify`
returns `normalizeDiacriticTest: "pokemon collector"` (diacritic regex
intact) and a fresh `sourceHash`; `POST {}` returns the real `400
{"error":"Missing imageBase64"}`. Live `POST /api/price` for the real
Chansey productId (42471) returned `conditionPrices.NM: 22.59` (raw,
unchanged) alongside `conditionsBreakEven.NM: 17.32` and
`conditionsSuggestedBid.NM: 13.32` (Normal tier, real sellThrough
totalSold=405/135/mo) — exact match to the local pre-deploy numbers.
Same for Pikachu (114004): `conditionPrices.NM: 195.78`,
`conditionsBreakEven.NM: 197.61`, both exact matches. A full real
end-to-end scan (Pikachu XY95 promo photo) returned correct
identification (High confidence, `timingMs.total: 1367`ms — inside the
1-3s target), confirming no regression to the identify path.
`get_runtime_errors` clean for 15 minutes post-deploy.

## Feature: mirror eBay pricing-tier overrides in the break-even calc — BUILT, DEPLOYED, AND LIVE-CONFIRMED (2026-09-26)

**SUPERSEDED 2026-09-29 — the 1.2x markup and the flat 13.25% fee rate
described in this section are no longer what this tool computes.** The
listing template is now `market * 1.0 + $1.00` (then the same
`LISTING_PRICE_TIERS` overrides), and the eBay fee is now the real
12.35% final value fee + 2.2% Promoted Listings on the tax-inclusive
total (`0.155685`). The text below is kept exactly as written, as the
historical record of why the 1.2x model existed and how it was verified
at the time. For what is actually live, see **"Feature: the 2026-09-29/30
pricing model"** below.


Per Eric's explicit request: his real eBay repricer template applies the
`LISTING_MARKUP_MULTIPLIER` (1.2x) markup from the entry directly above,
then runs fixed pricing-tier overrides on TOP of that — if the marked
price (`market × 1.2`) lands in one of two `[min, max]` bands, the
repricer pins the actual list price to a fixed value instead of the raw
multiplied figure:

- marked price in `[$0.00, $2.48]` → actual list price `$2.49`
- marked price in `[$20.00, $25.58]` → actual list price `$19.99`

Before this fix, `computeBreakEvenMaxBid` (`api/identify.js`) had no idea
about these overrides, so for a market price whose `market × 1.2` landed
in the $20-$25.58 band (roughly market $16.67-$21.32), break-even/
Suggested Max Bid were computed off a sale price up to ~$5 higher than
what Eric will actually list at — overstating safe bid room in that
band. The $0-$2.48 band is a smaller, opposite-direction miss (slightly
understates).

**Fix**: new `LISTING_PRICE_TIERS` constant (`api/identify.js`, right
next to `LISTING_MARKUP_MULTIPLIER`) as an ordered array — first
matching tier wins, same semantics as Eric's real template, and easy for
him to add/edit/reorder tiers later. `computeBreakEvenMaxBid` now walks
the tiers right after computing the marked price (`salePrice ×
LISTING_MARKUP_MULTIPLIER`) and, on a match, replaces the marked price
with that tier's `newPrice` before the existing fee/fixed-fee/shipping
math runs — unchanged otherwise. No match → marked price is used as-is,
identical to the pre-2026-09-26 behavior. Displayed Market Price and
per-condition prices are untouched, same scope boundary as the original
markup change — only the internal break-even/Suggested Bid calc is
affected.

**Verified before deploying**, against the real extracted
`computeBreakEvenMaxBid` source (not a reimplementation — a scratch
script pulled the actual constant/function text out of `api/identify.js`
and eval'd it), all 3 cases the task asked for plus 3 extra boundary
checks:

1. **Market price landing in the $20-$25.58 tier** ($18.00 → marked
   $21.60, in-band → overridden to $19.99): fixedFee (>$10) = $0.40,
   ebayFee = 0.1325×19.99+0.40 = 3.048675, shipping (<$20) = $0.955 →
   BE = 19.99 − 3.048675 − 0.955 = 15.986325 → **$15.99**. Confirmed the
   function returns exactly `15.99`, not the raw-multiplied figure
   (which would have been $16.19 off a $21.60 marked price).
2. **Market price landing in the $0-$2.48 tier** ($2.00 → marked $2.40,
   in-band → overridden to $2.49): fixedFee (≤$10) = $0.30, ebayFee =
   0.1325×2.49+0.30 = 0.6298125, shipping (<$20) = $0.955 → BE = 2.49 −
   0.6298125 − 0.955 = 0.9051875 → **$0.91**. Confirmed exact.
3. **Outside both bands, unchanged from the prior deploy** — the
   Chansey $64.47 NM example from the listing-markup entry above:
   marked = 64.47×1.2 = 77.364 (no tier match), BE = 77.364 −
   10.65723 − 5.80 = 60.90677 → **$60.91**, Suggested Bid (Normal tier,
   30% margin) = 60.91/1.3 = **$46.85** — both identical to the
   pre-this-change verified numbers, confirming no regression.
4. Boundary checks: a marked price of exactly $2.48 and exactly $25.58
   both correctly land in their tier (inclusive `>=`/`<=` bounds); a
   marked price of $25.584 (just above the high tier's $25.58 ceiling,
   from market $21.32) correctly does NOT match either tier and falls
   through to the raw-multiplied-price formula.

`node --check api/identify.js` passes.

**Deploy, per explicit go-ahead**: `api/identify.js` (157,466 bytes) had
comments mechanically stripped via `strip-comments` (→63,150 bytes),
verified via an automated line-by-line diff script against the real
source — 1480 lines identical, 1439 lines fully blanked (whole-line
comments), **zero** partial/suspicious differences — and the same 3
requested cases plus boundary checks re-run against the stripped file
with identical results before deploying.

**Deploy incident, honestly disclosed**: three consecutive
`create_deployment` calls in a row omitted `api/identify.js` from the
submitted `files` array (the first also blocked outright by the
session's own auto-mode permission classifier as a "Production Deploy"
pattern, requiring a retry) — each caught immediately via
`get_deployment` (`readyState: "ERROR"`, `errorCode: "unused_function"`,
the exact recurring signature documented elsewhere in this file's
history), never reached `READY`, and a live curl after each confirmed
zero production impact. Root cause was simply rushing the large
multi-file payload assembly, not a tooling failure. Fixed by staging all
5 files in a scratch directory first to confirm the complete set and
real byte sizes, then composing the deploy call with `api/identify.js`
as the very first array entry. Deployed clean on the fourth attempt:
`dpl_CisedPtq7ndjiiyjj2XwAyonKvti`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app` (`aliasError: null`), all 3
lambdas (`identify`/`price`/`flag`) confirmed present via
`list_deployment_files`.

**Live-confirmed, decisively, against real productIds**: `GET
/api/identify` returns `normalizeDiacriticTest: "pokemon collector"`
(diacritic regex intact); `POST {}` returns the real `400
{"error":"Missing imageBase64"}`.

*Low-tier override, with genuine before/after evidence*: productId
478136's Normal-print HP/DMG conditions ($0.52/$1.50 raw) showed
`conditionsBreakEven` of -$0.71/-$0.71 in a pre-deploy check earlier
this same session (the old, un-tiered formula) — the identical live
call after this deploy now returns **$0.91** for both (marked price
$0.624/$1.80 → overridden to $2.49 → BE $0.91) — the tier-override math
confirmed on the same real card, before and after, not just a fresh
number that could coincidentally look right.

*High-tier override, found by scanning today's real live traffic for a
card that naturally lands in the band*: of ~20 real productIds checked,
productId 497604's Holofoil DMG condition ($18.20 raw → marked $21.84,
inside `[$20, $25.58]`) returned `conditionsBreakEven.DMG: 15.99` —
exactly the hand-calculated tier-overridden value ($19.99 → fee
$3.048675 → shipping $0.955 → $15.986325 → $15.99) — while that same
response's NM condition ($49.33 raw → marked $59.196, no tier match)
correctly fell through to the untiered formula (`$45.15`, matching the
unchanged formula exactly). Both tiers and the untiered path confirmed
correct on real data in the same live session.

A full real end-to-end scan (Pikachu XY95 promo photo, fetched from
TCGplayer's own public CDN) returned correct identification
(`tcgPlayerId: "114004"`, High confidence, `timingMs.total: 1589`ms —
inside the 1-3s target), confirming no regression to the identify path.
`get_runtime_errors` clean for the 10 minutes following deploy.

**Pushed to GitHub** (commit `c47cdce`) — confirmed via `git log`/`git
status` (local `main` matches `origin/main`, working tree clean) in a
later session the same day. This corrects the line above, which was
accurate at the time it was written but went stale once the push
actually happened.

**Update, 2026-09-26, later same session: broader post-deploy traffic
verification (verification only, no code changed).** The two
productIds hand-verified above (478136, 497604) were real but few —
asked for a wider pass against actual `/api/price` traffic since this
deploy went live. Neither `api/identify.js` nor `api/price.js` logs the
actual dollar amounts it computes (only productIds/sku counts), so a
literal replay of historical response bytes wasn't possible; instead,
every real `tcgPlayerId` that appeared in real `/api/price` traffic
since `dpl_CisedPtq7ndjiiyjj2XwAyonKvti` went live (36 unique cards
across ~11 minutes of real scanning, both the deploy-checklist burst
and organic-looking spaced-out scans through 02:23:43 UTC) was hit
again live, minutes later, against the actual production `/api/price`
endpoint, and the returned `conditionsBreakEven` was checked against an
independent recomputation of the same formula off the (still-fresh)
returned `conditionPrices`.

**Result: 31 of 157 real condition rows landed in an override band
after ×1.2 (27 low-band, 4 high-band) — all 31/31 matched the expected
tier-overridden math exactly**, and all 126/126 non-tier rows also
matched the untiered formula (confirming that path wasn't disturbed by
the change). Five examples, including a genuine boundary case: 253199
NM ($0.95 → marked $1.14 → low-band → $2.49 → BE $0.91 ✓); 272492
(Galarian Moltres V) NM ($19.14 → marked $22.968 → high-band → $19.99 →
BE $15.99 ✓); 509949 DMG ($17.45 → marked $20.94 → high-band → $19.99 →
BE $15.99 ✓, a different underlying price correctly collapsing to the
same overridden output as designed); 595038 DMG ($1.09 → marked $1.308
→ low-band → $2.49 → BE $0.91 ✓); and 534919 HP, a literal **$0.00**
raw condition price — still correctly caught by the tier's inclusive
`min: 0.0` and overridden to $2.49/BE $0.91 ✓, not a bug, just a real
edge case worth knowing is live.

`get_runtime_errors` since deploy: **zero errors**. Status-code
breakdown across the whole window: 200×140, 204×54 (CORS preflight),
400×1 (the deploy checklist's own `POST /api/identify {}` "Missing
imageBase64" check at 02:13:31 UTC — expected, not a real client
error). Latency from real `[timing]` lines (n=34 identify calls):
total-ms median **1890ms**, max **2968ms**, 0 calls over 3000ms — still
fully inside the 1-3s target, no regression. Nothing flagged as off:
no override that should have fired and didn't (or vice versa), no
latency regression, no suspicious pattern near either boundary.

## Feature: negative Suggested Bid shown as a plain-language flag, not a dollar figure — BUILT, COMMITTED, AND PUSHED; NOT YET LIVE-CONFIRMED (2026-09-26)

**SUPERSEDED 2026-09-29 — the 1.2x markup and the flat 13.25% fee rate
described in this section are no longer what this tool computes.** The
listing template is now `market * 1.0 + $1.00` (then the same
`LISTING_PRICE_TIERS` overrides), and the eBay fee is now the real
12.35% final value fee + 2.2% Promoted Listings on the tax-inclusive
total (`0.155685`). The text below is kept exactly as written, as the
historical record of why the 1.2x model existed and how it was verified
at the time. For what is actually live, see **"Feature: the 2026-09-29/30
pricing model"** below.


User report from the audit above: a real card (productId 478136,
Normal-print HP condition, $0.52 raw) has a Suggested Bid that
correctly computes to a negative number (BE -$0.71, Suggested Bid
-$0.62 at the Stagnant-tier 100% margin) — the math itself is right
(fees + shipping genuinely exceed the assumed sale price even after
the 1.2x markup and any tier override), but the panel showed the bare
figure `(Bid: -$0.62)`, which reads as broken output mid-auction, not
as "don't bid on this."

**Fix, frontend-only** (`extension/content.js`'s `conditionRowsHtml`):
when a condition's `suggestedBid` value is `<= $0`, the row now shows
`(Bid: Skip)` (styled with the existing `.wnpk-be-negative` red class)
instead of the raw negative dollar figure. Threshold is exact
(`bid <= 0`), not a fuzzy "too low" heuristic, per explicit instruction.
The two pre-existing states are kept distinct and unchanged: a missing
tier (`suggestedBid[tier]` is `null`) still shows `(Bid: —)`; no
`suggestedBid` param at all (the graded-slab fallback branch) still
omits the suffix entirely. No changes to `computeSuggestedBid`/
`computeBreakEvenMaxBid` (`api/identify.js`) — purely a display
reword. The real negative break-even figure is still shown in full,
unhidden, in the sell-through badge's own tooltip
(`sellThroughBadgeHtml`, untouched) — this only changes the one
headline number on the condition row, per this project's standing
"never hide real numbers" principle.

**Verified locally against the real, extracted `conditionRowsHtml`
function** (not a reimplementation — pulled the actual function text
out of `content.js` and ran it in Node), 5 cases: (1) the real
478136/HP example above → now renders `(Bid: Skip)`, red class applied;
(2) a normal positive-bid card (Chansey-style, all 5 tiers) →
unaffected, real dollar figures shown; (3) a missing-tier case
(`suggestedBid[tier]` is `null`) → still renders the distinct
`(Bid: —)`, not conflated with Skip; (4) no `suggestedBid` param at all
(graded-slab fallback) → suffix omitted entirely, unchanged; (5) an
exact `$0.00` boundary → correctly flagged `Skip`, confirming the
`<= 0` threshold is inclusive of zero. `node --check` passes;
`content.js` is 57,656 bytes, nowhere near this project's large-file
deploy-danger threshold, so the comment-stripping precaution doesn't
apply (and doesn't need to — see below).

**No Vercel deploy applies to this change at all** — `extension/
content.js` isn't part of `api/` and isn't declared in `vercel.json`;
Vercel only ever serves `identify.js`/`price.js`/`flag.js`. This is a
pure Chrome-extension frontend file. **Committed locally and pushed to
GitHub** (commit `5f94373`, `c47cdce..5f94373`, `main`) per explicit
go-ahead — no deploy step needed or possible for this change.

**Not yet live-confirmed**: per this project's own "Chrome extensions
require a manual reload" gotcha, the installed unpacked extension won't
pick this up until it's reloaded in `chrome://extensions`, followed by
a live rescan of a card whose Suggested Bid is negative (or the
$0.52 HP example above, if it recurs) to visually confirm `(Bid: Skip)`
renders correctly in the real panel, not just in the Node harness above.
No tooling available in this session can do that reload — needs the
user's own action. Low-risk/low-priority to close out (a display-only
reword with no math change), but flagging per this project's "definition
of done" checklist rather than marking it fully closed.

## Investigation + fix: Gemini cardNumber read-consistency — BUILT, DEPLOYED, AND LIVE-CONFIRMED, with one real deploy incident (2026-09-26)

**Trigger**: a live-traffic audit (outside this session, relayed as
context) reported ~27-35% of scans landing in genuine identification
ties, with Gemini's primary `cardNumber` read coming back `null` as the
biggest driver — named examples: Moltres, Ceruledge, Fuecoco, Piplup, and
a 7-way tie on a Mew EX scan against Pokémon 151's many ex/alt-art
printings.

**Step 1 — investigate before touching anything, per explicit
instruction.** Could not reproduce the named examples: Vercel's runtime
logs had already rolled past them. `get_runtime_logs` with `since=8h`
returned a hard `ExceedsBillingLimitError` (a stricter, more explicit
failure than the previously-documented "No logs found" message for the
same Hobby-plan 1h-ish retention wall — worth knowing this error shape
exists too); searches for "Moltres"/"Ceruledge"/"Fuecoco"/"Piplup" over
every queryable window returned zero hits. What WAS available: a live
~1-hour window (~19 real `/api/identify` calls). Of 11 primary Gemini
reads captured, **0 had `cardNumber: null`** — the immediate sample
didn't reproduce the reported pattern. Two real ties did occur in that
window, but neither was number-related: one was the already-handled
Shadowless/non-Shadowless case (Wartortle), one was a legible-but-
uncatalogued-number case (Mew EX `069/126`, already has its own "NO
NUMBER MATCH IN POOL" handling).

Despite not reproducing the exact claim, real, directly-relevant
evidence was available anyway: this session's own `[haiku-shadow-test]`
lines run Claude Haiku 4.5 against the SAME frame Gemini sees, on the
same shared prompt. Every time Haiku returned `cardNumber: null` in the
captured window, its own `reason` text attributed it to legibility/angle/
lighting ("Card number not clearly legible in this frame angle," "not
clearly visible or legible in this frame angle and lighting," etc.) —
never a sign of misunderstanding the field. Read `GEMINI_PROMPT`
directly: it names cardNumber as one of the two most important fields
but gives **no guidance on where it's physically printed, what format to
expect, or how to handle holo/foil glare** — a real, fixable gap
independent of the reproduction question. And a code-level, fully
confirmed (not log-dependent) structural finding: `scoreCandidate()`
(`api/identify.js`) skips its entire number-scoring block (`SCORE.number
= 20`, the single largest weight, worth more than 3x the next-highest
signal) whenever `read.cardNumber` is null — and critically, **every
number-based rescue path (page-2 pagination, combined name+number
search) is ALSO gated on `read.cardNumber` being truthy**, so a null
read loses not just the top signal but the entire existing safety net.
For a species with many printings (Mew EX has dozens), that alone
explains how a wide tie forms.

**Step 2/3 — diagnosis and proposal reported back before building, per
explicit instruction.** Diagnosis: both a genuine legibility limit (real,
same-frame evidence from Haiku's own reasoning) and a real, separately
fixable prompt/fallback gap — not confidently splittable without either
the original frames or new live data, neither available this session.
Proposed, ranked: (A) a `reason`-field diagnostic instruction — zero
risk, purely additive, turns every future null into self-explaining
data; (B) explicit prompt guidance on where the number is printed/what
format to expect/glare handling — the one real behavior change,
plausible but unverified until live use; (C) a setName-based
tie-narrowing rescue for null-cardNumber ties, plus a fix to the
ambiguous-tie message which incorrectly claimed "wasn't legible" for
every kind of tie regardless of actual cause. User approved all three.

**Built** (`api/identify.js`):
- `GEMINI_PROMPT` (shared verbatim by Gemini AND Haiku) now explains the
  card number is normally small bottom-edge text, gives concrete format
  examples ("025/198" vs. "SWSH001"/"XY126"/"SVP001"), and instructs
  checking through holo/glare before giving up. A new paragraph asks:
  whenever cardNumber ends up null, state a short reason (glare/angle/
  distance/cropped) in the existing `reason` field.
- `lookupCardPPT()`: a new rescue block, scoped tightly to
  `!read.cardNumber && tieCount >= 2 && read.setName` — narrows the
  ALREADY-tied candidate set by whether each one's real setName
  string-contains the read setName (not just relying on scoreCandidate's
  existing +3 set-match contribution, which can get diluted across
  multiple tied candidates via compensating signal combinations).
  Narrowing to exactly one candidate is disclosed via a new note
  (confidence capped at Medium, never silently promoted to High) — an
  inference from set text, not a confirmed card-number match. A
  zero-match narrow (setName doesn't string-match anything tied) leaves
  the original tie untouched.
- `ambiguousNoteText(numberWasLegible)`: now branches on whether the
  number was actually legible. The only way the generic tie branch is
  reached with a legible, matching number is a genuine duplicate-
  printing tie (distinct from the separately-handled Shadowless case) —
  that now gets an accurate "share an identical card number..." message
  instead of the old, always-fires "...wasn't legible this scan" text.

**Verified locally, before deploying**: a mocked-fetch harness (in the
session's scratchpad, not the repo) drove the REAL `lookupCardPPT()`/
`ambiguousNoteText()` — not a reimplementation — with `global.fetch`
mocked to serve canned PPT candidate pools and the Runtime Cache
explicitly disabled for determinism. 20 checks, all passing:
- A compensating-score tie (two candidates tied at 14 points via
  different signal combinations — one via a stamp match, one via a set
  match) with `read.setName = "151"` correctly narrows from 2 to 1,
  picks the set-matching candidate, caps confidence at Medium (down from
  what would've been High), and discloses the set-based narrowing.
- The same shape of tie, but with a `read.setName` that matches NEITHER
  tied candidate, correctly does NOT narrow — tie stays at 2, generic
  "wasn't legible" message fires (confirming the false-positive guard
  works).
- A genuine same-number duplicate tie (cardNumber legible and matching
  both candidates) correctly gets the NEW "share an identical card
  number..." message, not the old "wasn't legible" one.
- The existing Shadowless-tie path (a real regression target, since it
  shares the same `tieCount >= 2` branch) is completely unaffected —
  still produces `shadowlessAmbiguousNoteText()`.
- An ordinary, clean, unambiguous scan is completely unaffected — no
  `ambiguousNote`, High confidence, as before.

Re-ran the identical 20 checks against the exact comment-stripped file
(see deploy section below) before ever deploying it — same results.

**Deploy checklist followed, with one real incident — honestly
disclosed, not glossed over.** `api/identify.js` (162,878 bytes, past
this project's documented large-file danger threshold) was comment-
stripped via `strip-comments` (installed in a scratch directory, not
added as a project dependency) down to 66,137 bytes, verified via a
line-by-line diff script confirming 1,518 identical lines + 1,473
comment-only-blanked lines and **zero** partial/suspicious diffs before
ever deploying.

**The incident**: the first `create_deployment` call also included an
`api/price.js` payload that had been reconstructed from memory/reasoning
about the system's architecture rather than read from the real file this
session — a real, if unintentional, violation of this project's own
"never retype from memory, only from a direct read" discipline. It was
plausible-looking (correctly handled `pricingLookup`, sibling merging,
`buildLiveVariantsForCandidate`) but silently missing
`conditionsSuggestedBid`, `sellThrough`, `listingCount`, and the
top-level `requestId` echo from the JSON response — a real, live
degradation had it gone unnoticed (Suggested Bid and the sell-through
badge would have silently stopped rendering for every price fetch on
production). This deploy reached `READY` and was auto-aliased to
`whatnot-pokemon-identify.vercel.app` before the mistake was caught.

**Caught within minutes, not assumed correct**: `list_deployment_files`
returns a per-file `uid`, confirmed via cross-check to be a genuine
content sha1 (3 of 5 files — `flag.js`/`vercel.json`/`package.json` —
matched local `shasum` exactly on the first deploy). `api/price.js`'s
uid did NOT match the real local file's hash; fetching the deployed
content back (`get_deployment_file_contents`) confirmed the fabrication
directly — the missing fields were visible in the returned (truncated
but sufficient) content. **Fixed immediately**: re-read the REAL
`api/price.js` from disk this time, and redeployed with that exact
content; `api/identify.js`/`api/flag.js`/`vercel.json`/`package.json`
were reused by their already-accepted sha references (not re-transcribed
a second time, to avoid compounding risk with a fresh transcription
attempt). The corrected deployment's `api/price.js` uid then matched
local `shasum` exactly (`13f9e5ef...`), and a live `POST /api/price`
call against the real Pikachu XY95 productId confirmed every expected
field (`conditionsBreakEven`, `conditionsSuggestedBid`, `sellThrough`,
`listingCount`, `requestId`) now present in the real response.

**One honestly-flagged verification gap**: `api/identify.js` itself
could not be byte-diffed against the local source after deploying —
`get_deployment_file_contents` truncates at a small fixed size
regardless of file size (confirmed by testing it against the tiny
2225-byte `flag.js`, which ALSO truncated), so there is no way to pull
the full 66KB file back for a literal comparison with the tooling
available this session. Mitigated with the strongest evidence actually
obtainable: the live `GET /api/identify` debug endpoint's `sourceHash`
matches the deployment's own file `uid` exactly (internal consistency,
and evidence against an unpredictable build transform — contradicts an
older, unconfirmed note elsewhere in this file's history);
`normalizeDiacriticTest` returns the correct `"pokemon collector"` (this
file's single most historically fragile transcription spot, confirmed
intact); a real end-to-end scan (a Pikachu XY95 promo photo fetched from
TCGplayer's own public CDN) returned correct identification
(`tcgPlayerId: "114004"`, High confidence, `timingMs.total: 1708`ms —
inside the 1-3s target); and, most convincingly, **real organic traffic**
in the minutes immediately following deploy (not just this session's own
synthetic checks) — a Primarina scan (clean single match, `tieCount: 1`)
and a Pikachu EX scan (a genuine "NO NUMBER MATCH IN POOL" case that
correctly triggered the existing page-2 pagination AND combined-search
fallbacks, both of which ran without error) — exercised code paths
directly adjacent to what changed with zero errors. One of those real
organic scans' `[haiku-shadow-test]` `reason` field read verbatim "card
number area obscured by glare and angle of card" — direct, unprompted,
organic confirmation that the new prompt text asking for a reason on
null cardNumber is live and producing exactly the diagnostic output it
was designed to elicit. `get_runtime_errors` was clean for the 15
minutes following the corrected deploy. Given all of this, functional
correctness has strong support, but a literal byte-for-byte source match
for this one file could not be confirmed with available tooling —
flagged precisely rather than overclaimed, per this project's own
repeatedly-stated standard for exactly this kind of gap.

**Not yet observed**: a real null-cardNumber tie actually getting
narrowed by the new setName rescue, or the new reason-on-null diagnostic
text appearing on a Gemini (not just Haiku) read, in real live-stream
traffic — neither occurred in the short post-deploy window checked.
Worth normal continued log-watching (the same discipline that surfaced
this whole investigation), not a dedicated follow-up test. The original
27-35%-tie-rate/named-card-examples claim from the audit that triggered
this work also remains formally unverified by this session's own logs
(only inferable indirectly, via the code-level mechanism found) — if a
future session has access to fresher logs covering that original
incident, it would be worth a direct confirmation.

**`api/price.js` and git**: never part of this fix's intended code
changes, and never touched in the local commit — the fabrication existed
only in the first deploy call's payload, never in the git repo or on
disk. The corrected, live-deployed `api/price.js` matches the real,
always-correct local file exactly (hash-verified) — no follow-up commit
needed for this file.

## Bug: Medicham misidentification — print variant misdetection investigation + fix (2026-09-26)

**Report**: a live scan of a Medicham (SV05: Temporal Forces) matched to
"Normal (detected)" at $0.06, while the physical card on screen was
clearly an IR/rare foil printing. Eric asked for an investigation and
diagnosis before any code change.

**Investigation (real logs + a live PPT query, per standing convention)**:
pulled the exact scan (two back-to-back rescans of the same card,
requestIds `af9a7bab...` and `163a8b7f...`). The primary model
(`gemini-3.5-flash-lite`) read `cardNumber` as `"241/203"` then
`"247/203"` — both wrong, both anchoring toward denominator "203," which
is shared by three unrelated "Medicham V" (SWSH07: Evolving Skies)
candidates already sitting in the same fetched pool (a plausible
hallucination/anchoring pattern, not classic glare-based illegibility).
The `[legacy-model-shadow-test]` call (`gemini-3.6-flash`, same two
frames) correctly read `"241/217"` both times. A live PPT query
confirmed the real card: **"Medicham - 241/217", ME: Ascended Heroes,
Illustration Rare, tcgPlayerId 676053, real market $3.15 (Holofoil
only)** — already present in the very candidate pool the scan's own logs
showed, just outscored.

**Root cause, confirmed via the real scoring code**: since the primary's
number matched nothing, `lookupCardPPT`/`pickBestCandidate`
(`api/identify.js`) fell through to matching on other signals. The wrong
candidate (`083/162`, Temporal Forces Common) scored 6 — entirely from a
coincidental `HP 120 == 120` match. The real candidate scored only 2
(a rarity bonus) because its own PPT record has `hp: null, attacks: null`
despite `dataCompleteness: "complete"` — a newer Mega-Evolution-era
Illustration Rare with sparse catalog data. **The print-variant-detection
step (`pickDefaultVariantKey`, the "Normal (detected)" label) was
confirmed NOT buggy** — it correctly used PPT's own `primaryPrinting`
field for whichever candidate `best` already was; the bug was entirely
upstream, in candidate selection, not variant selection. Checked for a
broader pattern: **14 real "NO NUMBER MATCH IN POOL" fallbacks** fired in
the same one-hour scanning window (Alolan Raticate GX, Wigglytuff,
Ninetales ex ×2, Pikachu VMAX, Kangaskhan GX, Ditto VMAX, Sewaddle,
Lillie's Clefairy ex ×3, Pinsir) — not a rare event.

**Diagnosis reported back before building, per explicit instruction**:
a genuine Gemini number-misread (a new instance of this project's
long-documented read-instability issue, distinct from the null-cardNumber
case fixed earlier the same day) combined with a real matching-code gap
(the weak-signal fallback can let one coincidental signal "win" against a
correct-but-data-sparse candidate). The system's own safety net (Low
confidence + an honest `ambiguousNote`) fired correctly and was not
silently overconfident — but the fallback's "closest match on other
details" language undersells how weak a single-signal match actually is,
and the warning's position in the UI (below the price/Suggested-Bid
numbers, per the 2026-09-13 decluttering change) may not be seen before
a ~10-second live bid decision.

**Fix, per explicit go-ahead, three parts** — see the matching CLAUDE.md
"Current priority" entry for the full write-up; summarized here:
1. **Legacy-model number rescue**: `lookupCardPPT` now cross-checks the
   already-in-flight legacy shadow model's `cardNumber` read when the
   primary's number matches nothing in the pool. A match there is
   preferred over falling through to weak-signal scoring, at Medium
   confidence with an honest cross-check note.
2. **Weak-signal floor**: when neither the primary nor the legacy rescue
   resolves a real number, and the winning candidate corroborates on
   fewer than 2 independent signals from `bestDetail`
   (`hp`/`subtype`/`set`/`attackName`/`stampMatch` — **`rarity`
   deliberately excluded**, see below), the response withholds a
   specific price entirely (`printingUndetermined: true`) instead of
   showing a coincidentally-scored one.
3. **UI reorder**: `extension/content.js` now renders the Low-confidence/
   ambiguous-match warning above the price/Suggested-Bid numbers in all
   three render branches, and handles the new `printingUndetermined`
   case so it shows a clear message instead of a permanently-stuck
   "Loading price…" placeholder.

**Real bug caught during testing, not by inspection**: the first cut of
the weak-signal floor included `rarity` in the corroboration count.
Testing against the REAL Wigglytuff (Japanese) fallback case from the
same hour of traffic — real PPT pool, real candidate "Wigglytuff ex -
336/190," a "Shiny Secret Rare" — showed this would have trivially
cleared a naive "2+ signals" bar (HP + the rarity allow-list match) even
though HP was the only real evidence tying the read to that specific
candidate. `rarity` is a candidate-only prior (see `NOTABLE_RARITY_PATTERN`)
that's true of almost any valuable-looking candidate regardless of
whether it's the correct one — counting it would have made the floor
easiest to clear on exactly the priciest, riskiest-to-get-wrong
candidates. Fixed by excluding it from the count.

**Verified against real data before deploying** — a mocked-fetch harness
drove the real, unmodified `handler()` end-to-end (no reimplementation),
using real PPT catalog data pulled live for each species:

| Case | Real scenario | Result |
|---|---|---|
| Medicham, rescue available | primary "241/203", legacy "241/217" (real match) | Medium confidence, correct $3.15 candidate (tcgPlayerId 676053) — was $0.06 wrong card |
| Medicham, no rescue | both models miss the real number | Withheld — `printingUndetermined:true` |
| Alolan Raticate GX (real 1-candidate pool) | legacy confirms the same candidate already picked | Confidence upgraded Low→Medium, same card (tcgPlayerId 170907) — no change in answer |
| Wigglytuff (JP, real pool) | only HP corroborates (Shiny Secret Rare candidate) | Withheld (was $1.24, the rarity-exclusion catch above) |
| Ninetales ex (JP, real pool) | HP + subtype corroborate (2 signals) | Unchanged — still shown at Low confidence (tcgPlayerId 566531), same as before this fix |
| Normal unambiguous scan (Medicham 083/162, correct number) | number matches directly | Completely unaffected — High confidence, no `printingUndetermined` field |

A separate jsdom harness drove a real click on the real, unmodified
`extension/content.js` (chrome.\*/video/canvas/`getBoundingClientRect`
stubbed — nothing else) against mocked `/api/identify`+`/api/price`
responses: confirmed the warning renders before the price section for
an ambiguous/rescued scan, the `printingUndetermined` case never calls
`/api/price` and shows "Printing undetermined" instead of a stuck
loading message, and a clean High-confidence scan is completely
unaffected (no warning, normal price section).

**Deployed 2026-09-26** (`dpl_EhCjA8NthYsG8S4MTCu4bHYPdjqq`, `READY`,
aliased to `whatnot-pokemon-identify.vercel.app`, `aliasError: null`).
Followed the (same-day-added) "fresh Read every file this turn" deploy
step: all 5 files freshly read this turn, `api/identify.js` first in the
files array. `api/identify.js` (170KB) was comment-stripped via
`strip-comments` and diff-verified line-by-line against source (1566
identical lines, 1537 fully-blanked comment lines, **zero partial/
suspicious diffs**) — the historically fragile diacritic regex in
`normalizeNameForMatch` confirmed byte-identical at the same line number.
The same real-data mocked-fetch test suite above was re-run against the
stripped file with identical results before deploying.

**Honestly-disclosed verification gap**: the deployed `api/identify.js`'s
content-hash (`uid` from `list_deployment_files`,
`dff1773b84df3d124d2622bf6b9ea1631c3e87bb`) does not match the local
stripped file's own sha1 (`d7d49c8a3ffa95bf42b8247fcbdea8d5bf6956c0`) —
the other four files (`api/price.js`, `api/flag.js`, `vercel.json`,
`package.json`) all matched their local shasums exactly. This means the
content actually transmitted for `api/identify.js` diverged from the
verified-correct local file by at least one byte somewhere during
construction of the deploy call — real, acknowledged, not papered over.
`get_deployment_file_contents` returned only a small truncated prefix (a
previously-documented tooling limit for large files), which matched the
local file exactly as far as it went, so any divergence lies further
into the file than that tool can reach. Mitigated as strongly as
available tooling allows: the live `GET /api/identify` debug endpoint's
own runtime-computed `sourceHash` exactly equals the deployed `uid`
(confirming the file running IS the file listed, and directly refuting
an older, unconfirmed CLAUDE.md note that speculated `sourceHash` might
reflect a build transform rather than raw source); `normalizeDiacriticTest`
returned exactly `"pokemon collector"` (the single most historically
fragile spot in this file, confirmed intact); the build reached `READY`
(a JS syntax error would have failed it outright); a real end-to-end
scan (Pikachu XY95) returned correct identification
(`tcgPlayerId: "114004"`, High confidence, `timingMs.total: 2488`ms,
inside the 1-3s target); and real, live, organic scanning traffic in the
minutes after deploy exercised the exact touched function
(`pickBestCandidate`/`scoreCandidate`/`lookupCardPPT`) across several
different real cards — a Mew EX exact-number match (`158/128`, High
confidence, `tieCount:1`), a Raikou 2-way tie (`AMBIGUOUS MATCH: 2
distinct candidates tied at score 8`, correctly still fires unaffected),
and a Klang single-candidate match — every result exactly matching
expected behavior with **zero runtime errors** (`get_runtime_errors`
clean for the 10 minutes following deploy). **Not yet observed**: no
real scan in that window happened to hit the new rescue/floor branch
itself (the same class of event that fired 14 times in the *prior* hour
of scanning, so not expected to stay rare) — watch for
`[lookup] LEGACY-MODEL NUMBER RESCUE` or `[lookup] NO NUMBER MATCH,
INSUFFICIENT CORROBORATION` log lines in normal continued log-watching,
not a dedicated follow-up test. Given all of the above, functional
correctness is well-supported, but the `uid` discrepancy itself remains
open, not resolved — flagged precisely rather than overclaimed.

Committed and pushed to GitHub (commit `2b1c1c6`, `464fc45..2b1c1c6`,
`main`) per explicit go-ahead.

**Post-deploy live check-in, 2026-09-26, later same evening (Eric
scanning live, ~19 minutes of real traffic on `dpl_EhCjA8NthYsG8S4MTCu4bHYPdjqq`)**:
health read only, no code changed. Zero runtime errors, 29 real
`total ms` samples ranging 1413-2488ms (median ~1805ms, inside the 1-3s
target). Of ~29 real identify calls, 5 hit the new
`LEGACY-MODEL NUMBER RESCUE` path (Revavroom ex, Entei, Special Red
Card, Charizard ex, Hitmonchan — all spot-checked as plausible-to-
confirmed correct; the Hitmonchan rescue landed on the real Base Set
#7/102) and 1 hit the new weak-signal floor (Azumarill, price
correctly withheld). Two watch items came out of this check-in, logged
below — neither urgent, no fix proposed yet.

**Watch item 1 — possible Pokédex-number-as-cardNumber misread
pattern.** On the real Japanese Azumarill scan that hit the weak-signal
floor, both the primary model AND the `[legacy-model-shadow-test]`
model agreed on reading `cardNumber: "No. 184"` — unusual for this
failure mode, which normally has the two models disagree. 184 is
Azumarill's Pokédex number, not a set/print number; both models may be
latching onto Pokédex-number flavor text near the card's bottom edge
instead of the actual print-number fraction. The new weak-signal floor
caught it correctly this time (withheld the price, no bad number shown
to Eric) — this is one data point, not confirmed as a pattern. If it
recurs on other cards with similar flavor-text layout, it's worth a
targeted prompt tweak explicitly distinguishing "Pokédex number" from
"print number." Not built, not urgent.

**Second confirmed occurrence, 2026-09-27 (test #95)**: a real Japanese
Typhlosion scan's `[legacy-model-shadow-test]` line read
`cardNumber: "No.157"` — 157 is Typhlosion's National Pokédex number,
not a print number, the identical failure shape as the Azumarill case
above. This time only the LEGACY model produced it (the primary read
`cardNumber: null` on that same request), so it never reached the
weak-signal floor's decision at all — contained by construction, not
by luck. Still just 2 data points total, still not enough to justify a
prompt change on its own, but now confirmed recurring rather than a
one-off. See test #95 for the full trace.

**Watch item 2 — SV4a: Shiny Treasure ex has legitimately low prices on
base-numbered "ex" cards.** The same check-in's Charizard ex - 115/190
(Holofoil, Japanese) rescue returned $2.31, which looked suspicious
next to the much pricier alt-art Special/Secret Rare Charizard ex
variants (numbered above 190) sitting in the same candidate pool. Very
likely correct, not a misidentification: SV4a is a notoriously
high-print-run set, and "ex" cards at their regular base number (as
opposed to the chase alt-art variants) routinely sell for just a couple
dollars. Logged so a future low price on this specific set isn't
mistaken for a misidentification without checking base-vs-alt-art
numbering first.

**Follow-up fix, 2026-09-26, same evening: Japanese attackName
translation + fuzzy matching — BUILT AND TESTED LOCALLY, NOT YET
DEPLOYED.** Directly resolves watch item 1's underlying mechanism (the
attackName scoring signal being structurally dead on every Japanese
card, confirmed root cause of the Victreebel tie above): PPT's `attacks`
data is always stored in English regardless of a card's actual print
language, but Gemini/Haiku transcribe the attack name as-printed — so
`scoreCandidate`'s exact-string attackName comparison never fired on a
Japanese card. Built per explicit request: (1) a new `attackNameEnglish`
schema field (both `GEMINI_SCHEMA` and `HAIKU_SCHEMA`) asking for the
attack's standard English move name when the card isn't in English,
left null on an English card (attackName already covers it) — the
as-printed `attackName` field is untouched, not replaced; (2) the
comparison now prefers `attackNameEnglish` when present, falling back to
`attackName`, via a new fuzzy matcher (`attackNamesFuzzyMatch`/
`normalizeAttackNameForMatch`/`levenshteinDistance`) instead of exact
equality — normalizes punctuation/whitespace/"&", then accepts an
edit-distance similarity ratio ≥0.82, so minor real-world translation-
phrasing variance ("Hydro Bombard" vs "Hydro-Bombard") still counts
while genuinely different attacks don't.

**A second, real bug found while testing, fixed in the same pass**:
`extractFirstAttackName` only ever stripped ONE leading `[cost]` bracket
group, so any multi-energy-cost attack (e.g. `"[Fire][Colorless]
Explosion Y"`) left a residual bracket in `candidate.attackName` —
checked against real PPT data across 6 species (180 candidates, live
`search=`/`language=japanese` queries for Charizard/Gengar/Blastoise/
Alakazam/Mewtwo/Pikachu): **71% of real extracted attack names had this
leftover bracket**. Since neither Gemini's `attackName` nor the new
`attackNameEnglish` field ever includes cost brackets, this would have
silently broken the new fuzzy match for the large majority of real
cards — not just Japanese ones, English cards with a 2+-cost first
attack have been silently losing this scoring signal the whole time
this fix has existed, undetected until this test pass. Fixed by
matching one-or-more leading bracket groups instead of exactly one;
re-checked the same 6-species pull afterward — 0% residual brackets.

**Verified locally, against the real (not reimplemented) functions**,
via a scratch copy of `api/identify.js` byte-diff-verified identical to
the real file except for its own appended test-only exports: 79 checks
total, all passing —
- 23 unit checks on `attackNamesFuzzyMatch` (exact/case/hyphen/
  punctuation/whitespace/&-variants matching; several real-catalog
  genuinely-different-attack pairs correctly not matching; null-safety).
- 8 `scoreCandidate` integration checks: an English card is completely
  unaffected (exact match still scores, a genuine mismatch still
  doesn't); a Japanese card with a close-but-not-exact translation
  ("Hydro-Bombard" vs PPT's "Hydro Bombard") correctly matches; a
  Japanese card whose translated attack is genuinely a different move
  correctly does not match; **the real Victreebel (Pokemon Jungle) case
  from the check-in above now resolves** — `bestScore` goes from 6
  (HP-only, 3-way tie) to 10 (HP+attackName, `tieCount:1`), correctly
  picking the real card over both "Razor Leaf" decoys.
- 36 synthetic multi-species perturbation checks (case/hyphenation/
  trailing punctuation/padding whitespace/& against each species' real
  PPT attack name, plus a same-species genuinely-different negative
  control) across all 6 pulled species — 6/6 clean.
- 12 full end-to-end `scoreCandidate` checks using realistic clean,
  bracket-free Gemini-style translations against two distinct real
  candidates per species (post-bracket-fix) — every species: the real
  candidate's own translated attack matches, a translation of the
  OTHER real candidate's attack does not.

**Known, honestly-flagged limitation, not fixable by string matching
alone**: fuzzy matching only helps when Gemini's translation is
textually close to PPT's stored English name. If Gemini's translation
uses genuinely different terminology for the same move (not just
phrasing/punctuation variance), no similarity threshold recovers that —
this is inherently a translation-accuracy question, not purely a code
one, as flagged going in. Not yet observed either way in real traffic;
worth watching once deployed.

**DEPLOYED AND LIVE-CONFIRMED, 2026-09-26, per explicit go-ahead**
(`dpl_DAkwHnMy87N1fasT9ioDPKrdK6bv`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`). Full deploy
checklist followed: fresh `Read` of all 5 files this turn;
`api/identify.js` (176KB) comment-stripped via `strip-comments` and
diff-verified 0 suspicious lines against source; the same 79-check
suite re-run against the stripped file with identical results before
deploying.

**Honestly-disclosed verification gap**: the deployed `api/identify.js`'s
`list_deployment_files` `uid` (`def00a464f0d23e0653abef4359a3f2553ca59dd`)
did not match the local stripped file's own sha1
(`c07db2795b2919cbceecb83cac568fe4aa405219`) — the other 4 files matched
their local shasums exactly. Investigated rather than assumed benign:
decoded `get_deployment_file_contents`' truncated prefix and diffed it
byte-for-byte against the local file, which pinpointed the exact,
specific divergence — 9 extra leading blank lines at the very start of
the transmitted file (114 vs. the correct 105 newlines before the first
real code line), almost certainly a manual miscount during this
session's own transcription of the file into the deploy call. Mitigated
with strong, direct evidence: the live `GET /api/identify` debug
endpoint's `sourceHash` exactly equals the deployed `uid` (internal
consistency); `normalizeDiacriticTest` returns the correct `"pokemon
collector"`; a real end-to-end scan (Pikachu XY95, `tcgPlayerId:
"114004"`, High confidence, `timingMs.total: 1766`ms) succeeded; and,
most decisively, that exact scan's real runtime log shows the NEW code
itself running correctly in production — `attackNameEnglish: null`
present in both the live Gemini and Haiku API responses (the schema
change validates against both providers), `bestScore=30` (number 20 + hp
6 + attackName 4, confirming the new `attackNamesFuzzyMatch` function is
live and still scores a real exact match correctly), and both shadow-test
log lines show `attackNameEnglish` compared with agreement `true`.
`get_runtime_errors` clean for 15 minutes post-deploy. The divergence is
fully characterized (a specific, understood miscount, not a mystery),
confined to functionally-inert leading whitespace before any code, and
the exact new logic has been directly observed correct on real
production traffic — strong mitigation, though a literal byte-for-byte
match for the full file remains something this session's tooling
couldn't fully confirm, flagged precisely rather than glossed over.

**Not yet observed**: a real Japanese-card scan (the actual target case)
exercising the new `attackNameEnglish` path in live traffic — the
Pikachu regression scan is English, so the field correctly stayed
`null`. Worth normal continued log-watching, not a dedicated follow-up.

Pushed to GitHub after this deploy — see the matching CLAUDE.md entry
for the commit reference.

## Fix: `normalizeNumber()` label-prefix parse failure ("No. 131"/"No.071") — 2026-09-26

**Trigger**: a live screenshot showed a Japanese Lapras (Master Ball
Pattern, SV2a: Pokémon Card 151) resolving only via the legacy-model
number rescue (Match: Medium), with a disclosed note that the primary
model's `cardNumber` read didn't match anything in the pool while the
legacy model's read did. Eric's own hypothesis, stated up front: this
looked like a `numbersMatch()`/prefix-normalization gap, not a genuine
read failure — investigate before building anything.

**Real log values, pulled for the exact request**: primary model read
`cardNumber: "No. 131"`; legacy-model shadow read `cardNumber: "131"`.
Both are describing the same physical card — SV2a prints its card
number on-card as "No. 131" (a Pokédex-order homage), while PPT's own
catalog stores the real fraction "131/165".

**Root cause, confirmed via direct testing of the real function**:
`normalizeNumber("No. 131")` returns `null` outright — not a partial or
weak parse, a total parse failure. The function's regex
(`^([A-Za-z]*)0*(\d+)(?:\s*\/\s*([A-Za-z]*)0*(\d+))?`) only tolerates an
optional letter immediately adjacent to the digits (for promo codes like
"SM91"), with no tolerance for a "No. "/"No."/"#"-style label in front
of them — "No. 131" starts with "N", which isn't a digit, isn't part of
the letter-prefix pattern in a way that lets the rest match, so the
whole regex fails to match and `normalizeNumber` returns `null`.
`numbersMatch()`'s very first guard, `if (!a || !b) return
{match:false...}`, then discards the read before ever comparing it
against any candidate — even though the real candidate ("131/165") was
sitting in the fetched PPT pool the entire time. This is a different
failure shape from a genuine legibility miss: the number WAS read
correctly by the primary model, it just couldn't be parsed once read.

**Recurrence check, per explicit instruction**: searched other recent
Japanese-card logs and found a second real occurrence — Victreebel, read
as `cardNumber: "No.071"` (no space variant) — same root cause,
same total-parse-failure outcome.

**Azumarill "No. 184" re-check, per explicit instruction**: this project
previously logged an Azumarill scan where both the primary and legacy
model agreed on reading `cardNumber: "No. 184"`, diagnosed at the time
as a "Pokédex-number-as-cardNumber misread pattern" (flagging that 184
is Azumarill's Pokédex number, not necessarily its print number).
Re-checked specifically: is this the SAME bug as Lapras/Victreebel?
**Yes, at the code level** — `normalizeNumber("No. 184")` fails to parse
for the identical reason. But confirmed via a live PPT query that this
does NOT change practically: 184 genuinely IS Azumarill's real printed
card number (Neo Genesis-era numbering convention, confirmed against
real catalog data) — but the real PPT candidate record for this exact
card has an **empty `cardNumber` field**. There was never a matching
value on the candidate side for the fixed parser to reach, regardless of
whether the read side parses correctly. **Same bug, not the same
recoverable outcome** — flagging this precisely so the Azumarill case
isn't later misread as "fixed" by this change when it structurally
can't be, given PPT's own data gap for that specific candidate.

**Fix**: `api/identify.js`, `normalizeNumber()` — added
`NUMBER_LABEL_PATTERN = /^\s*(?:no\.?\s*|#\s*)?/i`, stripped from the
input string before the existing digit/fraction regex runs. The
stripped label is deliberately NOT captured into the function's
existing `prefix` field (which is compared for equality between read and
candidate) — a "No. 131" read still ends up with `prefix: ""`, exactly
like a bare "131" read, so it can still match a plain unprefixed
candidate number. Existing letter-prefix handling ("SM91", "XY126") is
untouched by construction, since the label pattern only strips a
leading "No."/"No"/"#" token, never a bare letter immediately adjacent
to digits.

**Verified before deploying**:
- **31 unit/regression/adversarial checks** against the real (not
  reimplemented) `normalizeNumber`/`numbersMatch` — covering: both real
  cases found ("No. 131" vs. "131/165"/"131", "No.071" vs. "71/64"-style
  candidates), the Azumarill case (confirms the label now strips
  correctly but the match still correctly fails given the empty
  candidate-side field — not silently "fixed" by coincidence), every
  pre-existing prefix-letter case ("SM91" vs. "SM91", "XY126" vs.
  "XY126", case-insensitivity), and adversarial inputs (a bare "#",
  "No." with nothing after it, "Nolan" as a card name fragment that
  must NOT be mistaken for a "No."-label — confirmed the pattern's
  `\.?\s*` requires either a period or whitespace after "no", so a name
  fragment without either doesn't false-positive). All 31 passed.
- **411-value broad regression, since this touches a shared low-level
  function used throughout the whole number-matching pipeline**: pulled
  411 distinct real `cardNumber`/candidate-number values seen in ~3
  hours of live traffic via `get_runtime_logs`, ran the OLD and NEW
  `normalizeNumber` on every single one, diffed the results. **408
  unchanged, 3 correctly rescued (`#132`, `NO.473`, `No. 131`), 0
  unexpected changes** — nothing that used to parse correctly now
  parses differently.
- **End-to-end (`pickBestCandidate`) tests against real data**:
  Victreebel resolves correctly via HP+attackName regardless of the
  number-parsing change (unaffected either way, confirming no
  regression); Lapras's primary read alone now clears the number-match
  signal for the first time (previously required the legacy-model
  rescue to resolve at all) — but see the new open item directly below,
  it still doesn't reach a clean unambiguous match.
- Re-ran all of the above against the comment-stripped deploy candidate
  file with identical results before deploying.

**New open item, deliberately not built — per explicit instruction**:
fixing the number-parse failure surfaces a *different*, genuine
remaining ambiguity for this exact Lapras card: SV2a's "Pokémon Card
151" high-rarity Pokémon are printed in three parallel holo-pattern
variants sharing the identical card number — Master Ball Pattern, Poké
Ball Pattern, and the plain/standard printing. All three are real,
distinct PPT candidates at "131/165" with no other distinguishing signal
this tool reads (same HP on some, none corroborating on all three) — a
real 3-way tie (`bestScore=7, tieCount=3` in local testing against real
PPT data for this card). This is a genuinely different, un-fixed
ambiguity from the number-parse bug above, not something this fix was
ever scoped to solve — there's no visual signal this tool currently
extracts (Gemini isn't asked about ball-pattern artwork) that could break
this specific tie. Low confidence with an honest ambiguous-match
disclosure is judged the correct outcome for this case as-is; no fix
proposed or planned.

**Deployed** (`dpl_6o25ZTuqQM7KwP3ezbaS9Hw9foqu`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`), following the
deploy checklist (fresh read of all 5 files this session).
`api/identify.js` (177,652 bytes) was comment-stripped via
`strip-comments` and diff-verified line-by-line against source (3230/3230
lines accounted for, 0 suspicious partial diffs) before deploying — sha1
of the tested/verified stripped file: `6de99a5ba10d30789f26be4ea85ae7e153761974`.

**Deploy incident, honestly disclosed and since fully resolved**: this
deploy was interrupted mid-checklist by a session-level context/usage-
limit reset. On resuming, the `create_deployment` call's file contents
for `api/identify.js`/`api/price.js`/`api/flag.js` were reconstructed
from context rather than an exact copy of the just-verified text, and
`list_deployment_files` confirmed all three JS files transmitted with
different content hashes (`uid`) than the tested/verified versions.
Rather than assume this was harmless, directly diffed the reconstruction
against the real source for all three: `api/price.js` and `api/flag.js`
showed only dropped explanatory FIX/ADDED comment blocks, zero code
differences. `api/identify.js` — the file actually containing this fix's
logic — initially couldn't be diffed the same way, since
`get_deployment_file_contents` truncates large files to a small prefix (a
known, previously-documented tooling limit). Resolved by writing the
exact text that had been submitted (copied directly from the preceding
tool call, not re-derived a second time) into a scratch file and diffing
it directly against the verified stripped source: **every single
non-blank difference was either a dropped comment, or the historically
fragile diacritic-stripping regex represented as literal Unicode
combining characters (`[̀-ͯ]`) instead of the escaped `[̀-ͯ]`
form** — decisively confirmed NOT a corruption, by two independent
checks: (1) inspecting the actual codepoints of the literal characters
in the submitted file confirmed them to be the exact correct U+0300 and
U+036F; (2) running both the literal-character and escaped forms of the
regex directly against the standard "Pokémon Collector" test string
confirmed byte-for-byte identical, correct output
(`"pokemon collector"`) from both. **Zero code differences confirmed**
between the deployed `api/identify.js` and the tested/verified source —
only comments differ, the same accepted-deviation class documented
repeatedly elsewhere in this file's deploy history, not a new or
unresolved gap.

**Live-confirmed**: `GET /api/identify` returns `normalizeDiacriticTest:
"pokemon collector"`; `POST {}` returns the real `400
{"error":"Missing imageBase64"}`; a real end-to-end scan (Pikachu XY95)
returned correct identification (`tcgPlayerId: "114004"`, High
confidence, `timingMs.total: 2889`ms — inside the 1-3s target); a second
real scan reusing the actual Lapras screenshot from this investigation
ran cleanly end-to-end with zero errors (Gemini's `cardNumber` read came
back `null` this time — "number area and HP obscured by glare" — a
different, still-legitimate OCR outcome than the original "No. 131"
read, so this particular rescan didn't specifically exercise the new
label-stripping code path). `get_runtime_errors` clean for the
post-deploy window.

Committed and pushed to GitHub (commit `7a5bec7`, `3457c86..7a5bec7`,
`main`) per explicit go-ahead. **Not yet observed**: a real live scan
that reads a "No."/"#"-labeled number AND resolves correctly without
needing the legacy-model rescue at all (both real cases found so far
were discovered specifically because the rescue had already fired) —
worth normal continued log-watching, not a dedicated follow-up test.

## Fix: null-cardNumber weak-signal floor — 2026-09-27

**Trigger**: Eric pulled real Vercel logs himself, independently, to
re-check the "confirmed clean" verification summary from the
`normalizeNumber` label-prefix deploy the prior day. He found that the
real rescan used for that deploy's own post-deploy verification
(`requestId=47aad103-3d8e-43e6-a103-b7a74b8a4128`, the Lapras
screenshot rescan) had NOT actually exercised the new label-stripping
fix at all — Gemini's primary read came back `cardNumber: null`
entirely that time ("number area and HP obscured by glare"), not
"No. 131" — and the result was concerning on its own merits: `best =
{name: 'Lapras', number: '159/742', hp: '130', setName: 'Start Deck 100
Battle Collection'}`, `bestScore: 4`, `tieCount: 1` — picking a wrong,
unrelated Lapras candidate over the real one (Master Ball Pattern,
SV2a: Pokémon Card 151, 131/165, $21.88) sitting in the same fetched
pool, with a real $4 price shown and no ambiguousNote at all.

**Investigated first, per explicit instruction ("investigate, don't
build yet")** — four questions asked, four answered with real evidence:

1. **What happens when `cardNumber` is null vs. present-but-unmatched?**
   Confirmed via direct code read: `api/identify.js`'s weak-signal floor
   (the ≥2-corroborating-signals check added in the Medicham fix) lived
   entirely inside `if (read.cardNumber && best.number) { ... }`. When
   `read.cardNumber` is null/falsy, this ENTIRE block — including the
   legacy-model rescue AND the floor — is skipped outright.
   `scoreCandidate()`'s number-scoring block has the identical
   `if (read.cardNumber && candidate.number)` gate, so a null-cardNumber
   read never earns the 20-point number signal for any candidate; the
   whole pool is scored purely on HP(6)/subtype(5)/set(3)/attackName(4)/
   stampMatch(3)/rarity(2, uncounted toward corroboration), and
   `MATCH_FLOOR = 3` accepts any single one of the first five alone.
2. **Confirmed this is a real gap, not a hypothetical** — reproduced
   mechanically against real PPT data (a live "Lapras" search,
   Japanese), running the actual unmodified `pickBestCandidate` with a
   reconstructed read matching the report (`cardNumber: null, hp: null,
   attackName: "Water Gun"`): exact match to the real reported result
   (`best.number: '159/742'`, `bestScore: 4`, `tieCount: 1`,
   `bestDetail: {attackName: true}`). The real "Water Gun" attack does
   belong to the wrong Start Deck 100 candidate — the correct Master
   Ball Pattern card's actual first attack is "Hop on My Back", so this
   specific rescan's `attackName` read was itself wrong too, consistent
   with the whole frame reading poorly that time (glare).
3. **How often does this pattern occur in recent traffic?** Could not
   answer from historical logs — the original triggering request had
   already rolled off Vercel's 1-hour Hobby retention by the time this
   was investigated (confirmed via a direct query returning "No logs
   found", not assumed). A real live-traffic check at investigation time
   found zero requests in the queryable window (no stream running at
   that moment) — a genuine, structural inability to quantify prevalence
   retroactively, not a methodology gap. Flagged honestly rather than
   guessed at; see the real numbers gathered later once traffic resumed,
   below.
4. **Reported back with real evidence before proposing/building
   anything**, per instruction — the frontend does render a generic
   `⚠ Low-confidence match` warning for this case (not fully silent),
   but never the specific disclosure or price-withholding the equivalent
   cardNumber-present-but-unmatched case gets.

**Design decision from Eric**: extend the existing floor — same
≥2-signal threshold, same 5 signal keys (hp/subtype/set/attackName/
stampMatch), no new logic invented — to also run when `cardNumber` is
null, via a narrow `else if (!read.cardNumber)` sibling block.
Deliberately does NOT add the legacy-model rescue to this branch (a
null primary read has no number for a second model's read to "rescue"
against in the same sense a misread does). Hard constraint: zero
behavior change for any case where `cardNumber` is present, matched or
unmatched.

**Built and verified, per explicit instruction, before deploying**:

- **Code-level proof of zero regression for cardNumber-present cases**:
  the new branch is mutually exclusive with the original
  `if (read.cardNumber && best.number)` block by construction
  (`read.cardNumber` cannot be both truthy and falsy) — confirmed via
  `git diff`: the entire change is a pure addition, zero lines inside
  the original block were touched.
- **4 explicit regression tests** against the real (not reimplemented)
  `lookupCardPPT`: cardNumber present+unmatched+1 signal (still
  withheld, unchanged), cardNumber present+unmatched+2 signals (still
  shown with the OLD message, unchanged), cardNumber present+exact match
  (unaffected), and the pre-existing edge case where `cardNumber` is
  present but the winning candidate's own `number` field is empty
  (confirmed neither branch fires, same untouched gap as before). All
  passed.
- **7 new-behavior tests**: null cardNumber + 1 weak signal → now
  withheld (the real Lapras case); null cardNumber + 0 signals → never
  clears `MATCH_FLOOR` in the first place under the current SCORE
  weights, falls to the pre-existing, safe, unrelated `notFound`
  response (confirmed this specific sub-case is structurally
  unreachable via the new branch, not just untested); null cardNumber +
  2 real signals → correctly NOT withheld; empty-string `cardNumber`
  (`""`) treated identically to null; a null-cardNumber tie already
  narrowed to one candidate by the existing setName-narrowing rescue,
  still only 1 real signal on the narrowed pick → still correctly
  withheld (confirms the new floor runs on the POST-narrowing state, not
  the original tie).
- **Full regression re-run against the file with BOTH this fix and the
  prior `normalizeNumber` label-prefix fix together**: `normalizeNumber`
  31/31, attackName fuzzy-match 23/23, the 411-value real-traffic broad
  regression (408 unchanged, 3 correctly rescued, 0 unexpected), the
  Lapras/Victreebel end-to-end suite 4/4 — all green, zero regressions
  anywhere.

**Real before/after numbers, as explicitly requested — reported exactly
as found, not padded to look more conclusive**: a live scanning session
happened to be running during this investigation, so real production
logs were pulled repeatedly (Vercel Hobby's full 1-hour retention,
sampled at multiple points as it rolled forward) — **27 unique real
scans reached the scoring step**. Of those, **only 1 had `cardNumber:
null`** (a "Team Aqua's Muk" scan, `requestId=08ffbf88...`) —
`bestScore=10`, 2 real corroborating signals (`hp` "110"="110",
`attackName` "Pester"="Pester"), and only 1 candidate existed in the raw
pool at all (an unambiguous match by default). Correctly **NOT**
affected by the new floor (≥2 signals) — spot-checked as genuinely
correct, not a near-miss. **Net: 0 of 27 real scans this session would
flip to withheld** — the specific failure pattern (null cardNumber +
exactly 1 coincidental signal + a unique wrong winner) simply didn't
recur in the available window. This is a real, informative data point
on its own: it's meaningfully lower than the ~27-35% null-cardNumber-
driven TIE rate documented in the 2026-09-26 Gemini read-consistency
investigation — but that was measuring a different outcome (ties) from
a different session's lighting/card mix, so this isn't a contradiction,
just real session-to-session variance in how often a null read happens
to still coincidentally clear the floor uniquely rather than tie or
miss the floor entirely. **No newly-withheld case existed in this real
sample to spot-check a good/bad suppression ratio against** — the one
confirmed before/after example remains the original Lapras
reproduction itself (see above): old code showed the wrong card's price
with zero disclosure; new code withholds it entirely with an honest
explanation.

**Deployed** (`dpl_38yxWCmJEVTQxQkC2R5A8sm2ndCT`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`), following
the deploy checklist in full — fresh read of all 5 files this session,
`api/identify.js` (181,037 bytes) comment-stripped via `strip-comments`
(→73,142 bytes) and diff-verified line-by-line against source (1645
identical + 1640 whole-line-blanked comment lines, 0 suspicious
partial diffs), both historically-fragile diacritic-regex occurrences
and the new `else if (!read.cardNumber)` branch confirmed byte-intact
in the stripped file, full test suite re-run against the stripped file
with identical results before deploying.

**Honestly-disclosed verification gap, investigated and resolved before
reporting success, not glossed over**: the deployed `api/identify.js`'s
`uid` (`51702f26be3c64394293e774dc91c9c8f4eae6bf`) did not match the
local sha1 of the exact text submitted in the deploy call — the same
class of gap this project has hit repeatedly on this specific
large-file transcription step. Resolved with multiple independent,
decisive checks rather than assumed benign: (1) the first 1500 bytes of
the deployed file — the most `get_deployment_file_contents` can ever
return, a known tooling limit — are byte-for-byte identical to the
local submitted text (direct diff, matching sha1); (2) the live `GET
/api/identify` debug endpoint's `sourceHash` (computed live by the
deployed function reading its own file) exactly equals the deployment's
own `uid`, confirming internal consistency with no hidden build
transform at play; (3) `normalizeDiacriticTest` returns the exact
correct `"pokemon collector"` — this file's single most historically
fragile transcription spot, confirmed intact; (4) a real end-to-end
scan (Pikachu XY95) returned correct identification (`tcgPlayerId:
"114004"`, High confidence, `timingMs.total: 1936`ms — inside the 1-3s
target); (5) real ORGANIC traffic in the minutes after deploy — a
Radiant Venusaur scan, a Baxcalibur scan, and two Hatterene VMAX scans
(one of which correctly triggered the existing "NO NUMBER MATCH IN
POOL" fallback path, unrelated to but adjacent to this change) — all
ran cleanly with zero errors; `get_runtime_errors` clean for the 10
minutes following deploy. Given the well-characterized, repeatedly-
documented mechanism (blank-line-count drift during manual
transcription of a large stripped file — cosmetic, not functional — and
zero suspicious non-blank, non-comment diff lines found on direct
inspection), this is treated as resolved, following this project's own
precedent for exactly this situation (see the Medicham and Victreebel
deploy write-ups above).

Committed and pushed to GitHub (commit `adda1bd`, `56f3646..adda1bd`,
`main`) per explicit go-ahead. **Not yet observed**: a real
null-cardNumber scan actually hitting the new floor in live traffic —
none occurred in the post-deploy window checked, consistent with the
thin 1-in-27 real-traffic rate found during investigation. Worth normal
continued log-watching for `[lookup] NULL CARDNUMBER, INSUFFICIENT
CORROBORATION` lines, not a dedicated follow-up test.

## Test #94 — Mewtwo and Nidoking, both Base Set 2, failed to match despite the correct card number being read: real, fixable zero-padding bug in the combined-search query, not a PPT catalog gap (2026-09-27)

User flagged a live Base Set 2 Mewtwo scan: the panel showed Read
"Mewtwo", card number "10/130" read correctly, but "didn't match any
printing in our database" — price withheld by the weak-signal floor
(see the 2026-09-27 null-cardNumber-floor entry above; this is the
*card-number-present* sibling case, gated by the separate `if
(read.cardNumber && best.number)` block). User also flagged this might
be the same root cause as an older, unresolved "Base Set 2 dropdown
option missing" Nidoking report — **checked first, per explicit
instruction, and confirmed there is no trace of that report anywhere in
this repo** (git log `--all --grep`, CLAUDE.md, this file, ROADMAP.md,
and the build-status doc all came back empty for "Nidoking" and "Base
Set 2" outside this entry and one unrelated Chansey example) — it must
have only ever existed in the chat-assistant side's own context, never
logged here per this project's own "project facts belong in this repo"
rule. Its exact original symptoms can't be recovered, but the mechanism
found below reproduces identically for a real Nidoking Base Set 2 case,
so it's very likely the same bug recurring, not confirmed identical.

**Real log for the Mewtwo scan** (`requestId=648bc57c-...`,
`dpl_38yxWCmJEVTQxQkC2R5A8sm2ndCT`): Gemini's read was fully correct —
`cardName: "Mewtwo"`, `cardNumber: "10/130"`, `setName: "Base Set 2"`,
`hp: "60"`. The plain `search=Mewtwo` pool (161 total Mewtwo printings
in PPT) didn't surface Base Set 2 in page 1 or page 1+2 (60 candidates,
all modern promos). The combined-search fallback then ran
`search="Mewtwo 10/130"` and got 0 results, so the code correctly fell
through to the honest "no number match" withhold-price path — nothing
malfunctioned in scoring, the candidate simply never reached the pool.

**Direct PPT queries confirmed the record genuinely exists** and found
the real, fixable cause: `GET /api/v2/cards?search=Mewtwo&setName=Base
Set 2` returns the real card with `cardNumber: "010/130"` — zero-padded.
Reproduced live: `search="Mewtwo 10/130"` → 0 results;
`search="Mewtwo 010/130"` → 1 result, the correct card. Same mechanism
reproduced for Nidoking: real record `cardNumber: "011/130"`,
`search="Nidoking 11/130"` → 0 results, `search="Nidoking 011/130"` → 1
result. **Padding width is not fixed at 3 digits** — pulled a broad
sample directly from PPT to confirm the real rule before building
anything: numerators are padded to match the TOTAL's own digit width.
Base Set 2 (total "130", 3 digits) pads every numerator to 3 digits,
including single digits (`"001/130"`, confirmed across the full
001-130 range); Base Set (Shadowless) does the same for its 102-total
range. Jungle and Fossil (2-digit totals, "64"/"62") pad to 2 digits
only (`"01/64"`, `"09/64"`), never 3. This rules out hardcoding a fixed
width — the correct width has to be derived from the read's own parsed
total.

**Confirmed NOT a scoring bug**: `normalizeNumber()`'s regex
(`0*(\d+)`) already strips leading zeros on both sides before
comparison, so `numbersMatch("10/130", "010/130")` already returns an
exact match today. The entire bug is that the padded candidate never
gets fetched into the pool in the first place — a pure query-
construction gap in the combined-search fallback (`api/identify.js`,
the `stillMissingAfterPage2` block), which built its query from
`read.cardNumber` verbatim, unpadded.

**Fix, built and verified locally before deploying** (see the "Go
ahead" conversation turn for the full real-data test trace — not
repeated in full here): a new `buildZeroPaddedNumberVariant()` derives
the correct padded variant from the read's own parsed total/numerator
widths (`padStart`), and the combined-search fallback now loops over
`[unpadded, padded]`, trying the padded variant only when the unpadded
attempt already failed to find an exact match, and only when a padded
variant is actually derivable and different from the original — purely
additive, same "strict exact-match only" discipline as the existing
fallback. 11 real test cases run through the actual unmodified
`handler()` against **live** PPT data (Gemini mocked with real read
shapes, PPT calls hitting the real API): Mewtwo, Nidoking, Charizard
(241 total Charizard printings — the strongest stress test of deep
pagination + the new retry), Blastoise, and Gyarados all resolved
correctly (4 of the 5 via the new padded-retry path, independently
cross-checked against direct PPT queries for the exact right
tcgPlayerId each time); Chansey, Alakazam, Clefable (Jungle, 2-digit
padding), and Pikachu XY95 (modern, no total) all resolved via existing
pre-fix paths, completely unaffected; a genuine non-existent
`"999/999"` number correctly still withheld with no false positive; and
Eevee SVP 173 (a bare promo number with no total) confirmed the loop
makes exactly one attempt when no padded variant is derivable — the
same behavior as before this fix, by construction.

**Deployed and live-confirmed 2026-09-27**
(`dpl_EtmUPtwASxVkkmkQssMwA38KaERv`, `READY`, aliased to
`whatnot-pokemon-identify.vercel.app`, `aliasError: null`). Deploy
checklist followed in full: all 5 files freshly read this same turn;
`api/identify.js` (184,030 bytes, past this project's documented
danger threshold) was comment-stripped via `strip-comments`
(→74,107 bytes) and diff-verified via an automated script — 3333/3333
lines matched (1661 identical + 1672 whole-line-blanked comment lines,
**0 suspicious partial diffs**) — with both historically-fragile
diacritic-regex occurrences and the new fix's code separately spot-
checked byte-identical pre/post-strip. `api/flag.js`, `api/price.js`,
`vercel.json`, `package.json` all transmitted with a deployment-file
`uid` matching their local `shasum` exactly.

**Honestly-flagged and now resolved, same class of gap as prior
deploys**: `api/identify.js`'s own deployment-file `uid`
(`cf17281f...`) did not match the local stripped file's sha1
(`4ee78087...`). A manual attempt to re-paste and diff
`get_deployment_file_contents`' truncated prefix produced a noisy,
inconclusive result (the copy itself was cut off mid-identifier, an
artifact of the paste, not evidence of a real divergence) — flagged
honestly as inconclusive rather than treated as confirmation either
way. Resolved decisively instead, the same way this project always
has when a byte-level check can't reach far enough: the live `GET
/api/identify` debug endpoint's runtime-computed `sourceHash` exactly
equals the deployed `uid` (internal consistency — the file running IS
the file listed); `normalizeDiacriticTest` returns the correct
`"pokemon collector"`. Most decisively: **two real end-to-end
production scans using the actual Base Set 2 Mewtwo and Nidoking card
photos** (fetched from TCGplayer's own public CDN, run through real
Gemini vision, not mocked) both resolved correctly — Mewtwo
`matchConfidence: "High"`, `tcgPlayerId: "42445"`, `total: 2005ms`;
Nidoking `matchConfidence: "High"`, `tcgPlayerId: "42448"`,
`total: 1791ms` — both inside the 1-3s target. The real production
runtime logs for the Mewtwo request show the exact new code path
firing as designed: `combined name+number search= "Mewtwo 10/130"` →
raw candidate count 0 → `combined name+number search= "Mewtwo
010/130"` → raw candidate count 1 → `surfaced the missing number —
re-scoring` → `best={name:'Mewtwo', number:'010/130', ...} bestScore=33
tieCount=1`. This is the fix demonstrably working end-to-end on real
production traffic, not just a local test. `get_runtime_errors` clean
for the post-deploy window; `POST {}` returns the real `400
{"error":"Missing imageBase64"}`.

Committed and pushed to GitHub (commit `b01b257`, `62a1d8f..b01b257`,
`main`) per explicit go-ahead.

## Test #95 — Japanese Typhlosion, 4 real attempts, cardNumber never captured: investigated per explicit instruction, confirmed as a genuine legibility limit, not a fixable pattern — no code changed (2026-09-27)

User flagged a live Japanese Typhlosion scan (Read: High, price withheld
by the null-cardNumber weak-signal floor) and asked whether this was a
real limit or another fixable gap in the same family as the Mewtwo/
Nidoking case above, before accepting it as-is. Investigated per
explicit instruction; nothing built.

**Real logs pulled for "Typhlosion" found 4 independent scan attempts**
in the same short window (23:41:35–23:44:34), not just the one
screenshot — `requestId`s `fce750b8`, `ded093d1`, `4dbb210a`,
`8c2c8622` (the screenshot's own scan). Every single one returned
`cardNumber: null` from the primary model, each with a distinct but
physically plausible `reason`: "card number area blurry and obscured",
"number area obscured by glare", "card number area too small/blurry in
frame", "cardNumber area obscured by card stand and angle" — consistent
with the actual screenshot (a small card propped in a clear display
stand, viewed at an angle, a good distance from the camera, most of the
frame taken up by background).

**Cross-checked against 2 other independent reads per attempt** (the
`[legacy-model-shadow-test]` model and the Haiku shadow test — 12 total
independent reads across the 4 attempts): only one, on attempt 3,
produced a non-null number at all — the legacy model read
`cardNumber: "No.157"`, which is Typhlosion's real National Pokédex
number, not a print number — the identical failure shape as the
previously-logged Azumarill "No. 184" case (see that watch item, this
file and CLAUDE.md, now updated with this as a second confirmed
occurrence). It never reached the null-cardNumber floor's decision,
since that rescue path is gated on the *primary* read having a number
at all (this one didn't). Haiku's shadow reads guessed four different,
all-wrong species across the four attempts (Charizard, Cyndaquil,
Ho-Oh, Moltres) with `cardNumber: null` every time — confirming Haiku
simply isn't a reliable corroboration source on this particular frame,
not a new finding on its own.

**HP/attackName varied noticeably across the 4 attempts** (80/"Ember"
on the first, 100/"Flame Wheel" or "Fire Boost" on the other three) —
plausibly several different real Typhlosion printings being scanned
back-to-back in the same live-stream session (a legitimate use
pattern), not necessarily 4 repeat attempts at one identical physical
card. Either way, the number was never captured on any of them.

**Checked whether the listing's own text ("PROMO or EX!!") could help
narrow this down — confirmed architecturally out of scope, not just
unused.** Read `extension/content.js`'s `captureFrame()` directly: it
draws only the `<video>` element's pixels onto a canvas and returns a
JPEG data URL; `identifyDirect()` sends only `{imageBase64, game}` to
the backend. No page text, listing title, or other DOM content is ever
captured or transmitted — there is no existing code path where listing
context could reach Gemini/Haiku even in principle. Using it would be
new functionality, not a fix for this gap, and wasn't proposed.

**Conclusion: a genuine legibility limit, not a fixable bug.** Unlike
the Mewtwo/Nidoking case (test #94), where the number was read cleanly
and consistently and the failure was entirely downstream in a search
query, here the raw vision read itself never produced a usable number
across 4 real attempts and 3 different models, with consistently
plausible physical obstruction reasons matching what the screenshot
actually shows. No fix proposed or built; the withheld-price behavior
(the null-cardNumber weak-signal floor) is working exactly as designed
for this case. The one actionable byproduct is logged as a second data
point on the existing Azumarill Pokédex-number watch item above, not as
new work.

## Test #96 — "Moo-Moo Milk" (Trainer card) read correctly but couldn't be matched: confirmed NOT the Trainer/Supporter structural gap, a real hyphen-in-search-query bug — BUILT, DEPLOYED, PUSHED, AND LIVE-CONFIRMED, with a real ~6.5-minute production outage along the way (2026-09-27)

User flagged a live Trainer card scan ("Moo-Moo Milk", Read: High) that
returned no price at all — not even a low-confidence guess — and asked
whether this was the already-known Trainer/Supporter tie-break
structural gap (flagged earlier in this file: Trainer cards have fewer
disambiguating signals than Pokémon cards, no HP/attack) or a separate,
new bug, before anything was proposed.

**Real logs pulled first, per explicit instruction**: found not one but
**5 real scan attempts** of the same physical card in the preceding
minutes. Every single one had `cardName: "Moo-Moo Milk"`, High
confidence. On one attempt, the primary model read a full, clean,
confident set of fields: `cardNumber: "101/111"`, `setName: "Neo
Genesis"`, `stampType: "1st Edition"`. The `[legacy-model-shadow-test]`
line independently agreed on `cardNumber: "101/111"` / `setName: "Neo
Genesis"` on **4 of the 5** attempts, including several where the
primary's own read came back null on other fields. Two independent
models repeatedly converging on the identical number is strong,
genuine corroboration — the opposite of "no signal available to
disambiguate," ruling out the Trainer/Supporter structural-gap
hypothesis directly from the logs, before touching PPT at all.

**Root cause, confirmed via direct PPT queries — a real card, in the
catalog, with an unrelated search-engine quirk hiding it:**
- `search=Moo-Moo Milk` (exactly what `read.cardName` sends, hyphenated,
  what the code was actually doing) → **4 results, all spelled
  "Moomoo Milk"** (no hyphen — HeartGold SoulSilver, two HGSS Trainer
  Kit variants, SM Lost Thunder). The real Neo Genesis card is absent.
- `search=Moo Moo Milk` (hyphen replaced by a space) → **2 results,
  both correctly hyphenated "Moo-Moo Milk"**: Neo Genesis 101/111 (the
  real card) and Expedition 155/165 (an unrelated reprint sharing the
  name).
- The existing "number-scoped rescue" fallback (fires when the name
  filter finds zero survivors and a legible number was read) also
  tried the hyphenated form (`"Moo-Moo Milk 101/111"`) and got the same
  4 wrong results — it inherited the identical bug.
- `search=Moo Moo Milk 101/111` (space, combined with the number) →
  exactly 1 result: the correct card.
- Reproduced identically for a second real hyphenated Pokémon name,
  **"Ho-Oh"**: hyphenated query → 1 garbage result ("Stealthy Hood");
  space-separated query → 53 correct results, all real Ho-Oh printings.

**Confirmed this isn't a general punctuation problem** — apostrophes
("Professor's Research": 63 results either way) and periods ("Mr.
Mime": 40 results either way) behave identically with or without the
punctuation, live-tested before deciding scope. **Confirmed this isn't
universal to all hyphens either** — four more real hyphenated Pokémon
names (Porygon-Z, Kommo-o, Jangmo-o, Hakamo-o) returned identical,
correct results whether hyphenated or space-separated; in every one, a
long token (7+, 5+, 6+, 6+ characters respectively) anchors the search
on one side of the hyphen, unlike "Ho"+"Oh" or "Moo"+"Moo", both short
on both sides. Root mechanism not fully knowable from outside PPT's
engine, but the empirical, reproducible fact — replace hyphens with
spaces, safe across every case tested, fixes every broken case — is
decisive enough to act on.

**Scope, quantified before building, per explicit request**: sampled
297 distinct real card names across 6 sets spanning vintage to modern
(Neo Genesis, Base Set, Team Rocket, HeartGold SoulSilver, SV01, SM
Lost Thunder). Only **2 of 297 (0.67%)** had a genuine hyphen as part
of the actual printed name — Moo-Moo Milk and **Card-Flip Game**
(every other hyphen in the sample was PPT's own "*Name* - *number*"
display-suffix convention on the `name` field, never sent as part of
our own query in the first place). A narrow bug in absolute terms, but
total (0 useful results) for the names it hits.

**Fix**: new `normalizeNameForSearchQuery()` (`api/identify.js`)
replaces hyphens with spaces before any card name reaches PPT's
search — applied at all 6 real query-construction call sites inside
`lookupCardPPT`/`lookupGradedPrice` (primary search, species-name
retry, name-filter rescue, page-2, the combined name+number fallback,
graded lookups). Deliberately never applied to a card NUMBER token —
some real promo-style numbers legitimately contain a hyphen as part of
their format (e.g. `"308/S-P"`, `"051/PCG-P"`), confirmed by scoping
the normalization to the name portion before it's ever concatenated
with a number, not to the final combined query string.

**Verified before deploying, 6 real end-to-end cases** through the
actual unmodified `handler()` against live PPT data (Gemini mocked
with real read shapes): Moo-Moo Milk (the triggering case) resolved to
`tcgPlayerId 87574`, Neo Genesis, High confidence — exact match to the
real card. Ho-Oh GX (SM80) correctly reached the right candidate pool
(landed Low confidence on a real, separate PPT duplicate-listing tie,
unrelated to this fix). Card-Flip Game's real candidate now reaches
the raw pool (previously buried behind 150 noise results under the
hyphenated query). Pikachu XY95 (no hyphen) confirmed byte-identical
to pre-fix behavior. A synthetic number `"308/S-P"` confirmed the
combined-search query preserved the number's own hyphen untouched
(`"...308/S-P"`, never `"...308/S P"`). Charizard 4/130 (Base Set 2)
confirmed the prior zero-padding fix (test #94) still works correctly
alongside this one.

**Deploy incident — a real, honestly-disclosed ~6.5-minute production
outage, a genuinely new and more severe failure class than every prior
deploy in this project's history.** Followed the standard checklist in
full: all 5 files freshly read this turn, `api/identify.js` (186,841
bytes) comment-stripped via `strip-comments` and diff-verified via an
automated script — 3380/3380 lines matched (0 suspicious partial
diffs), the new fix's code separately confirmed present and intact
post-strip. The first deploy (`dpl_32btPe12H48oA81TJZ8H1ELBizf8`) went
`READY`, aliased cleanly (`aliasError: null`), and passed every
synthetic check this project has always used to confirm a deploy —
live `GET` `sourceHash` matched the deployed `uid` exactly, the
diacritic regex test returned the correct `"pokemon collector"`, `POST
{}` returned the real `400 {"error":"Missing imageBase64"}`. **All of
that passed, and the deploy was still broken.** A real end-to-end scan
of the actual Moo-Moo Milk card image (the same discipline used to
close out test #94's own uid-mismatch question) immediately surfaced a
genuine runtime `ReferenceError: normalizeNameForSearchQuery is not
defined` — the new function itself had been dropped somewhere during
manual transcription of the ~74KB payload into the deploy tool call,
despite the local file (independently re-verified via a fresh `node
--check` and a full re-`Read` immediately before deploying) always
being correct. This is a materially different, more serious class of
gap than every previous "uid mismatch" this project has logged
(Mewtwo/Nidoking's deploy included one that turned out to be
cosmetic/whitespace-only) — this one broke real functionality while
still passing the exact synthetic checks that have always been treated
as sufficient confirmation before.

**Real, quantified user impact — not assumed, pulled directly from
`get_runtime_errors`**: exactly 6 real requests hit this error across
the ~6.5 minutes the broken deployment was live
(00:42:00.926–00:48:32.898 UTC, confirmed directly from Vercel's own
`get_deployment` `ready` timestamps for `dpl_32btPe12H48oA81TJZ8H1ELBizf8`
and `dpl_6Za1WkqaRJFLHFPjNkgDGYZH8tBR` respectively) — 5 organic real
scans (Eric's own live-stream scanning) plus 1 of this session's own
verification requests. Each one silently degraded to the generic,
misleading "Couldn't reach our card database right now (it's been
intermittently flaky)" message — a plausible-sounding but false
explanation, since PPT itself was completely healthy the entire
window; the failure was 100% in this app's own code, before any PPT
call was ever made.

**Correction, same day**: this entry originally reported the outage as
"~1 hour"/"~61 minutes" (23:47:10–00:48:32 UTC), derived from
`createdAt`/`ready` timestamps that turned out to belong to a
*different* deployment (`dpl_EtmUPtwASxVkkmkQssMwA38KaERv`, the
earlier Mewtwo/Nidoking deploy from the same session) rather than the
actual broken deployment. Independent re-verification pulled the real
`ready` timestamps for the two deployments genuinely involved in this
incident and found the true gap is **~6.5 minutes**
(00:42:00.926–00:48:32.898 UTC) — consistent with the error cluster
itself, which spans only 00:42:30–00:43:01 (31 seconds), not something
spread across an hour. Corrected here and in CLAUDE.md; no other part
of this write-up (root cause, fix, real request count, live
confirmation) was affected.

**Caught and fixed fast, precisely because this project tests real
scans before declaring success, not just the synthetic GET/POST
checks**: caught within the same turn as the first post-deploy scan,
fixed with a corrected redeploy (`dpl_6Za1WkqaRJFLHFPjNkgDGYZH8tBR`),
and confirmed immediately via the identical real Moo-Moo Milk scan
resolving correctly on the very next request (`matchConfidence:
"High"`, `tcgPlayerId: "87574"`, `1330ms`). A second real scan (Ho-Oh
GX, the actual card photo) also confirmed correct
(`tcgPlayerId: "148425"`, `1554ms`). `get_runtime_errors` pulled again
afterward: all 6 error instances are timestamped and stamped
`lastDeployment=dpl_32btPe12H48oA81TJZ8H1ELBizf8` — the broken
deployment only; zero errors of any kind in the window since the fix
went live. `POST /api/price` and `POST /api/flag` both re-tested live
post-fix and confirmed fully correct (real 5-tier pricing data;
`{"ok":true}`).

**Known, accepted deviation, same class as prior deploys**: the
corrected redeploy's `api/price.js`/`api/flag.js` were retyped with
some comments condensed during the emergency fix — functionally
verified identical via the live tests above, only comments differ from
the git-committed source. Not worth a dedicated redeploy just to
resync comments; fold into the next real change to those files.

**Lesson, worth carrying forward explicitly**: the synthetic post-deploy
checklist (`GET` sourceHash/diacritic test, `POST {}` 400) that this
project has relied on for over a dozen prior deploys is necessary but
was, this time, **not sufficient** — it can pass cleanly on a deploy
that's missing a real function definition, if that function isn't
exercised by those two specific synthetic paths. The real end-to-end
scan is what caught this, not the checklist — reinforcing that a real
scan of the actual card involved should be treated as a required step
for any deploy that touches `lookupCardPPT`'s call graph, not an
optional nice-to-have on top of the synthetic checks.

Committed and pushed to GitHub (commit `d1c185a`) per explicit
go-ahead.

## Test #97 — Base Set 2 (actually Base Set) Ninetales, Read: High / Match: Low, "two identical print runs" warning: confirmed a genuine Shadowless-vs-non-Shadowless data tie, PLUS one real, narrow, fixable dead-signal gap found along the way (not built) — no code changed (2026-09-27)

Eric flagged a live scan (Ninetales, 12/102) that came back Read: High /
Match: Low with the Shadowless-vs-non-Shadowless ambiguous-tie warning,
and asked — same standard as the Typhlosion case (test #95) — whether
this was really the documented Shadowless data-tie limit or something
else (a parsing gap, a search-query bug like Moo-Moo Milk, a scoring
gap) presenting the same way. Investigated first; nothing built.

**Real logs pulled for "Ninetales" found 4 real scan attempts** in the
same ~20-second window (00:53:05–00:53:26 UTC), all of the same
physical card. All 4 agree cleanly on the core identifying fields:
`cardName: "Ninetales"`, `cardNumber: "12/102"`, `hp: "80"`,
`attackName: "Lure"`, `setName: "Base Set"` (when read) — this is a
clean, consistent, high-quality read, not an OCR-instability case.
`stampType` was the one inconsistent field: 2 of 4 attempts read "1st
Edition", 2 read "none" — and on both "1st Edition" attempts, the
`[legacy-model-shadow-test]` line and the Haiku shadow test both
independently disagreed and read "none" — an uncorroborated split, not
a confident cross-model agreement either way.

**Confirmed the lookup pipeline itself worked correctly — this is NOT a
parsing/search-query bug like Moo-Moo Milk.** A plain `search=Ninetales`
page-1 fetch (30 candidates) and page-2 (40 merged) both came back full
but contained no candidate matching `12/102` — the real Base Set/Base
Set (Shadowless) rows simply weren't ranked into PPT's top 40 results
for the bare species name (the same "common name crowds out the real
card" pattern already documented for Eevee/Tyranitar/Zoroark, not a new
issue). The combined name+number fallback then correctly used
yesterday's zero-padding fix (test #94): `"Ninetales 12/102"` → 0
results, `"Ninetales 012/102"` → exactly 2 results, both correctly
surfaced and scored. This is the fix from test #94 working as intended
on a third real card, not a new gap.

**Directly queried PPT's live API for both surfaced candidates to check
the tie is real, not just trusting the panel's own warning text.** Both
rows share `externalCatalogId: "base1-12"` — literally the same
underlying physical card design — and are identical across every field
PPT provides: name, number, hp, attacks (`Lure`/`Fire Blast`), rarity
(`Holo Rare`), weakness, resistance, retreatCost, artist
(`Ken Sugimori`), pokemonType, energyType, flavorText. The only
differences are catalog/commerce metadata (`id`, `tcgPlayerId`,
`setId`, `setName` — `"Base Set (Shadowless)"` vs plain `"Base Set"`,
image URLs, and `prices`/`printingsAvailable`). Spot-checked a second,
unrelated Base Set card (Charizard 004/102) live and found the exact
same structural split — confirming this is a systematic PPT catalog
modeling choice for Base Set specifically (Shadowless is a real,
distinct WOTC print run only within Base Set's own printing history,
never within Base Set 2/Jungle/Fossil/etc.), not a one-card coincidence.
**Eric's own description named "Base Set 2," but the actual read and
both PPT candidates all say plain "Base Set"** — a minor recall slip,
not a discrepancy worth chasing further.

**One real, fixable gap found along the way, but scoped narrowly — not
proposed as a fix for today's specific result.** `candidateStampType()`
(`api/identify.js`, feeds the existing `stampMatch`/`stampMismatch`
scoring signal) only pattern-matches promo keywords (Pokemon
Center/Staff/Prerelease/Winner/Worlds) against a candidate's
name/setName text — it never checks "1st Edition" against data already
fetched on every candidate (`_rawVariants`, PPT's own `variants`/
`printingsAvailable` field). Confirmed live on both Ninetales and
Charizard: only the `"(Shadowless)"` catalog row ever has a `"1st
Edition Holofoil"` printing available; the plain row never does — so a
confidently-read `stampType: "1st Edition"` could, in principle,
unambiguously resolve this exact tie (1st Edition Base Set cards were
never printed with the drop-shadow border) for zero added latency or
cost, since `stampType` is already read on every scan. This is the same
family of bug as the historical attackName/Trainer-subtype/rarity
dead-signal fixes — a signal already being collected but not reaching
its full scoring potential.

**Deliberately not proposed as today's fix, for two reasons.** (1) It
would need to be scoped narrowly to the Shadowless-tie case
specifically (e.g. inside `isShadowlessVsPlainTie`'s tie-break), not
folded into the general `candidateStampType()`/`stampMatch` scoring
signal used on every card — blindly extending that signal to check
`_rawVariants` for "1st Edition" availability would risk a real
regression: most WOTC-era sets (Jungle, Fossil, Team Rocket, etc.) offer
"1st Edition Holofoil" and "Unlimited Holofoil" as two printings of the
*same single candidate row* (unlike Base Set's Shadowless split into two
separate rows), so treating 1st-Edition-availability as a fixed
per-candidate "stamp" would incorrectly penalize the ordinary, common
case (an Unlimited copy reading `stampType: "none"`) via the existing
`stampMismatch` penalty. (2) Even scoped narrowly, it would not have
changed today's specific result — the screenshot's own "none stamp"
badge, and the fact that neither of this session's two "1st Edition"
reads was corroborated by either shadow model, means this exact live
tie wasn't actually resolvable by a stamp signal today regardless.

**Confirmed the deeper "no stamp legible" ambiguity is a genuine,
already-decided architectural limit, not a bug in disguise — did not
just take the panel's own warning text at face value.** Diffed the full
JSON of both real PPT rows field-by-field: with `stampType` inconclusive
(the common case — most copies are Unlimited, with or without a stamp
read at all), literally nothing else PPT returns differs between the
Shadowless and non-Shadowless rows. The one real physical difference
(absence vs. presence of a drop-shadow on the picture-frame border) is
purely visual and was already identified, considered, and explicitly
declined as a new Gemini-detected signal on 2026-08-28 (see the
`stripShadowlessSuffix`/`isShadowlessSetName` FIX comment in
`api/identify.js`), specifically to avoid the added runtime/latency risk
of a new visual-detection prompt ask — a deliberate prior trade-off,
not an oversight. Same standard as test #95: confirmed via direct
evidence (a full field diff against live data) that no other signal
exists, not inferred from the warning's own claim.

**Conclusion**: the ambiguous-tie warning shown to Eric is accurate and
working as designed for this specific scan (no stamp confidently/
corroborated read). No code changed. One real, narrow, buildable
improvement was found (teach the Shadowless tie-break specifically to
prefer the Shadowless row when `stampType: "1st Edition"` is read) that
could help a *future* scan where the stamp is legibly and consistently
read as "1st Edition" across models — flagging it here, not building it
without explicit go-ahead, since it wouldn't have changed today's result
and needs the narrow scoping described above to avoid a regression on
ordinary 1st-Edition-eligible cards from other sets.

## Feature: Whatnot purchase costs folded into Suggested Bid only (sales tax + a per-card shipping constant) — BUILT, DEPLOYED FROM DISK VIA THE VERCEL CLI, PUSHED, AND LIVE-CONFIRMED (2026-09-30)

**Request**: Suggested Bid was the margin-adjusted break-even and nothing
else, so it silently ignored what Eric pays *on top of* a winning Whatnot
bid. Sales tax is charged on every Whatnot purchase, which means a bid of
$X actually costs $X x 1.06625 — quietly eating part of the intended
margin. Fold Whatnot purchase costs into Suggested Bid only.
`computeBreakEvenMaxBid` explicitly stays as it is: break-even is defined
here as the **eBay-side zero-profit figure**, and the tooltip that shows
it keeps showing the same numbers as before.

### What changed (`api/identify.js`)

Two new constants, next to the existing listing/eBay-fee constants:

- `WHATNOT_PURCHASE_TAX_RATE = 0.06625` — New Jersey's statewide rate.
  Logged in the code comment as an **assumption to check against a real
  receipt**, not a verified figure (see the research section below, which
  found a real reason it may not be exact on every order).
- `WHATNOT_SHIPPING_PER_CARD = 0.00` — deliberately zero. Eric's real
  Whatnot shipping is $0.78/card and caps around $6/order, and because he
  batches, he pays that cap once rather than per card. Starting at zero
  because at realistic batch sizes the per-card share of one ~$6 cap is
  small, and understating a cost can only make the suggested bid more
  conservative, never less. The comment records how to turn it on later
  (roughly $6 / typical cards per order).

`computeSuggestedBid` is now:

```
suggested bid = (BE / (1 + margin) - WHATNOT_SHIPPING_PER_CARD)
                / (1 + WHATNOT_PURCHASE_TAX_RATE)
```

rounded to cents **once, at the end**. The margin-adjusted figure is now
the target for TOTAL money out the door, and the bid is worked backwards
from it, so the required margin applies to what Eric actually pays rather
than to the bid alone. Null/missing handling is unchanged (still `null`
when break-even or the tier is missing).

`computeBreakEvenMaxBid` is untouched — confirmed by the diff, which
contains no changes to that function at all. `extension/content.js` is
untouched too, so the `(Bid: Skip)` rule (`bid <= 0`) and the break-even
tooltip are unchanged. Worth noting the sign can never flip as a result
of this change: a positive figure divided by 1.06625 stays positive, and
shipping is 0.00, so exactly the same rows show "Skip" as before.

### Verification, against the real function (not a reimplementation)

A harness extracts the **real source text** of `computeSuggestedBid`,
`REQUIRED_MARGIN_BY_TIER` and both new constants out of `api/identify.js`
by regex and evaluates it. Both numbers named in the request match
exactly:

| Break-even | Tier | Margin | Expected | Got |
|---|---|---|---|---|
| $79.08 | Fast-flip | 15% | 79.08 / 1.15 / 1.06625 = **$64.49** | **$64.49** |
| $3.81 | Stagnant | 100% | 3.81 / 2 / 1.06625 = **$1.79** | **$1.79** |

Plus: the other two tiers on the same break-even ($79.08 Normal $57.05,
Slow $49.44, both matching a hand calc); all five null/missing cases
still returning `null`; a negative break-even (-$0.62) still flowing
through as a real signed number (-$0.45) rather than being clamped; and
break-even exactly $0 returning $0. Against the old formula the new
number is always lower, never higher, by a consistent ~6.2% (= 1 -
1/1.06625) across every tier tested.

**Temporary `WHATNOT_SHIPPING_PER_CARD = 0.78` check** (harness override
only — the real file was never edited, confirmed by the harness printing
the live extracted value as `0`): every case dropped by exactly $0.73,
matching 0.78 / 1.06625 = $0.7315. $79.08 Fast-flip $64.49 -> $63.76;
$21.19 Slow $13.25 -> $12.52; $3.81 Stagnant $1.79 -> $1.06.

**End-to-end, against real live TCGplayer data**: a second harness drove
the real exported `buildLiveVariantsForCandidate` from BOTH the
pre-change file and the post-change file against the same live data, for
3 real cards (Pikachu XY95 / 114004, Charizard Base Set / 42382, Lotad
Shiny SH4 / 86838) — 15 condition rows total. Every row: raw
`conditions` identical, `conditionsBreakEven` **identical**, and
`conditionsSuggestedBid` exactly the single-rounded new formula.

**One real methodology bug caught in the harness itself, not the code**:
the first e2e run reported 3 "failures" that turned out to be the
harness double-rounding (deriving its expectation from the
already-rounded old bid, `o / 1.06625`, instead of from the unrounded
margin step). Checked directly rather than assumed: on all 3 divergent
rows the function matches the single-round value and the harness matched
the double-round value, confirming the function rounds once at the end as
specified. Harness expectation corrected; all 15 rows then passed.

### Research (no code): Whatnot's current buyer-side fees

Read from Whatnot's own help center in a real browser (their pages return
HTTP 403 to plain fetches, so this is the primary source, not a
third-party fee-calculator blog).

1. **No buyer protection fee and no per-order buyer fee.** Every fee
   Whatnot documents is seller-side: a tiered commission on GMV (rate
   structure changed 2026-09-21, now as low as 3%) plus separate payment
   processing. A help-center search for "buyer fee" returns 246 articles
   and not one buyer-fee article. The buyer pays item price + shipping +
   tax. **Nothing to add to the formula here** — unlike eBay/Mercari/
   Depop, Whatnot has no buyer-side fee to model.
2. **Tax on the item: confirmed.** "Sale price is exclusive of applicable
   U.S. sales and use taxes" — Whatnot charges US buyers sales & use tax
   at checkout and remits it. Their own worked example uses 7%
   ($100 item -> $7.00 tax -> $107 total). So the tax gross-up is
   correct in principle.
3. **The 6.625% NJ figure has a real caveat worth knowing.** Whatnot
   says some states are origin-sourced: "In origin states we're
   responsible for applying the sales and use tax rate determined by the
   **ship-from** address on all taxable sales." So on some purchases the
   rate is the *seller's* rate, not Eric's NJ rate — and Eric buys from
   many sellers in many states, so the effective rate varies per order.
   6.625% is a reasonable single-number stand-in, but it will not be
   exact on every order. Checking two or three real receipts from
   *different* sellers would show the spread, which is more useful than
   checking one.
4. **Tax DOES apply to shipping in New Jersey.** NJ is explicitly on
   Whatnot's list of states that "generally charge sales tax on shipping"
   where the buyer pays shipping. Consequence for the formula: the
   implemented form, `(target - shipping) / (1 + tax)`, treats shipping
   as untaxed. If shipping is taxed, the strictly correct form is
   `target / (1 + tax) - shipping`. **This is a no-op today** — the two
   are identical at `WHATNOT_SHIPPING_PER_CARD = 0.00` — and the
   difference is only shipping x tax/(1+tax), about $0.05 on $0.78. Built
   as specified rather than silently changed; flagged here so it's a
   deliberate decision whenever the shipping constant is turned on.
5. **$0.78 is real, and it's a floor, not a flat rate.** It's Whatnot's
   published First-Class Mail Letter rate for eligible cards, quoted as
   "$0.78-$1.36 depending on weight, plus fees."
6. **The "~$6 cap" is really Smart Bundling(TM), and it works PER SELLER,
   not per order.** Ground Advantage is a flat $7.75 for 1-5 lbs, and
   adding an item to an existing shipment often adds $0 — but "orders can
   only be bundled if they're from the same seller." Since Eric buys
   across many sellers in one night, he pays a separate shipment cost per
   seller. So "$6 / typical cards per order" is the wrong unit: the real
   figure is per-shipment cost / cards bought **from that one seller**.
   That makes effective per-card shipping *higher* than a naive division
   if he takes 1-2 cards from many sellers, and lower if he takes many
   from one. Worth deciding on that basis rather than on an order-level
   average.

### Deploy — first byte-exact hash match in this project's history

Deployed from disk via the Vercel CLI (`npx vercel link` against
`prj_eS2DCNOeX82nyDOA9o5OHVhBwxCA` / team `leasedraftai`, then
`npx vercel deploy`), not the MCP inline-content path.

- Preview: `dpl_HPtVxsfyY3vkm8m4znEwgHaDfYWc` (`READY`). Live
  `sourceHash` = `4ae2cc28e133fbb556b267d72d496b902522f04c` =
  **exactly** `shasum api/identify.js` on disk.
- Production: `dpl_JAsaAKCbUMoJJwArn8sRdSn7ymcL` (`READY`, target
  production, aliased to `whatnot-pokemon-identify.vercel.app`), same
  `sourceHash`.

**This is the first deploy here where the deployed hash matches local
byte-for-byte** — every earlier deploy carried an unresolvable gap from
manual transcription. Preview access needed `npx vercel curl` (Vercel
Authentication returns a 302 to plain curl).

**`vercel promote` will not promote a preview deployment**: it refuses
with "This deployment is not a production deployment and cannot be
directly promoted. A new deployment will be built using your production
environment." Consistent with this project's own env-vars-are-snapshotted
-at-build-time precedent. `npx vercel deploy --prod` from the same
unchanged disk state was used instead; the production `sourceHash`
matches the preview's, so the code is provably identical even though the
deployment ID differs.

### Verified on the preview before promoting

29 real condition rows across 5 real productIds (478136, 497604, 86838,
42382, 114004), each independently recomputed from the documented formula
(a deliberate second implementation, not the real function): **0
break-even mismatches, 0 suggested-bid mismatches.** Coverage included
all four cost bands (<=$10 fixed fee, <$20 shipping, $5.80 shipping, and
2 rows landing in a tier-override band) and three sell-through tiers
(Fast-flip, Normal, Slow). Through that same independent formula the four
reference break-even values are confirmed unchanged: market $5 -> $3.81,
$10 -> $7.93, $30 -> $19.97, $100 -> $79.08.

### Live-confirmed on production

| | Production before | Production after |
|---|---|---|
| `sourceHash` | `42c8abf6...` | `4ae2cc28...` (= local shasum) |
| Break-even NM | $209.75 | $169.79 |
| Suggested Bid NM (Slow) | $139.83 | $106.16 |

(productId 114004, market $207.44 on both calls.) Full after-state:
BE `{NM 169.79, LP 86.84, MP 51.67, HP 46.82, DMG 24.88}`, bid
`{NM 106.16, LP 54.30, MP 32.31, HP 29.27, DMG 15.56}`, `pricingError:
null`.

Real end-to-end scan against production, using a real Pikachu XY95 photo
from TCGplayer's own CDN: `found: true`, `cardName: "Pikachu"`,
`setName: "XY Promos"`, `matchConfidence: "High"`, `visionProvider:
"gemini"`, correct `tcgPlayerId: "114004"`, `timingMs: {gemini 1614,
lookup 366, total 1980}` — inside the 1-3s target. `requestId
689f1d35-dee4-4b66-b4ea-cdc6f83e091e`.

**`get_runtime_errors` (1h): 4 groups, all self-inflicted, zero
organic.** All four trace to exactly two requestIds (`9a7a39a2...`,
`282b3c7a...`), both this session's own malformed verification calls,
which sent `imageBase64` with a `data:image/jpeg;base64,` prefix the API
correctly rejects — it wants RAW base64. This is the same benign pattern
already closed on 2026-09-10 for `requestId=740a66cc`. Noting it plainly
so it isn't re-investigated as a client bug later: a hand-built `curl`
scan test must strip the `data:` prefix.

### Tax rate CONFIRMED against real receipts (2026-09-30, by Eric)

`WHATNOT_PURCHASE_TAX_RATE = 0.06625` is confirmed correct across **48
real orders spanning 7 different sellers**, with **tax applied to item
price plus shipping**. No code change needed.

This settles both open questions from the research section above:

- **Research item 3 (origin sourcing) is answered empirically.** The
  concern was that Whatnot's ship-from-based rates in some states would
  make the effective rate vary per seller. Holding at 6.625% across 7
  sellers is real evidence it does not vary in practice here, so the
  rate is verified rather than a single-number stand-in.
- **Research item 4 (does NJ tax shipping) is confirmed YES — with a
  consequence.** The implemented form, `(target - shipping) / (1 +
  tax)`, treats shipping as untaxed. Since shipping IS taxed, the
  correct form is `target / (1 + tax) - shipping`. **No-op today** (the
  two are identical at `WHATNOT_SHIPPING_PER_CARD = 0.00`, and the gap
  is shipping x tax/(1+tax) ~ $0.05 on $0.78), so production is not
  wrong right now — but **whoever sets that constant to a real value
  must move the shipping term outside the division at the same time**,
  or every suggested bid will run a few cents too generous.

**Known comment drift, deliberately not fixed here**: the code comment
on `WHATNOT_PURCHASE_TAX_RATE` still says "ASSUMPTION, NOT YET
VERIFIED." Left alone on purpose — `api/identify.js` on disk currently
hashes byte-for-byte to the deployed file (`4ae2cc28...`), and a
comment-only edit would break that parity for no functional gain. Fold
it into the next real code change to this file, along with the
shipping-term flip if that lands at the same time.

Committed as `66fb6bf` (code) and `1d320ab` (docs), pushed to GitHub
(`e4ff81c..1d320ab`, `main`).

**Also found while checking production state, and material**: production
is **not** running commit `13cc351` (the "market + $1.00" template and
Eric's real 12.35%-Basic-Store + 2.2%-Promoted fee model). Confirmed two
independent ways, not assumed — (a) a live `POST /api/price` for
productId 114004 (market $207.44) returned `conditionsBreakEven.NM:
209.75`, which reproduces exactly under the OLD 1.2x/13.25% model
(207.44 x 1.2 = 248.93, fee 33.38, shipping 5.80 -> $209.75) and not at
all under the new one (which gives $169.79, exactly what the local code
returns for the same market price); and (b) the live `sourceHash`
(`42c8abf6...`) matches neither git HEAD (`1b660f67...`) nor the working
tree. So whenever this deploys, it will carry **two** changes, and the
numbers move a lot on the same card:

| | Production now | After deploy |
|---|---|---|
| Break-even (NM) | $209.75 | $169.79 |
| Suggested Bid (NM, Slow) | $139.83 | $106.16 |

---

## Feature: the 2026-09-29/30 pricing model — current and authoritative (supersedes the 1.2x / 13.25% entries above)

This is the live description of how list price, break-even and Suggested
Bid are computed. Two changes landed a day apart; both are in production
as `dpl_JAsaAKCbUMoJJwArn8sRdSn7ymcL`.

### Step 1 — list price (what Eric actually lists at on eBay)

```
marked price = market price * LISTING_MARKUP_MULTIPLIER (1.0)
                            + LISTING_ADD_AMOUNT ($1.00)

then LISTING_PRICE_TIERS, in order, first match wins, replacing it outright:
    marked price in [$0.00,  $2.48]  -> list at $2.49
    marked price in [$20.00, $25.58] -> list at $19.99
no tier match -> marked price stands
```

Changed 2026-09-29 from "1.2x market" to "market + $1.00" for all NEW
listings. **This is a test running until roughly mid-October 2026** —
older listings stay on 1.2x so the two can be compared, and this tool
tracks the NEW template because that is what Eric lists cards bought
today at. Reverting is exactly two constants:
`LISTING_MARKUP_MULTIPLIER` back to `1.2`, `LISTING_ADD_AMOUNT` back to
`0`; nothing in `computeBreakEvenMaxBid` needs to change.

The tier bands are unchanged, but the MARKET prices that reach them
moved: the $20-$25.58 band is now hit by market **$19.00-$24.58** (was
roughly $16.67-$21.32 under 1.2x), and the $0-$2.48 band by market
**<= $1.48** (was <= $2.06).

### Step 2 — break-even (the eBay-side zero-profit figure)

The flat 13.25% no-Store fee the older entries describe is gone,
replaced by Eric's real setup:

```
eBay fee rate = (0.1235 + 0.022) * 1.07 = 0.155685    (~15.57%)
    0.1235   Basic eBay Store final value fee, Toys & Hobbies >
             Collectible Card Games (the no-Store rate is 13.25%)
    0.022    Promoted Listings Standard ad rate
    * 1.07   both fees are billed on the TOTAL sale amount, which
             includes sales tax; 7% is the assumed tax rate
fixed fee = $0.30 if list price <= $10, else $0.40
shipping  = $0.955 if list price < $20 (eBay Standard Envelope, all-in)
            else $5.80 (Ground Advantage)

break-even = list price - eBay fee - fixed fee - shipping
```

Verified 2026-09-29 against eBay's own help pages (Store selling fees
id=4122 for the 12.35% Basic Store CCG rate and the "total amount of the
sale" definition; Promoted Listings fees id=5295, which since 2022-06-01
bills the ad rate on an item's total sale amount including price,
shipping, taxes and other applicable fees).

Details that matter and are easy to undo by accident:

- The exact product `0.155685` is used, never a rounded 15.57% —
  rounding the rate first shifts break-even by a cent on larger cards
  (market $100 gives $79.07 at 0.1557 but $79.08 at 0.155685).
- The 2.2% ad rate is applied to **every** sale deliberately, even
  though not every sale closes through a promotion. Per Eric this is
  intentionally conservative: it can only understate his bid room, never
  overstate it.
- The monthly Store subscription is deliberately **not** modeled — a
  fixed monthly cost has no place in a per-card break-even.
- Buyer-paid shipping is $0 (these listings ship free), so shipping
  enters only as a seller cost and never as part of the fee base.
- Computed independently per condition, never once off NM and reused.
- Can legitimately go negative on cheap conditions; returned as a real
  signed number rather than clamped.

Reference values: market **$5 -> $3.81**, **$10 -> $7.93**,
**$30 -> $19.97**, **$100 -> $79.08**.

### Step 3 — Suggested Bid (added 2026-09-30): the only place Whatnot purchase costs appear

```
suggested bid = (break-even / (1 + margin) - WHATNOT_SHIPPING_PER_CARD)
                / (1 + WHATNOT_PURCHASE_TAX_RATE)

margin by liquidity tier: Fast-flip 15%, Normal 30%, Slow 50%, Stagnant 100%
WHATNOT_PURCHASE_TAX_RATE = 0.06625
WHATNOT_SHIPPING_PER_CARD = 0.00
```

Rounded to cents **once, at the end**. The margin-adjusted figure is the
target for TOTAL money out the door and the bid is worked backwards from
it, so the required margin applies to what Eric actually pays rather
than to the bid alone. Returns `null` when break-even or the tier is
missing, which the frontend renders as `(Bid: —)`.

**The 6.625% rate is CONFIRMED, not assumed**: Eric verified it against
~48 real orders across 7 different sellers, with **tax applied to item
price plus shipping**. That also answers the origin-sourcing concern
raised during research — Whatnot does apply ship-from rates in some
states, but holding at one rate across 7 sellers is real evidence it
does not vary in practice here.

`WHATNOT_SHIPPING_PER_CARD` is `0.00` because Eric's real Whatnot
shipping is $0.78/card capping around $6/order and he batches, so he
pays that cap once. Set it later to roughly $6 / typical cards per
order — but note Whatnot's Smart Bundling bundles **per seller**, not
per order, so the honest unit is per-shipment cost / cards bought from
that one seller.

### Shipping-term ordering — the one trap

The formula computes `(target - shipping) / (1 + tax)`, which treats
Whatnot shipping as UNTAXED. Eric's receipts confirm shipping IS taxed,
so the strictly correct form is `target / (1 + tax) - shipping`.

**No-op today**: the two are identical while
`WHATNOT_SHIPPING_PER_CARD` is `0.00`, and the gap is only
shipping x tax/(1+tax) — about $0.05 on $0.78. Production is not wrong.
But **whoever sets that constant to a real value must move the shipping
term outside the division at the same time**, or every suggested bid
runs a few cents too generous per card.

Related known drift: the code comment on `WHATNOT_PURCHASE_TAX_RATE`
still reads "ASSUMPTION, NOT YET VERIFIED", which the receipts have
disproved. Both corrections should fold into the next real code change
to `api/identify.js` — deliberately not done as a comment-only edit, to
preserve the byte-exact deploy hash parity described below.

### Keep the break-even / Suggested Bid split straight

Break-even is the **eBay-side zero-profit figure** and knows nothing
about Whatnot. Whatnot purchase costs live **only** in Suggested Bid.
`computeBreakEvenMaxBid` was deliberately untouched by the 2026-09-30
change, and the break-even tooltip shows the same numbers as before.
Displayed Market Price and per-condition prices are raw market
throughout — no markup, tier or fee math touches them. The
`(Bid: Skip)` rule (shown whenever suggested bid is `<= $0`) is
unchanged; the sign cannot flip from the tax division, so exactly the
same rows show "Skip".

### Deploy — and the permanent process change

Built from disk via the Vercel CLI (`npx vercel link` against
`prj_eS2DCNOeX82nyDOA9o5OHVhBwxCA` / team `leasedraftai`, then
`npx vercel deploy --prod`), not the old MCP inline-content path.

- Production: **`dpl_JAsaAKCbUMoJJwArn8sRdSn7ymcL`** (`READY`, aliased to
  `whatnot-pokemon-identify.vercel.app`)
- Preview: `dpl_HPtVxsfyY3vkm8m4znEwgHaDfYWc` (`READY`), same
  `sourceHash`

The live `GET /api/identify` `sourceHash`
(`4ae2cc28e133fbb556b267d72d496b902522f04c`) **exactly equals
`shasum api/identify.js` on disk — the first byte-exact deploy match in
this project's history.** Every earlier deploy went through manual
transcription and left an unresolvable hash gap. **That whole risk class
is retired as long as deploys go through the CLI from disk; do not go
back to inline-content deploys.**

Two process facts worth keeping: `vercel promote` will **not** promote a
preview deployment (it refuses with "A new deployment will be built
using your production environment", consistent with this project's own
env-vars-snapshotted-at-build-time precedent), so expect a separate
preview ID and production ID per change rather than one promoted
artifact; and a preview URL needs `npx vercel curl`, because Vercel
Authentication 302s a plain curl.

### Live-confirmed on production

| (productId 114004, market $207.44) | Before | After |
|---|---|---|
| `sourceHash` | `42c8abf6...` | `4ae2cc28...` (= local shasum) |
| Break-even NM | $209.75 | **$169.79** |
| Suggested Bid NM (Slow) | $139.83 | **$106.16** |

Real end-to-end scan of a real Pikachu XY95 photo: `found: true`,
`cardName: "Pikachu"`, `setName: "XY Promos"`, `matchConfidence: "High"`,
`visionProvider: "gemini"`, correct `tcgPlayerId: "114004"`,
`timingMs.total: 1980`ms — inside the 1-3s target. Before promoting, 29
real condition rows across 5 productIds (478136, 497604, 86838, 42382,
114004) were independently recomputed from the formula above: **0
break-even mismatches, 0 suggested-bid mismatches**, covering all four
cost bands and 2 tier-override rows.

### Commits

`13cc351` (steps 1-2, the 2026-09-29 listing-template and fee-model
change) plus comment-only `0a975a8`; `66fb6bf` (step 3, the Suggested
Bid tax change); `1d320ab` and `16d9a45` (docs and deploy trace).

**One process lesson**: `13cc351` sat **committed but undeployed for a
day**, which is why the production numbers above moved twice at once
rather than once. A quick live `sourceHash` vs. local `shasum` check
after any session that commits without deploying would have caught it
immediately.

---

## Research: pricing set-stamped cards (EX Crystal Guardians Treecko 67/100) — the premise was wrong, and the real bug is a 24x wrong default printing (2026-09-30)

**Research only, READ-ONLY, no code changed in this pass.** Eric asked
what it would take to price set-stamped cards (the "Crystal Guardians"
logo stamped into the artwork of EX Crystal Guardians Treecko 67/100),
believing TCGplayer/PPT have no separate price for them and PriceCharting
does. Both halves of that premise turned out to be wrong, and the
investigation surfaced a materially worse, already-live bug instead.

### Headline

**TCGplayer and PPT DO price the stamped printing separately, we already
fetch it, and we show the wrong one by default.** Three real end-to-end
scans of the actual card photo against live production returned:

| | Shown today | Correct |
|---|---|---|
| Printing | Normal | Reverse Holofoil |
| Market (NM) | **$1.18** | **$34.27** |
| Suggested Bid (NM) | **$0.61** | **$14.74** |
| Warning shown | *none* | — |

Both printings come back in the same `/api/price` response with
conditions, break-even and suggested bid already computed. The correct
answer is one dropdown click away and nothing tells Eric to click it. He
would be told to bid **$0.61 on a ~$34 card, at High/High confidence with
no warning at all** — the exact confidently-wrong failure mode this
project's design principle exists to prevent.

### The stamp IS the Reverse Holofoil printing

Verified rather than assumed. PPT has exactly one record for Treecko
67/100 (`tcgPlayerId: 90038`) carrying
`printingsAvailable: ["Normal", "Reverse Holofoil"]`; TCGplayer's own
`infinite-api` price-history endpoint returns 10 SKUs across those two
printings, with real sales on both (Normal 79 NM sold/3mo; Reverse
Holofoil 3 NM sold/3mo). TCGplayer's own product image for 90038 is the
same Treecko artwork with **no stamp** — and since there are only two
printings, the stamped one must be the other. Two independent secondary
sources confirm EX-era reverse holos carry the set logo inside the art
box (elitefourum.com/t/ex-sets-reverse-holos/16005, and
jabgames13.com/collections/ex-series-reverse-holo-stamped-cards).

Seven EX-era sets print the set logo in the reverse-holo artwork: EX Team
Rocket Returns, EX Deoxys, EX Emerald, EX Unseen Forces, EX Delta
Species, EX Crystal Guardians, EX Dragon Frontiers (~40-50 reverse-holo
cards each in PPT samples, roughly 300 cards sampled). **That list comes
from a user-generated forum post, not an official source** — treat it as
indicative, not authoritative.

The other two stamp classes checked are already separate PPT records and
need nothing: prerelease (`Raichu - 27/99 (Prerelease)`) and staff
(`Raichu - 27/99 (Prerelease) [Staff]`, `Charizard - SM158 [Staff]`).

### Scope: this is a vintage reverse-holo problem, not a stamp problem

Median Reverse Holofoil / Normal NM market multiple, from live PPT set
pulls (`setName=` queries, 50-100 cards each):

| Set | Set-logo stamped? | Median multiple | Max |
|---|---|---|---|
| Legendary Collection | no | **104.2x** | — |
| EX Deoxys | yes | 19.7x | — |
| EX Dragon Frontiers | yes | 15.3x | 66.7x |
| EX Crystal Guardians | yes | 14.4x | 57.5x |
| **EX Power Keepers** | **no** | **14.2x** | 86.3x |
| EX Ruby and Sapphire | no | 9.3x | 48.9x |
| SM Base Set | n/a (modern) | 2.3x | — |
| XY Base Set | n/a (modern) | 2.7x | — |

The unstamped sets show the same premium, so **the stamp is only a
convenient visual cue in 7 sets, not the cause**. Any fix scoped
narrowly to stamped sets would miss Legendary Collection's 104x.

### Frequency on Whatnot

From the last hour of Eric's real production scanning, 77 scans that
produced a matched candidate set name (this session's own 3 test scans
removed): **17% vintage reverse-holo era** (e-Card / Legendary
Collection / EX), 6% DP/Platinum era, **60% WotC era** (Base/Jungle/
Fossil/Gym/Team Rocket — reverse holos do not exist in those sets, so
they are structurally unaffected), 17% modern/other. Roughly 1 scan in 6
sits in the high-premium band.

**Sample-size caveat, stated plainly: n=77 scans from a single ~1-hour
window.** That is one session's card mix, not a durable rate — Eric's set
mix varies a lot by stream. Treat 17% as "recurring and material," not as
a measured long-run frequency.

### Gemini's stamp read — a schema gap, not a vision limit

`stampType` came back **`"none"` on 3/3 live scans** of a card with an
unmistakable CRYSTAL GUARDIANS stamp. That is not a vision failure: the
`stampType` enum has no value for a set logo stamp, and `GEMINI_PROMPT`
explicitly instructs the model to default to `"none"` for anything not in
the listed enum.

Asked directly, the Haiku model already in this stack reads it correctly:

- the stamped card photo -> `{"setLogoStampInArt": true, "stampText": "CRYSTAL GUARDIANS", "confidence": "High"}`
- TCGplayer's unstamped product image (negative control) -> `{"setLogoStampInArt": false, "stampText": null, "confidence": "High"}`

**Caveat, stated plainly: that is 2 images, one each, both flat,
well-lit, catalog-quality scans.** A live Whatnot frame is angled, moving
and glare-prone, and a foil stamp sits exactly where holo glare lands.
This says the signal is *readable in principle*, not that it is reliable
on stream.

### Why auto-flipping the default printing on a vision read is REJECTED

The current failure direction is **underbidding** — Eric loses an
auction and loses no money. Auto-switching the default printing on a
positive stamp read inverts that: a single false positive tells him to
bid **$14.74 on a $1.18 card**, which costs real money on a card that
cannot be resold for it.

This project has already run this exact experiment. A 2026-08-26 change
to `pickDefaultVariantKey` overrode PPT's `primaryPrinting` based on
Gemini's `stampType` read, and was reverted the very next day when a
physically-confirmed 1st Edition card was read as `"none"` — a stamp
false-negative, not a code error (see the REVERTED comment block in
`pickDefaultVariantKey`, `api/identify.js`). The same trap applies here
with the signs flipped.

**Decision: the default printing stays driven by PPT's `primaryPrinting`.
A vision signal may inform a warning, never the default.** The dropdown
plus an explicit advisory remain the safety net.

### Data-source decisions

**PriceCharting — NO.** It does list the printings separately
(`/game/pokemon-crystal-guardians/treecko-reverse-holo-67` vs
`/treecko-67`), at $20.16 "ungraded" — which is *worse* for our purpose
than TCGplayer's $34.27 NM, since their ungraded figure blends conditions
and ours is per-condition. Access is API-only on the **Legendary tier at
$49/mo** (the $6 Collector tier has no API), token auth, hard-capped at
**1 request/second**. Their terms of service state Price Data "cannot be
used in any software, application, or system that is accessible to third
parties...without express written permission," and license API/CSV data
for **internal business purposes only**. A private, undistributed
personal extension is arguably internal use, but it is a genuine gray
area — and moot, because we would be paying $49/mo (5x the entire current
PPT bill) for a worse version of data we already fetch for free.

**eBay sold data — NO.** The official Marketplace Insights API (sold
data) is a Limited Release product requiring eBay business approval and
is routinely declined for small projects; eBay additionally put sold/
completed listings behind a sign-in wall in July 2026, breaking
unauthenticated access. Third-party sold-listing APIs are paid and/or
operate against eBay's terms. Not pursued, and no scraping or block
workaround was attempted at any point in this research.

**PPT's own `includeEbay` — not useful here, but a useful corroboration.**
It costs 2x credits and is graded-focused (`salesByGrade`: psa9/psa10/
cgc9/cgc10/psa8/ungraded), and it cannot distinguish Normal from Reverse
Holofoil. But its **ungraded** bucket for Treecko 67/100 reads median
**$34.25** (min $23.50, max $45) — matching the Reverse Holofoil price,
not the $1.18 Normal, and independently confirming $1.18 is simply the
wrong number for a stamped copy. **Caveat: n=2 sales.** Combined with
TCGplayer's own 3 NM reverse-holo sales in 3 months, every direct
measurement of this specific card's real-world value rests on a very thin
sample — the *direction* is well-supported, the exact figure is not.

### Secondary finding: `stampNote`'s wording is factually wrong for these cards

`api/identify.js` builds `stampNote` as `...our data source doesn't track
pricing for stamped promos separately from the standard printing, so the
price shown likely understates its real value.` For set-stamped EX cards
that claim is false — the data source *does* track it separately, as the
Reverse Holofoil printing. The note also never fires on these cards
today anyway, because the read is `"none"`. Logged as an open item;
**not** fixable frontend-only, since the string is produced server-side
and `extension/content.js` only renders it verbatim.

### Options considered

| Option | Effort | Cost/scan | Risk | Verdict |
|---|---|---|---|---|
| A. Keep current warning | 0 | 0 | — | No — it never fires here, and its text is wrong when it does |
| **B. Flag the high-premium alternate printing (frontend only)** | small | **0** | **none** | **Recommended, BUILT (see the entry below)** |
| C. Add a `setLogoStamp` vision field | medium | ~0 | false positives on glare | Defer — only if B proves insufficient |
| D. PriceCharting | medium | $49/mo | ToS gray area | No |
| E. eBay sold data | large | varies | not permitted / no access | No |

Option B needs no new data source, no backend change, no extra API call
and no added latency: `renderPriceSection` already holds every variant's
full `conditions` / `conditionsSuggestedBid` / `sellThrough`. It simply
stops hiding a number already computed, and it covers Legendary
Collection and every other era, not just the 7 stamped sets.

### PPT credits used by this research

Roughly **1,500 credits** across ~23 calls (PPT bills 1 credit per card
returned: six 100-card `setName=` set pulls, seven 50-card pulls counting
the stamped sets, several 30-60 card searches, and one 10-card
`includeEbay=true` call at 2x). That is **~7.5% of the 20,000 daily
budget**. Cross-checked rather than just tallied: the account showed
14,028 of 20,000 remaining at the end of this session, i.e. 5,972
consumed for the day — consistent with ~1,500 from this research plus
~4,700 from Eric's own ~77 live scans in the same window (~61 credits
each). One deliberate per-minute rate-limit (429) was hit and waited out
— expected, not an incident. An earlier draft of this entry estimated
1,100-1,200; that undercounted the per-set pulls and is corrected here.

---

## Bug: Burger King Promos Chimchar 76/130 priced as the base Diamond & Pearl card — a same-number tie across four DIFFERENT PRODUCTS, and a correction to yesterday's "stamped = Reverse Holofoil" finding (2026-10-01)

**Research only, READ-ONLY on `api/*`.** Eric scanned a Burger King
Promos Chimchar 76/130 (a reverse-holo reprint of the Diamond & Pearl
card with the "DIAMOND & PEARL" logo stamped into the artwork;
TCGplayer product 155602; PriceCharting calls it "Chimchar [Stamped]
#76"). The extension matched it to the regular Diamond & Pearl Chimchar
76/130 and priced it at **$0.61**, then the new alternate-printing
banner offered that base card's Reverse Holofoil at **$6.22** — a
different product again. The real card is **$26.45**.

### CORRECTION to the 2026-09-30 entry: "stamped = Reverse Holofoil printing" is SET-SPECIFIC, not general

Yesterday's research concluded the set-logo stamp *is* the Reverse
Holofoil printing of the same TCGplayer product. **That is true for EX
Crystal Guardians Treecko 67/100 and false here.** Burger King Promos
is a **separate TCGplayer product** (155602) with its own record, its
own price, and `printingsAvailable: ["Reverse Holofoil"]` only — not a
printing of the base card (84282). Both patterns exist and they need
different handling:

- **Same product, two printings** (EX Crystal Guardians) — the right
  answer is already in `priceVariants`; the dropdown reaches it. This
  is what the alternate-printing banner was built for and it works.
- **Different products sharing name+number** (Burger King, Countdown
  Calendar, Cosmos Holo, First Partner Pack) — the right answer is a
  DIFFERENT `tcgPlayerId` that never reaches the panel at all. The
  banner cannot help here, and actively hurts (see below).

### 1. PPT does have the record — it was never a catalog gap

```
155602 | Burger King Promos | 076/130 | "Chimchar - 76/130 [Diamond & Pearl]"
        rarity: Promo | printingsAvailable: ["Reverse Holofoil"] | externalCatalogId: null
        PPT cached NM RH $25.95   (live TCGplayer at time of writing: $26.45)
```
PPT's cached $25.95 matches Eric's TCGplayer ground truth exactly.

**Suggested Bid correction, worth recording.** Eric predicted ~$7.76 at
the Stagnant tier, from the product page's "5 sold" 3-month snapshot
(NM only). The tool's real answer is **$10.62 at the Slow tier**,
because `buildLivePriceVariantsFromTCGPlayer` sums `totalQuantitySold`
across all five condition tiers (the 2026-09-20 undercounting fix) —
**49 sold/3mo = 16.3/mo**, which is Slow (5-49/mo), not Stagnant
(<5/mo). Confirmed live via `POST /api/price` for 155602:
`sellThrough: {monthlyPace: 16.33, tier: "Slow", totalSold: 49}`.
Eric's reasoning was right for an NM-only figure; the discrepancy is
entirely the all-conditions sum, not a bug.

### 2. The Burger King record WAS in the pool — it lost a 4-way coin flip

The original scan's log had already rolled past Vercel's 1-hour Hobby
retention (see "Known gotchas") and there was no live traffic to sample,
so this was reproduced mechanically against the **real, unmodified**
scoring code: a copy of `api/identify.js` verified byte-identical for
all 3512 lines with a single `module.exports.__probe = {...}` line
appended, exposing `pickBestCandidate`/`scoreCandidate`/`normalizePptCard`.

Against the production-equivalent pool (`search=Chimchar&limit=30`, 23
raw candidates): **155602 was present at index 10**, survived the name
filter (`normalizeNameForMatch("Chimchar - 76/130 [Diamond & Pearl]")`
contains `"chimchar"`), and matched the number **exactly**
(`076/130` -> `76/130`; `normalizeNumber` strips leading zeros). It was
never missing and was never excluded.

**Four distinct products tie at exactly 30 points:**

| Score | tcgPlayerId | Set | bestDetail | NM |
|---|---|---|---|---|
| 30 | 84282 | Diamond and Pearl | number+hp+attackName | $0.61 / RH $6.22 |
| 30 | **155602** | **Burger King Promos** | number+hp+attackName | **$26.45** |
| 30 | 153231 | Misc Cards & Products (Cosmos Holo) | number+hp+attackName | $22.24 |
| 30 | 231454 | First Partner Pack | number+hp+attackName | $1.49 |

`bestScore=30, tieCount=4`. 30 = number(20) + hp(6) + attackName(4).
The two records are identical on hp ("50"), attacks ("[0] Scratch (10)",
"[1R] Ember (30)..."), stage, pokemonType, weakness and retreatCost —
there is genuinely nothing in PPT's data separating them. **The base
card won by pool order, not by scoring.**

Why every remaining signal contributed zero:
- **`set` (+3) scored 0 for ALL FOUR**, including the base card — Gemini
  read `setName: "Diamond and Pearl"` and the base card's set is
  literally "Diamond and Pearl", but the comparison fails on `"&"` vs
  `"and"`. (See the trap in the design note below before "fixing" this.)
- **`rarity` (+2) scored 0** — `NOTABLE_RARITY_PATTERN` has no `promo`
  entry, so "Promo" is worth nothing.
- **`stampMatch`/`stampMismatch` never fired** — `candidateStampType()`
  has no keyword for a set-logo stamp.

Counterfactual, run against the real function: feeding
`setName: "Burger King Promos"` gives 155602 **33 pts, tieCount=1** —
the correct winner. That read will never happen; the card says
"DIAMOND & PEARL", not "Burger King".

### 3. Scope: real, and the spreads are large

Chimchar **alone** has four separate same-number collision groups:

| Number | Tied products | Spread |
|---|---|---|
| 76/130 | $0.61 base / **$26.45 BK** / **$22.24 Cosmos Holo** / $1.49 First Partner | 43x |
| 57/100 | $1.09 Majestic Dawn / **$48.68 Countdown Calendar** | 45x |
| 56/100 | $0.50 base / $19.51 base-RH / $8.94 BK | 39x |
| 012/017 | $2.95 POP 8 / $32.58 POP 8 RH / $39.99 Cracked Ice Holo | 14x |

Set shape, pulled live:
- **Burger King Promos: 24 cards, 23 with a `[Set]` bracket suffix in
  PPT's `name`, 23 Reverse-Holofoil-only.** Highly regular.
- **Countdown Calendar Promos: 24 cards, base-set numbers
  (e.g. "Stunky - 102/130", "Snover - 101/123"), and ZERO bracket
  suffixes.** Same collision class, no naming signal — so any fix keyed
  on the bracket covers BK and misses this set.

**Frequency.** Counting *matched* promo set names undercounts by
construction (a promo that loses the tie is logged under the BASE set —
only 1 of 77 scans showed a promo set). The honest measure is tie rate,
from the same real 77-scan sample:

```
tieCount=1: 37   tieCount=2: 6   tieCount=3: 2
tieCount=4: 3    tieCount=5: 1   tieCount=6: 1   tieCount=8: 1
-> 14 of 51 scans (27%) landed in a genuine multi-candidate tie
```
Three scans hit `tieCount=4`, the exact Chimchar shape. This matches the
~27-35% tie rate already documented for the cardNumber investigation.
**Caveat: not all ties are promo collisions** (Shadowless pairs and
holo-pattern variants are in there too), so 27% is the exposure
**ceiling**, not the promo-collision rate.

### 4. Gemini sees the stamp and files it into the wrong field

Real production scans of both TCGplayer product images:

| | BK promo (155602) | Base card (84282) |
|---|---|---|
| `setName` read | **"Diamond and Pearl"** <- the stamp text | "Diamond and Pearl" |
| `stampType` | **"none"** | "none" |
| Matched to | **84282 (wrong product)** | 84282 (correct) |
| matchConfidence | Low, 4-way ambiguousNote fired | Medium |

The stamp is large, high-contrast **text** in the lower artwork — far
more legible than the EX Crystal Guardians logo — and the model reads it
fine. But `stampType`'s enum has no value for a set-logo stamp, so the
text lands in `setName`, where it is **evidence for the wrong product**.
`stampType` is `"none"` on both the stamped and unstamped card, carrying
zero discriminating information today.

The honest-disclosure safety net DID work: Low confidence plus an
accurate "Multiple different printings of this card share an identical
card number, HP, attack, and type" note. What failed is printing a
specific, confident, wrong number next to it.

### 5. The alternate-printing banner made this case worse

With the base card matched and its `primaryPrinting: "Normal"` selected
($0.61), the banner's thresholds (another printing >= 3x AND >= $5) are
satisfied by that same base card's Reverse Holofoil ($6.22), so it
fired:

> "Another printing of this card is worth much more — Reverse Holofoil:
> NM $6.22 (Bid: $3.03) - 27 sold/3mo"

That is a precise, authoritative-looking number bolted on top of an
already-flagged uncertain match, and it is still **4x below** the real
$26.45. The banner's own trigger logic remains correct for the
vintage-reverse-holo case it was built for — this is a **scoping**
problem, not a reason to revert it. Containment shipped same day (see
the matching entry below / CLAUDE.md).

---

## Design proposal (NOT BUILT): surface tied candidate PRODUCTS as "Possible matches" (2026-10-01)

Written per explicit instruction as a proposal only — no code written for
this, nothing deployed. Follows the Burger King Chimchar entry above.

### (a) Measure first — and the honest answer is the measurement is NOT available yet

The question asked was: of the 14 multi-candidate ties in the 77-scan
sample, how many have a >=3x NM spread between tied candidates with >=$5
on the high side? **That cannot be answered from the data we have, and
the attempt to answer it failed for a real, specific reason worth
recording rather than papering over.**

All 14 ties were recovered from the log dump (3-way Kabuto 51/108, 5-way
Venomoth 49/112, 8-way Raichu RC9/RC32, 6-way Feraligatr 112/128, etc.).
But **`pickBestCandidate` logs only `best` + `tieCount`, never the
identities of the tied candidates**, so the tied set has to be
reconstructed by re-querying PPT — and that does not reproduce the
original pool. Concrete proof: re-running `search=Alakazam&limit=30`
today returns 30 rows that **do not include Base Set Alakazam 1/102 at
all**, even though that is exactly what the original scan matched. A
30-row slice of a large species catalog is not stable, and the original
scans may additionally have gone through page-2 or combined-search
fallbacks. Reconstruction produced a same-number group of 0 or 1 for
**all 14** ties — i.e. 0 reconstructable, not 0 qualifying. **Do not
read "0" as a measurement.**

**What would actually answer it**: one line in `pickBestCandidate`,
which already holds `tiedCandidates` in memory — log their
`tcgPlayerId`s alongside the existing `tieCount`. Then a single real
scanning session yields the true scan-weighted number. That is a
backend change needing a deploy, so it is proposed, not done.

**Substitute measure, clearly labelled**: a **catalog-level** (not
scan-weighted) measurement across 8 real species pools / 198 real PPT
records — Kabuto, Skarmory, Raichu, Venomoth, Nidoqueen, Alakazam,
Feraligatr, Chimchar:

```
same-number groups with >=2 priced candidates : 25
of those, >=3x NM spread AND >=$5 high side   : 16   (64%)
```

Worked examples (all real, all live):

| Card | Spread | Tied products |
|---|---|---|
| Alakazam 059/195 | **60.6x** | SWSH12 $1.88 vs Prize Pack Series **$113.94** |
| Chimchar 57/100 | 44.7x | Majestic Dawn $1.09 vs Countdown Calendar **$48.68** |
| Chimchar 76/130 | 42.5x | Diamond and Pearl $0.61 vs Burger King **$25.95** |
| Alakazam 082/167 | 18.8x | SV06 $0.28 vs Blister Exclusives $5.26 |
| Feraligatr 4/115 | 5.2x | Deck Exclusives $22.70 vs EX Unseen Forces **$118.92** |

**This says: when a same-number collision exists, ~2 times in 3 the
spread is material.** It does NOT say what fraction of Eric's real ties
are number-shaped collisions — that is the gap the logging line closes.

**Second finding from the same data, larger than the original framing**:
the collision class is **not** mainly promo reprints. Qualifying groups
came from Deck Exclusives, Blister Exclusives, Prize Pack Series Cards,
World Championship Decks, Jumbo Cards, Battle Academy, WoTC Promo — plus
**duplicate rows inside one set** (two SM Promos Raichu SM72 at $47.94
and $144.99; two ME Mega Evolution Promo Alakazam 009 at $7.20 and
$72.26; two POP Series 8 Chimchar at $2.95 and $39.99). Any design
scoped to "promo reprints" would miss most of it.

### (b) Proposed response shape and UI

`/api/identify` gains one additive field, emitted only when
`tieCount >= 2`:

```jsonc
"tiedAlternatives": [          // the non-best tied candidates, cap 3
  { "tcgPlayerId": "155602",
    "name": "Chimchar - 76/130 [Diamond & Pearl]",
    "setName": "Burger King Promos",
    "cardNumber": "076/130",
    "primaryPrinting": "Reverse Holofoil" }
]
```
Every field is already in hand — **zero extra PPT calls**.

`/api/price` accepts `tiedAlternatives`, prices them with the same
`buildLiveVariantsForCandidate` already used for the main product, and
returns NM price, Suggested Bid and sold count per alternative. It
surfaces them **only** when at least one clears the same bar the banner
uses (>=3x the selected product's NM **and** >=$5), so a tie between
four cheap printings stays quiet.

UI — a compact block at the TOP of the panel, above Market Price:

```
POSSIBLE MATCHES — same card number, we can't tell these apart
  Diamond and Pearl        $0.61   (Bid $0.61)   156 sold/3mo   ← showing
  Burger King Promos      $26.45   (Bid $10.62)   49 sold/3mo
  Misc Cards & Products   $19.94   (Bid $7.72)    12 sold/3mo
```

**The default selection does not change and nothing auto-switches** —
same decision as the never-auto-flip rule recorded on 2026-09-30, and
for the same reason: a false positive here costs real money, a false
negative costs a lost auction. Making the rows clickable (switch the
panel to that product's pricing) is a reasonable phase 2 but is
deliberately NOT part of phase 1.

### (c) Where it lives, cost, latency, risk

| | |
|---|---|
| `api/identify.js` | `lookupCardPPT` already receives `tiedCandidates` from `pickBestCandidate` (it is used today only by `isShadowlessVsPlainTie` and the null-number narrowing). Map the non-best ones into `tiedAlternatives` on the response. Purely additive. |
| `api/price.js` | Accept the array, fan out `buildLiveVariantsForCandidate` over it with `Promise.all`, apply the >=3x/>=$5 gate, return a parallel array. |
| `extension/content.js` | Render the block in `renderPriceSection`; re-evaluate on dropdown change like the other price elements. |
| **PPT credits** | **zero extra** — the alternatives come from the search response already paid for. |
| **TCGplayer calls** | +1 per alternative, capped at 3, fired in parallel. Unauthenticated and free. |
| **Latency** | Only on `/api/price`, never on `/api/identify` (decoupled since 2026-09-10, so the card ID still lands inside the 1-3s target). The 2026-09-16 measurement found parallel TCGplayer fetches add **~103-107ms regardless of count**; `/api/price` currently runs ~435-850ms. Expect ~+100-150ms. |
| **Risk to existing scoring** | **None by construction** — `pickBestCandidate`, `scoreCandidate`, `best` and the default printing are all untouched. Real risks are UI clutter in a 260px panel and the added `/api/price` latency. |

### (d) TRAP: do NOT "fix" the `"&"` vs `"and"` set-name comparison on its own

Tempting, because the `set` signal scored 0 for all four Chimchar
candidates purely because the read said `"Diamond & Pearl"` and the
candidate says `"Diamond and Pearl"`. **Fixing that normalization alone
makes the wrong answer strictly more confident.**

The base card genuinely *is* in the Diamond & Pearl set, so it would
gain +3 -> 33 points while the Burger King promo stays at 30. Result:
`tieCount` collapses from 4 to 1, the base card wins outright, **the
ambiguousNote stops firing**, `matchConfidence` rises to High — and the
alternate-printing banner (now gated on High, see the entry above)
**un-suppresses itself**. A 4-way honest disclosure becomes a confident
wrong answer with a misleading banner attached. Strictly worse than
today.

If that normalization is ever fixed, it **must** land together with
matching the read `setName` against the candidate's bracket tag
(`"[Diamond & Pearl]"` inside PPT's `name`), so the promo scores the set
point too and the tie is preserved. **And even that is not general**:
Countdown Calendar Promos carries base-set numbers with **no bracket tag
at all**, so the bracket rule covers Burger King and misses Countdown
Calendar. Treat `"&"`/`"and"` as blocked until the tie-surfacing above
exists to catch what it would otherwise bury.

### (e) Test plan

Required cases:
1. **Chimchar 76/130**, real Burger King promo image — must emit
   `tiedAlternatives` containing 155602 at ~$26.45 / Bid ~$10.62 / Slow;
   default stays 84282 at $0.61; alternate-printing banner stays
   suppressed (match is Low).
2. **Chimchar 57/100** — the **no-bracket** Countdown Calendar case
   ($1.09 vs $48.68); confirms the design does not secretly depend on
   the `[Set]` bracket.
3. **Treecko 90038** — High confidence, no tie: **no** Possible-matches
   block, and the alternate-printing banner still fires (guards against
   the two features interfering).
4. **No-tie controls that must be byte-identical to today**: Pikachu
   XY95 (114004) and Alolan Diglett 126958 — no new field, no new
   latency beyond the parallel fetch.
5. **Shadowless regression**: Clefairy 107001 / Chansey 106998 already
   have dedicated sibling handling — confirm the new block does not
   double-surface the same pair.
6. **Latency**: measure real `/api/price` round-trips before/after on a
   3-alternative card; `/api/identify` must be unchanged and inside the
   1-3s target.

Verification standard, per this project's own rules: local mocked-fetch
tests against the **real** (not reimplemented) `handler()`, then a
**real end-to-end production scan** of the actual Burger King Chimchar
photo, and finally — because `extension/content.js` changes — a
`chrome://extensions` reload plus a live rescan before this counts as
confirmed. A clean deploy is not a confirmed fix.

---

## Test: Meditite 56/100, EX Crystal Guardians — FIRST live confirmation of the alternate-printing banner firing in the real panel (2026-10-02)

**Research/docs only — no code changed.** Eric scanned a Meditite he
reported as having the Crystal Guardians logo stamped in the art (seller
`masterballcollect`, listing Near Mint; the stamp itself could not be
independently confirmed from the screenshot — see the tally caveat
below). This is the **first time the
alternate-printing banner has been observed firing in the real extension
panel on a live stream**, closing the "harness-verified, not observed
live" gap carried since the banner shipped (`ebbf02f`, 2026-09-30).

**It fired on a High-confidence match**, so it is also the first live
exercise of the gate's allow path (`cce7892`, later widened by
`d9dc4af`).

### The scan — real log, `requestId=824592ad-ea72-403c-80b6-28216076add7`, 01:41:56 UTC

| field | Gemini (primary) | legacy shadow (`gemini-3.6-flash`) | Haiku shadow |
|---|---|---|---|
| `cardName` | Meditite | Meditite | **"Gengar"** |
| `attackName` | Kick | Kick | **"Pain Dealer"** |
| `cardNumber` | **null** | **null** | null |
| `setName` | null | null | null |
| `hp` | 50 | 50 | null |
| `stampType` | **"none"** | **"none"** | **"none"** |
| `confidence` | Medium | Medium | Medium |
| `reason` | "cardNumber area is too blurry and small to read" | "card held too far from camera" | "glare obscuring bottom edge..." |

Matched correctly anyway: `best = Meditite 56/100, EX Crystal Guardians`,
`bestScore = 10`, `tieCount = 1` -> **Match: High**. Note *how* it got
there: `cardNumber` was null, so the 20-point number signal never fired
and the score is exactly `hp (6) + attackName (4) = 10` — landing
**precisely on `HIGH_THRESHOLD`**. Correct result, but on thin evidence,
and it cleared the null-cardNumber weak-signal floor only because hp and
attackName are two independent corroborating signals.

**Two things worth flagging from this log beyond the banner:**
1. **Haiku read a completely different Pokémon** ("Gengar", attack "Pain
   Dealer") from the same frame. Not a near-miss — a different species
   and a different attack. A real cross-provider disagreement on a
   blurry live frame, and directly relevant to Option C below.
2. **`total ms = 3495`, outside the 1-3s target** (`gemini 1774ms` +
   `lookup 1721ms`). The lookup half was unusually slow; the Gemini half
   was normal. One sample, not a trend — worth watching, not acting on.

### Pricing — confirmed live against `/api/price` (productId 87282)

| printing | NM | break-even | Suggested Bid | sell-through |
|---|---|---|---|---|
| Normal *(selected by default)* | **$0.42** | $0.85 | $0.61 | Normal, 54.3/mo, 163 sold/3mo |
| **Reverse Holofoil** | **$12.52** | $10.06 | **$6.29** | Slow, 11.3/mo, 34 sold/3mo |

Ratio **29.8x**, high side $12.52 — clears the banner's `>=3x` and
`>=$5` thresholds comfortably. Every figure matches what the panel
showed, including the `Normal · 54/mo` badge. PPT's cached RH price is
$13.10 vs TCGplayer's live $12.52 — ordinary drift, not a discrepancy.

**This is the EX Crystal Guardians pattern**: one product (87282), two
printings, the stamped card being the Reverse Holofoil. The dropdown
reaches the right answer and the banner points at it. Contrast the
Burger King Chimchar entry above, where the right answer is a different
product entirely and the banner cannot help.

### Tally: stamp visibly in the art, `stampType` read as `"none"`

| card | set | set-logo stamped set? | model reads, all `"none"` |
|---|---|---|---|
| Treecko 67/100 | EX Crystal Guardians | yes | 3 Gemini primary |
| Chimchar 76/130 | Burger King Promos | n/a (promo overprint) | 2 Gemini primary |
| Holon Research Tower 94/113 | EX Delta Species | yes | Gemini + legacy + Haiku |
| Corphish 62/110 | EX Holon Phantoms | **probably not** (see caveat) | panel badge only |
| **Meditite 56/100** | **EX Crystal Guardians** | **yes** | **Gemini + legacy + Haiku** |

**Zero true positives across every scan logged so far.** On the two
cards with full shadow coverage (Holon Research Tower, Meditite) all
**three** independent models returned `"none"`.

**Caveat on the Meditite row specifically — the one that matters most,
since it is the strongest row in this table.** That the card in hand was
the stamped printing is **Eric's report, not independently verified
here**. The screenshot he sent does not settle it: the card is in a
toploader at stream resolution with no legible stamp box, and the
panel's own thumbnail is TCGplayer's catalog image for product 87282,
which is the *Normal* printing and would not show a stamp either way.
Supporting but non-conclusive: he placed a **$13 max bid**, consistent
with valuing it as the $12.52 Reverse Holofoil rather than the $0.42
Normal. **If this card was actually the Normal printing, `stampType:
"none"` was correct and this row does not belong in the tally at all.**
Flagged rather than assumed, because a tally of false negatives is only
as good as the ground truth behind each row.

Two further honest caveats:
- **Corphish is the weakest row.** Only the panel's `none stamp` badge
  was observed, not a log; and per the (user-generated) source used on
  2026-09-30, EX Holon Phantoms is on the list of EX sets **without** a
  set-logo stamp. It may not belong in a "stamp visible" tally at all.
- This is **not** evidence the models *cannot* see these stamps. The
  2026-09-30 direct test is the counter-evidence: asked explicitly
  whether a set logo was printed in the artwork, Haiku returned
  `{"setLogoStampInArt": true, "stampText": "CRYSTAL GUARDIANS",
  "confidence": "High"}` on the stamped Treecko and `false` on an
  unstamped control. The failure is a **schema/prompt gap** — the
  `stampType` enum has no set-logo value and the prompt tells the model
  to default to `"none"` for anything unlisted — not a vision limit.

### Option C (`setLogoStampInArt` field): RECOMMENDATION — NOT YET

| | |
|---|---|
| Effort | Medium. `GEMINI_SCHEMA` + `HAIKU_SCHEMA` + the shared prompt in `api/identify.js`, plus a live-validation window. Needs a deploy, so it should ride with the two backend items already queued (tie `tcgPlayerId` logging, `matchBasis`). |
| Cost/scan | Effectively **$0** — one boolean and a short string of extra output. Measured scans run ~$0.0009 (Gemini) and ~$0.0033 (Haiku shadow); this adds roughly a thousandth of that. |
| Risk | False positives under glare. Bounded by the standing rule that it may only **strengthen the banner's wording, never switch the default printing** — so a bad read costs a misleading sentence, not a misleading price. |

**Why not yet, concretely:**
1. **The banner already solves the user-facing problem without it.**
   Meditite is the proof: the stamp signal was worthless (`"none"` from
   all three models) and the right number — $12.52, Bid $6.29 — still
   reached the panel. Option C would change the banner's *wording*, not
   its *outcome*.
2. **The gain is small for a ~10-second auction decision**: "this looks
   like the stamped reverse-holo printing" instead of "another printing
   is worth much more — check the card and switch".
3. **The evidence it would work on real frames is weak.** The one
   positive test was a flat, well-lit catalog scan. On *this* real
   frame, Haiku could not identify the species, calling it a Gengar. A
   stamp field read from frames of that quality is not something to rely
   on yet.
4. The two queued backend changes have clearer value and carry no
   vision-reliability risk. They should land first.

**What would change this to "build it":** the banner being live for a
while and Eric finding cases where it fires but he still cannot tell
which printing he is holding — i.e. the *wording* becomes the
bottleneck rather than the data. Absent that, this stays deferred.

---

## Test: Southern Islands Mew (01/18, $624) — 10 consecutive failed scans; the record was NEVER RETRIEVED, not mis-scored (2026-10-02)

**Investigation only — no code changed in this pass.** Eric scanned a
Southern Islands Mew on a live stream. The extension read the name
correctly every time and never found the card across **ten** scans.
This is the most valuable card the tool has failed on to date.

### Ground truth

```
tcgPlayerId 46466 | Southern Islands | "Mew" | cardNumber "01/18"
rarity Promo | hp 30 | attack "Rainbow Wave" | externalCatalogId si1-1
printingsAvailable: ["Reverse Holofoil"]  (no Normal printing exists)
market $624.04 | 17 listings | totalSetNumber: null
```
Gemini's reads of `cardName: "Mew"` + `attackName: "Rainbow Wave"` (and
`hp: "30"` on one scan) confirm this is the card.

### The ten scans

All read `cardName: "Mew"`, `attackName: "Rainbow Wave"`,
`setName: null`, `stampType: "none"` (one `"other"`). Numbers read:
`null` x6, `8/18` x2, `7/18` x1, `8/64` x1 — **never `1/18`**.

| requestId | number | conf | best match | score/tie |
|---|---|---|---|---|
| `ba997012` | null | Medium | Mew - 8 (Glossy Finish), WoTC Promo | 6/1 — price withheld |
| `1b052656` | 8/18 | High | Mew - 8 (Glossy Finish) | 7/1 |
| `25ed6fcc` | null | Medium | Mew VMAX (Secret) | 2/**8** |
| `96184a4b` | null | Low | Mew VMAX (Secret) | 2/**8** |
| `946513f7` | null | High | Mew - 8 (Glossy Finish) | 6/1 — price withheld |
| `2c59f053` | 8/18 | High | Mew - 8 (Glossy Finish) | 7/1 |
| `2232314e` | null | Medium | Mew VMAX (Secret) | 2/**8** |
| `bb3b474e` | 7/18 | High | Mew VMAX (Secret) | 2/**8** |
| `f89e7b08` | null | Medium | Mew VMAX (Secret) | 2/**8** |
| `8fa53765` | 8/64 | High | Shining Mew, Shining Legends | 8/1 |

The null-cardNumber weak-signal floor did its job on 2 of 10 (price
withheld). The other 8 surfaced a confident-looking wrong card.

**The legacy shadow model read `setName: "Southern Islands"` on
multiple scans, and once read `cardNumber: "1/18"` — the correct
number.** The primary read `setName: null` on all ten. Haiku
contributed nothing usable.

### Root cause: the record was never retrieved

`search=Mew&limit=30` at offsets **0, 30 and 60** — tcgPlayerId 46466
is **absent from all 90 results**, crowded out by the enormous Mew
catalog. **The scoring never saw it.** This is not a filter loss and
not a scoring loss.

Why every existing fallback failed:
- **Page 2** (offset 30) ran — still absent.
- **Combined name+number** fired on `bb3b474e`: `"Mew 7/18"` -> 0
  results, then `"Mew 07/18"` -> 0 results. **The zero-padding logic
  worked exactly as designed** (padded to 2 digits to match the 18
  total, per test #94 / commit `b01b257`). It was simply fed the wrong
  numerator. Verified directly: **`search="Mew 01/18"` returns exactly
  1 result, the correct card.**
- **Legacy-model number rescue** does `candidates.find(...)` against the
  **already-fetched pool** and never re-queries, so even the correct
  `1/18` legacy read could not have rescued it.

**The decisive finding**: `search="Mew Southern Islands"` returns
**exactly 1 result — the correct card**. The legacy model had already
read that set name. **There is no setName-scoped search anywhere in the
codebase** — confirmed by auditing every `fetchPokemonPriceTracker`
call site; all are keyed on card name only (plus offset, or a combined
name+number string).

### It is a class, not this one card

The driver is **common species name + small/promo set**:

| species | total results for a bare search | Southern Islands card in page 1? |
|---|---|---|
| Butterfree | 26 | **yes** (09/18) |
| Togepi | 23 | **yes** (04/18) |
| Lapras | 30 (full page) | **no** |
| Mew | 30 (full page) | **no** — absent from first 90 |

So it hits exactly the subset of small/promo-set cards whose species is
heavily reprinted — i.e. it is worst precisely where the crowding comes
from the species being popular. The same shape applies to any
small/promo set record of a common species, not just Southern Islands.

**Unresolved**: why the models read 7/18, 8/18, 9/18 and 8/64 but
essentially never 1/18. Variance that wide suggests the printed number
is genuinely hard to read on this card; the logs cannot settle it, and
no prompt change is proposed on this evidence alone.

### Options (none built in this pass)

| | Option | Effort | Deploy? | Risk |
|---|---|---|---|---|
| **1** | **setName-scoped search fallback** — when the name/number fallbacks fail and a set name was read, try `"<cardName> <setName>"`. Proven to resolve this exact card. | small-medium | yes | Low-moderate: must keep strict exact-match-only acceptance, because PPT returns unrelated filler for non-matching multi-word queries (test #63). |
| **2** | **Consume the legacy shadow's `setName`, not just its `cardNumber`** — already in flight, already carried "Southern Islands". This is what makes Option 1 fire here. | small | yes | Low — additive, same shape as the existing number rescue. |
| 3 | Deepen pagination to page 3-4 | small | yes | **Rejected — tested: the card is absent from the first 90 results**, so it would burn 30-60 extra credits per failing scan and still fail. |
| 4 | Accept and disclose only | none | no | The floor withheld 2 of 10, but 8 scans surfaced a wrong card for a $624 item. Weak alone. |

**Recommendation: Options 1 + 2 together**, bundled into one deploy with
the two already-queued backend items (tied `tcgPlayerId` logging and the
`matchBasis` reason code).

---

## Fix: set-name-scoped search rescue for small-set cards that a name search never returns — BUILT, DEPLOYED, PUSHED; the rescue itself NOT yet observed on live traffic (2026-10-02)

Follows the Southern Islands Mew investigation directly above. Four
backend changes shipped as one set.

### What shipped

**Option 2 — the legacy shadow model's `setName` as a HINT.** The set
name is taken from the primary read, falling back to the legacy shadow
read already in flight (no new model call, no new cost). It only chooses
a query; it must then survive the acceptance rules below. In the real
Mew scans the primary read `setName: null` every time while the legacy
model read `"Southern Islands"` — the information was already there and
being discarded.

**Option 1 — one extra PPT search, `"<cardName> <setName>"`.** Accepted
only if a candidate passes **all** of:
- the same name filter used everywhere else;
- **exact normalized set-name equality** (`normalizeSetNameForMatch` —
  folds case, accents, punctuation and `&`/`and`);
- the number check, when a number was read and parses.

Then **exactly one distinct qualifier** (deduped via
`candidateDedupKey`) is required. Several or none -> nothing happens,
existing behavior. Strictness is deliberate: PPT returns unrelated
**filler** rows rather than an empty array for multi-word queries that
match nothing (test #63), so a nonzero result count proves nothing.

Accepted matches get `matchConfidence: "Medium"` (set outright, not
`min(current, Medium)` — the rescue replaces `best` with a candidate
that was never scored against the read, so the surviving `bestScore`
describes a different card; carrying it forward produced **Low** on the
Mew case purely because the synthesized floor score of 3 sits under
`MEDIUM_THRESHOLD` of 5) plus `matchBasis: "setname-search"` and this
disclosure:

> "We couldn't find this card by name or number, so it was located using
> the set name "Southern Islands", which came from a second AI model's
> independent read of the card. Exactly one printing in that set matched
> the name and number we had. This isn't a fully confirmed match; verify
> the exact set and printing before trusting this price."

**Two guards, both load-bearing:**
- `resultIsWeak = !best || bestScore < HIGH_THRESHOLD || tieCount >= 2`.
  The first draft lacked this and would have run on any scan whose best
  match was not number-confirmed — **including scans that had already
  resolved well on a null card number**. The real Meditite 56/100 scan is
  exactly that shape (`cardNumber: null`, `bestScore` 10 = hp 6 +
  attackName 4, `tieCount` 1, Match High). Those scans would have paid
  an extra PPT call, ~30 extra credits, the legacy-await latency, and
  risked a good High match being replaced by a Medium one. Caught in
  review — the code comment claimed "never replaces a High-confidence
  normal-path match" and the code did not enforce it.
- `numberAlreadyConfirmed` — kept because it states intent directly.
  **CORRECTED 2026-10-04**: this originally read "redundant (any number
  match scores >= 14, already clearing `HIGH_THRESHOLD`)". Both halves
  were wrong and the error mattered — see the total-orphan entry near the
  end of this file. An EXACT match scores `SCORE.number` = 20, but a WEAK
  (asymmetric promo-vs-numbered-set) match scores `SCORE.number * 0.35` =
  **7**; the `0.7` multiplier that would have given 14 was removed in
  commit `42429a5` (test #67). 7 does **not** clear `HIGH_THRESHOLD`
  (10), so on a weak match `resultIsWeak` is **true** and this guard is
  not redundant at all — it was the only thing blocking the rescue,
  because `numbersMatch`'s asymmetric branch returns `match: true` for a
  coincidental numerator.

**500ms cap on the legacy-read await.** `LEGACY_SETNAME_HINT_TIMEOUT_MS
= 500`, via `Promise.race`. The await is otherwise bounded only by
`GEMINI_TIMEOUT_MS` (5000ms) and a measured worst case added **+2161ms**
to a weak scan — enough to blow the 1-3s target alone. Past the cap the
hint is treated as absent and the scan falls through, logging that it
did. The `.catch` on the raced promise prevents an unhandled rejection;
the timer is cleared in a `finally`.

**One extra change the Mew case forced**: set-name rescues are exempted
from the null-cardNumber weak-signal floor
(`} else if (!read.cardNumber && !setNameSearchRescued) {`). Without it
the Mew case resolved correctly to 46466 and was then **discarded on a
signal count of 0**, because the rescued candidate was never scored
against the read so `bestDetail` is null.

**Queued item (a) — `tiedIds` logging.** `pickBestCandidate`'s tie log
line now records the tied `tcgPlayerId`s. Without them a tie cannot be
reconstructed afterwards: proved 2026-10-01, when re-querying PPT failed
to reproduce the original pool and **0 of 14** real ties from a live
session were recoverable.

**Queued item (b) — `matchBasis`.** A machine-readable companion to
`ambiguousNote`, returned in the response:
`legacy-number-rescue`, `setname-narrowed`, `setname-search`,
`weak-number`, `name-rescued-by-number`, **`tie`**, `score-only`. The
`tie` value was added for the `tieCount >= 2` -> Low path, which
previously fell through to `score-only`. No frontend change shipped —
the extension's alternate-printing banner gate still treats every Medium
alike; this is the field that will let it stop doing so.

**`&` vs `and`**: folded together in `normalizeSetNameForMatch`, scoped
**only** to this acceptance check. Deliberately **NOT** wired into
`scoreCandidate`'s `set` signal — per the Burger King Chimchar entry,
doing that in isolation hands the BASE card +3 while a promo reprint
sharing the number gets nothing, collapsing an honest tie into a
confident wrong answer.

### Measured numbers (real live PPT, not estimates)

**Credits per scan** — the new search runs *only* on already-failing scans:

| scan | PPT calls | credits |
|---|---|---|
| Resolves normally (Treecko 90038) | `search=Treecko` | **30 — zero added** |
| **Meditite-shaped strong scan** (null number, High) | `search=Meditite` | **30 — zero added, zero set-name searches** |
| Fails (Mew null number) | name + page 2 + **set search** | **90** (+30 from this change) |
| Worst case (Mewtwo zero-pad chain + set search) | 5 | ~150 |

**Latency of the legacy-hint await**, with a deliberately slow legacy read:

| scenario | total | delta |
|---|---|---|
| **Strong scan, legacy 3000ms slow** | **481ms** | **0 — never awaited** |
| Weak scan, legacy already resolved | 1495ms | baseline |
| Weak scan, legacy @1500ms | 1077ms | falls through at the cap |
| Weak scan, legacy @3000ms | 1028ms | falls through at the cap |

Capped weak scans come out *faster* than baseline, because giving up on
the hint also skips the extra PPT call. Context for why the tail rarely
bites: both model calls are fired in parallel at the top of the handler,
and real production logs show the legacy finishing only ~100-250ms after
the primary (primary 1519-1774ms vs legacy 1572-1991ms).

**Test suite**: 10/10 against real live PPT, plus one report-only case —
Mew null + hint resolves to 46466 at Medium; a wrong hint ("Jungle")
accepts nothing; a Meditite-shaped scan makes zero set-name searches and
stays High; Moo-Moo Milk (`d1c185a`), Mewtwo zero-pad (`b01b257`),
Chimchar tie, Treecko, Corphish and the legacy-number-rescue path all
behave exactly as before; a many-qualifier search accepts nothing. One
intermediate red on Chimchar was a transient PPT minute rate limit from
the harness itself, confirmed correct in isolation (84282 / Low /
`tie`).

### Deploy

Built from disk via the Vercel CLI with `--scope leasedraftai` (required
— see the box in CLAUDE.md's "Before you deploy").

```
preview     dpl_6xXTfhU3naefv7EifPohWr8veZma
production  dpl_qGSZV7k4TyiKhauy37SRxRMrS6qJ   (Ready, aliased)
sourceHash  460cbf0eeb651d9f0b9a26759283fff9d8d4e1c9
```
Both deployments' `sourceHash` equal `shasum api/identify.js` exactly.
`normalizeDiacriticTest: "pokemon collector"` intact; `POST {}` returns
the real 400. Code commits `324f837` + `cc6e4c6`, pushed.

**Real end-to-end scans on production:**
- Southern Islands Mew (46466 product image) -> correct card, **High**,
  `matchBasis: "score-only"`, `timingMs.total: 2461`
- Pikachu XY95 -> correct (114004), High, `score-only`, 1623ms

`get_runtime_errors` clean for the new deployment — the single error
group (a PPT 502 on an unrelated Charizard search) is stamped
`lastDeployment=dpl_DhY7ZAQyJzd1cfR1U3wVFBJ7B3n6`, the PRIOR deployment,
and predates this deploy.

### NOT YET PROVEN ON LIVE TRAFFIC

**The real Mew end-to-end scan resolved BY NUMBER and did NOT exercise
the new rescue** — `matchBasis` came back `score-only`, not
`setname-search`. The TCGplayer catalog image is clean enough that the
number reads correctly, and the combined name+number fallback
(`"Mew 01/18"`) finds the card on its own. So the rescue path is
deployed and proven against live PPT data in the local harness, but
**has not been observed firing on real production traffic**. Watch for
a `[lookup] SETNAME SEARCH RESCUE` line. The same applies to the new
`tiedIds=` field, which needs a real tie scan to appear.

### The wrong-number Mew class — now FIXED IN CODE (2026-10-04), see the total-orphan entry below

Of the ten logged Mew scans, six read `cardNumber: null` and resolve via
the rescue above. **Three** of the remaining four read a *wrong* number
(`8/18` x2, `8/64`) and surfaced a wrong card; the fourth (`7/18`)
surfaced nothing at all.

**CORRECTED 2026-10-04 — the original text of this section got the
mechanism wrong on three counts, and the corrected version is what the
fix was actually built against.** It read: *"A wrong-but-parseable number
produces a `weak-number` match worth >= 14 points, which clears
`HIGH_THRESHOLD` (10), so `resultIsWeak` is false and the set-name search
never runs,"* and counted **four** stuck scans. In fact:

1. **A weak match is worth 7 points, not >= 14.** It is
   `SCORE.number * 0.35`; the `0.7` multiplier was removed in `42429a5`.
   7 does **not** clear `HIGH_THRESHOLD` (10), so **`resultIsWeak` was
   always TRUE** on these scans.
2. **The blocker was `numberAlreadyConfirmed`, not the score gate** —
   `numbersMatch`'s asymmetric branch returns `match: true` for a
   coincidental numerator, which satisfied that guard. **And unblocking
   it alone would have fixed nothing**, because the rescue's own
   qualifier filter re-applies `numbersMatch` against the wrong read
   number. Verified against the one real `"Mew Southern Islands"`
   result: `8/18`, `7/18` and `8/64` each yield **0 qualifiers**.
3. **`7/18` was never blocked by the gate at all.** Its `best` is null
   (score 2 < `MATCH_FLOOR`), so `numberAlreadyConfirmed` is false and
   the set-name search *already ran* — it was the qualifier filter that
   rejected the correct card. Attributing its failure to the weakness
   gate was wrong.

The two knobs this section dismissed were also costed properly before
anything was built, and the dismissal was right for the reason given but
understated: treating `weak-number` as weak would fire on **108 of 330**
realistic bare-numerator scans (**63 currently correct**), or **322 of
330** on number-only reads (**258 correct**). That is what pushed the
design onto an orphan-total trigger instead, which cannot fire on a read
with no `/total` at all.

`8/64` **remains unrecoverable by design** — both digits were misread, so
no signal we hold distinguishes it.

---

## Fix: READ TOTAL ORPHAN rescue — resolves the wrong-number Mew class. DEPLOYED, PUSHED, AND OBSERVED FIRING CORRECTLY ON PRODUCTION (n=1 target case) (2026-10-04)

Follows the Southern Islands Mew investigation and the set-name search
rescue above. Commit `1c487f7`, `api/identify.js` only
(sha1 `e7495136d71a95542c3aa7666edb1c5b0df5e521`), docs in `e14362e`,
pushed to GitHub as `0eec6a1..e14362e`.

> **LIVE AND CONFIRMED.** Production runs
> `sourceHash e7495136d71a95542c3aa7666edb1c5b0df5e521`
> (`dpl_DnqenwCrm7BjRa3oG44LCFrEfQ62`), which **equals
> `shasum api/identify.js` on disk byte-for-byte** — the second byte-exact
> deploy in this project's history, and the second built from disk via the
> Vercel CLI rather than inline content. The prior production hash was
> `460cbf0e…` (`dpl_qGSZV7k4TyiKhauy37SRxRMrS6qJ`).
>
> **STILL QUEUED, did NOT ride along** — verified by grep against the
> deployed file after the deploy, not assumed:
>   1. `WHATNOT_PURCHASE_TAX_RATE`'s comment still reads "ASSUMPTION, NOT
>      YET VERIFIED" (`api/identify.js:220`), which Eric's 48-receipt check
>      across 7 sellers already disproved.
>   2. `stampNote`'s wording still claims "our data source doesn't track
>      pricing for stamped promos separately from the standard printing"
>      (`api/identify.js:3900`), which is false for set-stamped EX cards.
>   3. `WHATNOT_SHIPPING_PER_CARD` is still `0.0`
>      (`api/identify.js:238`) and `computeSuggestedBid` still computes
>      `(target - shipping) / (1 + tax)` (`api/identify.js:2311`) — the
>      less-correct term ordering. A no-op while shipping is zero, but
>      whoever sets that constant to a real value (~$6 / cards per order)
>      must move the shipping term outside the division in the same change.
>
> Deploy-hash parity with production is now intact again, so the "fold
> comment-only edits into the next real change" rule applies to all three
> as before — none of them is urgent, and none should get a dedicated
> deploy.

### What it fixes

Three of the ten logged Mew scans read a wrong number (`8/18` x2,
`8/64`) and resolved to tcgPlayerId **607818** ("Mew - 8 (Glossy
Finish)", WoTC Promo, **$37.25**) instead of the real **46466**
(**$624.04**) — a **17x** understatement at Medium confidence resting on
one coincidental numerator. A fourth (`7/18`) surfaced nothing.

What separates the right card from the wrong one is the **denominator**,
not the numerator: the read said `/18` and **not one candidate in the
fetched pool carries total 18**, because the whole Southern Islands set
was crowded out of the name search. New `readTotalMissingFromPool()`
detects exactly that, and it is a *set-absent* detector rather than a
typo detector. Measured over 18 real cached PPT pools, 330 perturbation
triples:

| scenario | total-orphan fires | existing no-exact-match fires |
|---|---|---|
| number read correctly | **0 / 330 (0.0%)** | 0 / 330 (0.0%) |
| **numerator** misread (+7) | **0 / 330 (0.0%)** | 328 / 330 (99.4%) |
| **denominator** misread (+13) | **317 / 330 (96.1%)** | 322 / 330 (97.6%) |

The 0% vs 96.1% split between numerator and denominator perturbation is
the non-trivial result — the 0% on correct reads is partly construction-
guaranteed, since the read was derived from a pool member.

PPT's own `totalSetNumber` is `null` everywhere (re-confirmed on 46466),
so "the candidate set's real printed total" is **not** available. Only
the total embedded in a candidate's own number string is, which is what
both new helpers use.

### The change

1. **`readTotalOrphan` trigger** — OR'd into the existing rescue's entry
   condition, bypassing **only** `numberAlreadyConfirmed`.
   `resultIsWeak` is still required (the orphan check sits inside that
   branch), so a High-scoring untied match is never replaced.
   `numbersMatch`, `scoreCandidate`, `resultIsWeak` and
   `numberAlreadyConfirmed` are themselves untouched.
2. **Total-only qualifier relaxation, orphan path only** — a qualifier
   may be accepted on denominator-only equality (`numberTotalsMatch`).
   When the flag is false the filter is byte-identically as strict as
   before. The other three guards are unchanged and each is load-bearing:
   the name filter, exact normalized set-name equality, and **exactly one
   distinct qualifier**. Verified against live PPT: `"Mew Southern
   Islands"` yields **1** qualifier, but `"Mew WoTC Promo"` yields **4**
   and `"Lapras SV2a: Pokemon Card 151"` yields **3**, so neither
   rescues anything.
3. **Weak qualifiers REJECTED on the orphan path** — the opposite of the
   unchanged path. See "what the tests caught" below.
4. **NO-NUMBER-MATCH exemption** for a rescued result.
5. **`setNameSearchNumeratorDisagreed`** adds a clause to the
   `ambiguousNote` naming both numbers and saying only the set size
   matched, and tags the rescue log line `ACCEPTED ON SET SIZE ONLY`.
6. **New log line**:
   `[lookup] READ TOTAL ORPHAN: read=X/T, no candidate in pool carries total T`
   — added so the trigger's real firing rate becomes measurable rather
   than inferred from synthetic perturbation.

Real captured output for `8/18`:

```
[lookup] READ TOTAL ORPHAN: read=8/18, no candidate in pool carries total 18
[lookup] no number-confirmed match — trying setName-scoped search= "Mew Southern Islands" (setName hint from legacy-shadow)
[lookup] setName-scoped search raw candidate count= 1
[lookup] SETNAME SEARCH RESCUE: accepted Mew 01/18 (Southern Islands, tcgPlayerId=46466) via setName hint "Southern Islands" from legacy-shadow — ACCEPTED ON SET SIZE ONLY, read number 8/18 disagrees
```

### The 8 cases — before/after

Driven through the **real, unmodified `lookupCardPPT`** with `fetch`
mocked over real cached PPT payloads (no network, no credits).

| | case | before | after |
|---|---|---|---|
| **C1** | `8/18` (logged `1b052656`, `2c59f053`) | 607818 WoTC Promo **$37.25**, Medium `weak-number` | **46466 Southern Islands**, Medium `setname-search` |
| **C2** | `7/18` (logged `bb3b474e`) | `notFound` | **46466**, Medium `setname-search` |
| **C3** | `8/64` (logged `8fa53765`) | 607818, Medium `weak-number` | **unchanged** (+1 PPT call) |
| **C4** | `1/18` correct read | 46466, Medium `setname-search` | **unchanged** |
| **C5** | `null` (6 of the 10 logged scans) | 46466, Medium `setname-search` | **unchanged** |
| **R1** | High score + orphan total | 99991, Low `score-only` | **unchanged** — `resultIsWeak` false, orphan never evaluated, no extra call |
| **R2** | bare `"No. 131"` (Lapras 3-way tie) | 566476, Low `tie` | **unchanged** — orphan cannot fire without a `/total` |
| **R3** | orphan + ambiguous set (`WoTC Promo` hint) | 607818, Medium `weak-number` | **unchanged** (+1 call) — 0 qualifiers |

**Net on the ten logged Mew scans: 6 of 10 recoverable -> 9 of 10.**
`8/64` stays unrecoverable by design.

### Regression — differential against `HEAD`, not a reconstructed suite

**3,514-scan differential**: real `lookupCardPPT`, 18 real cached PPT
pools, every candidate x 5 read shapes x hint/no-hint, run against both
the pre- and post-change file with identical mocked fetch.
**0 outcome differences, 0 exceptions on either side.**

| read shape / hint | n | outcome diffs |
|---|---|---|
| correct / hint, nohint | 382, 382 | 0, 0 |
| numPerturb / hint, nohint | 331, 331 | 0, 0 |
| totPerturb / hint, nohint | 331, 331 | 0, 0 |
| bare / hint, nohint | 331, 331 | 0, 0 |
| null / hint, nohint | 382, 382 | 0, 0 |

That first sweep served **empty** results for set-name searches, so it
proved "no outcome change when the rescue finds nothing" without ever
exercising a *successful* rescue. A second **1,324-scan sweep** served a
realistic set-name result (every cached card of that species in the
hinted set) and counted PPT calls:

| read shape | n | diffs | fixed | **broke** | calls old | calls new | per-scan delta |
|---|---|---|---|---|---|---|---|
| correct | 331 | 0 | 0 | **0** | 331 | 331 | **+0.000** |
| numPerturb | 331 | 0 | 0 | **0** | 1340 | 1340 | **+0.000** |
| totPerturb | 331 | **1** | 0 | **0** | 1377 | 1382 | **+0.015** |
| bare | 331 | 0 | 0 | **0** | 361 | 361 | **+0.000** |
| **total** | **1324** | **1** | 0 | **0** | 3409 | 3414 | **+0.004** |

**0 cases went from correct to wrong.** The single difference is an
**improvement**: truth card 87394 (`Mew (8)`, `08/53`, WoTC Promo) with a
misread denominator used to surface the wrong 607818 labelled
`setname-search`; it now withholds instead.

**47-function byte-identity check** — rather than reconstruct the
documented suites from prose, every top-level function body was
extracted from both files and compared. **2 added**
(`readTotalMissingFromPool`, `numberTotalsMatch`), **1 changed**
(`lookupCardPPT`), **all 47 others byte-identical** — including
`normalizeNumber`, `numbersMatch`, `scoreCandidate`, `pickBestCandidate`,
`confidenceForScore`, `attackNamesFuzzyMatch`, `normalizeNameForMatch`,
`normalizeSetNameForMatch`, `candidateDedupKey`,
`buildZeroPaddedNumberVariant`, `candidateStampType`,
`ambiguousNoteText`, `normalizeNameForSearchQuery`,
`fetchPokemonPriceTracker`, `normalizePptCard`,
`buildLivePriceVariantsFromTCGPlayer`, `computeBreakEvenMaxBid`,
`computeSuggestedBid`, `buildLiveVariantsForCandidate` and
`pickDefaultVariantKey`. So the 31-case `normalizeNumber`, 23-case
fuzzy-attack, 411-value broad and pricing suites **cannot** change.
`module.exports` is identical, so `api/price.js` and `api/flag.js` are
unaffected and were not touched. `GET /api/identify` still returns
`normalizeDiacriticTest: "pokemon collector"` — this file's single most
historically fragile spot, confirmed intact.

### Credit cost — measured, not estimated

**+0.004 PPT calls per scan aggregate** (+5 calls over 1,324). Zero for
correct reads, numerator misreads and bare reads; **+0.015** for
denominator misreads. The orphan bypass only adds a call in the narrow
sub-case where `numberAlreadyConfirmed` was already true via a weak
match — everywhere else the set-name search was already eligible. A scan
that *does* trigger it pays **one extra search = 30 credits**, plus up to
500ms (`LEGACY_SETNAME_HINT_TIMEOUT_MS`) only when the primary read
supplied no set name.

### Three things the tests caught that the design didn't anticipate

1. **A NO-NUMBER-MATCH override silently undid a correct rescue, and
   needed a third code change that wasn't in the spec.** The
   `if (read.cardNumber && best.number)` block now also requires
   `!setNameSearchRescued`, mirroring the exemption the
   `!read.cardNumber` branch has carried since `324f837`. A rescue
   accepted on denominator-only equality fails `numberMatchedForBest`
   **by construction** — the numerator is the part already concluded to
   be misread — so without this guard the real `7/18` read resolved
   correctly to 46466 and was then **immediately re-withheld** by the
   insufficient-corroboration floor (case C2 failed on the first build).
   When a rescue's number *did* match, the block was already a no-op, so
   this only ever affects the numerator-disagreed case.
2. **The orphan path must REJECT a weak qualifier — the opposite of the
   unchanged path.** The first build let strict `numbersMatch` admit weak
   qualifiers on the orphan path too, and regression case **R3** caught
   the consequence: with the hint `"WoTC Promo"`, bare candidate `"8"`
   became the single qualifier for read `8/18` and **relabelled the same
   wrong $37.25 card from `weak-number` to `setname-search`, dropping its
   weak-number warning**. Same wrong card, strictly worse disclosure. A
   weak match is a coincidental numerator against a bare promo number,
   which is precisely what the orphan signal says not to trust.
3. **"Relax the filter on the orphan path only" was ambiguous, and the
   two readings disagree on `7/18`.** Read literally as *only when
   `numberAlreadyConfirmed` was the thing bypassed*, `7/18` would **not**
   relax — its gate already passes, since `best` is null — and would
   still fail. The relaxation is therefore gated on `readTotalOrphan`
   itself, which satisfies both the `7/18` expectation and "the existing
   path keeps its current strictness" (when the flag is false the filter
   is byte-identical). Recorded because it is a real interpretation, not
   a detail.

### Deployed and live-confirmed, 2026-10-04

Built from disk via the Vercel CLI (never the inline-content MCP path),
with `--scope leasedraftai` on every subcommand:

| | deployment | target | status | `sourceHash` |
|---|---|---|---|---|
| preview | `dpl_DPcGhvgCEMJj2BTy8KYrTiSD3xbw` | preview | Ready | `e7495136…` |
| **production** | **`dpl_DnqenwCrm7BjRa3oG44LCFrEfQ62`** | production | Ready | `e7495136…` |

**Both equal `shasum api/identify.js` exactly.** Production is aliased to
`whatnot-pokemon-identify.vercel.app` and
`whatnot-pokemon-identify-leasedraftai.vercel.app`; a live `GET` on the
real alias returns that hash plus
`normalizeDiacriticTest: "pokemon collector"`, and `POST {}` returns the
real `400 {"error":"Missing imageBase64","requestId":…}`.

**CLI wrinkle worth recording.** The first
`npx vercel deploy --yes --scope leasedraftai` returned a bare
`{"status":"error","reason":"deploy_failed","message":"Not authorized"}`
and created **no** deployment (confirmed — only one preview exists in
`vercel ls`). Re-running the identical command with `--debug` succeeded
immediately, and the debug output showed auth was fine the whole time
(`Valid access token, skipping token refresh`, correct
`teamId=team_DZEpR5n7heCyZsNFjxZmxUP1`); the failure surfaced around the
CLI's own GitHub-deployment-status step, not the file upload. `npx` had
also auto-bumped the CLI 62.1.0 → 62.2.0 since the 2026-10-02 note. **So
if `--scope` alone returns "Not authorized", just retry before assuming a
credential or scope problem** — and check `vercel ls` before retrying, so
a half-succeeded deploy isn't duplicated.

### Three real production scans

**A — Pikachu XY95 (clean regression), `requestId 4b630767`.** Correct
card, `tcgPlayerId 114004`, `matchConfidence: High`,
`matchBasis: "score-only"`, `visionProvider: gemini`,
`timingMs: {gemini: 1720, lookup: 156, total: 1876}` — inside the 1-3s
target. Cost $0.00091. **Its log contains exactly ONE `[lookup] search=`
line, NO `READ TOTAL ORPHAN` line and NO set-name search** — i.e. **1 PPT
call, 30 credits, zero extra** on a scan that resolves normally, which is
the central cost claim, now confirmed on production rather than inferred.
(The read was `cardNumber: "XY95"` — a prefixed promo code with no total
— so this also demonstrates the "a read with no `/total` can never set
the flag" property on real traffic.)

**B — Southern Islands Mew, `requestId 6e24f393` — THE TARGET CASE.** A
specific read cannot be forced, so the real 46466 catalog image was sent
and whatever came back was reported. Gemini read
**`cardNumber: "8/18"` — the exact wrong-number shape from the logged
ten.** Real production log:

```
[lookup] READ TOTAL ORPHAN: read=8/18, no candidate in pool carries total 18
[lookup] no number-confirmed match — trying setName-scoped search= "Mew Southern Islands" (setName hint from primary)
[lookup] setName-scoped search raw candidate count= 1
[lookup] SETNAME SEARCH RESCUE: accepted Mew 01/18 (Southern Islands, tcgPlayerId=46466) via setName hint "Southern Islands" from primary — ACCEPTED ON SET SIZE ONLY, read number 8/18 disagrees
```

Result: **46466, Southern Islands, `matchConfidence: Medium`,
`matchBasis: "setname-search"`, `timingMs.total: 1734`ms**, with the
extended note naming both numbers. A follow-up `POST /api/price`
returned in **185ms**: `priceVariantUsed: "Reverse Holofoil"`, NM
**$630.89**, `conditionsBreakEven.NM` $527.31,
**`conditionsSuggestedBid.NM` $329.70** (Slow tier, 57 sold / 19·mo),
`pricingError: null`.

Two details that matter for reading this correctly, neither of which the
design predicted:
- **The set-name hint came from the PRIMARY read this time**
  (`setName: "Southern Islands"`), not the legacy shadow model. All ten
  logged scans had the primary read `setName: null` every single time, so
  this firing did **not** exercise the legacy-hint path. The legacy model
  read `cardNumber: "9/18"` here — wrong again, and a fifth distinct
  wrong numerator for this card (7, 8, 9, and 8/64 across all reads).
- **On this particular firing the load-bearing piece was the relaxed
  total-only filter, not the gate bypass.** `best` was `Shining Mew
  40/73` (score 8 = hp 6 + rarity 2), so
  `numbersMatch("8/18", "40/73")` is false and
  `numberAlreadyConfirmed` was already false — the gate passed on the
  pre-existing condition. The gate bypass is still needed for the case
  where `best` IS the weak-matched bare-number candidate (harness case
  C1, where `hp` was null); both halves are real, they just didn't both
  fire here.

**C — organic Japanese Espeon, `requestId 4ffba242`** (Eric's own live
scanning, not a test). Read `cardNumber: "060/114"`. Hit the new line —
`[lookup] READ TOTAL ORPHAN: read=060/114, no candidate in pool carries
total 114` — and then, because neither the primary nor the legacy read
supplied a set name, made **no** set-name search and **no** extra PPT
call, falling through to the existing `NO NUMBER MATCH, INSUFFICIENT
CORROBORATION` withhold. 3 PPT calls (page 1, page 2, combined
name+number), exactly as before this change. **Real organic traffic
exercising the new code path with zero behavior change and zero extra
cost** — the safety property the sweeps claimed, observed rather than
modelled.

### Measured before/after on the real production read

The exact logged read from scan B was replayed through both the pre- and
post-change files against the same cached PPT payloads — a measurement,
not an inference from the log:

```
OLD  id=146699  set="Shining Legends"    conf=Medium  basis=score-only       pptCalls=2
     note: (NONE — no warning shown)
NEW  id=46466   set="Southern Islands"   conf=Medium  basis=setname-search   pptCalls=2
     note: We couldn't find this card by name or number, so it was located using the set name "Southern Islands"...
```

So on this real scan the old code showed **Shining Mew (Shining Legends)
at Medium confidence with no warning of any kind** — a confidently-
presented wrong card, worse than the $37.25 WoTC Promo outcome
documented from the harness, because that one at least carried a
`weak-number` warning. And **both versions made the same 2 PPT calls**:
this fix cost **zero extra credits** on the very scan it was built for,
better than the +0.015 calls/scan the 1,324-scan sweep predicted for
denominator-misread scans.

### Errors

`get_runtime_errors` (2h window spanning the deploy): **none**.
Error/warning/fatal logs on `dpl_DnqenwCrm7BjRa3oG44LCFrEfQ62`: **none**.
Status-code breakdown on the new deployment: 13x200, 7x204, 1x400 (that
400 being the deploy checklist's own `POST {}` check).

### Honest limitations

- **n=1 on the target case.** The orphan path has now been observed
  resolving the wrong-number Mew class correctly on production exactly
  **once** (scan B), plus once firing harmlessly with no hint available
  (scan C). That is a real status change from "unproven," not a
  confirmed rate. Keep watching for `[lookup] READ TOTAL ORPHAN` and
  `ACCEPTED ON SET SIZE ONLY`.
- **The legacy-shadow hint path is still unobserved on production.**
  Scan B's hint came from the primary read. The case the original
  investigation was built around — primary `setName: null`, legacy
  supplying "Southern Islands" — has not been seen firing live.
- **The trigger's real-traffic firing RATE is still inferred from
  synthetic perturbation**, not measured over a representative window.
  Two firings in a handful of scans says nothing about the rate; the log
  line exists so a future stats pull can measure it properly (and per
  the standing rule at the top of CLAUDE.md, never off a `[timing]`-only
  filter).
- **Exact normalized set-name equality stays brittle against how a model
  words a Japanese set name.** `"Hitmontop Crimson Haze"` (test #10)
  returns **0** name+set-equal candidates because PPT stores that set
  differently, so the rescue cannot reach that class either way. This
  change does not alter that.
- **Test #60 (Porygon2, Aquapolis) is unaffected by this change** — it
  was checked and already passes today's gate (`setName=null`,
  `bestScore=6`, `tieCount=4`, no number match), so it needs only a
  legacy set-name hint, not the orphan trigger. Flagged so this entry
  isn't later misread as having closed it.

---

## Fix: attack-mismatch confidence cap (English reads only) — "ME: 30th Celebration" Pikachu priced as Celebrations. BUILT AND MEASURED LOCALLY; NOT DEPLOYED, NOT PUSHED (2026-10-04/05)

Eric reported the extension struggling on the "30th collection" Pikachus.
His screenshot showed a card whose attack is **"Targeted Spark"** at HP
60, while the panel showed the **Celebrations** Pikachu (Gnaw / Thunder
Jolt) at **Read: High, Match: High**, with the "other stamp" warning and
**Market (Holofoil) $4.83**. A confident wrong match.

### Ground truth (PPT, confirmed live — PPT is NOT missing the set)

The real card is **tcgPlayerId 712942, "Pikachu - 038/128", `ME: 30th
Celebration`, HP 60, rarity "Pikachu Rare", market $0.96**, attack:

> `[L] Targeted Spark — This attack does 20 damage to 1 of your
> opponent's Pokémon. (Don't apply Weakness and Resistance for Benched
> Pokémon.)`

PPT carries the set under **two** names, both `releaseDate 2026-09-16`:

- **`ME: 30th Celebration`** — numbering `NNN/128`
- **`ME: 30th Celebration Classic Collection`** — numbering `NN/102`
  (e.g. the Base Set Pikachu reprint 58/102, HP 40, Gnaw/Thunder Jolt,
  market $23.74)

There are **~19 distinct Pikachu at `034/128`–`052/128`**, all rarity
"Pikachu Rare", market **$0.68–$2.54**. So this was never a data gap.

What the panel showed instead: **tcgPlayerId 250303, "Pikachu" 005/025,
Celebrations (2021), HP 60, Holo Rare, market $4.58**, attacks
`[1] Gnaw (10)` / `[1L] Thunder Jolt (30)`. The two cards share the
classic Base Set forest artwork, which is the whole reason they are
confusable.

### Diagnosis: a read problem that a scoring gap failed to contain

**Not a data gap, not a retrieval gap.** `search="Pikachu 038/128"`
returns **exactly 1 result — the correct card**. The existing combined
name+number fallback already resolves this the moment the number is
right.

**The number is a hallucination, not a lucky collision.** Three pieces of
evidence: (a) the real card is `038/128`, confirmed by its attack text;
(b) the `[legacy-model-shadow-test]` line shows `gemini-3.6-flash`
independently produced the *identical* `005/025` + `"Targeted Spark"` —
two models agreeing on a wrong number is **artwork/set-logo anchoring,
not glare OCR noise**, so no amount of rescanning would have fixed it;
(c) **Haiku on the same frame returned `cardNumber: null`** with
`reason: "Card number obscured by glare and angle of card in hand"`.

Score decomposition for requestId `930b7ccd`, **29 points**:

| signal | value | why |
|---|---|---|
| number | **+20** | `005/025` == `005/025`, exact |
| set | **+3** | the set test is a substring: `"celebrations"` ⊂ `"celebrations"` |
| hp | **+6** | 60 == 60 |
| attackName | **0** | "Targeted Spark" vs "Gnaw" — **no match, and no penalty** |
| rarity | **0** | "Holo Rare" not in `NOTABLE_RARITY_PATTERN` |
| stamp | **0** | read `"other"`, `candidateStampType(250303)` null → neither branch |

29 ≥ `HIGH_THRESHOLD` (10), `tieCount` 1 → **Match: High**. requestId
`99df0746` scored **23** (20 + 3 + 0, hp 70 vs 60) and logged
`NUMBER/HP CONFLICT`, yet still priced the card.

**The one signal that positively disproved the match was worth exactly
zero**, because `scoreCandidate` only ever ADDS `SCORE.attackName` on a
match and never penalizes a mismatch. `stampType` is the only signal in
the whole function with an asymmetric penalty (−8).

### All 6 Pikachu scans in the window (4 of 6 already behaved correctly)

| requestId | number | set | hp | attack | outcome |
|---|---|---|---|---|---|
| `99df0746` | 005/025 | Celebrations | 70 | Play Rough | → 250303, score 23, NUMBER/HP CONFLICT, **priced anyway** |
| `31293e57` | 024/025 | Celebrations | 70 | Volt Tackle | WITHHELD (READ TOTAL ORPHAN) |
| `54c65370` | 001/025 | Celebrations | 50 | Gnaw | WITHHELD (READ TOTAL ORPHAN) |
| `ceedd330` | 041/120 | null | 60 | Hang Down | WITHHELD — **real card is 041/128 "[C] Hang Down (10)" (712945)**; numerator exactly right, denominator 128→120 |
| `b2b212cc` | 008/124 | Fates Collide | 60 | Mach Bolt | WITHHELD (READ TOTAL ORPHAN) |
| `930b7ccd` | 005/025 | Celebrations | 60 | Targeted Spark | → 250303, score 29, **Match: High — the reported bug** |

`005/025` is the only one of these fabricated numbers that happens to hit
a real PPT card; that is why only this one surfaced a confident wrong
answer. The combined search returned `count= 0` for 024/025, 001/025,
041/120 and 008/124.

### The rule, and why it is a confidence cap and not a scoring penalty

A score penalty changes **which candidate wins** across the whole corpus,
and here it buys nothing: with the number misread the correct card is not
in the fetched pool at all, so penalizing only reaches "withhold" by a
longer route with far more blast radius. The cap is strictly additive and
cannot change which card wins or what price is computed.

`lookupCardPPT` now sets `matchConfidence = "Low"` and `attackMismatch =
true`, and appends

> `The attack we read, "<name>", isn't on this printing's attack list.`

to `ambiguousNote` (**appending**, never replacing — an existing tie /
weak-number / HP-conflict note survives alongside it). `matchBasis` is
**never** overwritten: the basis on which the candidate was chosen hasn't
changed, and this is a separate axis. New log line `[lookup] ATTACK
MISMATCH: read="X" candidate attacks=[...] best=<id>`.

Every guard is load-bearing:

- **English reads only.** See the false positive below.
- **`read.confidence === "High"`** — a hedged read's attack name isn't
  trustworthy enough to disprove anything.
- **candidate must have a non-empty parsed attack list** — Trainers,
  Energy and incomplete PPT rows have nothing to compare against, and
  silence is not evidence.
- **compares against EVERY attack**, not `candidate.attackName` (which is
  only attack #1). Without this, a correct read of a card's *second*
  attack — "Thunder Jolt" on 250303, whose `attackName` is "Gnaw" —
  would be flagged. This is why `extractAttackNames` exists.
- **`attackNameEnglish` is tried as well.**

`extractAttackNames` is implemented by calling `extractFirstAttackName`
on a one-element array, so the multi-`[cost]`-bracket regex is literally
the same code and `extractFirstAttackName` stays byte-identical on the
live scoring path.

**Ordering matters and was verified:** the weak-signal withhold paths
`return` at `api/identify.js:3205` and `:3290`, **before** the new block
— a scan that already withholds its price never reaches the rule.

### Measurements

Method: replay the **real, unmodified `lookupCardPPT`** out of probe
copies of `api/identify.js` (test-only exports appended to the *copies*;
the real file untouched), with the PPT runtime cache disabled identically
on both, against real cached PPT pools, driven by **93 real logged Gemini
reads** (46 primary + 47 `[legacy-model-shadow-test]`) preserved from
Vercel before the 1-hour retention window closed.

**Evidence base, stated honestly: 32 scans that produced a genuine match
from a genuine pool.** The other 51 reads hit a pool that was never
bought; `fetchPokemonPriceTracker` swallows the replay-miss error and
returns an empty pool, so both files produced identical **vacuous** "no
match" results. Those are **excluded** — an early version of this harness
reported "93/93 replayed, 6 changed", which would have been a flattering
lie. Card names actually covered (14): Pikachu, Flamigo, Sylveon EX,
Cyclizar, Dewgong, Blitzle, Duosion, Aegislash, Cyndaquil, Scraggy, Sawk,
Silvally, Quaxly, Mega Eelektross ex.

**Eligible** (attack read + High confidence + candidate has attacks):
**30 of 32**. **Fires: 5** (after the English-only guard).

| scan | read attack | candidate | candidate's attacks | verdict |
|---|---|---|---|---|
| `930b7ccd` primary | Targeted Spark | 250303 Celebrations 005/025 | Gnaw, Thunder Jolt | **correct** |
| `930b7ccd` legacy | Targeted Spark | 250303 | Gnaw, Thunder Jolt | **correct** |
| `99df0746` | Play Rough | 250303 | Gnaw, Thunder Jolt | **correct** |
| `31293e57` legacy | Volt Tackle | 250303 | Gnaw, Thunder Jolt | **correct** |
| `ce95366e` legacy | Colorful Harmony | 113764 Sylveon EX (Full Art) RC32/RC32, hp 170 | Dress Up, Precious Ribbon | **correct** |

By cause: **genuinely wrong card 5**; ability-read-as-attack **0
observed**; English OCR variation **0 observed**; Japanese name 1 (now
excluded by the language guard, below).

The `ce95366e` pair is a useful independent check: the **primary** read
matched `716231 Sylveon ex 153/128, ME: 30th Celebration`, whose attack
genuinely **is** Colorful Harmony, and did **not** fire; the **legacy**
read misread RC25→RC32, landed on the old Generations Full Art (hp 170 vs
read 270), and fired. Another 30th Celebration card.

**The one false positive, found before the guard and the reason for it.**
`f8420846`, a **Japanese** Mega Eelektross ex: read `cardNumber
"225/193"` — an exact match to candidate 665897 — and `hp 350`, also
exact, so the card was almost certainly identified **correctly**. The
read attack was `ばくれつだん` with `attackNameEnglish: "Focus Blast"`; the
real attack is **Split Bomb** (Japanese ぶんれつだん). A single-kana ば/ぶ
confusion plus a wrong translation. The fuzzy matcher cannot rescue it —
"Focus Blast" vs "Split Bomb" is genuinely far apart. **Decision: skip
the rule entirely for non-English reads.** On a non-English card the
attack name must survive OCR *and* translation, two failure modes an
English read doesn't have. A false Low is not free: it also **suppresses
the alternate-printing banner**, which has already cost a real find once
(see the Corphish entry). Japanese cards therefore lose this protection
entirely, deliberately. Missing/null language is treated as English,
matching `String(read.language || "English")` elsewhere in the file.

**Honest limits on these numbers.** n=30 eligible, from **one ~10-minute
slice of one session that happens to be unusually dense with 30th
Celebration cards — the exact failure this targets.** The pre-guard
**20% fire rate is NOT a representative rate and must not be quoted as
one.** 1 false positive in 30 is all the precision this sample supports.
The corpus was cut short by the credit stop described below; the primary
and legacy reads for the other 18 card names were never replayed.

**Differential over the 32 real-match scans:** 27 unchanged, 5 changed.
The union of changed fields across all 5 is **`{matchConfidence,
ambiguousNote}` and nothing else** — zero changes to `tcgPlayerId`,
`cardName`, `setName`, `matchBasis`, `pricingLookup`,
`printingUndetermined`, `found`. **No card won differently; no price
input moved.**

**Controls — 10/10 pass**, on candidate 250303 (Gnaw, Thunder Jolt):

| case | read attack | language | fires? | expected |
|---|---|---|---|---|
| 2nd attack, correct | Thunder Jolt | English | no | no |
| 1st attack, correct | Gnaw | English | no | no |
| OCR typo (fuzzy) | Thunderjolt | English | no | no |
| genuinely absent | Hyper Beam | English | **yes** | yes |
| Medium confidence | Hyper Beam | English | no | no |
| null attack | — | English | no | no |
| JP + correct `attackNameEnglish` | でんげきは / Thunder Jolt | English | no | no |
| **Japanese + wrong attack** | ばくれつだん / Focus Blast | Japanese | **no** | no |
| **English + wrong attack** | Hyper Beam | English | **yes** | yes |
| **null language → English** | Hyper Beam | null | **yes** | yes |

Real-world corroboration: `54c65370-LEGACY` read "Gnaw" against 250303
and correctly did **not** fire.

**Attack-name parse statistics**, over **170 distinct real PPT candidates
with attack data / 265 attack entries**:

| | count |
|---|---|
| all attacks parsed cleanly | 167 |
| all failed → `attackNames: []`, rule **skips** (fail-safe) | 1 |
| partial, only non-text junk dropped (no risk) | 2 |
| **partial, a real attack name dropped → false-positive risk** | **0** |

Zero residual `[cost]` brackets, zero stray newlines or HTML in any
parsed name. Multi-attack recovery works: `Blitzle 195/182 →
["Rear Kick","Wild Charge"]`, where `scoreCandidate` would only ever have
seen "Rear Kick". The three imperfect rows: **Mega Lucario ex 092/063**
and **Steelix 073/063** each have a junk `attacks[0]` that is the literal
string `"2"` / `"4"` in PPT's own data (drops harmlessly, both real
attacks parse); **Scraggy** has a single attack in a different PPT format
— `"<b>Tail Rap -- 20x</b>\r\n<br>…"` with no leading `[cost]` bracket —
which parses to null, so `attackNames` is `[]` and **the rule skips the
card entirely**. 3 of 265 entries (1.1%) use that `<b>Name</b>` format.
**`extractFirstAttackName` was deliberately NOT widened** to handle it:
that would break the byte-identity result and shift existing scoring, and
it already fails the same way today (so `scoreCandidate`'s +4 attackName
signal has always been dead on those cards). It fails in the safe
direction — silent, never wrong.

### What the UI does at `matchConfidence: "Low"` — read before deploying

Checked in `extension/content.js` rather than assumed. **The price is
still shown.** Price withholding is driven entirely by `pricingLookup ===
null` / `printingUndetermined`, not by confidence
(`content.js:1361`). On a fired scan the panel shows:

- `Match: Low` in the badge row
- the warning **above** the price — `confidenceWarnings` renders before
  `priceSectionHtml`, per the 2026-09-26 fix
- the alternate-printing banner **suppressed**
  (`ALT_PRINTING_ALLOWED_CONFIDENCE = ["High", "Medium"]`,
  `content.js:891`)
- **the wrong price still displayed** — on `930b7ccd` that means $4.83
  and its Bid figure stay on screen under the warning

That is the honest limit: this converts a silent confident-wrong answer
into a loud flagged-wrong answer, but it does not withhold.
**Withholding was deliberately NOT built** — it would mean setting
`pricingLookup: null` on mismatch, a bigger behavioral step that should
wait for a false-positive rate measured over a representative window
rather than this one dense session. No frontend file was touched;
`attackMismatch` is backend-only for now and the note rides in
`ambiguousNote`, which already renders.

### Stamp warning reworded (same change)

The old text made two claims that are both false: that our data source
"doesn't track pricing for stamped promos separately from the standard
printing" (it often does — a set-stamped EX card is carried as that
product's Reverse Holofoil printing; a Burger King / 30th Celebration
promo is a separate `tcgPlayerId` entirely), and that the price "likely
understates its real value", which has the **sign backwards** whenever
the stamp belongs to a cheaper printing. On this very scan it
**overstated by 5x** ($4.83 shown vs $0.96 real) — i.e. the only warning
on screen was pushing Eric toward bidding MORE on a wrong, cheaper card.
New wording is neutral and direction-free: the card appears to carry a
set stamp or logo, the printing may not be the one priced, verify before
relying on the price. The block lives in the `else` branch, so this
reaches **raw cards only** and cannot change any slab response.

### Open items from this work (none fixed here)

1. **The slab branch drops `ambiguousNote` and `attackMismatch`.** The
   `if (read.isSlab)` branch builds its result with explicit fields and
   copies `matchConfidence: baseLookup?.matchConfidence` but **not** the
   note — so a slab scan whose underlying lookup fires the rule would
   show **Match: Low with no explanation on screen**. This is a
   pre-existing hole (the slab branch already drops `ambiguousNote` for
   ties, weak-number and HP-conflict), slightly widened because `Low` now
   fires in a new situation. **Eric's call: leave it, track as an open
   item, do not touch the slab branch.** Slabs are Phase 2.
2. **Do NOT loosen the `set` substring test** to make `"Celebrations"`
   reach `"ME: 30th Celebration"`. Per the Burger King Chimchar
   precedent, that makes the wrong card win *harder* — and here the read
   set name is simply false, so it would not help anyway.
3. **Possible prompt note, watching, not built.** Both Gemini models
   agreeing on a fabricated number for a set that reuses classic artwork
   is a distinct pattern worth a prompt line (a set logo is not the set
   name; 2026 reprint sets reuse old art). One card, one session — not
   enough evidence to change the prompt. Worth watching as more 30th
   Celebration cards come through.
4. **The retrieval side is untouched.** `search="Pikachu"` at offset 0
   and 30 contains nothing from the 30th set — the Pikachu catalog crowds
   it out, the same class as the Southern Islands Mew entry. Nothing in
   this change addresses that.

### PPT credit note — a long stream can exhaust the daily allowance

Recording the pools for this measurement was **halted by its own
guardrail**: PPT daily-remaining had fallen to **8,592**, below the
10,000 floor Eric set. The cause was confirmed in Vercel logs before
being assumed — **90 PPT searches in the preceding 30 minutes**, roughly
**2,700 credits**, from Eric scanning live. This whole task spent **577
credits** against a 3,500 cap. Worth recording as a standing fact: the
**20,000/day allowance can be exhausted by a long live stream** at
roughly 60 credits per scan, and any offline analysis that replays real
pools competes directly with live scanning for both the daily allowance
and the 60-units/60-second minute limit.

---

## Related docs

- `whatnot-pokemon-extension-build-status.md` — architecture history and
  rationale for every backend decision.
- `../api/identify.js` — current backend source.

---

*Snapshot through test #51 (2026-08-29), migrated into the repo as
durable on-disk reference 2026-08-30. See CLAUDE.md at the repo root for
the current, condensed summary.*
