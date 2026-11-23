// Pagina's: elk inline <script> moet geldige JavaScript zijn (vangt tikfouten die pas in de browser opvallen),
// en de werk-pc-bestanden mogen alleen naar de eigen site verbinden.
const fs = require("fs"), path = require("path"), vm = require("vm");
const SITE = path.join(__dirname, "..", "site");
const fout = m => { console.error("pagina's FOUT", m); process.exit(1); };
let n = 0;
for (const f of ["index.html", "planning.html", "routecheck.html"]) {
  const h = fs.readFileSync(path.join(SITE, f), "utf8");
  for (const m of h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1], {filename: f}); n++; } catch (e) { fout(`${f}: ${e.message}`); }
  }
  for (const m of h.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) if (!/^https?:/.test(m[1]) && !fs.existsSync(path.join(SITE, m[1]))) fout(`${f}: ontbrekend script ${m[1]}`);
  if (f !== "index.html" && !/<!--CSP-->/.test(h)) fout(`${f}: CSP-markering ontbreekt`);
}
for (const f of ["app.js", "hulp.js", "kaart.js", "route-kern.js", "plan-kern.js", "xlsx.js"]) {
  try { new vm.Script(fs.readFileSync(path.join(SITE, f), "utf8"), {filename: f}); n++; } catch (e) { fout(`${f}: ${e.message}`); }
}
for (const f of ["routecheck-offline.html", "planning-offline.html"]) {
  const p = path.join(SITE, f); if (!fs.existsSync(p)) continue;
  const h = fs.readFileSync(p, "utf8"), csp = (/Content-Security-Policy" content="([^"]+)"/.exec(h) || [])[1] || "";
  const c = (/connect-src ([^;]+)/.exec(csp) || [])[1] || "";
  if (!c || /\*|http:/.test(c) || c.trim().split(/\s+/).length > 1) fout(`${f}: connect-src te ruim: ${c}`);
  if (!/form-action 'none'/.test(csp)) fout(`${f}: form-action ontbreekt`);
}
console.log(`pagina's OK (${n} scripts)`);
