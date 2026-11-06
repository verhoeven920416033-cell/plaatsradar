// Test routecheck met een verzonnen routelijst. Draai: node tests/test_route.js
const assert = require("assert"), path = require("path");
const K = require(path.join(__dirname, "..", "site", "route-kern.js"));
const gem = require(path.join(__dirname, "..", "gemeenten.json")).gemeenten;
const wp = [{naam:"Lierop", gemeente:"Someren", provincie:"Noord-Brabant", lat:51.4228, lon:5.667}, {naam:"Stiphout", gemeente:"Helmond", provincie:"Noord-Brabant", lat:51.47, lon:5.62},
            {naam:"Eindhoven", gemeente:"Eindhoven", provincie:"Noord-Brabant", lat:51.44, lon:5.47}];
const P = K.maakPlaatsen(gem, wp);

assert.equal(K.kern("Burg. Smeetslaan"), "burgemeester smeetslaan");
assert.equal(K.kern("Sint-Trudoplein"), K.kern("St. Trudoplein"));
assert.equal(K.kern("Kerkstr."), "kerkstraat");
assert.ok(P.get("den bosch"), "Den Bosch = 's-Hertogenbosch");

let a = K.leesRegel("Jumbo Centrum | Kerkstraat 12a | 5611 AB EINDHOVEN | 08:30", P);
assert.deepEqual([a.straat, a.nr, a.postcode, a.plaats], ["Kerkstraat", "12", "5611 AB", "EINDHOVEN"], JSON.stringify(a));
a = K.leesRegel("Bakkerij Jansen Burg. Smeetslaan 3, 5707 AB Stiphout", P);
assert.equal(a.straat, "Burg. Smeetslaan"); assert.equal(a.plaats, "Stiphout");
a = K.leesRegel("Dorpsstraat 7 Lierop", P);
assert.equal(a.straat, "Dorpsstraat"); assert.equal(a.plaats.toLowerCase(), "lierop");
assert.equal(K.leesRegel("Pagina 3 van 12", P), null);
assert.equal(K.leesRegel("Totaal stops 14", P), null);

const r = K.leesRegels(["Route 12 maandag", "Kerkstraat 1 | 5611 AB Eindhoven", "Pagina 1", "Rit: 7B", "Dorpsstraat 7 | Lierop"], P);
assert.deepEqual(r.stops.map(s => s.route), ["Route 12", "Route 7B"], JSON.stringify(r));

const ax = K.leesRegels(["Route 5", "Winkel A      Kerkstraat 12      5611 AB    Eindhoven", "Pagina 1 van 2"], P);
assert.deepEqual(ax.stops.map(s => [s.straat, s.plaats, s.route]), [["Kerkstraat", "Eindhoven", "Route 5"]], JSON.stringify(ax));

const t = K.leesTabel(K.csvRijen('Route;Klant;Adres;Postcode;Plaats\n12;Geheim BV;"Vestdijk 5";5611 CA;Eindhoven\n12;Ander;Dorpsstraat 7;;Lierop\n'), P);
assert.deepEqual(t.stops.map(s => [s.straat, s.nr, s.plaats, s.route]), [["Vestdijk", "5", "Eindhoven", "Route 12"], ["Dorpsstraat", "7", "Lierop", "Route 12"]]);
assert.ok(!("klant" in t.stops[0]));

const pdf = K.pdfRegels([{str:"Kerkstraat 1", transform:[10,0,0,10,50,700], width:60}, {str:"Eindhoven", transform:[10,0,0,10,300,700], width:50}, {str:"Route 4", transform:[10,0,0,10,50,720], width:40}]);
assert.deepEqual(pdf, ["Route 4", "Kerkstraat 1 | Eindhoven"]);

