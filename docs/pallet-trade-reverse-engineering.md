# Pallet.trade Reverse-Engineering Findings

*Captured 2026-08-23. Goal: build a free Chrome extension that replicates Pallet's "identify the Pokémon card on a Whatnot stream + show TCGPlayer condition pricing" feature. Pallet charges $9.99/mo for unlimited scans.*

## How Pallet actually works

Confirmed by inspecting the extension's background service worker Network tab live (DevTools → `chrome://extensions` → PalletTrade → "Inspect views: service worker") while triggering real scans on live Whatnot streams.

**It is NOT reading the seller's listing text.** It's a frame-capture + backend image-identification pipeline:

1. Content script injects plain (non-shadow-DOM) UI directly into the Whatnot page: `#pallet-root`, `#pallet-identify-btn`, `#pallet-zone-btn`, `#pallet-zone-clear`, etc.
2. On "Identify Card" click, it captures the current video frame as a JPEG (client-side canvas capture), base64-encodes it (~85KB typical size), and sends it via the background service worker (not the content script — this is why page-level network monitoring never showed the call) to:

```
POST https://pallet.trade/api/extension/whatnot-identify
```

**Request payload:**
```json
{
  "durationMs": 21,
  "game": "pokemon",
  "imageBase64": "<JPEG base64, ~85KB>",
  "token": "<32-hex-char per-install/device token, not per-card>"
}
```
Note the `"game": "pokemon"` field — the same endpoint/extension presumably supports other TCGs (sports cards, Magic, etc.) via this parameter.

**Response (successful identification):**
```json
{
  "found": true,
  "marketPosition": null,
  "proLocked": false,
  "proBand": null,
  "marketPrice": 1.46,
  "savingsPercent": null,
  "cardId": "swsh12pt5-99",
  "grader": null,
  "grade": null,
  "certNumber": null,
  "isSlab": false,
  "variant": null,
  "cardName": "Zamazenta VSTAR",
  "setName": "Crown Zenith",
  "printedNumber": "099/159",
  "cardImageUrl": "https://images.scrydex.com/pokemon/swsh12pt5-99/medium",
  "condition": null,
  "japanese": false,
  "confidence": "Medium",
  "recentSales": [],
  "priceHistory": [ { "date": "2026-05-26", "...": "..." }, ... ]
}
```

**Failure response example:** `Couldn't identify the card. (number_mismatch)` — a structured error code, not a vague failure. This confirms the backend extracts structured fields (card name + set/number) from the image and validates them against a card database; when the extracted number doesn't match the extracted name, it returns this specific error rather than guessing.

Also observed: `Couldn't identify the card. Try again when it's clearly visible.` when no card was in frame at all.

## Key architectural takeaways

1. **Identification happens server-side**, not in the extension. The extension is a thin client: capture frame → POST image → render whatever comes back. All the actual "vision" work (and any proprietary model) lives behind `pallet.trade`'s API, which we can't see into further than "it returns a confidence level and can be wrong."
2. **`confidence: "Medium"` and observed misidentifications** (e.g. calling a Dragapult VMAX "Eternatus VMAX" in an earlier test) confirm this is a probabilistic vision pipeline, not a deterministic lookup. Any clone will have the same class of failure mode — this is expected and normal, not a sign we're doing something wrong.
3. **Card database + pricing is not homegrown — it's `images.scrydex.com`.** Scrydex is a paid trading-card data/pricing API. The card ID format returned (`swsh12pt5-99`, i.e. `<setId>-<number>`) is the exact ID scheme used by **pokemontcg.io**, a free public Pokémon TCG database that already ships daily-synced TCGPlayer market pricing by condition/variant. This is very likely where a meaningful chunk of Pallet's $9.99/mo subscription cost goes, and it's the piece we can most directly replace for free.
4. Only Whatnot's own telemetry (Datadog RUM/replay, Agora video stats) showed up in page-level network monitoring — the actual Pallet API call was invisible there, which is why the service-worker DevTools inspection (rather than the page Network tab) was necessary to find it.
5. Response fields like `proLocked`, `proBand`, `marketPosition`, `savingsPercent`, `recentSales` suggest paid-tier-gated data (deal-scoring / "is this listing underpriced" features) layered on top of the base identify+price flow — not required for a v1 clone.

## Recommended free-clone architecture (as originally scoped — superseded in practice, see CLAUDE.md)

| Piece | Pallet's approach | Free equivalent |
|---|---|---|
| Frame capture | Client-side canvas capture of video element | Same — trivial to replicate in a content script |
| Card identification | Their own backend, likely calling a vision-capable model | Send the captured frame to a free-tier vision API (Google Gemini) and prompt it to return structured fields: card name, set name, printed number, confidence |
| Card database + condition pricing | Scrydex (paid) | Originally planned as pokemontcg.io (free), but that API was folded into paid-only Scrydex — actual build uses PokemonPriceTracker ($9.99/mo, one paid dependency remains) for card ID/pricing, plus TCGplayer's own public price-history endpoint for real per-condition pricing (see CLAUDE.md) |
| Hosting for the backend (needed either way, since API keys can't live in a public extension) | Their own servers | A small serverless function (Vercel free tier) that proxies: receive image → call Gemini → call PPT/TCGplayer → return combined JSON |
| Auth/rate limiting | Per-install token | Not strictly needed for personal use |

## Open questions from the original research (mostly resolved in practice — see CLAUDE.md and docs/test-cases.md)

- Exact Gemini free-tier request caps — using a paid Gemini key now, cost tracked per-scan in the extension UI.
- Whether pokemontcg.io's data lags Scrydex — moot, pokemontcg.io is no longer used (folded into paid Scrydex, see build-status part 3).
- Whether to support graded slabs — yes, shipped (isSlab/grader/grade/certNumber detection + PPT eBay-comp lookup).

---

*Captured 2026-08-23, migrated into the repo as durable on-disk reference
2026-08-30. See CLAUDE.md at the repo root for the current, as-built
architecture.*
