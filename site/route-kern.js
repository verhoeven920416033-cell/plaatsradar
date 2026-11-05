/* PlaatsRadar routecheck: lezen en vergelijken. Geen netwerk, geen opslag: alles blijft in het geheugen van de browser. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.RouteKern = f(); })(this, function () {
"use strict";
const SUF = "straat|str|laan|weg|plein|dijk|singel|kade|hof|pad|dreef|baan|boulevard|markt|steeg|gracht|ring|park|veld|akker|donk|rijt|hoek|wal|poort|brink|allee|plantsoen|passage|galerij|traverse|dam|kant|oord|erf|lei|bos|berg|straatje|steenweg|heide|haven";
const RE_SUF = new RegExp("(?:" + SUF + ")\\.?$", "i");
const WOORD = "[A-Za-zÀ-ÿ'’.\\-/]+";
const RE_ADRES = new RegExp("(" + WOORD + "(?:\\s+" + WOORD + "){0,4}?)\\s+(\\d{1,5})(?:\\s*[-/]?\\s*[A-Za-z0-9]{1,4})?(?=\\s|$|,|;)", "g");
const RE_PC = /\b(\d{4})\s?([A-Z]{2})\b(?:[\s,|]+([A-Za-zÀ-ÿ'’\-]+(?:[ -]+[A-Za-zÀ-ÿ'’\-]+){0,3}))?/;
const RE_ROUTE = /\b(?:route|rit|ronde|tour)\s*(?:nr\.?|nummer|no\.?)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{0,11})\b/i;
const GEEN_STRAAT = /^(?:route|rit|ronde|tour|pagina|page|datum|tijd|klant|order|stop|nr|nummer|telefoon|tel|versie|totaal|kenteken)\b/i;

function norm(s) {
  return " " + String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’`]/g, "'").replace(/[^a-z0-9']+/g, " ")
    .replace(/str\b/g, "straat").replace(/\bln\b/g, "laan").replace(/\bpln\b/g, "plein")
    .replace(/\b(?:burg|bgm)\b/g, "burgemeester").replace(/\bst\b/g, "sint").replace(/\bpr\b/g, "prins")
    .replace(/\s+/g, " ").trim() + " ";
}
const kern = s => norm(s).trim();
const dist = (a, b) => { const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return 6371 * Math.hypot(x, y); };

function maakPlaatsen(gemeenten, woonplaatsen) {
  const m = new Map(), add = (k, v) => { k = kern(k); if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(v); } };
  (woonplaatsen || []).forEach(w => add(w.naam, w));
  (gemeenten || []).forEach(g => { if (!m.has(kern(g.naam))) add(g.naam, {naam:g.naam, gemeente:g.naam, provincie:g.provincie, lat:g.lat, lon:g.lon}); });
  for (const v of m.get("'s hertogenbosch") || []) add("den bosch", v);
  return m;
}

/** Zoekt een adres in één regel (cellen gescheiden door |). Geeft {straat,nr,postcode,plaats,route?} of null. */
function leesRegel(regel, plaatsen) {
  const cellen = regel.split("|").map(c => c.trim()).filter(Boolean);
  let postcode = "", plaats = "", straat = "", nr = "";
  const pc = RE_PC.exec(regel);
  if (pc) { postcode = pc[1] + " " + pc[2]; plaats = (pc[3] || "").trim(); }
  const kand = [];
  for (const c of cellen) {
    RE_ADRES.lastIndex = 0;
    for (let m; (m = RE_ADRES.exec(c));) {
      const naam = m[1].trim().replace(/^[.,\-/]+/, "");
      if (GEEN_STRAAT.test(naam) || /^\d/.test(naam)) continue;
      // langste staart die op een straatwoord eindigt: 'Bakkerij Jansen Kerkstraat 12' -> Kerkstraat
      const w = naam.split(/\s+/);
      let i = w.length - 1, best = null;
      for (let j = i; j >= 0; j--) if (RE_SUF.test(w[j])) { best = j; break; }
      if (best !== null) kand.push({s: 2, naam: voorvoegsel(w, best), nr: m[2]});
      else if (cellen.length > 1 && w.length <= 3) kand.push({s: 1, naam, nr: m[2]});
    }
  }
  kand.sort((a, b) => b.s - a.s);
  if (kand[0]) { straat = kand[0].naam; nr = kand[0].nr; }
  if (!plaats || !plaatsen.has(kern(plaats))) {
    const gevonden = zoekPlaats(cellen, plaatsen, straat);
    if (gevonden) plaats = gevonden; else if (plaats) plaats = plaats.replace(/\s+\S*$/, m => plaatsen.has(kern(plaats.replace(m, ""))) ? "" : m);
  }
  if (!straat && !postcode) return null;
  if (!straat && !plaats) return null;
  return {straat, nr, postcode, plaats};
}
// 'Burg. Smeetslaan 3': voorvoegsels horen bij de straat, een bedrijfsnaam ervoor niet
function voorvoegsel(w, i) {
  let b = i;
  while (b > 0 && /^(?:burg\.?|burgemeester|dr\.?|prof\.?|mr\.?|pr\.?|prins|prinses|koningin|koning|st\.?|sint|van|de|der|den|het|ter|ten|oude|nieuwe|grote|kleine|lange|korte|hoge|lage|[A-Z]\.)$/i.test(w[b - 1])) b--;
  return w.slice(b, i + 1).join(" ");
}
function zoekPlaats(cellen, plaatsen, straat) {
  const z = kern(straat);
  for (const c of cellen.slice().reverse()) {
    const k = kern(c);
    if (plaatsen.has(k) && k !== z) return c.trim();
  }
  const w = kern(cellen.join(" ")).split(" ");
  for (let n = 3; n >= 1; n--) for (let i = w.length - n; i >= 0; i--) {
    const k = w.slice(i, i + n).join(" ");
    if (k.length >= 3 && k !== z && !z.includes(k) && plaatsen.has(k)) return k.replace(/\b\w/g, c => c.toUpperCase());
  }
  return "";
}

