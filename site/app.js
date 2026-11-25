/* PlaatsRadar app-schil: navigatie, hulp, sneltoetsen, foutmelding, voorkeuren, versie. Geen netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.PR_App = f(); })(this, function () {
"use strict";
const VERSIE = "2026-11-25";
const NIEUW = [
  ["2026-11-25", "Printen: elke route altijd op een eigen A4, ook met maar één of twee bijzonderheden. Geldt voor Print per route, 🖨 per rit én gewoon Ctrl+P. Om uit te delen bij de huddle."],
  ["2026-11-24", "Werkelijke planning printen per route: 'Print per route' zet elke rit op een eigen A4; 🖨 bij een rit print alleen die route."],
  ["2026-11-24", "Werkelijke planning standaard alleen hoog (kortere briefing); middel en laag zet je zelf aan."],
  ["2026-11-23", "Opdrachten: per lijst hoog / middel / laag aan en uit (met aantallen, wordt onthouden). Melding volledig leesbaar met soort, uitleg en bron; andere meldingen op dezelfde plek uitklapbaar."],
  ["2026-11-23", "Opdrachten: laad beide exports tegelijk. Links 'Opdrachten gedurende planning' (per postcode, alleen hoog), rechts 'Werkelijke planning' (per rit, geclusterd op postcode, hoog en middel). Knop: naast elkaar of één lijst. ⇄ zet een bestand in de andere lijst."],
  ["2026-11-23", "Opdrachten met routenummers: standaard per rit gesorteerd (dan hinder, dan postcode), met een kopregel per rit. Handig voor de huddle. Excel volgt dezelfde volgorde."],
  ["2026-11-23", "Export met Plan-SRit (werkelijk routenummer) wordt herkend, met plaatsnaam en rijdag uit Aankomst ritstop; ook in de Routecheck."],
  ["2026-11-23", "Routenummer onder een andere kolomnaam (bijv. 'Werkelijk routenummer') wordt herkend of op inhoud geraden; bij 'Rit uit' kun je elke kolom kiezen. Plaats ook bij 'woonplaats'."],
  ["2026-11-23", "Ochtendexport zonder rit werkt: tab Opdrachten met per transportcode plaats, straat, huisnummer en hinder. Grafieken standaard uit (knop Grafieken)."],
  ["2026-11-23", "Optimiser-export met geplande route werkt: geplande route gaat voor stamroute, met keuzelijst 'Rit uit'. Andere kolomnamen? Kies ze zelf via 'Kolommen aanpassen'."],
  ["2026-11-17", "Eén navigatiebalk op alle pagina's, hulp per pagina (toets ?), zoeken met /, filters worden onthouden, overzicht van de bronnen op de startpagina."],
  ["2026-11-13", "Om de hoek (≤ 250 m), label nieuw, tijdvakfilter, ✓ verwerkt, tab Week, Routecheck als dashboard."],
  ["2026-11-11", "Planning als dashboard: klikbare kerncijfers, drukste postcodegebieden, per dienst; klantcodes filteren op postcode."],
  ["2026-11-10", "Klantcodes uit de optimiser-export, sorteren op hinder en postcode, kaart zonder internet."],
];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

/* Voorkeuren: alleen in deze browser, nooit route- of klantgegevens. */
function prefs(sleutel) {
  const k = "plaatsradar.voorkeur." + sleutel;
  return {
    lees(standaard) { try { return Object.assign({}, standaard, JSON.parse(localStorage.getItem(k) || "{}")); } catch { return Object.assign({}, standaard); } },
    bewaar(w) { try { localStorage.setItem(k, JSON.stringify(w)); } catch {} },
    wis() { try { localStorage.removeItem(k); } catch {} },
  };
}

