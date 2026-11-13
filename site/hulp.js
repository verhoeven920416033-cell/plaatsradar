/* PlaatsRadar hulp: plek van een postcode, afstand tot een melding, tijdvak, nieuw, verwerkt. Geen netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PR_Hulp = f(); })(this, function () {
"use strict";

/** pc6.json → Map("5611AB" → [lon, lat]). Formaat per pc4: [x0, y0, "AB", dx, dy, "AC", dx, dy, …] in 1e-4 graden. */
function maakPc6(data) {
  const m = new Map();
  for (const c in data || {}) {
    const a = data[c], x0 = a[0], y0 = a[1];
    for (let i = 2; i + 2 < a.length; i += 3) m.set(c + a[i], [(x0 + a[i + 1]) / 1e4, (y0 + a[i + 2]) / 1e4]);
  }
  return m;
}
const pcSleutel = pc => String(pc || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^[A-Z]+(?=\d{4})/, "").slice(0, 6);
function plek(pc6, postcode) { const k = pcSleutel(postcode); return /^\d{4}[A-Z]{2}$/.test(k) ? pc6.get(k) || null : null; }

const KM = 111320;
/** Punten van een melding als [[lon, lat], …]: de vorm (pts) of anders het middelpunt. */
function punten(x) {
  if (x._p) return x._p;
  const p = [];
  if (x.pts && x.pts.length >= 4) for (let i = 0; i + 1 < x.pts.length; i += 2) p.push([x.pts[i] / 1e4, x.pts[i + 1] / 1e4]);
  else if (isFinite(x.lat) && isFinite(x.lon)) p.push([x.lon, x.lat]);
  Object.defineProperty(x, "_p", {value: p, enumerable: false});
  return p;
}
/** Kortste afstand in meters van [lon, lat] tot de melding (lijnstukken tussen de punten). Infinity zonder plek. */
function afstand(x, lon, lat) {
  const p = punten(x); if (!p.length) return Infinity;
  const cx = Math.cos(lat * Math.PI / 180) * KM, X = q => (q[0] - lon) * cx, Y = q => (q[1] - lat) * KM;
  let best = Infinity;
  if (p.length === 1) return Math.hypot(X(p[0]), Y(p[0]));
  for (let i = 0; i + 1 < p.length; i++) {
    const ax = X(p[i]), ay = Y(p[i]), bx = X(p[i + 1]), by = Y(p[i + 1]), dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    // sprong > 1,5 km = twee losse plekken van dezelfde klus: niet als weg ertussen tellen
    const t = l > 1500 * 1500 ? 0 : l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    if (l > 1500 * 1500) best = Math.min(best, Math.hypot(bx, by));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Valt de melding (deels) binnen het tijdvak uVan–uTot ("06:00"–"19:00") op een dag tussen dagVan en dagTot? Leeg tijdvak = altijd. */
const tijd = s => { if (!s) return null; const d = new Date(s.length <= 10 ? s + "T00:00" : s); return isNaN(d) ? null : d; };
function tijdOk(x, dagVan, dagTot, uVan, uTot) {
  if (!uVan && !uTot) return true;
  const vakken = (x.perioden && x.perioden.length ? x.perioden : [[x.start, x.eind]]).map(([s, e]) => {
    const a = tijd(s); let b = tijd(e);
    if (!a) return null;
    if (!b || b <= a) { b = new Date(a); if (!s || s.length <= 10) b.setDate(b.getDate() + 1); else b.setHours(b.getHours() + 1); }
    if (s && s.length <= 10 && e && e.length <= 10) b.setDate(b.getDate() + 1);  // datum t/m datum = hele dagen
    return [a, b];
  }).filter(Boolean);
  if (!vakken.length) return true;  // datum onbekend: niet wegfilteren
  const [h1, m1] = (uVan || "00:00").split(":").map(Number), [h2, m2] = (uTot || "24:00").split(":").map(Number);
  for (let d = new Date(dagVan + "T00:00"), eind = new Date((dagTot || dagVan) + "T00:00"); d <= eind; d.setDate(d.getDate() + 1)) {
    const w0 = new Date(d); w0.setHours(h1, m1 || 0, 0, 0);
    const w1 = new Date(d); w1.setHours(h2, m2 || 0, 0, 0); if (w1 <= w0) w1.setDate(w1.getDate() + 1);  // over middernacht
    if (vakken.some(([a, b]) => a < w1 && b > w0)) return true;
  }
  return false;
}

/** Nieuw = voor het eerst gezien in de 24 uur vóór de meldingen-stand. */
const isNieuw = (x, gegenereerd) => !!x.sinds && (new Date(gegenereerd) - new Date(x.sinds)) <= 864e5;

/** Verwerkt-vinkjes: alleen in deze browser (localStorage), per melding-id; na 45 dagen weg. */
const SL = "plaatsradar-verwerkt";
function verwerkt() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(SL) || "{}") || {}; } catch { d = {}; }
  const grens = Date.now() - 45 * 864e5;
  for (const k in d) if (!(d[k] > grens)) delete d[k];
  const bewaar = () => { try { localStorage.setItem(SL, JSON.stringify(d)); } catch {} };
  return {has: id => !!d[id], wissel: id => { if (d[id]) delete d[id]; else d[id] = Date.now(); bewaar(); return !!d[id]; }, aantal: () => Object.keys(d).length};
}

return {maakPc6, plek, pcSleutel, punten, afstand, tijdOk, isNieuw, verwerkt};
});