function leesRegels(regels, plaatsen) {
  const stops = [], overgeslagen = []; let route = "Onbekende route";
  for (const r of regels) {
    const t = r.trim(); if (!t) continue;
    const rm = RE_ROUTE.exec(t), a = leesRegel(t, plaatsen);
    if (rm && (!a || !a.straat)) { route = "Route " + rm[1]; continue; }
    if (a) stops.push({...a, route: rm ? "Route " + rm[1] : route, bron: t.slice(0, 120)}); else overgeslagen.push(t.slice(0, 120));
  }
  return {stops, overgeslagen};
}

const KOP = {straat:/^(straat|straatnaam|adres|address|bezoekadres|afleveradres|street|locatie ?adres)/i, nr:/^(huisn|nr$|nummer$)/i, plaats:/^(plaats|woonplaats|stad|city|gemeente|vestigingsplaats)/i, postcode:/^(postcode|zip)/i, route:/^(route|rit|ronde|tour)/i};
/** Tabellen (CSV/Excel): kolommen op kopnaam, anders regel voor regel. Klantnamen e.d. worden niet gebruikt. */
function leesTabel(rijen, plaatsen) {
  const k = rijen.slice(0, 25).findIndex(r => r.some(c => KOP.straat.test(String(c).trim())) && r.some(c => KOP.plaats.test(String(c).trim()) || KOP.postcode.test(String(c).trim())));
  if (k < 0) return leesRegels(rijen.map(r => r.map(c => String(c ?? "").trim()).filter(Boolean).join(" | ")), plaatsen);
  const col = {}; rijen[k].forEach((c, i) => { for (const n in KOP) if (col[n] === undefined && KOP[n].test(String(c).trim())) col[n] = i; });
  const stops = [], overgeslagen = [];
  for (const r of rijen.slice(k + 1)) {
    const v = n => col[n] === undefined ? "" : String(r[col[n]] ?? "").trim();
    let straat = v("straat"), nr = v("nr");
    const m = /^(.*?\D)\s+(\d{1,5}\s*[A-Za-z0-9\-]{0,4})$/.exec(straat);
    if (m) { straat = m[1].trim(); nr = nr || m[2]; }
    if (!straat && !v("plaats")) { if (r.some(c => String(c ?? "").trim())) overgeslagen.push(r.join(" ").slice(0, 120)); continue; }
    stops.push({straat, nr, postcode: v("postcode"), plaats: v("plaats"), route: v("route") ? (/^\d/.test(v("route")) ? "Route " + v("route") : v("route")) : "Onbekende route", bron: r.join(" ").slice(0, 120)});
  }
  return {stops, overgeslagen};
}

function csvRijen(t) {
  const eerste = t.split(/\r?\n/, 1)[0] || "", sep = [";", "\t", ","].sort((a, b) => eerste.split(b).length - eerste.split(a).length)[0];
  const rijen = []; let rij = [], cel = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
    else if (c === '"') q = true; else if (c === sep) { rij.push(cel); cel = ""; }
    else if (c === "\n") { rij.push(cel); rijen.push(rij); rij = []; cel = ""; } else if (c !== "\r") cel += c; }
  if (cel || rij.length) { rij.push(cel); rijen.push(rij); }
  return rijen;
}

/** pdf.js-tekstitems van één pagina -> regels; grote gaten worden kolomscheidingen. */
function pdfRegels(items) {
  const rijen = new Map();
  for (const it of items) { if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3; if (!rijen.has(y)) rijen.set(y, []); rijen.get(y).push(it); }
  return [...rijen.keys()].sort((a, b) => b - a).map(y => { const r = rijen.get(y).sort((a, b) => a.transform[4] - b.transform[4]); let s = "", eind = null;
    for (const it of r) { const x = it.transform[4], h = Math.abs(it.transform[3]) || 10; if (eind !== null) s += x - eind > h * 1.2 ? " | " : (x - eind > h * .12 ? " " : ""); s += it.str; eind = x + (it.width || 0); }
    return s; });
}

