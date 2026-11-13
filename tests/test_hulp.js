// Hulp: postcodeplek, afstand, tijdvak, nieuw. Synthetische gegevens.
const H = require("../site/hulp.js"), R = require("../site/route-kern.js"), P = require("../site/plan-kern.js");
const fout = m => { console.error("hulp FOUT", m); process.exit(1); };
const pc6 = H.maakPc6({"5611": [54700, 514300, "AB", 10, 20, "AC", 0, 0]});
const ab = H.plek(pc6, "5611 ab");
if (!ab || Math.abs(ab[0] - 5.471) > 1e-9 || Math.abs(ab[1] - 51.432) > 1e-9) fout("plek " + ab);
if (H.plek(pc6, "5611") !== null || H.plek(pc6, "N 5611AC")[0] !== 5.47) fout("plek varianten");
const lijn = {pts: [54700, 514300, 54800, 514300]};  // west-oost, ±700 m lang
const d = H.afstand(lijn, 5.475, 51.4312);  // ±133 m ten zuiden van het midden
if (!(d > 100 && d < 160)) fout("afstand " + d);
if (H.afstand({}, 5, 51) !== Infinity) fout("zonder plek");
// tijdvak
const nacht = {perioden: [["2026-11-12T22:00", "2026-11-13T05:00"]]}, dag = {perioden: [["2026-11-12T09:00", "2026-11-12T15:00"]]};
if (H.tijdOk(nacht, "2026-11-12", "2026-11-12", "06:00", "19:00")) fout("nacht in dagvak");
if (!H.tijdOk(dag, "2026-11-12", "2026-11-12", "06:00", "19:00")) fout("dag in dagvak");
if (!H.tijdOk(nacht, "2026-11-12", "2026-11-12", "", "")) fout("leeg tijdvak");
if (!H.tijdOk({start: "2026-11-12"}, "2026-11-12", "2026-11-12", "06:00", "19:00")) fout("hele dag");
if (!H.tijdOk({}, "2026-11-12", "2026-11-12", "06:00", "19:00")) fout("datum onbekend");
// nieuw
if (!H.isNieuw({sinds: "2026-11-12T06:00"}, "2026-11-12T20:00") || H.isNieuw({sinds: "2026-11-10T06:00"}, "2026-11-12T20:00") || H.isNieuw({}, "2026-11-12")) fout("nieuw");
// routecheck: om de hoek
const P2 = R.maakPlaatsen([{naam: "Eindhoven", provincie: "Noord-Brabant", lat: 51.44, lon: 5.48}], []);
const items = [{id: "m1", plaats: "Eindhoven", cat: "weg", hinder: "hoog", titel: "Dommelstraat dicht", pts: [54700, 514300, 54800, 514300], start: "2026-11-01", eind: "2026-11-30"}];
const stop = [{route: "Route 1", straat: "Kerkstraat", nr: "1", postcode: "5611 AB", plaats: "Eindhoven"}];
const v0 = R.vergelijk(stop, items, P2, {van: "2026-11-12", tot: "2026-11-12"});
const v1 = R.vergelijk(stop, items, P2, {van: "2026-11-12", tot: "2026-11-12", plek: pc => H.plek(pc6, pc), afstand: H.afstand});
if (v0.treffers.length !== 0 || v1.treffers.length !== 1 || v1.treffers[0].niveau !== "dichtbij" || !(v1.treffers[0].afstand <= 250)) fout("routecheck dichtbij " + JSON.stringify(v1.treffers));
// planning: klantcodes om de hoek, ook in ander postcodegebied
const st = [{rit: "Rit 1", klant: "K1", straat: "Kerkstraat", nr: "1", postcode: "5611 AB", pc4: "5611", plaats: "Eindhoven", datum: "", wd: -1}];
const it2 = [{...items[0], pc4: ["5612"]}];
const k = P.klantHinder(st, it2, {datum: "2026-11-12", plek: pc => H.plek(pc6, pc), afstand: H.afstand});
if (k.length !== 1 || k[0].niveau !== "dichtbij") fout("klant dichtbij " + JSON.stringify(k));
if (P.klantHinder(st, it2, {datum: "2026-11-12", plek: pc => H.plek(pc6, pc), afstand: H.afstand, dichtbij: false}).length) fout("dichtbij uit");
console.log("hulp OK");
// twee losse plekken (5 km uit elkaar) zijn geen weg: stop halverwege telt niet als dichtbij
{ const H2 = require("../site/hulp.js"), los = {pts: [54700, 514300, 55400, 514300]};
  if (H2.afstand(los, 5.505, 51.4301) < 1000) { console.error("hulp FOUT sprong"); process.exit(1); }
  console.log("sprong OK"); }