const CSS = `.appnav{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:-6px 0 12px;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif}
.appnav .merk{font-weight:800;letter-spacing:.2px;margin-right:10px;color:#fff;text-decoration:none;font-size:14px;display:inline-flex;align-items:center;gap:7px}
.appnav .merk i{width:10px;height:10px;border-radius:50%;background:#c8102e;box-shadow:0 0 0 3px rgba(200,16,46,.3)}
.appnav a.nv{color:#d7e3f2;text-decoration:none;padding:5px 11px;border-radius:999px}.appnav a.nv:hover{background:rgba(255,255,255,.12);color:#fff}
.appnav a.nv.on{background:#fff;color:#001f3f}.appnav .rest{flex:1}
.appnav button,.appnav a.dl{border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:999px;padding:4px 11px;font:inherit;cursor:pointer;text-decoration:none}
.appnav button:hover,.appnav a.dl:hover{background:rgba(255,255,255,.12)}
dialog.hulp{max-width:640px;width:calc(100% - 32px);border:0;border-radius:14px;padding:0;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1a2330}
dialog.hulp::backdrop{background:rgba(0,20,40,.45)}
dialog.hulp .hk{background:linear-gradient(120deg,#001a35,#003366);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
dialog.hulp .hk h2{margin:0;font-size:17px}dialog.hulp .hk button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer}
dialog.hulp .hb{padding:14px 18px 18px;font-size:14px;line-height:1.5;max-height:70vh;overflow:auto}
dialog.hulp h3{font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#003366;margin:14px 0 6px}dialog.hulp h3:first-child{margin-top:0}
dialog.hulp ul{margin:0;padding-left:18px}dialog.hulp li{margin:3px 0}
dialog.hulp kbd{display:inline-block;border:1px solid #c9d3df;border-bottom-width:2px;border-radius:5px;padding:0 6px;font:600 12px ui-monospace,monospace;background:#f6f8fb}
dialog.hulp table{border-collapse:collapse;width:100%;font-size:13px}dialog.hulp td{padding:4px 6px;border-bottom:1px solid #eef1f5;vertical-align:top}dialog.hulp td:first-child{white-space:nowrap;color:#5b6878;width:92px}
.appfout{position:sticky;top:0;z-index:50;background:#fdecee;border-bottom:2px solid #c8102e;color:#5a0715;padding:9px 16px;font-size:13.5px;display:flex;gap:10px;align-items:center}
.appfout button{margin-left:auto;border:1px solid #c8102e;background:#fff;color:#c8102e;border-radius:7px;padding:3px 10px;cursor:pointer;font:600 12px system-ui}
.appvoet{margin-top:6px}.appvoet a{color:inherit;cursor:pointer;text-decoration:underline}
@media print{.appnav,.appfout{display:none!important}}`;

function stijl() { if (document.getElementById("app-css")) return; const s = document.createElement("style"); s.id = "app-css"; s.textContent = CSS; document.head.appendChild(s); }

/** Links: online naar de pagina's, in een werk-pc-bestand naar de andere werkbestanden in dezelfde map. */
function links(pagina) {
  const off = !!window.PR_DATA, basis = off && window.PR_LIVE ? window.PR_LIVE.replace(/data\.json$/, "") : "";
  const L = [["index", "Overzicht", off ? (basis ? basis + "index.html" : "") : "index.html"],
             ["planning", "Planning", off ? "Planning-werk.html" : "planning.html"],
             ["routecheck", "Routecheck", off ? "Routecheck-werk.html" : "routecheck.html"]];
  return L.filter(([, , h]) => h).map(([k, t, h]) => `<a class="nv ${k === pagina ? "on" : ""}" href="${esc(h)}"${k === pagina ? ' aria-current="page"' : ""}${off && k === "index" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${t}</a>`).join("");
}

