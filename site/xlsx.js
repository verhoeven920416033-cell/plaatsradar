/* Excel (.xlsx) lezen en schrijven in de browser, zonder bibliotheek en zonder netwerk. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Xlsx = f(); })(this, function () {
"use strict";
async function inflate(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
}
async function unzip(buf, filter) {
  const v = new DataView(buf); let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Geen geldig Excel-bestand (.xlsx).");
  let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true), uit = {}, dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const m = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const naam = dec.decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + xl + cl;
    if (!filter.test(naam)) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), ruw = new Uint8Array(buf, start, cs);
    uit[naam] = dec.decode(m === 0 ? ruw : await inflate(ruw));
  }
  return uit;
}
/** Eerste werkblad als rijen met tekst. */
async function lees(buf, DOMParserImpl) {
  const DP = DOMParserImpl || DOMParser, f = await unzip(buf, /sharedStrings\.xml$|worksheets\/sheet\d+\.xml$/);
  const xml = t => new DP().parseFromString(t, "application/xml"), tag = (e, n) => Array.from(e.getElementsByTagNameNS("*", n));
  const ss = f["xl/sharedStrings.xml"] ? tag(xml(f["xl/sharedStrings.xml"]), "si").map(s => tag(s, "t").map(t => t.textContent).join("")) : [];
  const blad = Object.keys(f).filter(n => /sheet\d+\.xml$/.test(n)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!blad) throw new Error("Geen werkblad gevonden.");
  return tag(xml(f[blad]), "row").map(r => { const u = []; tag(r, "c").forEach(c => {
    const ref = (c.getAttribute("r") || "A").replace(/\d/g, ""); let i = 0; for (const ch of ref) i = i * 26 + ch.charCodeAt(0) - 64;
    const t = c.getAttribute("t"), w = (tag(c, "v")[0] || {}).textContent ?? "";
    u[i - 1] = t === "s" ? ss[+w] : t === "inlineStr" ? tag(c, "t").map(x => x.textContent).join("") : w; }); return Array.from(u, x => x ?? ""); });
}
// ---- schrijven: zip zonder compressie
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(bestanden) {
  const enc = new TextEncoder(), delen = [], centraal = []; let off = 0;
  for (const [naam, tekst] of bestanden) {
    const n = enc.encode(naam), d = enc.encode(tekst), c = crc32(d), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    delen.push(new Uint8Array(h.buffer), n, d);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint32(16, c, true); z.setUint32(20, d.length, true); z.setUint32(24, d.length, true); z.setUint16(28, n.length, true); z.setUint32(42, off, true);
    centraal.push(new Uint8Array(z.buffer), n); off += 30 + n.length + d.length;
  }
  const grootte = centraal.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, bestanden.length, true); e.setUint16(10, bestanden.length, true); e.setUint32(12, grootte, true); e.setUint32(16, off, true);
  return new Blob([...delen, ...centraal, new Uint8Array(e.buffer)], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
const x = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const kol = i => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
/** bladen = [{naam, rijen:[[...]]}] -> Blob (.xlsx). Eerste rij vet. */
function schrijf(bladen) {
  const f = [["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${bladen.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${bladen.map((b, i) => `<sheet name="${x(b.naam.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${bladen.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${bladen.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]];
  bladen.forEach((b, i) => f.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${
    b.rijen.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => typeof c === "number" ? `<c r="${kol(ci)}${ri + 1}"${ri ? "" : ' s="1"'}><v>${c}</v></c>` : `<c r="${kol(ci)}${ri + 1}" t="inlineStr"${ri ? "" : ' s="1"'}><is><t xml:space="preserve">${x(c)}</t></is></c>`).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${kol(Math.max(0, (b.rijen[0] || []).length - 1))}${Math.max(1, b.rijen.length)}"/></worksheet>`]));
  return zip(f);
}
return {lees, schrijf, unzip, crc32};
});
