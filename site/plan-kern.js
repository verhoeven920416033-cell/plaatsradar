/* Planning vooruit: geogroepen (postcodegebieden per dienst en weekdag) naast de meldingen. Geen netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PlanKern = f(); })(this, function () {
"use strict";
const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"], KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const ja = v => /^(ja|j|yes|y|x|1|waar|true)$/i.test(String(v ?? "").trim());
const kern = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Rijen uit het Excel -> gebieden {groep, plaats, van, tot, pc4[], dagen[7]}. Kolommen op kopnaam. */
function leesGeogroepen(rijen) {
  const k = rijen.slice(0, 20).findIndex(r => r.some(c => /locatie ?groep|^groep$/i.test(String(c).trim())) && r.some(c => /^van$/i.test(String(c).trim())));
  if (k < 0) throw new Error("Kolommen niet herkend. Verwacht o.a. 'Locatie groep', 'Omschrijving', 'Van', 'Tot' en de weekdagen.");
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
  const relevant = items.filter(x => !x.fiets && x.cat !== "markt" && (opt.laag || x.hinder !== "laag") && actief(x, opt.datum));
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
  return {dag: DAGEN[dag], gebieden: pc.size, plaatsen: lijst, zonder: [...zonder.values()], meldingen: geteld.size,
          hoog: relevant.filter(x => geteld.has(x.id) && x.hinder === "hoog").length};
}

/** Postcodegebieden waar gekozen diensten op verschillende dagen rijden (kandidaten om samen te voegen). */
function synchronisatie(gebieden, groepen) {
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
  return uit.sort((a, b) => a.plaats.localeCompare(b.plaats) || a.pc4.localeCompare(b.pc4));
}
return {DAGEN, KORT, leesGeogroepen, planDag, synchronisatie, weekdag, actief};
});
