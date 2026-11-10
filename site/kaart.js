/* PlaatsRadar kaart: tekent gemeentegrenzen, postcodegebieden en punten als SVG, zonder kaartdienst of internet.
   Geen kaarttegels = er gaat niets naar buiten over welk gebied je bekijkt. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Kaart = f(); })(this, function () {
"use strict";
const NS = "http://www.w3.org/2000/svg", LAT0 = 51.6, COS = Math.cos(LAT0 * Math.PI / 180), S = 1000;
const px = lon => (lon - 5) * COS * S, py = lat => (LAT0 - lat) * S;
const KLEUR = {hoog:"#c8102e", middel:"#f3a712", laag:"#7b8794", geen:"#7b8794"};

function pad(r) {  // platte int-lijst (lon*1e4, lat*1e4) → SVG-pad
  let d = "";
  for (let i = 0; i < r.length; i += 2) d += (i ? "L" : "M") + px(r[i] / 1e4).toFixed(1) + " " + py(r[i + 1] / 1e4).toFixed(1);
  return d + "Z";
}
function grens(r) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < r.length; i += 2) { const x = px(r[i] / 1e4), y = py(r[i + 1] / 1e4); a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d]; }
const el = (n, at, p) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, at[k]); if (p) p.appendChild(e); return e; };

function maak(doos, opt) {
  opt = opt || {};
  const data = opt.data || {gemeenten: [], pc4: []};
  doos.classList.add("kaart");
  doos.innerHTML = `<div class="k-knop"><button type="button" data-z="1.6" title="Inzoomen">+</button><button type="button" data-z="0.625" title="Uitzoomen">−</button><button type="button" data-z="0" title="Alles in beeld">⤢</button></div><div class="k-info" hidden></div>`;
  const svg = el("svg", {class: "k-svg", role: "img", "aria-label": opt.label || "Kaart"}); doos.prepend(svg);
  const view = el("g", {}, svg), gGem = el("g", {class: "k-gem"}, view), gPc = el("g", {class: "k-pc"}, view),
    gLbl = el("g", {class: "k-lbl"}, view), gPlek = el("g", {class: "k-plek"}, view), gPt = el("g", {class: "k-pt"}, view);
  const info = doos.querySelector(".k-info");
  const gemB = [], pcPad = new Map();
  for (const g of data.gemeenten || []) {
    const p = el("path", {d: g.r.map(pad).join(""), class: g.p ? "eigen" : "ander"}, gGem);
    const b = g.r.map(grens).reduce((m, x) => [Math.min(m[0], x[0]), Math.min(m[1], x[1]), Math.max(m[2], x[2]), Math.max(m[3], x[3])]);
    gemB.push({n: g.n, eigen: !!g.p, b}); el("title", {}, p).textContent = g.n;
  }
  for (const v of data.pc4 || []) pcPad.set(v.c, {d: v.r.map(pad).join(""), b: v.r.map(grens)[0]});
  let s = 1, tx = 0, ty = 0, W = 1, H = 1, punten = [], plekken = [];
  const maat = () => { const r = svg.getBoundingClientRect(); W = r.width || 800; H = r.height || 500; svg.setAttribute("viewBox", `0 0 ${W} ${H}`); };
  function zet() {
    view.setAttribute("transform", `translate(${tx} ${ty}) scale(${s})`);
    const r = 5.5 / s, sw = 1.4 / s;
    gPt.querySelectorAll("circle").forEach(c => { c.setAttribute("r", r * (c.dataset.k === "hoog" ? 1.25 : 1)); c.setAttribute("stroke-width", c.classList.contains("ong") ? sw * 1.6 : sw); });
    gPlek.querySelectorAll("rect").forEach(q => { const z = 9 / s; q.setAttribute("x", +q.dataset.x - z / 2); q.setAttribute("y", +q.dataset.y - z / 2); q.setAttribute("width", z); q.setAttribute("height", z); q.setAttribute("stroke-width", sw); });
    gLbl.innerHTML = "";
    const fs = 11 / s, toonGem = s > 2.2, toonPc = s > 9;
    gLbl.setAttribute("stroke-width", 3 / s);
    if (toonGem) for (const g of gemB) if (g.eigen || s > 4) el("text", {x: (g.b[0] + g.b[2]) / 2, y: (g.b[1] + g.b[3]) / 2, "font-size": fs, class: "gl"}, gLbl).textContent = g.n;
    if (toonPc) gPc.querySelectorAll("path").forEach(p => { const b = pcPad.get(p.dataset.c).b; el("text", {x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, "font-size": fs * .95, class: "pl"}, gLbl).textContent = p.dataset.c; });
    if (s > 3) for (const p of plekken) el("text", {x: px(p.lon) + 7 / s, y: py(p.lat) - 6 / s, "font-size": fs * 1.05, class: "sl"}, gLbl).textContent = p.naam;
  }
  function pas(b) {  // b = [minx, miny, maxx, maxy] in kaarteenheden
    maat();
    if (!b || !isFinite(b[0])) b = gemB.filter(g => g.eigen).reduce((m, g) => [Math.min(m[0], g.b[0]), Math.min(m[1], g.b[1]), Math.max(m[2], g.b[2]), Math.max(m[3], g.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    if (!isFinite(b[0])) b = [-150, -150, 150, 150];
    const w = Math.max(b[2] - b[0], 12), h = Math.max(b[3] - b[1], 12);
    s = Math.min(W / w, H / h) * 0.9; s = Math.max(.2, Math.min(s, 60));
    tx = W / 2 - s * (b[0] + b[2]) / 2; ty = H / 2 - s * (b[1] + b[3]) / 2; zet();
  }
  function zoom(f, cx, cy) {
    const n = Math.max(.2, Math.min(s * f, 80)); f = n / s;
    if (cx == null) { cx = W / 2; cy = H / 2; }
    tx = cx - (cx - tx) * f; ty = cy - (cy - ty) * f; s = n; zet();
  }
  const punt = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  svg.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = punt(e); zoom(e.deltaY < 0 ? 1.25 : 0.8, x, y); }, {passive: false});
  const vingers = new Map(); let sleep = null, knijp = null, bewogen = false;
  svg.addEventListener("pointerdown", e => { vingers.set(e.pointerId, punt(e)); bewogen = false;
    if (vingers.size === 1) sleep = [...punt(e), tx, ty];
    if (vingers.size === 2) { const [a, b] = [...vingers.values()]; knijp = Math.hypot(a[0] - b[0], a[1] - b[1]); sleep = null; } });
  svg.addEventListener("pointermove", e => { if (!vingers.has(e.pointerId)) return; vingers.set(e.pointerId, punt(e));
    if (vingers.size === 2 && knijp) { const [a, b] = [...vingers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom(d / knijp, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); knijp = d; bewogen = true; return; }
    if (sleep) { const [x, y] = punt(e); if (!bewogen && Math.abs(x - sleep[0]) + Math.abs(y - sleep[1]) > 3) { bewogen = true; try { svg.setPointerCapture(e.pointerId); } catch {} } tx = sleep[2] + x - sleep[0]; ty = sleep[3] + y - sleep[1]; view.setAttribute("transform", `translate(${tx} ${ty}) scale(${s})`); } });
  const los = e => { vingers.delete(e.pointerId); if (vingers.size < 2) knijp = null; if (!vingers.size) sleep = null; };
  svg.addEventListener("pointerup", los); svg.addEventListener("pointercancel", los); svg.addEventListener("pointerleave", e => { if (!svg.hasPointerCapture(e.pointerId)) los(e); });
  svg.addEventListener("dblclick", e => { const [x, y] = punt(e); zoom(2, x, y); });
  svg.addEventListener("click", e => {
    if (bewogen) return;
    const t = e.target.closest("[data-i]"), v = e.target.closest("[data-c]");
    if (!t && !v) { info.hidden = true; return; }
    const html = t ? (opt.info ? opt.info((t.dataset.soort === "plek" ? plekken : punten)[+t.dataset.i], t.dataset.soort || "punt") : "")
      : (opt.info ? opt.info({pc4: v.dataset.c}, "vlak") : "Postcode " + v.dataset.c);
    if (!html) return;
    info.innerHTML = `<button type="button" class="k-sluit" aria-label="Sluiten">×</button>${html}`; info.hidden = false;
  });
  info.addEventListener("click", e => { if (e.target.classList.contains("k-sluit")) info.hidden = true; });
  doos.querySelector(".k-knop").addEventListener("click", e => { const z = e.target.dataset.z; if (z == null) return; maat(); +z ? zoom(+z) : pas(laatsteB); });
  let laatsteB = null;
  window.addEventListener("resize", () => { const ow = W, oh = H; maat(); tx += (W - ow) / 2; ty += (H - oh) / 2; zet(); });

  /* teken({punten:[{lat,lon,hinder,titel,ongeveer,groep}], plekken:[{lat,lon,naam}], vlakken:Set(pc4) , kleurVlak:{pc4:kleur}}) */
  function teken(l) {
    info.hidden = true; punten = (l.punten || []).filter(p => isFinite(p.lat) && isFinite(p.lon)); plekken = (l.plekken || []).filter(p => isFinite(p.lat) && isFinite(p.lon));
    gPc.innerHTML = ""; gPt.innerHTML = ""; gPlek.innerHTML = "";
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    const groei = (x, y) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; };
    for (const c of l.vlakken || []) { const v = pcPad.get(c); if (!v) continue;
      const p = el("path", {d: v.d, "data-c": c}, gPc); if (l.kleurVlak && l.kleurVlak[c]) p.setAttribute("fill", l.kleurVlak[c]);
      el("title", {}, p).textContent = "Postcode " + c; groei(v.b[0], v.b[1]); groei(v.b[2], v.b[3]); }
    plekken.forEach((p, i) => { const x = px(p.lon), y = py(p.lat); groei(x, y);
      const q = el("rect", {"data-x": x, "data-y": y, "data-i": i, "data-soort": "plek", rx: 1}, gPlek); el("title", {}, q).textContent = p.naam; });
    const orde = {laag: 0, geen: 0, middel: 1, hoog: 2};  // hoog bovenop
    punten.map((p, i) => [p, i]).sort((a, c) => (orde[a[0].hinder] || 0) - (orde[c[0].hinder] || 0)).forEach(([p, i]) => {
      const x = px(p.lon), y = py(p.lat); groei(x, y);
      const c = el("circle", {cx: x, cy: y, "data-i": i, "data-k": p.hinder, class: p.ongeveer ? "ong" : "", fill: p.ongeveer ? "#fff" : (KLEUR[p.hinder] || "#555"), stroke: p.ongeveer ? (KLEUR[p.hinder] || "#555") : "#fff"}, gPt);
      el("title", {}, c).textContent = (p.titel || "") + (p.ongeveer ? " (plek ongeveer: midden gemeente)" : "");
    });
    laatsteB = isFinite(b[0]) ? b : null;
    if (l.pas !== false) pas(laatsteB); else zet();
  }
  maat(); pas(null);
  return {teken, pas: () => pas(laatsteB), zoom};
}
const CSS = `.kaart{position:relative;height:560px;background:#dfe9f2;border:1px solid #dde3ea;border-radius:10px;overflow:hidden;touch-action:none;user-select:none}
.k-svg{width:100%;height:100%;display:block;cursor:grab}.k-svg:active{cursor:grabbing}
.k-gem path{stroke-linejoin:round;vector-effect:non-scaling-stroke}.k-gem .eigen{fill:#fff;stroke:#9fb0c3;stroke-width:.8}.k-gem .ander{fill:#eef1f4;stroke:#c9d2dc;stroke-width:.6}
.k-pc path{cursor:pointer;fill:#cfe0f5;stroke:#5a86b8;stroke-width:.7;vector-effect:non-scaling-stroke;opacity:.85}
.k-lbl text{text-anchor:middle;pointer-events:none;paint-order:stroke;stroke:#fff;stroke-linejoin:round;font-family:system-ui,sans-serif}
.k-lbl .gl{fill:#5b6878}.k-lbl .pl{fill:#2b4f7c;font-weight:600}.k-lbl .sl{fill:#003366;font-weight:700;text-anchor:start}
.k-pt circle{cursor:pointer}.k-pt circle.ong{fill:rgba(255,255,255,.6)}.k-plek rect{fill:#003366;stroke:#fff;cursor:pointer}
.k-knop{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:4px}.k-knop button{width:34px;height:34px;border:1px solid #b9c4d0;background:#fff;border-radius:8px;font:700 18px system-ui;cursor:pointer;color:#001f3f}
.k-info{position:absolute;left:10px;bottom:10px;max-width:min(420px,calc(100% - 70px));max-height:60%;overflow:auto;background:#fff;border:1px solid #b9c4d0;border-radius:10px;padding:10px 30px 10px 12px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.15)}
.k-sluit{position:absolute;top:4px;right:6px;border:0;background:none;font-size:20px;cursor:pointer;color:#5b6878}
@media(max-width:700px){.kaart{height:430px}}@media print{.k-knop,.k-info{display:none}.kaart{height:600px;break-inside:avoid}}`;
function stijl() { if (typeof document === "undefined" || document.getElementById("kaart-css")) return; const s = document.createElement("style"); s.id = "kaart-css"; s.textContent = CSS; document.head.appendChild(s); }
return {maak: (d, o) => { stijl(); return maak(d, o); }, px, py, KLEUR};
});
