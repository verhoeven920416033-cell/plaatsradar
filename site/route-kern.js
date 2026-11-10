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

const compact = s => kern(s).replace(/[ ']/g, "");
/** Plaatsnaam uit een routelijst -> bekende plaats. Ook 'SHERTOGENBOSCH, SINTOEDENRODE, BAARLO LB en VENLOBLERICK. */
function plaatsVan(plaatsen, naam) {
  const pk = kern(naam), hit = plaatsen.get(pk); if (hit) return hit;
  if (!plaatsen._kort) { plaatsen._kort = new Map(); for (const [k, v] of plaatsen) { const c = compact(k); if (!plaatsen._kort.has(c)) plaatsen._kort.set(c, v); } }
  const c = compact(pk.replace(/ (?:lb|nb|gld|ge|li|l)$/, ""));
  if (plaatsen._kort.has(c)) return plaatsen._kort.get(c);
  let best = null;
  for (const [k, v] of plaatsen._kort) if (k.length >= 6 && c.length > k.length && c.endsWith(k) && (!best || k.length > best[0].length)) best = [k, v];
  if (!best) for (const [k, v] of plaatsen._kort) if (k.length >= 5 && c.length > k.length && c.startsWith(k) && (!best || k.length > best[0].length)) best = [k, v];
  return best ? best[1] : [];
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
    const t = r.trim().replace(/[ \t]{2,}/g, " | "); if (!t) continue;  // tekst-export: kolommen op spaties
    const rm = RE_ROUTE.exec(t), a = leesRegel(t, plaatsen);
    if (rm && (!a || !a.straat)) { route = "Route " + rm[1]; continue; }
    if (a) stops.push({...a, route: rm ? "Route " + rm[1] : route, bron: t.slice(0, 120)}); else overgeslagen.push(t.slice(0, 120));
  }
  return {stops, overgeslagen};
}

const KOP = {straat:/^(straat|straatnaam|adres|address|bezoekadres|afleveradres|street|locatie ?adres)/i, nr:/^(huisn|nr$|nummer$)/i, plaats:/^(plaats|woonplaats|stad|city|gemeente|vestigingsplaats)/i, postcode:/^(postcode|zip)/i, route:/^(route|rit|ronde|tour)/i};
/** Tabellen (CSV/Excel): kolommen op kopnaam, anders regel voor regel. Klantnamen e.d. worden niet gebruikt. */
/** Export uit de route-optimiser: kolommen SRit + Laad-losplaats straat/huisnr./postcode/plaats (+ Vroegste laden).
    Alleen rit, adres en datum worden gelezen; naam, waarde, kwalificaties en tijden niet. */
const OPT = {route:/^s?rit$/i, straat:/straat$/i, nr:/huisn/i, postcode:/postcode$/i, plaats:/(?:^|\s)plaats$/i, datum:/vroegste laden|^datum$/i};
function excelDatum(v) {
  const t = String(v ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(t) && +t > 30000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 864e5); return d.toISOString().slice(0, 10); }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) || /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t);
  if (!m) return "";
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function leesOptimiser(rijen) {
  const k = rijen.slice(0, 10).findIndex(r => r.some(c => OPT.route.test(String(c).trim())) && r.some(c => /laad-?losplaats straat/i.test(String(c))));
  if (k < 0) return null;
  const col = {}; rijen[k].forEach((c, i) => { const h = String(c).trim(); for (const n in OPT) if (col[n] === undefined && OPT[n].test(h)) col[n] = i; });
  const stops = [], datums = new Set(), gezien = new Set();
  for (const r of rijen.slice(k + 1)) {
    const v = n => col[n] === undefined ? "" : String(r[col[n]] ?? "").trim();
    const rit = v("route"), straat = v("straat");
    if (!rit || !straat) continue;
    const d = excelDatum(v("datum")); if (d) datums.add(d);
    const st = {straat, nr: v("nr"), postcode: v("postcode").replace(/^[A-Z]\s+/, ""), plaats: v("plaats"), route: "Route " + rit, bron: ""};
    const key = [st.route, kern(st.straat), st.nr, st.postcode].join("|");
    if (!gezien.has(key)) { gezien.add(key); stops.push(st); }
  }
  return {stops, overgeslagen: [], datums: [...datums].sort()};
}
function leesTabel(rijen, plaatsen) {
  const opt = leesOptimiser(rijen); if (opt) return opt;
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

/** Routelijst uit Dynamics/Axapta: vaste kolommen. pag = [[{str,x,y}]]. Leest alleen de kolom Adres + routenummer + datum;
    codes, ordernummers, tijden en opmerkingen worden bewust niet overgenomen. Geeft null bij een andere opmaak. */
function leesRoutelijst(pag) {
  const schoon = s => String(s).replace(/\u00ad/g, "-").replace(/\s+/g, " ").trim();
  const items = pag.map(p => p.map(i => ({...i, s: schoon(i.str)})).filter(i => i.s));
  const kop = items.flat(), xA = kop.find(i => i.s === "Adres"), xT = kop.find(i => i.s === "Tijd van");
  if (!xA || !xT || !kop.some(i => /^Geplande route/.test(i.s))) return null;
  let route = "Onbekende route", datum = "";
  const stops = [];
  for (const p of items) {
    const kr = p.find(i => /^Geplande route/.test(i.s));
    if (kr) {
      const rij = p.filter(i => Math.abs(i.y - kr.y) < 3 && i.x > kr.x).sort((a, b) => a.x - b.x).map(i => i.s).join(" ");
      const m = /(\d{3,6})\b/.exec(kr.s.replace(/^Geplande route/, "") + " " + rij), d = /\b(\d{2})-?(\d{2})-?(20\d{2})\b/.exec(rij.replace(m ? m[1] : "", ""));
      if (m) route = "Route " + m[1];
      if (d) datum = `${d[3]}-${d[2]}-${d[1]}`;
    }
    const kol = p.filter(i => i.x >= xA.x - 3 && i.x < xT.x - 3 && !/^(?:Type|Merk|CPP)\s*:/.test(i.s) && i.s !== "Adres").sort((a, b) => b.y - a.y);
    kol.forEach((i, n) => {
      const m = /^(\d{4}) ?([A-Z]{2})\s+(.+)$/.exec(i.s);
      if (!m) return;
      const b = n && kol[n - 1], a = b && b.y - i.y < 16 && !/^\d{4} ?[A-Z]{2}\s/.test(b.s) ? b.s : "";
      const h = /^(.*?\D)\s+(\d{1,5})(?:\s*[-/]?\s*[A-Za-z0-9]{0,4})?$/.exec(a);
      stops.push({straat: h ? h[1].trim() : a, nr: h ? h[2] : "", postcode: `${m[1]} ${m[2]}`, plaats: m[3].trim(), route, bron: ""});
    });
  }
  return {stops, overgeslagen: [], datum};
}

const actief = (x, van, tot) => {
  if (x.perioden) return x.perioden.some(([s, e]) => s.slice(0, 10) <= tot && e.slice(0, 10) >= van);
  if (!x.start) return true;
  return x.start.slice(0, 10) <= tot && (x.eind || (x.cat === "weg" ? "9999" : x.start)).slice(0, 10) >= van;
};

/** Vergelijkt stops met meldingen: alleen meldingen die de straat van een stop noemen, in die plaats of gemeente.
    Omleidingsroutes en fiets-/voetpaden tellen niet: daar is de stop zelf niet geraakt. */
function vergelijk(stops, items, plaatsen, opt) {
  const {van, tot} = opt;
  const zonderOmleiding = t => String(t || "").split(/(?<=[.!?])\s+|\s·\s/).filter(z => !/omgeleid|omleiding/i.test(z)).join(" ");
  const akt = items.filter(x => !x.fiets && actief(x, van, tot)).map(x => ({x, t: norm(`${x.titel} ${x.locatie || ""} ${zonderOmleiding(x.toelichting)}`)}));
  const perGem = new Map(); akt.forEach(a => { if (!perGem.has(a.x.plaats)) perGem.set(a.x.plaats, []); perGem.get(a.x.plaats).push(a); });
  const orde = {hoog:0, middel:1, laag:2}, onbekend = new Map(), routes = new Map(), treffers = [];
  for (const s of stops) {
    if (!routes.has(s.route)) routes.set(s.route, {naam:s.route, stops:0, plaatsen:new Map()});
    const r = routes.get(s.route); r.stops++;
    const opties = plaatsVan(plaatsen, s.plaats), naam = (opties[0] || {}).naam || s.plaats || "(geen plaats)", pk = kern(naam) || "?";
    if (!r.plaatsen.has(pk)) r.plaatsen.set(pk, {plaats:naam, pk, opties, stops:0, straten:new Map()});
    const p = r.plaatsen.get(pk); p.stops++;
    const sk = kern(s.straat); if (sk) { if (!p.straten.has(sk)) p.straten.set(sk, {straat:s.straat, aantal:0}); p.straten.get(sk).aantal++; }
  }
  for (const r of routes.values()) {
    r.plaatsen = [...r.plaatsen.values()].map(p => {
      if (!p.opties.length) onbekend.set(p.plaats, (onbekend.get(p.plaats) || 0) + p.stops);
      const gem = new Set(p.opties.map(o => o.gemeente));
      const kand = gem.size ? [...gem].flatMap(g => perGem.get(g) || []) : akt.filter(a => a.t.includes(" " + p.pk + " "));
      const hits = [], ids = new Set();
      for (const [sk, st] of p.straten) if (sk.length >= 5) for (const a of kand) if (a.t.includes(" " + sk + " ") && !ids.has(a.x.id)) {
        ids.add(a.x.id);
        const zeker = a.t.includes(" " + p.pk + " ") || a.x.plaats === p.plaats;
        hits.push({straat:st.straat, plaats:p.plaats, aantal:st.aantal, x:a.x, zeker});
      }
      hits.sort((a, b) => orde[a.x.hinder] - orde[b.x.hinder] || b.zeker - a.zeker);
      treffers.push(...hits.map(h => ({...h, route:r.naam})));
      const o = p.opties[0] || {};
      return {plaats:p.plaats, stops:p.stops, bekend:!!p.opties.length, hits, lat:o.lat, lon:o.lon, gemeente:o.gemeente, straten:[...p.straten.values()].map(x => x.straat)};
    }).sort((a, b) => b.hits.length - a.hits.length);
    r.knelpunten = r.plaatsen.reduce((n, p) => n + p.hits.length, 0);
    r.hoog = r.plaatsen.reduce((n, p) => n + p.hits.filter(h => h.x.hinder === "hoog").length, 0);
  }
  return {routes:[...routes.values()], onbekend:[...onbekend], treffers};
}
return {norm, kern, dist, maakPlaatsen, leesRegel, leesRegels, plaatsVan, leesOptimiser, excelDatum, leesTabel, leesRoutelijst, csvRijen, pdfRegels, actief, vergelijk};
});
