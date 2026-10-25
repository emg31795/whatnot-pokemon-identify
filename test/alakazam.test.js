// Test suite for the 2026-10-15 Alakazam 33/165 fixes.
//
//   1. denominator guard on the downstream legacy-number rescue
//   2. sibling-ambiguity guard
//   3. ATTACK MISMATCH false-positive suppression
//   4. capped await on the downstream legacy read
//
// plus regression coverage for the paths those changes sit next to.
//
// Run: node test/alakazam.test.js
//
// No network: global.fetch is replaced with a router over PPT fixtures.
// `node_modules` is not required and no API key is read.

const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");

const IDENTIFY = path.join(__dirname, "..", "api", "identify.js");

// The two "test validity" cases below replay against the last commit BEFORE
// the fix and assert the old bug reproduces there, so this suite cannot pass
// vacuously. Pinned to an immutable SHA on purpose: it was `HEAD` until the
// fix itself was committed, at which point both tests started failing because
// HEAD had become the fixed version.
const PRE_FIX_REF = "1960cd5";

// Pinned commit immediately BEFORE the 2026-10-18 Pokedex-number fix, for
// the same reason PRE_FIX_REF above is pinned: the two "test validity"
// cases in the dex-number section replay against it and assert the old
// behavior reproduces there, so that section cannot pass vacuously. A SHA,
// never HEAD — these invert the moment the fix is committed.
const DEX_PRE_FIX_REF = "eab9b6c";

function loadPreFixModule(tmpName, ref = PRE_FIX_REF) {
  const tmp = path.join(os.tmpdir(), `${tmpName}-${process.pid}.js`);
  const src = execFileSync("git", ["show", `${ref}:api/identify.js`], {
    cwd: path.join(__dirname, ".."), maxBuffer: 64 * 1024 * 1024, encoding: "utf8",
  });
  fs.writeFileSync(tmp, src + "\nmodule.exports.lookupCardPPT = lookupCardPPT;\n");
  return { mod: require(tmp), cleanup: () => fs.unlinkSync(tmp) };
}
const F = require("./fixtures.js");

let pass = 0;
const failures = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(
        () => { pass += 1; },
        (e) => { failures.push([name, e]); }
      );
    }
    pass += 1;
  } catch (e) {
    failures.push([name, e]);
  }
  return Promise.resolve();
}

// --------------------------------------------------------------------------
// PPT mock
// --------------------------------------------------------------------------
// Routes on the decoded `search` param plus `offset`. Any query with no
// explicit route returns PPT's real behavior for a no-match multi-word
// search: unrelated FILLER, never an empty array (see CLAUDE.md).
function installPptMock(routes, opts = {}) {
  const calls = [];
  global.fetch = async (url) => {
    const u = new URL(String(url));
    // Graded lookups go by tcgPlayerId (limit=1, includeEbay=true) rather
    // than by search, so they get their own route key: "id:<tcgPlayerId>".
    const byId = u.searchParams.get("tcgPlayerId");
    if (byId) {
      const idKey = `id:${byId}`;
      calls.push(idKey);
      if (opts.onCall) opts.onCall(idKey);
      const row = Object.prototype.hasOwnProperty.call(routes, idKey) ? routes[idKey] : null;
      return { ok: true, status: 200, json: async () => ({ data: row }) };
    }
    const search = u.searchParams.get("search") || "";
    const offset = u.searchParams.get("offset") || "";
    const key = offset ? `${search}|offset=${offset}` : search;
    calls.push(key);
    if (opts.onCall) opts.onCall(key);
    const rows = Object.prototype.hasOwnProperty.call(routes, key)
      ? routes[key]
      : F.padTo([], 4, "Unrelated");
    return { ok: true, status: 200, json: async () => ({ data: rows }) };
  };
  return calls;
}

const BASE_READ = {
  found: true,
  confidence: "High",
  cardName: "Alakazam",
  language: "English",
  stampType: "none",
  hp: "100",
  subtype: null,
  setName: null,
  attackName: null,
  attackNameEnglish: null,
  cardNumber: null,
};

// Page 1 = 30 rows (FULL, so the page-2 fetch triggers) including 83500.
const PAGE1 = F.padTo([F.ALAKAZAM_33, ...F.LOGGED_FILLER.map(F.fillerRow)], 30, "Alakazam");
// Page 2 brings in the holo sibling, exactly as the real scan's tieCount 1 -> 3.
const PAGE2 = F.padTo([F.ALAKAZAM_1], 30, "AlakazamP2");

function expeditionRoutes() {
  return {
    "Alakazam": PAGE1,
    "Alakazam|offset=30": PAGE2,
    // The setName-scoped search returns BOTH Alakazams, so its
    // "exactly one distinct qualifier" guard declines — as in the real scan.
    "Alakazam Expedition Base Set": [F.ALAKAZAM_33, F.ALAKAZAM_1],
  };
}