function hulpDialoog(titel, delen) {
  const d = document.createElement("dialog"); d.className = "hulp"; d.setAttribute("aria-label", "Hulp: " + titel);
  const sneltoetsen = `<h3>Sneltoetsen</h3><table><tr><td><kbd>/</kbd></td><td>naar het zoekveld</td></tr><tr><td><kbd>?</kbd></td><td>deze hulp</td></tr><tr><td><kbd>Esc</kbd></td><td>sluiten / zoekveld leeg</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>P</kbd></td><td>printen (Planning en Routecheck printen wat je ziet)</td></tr></table>`;
  const nieuw = `<h3>Wat is nieuw</h3><table>${NIEUW.map(([d, t]) => `<tr><td>${esc(d)}</td><td>${esc(t)}</td></tr>`).join("")}</table>`;
  d.innerHTML = `<div class="hk"><h2>${esc(titel)}</h2><button type="button" aria-label="Sluiten" data-sluit>×</button></div><div class="hb">${delen.map(([h, items]) => `<h3>${esc(h)}</h3><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`).join("")}${sneltoetsen}${nieuw}</div>`;
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-sluit]")) d.close(); });
  document.body.appendChild(d);
  return d;
}

let foutGetoond = false;
function toonFout(tekst) {
  if (foutGetoond) return; foutGetoond = true;
  const b = document.createElement("div"); b.className = "appfout"; b.setAttribute("role", "alert");
  b.innerHTML = `<b>Er ging iets mis.</b> <span>${esc(String(tekst).slice(0, 160))}</span> <span>Herlaad de pagina (Ctrl+F5). Blijft het: stuur een schermafbeelding.</span><button type="button">Sluiten</button>`;
  b.querySelector("button").onclick = () => b.remove();
  document.body.prepend(b);
}

/** init({pagina, titel, zoek: "#selector", hulp: [[kop, [regels…]]…], download}) */
function init(o) {
  stijl();
  const header = document.querySelector("header");
  if (header && !header.querySelector(".appnav")) {
    const nav = document.createElement("nav"); nav.className = "appnav"; nav.setAttribute("aria-label", "Hoofdmenu");
    const dl = !window.PR_DATA && o.download ? `<a class="dl" href="${esc(o.download[0])}" download="${esc(o.download[1])}" title="Eén bestand voor de werk-pc, werkt zonder installatie">⬇ Werk-pc-versie</a>` : "";
    nav.innerHTML = `<a class="merk" href="${window.PR_DATA ? "#" : "index.html"}"><i></i>PlaatsRadar</a>${links(o.pagina)}<span class="rest"></span>${dl}<button type="button" data-hulp aria-keyshortcuts="?">? Hulp</button>`;
    header.prepend(nav);
  }
  const dlg = hulpDialoog(o.titel || "Hulp", o.hulp || []);
  document.addEventListener("click", e => { if (e.target.closest("[data-hulp]")) dlg.showModal(); });
  document.addEventListener("keydown", e => {
    const t = e.target, typen = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === "Escape" && typen && t.type === "search" && t.value) { t.value = ""; t.dispatchEvent(new Event("input", {bubbles: true})); return; }
    if (typen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/" && o.zoek) { const z = document.querySelector(o.zoek); if (z && z.offsetParent) { e.preventDefault(); z.focus(); z.select(); } }
    else if (e.key === "?") { e.preventDefault(); dlg.open ? dlg.close() : dlg.showModal(); }
  });
  window.addEventListener("error", e => toonFout(e.message || "onbekende fout"));
  window.addEventListener("unhandledrejection", e => toonFout((e.reason && e.reason.message) || e.reason || "onbekende fout"));
  const voet = document.querySelector("footer");
  if (voet && !voet.querySelector(".appvoet")) {
    const v = document.createElement("div"); v.className = "appvoet";
    v.innerHTML = `Versie ${VERSIE}${window.PR_DATA ? " · werk-pc-bestand" : ""} · <a data-hulp>Hulp en wat is nieuw</a>`;
    voet.appendChild(v);
  }
  return {hulp: dlg};
}

return {init, prefs, VERSIE, NIEUW, toonFout};
});
