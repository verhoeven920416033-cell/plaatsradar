/* Planning vooruit: geogroepen (postcodegebieden per dienst en weekdag) naast de meldingen. Geen netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PlanKern = f(); })(this, function () {
"use strict";
const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"], KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const ja = v => /^(ja|j|yes|y|x|1|waar|true)$/i.test(String(v ?? "").trim());
const kern = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Optimiser-export (SRit + Laad-losplaats postcode/plaats + Vroegste laden) -> gebieden per rit, postcodegebied en rijdag.
    Alleen rit, postcode, plaats en datum worden gelezen; naam, straat, waarde en tijden niet. */
function datumVan(v) {
  const t = String(v ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(t) && +t > 30000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 864e5).toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) || /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t);
  return !m ? "" : m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function leesOptimiserPlan(rijen, opt) {
  const kop = h => String(h ?? "").trim();
  const k = rijen.slice(0, 10).findIndex(r => r.some(c => /^s?rit$/i.test(kop(c))) && r.some(c => /laad-?losplaats (postcode|straat)/i.test(kop(c))));
  if (k < 0) return null;
  const ci = re => rijen[k].findIndex(c => re.test(kop(c)));
  const c = {rit: ci(/^s?rit$/i), pc: ci(/laad-?losplaats postcode|^postcode$/i), plaats: ci(/laad-?losplaats plaats|^plaats$/i), datum: ci(/vroegste laden|^datum$/i)};
  if (c.pc < 0) throw new Error("Optimiser-export zonder kolom 'Laad-losplaats postcode'.");
  const skip = new Set(((opt || {}).skip || []).map(String)), per = new Map(), datums = new Set(), fout = [], overgeslagen = new Set();
  for (const r of rijen.slice(k + 1)) {
    const rit = kop(r[c.rit]); if (!rit) continue;
    if (skip.has(rit)) { overgeslagen.add(rit); continue; }
    const m = /(\d{4})\s*[A-Z]{0,2}\s*$/i.exec(kop(r[c.pc]));
    if (!m) { fout.push("Rit " + rit + ": geen postcode"); continue; }
    const d = c.datum >= 0 ? datumVan(r[c.datum]) : ""; if (d) datums.add(d);
    const wd = d ? (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7 : -1;
    const key = rit + "|" + m[1];
    if (!per.has(key)) per.set(key, {groep: "Rit " + rit, plaats: c.plaats >= 0 ? kop(r[c.plaats]) : "", van: m[1], tot: m[1], pc4: [m[1]], dagen: Array(7).fill(false)});
    const g = per.get(key); if (wd < 0) g.dagen.fill(true); else g.dagen[wd] = true;
  }
  const gebieden = [...per.values()], groepen = [...new Set(gebieden.map(g => g.groep))].sort((a, b) => a.localeCompare(b, "nl", {numeric: true}));
  return {gebieden, fout, groepen, datums: [...datums].sort(), bron: "optimiser", overgeslagen: [...overgeslagen]};
}

/** Rijen uit het Excel -> gebieden {groep, plaats, van, tot, pc4[], dagen[7]}. Kolommen op kopnaam. */
function leesGeogroepen(rijen, opt) {
  const o = leesOptimiserPlan(rijen, opt); if (o) return o;
  const k = rijen.slice(0, 20).findIndex(r => r.some(c => /locatie ?groep|^groep$/i.test(String(c).trim())) && r.some(c => /^van$/i.test(String(c).trim())));
  if (k < 0) throw new Error("Kolommen niet herkend. Kies het geogroepen-Excel ('Locatie groep', 'Omschrijving', 'Van', 'Tot' en de weekdagen) of de optimiser-export ('SRit', 'Laad-losplaats postcode').");
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
  const relevant = items.filter(x => !x.fiets && x.cat !== "markt" && hOk(x) && (!opt.soort || opt.soort(x)) && actief(x, opt.datum));
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
    rijen: p.rijen.sort((a, b) => orde[a.x.hinder] - orde[b.x.hinder] || (a.x.titel > b.x.titel ? 1 : -1))}))
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
return {DAGEN, KORT, maakFilter, leesGeogroepen, leesOptimiserPlan, planDag, synchronisatie, weekdag, actief};
});
