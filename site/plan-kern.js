/* Planning vooruit: geogroepen (postcodegebieden per dienst en weekdag) naast de meldingen. Geen netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PlanKern = f(); })(this, function () {
"use strict";
const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"], KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const ja = v => /^(ja|j|yes|y|x|1|waar|true)$/i.test(String(v ?? "").trim());
const kern = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Optimiser-export (SRit + Laad-losplaats postcode/plaats + Vroegste laden) -> gebieden per rit, postcodegebied en rijdag.
    Alleen rit, klantcode, adres, postcode, plaats en datum worden gelezen; naam, waarde en tijden niet. */
function datumVan(v) {
  const t = String(v ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(t) && +t > 30000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 864e5).toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) || /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t);
  return !m ? "" : m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
// Routekolommen in de optimiser-export. Gepland gaat voor stam: dat is wat er die dag echt rijdt.
const RIT_GEPLAND = /^(g\.?\s?rit|geplande?\s*(rit|route)\s*(nr|nummer)?|rit\s*\(?gepland\)?|route\s*\(?gepland\)?|planned\s*(trip|route)|plan\s*(rit|route))$/i;
const RIT_STAM = /^(s\.?\s?rit|stam\s*(rit|route)\s*(nr|nummer)?|rit\s*\(?stam\)?|route\s*\(?stam\)?|master\s*route)$/i;
const RIT_ALG = /^(rit|route|ritnummer|routenummer|rit\s*nr|route\s*nr|tour|trip)$/i;
const KOL = {pc: /laad-?losplaats\s*postcode|^post\s?code$|postcode|^pc[46]?$/i, plaats: /laad-?losplaats\s*plaats|^(woon)?plaats$|^stad$|^city$/i,
  straat: /laad-?losplaats\s*straat|^straat(naam)?$|^adres$|^street$/i, nr: /laad-?losplaats\s*huisn|^huis\s?n|^nr\.?$/i,
  datum: /vroegste\s*laden|^(lever|rij|plan|uitvoer)?\s?(datum|dag)$|^date$/i, klant: /^klant\s?(code|nr|nummer)$|laad-?losplaats\s*kenmerk|^debiteur/i};
const kopTekst = h => String(h ?? "").trim();
/** Alle kolommen die een rit kunnen zijn, met soort, gesorteerd: gepland, stam, algemeen. */
function ritKolommen(kop) {
  const o = [];
  kop.forEach((h, i) => { const t = kopTekst(h); if (RIT_GEPLAND.test(t)) o.push({i, kop: t, soort: "gepland"}); else if (RIT_STAM.test(t)) o.push({i, kop: t, soort: "stam"}); else if (RIT_ALG.test(t)) o.push({i, kop: t, soort: "rit"}); });
  const orde = {gepland: 0, rit: 1, stam: 2};
  return o.sort((a, b) => orde[a.soort] - orde[b.soort] || a.i - b.i);
}
/** Koprij van een optimiser-export: een routekolom én een postcodekolom. */
function optimiserKop(rijen) {
  for (let k = 0; k < Math.min(15, rijen.length); k++) {
    const r = rijen[k].map(kopTekst);
    if (!r.some(c => KOL.pc.test(c))) continue;
    // met routekolom, of een opdrachtenexport zonder route (laad-losplaats-kolommen of straat + transportcode)
    if (ritKolommen(r).length || r.some(c => /laad-?losplaats/i.test(c)) || (r.some(c => KOL.straat.test(c)) && r.some(c => KOL.klant.test(c)))) return k;
  }
  return -1;
}
/** Optimiser-export -> gebieden per rit, postcodegebied en rijdag, plus stops.
    Alleen rit, klantcode, adres, postcode, plaats en datum worden gelezen; naam, waarde en tijden niet.
    opt.kaart = {kop, rit, pc, plaats, straat, nr, datum, klant} (kolomnummers) om zelf te kiezen. */
