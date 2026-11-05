#!/usr/bin/env python3
"""Maakt site/routecheck-offline.html: één bestand met meldingen en lezer, voor pc's zonder toegang tot de site.
Bevat alleen openbare meldingen, geen routegegevens. Gebruik: python3 scripts/offline.py"""
import json
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


def js(naam):
    return (SITE / naam).read_text("utf-8").replace("</script", "<\\/script")


def main():
    h = (SITE / "routecheck.html").read_text("utf-8")
    data = (SITE / "data.json").read_text("utf-8")
    wp = SITE / "woonplaatsen.json"
    wp = wp.read_text("utf-8") if wp.exists() else "[]"
    csp = ("default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; "
           "base-uri 'none'; form-action 'none'")
    h = re.sub(r"<!--CSP-->.*?<!--/CSP-->", lambda m: f'<meta http-equiv="Content-Security-Policy" content="{csp}">', h, flags=re.S)
    h = h.replace(' — <a href="index.html" class="geenprint">terug naar PlaatsRadar</a>', " (offline versie)")
    data_js = "window.PR_DATA=" + data.replace("</", "<\\/") + ";window.PR_WP=" + wp.replace("</", "<\\/") + ";"
    blok = (f'<script type="text/plain" id="pdfw">{js("vendor/pdf.worker.min.js")}</script>\n'
            f"<script>{js('vendor/pdf.min.js')}</script>\n<script>{js('route-kern.js')}</script>\n<script>{data_js}</script>")
    a = '<script src="vendor/pdf.min.js"></script>\n<script src="route-kern.js"></script>'
    assert a in h
    h = h.replace(a, blok)
    (SITE / "routecheck-offline.html").write_text(h, "utf-8")
    print(f"offline: {len(h) / 1e6:.1f} MB, {len(json.loads(data)['items'])} meldingen")


if __name__ == "__main__":
    main()