const actief = (x, van, tot) => {
  if (x.perioden) return x.perioden.some(([s, e]) => s.slice(0, 10) <= tot && e.slice(0, 10) >= van);
  if (!x.start) return true;
  return x.start.slice(0, 10) <= tot && (x.eind || (x.cat === "weg" ? "9999" : x.start)).slice(0, 10) >= van;
};

/** Vergelijkt stops met meldingen. niveau 1 = op de straat, 2 = in de plaats. */
function vergelijk(stops, items, plaatsen, opt) {
  const {van, tot, straal = 1.5} = opt;
  const akt = items.filter(x => actief(x, van, tot)).map(x => ({x, t: norm(`${x.titel} ${x.locatie || ""} ${x.toelichting || ""}`)}));
  const perGem = new Map(); akt.forEach(a => { if (!perGem.has(a.x.plaats)) perGem.set(a.x.plaats, []); perGem.get(a.x.plaats).push(a); });
  const uniek = new Map();
  stops.forEach(s => { const k = kern(s.straat) + "|" + kern(s.plaats); if (!uniek.has(k)) uniek.set(k, {straat:s.straat, plaats:s.plaats, stops:[]}); uniek.get(k).stops.push(s); });
  const treffers = [], plaatsTreffers = new Map(), onbekend = new Map();
  for (const u of uniek.values()) {
    const pk = kern(u.plaats), opties = plaatsen.get(pk) || [];
    if (!opties.length) { onbekend.set(u.plaats || "(geen plaats)", (onbekend.get(u.plaats || "(geen plaats)") || 0) + u.stops.length); }
    const gem = new Set(opties.map(o => o.gemeente));
    let kand = [...gem].flatMap(g => perGem.get(g) || []);
    const midden = opties[0];
    if (midden) { const al = new Set(kand); akt.forEach(a => { if (!al.has(a) && a.x.lat && dist(midden, a.x) <= 6) kand.push(a); }); }
    else if (pk) kand = akt.filter(a => a.t.includes(" " + pk + " "));
    const zk = kern(u.straat), geraakt = new Set();
    if (zk.length >= 5) for (const a of kand) if (a.t.includes(" " + zk + " ")) {
      geraakt.add(a);
      treffers.push({straat:u.straat, plaats:u.plaats, stops:u.stops, x:a.x, zeker: !pk || a.t.includes(" " + pk + " ") || a.x.plaats === u.plaats || opties.some(o => o.naam === a.x.plaats)});
    }
    if (midden || pk) {
      const k = pk; if (!plaatsTreffers.has(k)) plaatsTreffers.set(k, {plaats:u.plaats || "?", routes:new Set(), m:new Map()});
      const p = plaatsTreffers.get(k); u.stops.forEach(s => p.routes.add(s.route));
      for (const a of kand) {
        if (geraakt.has(a)) continue;
        const dichtbij = midden && a.x.lat && dist(midden, a.x) <= straal, inTekst = pk && a.t.includes(" " + pk + " ");
        const zwaar = a.x.hinder === "hoog" || a.x.cat === "evenement" || a.x.cat === "kermis" || a.x.cat === "markt";
        if (zwaar && !a.x.fiets && (dichtbij || (inTekst && a.x.cat !== "weg"))) p.m.set(a.x.id, a.x);
      }
    }
  }
  const orde = {hoog:0, middel:1, laag:2}, ids = new Set(treffers.map(t => t.x.id));
  treffers.sort((a, b) => orde[a.x.hinder] - orde[b.x.hinder] || b.zeker - a.zeker);
  const routes = new Map();
  stops.forEach(s => { if (!routes.has(s.route)) routes.set(s.route, {naam:s.route, stops:0, hits:[]}); routes.get(s.route).stops++; });
  treffers.forEach(t => { const per = new Map(); t.stops.forEach(s => per.set(s.route, (per.get(s.route) || 0) + 1));
    per.forEach((n, r) => routes.get(r).hits.push({...t, aantal:n})); });
  const pl = [...plaatsTreffers.values()].map(p => ({plaats:p.plaats, routes:[...p.routes], items:[...p.m.values()].filter(x => !ids.has(x.id)).sort((a, b) => orde[a.hinder] - orde[b.hinder])})).filter(p => p.items.length).sort((a, b) => b.items.length - a.items.length);
  return {routes:[...routes.values()], plaatsen:pl, onbekend:[...onbekend], treffers};
}
return {norm, kern, dist, maakPlaatsen, leesRegel, leesRegels, leesTabel, csvRijen, pdfRegels, actief, vergelijk};
});
