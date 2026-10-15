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

async function main() {
  const M = require(IDENTIFY);

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
  await test("REPLAY f033dcfe: lands on the correct card 83500", () => {
    assert.strictEqual(replayResult.pricingLookup.tcgPlayerId, "83500");
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
  await test("REPLAY f033dcfe against HEAD reproduces the 83497 bug (test validity)", async () => {
    const tmp = path.join(os.tmpdir(), `identify-head-${process.pid}.js`);
    const headSrc = execFileSync("git", ["show", "HEAD:api/identify.js"], {
      cwd: path.join(__dirname, ".."), maxBuffer: 64 * 1024 * 1024, encoding: "utf8",
    });
    fs.writeFileSync(tmp, headSrc + "\nmodule.exports.lookupCardPPT = lookupCardPPT;\n");
    try {
      const HEADM = require(tmp);
      installPptMock(expeditionRoutes());
      const headResult = await HEADM.lookupCardPPT(realRead, "replay-head", Promise.resolve(realLegacy));
      assert.strictEqual(
        headResult.pricingLookup && headResult.pricingLookup.tcgPlayerId,
        "83497",
        "HEAD was expected to return the wrong sibling; the replay may not be faithful"
      );
      assert.strictEqual(headResult.matchBasis, "legacy-number-rescue");
    } finally {
      fs.unlinkSync(tmp);
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
  await test("CLEAN SCAN Alakazam 33 at HEAD: the false Low is reproduced (test validity)", async () => {
    const tmp = path.join(os.tmpdir(), `identify-head2-${process.pid}.js`);
    const headSrc = execFileSync("git", ["show", "HEAD:api/identify.js"], {
      cwd: path.join(__dirname, ".."), maxBuffer: 64 * 1024 * 1024, encoding: "utf8",
    });
    fs.writeFileSync(tmp, headSrc + "\nmodule.exports.lookupCardPPT = lookupCardPPT;\n");
    try {
      const HEADM = require(tmp);
      installPptMock({ "Alakazam": F.padTo([F.ALAKAZAM_33, F.ALAKAZAM_1, ...F.LOGGED_FILLER.map(F.fillerRow)], 30, "Alakazam") });
      const r = await HEADM.lookupCardPPT(
        { ...BASE_READ, cardNumber: "033/165", attackName: "Psymimic", setName: "Expedition Base Set" },
        "clean-head", Promise.resolve({ ...realLegacy, cardNumber: "033/165", attackName: "Syncroblast" })
      );
      assert.strictEqual(r.attackMismatch, true);
      assert.strictEqual(r.matchConfidence, "Low");
    } finally {
      fs.unlinkSync(tmp);
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
    const headTmp = path.join(os.tmpdir(), `identify-head3-${process.pid}.js`);
    const headSrc = execFileSync("git", ["show", "HEAD:api/identify.js"], {
      cwd: path.join(__dirname, ".."), maxBuffer: 64 * 1024 * 1024, encoding: "utf8",
    });
    fs.writeFileSync(headTmp, headSrc + "\nmodule.exports.lookupCardPPT = lookupCardPPT;\n");
    try {
      const newCalls = installPptMock(expeditionRoutes());
      await M.lookupCardPPT({ ...realRead, cardNumber: "1/19" }, "call-count-new", Promise.resolve(realLegacy));

      const HEADM = require(headTmp);
      const headCalls = installPptMock(expeditionRoutes());
      await HEADM.lookupCardPPT({ ...realRead, cardNumber: "1/21" }, "call-count-head", Promise.resolve(realLegacy));

      assert.ok(newCalls.length > 0, "the replay should actually hit the mocked PPT");
      assert.strictEqual(
        newCalls.length, headCalls.length,
        `PPT call count changed: ${newCalls.length} (${newCalls.join(", ")}) vs HEAD ${headCalls.length} (${headCalls.join(", ")})`
      );
    } finally {
      fs.unlinkSync(headTmp);
    }
  });

  // ----------------------------------------------------------------------
  console.log(`\n${pass} pass, ${failures.length} fail`);
  for (const [name, e] of failures) {
    console.log(`\nFAIL: ${name}\n  ${e && e.message}`);
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
