// api/flag.js
//
// ADDED 2026-09-04 — "flag this scan" feature (see CLAUDE.md's "Current
// priority"/build notes). Lets the extension mark a specific /api/identify
// response as a bad scan with one click, so debugging no longer depends on
// screenshots or timestamp/card-name guessing through Vercel logs (see the
// Wailord/Dragalge mix-up, test #70, where a screenshot with no identifying
// info led to investigating the wrong scan entirely).
//
// This handler does nothing but log — no database, no persistent storage,
// per explicit scope. A flagged scan is found later the same way every
// other investigation in this project already works: grep Vercel runtime
// logs for `[user-flagged] requestId=<id>` and join it against that same
// request's `[identify]`/`[lookup]` lines in api/identify.js, which carry
// the identical requestId.
//
// Deliberately independent of api/identify.js: the extension calls this
// fire-and-forget, after it has already rendered the identify result, so a
// slow or failed flag request can never affect the identify path's own
// response or latency.

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { requestId, data } = req.body || {};
  if (!requestId) {
    res.status(400).json({ error: "Missing requestId" });
    return;
  }

  // Single-line, unmistakably greppable format — JSON.stringify keeps
  // `data` on one line so it survives Vercel's line-based log viewer intact
  // and a grep for "[user-flagged]" reliably captures the whole record.
  // Clicking flag twice on the same result just logs twice; that's fine
  // (no dedup needed — see CLAUDE.md's verification checklist for this
  // feature).
  console.log(`[user-flagged] requestId=${requestId} data=${JSON.stringify(data)}`);

  res.status(200).json({ ok: true });
};
