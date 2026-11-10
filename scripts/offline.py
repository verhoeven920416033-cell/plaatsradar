#!/usr/bin/env python3
"""Maakt site/routecheck-offline.html en site/planning-offline.html: elk één bestand met lezer en openbare meldingen voor de werk-pc, geen installatie.
Bij openen probeert het verse meldingen op te halen (alleen downloaden); daarna gaat het netwerk van de pagina dicht.
Bevat geen routegegevens. Gebruik: python3 scripts/offline.py"""
import json
import os
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


def js(naam):
    return (SITE / naam).read_text("utf-8").replace("</script", "<\\/script")


def bouw(pagina, uit, scripts, data_js, csp, pdf_worker=False):
    h = (SITE / pagina).read_text("utf-8")
    h = re.sub(r"<!--CSP-->.*?<!--/CSP-->", lambda m: f'<meta http-equiv="Content-Security-Policy" content="{csp}">', h, flags=re.S)
    h = re.sub(r' — <a href="index\.html".*?</a></p>', " (versie voor werk-pc)</p>", h, count=1, flags=re.S)
    blok = (f'<script type="text/plain" id="pdfw">{js("vendor/pdf.worker.min.js")}</script>\n' if pdf_worker else "")
    blok += "".join(f"<script>{js(s)}</script>\n" for s in scripts) + f"<script>{data_js}</script>"
    a = "\n".join(f'<script src="{s}"></script>' for s in scripts)
    assert a in h, (pagina, a)
    h = h.replace(a, blok)
    (SITE / uit).write_text(h, "utf-8")
    return len(h)


def main():
    data = (SITE / "data.json").read_text("utf-8")
    wp = SITE / "woonplaatsen.json"
    wp = wp.read_text("utf-8") if wp.exists() else "[]"
    repo = os.environ.get("GITHUB_REPOSITORY", "")  # eigenaar/naam
    eig, _, naam = repo.partition("/")
    host = f"https://{eig}.github.io" if eig else ""
    live = f"{host}/{naam}/data.json" if eig else ""
    csp = (f"default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src {host or chr(39) + 'none' + chr(39)}; "
           "style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
    data_js = ("window.PR_DATA=" + data.replace("</", "<\\/") + ";window.PR_WP=" + wp.replace("</", "<\\/") +
               f";window.PR_LIVE={json.dumps(live)};")
    n1 = bouw("routecheck.html", "routecheck-offline.html", ["vendor/pdf.min.js", "route-kern.js"], data_js, csp, pdf_worker=True)
    n2 = bouw("planning.html", "planning-offline.html", ["xlsx.js", "plan-kern.js"], data_js, csp)
    print(f"offline: routecheck {n1 / 1e6:.1f} MB, planning {n2 / 1e6:.1f} MB, {len(json.loads(data)['items'])} meldingen")


if __name__ == "__main__":
    main()
