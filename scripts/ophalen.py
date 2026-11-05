#!/usr/bin/env python3
"""PlaatsRadar — haalt actuele wegwerk, evenementen, kermissen en markten op.

Bronnen (allemaal gratis, zonder sleutel):
  1. NDW open data  — planningsfeed wegwerkzaamheden & evenementen (DATEX II v3, CC0)
  2. KOOP SRU-API   — Gemeenteblad: evenementenvergunningen, kermissen, verkeersbesluiten
  3. config.json    — vaste weekmarkten (uit de marktreglementen)
  4. OSM Nominatim  — straatnaam bij wegwerk zonder omschrijving (gecachet)

Gebruik:
  python3 scripts/ophalen.py                 # schrijft site/data.json
  python3 scripts/ophalen.py --ndw feed.xml.gz --geen-gemeenteblad   # lokaal testen
Alleen standaardbibliotheek, Python 3.10+.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import html
import io
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Amsterdam")
ROOT = Path(__file__).resolve().parent.parent
NDW_URL = "https://opendata.ndw.nu/planningsfeed_wegwerkzaamheden_en_evenementen.xml.gz"
SRU_URL = "https://repository.overheid.nl/sru"
NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
UA = f"PlaatsRadar/1.1 (open-data dashboard; github.com/{os.environ.get('GITHUB_REPOSITORY', 'lokaal')})"
XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"

MAANDEN = {m: i + 1 for i, m in enumerate(
    "januari februari maart april mei juni juli augustus september oktober november december".split())}
MAANDEN.update({"jan": 1, "feb": 2, "mrt": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "okt": 10, "nov": 11, "dec": 12})
MAAND_RE = "|".join(sorted(MAANDEN, key=len, reverse=True))
DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ln(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def http_get(url: str, timeout: int = 90, tries: int = 3) -> bytes:
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # netwerkfout: kort wachten en opnieuw
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"ophalen mislukt: {url} ({last})")


def km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_ts(s: str | None) -> dt.datetime | None:
    if not s:
        return None
    s = s.strip()
    try:
        base = dt.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    tail = s[19:]
    tail = re.sub(r"^\.\d+", "", tail)  # nanoseconden weg
    if tail in ("", "Z"):
        return base.replace(tzinfo=dt.timezone.utc)
    m = re.match(r"([+-])(\d{2}):?(\d{2})", tail)
    if m:
        off = dt.timedelta(hours=int(m[2]), minutes=int(m[3])) * (1 if m[1] == "+" else -1)
        return base.replace(tzinfo=dt.timezone(off))
    return base.replace(tzinfo=dt.timezone.utc)


def local_iso(d: dt.datetime | None) -> str | None:
    return d.astimezone(TZ).strftime("%Y-%m-%dT%H:%M") if d else None


# ---------------------------------------------------------------- cache
class Cache:
    def __init__(self, path: Path):
        self.path = path
        try:
            self.d = json.loads(path.read_text("utf-8"))
        except Exception:
            self.d = {}
        self.d.setdefault("geo", {})
        self.d.setdefault("gmb", {})
        self.d.setdefault("sru", {})
        if self.d.get("v") != 3:  # oude cache had geen omschrijving/afsluiting-info
            self.d.update(v=3, gmb={}, sru={})

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # klein houden: max 3000 geo-items, gmb ouder dan 120 dagen weg
        geo = self.d["geo"]
        if len(geo) > 3000:
            self.d["geo"] = dict(list(geo.items())[-3000:])
        cutoff = (dt.date.today() - dt.timedelta(days=120)).isoformat()
        self.d["gmb"] = {k: v for k, v in self.d["gmb"].items() if v.get("seen", "9") >= cutoff}
        self.path.write_text(json.dumps(self.d, ensure_ascii=False), "utf-8")


# ---------------------------------------------------------------- NDW
MGMT_TAGS = {
    "roadOrCarriagewayOrLaneManagementType", "speedManagementType", "reroutingManagementType",
    "generalNetworkManagementType", "roadMaintenanceType", "constructionWorkType", "publicEventType",
    "causeType", "trafficControlType", "winterEquipmentManagementType",
}
DICHT = {"roadClosed", "carriagewayClosures", "closedPermanentlyForTheWinter", "dedicatedLaneClosure"}
BEPERKING = {"laneClosures", "narrowLanes", "singleAlternateLineTraffic", "contraflow", "lanesDeviated",
             "temporaryTrafficLights", "trafficLightsNotWorking", "intermittentShortTermClosures",
             "carriagewayDeviated", "useOfSpecifiedLanesOrCarriagewaysAllowed", "doNotUseSpecifiedLanesOrCarriageways"}
MAX_KM = 15  # verder van elk gemeentecentrum = buiten de drie provincies
MOTOR = {"car", "van", "lorry", "bus", "carWithTrailer", "articulatedVehicle"}
SLIP = {"entrySlipRoad", "exitSlipRoad", "connectingCarriageway"}
RUIM = {"betweenTenMinutesAndThirtyMinutes", "betweenThirtyMinutesAndOneHour", "overOneHour", "longerThanOneHour"}
EVENT_NL = {"footballMatch": "voetbal", "festival": "festival", "market": "markt", "concert": "concert",
            "sportsMeeting": "sport", "fair": "kermis", "marathon": "marathon", "parade": "optocht",
            "procession": "optocht", "cycleRace": "wielrennen"}
# Geen titelmateriaal: nummering, of contactgegevens van medewerkers (die publiceren we niet).
RE_RUIS = re.compile(r"^(?:beperking|omleiding)(?:\s+\w{1,3})?$|^afsluiting$|^alternatieve routes$|^contact|"
                     r"^project\s*:|telefoon|@|\b(?:dhr|mevr|mw)\.", re.I)
RE_ALGEMEEN = re.compile(r"^(?:weg dicht in (?:beide|een) richtingen?|snelheidsbeperking|verminderd aantal rijstroken"
                         r"(?: beschikbaar)?|beperking voor langzaam verkeer|geen gevolgen voor verkeer|evenement|"
                         r"bouwactiviteiten|parkeerverboden|asfaltering / wegverharding)\.?$", re.I)
RE_ZACHT = re.compile(r"fietspad|fietsstraat|fietsroute|voetpad|trottoir|stoep", re.I)
RE_HOOFDWEG = re.compile(r"^(?:[ANS]\d{1,3})\b")


def first_text(el, name):
    for e in el.iter():
        if ln(e.tag) == name and e.text and e.text.strip():
            return e.text.strip()
    return None


def all_text(el, name):
    return [e.text.strip() for e in el.iter() if ln(e.tag) == name and e.text and e.text.strip()]


def uniek(seq):
    return list(dict.fromkeys(x for x in seq if x))


def record_points(rec, cap=400):
    pts = []
    for e in rec.iter():
        tag = ln(e.tag)
        if tag == "pointCoordinates":
            la, lo = first_text(e, "latitude"), first_text(e, "longitude")
            if la and lo:
                try:
                    pts.append((float(la), float(lo)))
                except ValueError:
                    pass
        elif tag == "posList" and e.text:
            nums = e.text.split()
            for i in range(0, min(len(nums) - 1, cap * 2), 2):
                try:
                    pts.append((float(nums[i]), float(nums[i + 1])))
                except ValueError:
                    break
    return pts


def rec_type(rec) -> str:
    for k, v in rec.attrib.items():
        if k == XSI_TYPE or k.endswith("type"):
            return v.split(":")[-1]
    return ""


def rec_comments(rec):
    """[(commentType, tekst)] uit generalPublicComment."""
    out = []
    for c in rec.iter():
        if ln(c.tag) == "generalPublicComment":
            v = first_text(c, "value")
            if v:
                out.append((first_text(c, "commentType") or "", re.sub(r"\s+", " ", v)))
    return out


def rec_periods(rec):
    """Werkelijke uitvoeringsvensters (validPeriod); leeg = geldt het hele overall-venster."""
    out = []
    for p in rec.iter():
        if ln(p.tag) == "validPeriod":
            s, e = parse_ts(first_text(p, "startOfPeriod")), parse_ts(first_text(p, "endOfPeriod"))
            if s and e:
                out.append((s, e))
    return out


def merge_periods(ps):
    res = []
    for s, e in sorted(ps):
        if res and s <= res[-1][1]:
            res[-1] = (res[-1][0], max(res[-1][1], e))
        else:
            res.append((s, e))
    return res


def schoon_notitie(t: str) -> str:
    t = re.sub(r"\s*\(\d{4,}\)\s*$", "", t)
    t = re.sub(r"\s*\|\s*", " – ", t)
    t = re.sub(r"\bOverig\b,?\s*(?:– )?", "", t)
    t = re.sub(r"(?:,\s*)+(?=–|,|$)|\s,", "", t)
    t = re.sub(r"\s*–\s*", " – ", t)
    return re.sub(r"\s+", " ", t).strip(" –,")


def kies_titel(notes, warnings, others, reroutes, wegen, oorzaak):
    """Beste omschrijving. Volgorde gekozen op basis van de echte feed (nov 2026)."""
    for t in notes:
        return schoon_notitie(t)
    for t in warnings:
        if not RE_ALGEMEEN.match(t):
            return t
    for t in reroutes:
        if re.search(r"afgesloten|dicht", t, re.I):
            return re.split(r"(?<=[.!?])\s", t, maxsplit=1)[0]
    if wegen:
        return " / ".join(wegen[:3]) + (f" – {oorzaak}" if oorzaak else "")
    for t in others:
        return t
    return ""


def bepaal_hinder(closed, slip, zacht, beperkt, alleen_snelheid, klasse, delay, geen_gevolg, hoofdweg):
    if geen_gevolg or (not closed and (klasse == 0 or delay == "negligible")):
        return "laag", ("Weg dicht" if closed else "Werkzaamheden")
    if closed:
        label = "Op-/afrit dicht" if slip else "Weg dicht"
        fors = klasse is None or klasse >= 2 or delay in RUIM or hoofdweg or slip
        return ("hoog" if fors else "middel"), label
    if zacht:
        return "laag", "Fiets-/voetpad dicht"
    if beperkt:
        return ("laag" if alleen_snelheid and not hoofdweg else "middel"), ("Snelheidsbeperking" if alleen_snelheid else "Beperking")
    return ("middel" if klasse is not None and klasse >= 2 else "laag"), "Werkzaamheden"


def maak_zoeker(gemeenten):
    """Wijst een situatie toe aan een gemeente: eerst op bron ('Gemeente Arnhem'), anders dichtstbijzijnde centrum."""
    per_naam = {g["naam"].lower(): g for g in gemeenten}
    la0, la1 = min(g["lat"] for g in gemeenten) - 0.2, max(g["lat"] for g in gemeenten) + 0.2
    lo0, lo1 = min(g["lon"] for g in gemeenten) - 0.3, max(g["lon"] for g in gemeenten) + 0.3
    cosl = math.cos(math.radians((la0 + la1) / 2))

    def afstand2(g, pt):  # snelle benadering: 13.000 situaties x 138 gemeenten
        return (g["lat"] - pt[0]) ** 2 + ((g["lon"] - pt[1]) * cosl) ** 2

    def zoek(pts, bron):
        pt = pts[len(pts) // 2]
        if not (la0 < pt[0] < la1 and lo0 < pt[1] < lo1):
            return None
        m = re.match(r"(gemeente|provincie)\s+(.+)", bron.strip(), re.I)
        soort, naam = (m[1].lower(), m[2].strip().lower()) if m else ("", "")
        if soort == "gemeente" and naam in per_naam:
            g = per_naam[naam]
            return g, km(g["lat"], g["lon"], *pt)
        if soort == "provincie" and naam not in {g["provincie"].lower() for g in gemeenten} | {"gelderland", "limburg", "noord-brabant"}:
            return None
        g = min(gemeenten, key=lambda x: afstand2(x, pt))
        d = km(g["lat"], g["lon"], *pt)
        # andere gemeente als bron = waarschijnlijk net over de provinciegrens
        return (g, d) if d <= (8 if soort == "gemeente" else MAX_KM) else None
    return zoek


def parse_ndw(stream, gemeenten, now, horizon_end, stats):
    """Streamt de NDW-feed; geeft situaties in het zoekgebied met een uitvoeringsvenster in [now, horizon_end]."""
    out = []
    zoek = maak_zoeker(gemeenten)
    for _ev, elem in ET.iterparse(stream, events=("end",)):
        if ln(elem.tag) != "situation":
            continue
        try:
            stats["situaties"] += 1
            recs = [e for e in elem.iter() if ln(e.tag) == "situationRecord"]
            if not recs:
                continue
            # omleidingsroutes tellen niet mee: die liggen vaak ver van de werkplek
            pts = [pt for r in recs if rec_type(r) != "ReroutingManagement" for pt in record_points(r)]
            if not pts:
                pts = [pt for r in recs for pt in record_points(r)]
            if not pts:
                stats["zonder_locatie"] += 1
                continue
            best = zoek(pts, first_text(recs[0], "value") or "")
            if not best:
                continue
            stats["in_gebied"] += 1

            periods, base_periods, ends, types, mgmt, sources = [], [], [], set(), set(), []
            notes, warnings, others, reroutes, roads, links, causes = [], [], [], [], [], [], []
            open_end = closed = slip = zacht = beperkt = lanes = speed = False
            for r in recs:
                t = rec_type(r)
                types.add(t)
                s = parse_ts(first_text(r, "overallStartTime"))
                e = parse_ts(first_text(r, "overallEndTime"))
                vensters = rec_periods(r) or ([(s, e)] if s and e else [])
                (periods if t in ("RoadOrCarriagewayOrLaneManagement", "SpeedManagement") else base_periods).extend(vensters)
                if e:
                    ends.append(e)
                else:
                    open_end = True
                rm = {x.text.strip() for x in r.iter() if ln(x.tag) in MGMT_TAGS and x.text and x.text.strip()}
                mgmt |= rm
                sources += all_text(r, "sourceName") or [v for x in r.iter() if ln(x.tag) == "sourceName" for v in all_text(x, "value")]
                for ty, tekst in rec_comments(r):
                    if RE_RUIS.search(tekst):
                        continue
                    (notes if ty == "internalNote" else warnings if ty == "warning" else others).append(tekst)
                for x in r.iter():
                    if ln(x.tag) == "reroutingItineraryDescription":
                        reroutes += all_text(x, "value")
                    elif ln(x.tag) == "causeDescription":
                        causes += all_text(x, "value")
                    elif ln(x.tag) == "urlLink":
                        u = first_text(x, "urlLinkAddress") or ""
                        if u.startswith(("http://", "https://")):
                            links.append(u)
                roads += all_text(r, "roadOrJunctionNumber")
                sluiting = rm & DICHT
                if sluiting or (rm & {"laneClosures"}):
                    voertuig = set(all_text(r, "vehicleType"))
                    if sluiting and voertuig and not voertuig & MOTOR:
                        zacht = True
                    elif sluiting:
                        closed = True
                        rijbanen = set(all_text(r, "carriageway"))
                        slip = slip or bool(rijbanen and rijbanen <= SLIP)
                    else:
                        lanes = True
                if rm & BEPERKING:
                    beperkt = True
                if t == "SpeedManagement" or "speedRestrictionInOperation" in rm:
                    speed = True

            ramen = merge_periods(periods or base_periods)
            ramen = [(s, e) for s, e in ramen if e >= now and s <= horizon_end]
            if not ramen:
                continue
            stats["actief"] += 1
            end = None if open_end or not ends else max(ends)

            notes, warnings, others = uniek(notes), uniek(warnings), uniek(others)
            reroutes = uniek(reroutes)
            causes = uniek(schoon_notitie(c) for c in causes if not RE_RUIS.search(c))
            src = uniek(sources)[0] if sources else ""
            rws = re.search(r"\[(RWS [^\]]+?)(?: District \w+)?\]", src)
            src = rws[1] if rws else src
            # sommige wegbeheerders zetten de sluiting alleen in de waarschuwingstekst
            if any(re.match(r"weg dicht", w, re.I) for w in warnings):
                closed = True
            if any(re.match(r"verminderd aantal rijstroken", w, re.I) for w in warnings):
                lanes = True
            roads = uniek(roads)
            alle = " ".join(notes + warnings + reroutes)
            nrs = uniek(re.findall(r"\b[AN]\d{1,3}\b", alle))
            wegen = roads or nrs
            snelweg = bool(re.search(r"\bRWS\b|Rijkswaterstaat", src)) or any(re.match(r"A\d", w) for w in wegen)
            hoofdweg = snelweg or any(RE_HOOFDWEG.match(w) for w in wegen)
            if closed and not snelweg and RE_ZACHT.search(" ".join(notes[:1] + warnings[:1] + causes[:1])) and not re.search(r"rijbaan|weg dicht", " ".join(warnings), re.I):
                closed, zacht = False, True  # afsluiting zonder voertuigtype, maar de tekst noemt een fietspad
            klasse = max((int(x[-1]) for x in all_text(elem, "roadworkHindranceClass") if x[-1].isdigit()), default=None)
            delay = first_text(elem, "delayBand") or ""
            geen = any(re.match(r"geen gevolgen", w, re.I) for w in warnings)
            hinder, label = bepaal_hinder(closed, slip, zacht, beperkt or lanes or speed, speed and not (beperkt or lanes),
                                          klasse, delay, geen, hoofdweg)
            ev_type = set(all_text(elem, "publicEventType"))
            is_event = "publicEvent" in mgmt or bool(ev_type) or "PublicEvent" in types
            if is_event:
                naam = next((EVENT_NL[t] for t in ev_type if t in EVENT_NL), "evenement")
                label = naam.capitalize() if label == "Werkzaamheden" else f"{label} ({naam})"
            titel = kies_titel(notes, warnings, others, reroutes, wegen, causes[0] if causes else "")
            kort = [w for w in warnings if RE_ALGEMEEN.match(w) and not re.match(r"evenement", w, re.I)]
            mid = pts[len(pts) // 2]
            out.append({
                "id": elem.get("id") or recs[0].get("id"),
                "plaats": best[0]["naam"], "afstand_km": round(best[1], 1), "cat": "weg",
                "label": label, "hinder": hinder, "fiets": zacht and not closed,
                "ramen": ramen, "eind": end,
                "titel_basis": titel,
                "uitleg": uniek(kort + [c for c in causes[:1] if c.lower()[-20:] not in titel.lower()] + [w for w in warnings if not RE_ALGEMEEN.match(w) and w != titel][:1] + [r for r in reroutes if "omgeleid" in r.lower()][:1]),
                "wegen": wegen, "bron": src, "snelweg": snelweg,
                "info": links[0] if links else "",
                "types": sorted(t for t in types | mgmt if t),
                "lat": round(mid[0], 5), "lon": round(mid[1], 5),
            })
        finally:
            elem.clear()
    return out


def reverse_geocode(items, cache: Cache, max_calls=80):
    calls = 0
    for it in items:
        if it["titel_basis"] or it["wegen"]:
            continue
        key = f"{it['lat']:.4f},{it['lon']:.4f}"
        if key not in cache.d["geo"]:
            if calls >= max_calls:
                continue
            q = urllib.parse.urlencode({"lat": it["lat"], "lon": it["lon"], "format": "jsonv2", "zoom": 17, "accept-language": "nl"})
            try:
                data = json.loads(http_get(f"{NOMINATIM}?{q}", timeout=20, tries=1))
                a = data.get("address", {})
                cache.d["geo"][key] = a.get("road") or a.get("pedestrian") or a.get("neighbourhood") or ""
            except Exception as e:
                log("  geocode fout", key, e)
                cache.d["geo"][key] = ""
            calls += 1
            time.sleep(1.1)  # Nominatim-beleid: max 1 per seconde
        it["straat"] = cache.d["geo"].get(key, "")
    log(f"  geocoding: {calls} nieuwe opvragingen")


def finish_ndw(items):
    """Maakt meldingen; zelfde klus in meerdere nachten/fasen wordt één melding met meerdere vensters."""
    rang = {"hoog": 0, "middel": 1, "laag": 2}
    groepen = {}
    for it in items:
        titel = it["titel_basis"] or it.get("straat") or f"{it['label']} – {it['bron'] or 'NDW'}"
        titel = titel[:140]
        key = (it["plaats"], titel.lower(), it["label"])
        g = groepen.get(key)
        if g is None:
            groepen[key] = {**it, "titel": titel}
            continue
        g["ramen"] = g["ramen"] + it["ramen"]
        g["uitleg"] = uniek(g["uitleg"] + it["uitleg"])
        g["eind"] = None if g["eind"] is None or it["eind"] is None else max(g["eind"], it["eind"])
        if rang[it["hinder"]] < rang[g["hinder"]]:
            g["hinder"] = it["hinder"]
    res = []
    for g in groepen.values():
        ramen = merge_periods(g["ramen"])
        loc = " / ".join(g["wegen"][:3]) or g.get("straat") or ""
        res.append({
            "id": g["id"], "plaats": g["plaats"], "cat": "weg", "label": g["label"],
            "titel": g["titel"], "locatie": "" if loc.lower() in g["titel"].lower() else loc,
            "start": local_iso(ramen[0][0]), "eind": local_iso(g["eind"] or ramen[-1][1]) if (g["eind"] or len(ramen)) else None,
            "tijd": None, "hinder": g["hinder"], "snelweg": g["snelweg"], "fiets": g["fiets"],
            "perioden": [[local_iso(s), local_iso(e)] for s, e in ramen[:12]],
            "toelichting": " · ".join(g["uitleg"])[:300],
            "bron": g["bron"] or "NDW", "bron_type": "NDW", "info": g["info"],
            "url": f"https://www.openstreetmap.org/?mlat={g['lat']}&mlon={g['lon']}#map=17/{g['lat']}/{g['lon']}",
            "lat": g["lat"], "lon": g["lon"],
        })
    return res


# ---------------------------------------------------------------- Gemeenteblad
KW_QUERY = ("evenement evenementen evenementenvergunning evenementenaanvraag kermis braderie rommelmarkt jaarmarkt "
            "kerstmarkt festival optocht carnaval intocht sinterklaas koningsdag verkeersbesluit afsluiting afsluiten "
            "wegafsluiting omleiding")
RUBRIEKEN = ("evenementenvergunning", "evenementmelding")  # veel titels noemen alleen de naam van het evenement
RE_MARKT = r"(?:rommel|jaar|vlooien|kerst|snuffel|oranje|wereld|boeren|streek|food|vintage|kunst)markt"
RE_EVENT = re.compile(r"evenement|kermis|braderie|festival|optocht|carnaval|intocht|sinterklaas|koningsdag|"
                      rf"\b{RE_MARKT}|wielerronde|concert", re.I)
RE_WEG = re.compile(r"afsluit|omleiding|verkeersmaatregel|tijdelijk", re.I)
RE_SKIP = re.compile(r"gehandicaptenparkeerplaats|invalideparkeerplaats|laadpaal|laadpunt|oplaadpunt|laadplaats|deelauto|"
                     r"parkeerplaats(?!.*tijdelijk)|kapvergunning|\bkappen\b|uitrit|bestemmingsplan|"
                     r"exploitatievergunning|drank- en horeca|terrasvergunning|horecabedrijf|collecte|"
                     r"marktgeld|marktverordening|marktreglement|standplaats(?!.*(kermis|evenement))|"
                     r"alcoholwet|\bart(?:ikel)?\.?\s*35\b|verlenging termijn|"
                     # geen doorgang of (nog) niet van kracht
                     r"ingetrokken|intrekking|geweigerd|weigering|afgewezen|buiten behandeling|^ontwerp\b", re.I)
RE_PREFIX = re.compile(r"^(?:besluit op (?:een )?aanvraag:\s*|ingekomen evenementenaanvraag:\s*|ingekomen aanvraag:\s*|"
                       r"aanvraag vergunning voor (?:het evenement |de |het )?|toestemming voor (?:het evenement |de |het |een )?|"
                       r"acceptatie evenement\s*|ontvangen melding(?: evenement)?\s*|ingediende aanvraag evenement\s*|"
                       r"besluit evenement\s*|verleende evenementenvergunning\s*|aanvraag evenementenvergunning\s*|"
                       r"evenementenvergunning\s+)", re.I)
RE_GENERIEK = re.compile(r"aanvraag voor een evenementenvergunning", re.I)
RE_DICHT = re.compile(r"afgesloten|geslotenverklaring|wegafsluiting|wegafzetting", re.I)
# zinnen met dit soort woorden gaan over de procedure, niet over de datum van het evenement
RE_PROCEDURE = re.compile(r"besloten|besluit|verzonden|verzend|bezwaar|ingediend|ontvangen|publicatie|gepubliceerd|"
                          r"inzage|termijn|dagtekening|ondertekend|doet u voor|zaaknummer|hoogachtend", re.I)
RE_WANNEER = re.compile(r"periode|\bvindt\b.{0,80}\bplaats\b|plaatsvindt|plaatsvinden|gehouden|afgesloten", re.I)


def sru_query(gemeente: str, since: str, clause: str) -> str:
    return (f'c.product-area="officielepublicaties" AND w.organisatietype="gemeente" '
            f'AND dt.creator="{gemeente}" AND dt.available>={since} AND {clause} '
            f'sortBy dt.available/sort.descending')


def geo_mid(s: str | None):
    """Middelpunt uit 'lat lon', 'lat,lon' of WKT (lon lat)."""
    nums = [float(x) for x in re.findall(r"-?\d+\.\d+", s or "")]
    if len(nums) < 2:
        return None
    a, b = nums[::2], nums[1::2]
    n = min(len(a), len(b))
    x, y = sum(a[:n]) / n, sum(b[:n]) / n
    la, lo = (x, y) if x > y else (y, x)  # NL: lat > lon
    return (round(la, 5), round(lo, 5)) if 50 < la < 54 and 3 < lo < 8 else None


def sru_fetch(query: str, maxrec=200, start=1):
    url = SRU_URL + "?" + urllib.parse.urlencode({
        "operation": "searchRetrieve", "version": "2.0", "recordSchema": "gzd",
        "maximumRecords": maxrec, "startRecord": start, "query": query})
    raw = http_get(url, timeout=60)
    root = ET.fromstring(raw)
    total = None
    diag = []
    for e in root.iter():
        t = ln(e.tag)
        if t == "numberOfRecords" and e.text:
            total = int(e.text)
        elif t == "message" and e.text:
            diag.append(e.text.strip())
    recs = []
    for g in root.iter():
        if ln(g.tag) != "gzd":
            continue
        r = {"itemUrl": {}}
        for e in g.iter():
            t = ln(e.tag)
            txt = (e.text or "").strip()
            if t in ("identifier", "title", "creator", "available", "date", "modified", "locatiepunt", "locatiegebied") and txt and t not in r:
                r[t] = txt
            elif t == "type" and txt and "type" not in r:
                r["type"] = txt
            elif t in ("preferredUrl", "prefferedUrl") and txt:
                r["preferredUrl"] = txt
            elif t == "itemUrl" and txt:
                r["itemUrl"][e.get("manifestation", "")] = txt
        recs.append(r)
    return total, diag, recs


def sru_alles(query: str, maxrec=200, paginas=3):
    total, diag, recs = sru_fetch(query, maxrec)
    p = 1
    while total and len(recs) < total and p < paginas:
        _, _, meer = sru_fetch(query, maxrec, len(recs) + 1)
        if not meer:
            break
        recs += meer
        p += 1
    return total, diag, recs


def parse_nl_dates(text: str, ref: dt.date):
    """Alle Nederlandse datums → lijst date. Ondersteunt '7 t/m 9 november 2026', '7 en 8 nov', '17, 18 en 19 december', '07-11-2026'."""
    out = []
    t = text.lower()
    for m in re.finditer(rf"(?<![\d-])((?:\d{{1,2}}\s*,\s*)*)(\d{{1,2}})(?:\s*(?:t/m|tot en met|tot|-|–|en|&)\s*(\d{{1,2}}))?\s+({MAAND_RE})\b\.?(?:\s+(\d{{4}}))?", t):
        mon, yr = MAANDEN[m[4]], m[5]
        y = int(yr) if yr else (ref.year if mon >= ref.month - 2 else ref.year + 1)
        for d in [int(x) for x in re.findall(r"\d+", m[1])] + [int(m[2])] + ([int(m[3])] if m[3] else []):
            try:
                out.append(dt.date(y, mon, d))
            except ValueError:
                pass
    for m in re.finditer(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b", t):
        try:
            out.append(dt.date(int(m[3]), int(m[2]), int(m[1])))
        except ValueError:
            pass
    return out


def strip_html(b: bytes) -> str:
    s = b.decode("utf-8", "replace")
    s = re.sub(r"(?is)<(script|style|head).*?</\1>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", html.unescape(s))
    i = s.find("Gepubliceerd op")  # navigatie van overheid.nl overslaan
    return s[i:] if i >= 0 else s


def lees_publicatie(txt: str, ref: dt.date, pub: dt.date) -> dict:
    """Haalt evenementdatum, omschrijving en afsluitingen uit de tekst van een publicatie."""
    velden = r"(?:datum evenement|locatie|zaaknummer|dossiernummer|soort aanvraag|inzagetermijn|besluit\b|$)"
    om = re.search(rf"omschrijving\s*:\s*(.{{3,200}}?)\s*{velden}", txt, re.I)
    om = om[1].strip(" .,") if om else ""
    wanneer = re.search(r"datum evenement\s*:?\s*(.{4,70})", txt, re.I)
    romp = re.split(r"\b(?:Bezwaar|Bezwaarmogelijkheid|Hoogachtend|Inzagetermijn|Rechtsmiddelen)\b", txt, maxsplit=1)[0]
    romp = re.sub(r"\b[A-Z][\w-]+,\s*\d{1,2}\s+[a-z]+\s+20\d\d", " ", romp)  # ondertekening 'Eindhoven, 28 oktober 2026'
    zinnen = [z for z in re.split(r"(?<=[.!?])\s+", romp) if not RE_PROCEDURE.search(z)]
    kandidaten = [wanneer[1] if wanneer else "", om,
                  " . ".join(z for z in zinnen if RE_WANNEER.search(z)), " . ".join(zinnen)]
    dates = []
    for k in kandidaten:
        dates = sorted({d for d in parse_nl_dates(k, ref) if d >= pub - dt.timedelta(days=3)})
        if dates:
            break
    return {"dates": [d.isoformat() for d in dates[:12]], "om": om[:160], "dicht": bool(RE_DICHT.search(romp)),
            "c": "c-evenement" in txt.lower(),
            "af": bool(re.search(r"besluit\s*:\s*(?:geweigerd|niet verleend|ingetrokken|afgewezen)", txt, re.I))}


def classify_gmb(title: str, rubriek: str):
    tl, rub = title.lower(), rubriek.lower()
    if "kermis" in tl:
        cat, hinder = "kermis", "hoog"
    elif re.search(RE_MARKT + "|braderie", tl):
        cat, hinder = "markt", "middel"
    elif RE_EVENT.search(tl) or "evenement" in rub:
        druk = re.search(r"optocht|intocht|carnaval|wieler|marathon|\brun\b|loop\b|festival|koningsdag|glow", tl)
        cat = "evenement"
        hinder = "middel" if (druk or RE_WEG.search(tl) or "verkeer" in rub) else "laag"
    else:
        cat, hinder = "weg", "middel"
    # 'besluit op aanvraag' is een besluit: eerst daarop testen
    if re.search(r"verleend|toestemming|acceptatie|besluit|definitief", tl) or "verkeersbesluit" in rub:
        status = "besluit"
    elif "melding" in tl or "melding" in rub:
        status = "melding"
    elif re.search(r"aanvraag|ontvangen|ingekomen|ingediend", tl):
        status = "aanvraag"
    else:
        status = ""
    return cat, hinder, status


def relevant(title: str, rub: str) -> bool:
    if RE_SKIP.search(title) or "omgevingsvergunning" in rub.lower():
        return False
    samen = (title + " " + rub).lower()
    if "evenement" in rub.lower() or RE_EVENT.search(title):
        return True
    return bool(RE_WEG.search(title)) and ("verkeer" in samen or "afsluit" in samen)


def sleutel(titel: str):
    t = re.sub(r"\b\d{4}\s?[a-z]{2}\b", " ", titel.lower())
    w = set(re.findall(r"[a-z]{3,}", t)) - {"van", "voor", "het", "een", "aan", "evenement", "evenementenvergunning", "eindhoven",
                                            "helmond", "veldhoven", "best", "geldrop", "nuenen", "november", "december", "oktober"}
    return w


def ontdubbel(items):
    """Aanvraag en besluit van hetzelfde evenement worden één regel; het verste stadium blijft staan."""
    orde = {"Vergund/besluit": 0, "Melding": 1, "Publicatie": 2, "Aanvraag": 3}
    res = []
    for it in sorted(items, key=lambda x: orde.get(x["label"], 9)):
        a = sleutel(it["titel"])
        dubbel = False
        for b in res:
            if b["plaats"] != it["plaats"] or b["cat"] != it["cat"]:
                continue
            zelfde_dag = it["start"] == b["start"] or not it["start"] or not b["start"]
            k = sleutel(b["titel"])
            overlap = len(a & k) / max(1, len(a | k))
            zelfde_plek = it.get("lat") and it.get("lat") == b.get("lat") and it["start"] == b["start"] and it["start"]
            if zelfde_dag and (overlap >= 0.6 or (zelfde_plek and overlap >= 0.2)):
                dubbel = True
                break
        if not dubbel:
            res.append(it)
    return res


def fetch_gmb(gemeenten, today: dt.date, horizon_end: dt.date, cache: Cache, status: dict, max_text=250, nu=None, ttl_uur=6):
    """max_text is per run over alle gemeenten: de rest volgt in de volgende runs (cache)."""
    since = (today - dt.timedelta(days=120)).isoformat()
    nu = nu or time.time()
    items = []
    fetched = 0
    for p in gemeenten:
        g = p["naam"]
        st = status.setdefault(g, {"ok": False, "gevonden": 0, "relevant": 0})
        rub_clause = " OR ".join(f'dt.type="{r}"' for r in RUBRIEKEN)
        bewaard = cache.d["sru"].get(g)
        try:
            # Gemeenteblad verschijnt hooguit dagelijks: niet elke 30 min 138 gemeenten bevragen
            if bewaard and nu - bewaard["t"] < ttl_uur * 3600:
                raise LookupError
            total, diag, recs = sru_alles(sru_query(g, since, f'(dt.title any "{KW_QUERY}" OR {rub_clause})'))
            if total is None:  # 'any' niet geaccepteerd → per trefwoord
                log(f"  {g}: 'any' afgewezen ({'; '.join(diag)[:120]}) → per trefwoord")
                recs, seen = [], set()
                clauses = [f'dt.type="{r}"' for r in RUBRIEKEN] + [
                    f'dt.title="{kw}"' for kw in ("evenement", "kermis", "verkeersbesluit", "afsluiting", "braderie")]
                for cl in clauses:
                    _t, _d, r2 = sru_fetch(sru_query(g, since, cl), maxrec=100)
                    for r in r2:
                        if r.get("identifier") not in seen:
                            seen.add(r.get("identifier"))
                            recs.append(r)
                    time.sleep(0.3)
                total = len(recs)
            elif diag:
                log(f"  {g}: diagnostic {diag[:2]}")
            cache.d["sru"][g] = {"t": nu, "n": total, "recs": [
                {k: (v if k != "itemUrl" else {"html": v.get("html")}) for k, v in r.items()
                 if k not in ("modified", "date")} for r in recs]}
            time.sleep(0.5)
        except LookupError:
            total, recs = bewaard["n"], bewaard["recs"]
        except Exception as e:
            log(f"  {g}: FOUT {str(e)[:160]}")
            if not bewaard:
                st["fout"] = str(e)[:200]
                continue
            st["oud"] = True  # laatste goede antwoord gebruiken
            total, recs = bewaard["n"], bewaard["recs"]
        st["ok"] = True
        st["gevonden"] = total
        eigen = []
        for r in recs:
            title = re.sub(r"\s+", " ", r.get("title", "")).strip()
            ident = r.get("identifier", "")
            if not title or not ident:
                continue
            if r.get("creator", "").strip().lower() != g.lower():  # dt.creator is 'bevat'-zoeken
                continue
            rub = r.get("type", "")
            if not relevant(title, rub):
                continue
            pub = r.get("available", "")[:10]
            pub_d = dt.date.fromisoformat(pub) if pub else today
            # 'i.p.v. 3 oktober' en 'd.d. 8 juni' zijn geen evenementdata
            kern = re.sub(r"\bd\.d\.\s+\S+\s+\S+(?:\s+20\d\d)?", " ", re.split(r"\bi\.?p\.?v\.?\b", title, flags=re.I)[0])
            tdates = parse_nl_dates(kern, today)
            vb = "verkeer" in (title + rub).lower()
            info = cache.d["gmb"].get(ident)
            if info is None and (vb or not tdates) and fetched < max_text:
                url = r["itemUrl"].get("html") or r.get("preferredUrl")
                fetched += 1
                try:
                    info = lees_publicatie(strip_html(http_get(url, timeout=30, tries=2)), today, pub_d)
                except Exception as e:
                    log(f"    tekst {ident}: {e}")
                time.sleep(0.3)
            if info is not None:
                cache.d["gmb"][ident] = {**info, "seen": today.isoformat()}
            info = info or {}
            if info.get("af"):
                continue
            dates = sorted(tdates) or [dt.date.fromisoformat(x) for x in info.get("dates", [])]
            if dates:
                start, end = min(dates), max(dates)
                if (end - start).days > 120:  # waarschijnlijk meerdere losse data; neem eerste in horizon
                    inh = [d for d in dates if today <= d <= horizon_end]
                    start = end = inh[0] if inh else start
                if start > horizon_end or end < today:
                    continue
            else:
                if not pub or (today - pub_d).days > 21:
                    continue
                start = end = None
            cat, hinder, stat = classify_gmb(title + " " + info.get("om", ""), rub)
            label = {"aanvraag": "Aanvraag", "besluit": "Vergund/besluit", "melding": "Melding"}.get(stat, "Publicatie")
            if vb and info.get("dicht"):
                cat, hinder = "weg", "hoog"
            elif info.get("c"):
                hinder = "hoog"
            elif "melding" in rub.lower() and hinder == "middel" and not RE_WEG.search(title):
                hinder = "laag"
            titel = info["om"] if RE_GENERIEK.search(title) and info.get("om") else RE_PREFIX.sub("", title)
            titel = (titel[:1].upper() + titel[1:])[:200]
            mid = geo_mid(r.get("locatiepunt") or r.get("locatiegebied"))
            eigen.append({
                "id": ident, "plaats": p["naam"], "cat": cat, "label": label,
                "titel": titel, "locatie": "",
                "start": start.isoformat() if start else None,
                "eind": end.isoformat() if end and end != start else None,
                "tijd": None, "hinder": hinder, "snelweg": False, "fiets": False,
                "toelichting": (f"Gepubliceerd {pub}" if pub else "") + ("" if start else " · datum: zie publicatie"),
                "bron": f"Gemeenteblad {g}", "bron_type": "Gemeenteblad",
                "url": r.get("preferredUrl") or f"https://zoek.officielebekendmakingen.nl/{ident}.html",
                **({"lat": mid[0], "lon": mid[1]} if mid else {}),
            })
        eigen = ontdubbel(eigen)
        st["relevant"] = len(eigen)
        items += eigen
    log(f"  {sum(s['ok'] for s in status.values())}/{len(gemeenten)} gemeenten, {len(items)} relevant, {fetched} teksten gelezen")
    return items


# ---------------------------------------------------------------- markten
def build_markets(cfg, today: dt.date, horizon_end: dt.date):
    items = []
    d = today
    while d <= horizon_end:
        for m in cfg.get("markten", []):
            if d.weekday() == m["dag"]:
                items.append({
                    "id": f"markt-{m['plaats']}-{m['locatie']}-{d.isoformat()}", "plaats": m["plaats"], "cat": "markt",
                    "label": "Weekmarkt", "titel": f"Weekmarkt {m['locatie']}", "locatie": m["locatie"],
                    "start": f"{d.isoformat()}T{m['van']}", "eind": f"{d.isoformat()}T{m['tot']}",
                    "tijd": f"{m['van']}–{m['tot']}", "hinder": "middel" if "entrum" in m["locatie"] else "laag",
                    "snelweg": False, "toelichting": "", "dag": DAGEN[m["dag"]],
                    "bron": m.get("bron", "config"), "bron_type": "Marktrooster", "url": "",
                })
        d += dt.timedelta(days=1)
    return items


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "config.json"))
    ap.add_argument("--gemeenten", default=str(ROOT / "gemeenten.json"))
    ap.add_argument("--uit", default=str(ROOT / "site" / "data.json"))
    ap.add_argument("--cache", default=str(ROOT / ".cache" / "cache.json"))
    ap.add_argument("--ndw", help="lokaal NDW-bestand (.xml of .xml.gz) i.p.v. downloaden")
    ap.add_argument("--nu", help="ISO-tijd om 'nu' te simuleren (testen)")
    ap.add_argument("--geen-gemeenteblad", action="store_true")
    ap.add_argument("--geen-geocoding", action="store_true")
    a = ap.parse_args()

    cfg = json.loads(Path(a.config).read_text("utf-8"))
    plaatsen = json.loads(Path(a.gemeenten).read_text("utf-8"))["gemeenten"]
    horizon = int(cfg.get("horizon_dagen", 30))
    now = dt.datetime.fromisoformat(a.nu).astimezone(dt.timezone.utc) if a.nu else dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(TZ).date()
    horizon_end_dt = now + dt.timedelta(days=horizon)
    horizon_end = today + dt.timedelta(days=horizon)
    cache = Cache(Path(a.cache))
    status = {"ndw": {"ok": False}, "gemeenteblad": {}, "markten": {"ok": True}}
    items = []

    # 1. NDW
    log("NDW-feed…")
    try:
        t0 = time.time()
        raw = Path(a.ndw).read_bytes() if a.ndw else http_get(NDW_URL, timeout=180)
        # uitgepakt ±200 MB: streamen i.p.v. in één keer decomprimeren
        stream = gzip.GzipFile(fileobj=io.BytesIO(raw)) if raw[:2] == b"\x1f\x8b" else io.BytesIO(raw)
        stats = {"situaties": 0, "zonder_locatie": 0, "in_gebied": 0, "actief": 0}
        ndw = parse_ndw(stream, plaatsen, now, horizon_end_dt, stats)
        del raw
        if not a.geen_geocoding:
            reverse_geocode(ndw, cache)
        ndw_items = finish_ndw(ndw)
        items += ndw_items
        status["ndw"] = {"ok": True, **stats, "items": len(ndw_items), "sec": round(time.time() - t0, 1)}
        log(f"  {stats} → {len(ndw_items)} meldingen")
    except Exception as e:
        status["ndw"] = {"ok": False, "fout": str(e)[:200]}
        log("  NDW FOUT:", e)

    # 2. Gemeenteblad
    if not a.geen_gemeenteblad:
        log("Gemeenteblad…")
        items += fetch_gmb(plaatsen, today, horizon_end, cache, status["gemeenteblad"])

    # 3. Markten
    items += build_markets(cfg, today, horizon_end)

    order = {"hoog": 0, "middel": 1, "laag": 2, "geen": 3}
    items.sort(key=lambda x: (x["plaats"], order.get(x["hinder"], 9), x["start"] or "0"))
    out = {
        "gegenereerd": now.astimezone(TZ).isoformat(timespec="minutes"),
        "horizon_dagen": horizon,
        "plaatsen": [{k: p[k] for k in ("naam", "provincie", "lat", "lon")} for p in plaatsen],
        "favorieten": cfg.get("favorieten", []),
        "status": status,
        "items": items,
    }
    Path(a.uit).parent.mkdir(parents=True, exist_ok=True)
    Path(a.uit).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    cache.save()
    log(f"Klaar: {len(items)} items → {a.uit}")
    # alleen falen als álle live bronnen faalden
    live_ok = status["ndw"].get("ok") or any(v.get("ok") for v in status["gemeenteblad"].values())
    if not live_ok and not a.geen_gemeenteblad:
        sys.exit(1)


if __name__ == "__main__":
    main()
