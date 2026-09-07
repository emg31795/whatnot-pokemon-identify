// Background service worker: does the actual cross-origin fetch to our
// backend (content scripts run in a context subject to the page's CSP,
// which can block or complicate third-party fetches — this mirrors how
// Pallet itself routes its identify call through the background worker).

const DEFAULT_BACKEND_URL = "https://whatnot-pokemon-identify.vercel.app/api/identify";

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.sync.get("backendUrl");
  return backendUrl || DEFAULT_BACKEND_URL;
}

// Hard cap on how long we'll wait — auctions can be as short as ~10s, so
// hanging indefinitely (e.g. a dropped connection, or the service worker's
// own lifetime running out mid-request) is worse than failing fast with a
// clear "try again" message. This also protects against the request just
// silently vanishing with no feedback, which is what happened before this
// was added.
// Raised from 13000 to 14000 (2026-08-23) to stay above the backend's own
// worst-case internal budget (~13s) after adding a one-time retry on a
// pokemontcg.io 5xx — see content.js for the matching value and full
// explanation.
const REQUEST_TIMEOUT_MS = 14000;

function isWhatnotLivePage(url) {
  return !!url && /^https:\/\/[^/]*\.whatnot\.com\/live\//.test(url);
}

// ADDED 2026-09-07 (toolbar-icon UX fix): the icon used to always open
// popup.html (Settings) via manifest.json's `action.default_popup` — Chrome
// makes that and `action.onClicked` mutually exclusive, so with the popup
// removed from the manifest, a click now toggles the on-page panel instead.
// A tab that was already open before this extension was installed/reloaded
// never gets content.js auto-injected (content_scripts only fire on future
// navigations), so a plain sendMessage would silently fail there — ping
// first, and only fall back to on-demand injection when that ping fails.
// This is also what removes the old "refresh the page" requirement.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isWhatnotLivePage(tab.url)) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch (err) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
    } catch (injectErr) {
      console.warn("[wnpk] couldn't toggle Card ID panel:", injectErr);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "IDENTIFY_CARD") return;

  (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = await getBackendUrl();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: message.imageBase64,
          game: "pokemon",
        }),
        signal: controller.signal,
      });
      const json = await resp.json();
      sendResponse({ ok: resp.ok, data: json });
    } catch (err) {
      if (err.name === "AbortError") {
        sendResponse({ ok: false, error: "Timed out — took too long. Try again." });
      } else {
        sendResponse({ ok: false, error: String(err) });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  return true; // keep the message channel open for the async response
});