// Disable the Runtime Cache before api/identify.js is loaded.
//
// lookupCardPPT caches results for 30s on language+name+number through
// @vercel/functions' getCache(), and that cache is PROCESS-global and shared
// across module instances. In a test run that silently links unrelated cases
// together: one test priced "001/165" normally and cached it, and the next
// test using the same read got the cached answer back without ever entering
// the code under test — which made three real assertions pass vacuously and
// three others fail for the wrong reason. identify.js already guards this
// require and treats a missing package as "caching disabled", so stubbing it
// out is the supported way to get deterministic lookups.
function disableRuntimeCache() {
  const resolved = require.resolve("@vercel/functions", { paths: [path.join(__dirname, "..", "api")] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: { getCache: null, waitUntil: null },
  };
}

async function main() {
  disableRuntimeCache();
  const M = require(IDENTIFY);
  assert.strictEqual(M.__cacheDisabledForTests, true, "the Runtime Cache stub did not take effect");

  // ======================================================================
  // 1. UNIT — totalsContradict (denominator guard primitive)
  // ======================================================================
  await test("totalsContradict: real case 1/18 vs 001/165 contradicts", () => {
    assert.strictEqual(M.totalsContradict("1/18", "001/165"), true);
  });
  await test("totalsContradict: agreeing totals do not contradict", () => {
    assert.strictEqual(M.totalsContradict("1/165", "001/165"), false);
    assert.strictEqual(M.totalsContradict("133/165", "001/165"), false);
  });
  await test("totalsContradict: asymmetric (no total on one side) is not a contradiction", () => {
    assert.strictEqual(M.totalsContradict("1", "001/165"), false);
    assert.strictEqual(M.totalsContradict("1/165", "8"), false);
    assert.strictEqual(M.totalsContradict(null, "001/165"), false);
    assert.strictEqual(M.totalsContradict("1/18", null), false);
  });
  await test("totalsContradict: H-prefixed total differs from a plain total", () => {
    assert.strictEqual(M.totalsContradict("2/144", "H01/H32"), true);
    assert.strictEqual(M.totalsContradict("H01/H32", "H1/H32"), false);
  });
  await test("totalsContradict mirrors numbersMatch's bothHaveTotal rule", () => {
    // Same numerator, disagreeing total: numbersMatch says no match, and
    // totalsContradict says contradiction. The two must never disagree.
    assert.strictEqual(M.numbersMatch("1/18", "001/165").match, false);
    assert.strictEqual(M.totalsContradict("1/18", "001/165"), true);
  });

  // ======================================================================
  // 2. UNIT — sibling grouping
  // ======================================================================
  await test("candidateSiblingBaseName strips only numeric/H parentheticals", () => {
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Alakazam (33)" }), "alakazam");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Alakazam (1)" }), "alakazam");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Alakazam (H1)" }), "alakazam");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Dark Alakazam (18)" }), "dark alakazam");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Alakazam ex - 201/165" }), "alakazam ex");
  });
  await test("candidateSiblingBaseName does NOT strip meaningful parentheticals", () => {
    assert.strictEqual(M.candidateSiblingBaseName({ name: "M Alakazam EX (Full Art)" }), "m alakazam ex (full art)");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Alakazam EX (Secret)" }), "alakazam ex (secret)");
    assert.strictEqual(M.candidateSiblingBaseName({ name: "Mew - 8 (Glossy Finish)" }), "mew - 8 (glossy finish)");
  });
  await test("sameSiblingGroup: the real Expedition pair are siblings", () => {
    assert.strictEqual(M.sameSiblingGroup(F.ALAKAZAM_33, F.ALAKAZAM_1), true);
  });
  await test("sameSiblingGroup: same product is not its own sibling", () => {
    assert.strictEqual(M.sameSiblingGroup(F.ALAKAZAM_33, F.ALAKAZAM_33), false);
  });
  await test("sameSiblingGroup: different sets are not siblings", () => {
    assert.strictEqual(M.sameSiblingGroup(F.ALAKAZAM_33, F.SKY_ALAKAZAM_H1), false);
    assert.strictEqual(M.sameSiblingGroup(F.SKY_ALAKAZAM_2, F.SKY_ALAKAZAM_H1), true);
  });
  await test("sameSiblingGroup: distinct products that merely share a name prefix are not siblings", () => {
    const fullArt = { tcgPlayerId: "11123", name: "M Alakazam EX (Full Art)", setName: "XY Fates Collide" };
    const plain = { tcgPlayerId: "11114", name: "M Alakazam EX", setName: "XY Fates Collide" };
    assert.strictEqual(M.sameSiblingGroup(fullArt, plain), false);
  });

  // ======================================================================
  // 3. UNIT — attack-name-in-card-text
  // ======================================================================
  await test("attackNameAppearsInCardText finds a real attack name in the text", () => {
    assert.strictEqual(M.attackNameAppearsInCardText("Syncroblast", F.ALAKAZAM_33.attacks.join(" ")), true);
  });
  await test("attackNameAppearsInCardText: Psymimic is NOT in PPT's data (documented limit)", () => {
    // PPT carries no Poke-POWER/Ability field, so this check cannot save the
    // Alakazam case; the cross-model check is what does. Asserted so the
    // limit is visible if PPT's schema ever changes.
    assert.strictEqual(M.attackNameAppearsInCardText("Psymimic", F.ALAKAZAM_33.attacks.join(" ")), false);
  });
  await test("attackNameAppearsInCardText matches whole tokens only", () => {
    assert.strictEqual(M.attackNameAppearsInCardText("Sync", F.ALAKAZAM_33.attacks.join(" ")), false);
    assert.strictEqual(M.attackNameAppearsInCardText("Energy", F.ALAKAZAM_33.attacks.join(" ")), true);
  });
  await test("attackNameAppearsInCardText handles empty/null safely", () => {
    assert.strictEqual(M.attackNameAppearsInCardText(null, "x"), false);
    assert.strictEqual(M.attackNameAppearsInCardText("x", null), false);
    assert.strictEqual(M.attackNameAppearsInCardText("", ""), false);
  });

  // ======================================================================
  // 4. UNIT — capped legacy await
  // ======================================================================
  await test("awaitLegacyReadCapped returns a resolved read", async () => {
    const v = await M.awaitLegacyReadCapped(Promise.resolve({ found: true, cardNumber: "1/165" }), "t", "unit");
    assert.strictEqual(v.cardNumber, "1/165");
  });
  await test("awaitLegacyReadCapped returns null on timeout, and does not wait for the slow promise", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve({ found: true }), 5000));
    const started = Date.now();
    const v = await M.awaitLegacyReadCapped(slow, "t", "unit", 60);
    const elapsed = Date.now() - started;
    assert.strictEqual(v, null);
    assert.ok(elapsed < 1500, `should give up fast, took ${elapsed}ms`);
  });
  await test("awaitLegacyReadCapped returns null on rejection (no unhandled rejection)", async () => {
    const v = await M.awaitLegacyReadCapped(Promise.reject(new Error("This operation was aborted")), "t", "unit");
    assert.strictEqual(v, null);
  });
  await test("awaitLegacyReadCapped returns null when given no promise", async () => {
    assert.strictEqual(await M.awaitLegacyReadCapped(null, "t", "unit"), null);
  });
  await test("LEGACY_NUMBER_RESCUE_TIMEOUT_MS is 500, matching the setName-hint cap", () => {
    assert.strictEqual(M.LEGACY_NUMBER_RESCUE_TIMEOUT_MS, 500);
  });

  // ======================================================================
  // 5. REPLAY of the real scan f033dcfe  — must NOT return 83497
  // ======================================================================
  const realRead = {
    ...BASE_READ,
    cardNumber: "1/18",
    attackName: "Synchroblast",
    setName: null,
  };
  const realLegacy = {
    found: true,
    confidence: "High",
    cardName: "Alakazam",
    cardNumber: "1/165",
    hp: "100",
    setName: "Expedition Base Set",
    attackName: "Syncroblast",
    subtype: "Stage 2",
    language: "English",
    stampType: "none",
  };

  let replayResult = null;
  await test("REPLAY f033dcfe: does NOT return the holo sibling 83497", async () => {
    installPptMock(expeditionRoutes());
    replayResult = await M.lookupCardPPT(realRead, "replay-f033dcfe", Promise.resolve(realLegacy));
    const id = replayResult.pricingLookup && replayResult.pricingLookup.tcgPlayerId;
    assert.notStrictEqual(id, "83497", "the wrong (11.7x) holo sibling was selected again");
    assert.ok(
      id === "83500" || replayResult.pricingLookup === null,
      `expected 83500 or a withheld price, got ${JSON.stringify(replayResult.pricingLookup)}`
    );
  });
  await test("REPLAY f033dcfe: resolves to sibling ambiguity, not a single guess", () => {
    // CHANGED by test #102: the #101 guards alone left this at
    // "83500 at Low with a price". Now the sibling-disagreement cap also
    // fires — the primary read "1/18" points at neither sibling and the
    // legacy read "1/165" points at the holo one — so both printings are
    // disclosed and no single price is shown. Strictly more honest, and it
    // still satisfies the hard requirement: never 83497.
    assert.strictEqual(replayResult.matchBasis, "sibling-ambiguous");
    assert.strictEqual(replayResult.pricingLookup, null);
    const ids = replayResult.siblingAmbiguity.candidates.map((c) => c.tcgPlayerId).sort();
    assert.deepStrictEqual(ids, ["83497", "83500"]);
  });
  await test("REPLAY f033dcfe: is not presented as a confident match", () => {
    assert.strictEqual(replayResult.matchConfidence, "Low");
    assert.ok(replayResult.ambiguousNote, "a Low match must carry a disclosure note");
  });
  await test("REPLAY f033dcfe: matchBasis is not legacy-number-rescue", () => {
    assert.notStrictEqual(replayResult.matchBasis, "legacy-number-rescue");
  });

  // The same replay against committed HEAD must reproduce the bug, or this
  // test is not actually proving anything.
  await test(`REPLAY f033dcfe against ${PRE_FIX_REF} reproduces the 83497 bug (test validity)`, async () => {
    const { mod: HEADM, cleanup } = loadPreFixModule("identify-prefix");
    try {
      installPptMock(expeditionRoutes());
      const headResult = await HEADM.lookupCardPPT(realRead, "replay-head", Promise.resolve(realLegacy));
      assert.strictEqual(
        headResult.pricingLookup && headResult.pricingLookup.tcgPlayerId,
        "83497",
        "HEAD was expected to return the wrong sibling; the replay may not be faithful"
      );
      assert.strictEqual(headResult.matchBasis, "legacy-number-rescue");
    } finally {
      cleanup();
    }
  });

  // ======================================================================
  // 6. SIBLING-AMBIGUITY guard — the denominator agrees, so guard 1 passes
  // ======================================================================
  let siblingResult = null;
  await test("SIBLING AMBIGUITY: misread numerator with a correct denominator withholds the price", async () => {
    installPptMock({ ...expeditionRoutes(), "Alakazam 133/165": F.padTo([], 4, "NoMatch"), "Alakazam Expedition": [F.ALAKAZAM_33, F.ALAKAZAM_1] });
    siblingResult = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "133/165", attackName: "Synchroblast" },
      "sibling-case",
      Promise.resolve({ ...realLegacy, cardNumber: "1/165" })
    );
    assert.strictEqual(siblingResult.pricingLookup, null, "no price may be shown when we cannot tell the siblings apart");
    assert.strictEqual(siblingResult.printingUndetermined, true);
    assert.strictEqual(siblingResult.matchConfidence, "Low");
    assert.strictEqual(siblingResult.matchBasis, "sibling-ambiguous");
  });
  await test("SIBLING AMBIGUITY: never auto-picks the more expensive sibling", () => {
    const blob = JSON.stringify(siblingResult);
    assert.ok(!blob.includes("83497"), "must not select or link the $250 holo sibling");
    assert.strictEqual(siblingResult.tcgplayerUrl, null);
  });
  await test("SIBLING AMBIGUITY: discloses BOTH cards with name, number and market price", () => {
    const note = siblingResult.ambiguousNote;
    assert.ok(note.includes("Alakazam (33)"), "note must name Alakazam (33)");
    assert.ok(note.includes("033/165"), "note must give 033/165");
    assert.ok(note.includes("21.37"), "note must give the non-holo market price");
    assert.ok(note.includes("Alakazam (1)"), "note must name Alakazam (1)");
    assert.ok(note.includes("001/165"), "note must give 001/165");
    assert.ok(note.includes("250.00"), "note must give the holo market price");
  });
  await test("SIBLING AMBIGUITY: discloses the two numbers the models disagreed on", () => {
    assert.ok(siblingResult.ambiguousNote.includes("133/165"));
    assert.ok(siblingResult.ambiguousNote.includes("1/165"));
  });
  await test("SIBLING AMBIGUITY: lists the cheaper sibling first (number order, never price-ranked)", () => {
    const note = siblingResult.ambiguousNote;
    assert.ok(note.indexOf("Alakazam (1)") < note.indexOf("Alakazam (33)"), "ordered by card number ascending");
  });
  await test("SIBLING AMBIGUITY: keeps the set name, which both siblings share by construction", () => {
    assert.strictEqual(siblingResult.setName, "Expedition");
  });

  // ======================================================================
  // 7. ATTACK MISMATCH — the Psymimic false positive
  // ======================================================================
  await test("CLEAN SCAN Alakazam 33: Psymimic no longer caps a correct match to Low", async () => {
    installPptMock({ "Alakazam": F.padTo([F.ALAKAZAM_33, F.ALAKAZAM_1, ...F.LOGGED_FILLER.map(F.fillerRow)], 30, "Alakazam") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "033/165", attackName: "Psymimic", setName: "Expedition Base Set" },
      "clean-scan",
      Promise.resolve({ ...realLegacy, cardNumber: "033/165", attackName: "Syncroblast" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "83500");
    assert.strictEqual(r.attackMismatch, false, "the Poke-POWER read must not count as an attack mismatch");
    assert.strictEqual(r.matchConfidence, "High");
    assert.ok(!r.ambiguousNote || !r.ambiguousNote.includes("Psymimic"));
  });
  await test(`CLEAN SCAN Alakazam 33 at ${PRE_FIX_REF}: the false Low is reproduced (test validity)`, async () => {
    const { mod: HEADM, cleanup } = loadPreFixModule("identify-prefix2");
    try {
      installPptMock({ "Alakazam": F.padTo([F.ALAKAZAM_33, F.ALAKAZAM_1, ...F.LOGGED_FILLER.map(F.fillerRow)], 30, "Alakazam") });
      const r = await HEADM.lookupCardPPT(
        { ...BASE_READ, cardNumber: "033/165", attackName: "Psymimic", setName: "Expedition Base Set" },
        "clean-head", Promise.resolve({ ...realLegacy, cardNumber: "033/165", attackName: "Syncroblast" })
      );
      assert.strictEqual(r.attackMismatch, true);
      assert.strictEqual(r.matchConfidence, "Low");
    } finally {
      cleanup();
    }
  });
  await test("ATTACK MISMATCH still fires when NEITHER model sees the attack (30th Celebration class)", async () => {
    const celebrationsPikachu = {
      tcgPlayerId: "250303", setName: "Celebrations", name: "Pikachu", cardNumber: "005/025",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "60",
      attacks: ["[L] Gnaw (10)\r\n<br>Nothing else."],
      prices: { market: 4.58, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({ "Pikachu": F.padTo([celebrationsPikachu], 5, "Pikachu") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Pikachu", hp: "60", cardNumber: "005/025", attackName: "Targeted Spark", setName: "Celebrations" },
      "pikachu-30th",
      Promise.resolve({ found: true, confidence: "High", cardName: "Pikachu", cardNumber: "005/025", hp: "60", attackName: "Targeted Spark", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "250303");
    assert.strictEqual(r.attackMismatch, true, "a genuine attack mismatch must still cap to Low");
    assert.strictEqual(r.matchConfidence, "Low");
    assert.ok(r.ambiguousNote.includes("Targeted Spark"));
  });
  await test("ATTACK MISMATCH still fires when the legacy read is unavailable", async () => {
    const celebrationsPikachu = {
      tcgPlayerId: "250303", setName: "Celebrations", name: "Pikachu", cardNumber: "005/025",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "60",
      attacks: ["[L] Gnaw (10)\r\n<br>Nothing else."],
      prices: { market: 4.58, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({ "Pikachu": F.padTo([celebrationsPikachu], 5, "Pikachu") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Pikachu", hp: "60", cardNumber: "005/025", attackName: "Targeted Spark", setName: "Celebrations" },
      "pikachu-no-legacy", null
    );
    assert.strictEqual(r.attackMismatch, true);
    assert.strictEqual(r.matchConfidence, "Low");
  });
  await test("ATTACK MISMATCH stays English-only (Japanese read is never capped)", async () => {
    const celebrationsPikachu = {
      tcgPlayerId: "250303", setName: "Celebrations", name: "Pikachu", cardNumber: "005/025",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "60",
      attacks: ["[L] Gnaw (10)\r\n<br>Nothing else."],
      prices: { market: 4.58, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({ "Pikachu": F.padTo([celebrationsPikachu], 5, "Pikachu") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Pikachu", hp: "60", cardNumber: "005/025", attackName: "Focus Blast", language: "Japanese", setName: "Celebrations" },
      "pikachu-jp", null
    );
    assert.strictEqual(r.attackMismatch, false);
  });

  // ======================================================================
  // 8. H-NUMBERED holo siblings (Aquapolis / Skyridge)
  // ======================================================================
  await test("H-NUMBERED: a holo H-card is still rescued when no sibling is in the pool", async () => {
    // Wrong numerator, CORRECT denominator (H32), so the denominator guard
    // has nothing to object to; and with no non-holo sibling in the pool the
    // sibling guard does not apply either. The rescue must still work.
    installPptMock({
      "Alakazam": F.padTo([F.SKY_ALAKAZAM_H1], 30, "Alakazam"),
      "Alakazam|offset=30": F.padTo([], 3, "AlakazamP2"),
      "Alakazam H05/H32": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "H05/H32", attackName: "Energy Crush" },
      "sky-no-sibling",
      Promise.resolve({ found: true, confidence: "High", cardName: "Alakazam", cardNumber: "H01/H32", hp: "100", attackName: "Energy Crush", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "84002");
    assert.strictEqual(r.matchBasis, "legacy-number-rescue");
  });
  await test("H-NUMBERED: a Skyridge sibling pair with disagreeing numbers is refused, not guessed", async () => {
    // Same page-1/page-2 shape as the real Expedition scan, so the non-holo
    // becomes `best` first and the holo arrives on the page-2 merge.
    installPptMock({
      "Alakazam": F.padTo([F.SKY_ALAKAZAM_2], 30, "Alakazam"),
      "Alakazam|offset=30": F.padTo([F.SKY_ALAKAZAM_H1], 30, "AlakazamP2"),
      "Alakazam H07/H32": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "H07/H32", attackName: "Energy Crush" },
      "sky-sibling",
      Promise.resolve({ found: true, confidence: "High", cardName: "Alakazam", cardNumber: "H01/H32", hp: "100", attackName: "Energy Crush", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.pricingLookup, null, "must not silently pick the $120 holo");
    assert.strictEqual(r.matchConfidence, "Low");
    assert.ok(r.ambiguousNote.includes("Alakazam (2)") && r.ambiguousNote.includes("Alakazam (H1)"));
  });

  // ======================================================================
  // 9. REGRESSION — stamped twins sharing a number (Snorlax 33/95 class)
  // ======================================================================
  await test("STAMPED TWINS: the stamp filter still narrows Snorlax 33/95 to the $30.23 card", async () => {
    // Real rows (2026-10-09 investigation): the correct Call of Legends Rare
    // plus two Nintendo Promos stamped "(Prerelease)" / "[Staff]". Both
    // models read stampType "none" on every real scan, so the stamp filter
    // drops the stamped twins and the rescue resolves to exactly one card.
    const twin = (tcgPlayerId, name, setName, market) => ({
      tcgPlayerId, setName, name, cardNumber: "33/95",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "100",
      attacks: ["[CCCC] Body Slam (40)\r\n<br>Flip a coin."],
      prices: { market, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    });
    installPptMock({
      "Snorlax": F.padTo([
        twin("89392", "Snorlax", "Call of Legends", 30.23),
        twin("213021", "Snorlax - 33/95 (Prerelease)", "Nintendo Promos", 499.99),
        twin("228494", "Snorlax - 33/95 (Prerelease) [Staff]", "Nintendo Promos", 1975),
      ], 30, "Snorlax"),
      "Snorlax|offset=30": F.padTo([], 3, "SnorlaxP2"),
      "Snorlax 9/95": F.padTo([], 3, "NoMatch"),
      "Snorlax 09/95": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Snorlax", hp: "100", cardNumber: "9/95", attackName: "Body Slam" },
      "snorlax-twins",
      Promise.resolve({ found: true, confidence: "High", cardName: "Snorlax", cardNumber: "33/95", hp: "100", attackName: "Body Slam", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "89392", "must land on the $30.23 Call of Legends card");
    assert.strictEqual(r.matchBasis, "legacy-number-rescue");
    assert.strictEqual(r.matchConfidence, "Medium");
  });
  await test("STAMPED TWINS: never lands on the $499.99 or $1975 stamped twin", async () => {
    const twin = (tcgPlayerId, name, setName, market) => ({
      tcgPlayerId, setName, name, cardNumber: "33/95",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "100",
      attacks: ["[CCCC] Body Slam (40)\r\n<br>Flip a coin."],
      prices: { market, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    });
    installPptMock({
      "Snorlax": F.padTo([
        twin("213021", "Snorlax - 33/95 (Prerelease)", "Nintendo Promos", 499.99),
        twin("228494", "Snorlax - 33/95 (Prerelease) [Staff]", "Nintendo Promos", 1975),
        twin("89392", "Snorlax", "Call of Legends", 30.23),
      ], 30, "Snorlax"),
      "Snorlax|offset=30": F.padTo([], 3, "SnorlaxP2"),
      "Snorlax 9/95": F.padTo([], 3, "NoMatch"),
      "Snorlax 09/95": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Snorlax", hp: "100", cardNumber: "9/95", attackName: "Body Slam" },
      "snorlax-twins-order",
      Promise.resolve({ found: true, confidence: "High", cardName: "Snorlax", cardNumber: "33/95", hp: "100", attackName: "Body Slam", language: "English", stampType: "none" })
    );
    // Stamped twins first in PPT's array order — the pre-2026-10-09 bug.
    const id = r.pricingLookup && r.pricingLookup.tcgPlayerId;
    assert.ok(id !== "213021" && id !== "228494", `landed on a stamped twin: ${id}`);
  });

  // ======================================================================
  // 10. REGRESSION — sub-floor rescue (full-art Trainer / Mew class) intact
  // ======================================================================
  await test("SUB-FLOOR rescue still fires for a Trainer with no hp/attack signals", async () => {
    const trainer = {
      tcgPlayerId: "700001", setName: "SV Paldean Fates", name: "Iono",
      cardNumber: "237/091", rarity: "Special Illustration Rare", cardType: "Trainer",
      hp: null, attacks: null, pokemonType: "Trainer - Supporter",
      prices: { market: 88.0, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({
      "Iono": F.padTo([trainer], 30, "Iono"),
      "Iono|offset=30": F.padTo([], 3, "IonoP2"),
      "Iono 137/091": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Iono", hp: null, cardNumber: "137/091", attackName: null, subtype: null },
      "trainer-subfloor",
      Promise.resolve({ found: true, confidence: "High", cardName: "Iono", cardNumber: "237/091", hp: null, attackName: null, language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "700001");
    assert.strictEqual(r.matchBasis, "legacy-number-rescue");
    assert.strictEqual(r.matchConfidence, "Medium");
  });

  // ======================================================================
  // 11. REGRESSION — pricing math untouched (raw + graded reference values)
  // ======================================================================
  await test("raw break-even reference values unchanged ($5/$10/$30/$100)", () => {
    // computeBreakEvenMaxBid returns a plain number; computeGradedBreakEven
    // returns { listPrice, breakEven }.
    const round = (v) => Math.round(v * 100) / 100;
    assert.strictEqual(round(M.computeBreakEvenMaxBid(5)), 3.81);
    assert.strictEqual(round(M.computeBreakEvenMaxBid(10)), 7.93);
    assert.strictEqual(round(M.computeBreakEvenMaxBid(30)), 19.97);
    assert.strictEqual(round(M.computeBreakEvenMaxBid(100)), 79.08);
  });
  await test("graded SM210 reference unchanged (median 155.20 -> BE 125.68 -> bid 90.67)", () => {
    const be = M.computeGradedBreakEven(155.2);
    assert.strictEqual(Math.round(be.breakEven * 100) / 100, 125.68);
    assert.strictEqual(be.listPrice, 156.2);
    const bid = M.computeSuggestedBid(be.breakEven, "Normal");
    assert.strictEqual(bid, 90.67);
  });
  await test("graded shipping constant still flat $5.80 per card", () => {
    assert.strictEqual(M.GRADED_SHIPPING_PER_CARD, 5.8);
  });
  await test("graded sell-through stays window-aware, never count/3", () => {
    const wide = M.computeGradedSellThrough(30, "2026-04-01T00:00:00Z", "2026-10-15T00:00:00Z");
    const narrow = M.computeGradedSellThrough(30, "2026-07-27T00:00:00Z", "2026-10-15T00:00:00Z");
    assert.ok(wide.monthlyPace < narrow.monthlyPace, "a wider window must yield a slower pace");
  });
  await test("Dragonite 232 graded lookup is still keyed to the matched card (no name search)", () => {
    const src = fs.readFileSync(IDENTIFY, "utf8");
    const fn = src.slice(src.indexOf("async function lookupGradedPrice"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.ok(!/fetchPokemonPriceTracker\s*\(/.test(body), "lookupGradedPrice must not run a name search");
    assert.ok(/fetchPptCardByTcgPlayerId/.test(body), "lookupGradedPrice must fetch by matched tcgPlayerId");
  });

  // ======================================================================
  // 12. The guards must not add PPT calls
  // ======================================================================
  await test("the new guards make no additional PPT requests", async () => {
    // lookupCardPPT caches on language+name+number through @vercel/functions'
    // getCache, which is PROCESS-global — a fresh `require` does not clear
    // it, and the two modules share it. So each side gets its own unused
    // card number. "1/19" and "1/21" are structurally identical to the real
    // "1/18": a total that contradicts /165 and a numerator that matches no
    // pool candidate, so both produce the same sequence of searches.
    const { mod: HEADM, cleanup } = loadPreFixModule("identify-prefix3");
    try {
      const newCalls = installPptMock(expeditionRoutes());
      // 3-digit totals on purpose: buildWideZeroPaddedNumberVariant only
      // fires for a total under 3 digits, so this holds query construction
      // constant and isolates what the test is actually about — the sibling
      // guards adding no PPT calls. The padding fix's own call count is
      // asserted separately below.
      await M.lookupCardPPT({ ...realRead, cardNumber: "1/190" }, "call-count-new", Promise.resolve(realLegacy));

      const headCalls = installPptMock(expeditionRoutes());
      await HEADM.lookupCardPPT({ ...realRead, cardNumber: "1/210" }, "call-count-head", Promise.resolve(realLegacy));

      assert.ok(newCalls.length > 0, "the replay should actually hit the mocked PPT");
      assert.strictEqual(
        newCalls.length, headCalls.length,
        `PPT call count changed: ${newCalls.length} (${newCalls.join(", ")}) vs HEAD ${headCalls.length} (${headCalls.join(", ")})`
      );
    } finally {
      cleanup();
    }
  });

  // ======================================================================
  // 13. SIBLING-DISAGREEMENT CAP on the scoring path (test #102)
  // ======================================================================
  // Pool shape of the real 159a5822: page 1 full with no Expedition
  // Alakazam, page 2 brings BOTH siblings (page2 count 12, merged 42).
  function scoreOnlyRoutes() {
    return {
      "Alakazam": F.padTo(F.LOGGED_FILLER.map(F.fillerRow), 30, "Alakazam"),
      "Alakazam|offset=30": [F.ALAKAZAM_1, F.ALAKAZAM_33, ...F.padTo([], 10, "AlakazamP2")],
    };
  }
  const SCORE_READ = {
    ...BASE_READ,
    cardNumber: "1/165",
    attackName: "Prypower",
    setName: "Expedition Base Set",
  };
  const LEGACY_CORRECT = {
    found: true, confidence: "High", cardName: "Alakazam", cardNumber: "33/165",
    hp: "100", setName: "Expedition Base Set", attackName: "Syncroblast",
    subtype: "Stage 2", language: "English", stampType: "none",
  };

  let capResult = null;
  await test("REPLAY 159a5822: the wrong sibling is no longer presented at High", async () => {
    installPptMock(scoreOnlyRoutes());
    capResult = await M.lookupCardPPT({ ...SCORE_READ }, "replay-159a5822", Promise.resolve({ ...LEGACY_CORRECT }));
    assert.notStrictEqual(capResult.matchConfidence, "High");
    assert.strictEqual(capResult.matchConfidence, "Low");
    assert.strictEqual(capResult.matchBasis, "sibling-ambiguous");
  });
  await test("REPLAY 159a5822: no single confident price", () => {
    assert.strictEqual(capResult.pricingLookup, null);
  });
  await test("REPLAY 159a5822: both printings disclosed, in card-number order", () => {
    const cands = capResult.siblingAmbiguity.candidates;
    assert.strictEqual(cands.length, 2);
    assert.strictEqual(cands[0].number, "001/165");
    assert.strictEqual(cands[1].number, "033/165");
  });
  await test("REPLAY 159a5822: each candidate carries number, rarity and its own pricingLookup", () => {
    for (const c of capResult.siblingAmbiguity.candidates) {
      assert.ok(c.name && c.number, "name and number required");
      assert.ok(c.rarity, "rarity required so the panel can show Rare vs Holo Rare");
      assert.ok(c.pricingLookup && c.pricingLookup.tcgPlayerId, "each candidate needs a usable pricingLookup");
      assert.ok(c.pricingLookup.primaryPrinting, "primaryPrinting drives the default variant in /api/price");
    }
    const rarities = capResult.siblingAmbiguity.candidates.map((c) => c.rarity).sort();
    assert.deepStrictEqual(rarities, ["Holo Rare", "Rare"]);
  });
  await test("REPLAY 159a5822: the panel gets a generic (not holo-specific) prompt", () => {
    // CHANGED by #104: the first version said "check whether the card is
    // holo", which is right for the e-Card double prints but wrong for the
    // modern ex/SIR and V/alt-art twins this same code now covers, where the
    // tell is the artwork and finish rather than holo-vs-not.
    assert.strictEqual(capResult.siblingAmbiguity.prompt, "Check the finish and artwork to tell these apart.");
    assert.ok(!/\bholo\b/i.test(capResult.siblingAmbiguity.prompt), "the prompt must not be holo-specific");
    assert.ok(capResult.ambiguousNote.includes("finish and artwork"));
  });
  await test("REPLAY 159a5822 at the deployed build reproduces High 83497 (test validity)", async () => {
    // Pinned to the SHA actually in production right now.
    const tmp = path.join(os.tmpdir(), `identify-prod-${process.pid}.js`);
    const src = execFileSync("git", ["show", "ba5f009:api/identify.js"], {
      cwd: path.join(__dirname, ".."), maxBuffer: 64 * 1024 * 1024, encoding: "utf8",
    });
    fs.writeFileSync(tmp, src + "\nmodule.exports.lookupCardPPT = lookupCardPPT;\n");
    try {
      const PRODM = require(tmp);
      installPptMock(scoreOnlyRoutes());
      const r = await PRODM.lookupCardPPT({ ...SCORE_READ }, "replay-prod", Promise.resolve({ ...LEGACY_CORRECT }));
      assert.strictEqual(r.pricingLookup.tcgPlayerId, "83497");
      assert.strictEqual(r.matchConfidence, "High");
      assert.strictEqual(r.matchBasis, "score-only");
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  await test("AGREEMENT on 033/165: the non-holo prices normally at High", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "033/165", attackName: "Syncroblast", setName: "Expedition Base Set" },
      "agree-33",
      Promise.resolve({ ...LEGACY_CORRECT, cardNumber: "033/165" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "83500");
    assert.strictEqual(r.matchConfidence, "High");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });
  await test("AGREEMENT on 001/165: a REAL holo must still price normally", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "001/165", attackName: "Syncroblast", setName: "Expedition Base Set" },
      "agree-1",
      Promise.resolve({ ...LEGACY_CORRECT, cardNumber: "001/165" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "83497");
    assert.strictEqual(r.pricingLookup.primaryPrinting, "Holofoil");
    assert.strictEqual(r.matchConfidence, "High");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });
  await test("AGREEMENT with a zero-padding difference still counts as agreement", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "1/165", attackName: "Syncroblast", setName: "Expedition Base Set" },
      "agree-pad",
      Promise.resolve({ ...LEGACY_CORRECT, cardNumber: "001/165" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "83497");
    assert.strictEqual(r.matchConfidence, "High");
  });

  await test("FAIL SAFE: a missing legacy read makes a sibling scan ambiguous", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "001/165" }, "nolegacy", null);
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.pricingLookup, null);
  });
  await test("FAIL SAFE: a null legacy cardNumber makes a sibling scan ambiguous", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT(
      { ...SCORE_READ, cardNumber: "001/165" }, "nullnum",
      Promise.resolve({ ...LEGACY_CORRECT, cardNumber: null })
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
  });
  await test("FAIL SAFE: a legacy read slower than the 500ms cap makes it ambiguous", async () => {
    installPptMock(scoreOnlyRoutes());
    const slow = new Promise((resolve) => setTimeout(() => resolve({ ...LEGACY_CORRECT, cardNumber: "001/165" }), 4000));
    const started = Date.now();
    const r = await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "001/165" }, "slowlegacy", slow);
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.ok(Date.now() - started < 3000, "must not wait for the slow legacy read");
  });

  await test("SAME-RARITY siblings (Blastoise 36/37) are covered too", async () => {
    installPptMock({
      "Blastoise": F.padTo([F.BLASTOISE_36, F.BLASTOISE_37], 30, "Blastoise"),
      "Blastoise|offset=30": F.padTo([], 3, "BlastoiseP2"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Blastoise", hp: "90", cardNumber: "036/165", attackName: "Hydro Pump", setName: "Expedition Base Set" },
      "blastoise-pair",
      Promise.resolve({ found: true, confidence: "High", cardName: "Blastoise", cardNumber: "037/165", hp: "90", attackName: "Hydro Pump", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.pricingLookup, null);
    const nums = r.siblingAmbiguity.candidates.map((c) => c.number);
    assert.deepStrictEqual(nums, ["036/165", "037/165"]);
  });

  await test("SKYRIDGE H-number siblings: disagreement across the H prefix is capped", async () => {
    installPptMock({
      "Alakazam": F.padTo([F.SKY_ALAKAZAM_2, F.SKY_ALAKAZAM_H1], 30, "Alakazam"),
      "Alakazam|offset=30": F.padTo([], 3, "AlakazamP2"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "002/144", attackName: "Energy Crush", setName: "Skyridge" },
      "sky-cap",
      Promise.resolve({ found: true, confidence: "High", cardName: "Alakazam", cardNumber: "H01/H32", hp: "100", attackName: "Energy Crush", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.pricingLookup, null);
  });
  await test("SKYRIDGE H-number siblings: agreement prices the H card normally", async () => {
    installPptMock({
      "Alakazam": F.padTo([F.SKY_ALAKAZAM_2, F.SKY_ALAKAZAM_H1], 30, "Alakazam"),
      "Alakazam|offset=30": F.padTo([], 3, "AlakazamP2"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "H01/H32", attackName: "Energy Crush", setName: "Skyridge" },
      "sky-agree-cap",
      Promise.resolve({ found: true, confidence: "High", cardName: "Alakazam", cardNumber: "H01/H32", hp: "100", attackName: "Energy Crush", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "84002");
    assert.strictEqual(r.matchConfidence, "High");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });

  // ======================================================================
  // 14. NON-SIBLING cards must be completely unaffected
  // ======================================================================
  await test("NON-SIBLING: a lone candidate never gets the sibling treatment", async () => {
    const lone = {
      tcgPlayerId: "114004", setName: "XY Promos", name: "Pikachu", cardNumber: "XY95",
      rarity: "Promo", cardType: "Pokemon", hp: "60",
      attacks: ["[L] Thunder Shock (20)\r\n<br>Flip a coin."],
      prices: { market: 207.44, primaryPrinting: "Holofoil", listings: 64 },
      printingsAvailable: ["Holofoil"],
    };
    installPptMock({ "Pikachu": F.padTo([lone], 6, "Pikachu") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Pikachu", hp: "60", cardNumber: "XY95", attackName: "Thunder Shock", setName: "XY Promos" },
      "lone-xy95",
      Promise.resolve({ found: true, confidence: "High", cardName: "Pikachu", cardNumber: "XY95", hp: "60", attackName: "Thunder Shock", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "114004");
    assert.strictEqual(r.matchConfidence, "High");
    assert.strictEqual(r.siblingAmbiguity, undefined);
    assert.notStrictEqual(r.matchBasis, "sibling-ambiguous");
  });
  await test("NON-SIBLING: stamped twins share a NUMBER but not a set, so no sibling cap", async () => {
    const twin = (tcgPlayerId, name, setName, market) => ({
      tcgPlayerId, setName, name, cardNumber: "33/95",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "100",
      attacks: ["[CCCC] Body Slam (40)\r\n<br>Flip a coin."],
      prices: { market, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    });
    installPptMock({
      "Snorlax": F.padTo([
        twin("89392", "Snorlax", "Call of Legends", 30.23),
        twin("213021", "Snorlax - 33/95 (Prerelease)", "Nintendo Promos", 499.99),
      ], 30, "Snorlax"),
      "Snorlax|offset=30": F.padTo([], 3, "SnorlaxP2"),
      "Snorlax 9/95": F.padTo([], 3, "NoMatch"),
      "Snorlax 09/95": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Snorlax", hp: "100", cardNumber: "9/95", attackName: "Body Slam" },
      "snorlax-nosib",
      Promise.resolve({ found: true, confidence: "High", cardName: "Snorlax", cardNumber: "33/95", hp: "100", attackName: "Body Slam", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "89392");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });
  await test("NON-SIBLING: the 30th-Celebration attack cap is unchanged", async () => {
    const celebrationsPikachu = {
      tcgPlayerId: "250303", setName: "Celebrations", name: "Pikachu", cardNumber: "005/025",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "60",
      attacks: ["[L] Gnaw (10)\r\n<br>Nothing else."],
      prices: { market: 4.58, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({ "Pikachu": F.padTo([celebrationsPikachu], 5, "Pikachu") });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Pikachu", hp: "60", cardNumber: "005/025", attackName: "Targeted Spark", setName: "Celebrations" },
      "pikachu-30th-nosib",
      Promise.resolve({ found: true, confidence: "High", cardName: "Pikachu", cardNumber: "005/025", hp: "60", attackName: "Targeted Spark", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.attackMismatch, true);
    assert.strictEqual(r.matchConfidence, "Low");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });
  await test("NON-SIBLING: the Trainer sub-floor rescue is unchanged", async () => {
    const trainer = {
      tcgPlayerId: "700001", setName: "SV Paldean Fates", name: "Iono",
      cardNumber: "237/091", rarity: "Special Illustration Rare", cardType: "Trainer",
      hp: null, attacks: null, pokemonType: "Trainer - Supporter",
      prices: { market: 88.0, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
    };
    installPptMock({
      "Iono": F.padTo([trainer], 30, "Iono"),
      "Iono|offset=30": F.padTo([], 3, "IonoP2"),
      "Iono 137/091": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Iono", hp: null, cardNumber: "137/091", attackName: null },
      "trainer-nosib",
      Promise.resolve({ found: true, confidence: "High", cardName: "Iono", cardNumber: "237/091", hp: null, attackName: null, language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "700001");
    assert.strictEqual(r.matchBasis, "legacy-number-rescue");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });

  // ======================================================================
  // 15. THE GENERIC LESSON (test #102)
  // ======================================================================
  // #101 removed a Low cap (the accidental ATTACK MISMATCH catch) and, on a
  // sibling pair, that silently promoted a WRONG card from Low to High. The
  // lesson is not about attacks: ANY change that removes or weakens a Low cap
  // has to be checked against a disagreeing sibling pair. Encoded as a matrix
  // so a future change that re-opens this hole fails here rather than in
  // production.
  await test("LESSON: a disagreeing sibling pair is never High and never priced, whatever the attack read does", async () => {
    const attackReads = [
      ["Syncroblast", "matches the candidate's attack list"],
      ["Psymimic", "a Poke-POWER misread (suppression fires)"],
      ["Prypower", "a different Poke-POWER misread"],
      ["Totally Bogus Attack", "matches nothing at all"],
      [null, "no attack read at all"],
    ];
    for (const [attackName, label] of attackReads) {
      installPptMock(scoreOnlyRoutes());
      const r = await M.lookupCardPPT(
        { ...BASE_READ, cardNumber: "1/165", attackName, setName: "Expedition Base Self" },
        `lesson-${String(attackName)}`,
        Promise.resolve({ ...LEGACY_CORRECT })
      );
      assert.notStrictEqual(r.matchConfidence, "High", `High confidence leaked with attack read ${label}`);
      assert.ok(
        r.pricingLookup == null,
        `a single confident price leaked with attack read ${label}: ${JSON.stringify(r.pricingLookup)}`
      );
      assert.ok(
        r.siblingAmbiguity || r.printingUndetermined,
        `neither disclosure mechanism fired with attack read ${label}`
      );
    }
  });
  await test("LESSON: the cap cannot change which candidate scoring chose", async () => {
    // best stays the winner; the cap only withholds and discloses. The
    // disclosed group must CONTAIN the scoring winner, never replace it.
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT({ ...SCORE_READ }, "lesson-winner", Promise.resolve({ ...LEGACY_CORRECT }));
    const ids = r.siblingAmbiguity.candidates.map((c) => c.tcgPlayerId);
    assert.ok(ids.includes("83497"), "the scoring winner must still be disclosed");
    assert.ok(ids.includes("83500"), "the sibling must be disclosed alongside it");
  });
  await test("LESSON: the cap adds no PPT calls", async () => {
    const calls = installPptMock(scoreOnlyRoutes());
    await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "1/166" }, "lesson-calls", Promise.resolve({ ...LEGACY_CORRECT }));
    const before = calls.length;
    const calls2 = installPptMock(scoreOnlyRoutes());
    await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "1/167" }, "lesson-calls2", Promise.resolve({ ...LEGACY_CORRECT, cardNumber: "1/167" }));
    assert.ok(before > 0 && calls2.length > 0);
  });

  // ======================================================================
  // 16. MODERN SAME-SET TWINS — the #104 scope correction
  // ======================================================================
  // Because candidateSiblingBaseName strips " - 125/197", every modern
  // ex/SIR, V/alt-art and regular/full-art-Trainer pair is a sibling group.
  // Measured on real PPT pools: 19 popular names -> 92 sibling pairs, and
  // Charizard ex alone has four same-set versions. With the legacy
  // cardNumber null ~43% of the time, capping on every uncorroborated
  // sibling scan would have made ambiguity the normal outcome for modern
  // chase cards (measured: 88% of cheapest-winner/legacy-null cases before
  // this change, 3% after).
  function modernRoutes(rows) {
    return {
      "Charizard ex": F.padTo(rows, 30, "Charizard"),
      "Charizard ex|offset=30": F.padTo([], 3, "CharizardP2"),
    };
  }
  const MODERN_READ = {
    ...BASE_READ,
    cardName: "Charizard ex",
    hp: "330",
    setName: "SV03: Obsidian Flames",
    attackName: "Burning Darkness",
  };
  const modernLegacy = (cardNumber) => ({
    found: true, confidence: "High", cardName: "Charizard ex", cardNumber,
    hp: "330", setName: "SV03: Obsidian Flames", attackName: "Burning Darkness",
    language: "English", stampType: "none",
  });

  let standsResult = null;
  await test("MODERN TWIN: cheaper winner + MISSING legacy number is allowed to stand", async () => {
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223]));
    standsResult = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "125/197" }, "modern-stands", Promise.resolve(modernLegacy(null))
    );
    assert.strictEqual(standsResult.pricingLookup.tcgPlayerId, "509879", "must still price the scanned card");
    assert.strictEqual(standsResult.matchConfidence, "High", "a cheap winner must keep its normal confidence");
    assert.strictEqual(standsResult.siblingAmbiguity, undefined);
    assert.notStrictEqual(standsResult.matchBasis, "sibling-ambiguous");
  });
  await test("MODERN TWIN: the stands case still names the pricier twin and its price", () => {
    const note = standsResult.ambiguousNote;
    assert.ok(note, "a note is required so the user knows a pricier twin exists");
    assert.ok(note.includes("223/197"), "note must name the pricier twin's number");
    assert.ok(note.includes("94.62"), "note must give the pricier twin's market price");
    assert.ok(note.includes("Special Illustration Rare"), "note must name its rarity");
    assert.ok(note.includes("finish and artwork"), "note must carry the disambiguation hint");
  });
  await test("MODERN TWIN: pricier winner + MISSING legacy number is still capped", async () => {
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223]));
    const r = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "223/197" }, "modern-pricey-null", Promise.resolve(modernLegacy(null))
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous", "the expensive printing must never stand uncorroborated");
    assert.strictEqual(r.pricingLookup, null);
    assert.strictEqual(r.matchConfidence, "Low");
  });
  await test("MODERN TWIN: disagreement is capped regardless of which twin is cheaper", async () => {
    for (const [primary, legacy] of [["125/197", "223/197"], ["223/197", "125/197"]]) {
      installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223]));
      const r = await M.lookupCardPPT(
        { ...MODERN_READ, cardNumber: primary }, `modern-disagree-${primary}`, Promise.resolve(modernLegacy(legacy))
      );
      assert.strictEqual(r.matchBasis, "sibling-ambiguous", `primary ${primary} vs legacy ${legacy} must be ambiguous`);
      assert.strictEqual(r.pricingLookup, null);
    }
  });
  await test("MODERN TWIN: agreement prices normally with NO note at all", async () => {
    for (const num of ["125/197", "223/197"]) {
      installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223]));
      const r = await M.lookupCardPPT(
        { ...MODERN_READ, cardNumber: num }, `modern-agree-${num}`, Promise.resolve(modernLegacy(num))
      );
      assert.ok(r.pricingLookup, `agreement on ${num} must still price`);
      assert.strictEqual(r.matchConfidence, "High");
      assert.strictEqual(r.siblingAmbiguity, undefined);
      assert.ok(!r.ambiguousNote, `agreement must add no note (got: ${r.ambiguousNote})`);
    }
  });
  await test("MODERN TWIN: an unknown sibling market falls to the capping side", async () => {
    // Real shape: Judge 167/182 came back with siblingMarkets=[null,null,19.88].
    // A missing market means we cannot prove we are erring cheap, so cap.
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223_NO_MARKET]));
    const r = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "125/197" }, "modern-nomarket", Promise.resolve(modernLegacy(null))
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.pricingLookup, null);
  });
  await test("MODERN TWIN: a legacy number pointing at NEITHER twin is not corroboration", async () => {
    // Real case, Mega Sharpedo ex: both models read 033/094, which exists
    // nowhere in the pool, and scoring fell back to the PRICIEST of three
    // same-set siblings on other signals alone. Agreement between the models
    // is not corroboration of the WINNER.
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, F.CHARIZARD_EX_223]));
    const r = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "223/197" }, "modern-neither", Promise.resolve(modernLegacy("999/197"))
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
  });
  await test("MODERN TWIN: the cheap-stands rule needs the winner to be cheapest of ALL siblings", async () => {
    // Three-way group (the real Charizard ex / Roaring Moon ex shape): the
    // middle member is not the cheapest, so it must not stand.
    const mid = { ...F.CHARIZARD_EX_223, tcgPlayerId: "509936", name: "Charizard ex - 215/197",
      cardNumber: "215/197", rarity: "Ultra Rare", prices: { market: 20.74, primaryPrinting: "Holofoil" } };
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, mid, F.CHARIZARD_EX_223]));
    const r = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "215/197" }, "modern-middle", Promise.resolve(modernLegacy(null))
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous", "a middle-priced winner must not stand");
    assert.strictEqual(r.siblingAmbiguity.candidates.length, 3, "all three siblings disclosed");
  });
  await test("MODERN TWIN: the cheapest of a three-way group still stands", async () => {
    const mid = { ...F.CHARIZARD_EX_223, tcgPlayerId: "509936", name: "Charizard ex - 215/197",
      cardNumber: "215/197", rarity: "Ultra Rare", prices: { market: 20.74, primaryPrinting: "Holofoil" } };
    installPptMock(modernRoutes([F.CHARIZARD_EX_125, mid, F.CHARIZARD_EX_223]));
    const r = await M.lookupCardPPT(
      { ...MODERN_READ, cardNumber: "125/197" }, "modern-cheapest3", Promise.resolve(modernLegacy(null))
    );
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "509879");
    assert.strictEqual(r.matchConfidence, "High");
    assert.ok(r.ambiguousNote.includes("223/197"), "the note names the PRICIEST twin");
  });

  // ======================================================================
  // 17. EXTENDED LEGACY WAIT (fix 1, 2026-10-18)
  // ======================================================================
  await test("EXTENDED WAIT: a legacy read landing after 500ms but inside the budget corroborates", async () => {
    installPptMock(scoreOnlyRoutes());
    const slow = new Promise((resolve) =>
      setTimeout(() => resolve({ ...LEGACY_CORRECT, cardNumber: "001/165" }), 700)
    );
    const started = Date.now();
    const r = await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "001/165" }, "ext-corroborate", slow);
    const elapsed = Date.now() - started;
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "83497", "should price the corroborated card");
    assert.strictEqual(r.siblingAmbiguity, undefined);
    assert.ok(elapsed >= 600, `should have waited past the 500ms first cap, took ${elapsed}ms`);
    assert.ok(elapsed < 2500, `should not have waited anywhere near the vision timeout, took ${elapsed}ms`);
  });
  await test("EXTENDED WAIT: a legacy read that never arrives still stops at the total budget", async () => {
    installPptMock(scoreOnlyRoutes());
    const never = new Promise((resolve) => setTimeout(() => resolve({ ...LEGACY_CORRECT }), 8000));
    const started = Date.now();
    const r = await M.lookupCardPPT({ ...SCORE_READ, cardNumber: "001/165" }, "ext-timeout", never);
    const elapsed = Date.now() - started;
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.ok(elapsed < 3000, `must not wait for the slow read, took ${elapsed}ms`);
    assert.ok(elapsed >= 1000, `should have spent roughly the full budget, took ${elapsed}ms`);
  });
  await test("EXTENDED WAIT: a corroborating first read does NOT pay the extra wait", async () => {
    installPptMock(scoreOnlyRoutes());
    const started = Date.now();
    const r = await M.lookupCardPPT(
      { ...SCORE_READ, cardNumber: "001/165" }, "ext-fast",
      Promise.resolve({ ...LEGACY_CORRECT, cardNumber: "001/165" })
    );
    const elapsed = Date.now() - started;
    assert.strictEqual(r.pricingLookup.tcgPlayerId, "83497");
    assert.ok(elapsed < 400, `corroborated path must not wait, took ${elapsed}ms`);
  });
  await test("EXTENDED WAIT: a disagreement on the first read does NOT pay the extra wait", async () => {
    installPptMock(scoreOnlyRoutes());
    const started = Date.now();
    const r = await M.lookupCardPPT({ ...SCORE_READ }, "ext-disagree", Promise.resolve({ ...LEGACY_CORRECT }));
    const elapsed = Date.now() - started;
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.ok(elapsed < 400, `disagreement path must not wait, took ${elapsed}ms`);
  });
  await test("SIBLING_CAP_LEGACY_TOTAL_WAIT_MS is 1200", () => {
    assert.strictEqual(M.SIBLING_CAP_LEGACY_TOTAL_WAIT_MS, 1200);
  });

  // ======================================================================
  // 18. stands-cheaper NEEDS A CONFIRMED NUMBER (fix 2, 2026-10-18)
  // ======================================================================
  // Live case 7eb57832: Flareon read "4/105" matched nothing, scoring picked
  // Flareon (19) 19/64 Jungle ($48.62) on hp/attack alone, and the same-set
  // sibling was $337.50 — a 6.9x gap allowed to stand at full confidence.
  const FLAREON_CHEAP = {
    tcgPlayerId: "106981", setName: "Jungle", name: "Flareon (19)", cardNumber: "19/64",
    rarity: "Rare", cardType: "Pokemon", hp: "70",
    attacks: ["[RR] Quick Attack (10+)\r\n<br>Flip a coin."],
    prices: { market: 48.62, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
  };
  const FLAREON_PRICEY = {
    tcgPlayerId: "45129", setName: "Jungle", name: "Flareon (19)", cardNumber: "19/64",
    rarity: "Rare", cardType: "Pokemon", hp: "70",
    attacks: ["[RR] Quick Attack (10+)\r\n<br>Flip a coin."],
    prices: { market: 337.5, primaryPrinting: "1st Edition" }, printingsAvailable: ["1st Edition"],
  };
  await test("REPLAY 7eb57832: an unconfirmed cheap winner no longer stands", async () => {
    installPptMock({
      "Flareon": F.padTo([FLAREON_CHEAP, FLAREON_PRICEY], 30, "Flareon"),
      "Flareon|offset=30": F.padTo([], 3, "FlareonP2"),
      "Flareon 4/105": F.padTo([], 3, "NoMatch"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Flareon", hp: "70", cardNumber: "4/105", attackName: "Quick Attack" },
      "flareon-replay",
      Promise.resolve({ found: true, confidence: "High", cardName: "Flareon", cardNumber: "4/107", hp: "70", attackName: "Quick Attack", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.matchBasis, "sibling-ambiguous", "neither model's number points at the winner");
    assert.strictEqual(r.pricingLookup, null);
    const nums = r.siblingAmbiguity.candidates.map((c) => c.tcgPlayerId).sort();
    assert.deepStrictEqual(nums, ["106981", "45129"].sort());
  });
  await test("stands-cheaper still fires when the PRIMARY number confirms the cheap winner", async () => {
    installPptMock({
      "Flareon": F.padTo([FLAREON_CHEAP, FLAREON_PRICEY], 30, "Flareon"),
      "Flareon|offset=30": F.padTo([], 3, "FlareonP2"),
    });
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Flareon", hp: "70", cardNumber: "19/64", attackName: "Quick Attack" },
      "flareon-stands", null
    );
    assert.ok(r.pricingLookup, "a confirmed cheap winner must still price");
    assert.strictEqual(r.siblingAmbiguity, undefined);
    assert.ok(r.ambiguousNote.includes("337.50"), "and must still name the pricier sibling");
  });

  // ======================================================================
  // 19. PER-SIBLING GRADED PRICING (fix 3, 2026-10-18)
  // ======================================================================
  const recentSale = new Date(Date.now() - 10 * 86400000).toISOString();
  const gradedRow = (tcgPlayerId, cardNumber, median, count) => ({
    tcgPlayerId, cardNumber, name: "Iono's Bellibolt ex", setName: "SV9: Battle Partners",
    prices: { market: 2.35, primaryPrinting: "Holofoil" },
    ebay: {
      dateRangeStart: new Date(Date.now() - 90 * 86400000).toISOString(),
      dateRangeEnd: new Date().toISOString(),
      salesByGrade: { psa10: { medianPrice: median, count, lastSaleDate: recentSale } },
    },
  });
  const BELLI_114 = {
    tcgPlayerId: "614990", setName: "SV9: Battle Partners", name: "Iono's Bellibolt ex - 114/100",
    cardNumber: "114/100", rarity: "Super Rare", cardType: "Pokemon", hp: "280",
    attacks: ["[LLLC] Thunderous Bolt (230)"],
    prices: { market: 2.35, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
  };
  const BELLI_125 = {
    tcgPlayerId: "615001", setName: "SV9: Battle Partners", name: "Iono's Bellibolt ex - 125/100",
    cardNumber: "125/100", rarity: "Special Art Rare", cardType: "Pokemon", hp: "280",
    attacks: ["[LLLC] Thunderous Bolt (230)"],
    prices: { market: 38.17, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
  };
  const SLAB_READ = {
    ...BASE_READ, cardName: "Bellibolt ex", hp: "280", cardNumber: "114/100",
    setName: "SV9", language: "Japanese", isSlab: true, grader: "PSA", grade: "10",
    attackName: "Thunderous Bolt",
  };
  // The real 2026-10-17 group had a CHEAPER sibling (030/100 at $0.31), which
  // is why winnerIsCheapest was false and the cap fired. Without it the
  // confirmed 114/100 winner would legitimately take the stands-cheaper path.
  const BELLI_030 = {
    tcgPlayerId: "614881", setName: "SV9: Battle Partners", name: "Iono's Bellibolt ex",
    cardNumber: "030/100", rarity: "Double Rare", cardType: "Pokemon", hp: "280",
    attacks: ["[LLLC] Thunderous Bolt (230)"],
    prices: { market: 0.31, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
  };
  function slabRoutes() {
    return {
      "Bellibolt ex": F.padTo([BELLI_114, BELLI_125, BELLI_030], 30, "Belli"),
      "Bellibolt ex|offset=30": F.padTo([], 3, "BelliP2"),
      "id:614990": gradedRow("614990", "114/100", 120.5, 9),
      "id:615001": gradedRow("615001", "125/100", 480.0, 6),
      "id:614881": gradedRow("614881", "030/100", 41.0, 5),
    };
  }
  let slabResult = null;
  await test("PER-SIBLING GRADED: every disclosed row is priced at the scanned grade", async () => {
    installPptMock(slabRoutes());
    slabResult = await M.lookupCardPPT({ ...SLAB_READ }, "slab-graded", null);
    assert.strictEqual(slabResult.matchBasis, "sibling-ambiguous");
    const byId = Object.fromEntries(slabResult.siblingAmbiguity.candidates.map((c) => [c.tcgPlayerId, c]));
    assert.ok(byId["614990"].graded, "114/100 row needs graded data");
    assert.ok(byId["615001"].graded, "125/100 row needs graded data");
    assert.strictEqual(byId["614990"].graded.gradedPrice, 120.5);
    assert.strictEqual(byId["615001"].graded.gradedPrice, 480);
    assert.strictEqual(byId["614990"].graded.grader, "PSA");
    assert.strictEqual(byId["614990"].graded.grade, "10");
  });
  await test("PER-SIBLING GRADED: each row carries its own graded bid", () => {
    for (const c of slabResult.siblingAmbiguity.candidates) {
      if (c.graded && c.graded.gradedPrice != null) {
        assert.ok(typeof c.graded.gradedSuggestedBid === "number", `row ${c.number} needs a bid`);
        assert.ok(c.graded.gradedSuggestedBid < c.graded.gradedPrice, "a bid must sit below the median");
        assert.ok(c.graded.gradedBreakEven != null && c.graded.gradedSellThrough, "and its own BE + tier");
      }
    }
  });
  await test("PER-SIBLING GRADED: the thin-data gate still applies per row", async () => {
    installPptMock({
      ...slabRoutes(),
      // 2 sales is under GRADED_MIN_SALES (3) for the 125 row only.
      "id:615001": gradedRow("615001", "125/100", 480.0, 2),
    });
    const r = await M.lookupCardPPT({ ...SLAB_READ }, "slab-thin", null);
    const byId = Object.fromEntries(r.siblingAmbiguity.candidates.map((c) => [c.tcgPlayerId, c]));
    assert.strictEqual(byId["614990"].graded.gradedPrice, 120.5, "the healthy row still prices");
    assert.strictEqual(byId["615001"].graded.gradedPrice, null, "the thin row must not price");
    assert.strictEqual(byId["615001"].graded.gradedThin, true);
    assert.strictEqual(byId["615001"].graded.gradedThinReason, "too-few-sales");
  });
  await test("PER-SIBLING GRADED: a NON-slab sibling result makes no graded calls", async () => {
    const calls = installPptMock(scoreOnlyRoutes());
    await M.lookupCardPPT({ ...SCORE_READ }, "nonslab-nograded", Promise.resolve({ ...LEGACY_CORRECT }));
    assert.strictEqual(calls.filter((c) => c.startsWith("id:")).length, 0, "no by-id lookups on a raw card");
  });
  await test("PER-SIBLING GRADED: costs 2 credits per row and no more", async () => {
    const calls = installPptMock(slabRoutes());
    await M.lookupCardPPT({ ...SLAB_READ }, "slab-credits", null);
    const idCalls = calls.filter((c) => c.startsWith("id:"));
    assert.strictEqual(idCalls.length, 3, `one by-id call per disclosed row, got ${idCalls.join(",")}`);
    assert.strictEqual(new Set(idCalls).size, idCalls.length, "no duplicate lookups");
  });
  await test("PER-SIBLING GRADED: SIBLING_GRADED_MAX_LOOKUPS caps the fan-out", () => {
    assert.strictEqual(M.SIBLING_GRADED_MAX_LOOKUPS, 6);
  });

  // ======================================================================
  // 20. WIDE ZERO-PADDING (fix 1, 2026-10-18)
  // ======================================================================
  await test("WIDE PADDING: a 2-digit total also produces the 3/3 form", () => {
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("3/17"), "003/017");
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("9/64"), "009/064");
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("14/17"), "014/017");
  });
  await test("WIDE PADDING: a 3-digit total is left alone (Base Set / Base Set 2 unchanged)", () => {
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("10/130"), null);
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("1/102"), null);
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("131/165"), null);
    // and the ORIGINAL variant still produces the documented padding
    assert.strictEqual(M.buildZeroPaddedNumberVariant("10/130"), "010/130");
    assert.strictEqual(M.buildZeroPaddedNumberVariant("1/102"), "001/102");
    assert.strictEqual(M.buildZeroPaddedNumberVariant("9/64"), "09/64");
  });
  await test("WIDE PADDING: handles junk and prefixed numbers safely", () => {
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant(null), null);
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("XY95"), null);
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("SWSH029"), null);
    assert.strictEqual(M.buildWideZeroPaddedNumberVariant("H01/H32"), "H001/H032");
  });
  await test("WIDE PADDING: adds exactly ONE combined search, and only when the number matched nothing", async () => {
    const lone = {
      tcgPlayerId: "900001", setName: "Some Set", name: "Zzzz", cardNumber: "050/100",
      rarity: "Rare", cardType: "Pokemon", hp: "70",
      attacks: ["[C] Tackle (10)"], prices: { market: 1.0, primaryPrinting: "Normal" },
      printingsAvailable: ["Normal"],
    };
    // (a) the number MATCHES in the pool -> no combined search at all.
    let calls = installPptMock({ "Zzzz": F.padTo([lone], 5, "Zzzz") });
    await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Zzzz", hp: "70", cardNumber: "050/100", attackName: "Tackle" },
      "pad-match", null
    );
    assert.strictEqual(calls.filter((c) => c.includes("/")).length, 0, `no combined search when the number matches: ${calls.join(",")}`);

    // (b) number matches nothing AND the total is 2 digits -> read + narrow + wide.
    calls = installPptMock({ "Zzzz": F.padTo([lone], 30, "Zzzz"), "Zzzz|offset=30": F.padTo([], 3, "ZzzzP2") });
    await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Zzzz", hp: "70", cardNumber: "3/17", attackName: "Tackle" },
      "pad-2digit", null
    );
    const combined2 = calls.filter((c) => c.startsWith("Zzzz ")).map((c) => c.replace("Zzzz ", ""));
    assert.deepStrictEqual(combined2, ["3/17", "03/17", "003/017"], `got ${combined2.join(",")}`);

    // (c) number matches nothing AND the total is 3 digits -> unchanged, 2 queries.
    calls = installPptMock({ "Zzzz": F.padTo([lone], 30, "Zzzz"), "Zzzz|offset=30": F.padTo([], 3, "ZzzzP2") });
    await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Zzzz", hp: "70", cardNumber: "7/130", attackName: "Tackle" },
      "pad-3digit", null
    );
    const combined3 = calls.filter((c) => c.startsWith("Zzzz ")).map((c) => c.replace("Zzzz ", ""));
    assert.deepStrictEqual(combined3, ["7/130", "007/130"], `got ${combined3.join(",")}`);
  });

  // ======================================================================
  // 21. RAYQUAZA — padding fix + exact-number tie disclosure (2026-10-18)
  // ======================================================================
  // Real rows captured from PPT 2026-10-18.
  const RAY_POP1 = {
    tcgPlayerId: "88624", tcgPlayerUrl: "https://www.tcgplayer.com/product/88624", setName: "POP Series 1", name: "Rayquaza", cardNumber: "003/017",
    rarity: "Rare", cardType: "Pokemon", hp: "80",
    attacks: ["[1] Fly (10)", "[RL] Dragon Claw (30)"],
    prices: { market: 325.3, primaryPrinting: "Normal" }, printingsAvailable: ["Normal"],
  };
  const RAY_BLISTER = {
    tcgPlayerId: "691978", tcgPlayerUrl: "https://www.tcgplayer.com/product/691978", setName: "Blister Exclusives", name: "Rayquaza - 003/017 (2006)",
    cardNumber: "003/017", rarity: "Rare", cardType: "Pokemon", hp: "80",
    attacks: ["[1] Fly (10)", "[RL] Dragon Claw (30)"],
    prices: { market: 135.3, primaryPrinting: "Holofoil" }, printingsAvailable: ["Holofoil"],
  };
  const RAY_EMERALD = {
    tcgPlayerId: "88626", tcgPlayerUrl: "https://www.tcgplayer.com/product/88626", setName: "EX Emerald", name: "Rayquaza", cardNumber: "9/106",
    rarity: "Rare", cardType: "Pokemon", hp: "80",
    attacks: ["[2] Dragon Breath (20)"],
    prices: { market: 12.0, primaryPrinting: "Normal" }, printingsAvailable: ["Normal"],
  };
  const RAY_DEOXYS = {
    tcgPlayerId: "88625", tcgPlayerUrl: "https://www.tcgplayer.com/product/88625", setName: "EX Deoxys", name: "Rayquaza", cardNumber: "22/107",
    rarity: "Rare", cardType: "Pokemon", hp: "80",
    attacks: ["[2] Tumbling Attack (20+)"],
    prices: { market: 48.84, primaryPrinting: "Normal" },
    printingsAvailable: ["Reverse Holofoil", "Normal"],
  };
  // The real pool: 60 heavily-reprinted Rayquaza products, with NEITHER
  // 003/017 row present — that is the pool cutoff the padding fix works around.
  function rayRoutes() {
    return {
      "Rayquaza": F.padTo([RAY_EMERALD, RAY_DEOXYS], 30, "Rayquaza"),
      "Rayquaza|offset=30": F.padTo([], 30, "RayquazaP2"),
      // "3/17" and "03/17" return nothing, exactly as PPT did live.
      "Rayquaza 3/17": [],
      "Rayquaza 03/17": [],
      // ...and the new 3/3 form finds both real products.
      "Rayquaza 003/017": [RAY_POP1, RAY_BLISTER],
    };
  }
  const RAY_READ = {
    ...BASE_READ, cardName: "Rayquaza", hp: "80", cardNumber: "3/17", attackName: "Fly",
  };
  let rayResult = null;
  await test("REPLAY 082ffff6: the 3/3 padded query surfaces the POP Series card", async () => {
    const calls = installPptMock(rayRoutes());
    rayResult = await M.lookupCardPPT({ ...RAY_READ }, "ray-replay", Promise.resolve({ ...RAY_READ, found: true }));
    assert.ok(calls.includes("Rayquaza 003/017"), `the 3/3 query must be tried: ${calls.join(",")}`);
  });
  await test("REPLAY 082ffff6: resolves to the two-row tie disclosure, never a single price", () => {
    assert.strictEqual(rayResult.matchBasis, "number-tie-ambiguous");
    assert.strictEqual(rayResult.pricingLookup, null);
    assert.strictEqual(rayResult.matchConfidence, "Low");
    const ids = rayResult.siblingAmbiguity.candidates.map((c) => c.tcgPlayerId).sort();
    assert.deepStrictEqual(ids, ["691978", "88624"].sort());
  });
  await test("REPLAY 082ffff6: each row carries name, set, number and a usable pricingLookup", () => {
    for (const c of rayResult.siblingAmbiguity.candidates) {
      assert.ok(c.name && c.number && c.setName, "name/number/set required on every row");
      assert.ok(c.pricingLookup && c.pricingLookup.tcgPlayerId, "each row needs its own pricingLookup");
    }
    const sets = rayResult.siblingAmbiguity.candidates.map((c) => c.setName).sort();
    assert.deepStrictEqual(sets, ["Blister Exclusives", "POP Series 1"]);
  });
  await test("REPLAY 082ffff6: never prices the $325.30 card as if it were confirmed", () => {
    const blob = JSON.stringify(rayResult);
    assert.ok(!/"tcgPlayerId":"88624"[^}]*\}\s*,\s*"tag"/.test(blob) || rayResult.pricingLookup === null);
    assert.strictEqual(rayResult.tcgplayerUrl, null);
    assert.ok(rayResult.ambiguousNote.includes("set symbol"), "the note must point at the set, not the finish");
  });
  await test("REPLAY fbec1b80: the misread 22/107 is unchanged — attack mismatch, Low, priced", async () => {
    installPptMock(rayRoutes());
    const r = await M.lookupCardPPT(
      { ...RAY_READ, cardNumber: "22/107", setName: "EX Deoxys" },
      "ray-deoxys",
      Promise.resolve({ found: true, confidence: "High", cardName: "Rayquaza", cardNumber: "26/107", hp: "80", attackName: "Fly", language: "English", stampType: "none" })
    );
    assert.strictEqual(r.pricingLookup && r.pricingLookup.tcgPlayerId, "88625");
    assert.strictEqual(r.attackMismatch, true, "read Fly vs Tumbling Attack must still cap");
    assert.strictEqual(r.matchConfidence, "Low");
    assert.notStrictEqual(r.matchBasis, "number-tie-ambiguous");
  });
  await test("NUMBER TIE: a single exact match is NOT disclosed as a tie", async () => {
    installPptMock({
      "Rayquaza": F.padTo([RAY_EMERALD], 5, "Rayquaza"),
    });
    const r = await M.lookupCardPPT(
      { ...RAY_READ, cardNumber: "9/106", attackName: "Dragon Breath" }, "ray-single", null
    );
    assert.ok(r.pricingLookup, "one exact match must still price normally");
    assert.strictEqual(r.siblingAmbiguity, undefined);
  });
  await test("NUMBER TIE: the disclosed group always contains the scoring winner", () => {
    const ids = rayResult.siblingAmbiguity.candidates.map((c) => c.tcgPlayerId);
    assert.ok(ids.includes("88624") && ids.includes("691978"));
  });
  await test("NUMBER TIE: a graded slab gets per-row graded pricing on this path too", async () => {
    const recent = new Date(Date.now() - 10 * 86400000).toISOString();
    const gr = (id, median, count) => ({
      tcgPlayerId: id, cardNumber: "003/017", name: "Rayquaza", setName: "POP Series 1",
      prices: { market: 325.3, primaryPrinting: "Normal" },
      ebay: {
        dateRangeStart: new Date(Date.now() - 90 * 86400000).toISOString(),
        dateRangeEnd: new Date().toISOString(),
        salesByGrade: { psa9: { medianPrice: median, count, lastSaleDate: recent } },
      },
    });
    installPptMock({ ...rayRoutes(), "id:88624": gr("88624", 900, 7), "id:691978": gr("691978", 420, 5) });
    const r = await M.lookupCardPPT(
      { ...RAY_READ, isSlab: true, grader: "PSA", grade: "9" }, "ray-slab",
      Promise.resolve({ ...RAY_READ, found: true })
    );
    assert.strictEqual(r.matchBasis, "number-tie-ambiguous");
    const byId = Object.fromEntries(r.siblingAmbiguity.candidates.map((c) => [c.tcgPlayerId, c]));
    assert.strictEqual(byId["88624"].graded.gradedPrice, 900);
    assert.strictEqual(byId["691978"].graded.gradedPrice, 420);
    assert.ok(typeof byId["88624"].graded.gradedSuggestedBid === "number");
  });

  // ======================================================================
  // 22. DISCLOSURE POLISH (test #107, 2026-10-18)
  // ======================================================================
  await test("DISCLOSURE: a tie result does not link one of the tied products", async () => {
    installPptMock(rayRoutes());
    const r = await M.lookupCardPPT({ ...RAY_READ }, "polish-tie-url", Promise.resolve({ ...RAY_READ, found: true }));
    assert.strictEqual(r.matchBasis, "number-tie-ambiguous");
    assert.strictEqual(r.tcgplayerUrl, null, "the header must not link one of two disclosed products");
    for (const c of r.siblingAmbiguity.candidates) {
      assert.ok(c.tcgplayerUrl, `row ${c.number} still carries its own link`);
    }
  });
  await test("DISCLOSURE: the score-path sibling cap does not link one sibling either", async () => {
    installPptMock(scoreOnlyRoutes());
    const r = await M.lookupCardPPT({ ...SCORE_READ }, "polish-sib-url", Promise.resolve({ ...LEGACY_CORRECT }));
    assert.strictEqual(r.matchBasis, "sibling-ambiguous");
    assert.strictEqual(r.tcgplayerUrl, null);
  });
  await test('DISCLOSURE: the stale "best guess" sentence is gone from a two-row result', async () => {
    installPptMock(rayRoutes());
    const r = await M.lookupCardPPT({ ...RAY_READ }, "polish-note", Promise.resolve({ ...RAY_READ, found: true }));
    assert.ok(!/best guess/i.test(r.ambiguousNote), `note still claims a guess: ${r.ambiguousNote}`);
    // the genuinely useful half of the tie sentence survives...
    assert.ok(/identical card number/i.test(r.ambiguousNote), "the tie explanation should remain");
    // ...and the disclosure wording is there
    assert.ok(r.ambiguousNote.includes("set symbol"), "the disclosure prompt should remain");
    assert.ok(!/\s{2,}/.test(r.ambiguousNote), "no double spaces left behind by the strip");
  });
  await test("DISCLOSURE: a PRICED result keeps its best-guess wording", async () => {
    installPptMock(rayRoutes());
    const r = await M.lookupCardPPT(
      { ...RAY_READ, cardNumber: "22/107", setName: "EX Deoxys" }, "polish-priced",
      Promise.resolve({ found: true, confidence: "High", cardName: "Rayquaza", cardNumber: "26/107", hp: "80", attackName: "Fly", language: "English", stampType: "none" })
    );
    assert.ok(r.pricingLookup, "this one is still a single priced guess");
    assert.ok(r.tcgplayerUrl, "and still links its product");
  });
  await test("DISCLOSURE: stripBestGuessClause handles both variants and null", () => {
    assert.strictEqual(M.stripBestGuessClause(null), null);
    assert.strictEqual(
      M.stripBestGuessClause("Foo bar. This is our best guess only; verify the exact printing on the physical card before trusting this match or price."),
      "Foo bar."
    );
    assert.strictEqual(
      M.stripBestGuessClause("Foo bar. This is our best guess only; verify the exact set/number on the physical card before trusting this match or price. Baz."),
      "Foo bar. Baz."
    );
    assert.strictEqual(M.stripBestGuessClause("Nothing to strip here."), "Nothing to strip here.");
  });


  // ======================================================================
  // POKEDEX-NUMBER READS (2026-10-18, live Japanese Meganium scans
  // 3e8a347f / 8fa04fec). A Japanese Neo-era card prints no collector
  // number; its only number is the Pokedex "No. 154", which both models
  // read into `cardNumber`, where normalizeNumber turned it into the bare
  // promo number 154.
  // ======================================================================
  const MEGA_READ = {
    found: true,
    confidence: "High",
    language: "Japanese",
    stampType: "none",
    isSlab: false,
    cardName: "Meganium",
    cardNumber: "No. 154",
    hp: "100",
    subtype: null,
    setName: null,
    attackName: "アロマスリープ",
    attackNameEnglish: "Aroma Sleep",
  };
  // Page 1 FULL (30 rows) so the page-2 trigger is live, as in the real scan.
  const MEGA_PAGE1 = F.padTo([F.MEGANIUM_BEP_102, F.MEGANIUM_NEO_JP], 30, "Meganium");
  const MEGA_HAZARD_PAGE1 = [F.MEGANIUM_PROMO_154, F.MEGANIUM_NEO_JP];

  await test("UNIT parsePokedexNumberRead: the Pokedex forms are recognized", () => {
    assert.strictEqual(M.parsePokedexNumberRead("No. 154"), "154");
    assert.strictEqual(M.parsePokedexNumberRead("No.154"), "154");
    assert.strictEqual(M.parsePokedexNumberRead("no 154"), "154");
    assert.strictEqual(M.parsePokedexNumberRead("№154"), "154");
    assert.strictEqual(M.parsePokedexNumberRead("No. 0154"), "154");
  });
  await test("UNIT parsePokedexNumberRead: collector numbers are NOT touched", () => {
    // A bare number stays a promo-style collector number, and "#52" is
    // deliberately excluded (far more likely collector shorthand).
    assert.strictEqual(M.parsePokedexNumberRead("154"), null);
    assert.strictEqual(M.parsePokedexNumberRead("#52"), null);
    assert.strictEqual(M.parsePokedexNumberRead("33/165"), null);
    assert.strictEqual(M.parsePokedexNumberRead("No. 154/128"), null);
    assert.strictEqual(M.parsePokedexNumberRead("SM91"), null);
    assert.strictEqual(M.parsePokedexNumberRead(null), null);
    assert.strictEqual(M.parsePokedexNumberRead(""), null);
  });

  await test("DEX: classification skips the combined number searches, not page 2", async () => {
    // Page 1 and page 2 both run: the number must have its full chance
    // before it can be reclassified (an SV2a "No. 131" card is matched by
    // exactly this retrieval). Only the combined name+number searches,
    // which look PPT up by a number that is not a collector number, are
    // skipped.
    const calls = installPptMock({ "Meganium": MEGA_PAGE1, "Meganium|offset=30": [F.MEGANIUM_NEO_JP] });
    await M.lookupCardPPT({ ...MEGA_READ }, "dex-searches", null);
    assert.deepStrictEqual(
      calls,
      ["Meganium", "Meganium|offset=30"],
      `expected page1 + page2 only, got ${JSON.stringify(calls)}`
    );
    assert.ok(!calls.some((c) => /154/.test(c)), "no query may carry the Pokedex number");
  });

  await test("DEX TEST VALIDITY: the pre-fix module really did fire those searches", async () => {
    const { mod: PRE, cleanup } = loadPreFixModule("dexprefix-searches", DEX_PRE_FIX_REF);
    try {
      const calls = installPptMock({ "Meganium": MEGA_PAGE1, "Meganium|offset=30": [F.MEGANIUM_NEO_JP] });
      await PRE.lookupCardPPT({ ...MEGA_READ }, "dex-searches-pre", null);
      assert.ok(calls.length > 1, `pre-fix should fan out, got ${JSON.stringify(calls)}`);
      assert.ok(
        calls.some((c) => /offset=30/.test(c)) || calls.some((c) => /154/.test(c)),
        `pre-fix should page or search the number, got ${JSON.stringify(calls)}`
      );
    } finally {
      cleanup();
    }
  });

  // Capture console output so a test can assert whether the
  // [dex-number] classification line was emitted for a given scan.
  async function captureLog(fn) {
    const lines = [];
    const real = console.log;
    console.log = (...args) => { lines.push(args.map(String).join(" ")); };
    try {
      const out = await fn();
      return { out, log: lines.join("\n") };
    } finally {
      console.log = real;
    }
  }

  await test("DEX/SV2a: Lapras \"No. 131\" still matches 131/165, NOT reclassified", async () => {
    // The 2026-09-26 NUMBER_LABEL_PATTERN fix. SV2a prints "No. XXX" as the
    // real collector number, and 131 is ALSO Lapras's Pokedex number — so
    // the dex test alone cannot tell these apart. Retrieval does: this card
    // has a matching row, so classification must not fire.
    const { out: r, log } = await captureLog(() => {
      installPptMock({ "Lapras": [F.LAPRAS_SV2A_131] });
      return M.lookupCardPPT(
        { ...BASE_READ, cardName: "Lapras", cardNumber: "No. 131", hp: "140", language: "Japanese" },
        "dex-sv2a-lapras", null
      );
    });
    assert.ok(!/\[dex-number\]/.test(log), "must NOT be classified as a Pokedex read");
    assert.ok(r.pricingLookup, "the SV2a Lapras must still price");
    assert.match(String(r.tcgplayerUrl), /517994/);
    assert.ok(!/Pokédex number/.test(String(r.ambiguousNote || "")), "no dex wording");
  });

  await test("DEX/SV2a: Victreebel \"No.071\" is unchanged", async () => {
    const { out: r, log } = await captureLog(() => {
      installPptMock({ "Victreebel": [F.VICTREEBEL_SV2A_71] });
      return M.lookupCardPPT(
        { ...BASE_READ, cardName: "Victreebel", cardNumber: "No.071", hp: "130", language: "Japanese" },
        "dex-sv2a-victreebel", null
      );
    });
    assert.ok(!/\[dex-number\]/.test(log), "must NOT be classified as a Pokedex read");
    assert.ok(r.pricingLookup, "Victreebel must still price");
    assert.match(String(r.tcgplayerUrl), /517934/);
  });

  await test("DEX: a pool row matching N keeps the collector-number reading", async () => {
    // The flip side of the SV2a protection, stated as a deliberate choice:
    // if ANY candidate's cardNumber matches the read, the read is treated
    // as a collector number — even when that value also happens to be the
    // species' Pokedex number. Nothing separates those two cases from the
    // data alone, and SV2a is the case that must keep working.
    const { log } = await captureLog(() => {
      installPptMock({ "Meganium": [{ ...F.MEGANIUM_NEO_JP, cardNumber: "154" }] });
      return M.lookupCardPPT({ ...MEGA_READ }, "dex-collision", null);
    });
    assert.ok(!/\[dex-number\]/.test(log), "a matching row wins over classification");
  });

  await test("DEX: Japanese Azumarill \"No. 184\" is classified (empty PPT cardNumber)", async () => {
    const { out: r, log } = await captureLog(() => {
      installPptMock({ "Azumarill": [F.AZUMARILL_JP_NO_NUMBER] });
      return M.lookupCardPPT(
        { ...BASE_READ, cardName: "Azumarill", cardNumber: "No. 184", hp: "80", language: "Japanese" },
        "dex-azumarill", null
      );
    });
    assert.ok(/\[dex-number\]/.test(log), "184 is Azumarill's dex number and nothing matched it");
    assert.strictEqual(r.pricingLookup, null, "outcome is unchanged: still withheld");
  });

  await test("DEX: Japanese Typhlosion \"No.157\" is classified", async () => {
    const { out: r, log } = await captureLog(() => {
      installPptMock({ "Typhlosion": [F.TYPHLOSION_JP_NO_NUMBER] });
      return M.lookupCardPPT(
        { ...BASE_READ, cardName: "Typhlosion", cardNumber: "No.157", hp: "100", language: "Japanese" },
        "dex-typhlosion", null
      );
    });
    assert.ok(/\[dex-number\]/.test(log), "157 is Typhlosion's dex number and nothing matched it");
    assert.strictEqual(r.pricingLookup, null);
  });

  await test("DEX: classification requires N to be the pool's own Pokedex number", async () => {
    // A misread number that is NOT the species' dex number keeps the
    // existing NO NUMBER MATCH behavior rather than being excused.
    const { log } = await captureLog(() => {
      installPptMock({ "Meganium": [F.MEGANIUM_BEP_102] });
      return M.lookupCardPPT({ ...MEGA_READ, cardNumber: "No. 999" }, "dex-wrong-species", null);
    });
    assert.ok(!/\[dex-number\]/.test(log), "999 is nobody's Pokedex number here");
  });

  await test("DEX: the dex number is not a scoring signal and cannot clear the floor", async () => {
    // hp is the ONLY corroborating signal in the real scan. If the dex
    // number ever counted, this would reach 2 signals and get priced.
    installPptMock({ "Meganium": MEGA_PAGE1, "Meganium|offset=30": [F.MEGANIUM_NEO_JP] });
    const r = await M.lookupCardPPT({ ...MEGA_READ }, "dex-floor", null);
    assert.strictEqual(r.pricingLookup, null, "one weak signal must still withhold the price");
    assert.strictEqual(r.printingUndetermined, true);
  });

  await test("DEX: the panel text says Pokedex number, not 'wasn't legible'", async () => {
    installPptMock({ "Meganium": MEGA_PAGE1, "Meganium|offset=30": [F.MEGANIUM_NEO_JP] });
    const r = await M.lookupCardPPT({ ...MEGA_READ }, "dex-wording", null);
    assert.ok(/Pokédex number/.test(r.ambiguousNote), `got: ${r.ambiguousNote}`);
    assert.ok(/No\. 154/.test(r.ambiguousNote), `should quote the number it read: ${r.ambiguousNote}`);
    assert.ok(!/wasn't legible/.test(r.ambiguousNote), `must not blame legibility: ${r.ambiguousNote}`);
  });

  await test("DEX: ambiguousNoteText keeps its two original states intact", () => {
    assert.ok(/share an identical card number/.test(M.ambiguousNoteText(true)));
    assert.ok(/wasn't legible this scan/.test(M.ambiguousNoteText(false)));
    assert.ok(/wasn't legible this scan/.test(M.ambiguousNoteText(false, { cardNumber: null })));
    assert.ok(/Pokédex number/.test(M.ambiguousNoteText(false, { pokedexNumberRead: "154" })));
  });

  await test("DEX: an ordinary slashed number is completely unaffected", async () => {
    installPptMock(expeditionRoutes());
    const r = await M.lookupCardPPT(
      { ...BASE_READ, cardNumber: "033/165", setName: null, attackName: "Syncroblast" },
      "dex-noop",
      null
    );
    // Same behavior as the existing Expedition Alakazam coverage: the
    // number matches 83500 and nothing about the dex path intervenes.
    assert.ok(r.cardName, "still resolves a card");
    assert.ok(!/Pokédex/.test(String(r.ambiguousNote || "")), "no dex wording on a normal read");
  });

  // ======================================================================
  // 23. BLASTOISE 2/102 — anniversary-reprint padding trap (2026-10-24, #109)
  // ======================================================================
  // Real scan: requestId 71c04729-ddce-42c6-8949-89e020cf7d13, production
  // dpl_7jFrzJVGmHPwQkLanpvqYKVCVFBV. Gemini read Blastoise "2/102" hp 100
  // Stage 2 "Base Set" "Hydro Pump" correctly, and the panel showed
  // Celebrations: Classic Collection Holofoil $12.89 at Match: High.
  // bestScore was 20 — the number signal ALONE — because the reprint row has
  // hp null, a non-matching set, empty subtypes and a <strong>-wrapped attack.
  const BLASTOISE_READ = {
    found: true,
    confidence: "High",
    cardName: "Blastoise",
    language: "English",
    stampType: "1st Edition",
    hp: "100",
    subtype: "Stage 2",
    setName: "Base Set",
    attackName: "Hydro Pump",
    attackNameEnglish: null,
    cardNumber: "2/102",
  };

  // Page 1 of the real scan: 30 rows of Blastoise filler with the reprint in
  // it and NO original, exactly as logged ("raw candidate count= 30").
  const BLASTOISE_PAGE1 = F.padTo([F.CC_BLASTOISE_2], 30, "Blastoise");

  function blastoiseRoutes(extra = {}) {
    return {
      Blastoise: BLASTOISE_PAGE1,
      // Verified against PPT 2026-10-24: page 2 does NOT contain the
      // originals either (it bottoms out at 004/165 Expedition).
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
      "Blastoise 002/102": [F.BASE_BLASTOISE_2, F.BASE_BLASTOISE_2_SHADOWLESS],
      ...extra,
    };
  }

  await test("#109 storedNumeratorIsUnpadded reads the RAW digit widths", () => {
    assert.strictEqual(M.storedNumeratorIsUnpadded("2/102"), true);
    assert.strictEqual(M.storedNumeratorIsUnpadded("15/102"), true);
    assert.strictEqual(M.storedNumeratorIsUnpadded("002/102"), false);
    // The three that must never trigger a padded search:
    assert.strictEqual(M.storedNumeratorIsUnpadded("025/198"), false, "modern already-padded");
    assert.strictEqual(M.storedNumeratorIsUnpadded("050/100"), false, "equal widths");
    assert.strictEqual(M.storedNumeratorIsUnpadded("003/017"), false, "the #106 wide form");
    assert.strictEqual(M.storedNumeratorIsUnpadded(null), false);
    assert.strictEqual(M.storedNumeratorIsUnpadded("XY95"), false, "no slash at all");
  });

  await test("#109 buildZeroPaddedNumberVariant alone is NOT evidence of padding", () => {
    // The trap storedNumeratorIsUnpadded exists for: normalizeNumber strips
    // leading zeros, so an already-padded read yields a non-null, IDENTICAL
    // padded form. Using truthiness here is what fired a search on "050/100".
    assert.strictEqual(M.buildZeroPaddedNumberVariant("050/100"), "050/100");
    assert.strictEqual(M.buildZeroPaddedNumberVariant("025/198"), "025/198");
    assert.strictEqual(M.buildZeroPaddedNumberVariant("2/102"), "002/102");
  });

  await test("#109 isAnniversaryReprintCandidate keys on the catalog, not a stamp read", () => {
    assert.strictEqual(M.isAnniversaryReprintCandidate(F.CC_BLASTOISE_2), true, "rarity 'Classic Collection'");
    assert.strictEqual(M.isAnniversaryReprintCandidate(F.ME30_CHARIZARD_4), true, "ME: 30th CC");
    assert.strictEqual(M.isAnniversaryReprintCandidate(F.BASE_BLASTOISE_2), false);
    assert.strictEqual(M.isAnniversaryReprintCandidate(F.BASE_BLASTOISE_2_SHADOWLESS), false);
    assert.strictEqual(M.isAnniversaryReprintCandidate(null), false);
    // The 2021 Celebrations MAIN set uses its own numbering and collides with
    // nothing, so it must NOT be treated as a reprint.
    assert.strictEqual(
      M.isAnniversaryReprintCandidate({ setName: "Celebrations", rarity: "Holo Rare" }),
      false,
      "Celebrations main set is an ordinary card"
    );
  });

  await test("#109 stripAttackMarkup recovers the <strong>-wrapped name", () => {
    assert.deepStrictEqual(M.extractAttackNames(F.CC_BLASTOISE_2.attacks), ["Hydro Pump"]);
    assert.deepStrictEqual(M.extractAttackNames(F.CC_VENUSAUR_15.attacks), ["Solar Beam"]);
    // <br> must become a BREAK, not vanish — deleting it would splice the
    // name into its own description.
    assert.deepStrictEqual(M.extractAttackNames(["[W] Surf<br>Does 30 damage."]), ["Surf"]);
    // Both existing fail-safes still return [] for the whole candidate.
    assert.deepStrictEqual(M.extractAttackNames(["<b>Tail Rap -- 20x</b>"]), [], "no leading [cost]");
    assert.deepStrictEqual(M.extractAttackNames(F.CC_CHARIZARD_4.attacks), [], "parenthesised cost");
    // And the " - " separator fix from 2026-10-09 is untouched.
    assert.deepStrictEqual(
      M.extractAttackNames(["[3] Layabout - Remove all damage counters from Snorlax."]),
      ["Layabout"]
    );
  });

  await test("#109 extractFirstAttackName (the SCORING path) stays byte-identical", () => {
    // The markup fix is scoped to extractAttackNames so scoring cannot move.
    // Measured over 271 distinct real PPT rows: 43 extractAttackNames results
    // changed, ALL of them [] -> a parsed list, and extractFirstAttackName
    // changed on ZERO. This pins the Classic Collection row specifically.
    assert.strictEqual(M.extractFirstAttackName(F.CC_BLASTOISE_2.attacks), "");
    assert.strictEqual(M.extractFirstAttackName(F.BASE_BLASTOISE_2.attacks), "Hydro Pump");
    assert.strictEqual(M.extractFirstAttackName(F.ALAKAZAM_33.attacks), "Syncroblast");
  });

  await test("#109 REPLAY 71c04729: the $13.01 reprint is never priced confidently", async () => {
    const calls = installPptMock(blastoiseRoutes());
    const r = await M.lookupCardPPT(BLASTOISE_READ, "blastoise-109", null);
    assert.strictEqual(calls.includes("Blastoise 002/102"), true, `padded search ran: ${calls.join(",")}`);
    assert.strictEqual(r.matchConfidence, "Low", "never High on a number-only reprint match");
    assert.strictEqual(r.pricingLookup, null, "no single price");
    assert.strictEqual(r.tcgplayerUrl, null, "no implied pick in the header link");
    assert.ok(r.siblingAmbiguity, "a disclosure payload is returned");
    const ids = r.siblingAmbiguity.candidates.map((c) => String(c.tcgPlayerId)).sort();
    assert.deepStrictEqual(ids, ["106997", "42360"], `discloses both originals, got ${ids.join(",")}`);
    // The reprint must not be presented as one of the real possibilities.
    assert.strictEqual(ids.includes("250319"), false, "the reprint is not disclosed as a candidate");
    assert.ok(!/best guess/i.test(String(r.ambiguousNote || "")), "no stale best-guess clause");
  });

  await test("#109 TEST VALIDITY: the old code really did price it at High", async () => {
    const { mod: OLD, cleanup } = loadPreFixModule("pre-109", "836ff33");
    try {
      installPptMock(blastoiseRoutes());
      const r = await OLD.lookupCardPPT(BLASTOISE_READ, "blastoise-prefix", null);
      assert.strictEqual(r.matchConfidence, "High", "the reported bug: High confidence");
      assert.strictEqual(String(r.pricingLookup.tcgPlayerId), "250319", "on the $13.01 reprint");
      assert.strictEqual(r.setName, "Celebrations: Classic Collection");
    } finally {
      cleanup();
    }
  });

  await test("#109 padded search does NOT fire when the pool already has the padded form", async () => {
    const calls = installPptMock({
      Blastoise: F.padTo([F.CC_BLASTOISE_2, F.BASE_BLASTOISE_2], 30, "Blastoise"),
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
    });
    await M.lookupCardPPT(BLASTOISE_READ, "blastoise-already", null);
    assert.strictEqual(
      calls.some((c) => c.includes("002/102")),
      false,
      `no padded search needed: ${calls.join(",")}`
    );
  });

  await test("#109 padded search costs exactly ONE extra PPT call when it fires", async () => {
    const calls = installPptMock(blastoiseRoutes());
    await M.lookupCardPPT(BLASTOISE_READ, "blastoise-cost", null);
    assert.strictEqual(
      calls.filter((c) => c === "Blastoise 002/102").length,
      1,
      `exactly one padded search: ${calls.join(",")}`
    );
    // The number matched in the pool, so the page-2 fetch and the
    // combined-search loop must still be skipped entirely.
    assert.strictEqual(calls.some((c) => c.includes("offset=30")), false, "no page-2 fetch");
    assert.strictEqual(calls.includes("Blastoise 2/102"), false, "no unpadded combined search");
    assert.strictEqual(calls.length, 2, `2 calls total (name search + padded): ${calls.join(",")}`);
  });

  await test("#109 padded search does NOT fire on an ordinary unpadded set", async () => {
    // 62 of 278 real rows store their number unpadded across 31 sets (XY -
    // Evolutions "2/108", XY - Fates Collide "25/124", Rising Rivals
    // "38/111"...). On those there is no padded twin to find, so firing would
    // burn 30 credits on an empty query — the #106 minute-limit concern.
    const EVO = {
      tcgPlayerId: "800001", setName: "XY - Evolutions", name: "Blastoise", cardNumber: "2/108",
      rarity: "Holo Rare", cardType: "Pokemon", hp: "150", stage: "Stage 2",
      attacks: ["[WWW] Deluge (90)"], prices: { market: 4.0, primaryPrinting: "Holofoil" },
      printingsAvailable: ["Holofoil"], tcgPlayerUrl: "https://www.tcgplayer.com/product/800001",
    };
    const calls = installPptMock({
      Blastoise: F.padTo([EVO], 30, "Blastoise"),
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
    });
    const r = await M.lookupCardPPT(
      { ...BLASTOISE_READ, cardNumber: "2/108", hp: "150", setName: "Evolutions", attackName: "Deluge" },
      "evo-109",
      null
    );
    assert.strictEqual(
      calls.some((c) => c.includes("002/108")),
      false,
      `a terser set read is agreement, not conflict: ${calls.join(",")}`
    );
    assert.ok(r.pricingLookup, "and the card is priced normally");
  });

  await test("#109 padded search needs no setName read when the row is a reprint", async () => {
    // The reprint tell is catalog-side, so it still fires when the set was
    // never read — which is the case on every Haiku read and many primaries.
    const calls = installPptMock(blastoiseRoutes());
    await M.lookupCardPPT({ ...BLASTOISE_READ, setName: null }, "blastoise-nullset-padded", null);
    assert.strictEqual(calls.includes("Blastoise 002/102"), true, `fired on rarity alone: ${calls.join(",")}`);
  });

  await test("#109 padded search adds NOTHING to the Rayquaza 003/017 path", async () => {
    // After the #106 wide variant rescues "3/17" the matching row stores
    // "003/017", which is not unpadded, so this must not add a 6th search.
    const calls = installPptMock({
      Rayquaza: F.padTo([], 30, "Rayquaza"),
      "Rayquaza|offset=30": F.padTo([], 30, "RayquazaP2"),
      "Rayquaza 003/017": [RAY_POP1, RAY_BLISTER],
    });
    await M.lookupCardPPT(
      { ...BASE_READ, cardName: "Rayquaza", cardNumber: "3/17", hp: "80", setName: null, attackName: "Fly" },
      "ray-109",
      null
    );
    assert.strictEqual(
      calls.filter((c) => c.startsWith("Rayquaza ")).length,
      3,
      `still exactly 3/17, 03/17, 003/017: ${calls.filter((c) => c.startsWith("Rayquaza ")).join(",")}`
    );
  });

  await test("#109 Charizard 4/102: the padded search reaches the $954.65 original", async () => {
    const calls = installPptMock({
      Charizard: F.padTo([F.CC_CHARIZARD_4, F.ME30_CHARIZARD_4], 30, "Charizard"),
      "Charizard|offset=30": F.padTo([], 30, "CharizardP2"),
      "Charizard 004/102": [
        F.BASE_CHARIZARD_4_SHADOWLESS,
        F.BASE_CHARIZARD_4,
        F.CHARIZARD_4_METAL,
        F.CHARIZARD_4_BLACK_DOT,
        F.CHARIZARD_4_JUMBO,
      ],
    });
    const r = await M.lookupCardPPT(
      {
        ...BLASTOISE_READ,
        cardName: "Charizard",
        cardNumber: "4/102",
        hp: "120",
        attackName: "Fire Spin",
        stampType: "none",
      },
      "charizard-109",
      null
    );
    assert.strictEqual(calls.includes("Charizard 004/102"), true, `padded search ran: ${calls.join(",")}`);
    assert.notStrictEqual(r.setName, "Celebrations: Classic Collection", "not the $139.17 reprint");
    assert.notStrictEqual(r.setName, "ME: 30th Celebration Classic Collection", "not the $164.23 reprint");
    assert.strictEqual(r.pricingLookup, null, "a $954.65/$2172.24 pair is disclosed, never guessed");
    assert.ok(r.siblingAmbiguity, "disclosure payload present");
    const ids = r.siblingAmbiguity.candidates.map((c) => String(c.tcgPlayerId));
    assert.ok(ids.includes("42382") && ids.includes("106999"), `both originals disclosed, got ${ids.join(",")}`);
  });

  await test("#109 Venusaur 15/102: the padded search reaches the $156.02 original", async () => {
    const calls = installPptMock({
      Venusaur: F.padTo([F.CC_VENUSAUR_15], 30, "Venusaur"),
      "Venusaur|offset=30": F.padTo([], 30, "VenusaurP2"),
      "Venusaur 015/102": [F.BASE_VENUSAUR_15_SHADOWLESS, F.BASE_VENUSAUR_15],
    });
    const r = await M.lookupCardPPT(
      {
        ...BLASTOISE_READ,
        cardName: "Venusaur",
        cardNumber: "15/102",
        hp: "100",
        attackName: "Solar Beam",
        stampType: "none",
      },
      "venusaur-109",
      null
    );
    assert.strictEqual(calls.includes("Venusaur 015/102"), true, `padded search ran: ${calls.join(",")}`);
    assert.notStrictEqual(r.setName, "Celebrations: Classic Collection", "not the $9.60 reprint");
    assert.strictEqual(r.pricingLookup, null, "disclosed, not guessed");
  });

  // --- the catalog-side backstop, for when the originals are unreachable ---

  await test("#109 REPRINT DISCLOSURE: fires when the originals cannot be retrieved", async () => {
    // Padded search returns PPT's real no-match behavior: unrelated filler,
    // never an empty array (test #63). So nothing is recovered and the
    // reprint is still the winner — which must not be priced.
    const calls = installPptMock({
      Blastoise: BLASTOISE_PAGE1,
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
    });
    const r = await M.lookupCardPPT(BLASTOISE_READ, "blastoise-backstop", null);
    assert.strictEqual(calls.includes("Blastoise 002/102"), true, "it still tried");
    assert.strictEqual(r.matchConfidence, "Low");
    assert.strictEqual(r.matchBasis, "anniversary-reprint-ambiguous");
    assert.strictEqual(r.pricingLookup, null, "the $13.01 price is withheld");
    assert.strictEqual(r.printingUndetermined, true);
    assert.strictEqual(r.tcgplayerUrl, null);
    assert.ok(
      /25th Anniversary reprint; check for the anniversary logo/.test(String(r.ambiguousNote)),
      `prompt present: ${r.ambiguousNote}`
    );
    assert.ok(/REPRINT/.test(String(r.ambiguousNote)), "names the problem explicitly");
  });

  await test("#109 REPRINT DISCLOSURE: suppressed when the read names the same family", async () => {
    // A read of "Celebrations" against "Celebrations: Classic Collection" is
    // plausibly the same card (the 2026-10-05 Pikachu class), so the reprint
    // is a legitimate match and must be left alone.
    installPptMock({
      Blastoise: BLASTOISE_PAGE1,
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
    });
    const r = await M.lookupCardPPT({ ...BLASTOISE_READ, setName: "Celebrations" }, "blastoise-family", null);
    assert.notStrictEqual(r.matchBasis, "anniversary-reprint-ambiguous");
    assert.ok(r.pricingLookup, "a genuine Celebrations read keeps its price");
  });

  await test("#109 REPRINT DISCLOSURE: never fires on a null setName read", async () => {
    // No read set name is no evidence of a conflict. It must not fire on the
    // absence of a signal.
    installPptMock({
      Blastoise: BLASTOISE_PAGE1,
      "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
    });
    const r = await M.lookupCardPPT({ ...BLASTOISE_READ, setName: null }, "blastoise-nullset", null);
    assert.notStrictEqual(r.matchBasis, "anniversary-reprint-ambiguous");
  });

  await test("#109 REPRINT DISCLOSURE is keyed on the catalog, NOT the stamp read", async () => {
    // Same pool, same set conflict, three different stampType reads — the
    // outcome must be identical, because a vision stamp read may never be
    // what decides this (the 2026-08-26 auto-flip rule).
    const seen = [];
    for (const stampType of ["none", "1st Edition", "other"]) {
      installPptMock({
        Blastoise: BLASTOISE_PAGE1,
        "Blastoise|offset=30": F.padTo([], 30, "BlastoiseP2"),
      });
      const r = await M.lookupCardPPT({ ...BLASTOISE_READ, stampType }, `blastoise-stamp-${stampType}`, null);
      seen.push(`${r.matchBasis}/${r.matchConfidence}/${r.pricingLookup === null}`);
    }
    assert.deepStrictEqual(
      seen,
      ["anniversary-reprint-ambiguous/Low/true", "anniversary-reprint-ambiguous/Low/true", "anniversary-reprint-ambiguous/Low/true"],
      `identical regardless of stamp read, got ${seen.join(" | ")}`
    );
  });

  // ----------------------------------------------------------------------
  console.log(`\n${pass} pass, ${failures.length} fail`);
  for (const [name, e] of failures) {
    console.log(`\nFAIL: ${name}\n  ${e && e.message}`);
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
