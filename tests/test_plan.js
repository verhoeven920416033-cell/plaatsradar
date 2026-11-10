// Test planning op geogroepen met verzonnen gebieden. Draai: node tests/test_plan.js
const assert = require("assert"), path = require("path");
const K = require(path.join(__dirname, "..", "site", "plan-kern.js"));
const X = require(path.join(__dirname, "..", "site", "xlsx.js"));
const J = "Ja", N = "Nee";
const rijen = [["Locatie groep", "Routenummer", "Omschrijving", "Branche", "Van", "Tot", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"],
  ["GROEP_A", "Testroute", "Testdorp", 4, "1111 AA", "1111 ZZ", J, N, N, J, N, N, N],
  ["GROEP_B", "Testroute", "Testdorp", 4, "1111 AA", "1111 ZZ", J, J, J, J, J, N, N],
  ["GROEP_A", "Testroute", "Teststad", 4, "2222 AA", "2223 ZZ", N, J, N, N, N, N, N],
  ["GROEP_B", "Testroute", "Teststad", 4, "2222 AA", "2223 ZZ", N, J, N, N, N, N, N]];
const g = K.leesGeogroepen(rijen);
assert.equal(g.gebieden.length, 4); assert.deepEqual(g.groepen, ["GROEP_A", "GROEP_B"]);
assert.deepEqual(g.gebieden[2].pc4, ["2222", "2223"]);
assert.throws(() => K.leesGeogroepen([["iets", "anders"]]));
assert.equal(K.weekdag("2026-11-09"), 0);  // maandag
assert.equal(K.weekdag("2026-11-15"), 6);  // zondag

const items = [
  {id: "1", plaats: "Testgem", cat: "weg", titel: "Weg dicht", hinder: "hoog", pc4: ["1111"], perioden: [["2026-11-09T07:00", "2026-11-09T16:00"]]},
  {id: "2", plaats: "Testgem", cat: "weg", titel: "Ander werk", hinder: "middel", pc4: ["2223"], start: "2026-11-01", eind: "2026-11-30"},
  {id: "3", plaats: "Testgem", cat: "weg", titel: "Snelheid", hinder: "laag", pc4: ["1111"], start: "2026-11-01", eind: "2026-11-30"},
  {id: "4", plaats: "Testgem", cat: "weg", titel: "Fietspad", hinder: "hoog", fiets: true, pc4: ["1111"], start: "2026-11-01", eind: "2026-11-30"},
  {id: "5", plaats: "Testgem", cat: "evenement", titel: "Feest zonder plek", hinder: "middel", start: "2026-11-09"},
  {id: "6", plaats: "Testgem", cat: "weg", titel: "Buiten gebied", hinder: "hoog", pc4: ["9999"], start: "2026-11-01", eind: "2026-11-30"},
];
const wp = [{naam: "Testdorp", gemeente: "Testgem"}, {naam: "Teststad", gemeente: "Testgem"}];
let d = K.planDag(g.gebieden, items, {datum: "2026-11-09", woonplaatsen: wp});  // maandag: alleen Testdorp
assert.equal(d.dag, "maandag");
assert.deepEqual(d.plaatsen.map(p => [p.plaats, p.groepen.join("+"), p.rijen.map(r => r.x.id).join()]), [["Testdorp", "GROEP_A+GROEP_B", "1"]], JSON.stringify(d.plaatsen));
assert.deepEqual(d.zonder.map(z => z.rijen.map(x => x.id)), [["5"]]);
d = K.planDag(g.gebieden, items, {datum: "2026-11-10", woonplaatsen: wp, groepen: new Set(["GROEP_A"])});  // dinsdag, alleen A
assert.deepEqual(d.plaatsen.map(p => [p.plaats, p.rijen.map(r => r.x.id).join()]), [["Teststad", "2"]]);
d = K.planDag(g.gebieden, items, {datum: "2026-11-09", laag: true});
assert.deepEqual(d.plaatsen[0].rijen.map(r => r.x.id), ["1", "3"]);

const s = K.synchronisatie(g.gebieden);
assert.deepEqual(s.map(r => [r.pc4, r.samen, r.diensten.GROEP_A, r.diensten.GROEP_B]), [["1111", "ma do", "ma do", "ma di wo do vr"]]);  // Teststad is gelijk
(async () => {
  if (typeof Blob === "undefined" || typeof DecompressionStream === "undefined") { console.log("plan OK (xlsx-test overgeslagen)"); return; }
  const blob = X.schrijf([{naam: "Test", rijen: [["a", "b"], ["x & y", 3]]}]);
  const buf = await blob.arrayBuffer();
  const f = await X.unzip(buf, /sheet1\.xml$/);
  assert.ok(f["xl/worksheets/sheet1.xml"].includes("x &amp; y"));
  console.log("plan OK");
})();
