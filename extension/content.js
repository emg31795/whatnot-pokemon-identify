// content.js — Whatnot Pokémon Card ID (Free) extension
// Backed up 2026-08-24 from the extension zip the user still had locally
// (whatnot-pokemon-extension_14) after it was confirmed this was the only
// surviving copy of the frontend source. See
// whatnot-pokemon-extension-build-status.md for full context. This is the
// content script injected on whatnot.com/live/* pages — the draggable
// panel, frame capture, and result rendering all live here.

(function () {
  const CONDITION_ORDER = ["NM", "LP", "MP", "HP", "DMG"];

  const DEFAULT_BACKEND_URL = "https://whatnot-pokemon-identify.vercel.app/api/identify";

  async function getBackendUrl() {
    try {
      const { backendUrl } = await chrome.storage.sync.get("backendUrl");
      return backendUrl || DEFAULT_BACKEND_URL;
    } catch (e) {
      return DEFAULT_BACKEND_URL;
    }
  }

  let scanZone = null; // {x, y, w, h} as fractions of the video element, or null = full frame
  let selectingZone = false;

  const root = document.createElement("div");
  root.id = "wnpk-root";
  root.innerHTML = `
    <div id="wnpk-bar">
      <span id="wnpk-dot"></span>
      <span id="wnpk-title">Card ID (Free)</span>
      <button id="wnpk-close" title="Hide">×</button>
    </div>
    <div id="wnpk-controls">
      <button id="wnpk-zone-btn">Set Scan Area</button>
      <button id="wnpk-zone-clear" title="Clear scan area">Clear Area</button>
    </div>
    <div id="wnpk-body">
      <div id="wnpk-empty">Point the camera at a card, then hit Identify.</div>
    </div>
    <div id="wnpk-cost" title="Estimated Gemini API cost. Free APIs (pokemontcg.io) aren't metered so they're always $0 — PokemonPriceTracker is a flat $9.99/mo subscription, not billed per scan, so it isn't included here."></div>
    <button id="wnpk-identify-btn">Identify Card</button>
  `;
  document.documentElement.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  $("#wnpk-close").addEventListener("click", () => {
    root.style.display = "none";
  });
  $("#wnpk-zone-btn").addEventListener("click", startZoneSelection);
  $("#wnpk-zone-clear").addEventListener("click", () => {
    scanZone = null;
    setStatus("Scan area cleared — using full frame.");
  });
  $("#wnpk-identify-btn").addEventListener("click", identifyCard);

  // Added 2026-08-23 (user asked: "Can we make our tool movable? I don't
  // like where it sits on the page"). The panel was hardcoded to
  // bottom-right via CSS (`position: fixed; bottom: 16px; right: 16px`).
  // Made the title bar a drag handle: mousedown-and-drag anywhere on
  // #wnpk-bar except the close button repositions the whole panel via
  // inline left/top (which override the CSS bottom/right once set — see
  // dragTo()), clamped so it can never be dragged fully off-screen. The
  // chosen position is saved to chrome.storage.local and restored on the
  // next page load/reload, so it stays wherever the user last put it
  // instead of resetting to bottom-right every stream.
  initDraggable();

  function initDraggable() {
    const bar = $("#wnpk-bar");
    let dragging = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startLeft = 0;
    let startTop = 0;

    function clamp(left, top) {
      const rect = root.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      return {
        left: Math.min(Math.max(left, 0), maxLeft),
        top: Math.min(Math.max(top, 0), maxTop),
      };
    }

    function dragTo(left, top) {
      const pos = clamp(left, top);
      root.style.left = pos.left + "px";
      root.style.top = pos.top + "px";
      // Once left/top are set, they take precedence over the CSS
      // bottom/right defaults for a `position: fixed` element — clear
      // those explicitly so resizing the window doesn't cause the panel
      // to be governed by two conflicting anchors at once.
      root.style.right = "auto";
      root.style.bottom = "auto";
    }

    bar.addEventListener("mousedown", (e) => {
      if (e.target.closest("#wnpk-close")) return; // don't start a drag from the × button
      dragging = true;
      const rect = root.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      bar.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      dragTo(startLeft + (e.clientX - startMouseX), startTop + (e.clientY - startMouseY));
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      bar.style.cursor = "grab";
      const rect = root.getBoundingClientRect();
      try {
        chrome.storage.local.set({ wnpkPanelPos: { left: rect.left, top: rect.top } });
      } catch (e) {
        // storage unavailable (rare) — position just won't persist across reloads
      }
    });

    // Restore the last-saved position, clamped to the current viewport in
    // case the window was resized/moved (or a different display) since it
    // was last saved.
    try {
      chrome.storage.local.get("wnpkPanelPos", ({ wnpkPanelPos }) => {
        if (wnpkPanelPos && typeof wnpkPanelPos.left === "number" && typeof wnpkPanelPos.top === "number") {
          dragTo(wnpkPanelPos.left, wnpkPanelPos.top);
        }
      });
    } catch (e) {
      // storage unavailable — panel just stays at its CSS default (bottom-right)
    }
  }

  // Added 2026-08-23 (user asked: "How can we track our $ expenditure
  // easily... so I know where I stand with each scan"). Gemini is the only
  // per-request-metered cost in this pipeline — pokemontcg.io is free, and
  // PokemonPriceTracker is a flat $9.99/mo subscription rather than
  // per-call billing, so it can't be broken out per scan the same way (see
  // the #wnpk-cost tooltip and the build-status doc for the full picture).
  // The backend now returns `usage.estCostUsd` (computed from Gemini's own
  // token-usage metadata) on every response, found-or-not — a "not found"
  // scan still burned one Gemini call, so it still counts. Runs entirely
  // client-side against chrome.storage.local; no new backend state needed.
  // #wnpk-cost is a sibling of #wnpk-body (like the bar/controls/button),
  // so it survives every innerHTML swap and never needs to be threaded
  // through renderResult's several branches.
  function formatUsd(n) {
    if (n < 0.01) return "$" + n.toFixed(4);
    return "$" + n.toFixed(2);
  }

  function recordScanCost(usage) {
    const costEl = $("#wnpk-cost");
    if (!usage || usage.estCostUsd == null) return;
    const scanCost = usage.estCostUsd;
    try {
      chrome.storage.local.get("wnpkCostTotal", ({ wnpkCostTotal }) => {
        const total = (wnpkCostTotal || 0) + scanCost;
        chrome.storage.local.set({ wnpkCostTotal: total });
        costEl.textContent = `This scan: ${formatUsd(scanCost)} · Total: ${formatUsd(total)}`;
      });
    } catch (e) {
      costEl.textContent = `This scan: ${formatUsd(scanCost)}`;
    }
  }

  // Show the running total (without a per-scan figure yet) as soon as the
  // panel loads, so it's visible before the first scan of the session too.
  try {
    chrome.storage.local.get("wnpkCostTotal", ({ wnpkCostTotal }) => {
      if (wnpkCostTotal) {
        $("#wnpk-cost").textContent = `Total so far: ${formatUsd(wnpkCostTotal)}`;
      }
    });
  } catch (e) {}

  function setStatus(text) {
    $("#wnpk-body").innerHTML = `<div id="wnpk-empty">${escapeHtml(text)}</div>`;
  }

  function findVideo() {
    // Whatnot's live player is a <video> element in the main stream area.
    const videos = Array.from(document.querySelectorAll("video"));
    // Pick the largest visible video on screen — avoids grabbing small
    // thumbnail/preview videos elsewhere on the page.
    let best = null;
    let bestArea = 0;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 100 && r.height > 100) {
        best = v;
        bestArea = area;
      }
    }
    return best;
  }

  function startZoneSelection() {
    const video = findVideo();
    if (!video) {
      setStatus("Couldn't find the stream video — is a stream playing?");
      return;
    }
    selectingZone = true;
    const rect = video.getBoundingClientRect();

    const overlay = document.createElement("div");
    overlay.id = "wnpk-zone-overlay";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    document.documentElement.appendChild(overlay);

    const box = document.createElement("div");
    box.id = "wnpk-zone-box";
    overlay.appendChild(box);

    let startX, startY, dragging = false;

    overlay.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      box.style.left = startX + "px";
      box.style.top = startY + "px";
      box.style.width = "0px";
      box.style.height = "0px";
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      box.style.left = Math.min(startX, curX) + "px";
      box.style.top = Math.min(startY, curY) + "px";
      box.style.width = Math.abs(curX - startX) + "px";
      box.style.height = Math.abs(curY - startY) + "px";
    });
    overlay.addEventListener("mouseup", (e) => {
      dragging = false;
      const bx = parseFloat(box.style.left);
      const by = parseFloat(box.style.top);
      const bw = parseFloat(box.style.width);
      const bh = parseFloat(box.style.height);
      if (bw > 10 && bh > 10) {
        scanZone = {
          x: bx / rect.width,
          y: by / rect.height,
          w: bw / rect.width,
          h: bh / rect.height,
        };
        setStatus("Scan area set. Hit Identify when a card is in that box.");
      }
      overlay.remove();
      selectingZone = false;
    });
  }

  // Cap the longer edge of the captured frame — past this, extra pixels
  // mostly just add upload time (bigger base64 payload) without helping
  // Gemini read the handful of short text fields we actually need (name,
  // number, HP, grade label). Speed matters a lot here (auctions can be
  // ~10s), so this trades a little headroom on tiny print for a smaller,
  // faster upload.
  // Bumped 1024 -> 1280 (2026-08-23, accuracy pass): user reported
  // recurring "Match: Medium" results even on cards that were later
  // confirmed correct — root cause is that Medium is what you get when the
  // collector number and/or HP (the two strongest disambiguating signals,
  // see the prompt) simply weren't legible at 1024px, not that the match
  // itself was wrong. Card numbers in particular are tiny printed text
  // along the bottom edge — easy to lose at low resolution. This is a
  // one-line, no-extra-round-trip change (same single request, just a
  // modestly bigger payload), so it buys more legible source text without
  // adding a second network hop or a second Gemini call — the two things
  // that would actually cost real time against the ~10s auction window.
  const MAX_CAPTURE_DIMENSION = 1280;

  function captureFrame() {
    const video = findVideo();
    if (!video) return null;

    const canvas = document.createElement("canvas");
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

    if (scanZone) {
      sx = scanZone.x * video.videoWidth;
      sy = scanZone.y * video.videoHeight;
      sw = scanZone.w * video.videoWidth;
      sh = scanZone.h * video.videoHeight;
    }

    let outW = sw, outH = sh;
    const longEdge = Math.max(outW, outH);
    if (longEdge > MAX_CAPTURE_DIMENSION) {
      const scale = MAX_CAPTURE_DIMENSION / longEdge;
      outW = Math.round(outW * scale);
      outH = Math.round(outH * scale);
    }

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);

    // Still a fairly high JPEG quality — small printed text (number, HP,
    // grade label) still needs to stay legible even after the resize above.
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  }

  // Primary path: fetch directly from the content script. This is the most
  // reliable option — it doesn't depend on the MV3 background service
  // worker being awake, which turned out to be a real problem: Chrome puts
  // that worker to sleep after ~30s idle, and waking it to handle a single
  // message was occasionally flaky enough that the request never actually
  // left the browser at all (confirmed via the backend's own request logs
  // showing nothing arrived during a "stuck" test). Falls back to routing
  // through background.js only if this direct fetch itself throws (e.g. if
  // Whatnot's page CSP ever blocks it) — that path still has its own
  // timeout as a second line of defense.
  async function identifyDirect(imageBase64, timeoutMs) {
    const url = await getBackendUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, game: "pokemon" }),
        signal: controller.signal,
      });
      const json = await resp.json();
      return { ok: resp.ok, data: json };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function identifyViaBackground(imageBase64, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const localTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: "Timed out — took too long. Try again." });
      }, timeoutMs);

      chrome.runtime.sendMessage({ type: "IDENTIFY_CARD", imageBase64 }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(localTimeout);
        resolve(response || { ok: false, error: "No response from background worker." });
      });
    });
  }

  async function identifyCard() {
    const imageBase64 = captureFrame();
    if (!imageBase64) {
      setStatus("Couldn't find the stream video — is a stream playing?");
      return;
    }

    setStatus("Identifying card…");
    console.log("[wnpk] starting identify, image bytes:", imageBase64.length);

    // 14s here — the backend's own worst-case internal budget is up to
    // ~13s (Gemini 6.5s + card DB 3.5s + one 1.5s retry on a pokemontcg.io
    // 5xx + graded-price lookup 1.5s on the slab path; the 5xx retry was
    // added 2026-08-23 after real logs caught pokemontcg.io returning a
    // 502 then a 500 back-to-back on a live scan), so this needs a little
    // headroom above that or we'd cut off a request that was about to
    // succeed.
    let response;
    try {
      response = await identifyDirect(imageBase64, 14000);
      console.log("[wnpk] direct fetch succeeded");
    } catch (err) {
      // BUG FOUND + FIXED (2026-08-23, full-project audit): this used to
      // fall back to identifyViaBackground unconditionally on ANY error from
      // the direct fetch, including a genuine timeout (AbortError). But a
      // timeout here means the full 14s budget was already spent — and that
      // budget was deliberately sized to cover the backend's own worst-case
      // internal work (see above), so a timeout means the backend really is
      // being that slow right now, not that something about the direct path
      // itself is broken. Retrying the exact same request through
      // background.js (which hits the same backend, with its own separate
      // 14s timeout) doesn't fix a slow backend — it just waits ANOTHER up
      // to 14s on top, pushing worst-case latency to ~28s. That's nearly 3x
      // Whatnot's ~10s auction window, guaranteeing the result arrives too
      // late to be useful even if it eventually succeeds. The background
      // fallback is genuinely useful for the case the original comment
      // describes (page CSP blocking the direct fetch) — that fails FAST
      // (immediately, not after 14s), so it's cheap to retry. Only skip the
      // fallback when the failure was specifically a timeout.
      if (err && err.name === "AbortError") {
        console.warn("[wnpk] direct fetch timed out after 14s — not retrying via background worker (would exceed the auction window)");
        setStatus("Timed out — took too long. Try again.");
        return;
      }
      console.warn("[wnpk] direct fetch failed (not a timeout), falling back to background worker:", err);
      response = await identifyViaBackground(imageBase64, 14000);
    }

    if (!response || !response.ok) {
      const detail =
        (response && response.error) ||
        (response && response.data && (response.data.detail || response.data.error)) ||
        "";
      setStatus("Couldn't identify — " + (detail || "unknown error") + " Try again.");
      return;
    }
    recordScanCost(response.data.usage);
    renderResult(response.data);
  }

  function renderResult(data) {
    if (!data.found) {
      // ADDED (2026-09-03, Haiku active-fallback build): when Gemini's call
      // itself failed AND the Haiku fallback also couldn't identify a card
      // (see api/identify.js's `haikuFallbackError` field), say so honestly
      // instead of the generic message — both providers were tried, not
      // just one.
      const msg = data.haikuFallbackError
        ? "Couldn't identify — both the primary and fallback AI failed to read this card. Try again."
        : data.reason || "Couldn't identify the card. Try again when it's clearly visible.";
      setStatus(msg);
      return;
    }

    const header = `
      ${
        // ADDED (2026-09-03, Haiku active-fallback build): Gemini failed on
        // this scan (timeout, 5xx, etc.) and Claude Haiku 4.5's read was
        // used instead — this must always be visible, never a silent
        // substitution, so the user can judge the result accordingly (see
        // CLAUDE.md's "Recent / in-flight work" for why this exists).
        data.visionProvider === "haiku-fallback"
          ? `<div class="wnpk-fallback-badge">⚡ Fallback read (Gemini unavailable) — identified by Claude Haiku 4.5</div>`
          : ""
      }
      <div class="wnpk-card-name">${escapeHtml(data.cardName)}${
        data.cardLanguage === "Japanese" ? ' <span class="wnpk-lang-badge">JP</span>' : ""
      }</div>
      <div class="wnpk-set-name">${escapeHtml(data.setName || "")}</div>
      ${
        data.cardImageUrl
          ? `<img class="wnpk-card-img" src="${data.cardImageUrl}" />`
          : ""
      }
      <div class="wnpk-confidence-row">
        <span>Read: ${escapeHtml(data.confidence || "—")}</span>
        <span>Match: ${escapeHtml(data.matchConfidence || "—")}</span>
      </div>
      ${
        data.printEdition
          ? `<div class="wnpk-lang-badge" id="wnpk-edition-badge" style="margin-bottom:6px;">${escapeHtml(
              data.printEdition
            )}</div>`
          : ""
      }
      ${
        data.stampType && data.stampType !== "1st Edition"
          ? `<div class="wnpk-lang-badge" style="margin-bottom:6px;">${escapeHtml(data.stampType)} stamp</div>`
          : ""
      }
      ${
        data.matchConfidence === "Low" && !data.ambiguousNote
          ? `<div class="wnpk-warning">⚠ Low-confidence match — verify this is really the right card before relying on the price.</div>`
          : ""
      }
      ${
        data.ambiguousNote
          ? `<div class="wnpk-warning">⚠ ${escapeHtml(data.ambiguousNote)}</div>`
          : ""
      }
      ${
        data.stampNote
          ? `<div class="wnpk-warning">⚠ ${escapeHtml(data.stampNote)}</div>`
          : ""
      }
      ${
        data.noPriceNote
          ? `<div class="wnpk-warning">⚠ ${escapeHtml(data.noPriceNote)}</div>`
          : ""
      }
      ${
        // FIX (2026-08-30, user report — Ditto 18/62 Fossil, LP shown
        // $13.45 vs. real TCGplayer LP $6.84): pricing now comes straight
        // from TCGplayer's real per-condition data instead of PPT's own
        // (sometimes incomplete) breakdown, and per explicit user
        // instruction, a failure to pull genuine live numbers now surfaces
        // here loudly instead of falling back to a guessed price. This is
        // deliberately styled/worded to stand out from the softer
        // ambiguous-match/stamp warnings above — it means NO price is
        // being shown, not "the price might be off."
        data.pricingError
          ? `<div class="wnpk-warning wnpk-price-error">🛑 NO LIVE PRICE: ${escapeHtml(data.pricingError)}</div>`
          : ""
      }
    `;

    // Prefer the exact TCGPlayer product page for the matched printing
    // (pokemontcg.io hands this back directly) over a bare name search,
    // which just dumps every printing of every card with that name and
    // makes the user re-find the one we already matched. Only the
    // English/pokemontcg.io path has this; Japanese cards (PokemonPriceTracker)
    // fall back to the name search since there's no direct product link.
    // BUG FOUND + FIXED (2026-08-23): for the Japanese/PokemonPriceTracker
    // path, data.cardName comes straight from PPT's own `name` field, which
    // bakes the collector number into the string itself (e.g.
    // "Skuntank V - 106/098" — see normalizePptCard in identify.js). That's
    // great for the on-screen title, but plugging it verbatim into
    // TCGPlayer's search box breaks the search: TCGPlayer doesn't parse the
    // trailing "- 106/098" as part of a fuzzy name match, and a live test
    // showed it silently falling back to unrelated products (a "Kyurem V")
    // instead of anything Skuntank-related. Strip the "- number/total"
    // suffix before building the query so we search on just the card name.
    const tcgSearchName = data.cardName.replace(/\s*-\s*\S+\/\S+\s*$/, "").trim();
    const tcgLinkHref = data.tcgplayerUrl || `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(tcgSearchName)}`;
    const tcgLinkLabel = data.tcgplayerUrl ? "View on TCGPlayer" : "Search on TCGPlayer";
    const footer = `
      <a class="wnpk-link" target="_blank" rel="noopener"
         href="${tcgLinkHref}">${tcgLinkLabel}</a>
    `;

    // Graded slab with a real graded-market price found.
    if (data.isSlab && data.gradedPrice != null) {
      const nearbyRows = (data.nearbyGradedPrices || [])
        .map(
          (n) =>
            `<div class="wnpk-cond-row"><span>${escapeHtml(n.label)}</span><span>$${n.price.toFixed(
              2
            )}</span></div>`
        )
        .join("");

      $("#wnpk-body").innerHTML = `
        ${header}
        <div class="wnpk-slab-badge">${escapeHtml(data.grader)} ${escapeHtml(data.grade)}${
        data.certNumber ? " · Cert " + escapeHtml(data.certNumber) : ""
      }</div>
        <div class="wnpk-market-price">
          Graded value: ${"$" + data.gradedPrice.toFixed(2)}
        </div>
        <div class="wnpk-cond-label">
          FROM EBAY SOLD COMPS ${nearbyRows ? "<span class=\"wnpk-estimate-note\">(nearby grades)</span>" : ""}
        </div>
        ${nearbyRows ? `<div class="wnpk-cond-list">${nearbyRows}</div>` : ""}
        ${footer}
      `;
      return;
    }

    // FIX (2026-08-30, user report — Ditto 18/62 Fossil, LP shown $13.45
    // vs. real TCGplayer LP $6.84): pricing no longer comes from PPT's own
    // data (or a synthetic multiplier fallback) at all — the backend now
    // fetches real per-condition, per-printing prices straight from
    // TCGplayer's own price-history endpoint for the matched card (see the
    // "Live TCGplayer per-condition pricing" section in identify.js). Per
    // explicit user instruction, there is no more "some tiers are
    // estimated" partial state: either every condition in the table is
    // genuine live TCGplayer data, or the backend throws and this whole
    // card shows the loud `pricingError` banner above instead of any
    // price. `estimatedMap` is kept only for shape compatibility with the
    // backend response (always all-false when prices are present) — no
    // "*" marking is needed anymore since nothing shown is ever a guess.
    function conditionRowsHtml(conditions) {
      return CONDITION_ORDER.map((tier) => {
        const price = conditions ? conditions[tier] : null;
        return `<div class="wnpk-cond-row"><span>${tier}</span><span>${
          price != null ? "$" + price.toFixed(2) : "—"
        }</span></div>`;
      }).join("");
    }

    // CHANGED (2026-08-29, user report — Hitmontop/Cinccino/Snorlax
    // Japanese promos all showing zero prices even though real TCGplayer
    // listings existed for some conditions): the backend no longer
    // requires all 5 conditions to have real data before showing any of
    // them (see buildLivePriceVariantsFromTCGPlayer) — it now shows
    // whichever tiers TCGplayer has genuine live data for, dashing out
    // the rest, and only sends `pricingError` when NONE of the 5 tiers
    // have any real data at all. `partial` (from the backend's
    // `conditionPricesPartial` / a variant's own `partial` field) says
    // whether this printing's table has real numbers for every tier or
    // just some — every number shown is still always genuine, never a
    // guess, in both cases.
    function conditionLabelNote(estimatedMap, partial) {
      if (!estimatedMap) return "(no live data)";
      return partial
        ? "(real-time data from TCGplayer — some conditions have no market data yet)"
        : "(real-time data from TCGplayer)";
    }

    // Detected as a slab, but no graded-price data available (API key not
    // set up yet, or that exact grade wasn't found) — say so plainly rather
    // than silently showing a misleading raw-card price.
    if (data.isSlab && data.gradedPriceUnavailable) {
      $("#wnpk-body").innerHTML = `
        ${header}
        <div class="wnpk-warning">⚠ This looks like a graded slab${
          data.grader ? " (" + escapeHtml(data.grader) + (data.grade ? " " + escapeHtml(data.grade) : "") + ")" : ""
        }, but graded-market pricing isn't set up yet (or that exact grade wasn't found). Showing the raw-card estimate below, which will UNDER-value a graded slab — do not rely on it for grading premiums.</div>
        <div class="wnpk-market-price">
          Raw market: ${data.marketPrice != null ? "$" + data.marketPrice.toFixed(2) : "—"}
        </div>
        <div class="wnpk-cond-label">
          RAW CONDITION PRICES <span class="wnpk-estimate-note">${conditionLabelNote(data.conditionPricesEstimated, data.conditionPricesPartial)} — not graded value</span>
        </div>
        <div class="wnpk-cond-list">${conditionRowsHtml(data.conditionPrices)}</div>
        ${footer}
      `;
      return;
    }

    // Plain raw card — original condition-table view, now with a manual
    // print-variant picker instead of trusting a single AI-guessed
    // edition/finish. Gemini's stampType read (1st Edition, etc.) is only
    // used to pick the DEFAULT selection — vintage-card stamps in
    // particular are easy for a vision model to misread or miss from a
    // video frame, so the user can just switch the dropdown to whatever
    // matches what they're actually holding, no rescan needed.
    const variantPicker = data.priceVariants
      ? `
        <div class="wnpk-cond-label">PRINT VARIANT <span class="wnpk-estimate-note">(AI's best guess — switch if it looks wrong)</span></div>
        <select id="wnpk-variant-select" class="wnpk-variant-select">${Object.entries(data.priceVariants)
          .map(
            ([key, v]) =>
              `<option value="${escapeHtml(key)}"${key === data.priceVariantUsed ? " selected" : ""}>${escapeHtml(
                v.label
              )}${key === data.priceVariantUsed ? " (detected)" : ""}</option>`
          )
          .join("")}</select>
      `
      : "";

    // The market-price line spells out the edition/finish inline (not just
    // in the badge above) so there is never a moment where the price on
    // screen and the label describing it can visually separate and go out
    // of sync — this was the exact bug a user hit (badge said "Unlimited",
    // but the price shown was actually the 1st Edition figure). Both the
    // badge and this line are driven from the SAME variant object below, on
    // both initial render and every dropdown change, so they can't disagree.
    const marketPriceLine = (variant) =>
      `Market${variant && variant.label ? " (" + escapeHtml(variant.label) + ")" : ""}: ${
        variant && variant.basePrice != null ? "$" + variant.basePrice.toFixed(2) : "—"
      }`;

    const initialVariant = data.priceVariants ? data.priceVariants[data.priceVariantUsed] : null;
    const initialEstimatedMap = initialVariant ? initialVariant.estimated : data.conditionPricesEstimated;
    const initialPartial = initialVariant ? initialVariant.partial : data.conditionPricesPartial;

    $("#wnpk-body").innerHTML = `
      ${header}
      <div class="wnpk-market-price" id="wnpk-market-price">
        ${initialVariant ? marketPriceLine(initialVariant) : marketPriceLine({ basePrice: data.marketPrice })}
      </div>
      ${variantPicker}
      <div class="wnpk-cond-label" id="wnpk-cond-label">
        CONDITION PRICES <span class="wnpk-estimate-note" id="wnpk-cond-note">${conditionLabelNote(initialEstimatedMap, initialPartial)}</span>
      </div>
      <div class="wnpk-cond-list" id="wnpk-cond-list">${conditionRowsHtml(data.conditionPrices)}</div>
      ${footer}
    `;

    if (data.priceVariants) {
      const select = $("#wnpk-variant-select");
      select.addEventListener("change", () => {
        const variant = data.priceVariants[select.value];
        if (!variant) return;
        $("#wnpk-market-price").textContent = marketPriceLine(variant);
        $("#wnpk-cond-list").innerHTML = conditionRowsHtml(variant.conditions);
        $("#wnpk-cond-note").textContent = conditionLabelNote(variant.estimated, variant.partial);
        const badge = $("#wnpk-edition-badge");
        if (badge && variant.printEdition) badge.textContent = variant.printEdition;
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
})();
