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

// filter op postcode, straat of plaats
const F = K.maakFilter("2223, Weg dicht");
assert.deepEqual(F, {pc: [[2223, 2223]], tk: ["weg dicht"]});
assert.deepEqual(K.maakFilter("5611 AB; 5600-5615 , Vestdijk").pc, [[5611, 5611], [5600, 5615]]);
assert.equal(K.maakFilter("  "), null);
const alle = {datum: "2026-11-10", woonplaatsen: wp};  // dinsdag: Teststad (2222-2223), ook Testdorp via GROEP_B
const wk = [...items, {id: "7", plaats: "Testgem", cat: "weg", titel: "Kerkstraat dicht", hinder: "middel", pc4: ["1111"], start: "2026-11-01", eind: "2026-11-30"}];
let f1 = K.planDag(g.gebieden, wk, {...alle, filter: K.maakFilter("2223")});
assert.deepEqual(f1.plaatsen.map(p => p.rijen.map(r => r.x.id).join()), ["2"]); assert.equal(f1.meldingen, 1);
f1 = K.planDag(g.gebieden, wk, {...alle, filter: K.maakFilter("kerkstraat")});
assert.deepEqual(f1.plaatsen.map(p => [p.plaats, p.rijen.map(r => r.x.id).join()]), [["Testdorp", "7"]]);
f1 = K.planDag(g.gebieden, wk, {...alle, filter: K.maakFilter("teststad")});
assert.deepEqual(f1.plaatsen.map(p => p.plaats), ["Teststad"]);
const wk2 = [...wk, {id: "8", plaats: "Testgem", cat: "weg", titel: "Kerkstraat richting Teststad", hinder: "hoog", pc4: ["1111"], start: "2026-11-01", eind: "2026-11-30"}];
f1 = K.planDag(g.gebieden, wk2, {...alle, filter: K.maakFilter("teststad")});
assert.deepEqual(f1.plaatsen.map(p => p.plaats), ["Teststad"], "plaatsnaam in de tekst van een andere plaats telt niet");
f1 = K.planDag(g.gebieden, wk, {...alle, filter: K.maakFilter("9999")});
assert.equal(f1.plaatsen.length, 0); assert.equal(f1.zonder.length, 0);
assert.equal(K.synchronisatie(g.gebieden, null, K.maakFilter("2222")).length, 0);
assert.equal(K.synchronisatie(g.gebieden, null, K.maakFilter("1100-1200")).length, 1);

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
// optimiser-export in de planning
{
  const P = require("../site/plan-kern.js");
  const kop = ["Kenmerk 1","SRit","Laad-losplaats naam","Laad-losplaats straat","Laad-losplaats postcode","Laad-losplaats plaats","Vroegste laden"];
  const g = P.leesGeogroepen([kop, ["a","101","X","Kerkstraat","5611 AB","Eindhoven","46337.25"], ["b","101","Y","Markt","5611 CD","Eindhoven","46337.3"], ["c","102","Z","Dorp","5701 AA","Helmond","12-11-2026"], ["d","442","Q","Weg","6211 AA","Maastricht","46337"]], {skip:["442","443"]});
  const fout = m => { console.error("optimiser-plan FOUT", m, JSON.stringify(g)); process.exit(1); };
  if (g.bron !== "optimiser" || g.gebieden.length !== 2 || g.groepen.join() !== "Rit 101,Rit 102" || g.overgeslagen.join() !== "442") fout("gebieden");
  if (g.datums.join() !== "2026-11-11,2026-11-12" || !g.gebieden[0].dagen[2] || g.gebieden[0].dagen[3] || !g.gebieden[1].dagen[3]) fout("dagen");
  console.log("optimiser-plan OK");
}
// klantcodes: straat genoemd = straat, alleen zelfde PC4 = gebied (optioneel)
{
  const P = require("../site/plan-kern.js");
  const kop = ["Kenmerk 1","Type","Depot","SRit","Laad-losplaats kenmerk","Laad-losplaats straat","Laad-losplaats huisnr.","Laad-losplaats postcode","Laad-losplaats plaats","Vroegste laden"];
  const g = P.leesGeogroepen([kop, ["a","L","E","101","K1","Hoofdstr.","1","5611 AB","Eindhoven","2026-11-12"], ["b","L","E","101","K2","Kerkstraat","2","5611 AC","Eindhoven","2026-11-12"]], {});
  const items = [{id:"m1", plaats:"Eindhoven", cat:"weg", hinder:"hoog", titel:"Hoofdstraat dicht", pc4:["5611"], start:"2026-11-01", eind:"2026-11-30"}];
  const fout = m => { console.error("klantcodes FOUT", m); process.exit(1); };
  if (g.klantKolom !== 4 || g.stops.length !== 2) fout("kolom");
  const a = P.klantHinder(g.stops, items, {datum:"2026-11-12"}), b = P.klantHinder(g.stops, items, {datum:"2026-11-12", gebied:true});
  if (a.length !== 1 || a[0].klant !== "K1" || a[0].niveau !== "straat") fout("straat " + JSON.stringify(a));
  if (b.length !== 2 || b[1].niveau !== "gebied") fout("gebied");
  if (P.klantHinder(g.stops, items, {datum:"2026-11-13"}).length) fout("andere dag");
  console.log("klantcodes OK");
}