function leesOptimiserPlan(rijen, opt) {
  opt = opt || {};
  const m0 = opt.kaart || {};
  const k = Number.isInteger(m0.kop) ? m0.kop : optimiserKop(rijen);
  if (k < 0) return null;
  const kolommen = rijen[k].map(kopTekst), ci = re => kolommen.findIndex(c => re.test(c));
  const ritOpties = ritKolommen(kolommen);
  const kies = (n, standaard) => Number.isInteger(m0[n]) ? m0[n] : Number.isInteger(opt[n + "Kolom"]) ? opt[n + "Kolom"] : standaard;
  const zelfRit = Number.isInteger(m0.rit) || Number.isInteger(opt.ritKolom);
  const c = {rit: kies("rit", ritOpties.length ? ritOpties[0].i : -1), pc: kies("pc", ci(KOL.pc)), plaats: kies("plaats", ci(KOL.plaats)),
    straat: kies("straat", ci(KOL.straat)), nr: kies("nr", ci(KOL.nr)), datum: kies("datum", ci(KOL.datum)), klant: kies("klant", ci(KOL.klant))};
  if (c.klant < 0 && !Number.isInteger(m0.klant) && kolommen.length > 4 && /kenmerk/i.test(kolommen[4])) c.klant = 4;  // kolom E in de standaardexport
  const kiesFout = t => { const e = new Error(t + " Kies hieronder zelf de kolommen."); e.kiezen = true; return e; };
  if (c.pc < 0) throw kiesFout("Geen postcodekolom gevonden.");
  const skip = new Set((opt.skip || []).map(String)), per = new Map(), datums = new Set(), fout = [], overgeslagen = new Set(), stops = [], gezien = new Set();
  let leeg = 0;
  for (const r of rijen.slice(k + 1)) {
    // rit: gekozen kolom; anders per regel de eerste gevulde (geplande route, dan stamroute). Leeg = opdracht nog zonder rit.
    const ritVan = i => i >= 0 ? kopTekst(r[i]).replace(/\.0$/, "") : "";
    let rit = ritVan(c.rit);
    if (!rit && !zelfRit) for (const o of ritOpties) { rit = ritVan(o.i); if (rit) break; }
    if (!r.some(v => kopTekst(v))) continue;
    if (!rit) { leeg++; rit = "—"; }
    if (skip.has(rit)) { overgeslagen.add(rit); continue; }
    const pc = kopTekst(r[c.pc]).toUpperCase(), m = /(\d{4})\s*[A-Z]{0,2}\s*$/.exec(pc);
    if (!m) { fout.push("Rit " + rit + ": geen postcode"); continue; }
    const d = c.datum >= 0 ? datumVan(r[c.datum]) : ""; if (d) datums.add(d);
    const wd = d ? (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7 : -1;
    const key = rit + "|" + m[1];
    const groep = rit === "—" ? "Zonder rit" : "Rit " + rit;
    if (!per.has(key)) per.set(key, {groep, plaats: c.plaats >= 0 ? kopTekst(r[c.plaats]) : "", van: m[1], tot: m[1], pc4: [m[1]], dagen: Array(7).fill(false)});
    const g = per.get(key); if (wd < 0) g.dagen.fill(true); else g.dagen[wd] = true;
    const st = {rit: groep, klant: c.klant >= 0 ? kopTekst(r[c.klant]) : "", straat: c.straat >= 0 ? kopTekst(r[c.straat]) : "", nr: c.nr >= 0 ? kopTekst(r[c.nr]) : "",
      postcode: pc.replace(/^[A-Z]+\s+(?=\d)/, ""), pc4: m[1], plaats: c.plaats >= 0 ? kopTekst(r[c.plaats]) : "", datum: d, wd};
    const sk = [st.rit, st.klant, st.straat, st.nr, st.postcode, d].join("|");
    if (!gezien.has(sk)) { gezien.add(sk); stops.push(st); }
  }
  const gebieden = [...per.values()], groepen = [...new Set(gebieden.map(g => g.groep))].sort((a, b) => a.localeCompare(b, "nl", {numeric: true}));
  return {gebieden, fout, groepen, datums: [...datums].sort(), bron: "optimiser", overgeslagen: [...overgeslagen], stops, kolommen, klantKolom: c.klant,
    kaart: {kop: k, ...c}, ritOpties, zonderRit: leeg, ritKop: c.rit >= 0 ? kolommen[c.rit] || "" : ""};
}
/** Voor de keuze-schermpje als niets herkend is: de rij met de meeste gevulde tekstcellen in de eerste 15 rijen. */
function waarschijnlijkeKop(rijen) {
  let best = 0, n = -1;
  for (let k = 0; k < Math.min(15, rijen.length); k++) { const t = rijen[k].filter(v => /[a-z]/i.test(kopTekst(v))).length; if (t > n) { n = t; best = k; } }
  return best;
}

/** Rijen uit het Excel -> gebieden {groep, plaats, van, tot, pc4[], dagen[7]}. Kolommen op kopnaam. */
function leesGeogroepen(rijen, opt) {
  const o = leesOptimiserPlan(rijen, opt); if (o) return o;
  const k = rijen.slice(0, 20).findIndex(r => r.some(c => /locatie ?groep|^groep$/i.test(String(c).trim())) && r.some(c => /^van$/i.test(String(c).trim())));
  if (k < 0) { const e = new Error("Kolommen niet herkend. Kies hieronder zelf welke kolom de rit en de postcode is, of gebruik het geogroepen-Excel ('Locatie groep', 'Van', 'Tot' en de weekdagen)."); e.kiezen = true; throw e; }
  const kop = rijen[k].map(c => String(c).trim().toLowerCase()), zoek = re => kop.findIndex(c => re.test(c));
  const ci = {groep: zoek(/locatie ?groep|^groep$/), plaats: zoek(/^omschrijving|^plaats/), van: zoek(/^van$/), tot: zoek(/^tot$/), dag: DAGEN.map(d => kop.indexOf(d))};
  const gebieden = [], fout = [];
  for (const r of rijen.slice(k + 1)) {
    const groep = String(r[ci.groep] ?? "").trim(), van = String(r[ci.van] ?? "").trim().toUpperCase(), tot = String(r[ci.tot] ?? van).trim().toUpperCase();
    if (!groep && !van) continue;
    const a = /^(\d{4})/.exec(van), b = /^(\d{4})/.exec(tot);
    if (!groep || !a) { fout.push(r.join(" ").slice(0, 80)); continue; }
    const p0 = +a[1], p1 = b ? +b[1] : p0, pc4 = [];
    for (let p = p0; p <= Math.min(p1, p0 + 60); p++) pc4.push(String(p).padStart(4, "0"));
    gebieden.push({groep, plaats: String(r[ci.plaats] ?? "").trim(), van, tot, pc4, dagen: ci.dag.map(i => i >= 0 && ja(r[i]))});
  }
  return {gebieden, fout, groepen: [...new Set(gebieden.map(g => g.groep))].sort()};
}

/** Filtertekst -> {pc:[[van,tot]], tk:[tekst]}. Postcodes: 5611, 5611 AB (telt als 5611), 5611-5615. Rest = straat of plaats. */
function maakFilter(s) {
  const pc = [], tk = [];
  for (let t of String(s || "").split(/[,;\n]+/)) {
    t = t.trim(); if (!t) continue;
    let m = /^(\d{4})\s*(?:-|t\/m|tot)\s*(\d{4})$/i.exec(t);
    if (m) { const a = +m[1], b = +m[2]; pc.push([Math.min(a, b), Math.max(a, b)]); continue; }
    m = /^(\d{4})\s*(?:[A-Za-z]{2})?$/.exec(t);
    if (m) { pc.push([+m[1], +m[1]]); continue; }
    const k = kern(t); if (k.length >= 2) tk.push(k);
  }
  return pc.length || tk.length ? {pc, tk} : null;
}
const pcIn = (f, q) => f.pc.some(([a, b]) => +q >= a && +q <= b);
const tekstIn = (f, t) => { const k = " " + kern(t) + " "; return f.tk.some(w => k.includes(w)); };

const actief = (x, d) => {
  if (x.perioden) return x.perioden.some(([s, e]) => s.slice(0, 10) <= d && e.slice(0, 10) >= d);
  if (!x.start) return false;  // zonder datum niet op een planningsdag zetten
  return x.start.slice(0, 10) <= d && (x.eind || (x.cat === "weg" ? "9999" : x.start)).slice(0, 10) >= d;
};
const weekdag = iso => (new Date(iso + "T12:00").getDay() + 6) % 7;  // 0 = maandag

/** Meldingen op een datum in de gebieden die die dag gereden worden. opt: {datum, groepen:Set, laag:bool, woonplaatsen:[{naam,gemeente}]} */
function planDag(gebieden, items, opt) {
  const dag = weekdag(opt.datum), orde = {hoog: 0, middel: 1, laag: 2};
  const pc = new Map();  // pc4 -> {plaats, groepen:Set}
  for (const g of gebieden) if (g.dagen[dag] && (!opt.groepen || opt.groepen.has(g.groep)))
    for (const p of g.pc4) { if (!pc.has(p)) pc.set(p, {plaats: g.plaats, groepen: new Set()}); pc.get(p).groepen.add(g.groep); }
  const gemVan = new Map((opt.woonplaatsen || []).map(w => [kern(w.naam), w.gemeente]));
  const plaatsGem = new Map(); for (const v of pc.values()) { const gm = gemVan.get(kern(v.plaats)); if (gm) plaatsGem.set(v.plaats, gm); }
  const hOk = x => opt.hinder ? opt.hinder.has(x.hinder === "geen" ? "laag" : x.hinder) : (opt.laag || x.hinder !== "laag");
  const relevant = items.filter(x => !x.fiets && x.cat !== "markt" && hOk(x) && (!opt.soort || opt.soort(x)) && (!opt.extra || opt.extra(x)) && actief(x, opt.datum));
  const perPlaats = new Map(), zonder = new Map(), geteld = new Set();
  const voeg = (plaats, rij) => { if (!perPlaats.has(plaats)) perPlaats.set(plaats, {plaats, groepen: new Set(), pc4: new Set(), rijen: []}); const p = perPlaats.get(plaats);
    if (!p.rijen.some(r => r.x.id === rij.x.id)) p.rijen.push(rij); rij.groepen.forEach(g => p.groepen.add(g)); rij.pc4.forEach(q => p.pc4.add(q)); };
  for (const x of relevant) {
    if (x.pc4 && x.pc4.length) {
      const per = new Map();
      for (const q of x.pc4) { const a = pc.get(q); if (!a) continue; if (!per.has(a.plaats)) per.set(a.plaats, {pc4: [], groepen: new Set()}); per.get(a.plaats).pc4.push(q); a.groepen.forEach(g => per.get(a.plaats).groepen.add(g)); }
      per.forEach((v, plaats) => { voeg(plaats, {x, pc4: v.pc4, groepen: [...v.groepen].sort()}); geteld.add(x.id); });
    } else {
      // zonder postcode (Gemeenteblad zonder coördinaten): op gemeente, apart getoond
      const plaatsen = [...plaatsGem].filter(([, gm]) => gm === x.plaats).map(([pl]) => pl);
      if (plaatsen.length) { if (!zonder.has(x.plaats)) zonder.set(x.plaats, {gemeente: x.plaats, plaatsen, rijen: []}); zonder.get(x.plaats).rijen.push(x); }
    }
  }
  const lijst = [...perPlaats.values()].map(p => ({...p, groepen: [...p.groepen].sort(), pc4: [...p.pc4].sort(),
    rijen: p.rijen.sort((a, b) => orde[a.x.hinder] - orde[b.x.hinder] || String(a.pc4[0] || "").localeCompare(String(b.pc4[0] || "")) || (a.x.titel > b.x.titel ? 1 : -1))}))
    .sort((a, b) => b.rijen.filter(r => r.x.hinder === "hoog").length - a.rijen.filter(r => r.x.hinder === "hoog").length || b.rijen.length - a.rijen.length);
  let plaatsen = lijst, zonderL = [...zonder.values()];
  let f = opt.filter, fp = null;
  if (f) {  // postcode, straat of plaats; termen onderling = of. Een plaatsnaam selecteert die plaats, niet elke melding die hem noemt.
    const bekend = new Set([...[...pc.values()].map(v => kern(v.plaats)), ...(opt.woonplaatsen || []).map(w => kern(w.naam))]);
    fp = {pc: [], tk: f.tk.filter(t => bekend.has(t))};
    f = {pc: f.pc, tk: f.tk.filter(t => !bekend.has(t))};
    const melding = x => `${x.titel} ${x.locatie || ""} ${x.toelichting || ""}`;
    plaatsen = lijst.map(p => tekstIn(fp, p.plaats) ? p : {...p, rijen: p.rijen.filter(r => r.pc4.some(q => pcIn(f, q)) || tekstIn(f, melding(r.x)))})
      .filter(p => p.rijen.length).map(p => ({...p, pc4: [...new Set(p.rijen.flatMap(r => r.pc4))].sort(), groepen: [...new Set(p.rijen.flatMap(r => r.groepen))].sort()}));
    zonderL = zonderL.map(z => z.plaatsen.some(pl => tekstIn(fp, pl)) ? {...z, plaatsen: z.plaatsen.filter(pl => tekstIn(fp, pl))} : {...z, rijen: z.rijen.filter(x => tekstIn(f, melding(x)))}).filter(z => z.rijen.length);
  }
  const ids = new Set(plaatsen.flatMap(p => p.rijen.map(r => r.x.id)));
  return {dag: DAGEN[dag], gebieden: pc.size, gereden: [...pc].map(([c, v]) => ({pc4: c, plaats: v.plaats, groepen: [...v.groepen].sort()})), plaatsen, zonder: zonderL, meldingen: ids.size,
          hoog: relevant.filter(x => ids.has(x.id) && x.hinder === "hoog").length, filter: !!opt.filter};
}

/** Klantcodes met hinder op de rijdag: per stop (optimiser) de meldingen in zijn postcodegebied.
    niveau "straat" = de melding noemt de straat van de stop; "gebied" = alleen hetzelfde postcodegebied. */
const straatKern = s => " " + String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").replace(/str\b/g, "straat").replace(/\s+/g, " ").trim() + " ";
function klantHinder(stops, items, opt) {
  const wd = weekdag(opt.datum), orde = {hoog: 0, middel: 1, laag: 2, geen: 2};
  const hOk = x => opt.hinder ? opt.hinder.has(x.hinder === "geen" ? "laag" : x.hinder) : x.hinder !== "laag";
  const zonderOml = t => String(t || "").split(/(?<=[.!?])\s+|\s·\s/).filter(z => !/omgeleid|omleiding/i.test(z)).join(" ");
  const perPc = new Map(), alle = [];
  for (const x of items) if (!x.fiets && x.cat !== "markt" && hOk(x) && (!opt.soort || opt.soort(x)) && (!opt.extra || opt.extra(x)) && actief(x, opt.datum)) {
    const t = straatKern(`${x.titel} ${x.locatie || ""} ${zonderOml(x.toelichting)}`), a = {x, t};
    alle.push(a);
    for (const q of x.pc4 || []) { if (!perPc.has(q)) perPc.set(q, []); perPc.get(q).push(a); }
  }
  const straal = opt.straal || 250;
  const rijen = [];
  for (const s of stops) {
    if (s.wd >= 0 && s.wd !== wd) continue;
    if (opt.groepen && !opt.groepen.has(s.rit)) continue;
    const sk = straatKern(s.straat).trim(), gehad = new Set(), pl = opt.plek ? opt.plek(s.postcode) : null;
    for (const {x, t} of perPc.get(s.pc4) || []) {
      const d = pl && opt.afstand ? opt.afstand(x, pl[0], pl[1]) : Infinity;
      const niveau = sk.length >= 5 && t.includes(" " + sk + " ") ? "straat" : d <= straal ? "dichtbij" : "gebied";
      gehad.add(x.id);
      if (niveau === "gebied" && !opt.gebied) continue;
      if (niveau === "dichtbij" && opt.dichtbij === false) continue;
      rijen.push({...s, x, niveau, afstand: isFinite(d) ? Math.round(d / 10) * 10 : null});
    }
    // om de hoek, ook net over de grens van het postcodegebied
    if (pl && opt.afstand && opt.dichtbij !== false) for (const {x} of alle) {
      if (gehad.has(x.id)) continue;
      const d = opt.afstand(x, pl[0], pl[1]);
      if (d <= straal) rijen.push({...s, x, niveau:"dichtbij", afstand:Math.round(d / 10) * 10});
    }
  }
  // volgorde: 1. hinder, 2. postcode (daarna straat-match vóór gebied, dan klantcode)
  const nv = {straat:0, dichtbij:1, gebied:2};
  rijen.sort((a, b) => orde[a.x.hinder] - orde[b.x.hinder] || a.postcode.replace(/\s/g, "").localeCompare(b.postcode.replace(/\s/g, "")) ||
    nv[a.niveau] - nv[b.niveau] || a.klant.localeCompare(b.klant, "nl", {numeric: true}));
  return rijen;
}

/** Postcodegebieden waar gekozen diensten op verschillende dagen rijden (kandidaten om samen te voegen). */
function synchronisatie(gebieden, groepen, f) {
  const per = new Map();
  for (const g of gebieden) { if (groepen && !groepen.has(g.groep)) continue;
    for (const p of g.pc4) { const k = p; if (!per.has(k)) per.set(k, {pc4: p, plaats: g.plaats, d: new Map()});
      const o = per.get(k), oud = o.d.get(g.groep) || [0, 0, 0, 0, 0, 0, 0]; o.d.set(g.groep, oud.map((v, i) => v || g.dagen[i])); } }
  const uit = [];
  for (const o of per.values()) {
    if (o.d.size < 2) continue;
    const patronen = [...o.d.values()].map(d => d.map(v => v ? 1 : 0).join(""));
    if (new Set(patronen).size < 2) continue;
    const samen = [0, 1, 2, 3, 4, 5, 6].filter(i => [...o.d.values()].every(d => d[i]));
    uit.push({pc4: o.pc4, plaats: o.plaats, diensten: Object.fromEntries([...o.d].map(([g, d]) => [g, d.map((v, i) => v ? KORT[i] : "").filter(Boolean).join(" ") || "-"])), samen: samen.map(i => KORT[i]).join(" ") || "geen"});
  }
  return uit.filter(r => !f || pcIn(f, r.pc4) || tekstIn(f, r.plaats)).sort((a, b) => a.plaats.localeCompare(b.plaats) || a.pc4.localeCompare(b.pc4));
}
return {DAGEN, KORT, maakFilter, leesGeogroepen, leesOptimiserPlan, ritKolommen, waarschijnlijkeKop, klantHinder, straatKern, planDag, synchronisatie, weekdag, actief};
});