const items = [
  {id:"1", plaats:"Eindhoven", cat:"weg", label:"Weg dicht", titel:"Vestdijk Eindhoven Rioleringswerkzaamheden", hinder:"hoog", lat:51.44, lon:5.48, perioden:[["2026-11-06T07:00","2026-11-06T16:00"]]},
  {id:"2", plaats:"Eindhoven", cat:"weg", label:"Weg dicht", titel:"Vestdijk Eindhoven later", hinder:"hoog", lat:51.44, lon:5.48, perioden:[["2026-12-06T07:00","2026-12-06T16:00"]]},
  {id:"3", plaats:"Someren", cat:"evenement", label:"Vergund/besluit", titel:"Intocht Sinterklaas Lierop", hinder:"middel", start:"2026-11-07", eind:null},
  {id:"4", plaats:"Someren", cat:"weg", label:"Weg dicht", titel:"Dorpsstraat Someren", hinder:"hoog", lat:51.38, lon:5.69, perioden:[["2026-11-06T07:00","2026-11-06T16:00"]]},
  {id:"5", plaats:"Eindhoven", cat:"weg", label:"Weg dicht", titel:"Andere straat", hinder:"hoog", lat:51.4405, lon:5.4705, perioden:[["2026-11-06T07:00","2026-11-06T16:00"]]},
  {id:"6", plaats:"Eindhoven", cat:"weg", label:"Fiets-/voetpad dicht", titel:"Fietspad", hinder:"hoog", fiets:true, lat:51.4405, lon:5.4705, perioden:[["2026-11-06T07:00","2026-11-06T16:00"]]},
];
const v = K.vergelijk(t.stops, items, P, {van:"2026-11-05", tot:"2026-11-08"});
assert.deepEqual(v.treffers.map(x => [x.x.id, x.zeker]).sort(), [["1", true], ["4", false]], JSON.stringify(v.treffers.map(x => x.x.id)));  // 2 valt buiten de datums; zelfde straat in andere kern = controleren
const rt = v.routes[0], ehv = rt.plaatsen.find(p => p.plaats === "Eindhoven"), lie = rt.plaatsen.find(p => p.plaats === "Lierop");
assert.equal(rt.stops, 2); assert.equal(rt.plaatsen.length, 2);
assert.deepEqual(ehv.rond.map(x => x.id), ["5"], JSON.stringify(ehv));  // dichtbij centrum, fietspad telt niet
assert.deepEqual(lie.rond.map(x => x.id), ["3"]);
assert.deepEqual(K.vergelijk([{straat:"X", plaats:"Parijs", route:"R"}], items, P, {van:"2026-11-05", tot:"2026-11-08"}).onbekend, [["Parijs", 1]]);

assert.equal(K.plaatsVan(P, "'SHERTOGENBOSCH")[0].naam, "'s-Hertogenbosch");
assert.equal(K.plaatsVan(P, "SINTMICHIELSGESTEL")[0].naam, "Sint-Michielsgestel");
assert.equal(K.plaatsVan(P, "STEIN LB")[0].naam, "Stein");
assert.equal(K.plaatsVan(P, "HELMONDSTIPHOUT")[0].naam, "Stiphout");
assert.equal(K.plaatsVan(P, "VENLOTESTDORP")[0].naam, "Venlo");
assert.deepEqual(K.plaatsVan(P, "PARIJS"), []);

// routelijst uit Dynamics: vaste kolommen; verzonnen gegevens
const it = (str, x, y) => ({str, x, y});
const ax2 = K.leesRoutelijst([[
  it("Geplande route", 12, 544), it(":", 76, 544), it("1234", 81, 544), it("15\u00ad11\u00ad2026", 134, 544),
  it("Locatienaam", 137, 527), it("Adres", 271, 527), it("Tijd van", 405, 527),
  it("Voorbeeldwinkel", 137, 500), it("Vestdijk 5", 271, 500), it("Kluiscode: 11-22-33", 137, 491), it("5611 CA EINDHOVEN", 271, 490),
  it("Type: Testkast", 271, 481),
  it("Andere locatie", 137, 460), it("Dorpsstraat 7-a", 271, 460), it("5736 AA LIEROP", 271, 450),
]]);
assert.deepEqual(ax2.stops.map(s => [s.straat, s.nr, s.postcode, s.plaats, s.route]), [["Vestdijk", "5", "5611 CA", "EINDHOVEN", "Route 1234"], ["Dorpsstraat", "7", "5736 AA", "LIEROP", "Route 1234"]], JSON.stringify(ax2));
assert.equal(ax2.datum, "2026-11-15");
assert.ok(!JSON.stringify(ax2).includes("Kluiscode"), "codes mogen niet worden overgenomen");
assert.equal(K.leesRoutelijst([[it("Iets anders", 10, 10)]]), null);
console.log("routecheck OK");
