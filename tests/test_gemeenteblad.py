"""Test de Gemeenteblad-verwerking met SRU-antwoorden in de vorm van de live API (okt 2026).
Draai: python3 tests/test_gemeenteblad.py
"""
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ophalen as O  # noqa: E402

NS = ('xmlns:overheidwetgeving="http://standaarden.overheid.nl/wetgeving/" xmlns:dcterms="http://purl.org/dc/terms/" '
      'xmlns:sru="http://docs.oasis-open.org/ns/search-ws/sruResponse" xmlns:gzd="http://standaarden.overheid.nl/sru" '
      'xmlns:c="http://standaarden.overheid.nl/collectie/"')


def rec(ident, title, creator, available, rubriek="evenementenvergunning"):
    R = "https://repository.overheid.nl/frbr/officielepublicaties"
    return (f"<sru:record><sru:recordData><gzd:gzd><gzd:originalData><overheidwetgeving:meta><overheidwetgeving:owmskern>"
            f"<dcterms:identifier>{ident}</dcterms:identifier><dcterms:title>{title}</dcterms:title>"
            f'<dcterms:type scheme="OVERHEIDop.Rubriek">{rubriek}</dcterms:type>'
            f'<dcterms:creator scheme="OVERHEID.Gemeente">{creator}</dcterms:creator></overheidwetgeving:owmskern>'
            f"<overheidwetgeving:owmsmantel><dcterms:available>{available}</dcterms:available></overheidwetgeving:owmsmantel>"
            f"</overheidwetgeving:meta></gzd:originalData><gzd:enrichedData>"
            f"<gzd:preferredUrl>https://zoek.officielebekendmakingen.nl/{ident}.html</gzd:preferredUrl>"
            f'<gzd:itemUrl manifestation="html">{R}/gmb/2026/{ident}/1/html/{ident}.html</gzd:itemUrl>'
            f"</gzd:enrichedData></gzd:gzd></sru:recordData></sru:record>")


RECS = [
    rec("gmb-2026-1", "Verleende evenementenvergunning Lichtjesoptocht op 14 november 2026, Markt", "Eindhoven", "2026-10-20"),
    rec("gmb-2026-2", "Aanvraag evenementenvergunning Kerstmarkt 11 t/m 13 december 2026", "Eindhoven", "2026-10-28"),  # buiten 30d
    rec("gmb-2026-3", "Verkeersbesluit gehandicaptenparkeerplaats Kruisstraat 12", "Eindhoven", "2026-10-25", "verkeersbesluit of -mededeling"),
    rec("gmb-2026-4", "Verkeersbesluit tijdelijke afsluiting Vestdijk i.v.m. intocht Sinterklaas", "Eindhoven", "2026-10-30", "verkeersbesluit of -mededeling"),
    rec("gmb-2026-5", "Omgevingsvergunning verbouwen Markt 3", "Eindhoven", "2026-10-29", "omgevingsvergunning"),
    rec("gmb-2026-6", "Evenementenvergunning Winterkermis 6 en 7 november", "Eindhoven Airport", "2026-10-29"),  # andere creator
    rec("gmb-2026-7", "Melding klein evenement Burendag", "Eindhoven", "2025-12-01"),  # oud, geen datum
]
SRU_OK = f'<?xml version="1.0"?><sru:searchRetrieveResponse {NS}><sru:numberOfRecords>{len(RECS)}</sru:numberOfRecords><sru:records>{"".join(RECS)}</sru:records></sru:searchRetrieveResponse>'
SRU_DIAG = ('<?xml version="1.0"?><searchRetrieveResponse xmlns="http://docs.oasis-open.org/ns/search-ws/sruResponse" '
            'xmlns:ns3="http://docs.oasis-open.org/ns/search-ws/diagnostic"><version>2.0</version><diagnostics><ns3:diagnostic>'
            "<ns3:message>unsupported relation any</ns3:message></ns3:diagnostic></diagnostics></searchRetrieveResponse>")
TEXT_4 = b"<html><body><p>Op zaterdag 15 november 2026 van 12.00 tot 17.00 uur wordt de Vestdijk afgesloten.</p></body></html>"

calls = []


def fake_get(url, timeout=0, tries=0):
    calls.append(url)
    if "repository.overheid.nl/sru" in url:
        if "any" in url and MODE == "diag":
            return SRU_DIAG.encode()
        return SRU_OK.encode()
    if "gmb-2026-4" in url:
        return TEXT_4
    return b"<html>geen datum</html>"


O.http_get = fake_get
O.time.sleep = lambda s: None
today = dt.date(2026, 11, 2)
P = [{"naam": "Eindhoven", "provincie": "Noord-Brabant", "lat": 51.45, "lon": 5.46}]

for MODE in ("ok", "diag"):
    calls.clear()
    st = {}
    cache = O.Cache(Path("/tmp/_t_cache.json"))
    cache.d = {"geo": {}, "gmb": {}, "sru": {}}
    items = O.fetch_gmb(P, today, today + dt.timedelta(days=30), cache, st)
    ids = {i["id"]: i for i in items}
    assert set(ids) == {"gmb-2026-1", "gmb-2026-4"}, (MODE, sorted(ids))
    assert ids["gmb-2026-1"]["start"] == "2026-11-14" and ids["gmb-2026-1"]["cat"] == "evenement"
    assert ids["gmb-2026-4"]["start"] == "2026-11-15", ids["gmb-2026-4"]
    assert ids["gmb-2026-4"]["label"] == "Vergund/besluit"
    q = [c for c in calls if "sru" in c][0]
    assert "sortBy+dt.available%2Fsort.descending" in q and "recordSchema=gzd" in q, q
    print(MODE, "OK:", [(i["id"], i["cat"], i["start"], i["hinder"], i["label"]) for i in items], st)

# datumparser
d = O.parse_nl_dates("Kermis van 6 t/m 10 november en markt op 07-12-2026", today)
assert dt.date(2026, 11, 6) in d and dt.date(2026, 11, 10) in d and dt.date(2026, 12, 7) in d, d
assert O.parse_nl_dates("op 3 januari", today) == [dt.date(2027, 1, 3)]
assert O.parse_nl_dates("op 7 en 8 nov", today) == [dt.date(2026, 11, 7), dt.date(2026, 11, 8)]
assert O.parse_nl_dates("op 17, 18 en 19 december 2026", today)[0] == dt.date(2026, 12, 17)
assert O.parse_nl_dates("in 2026 november", today) == []
print("datums OK")

# echte titels/rubrieken uit het Gemeenteblad (nov 2026): wat hoort er wel en niet in
EV, VB = "evenementenvergunning", "verkeersbesluit of -mededeling"
for titel, rub, verwacht in [
    ("Besluit op aanvraag: GLOW Eindhoven", EV, True),
    ("Ingekomen evenementenaanvraag: New Years EHVE, Stadhuisplein", EV, True),
    ("Verkeersbesluit tot het treffen van tijdelijke verkeersmaatregelen in verband met het evenement \u2018Glow\u2019", VB, True),
    ("Verkeersbesluit \u2013 Diverse tijdelijke verkeersmaatregelen Ringweg-Erica, Best", VB, True),
    ("Ontvangen melding evenement Kerstmarkt Severinus op 22 december 2026 aan de Eegwortel 1 te Veldhoven", "evenementmelding", True),
    ("Ingetrokken aanvraag omgevingsvergunning: plaatsen van een tijdelijke bouwwerken voor evenement Winter in Eindhoven", "omgevingsvergunning", False),
    ("Besluit op aanvraag: Ontheffing art 35 Alcoholwet Pixxl De Nacht Van Strijp-S, Philitelaan", EV, False),
    ("Besluit: terrasvergunning (gevel) horecabedrijf M. Coffee Club, Woenselse Markt 63", "andere vergunning", False),
    ("Verkeersbesluit voor het aanwijzen van een gehandicaptenparkeerplaats op kenteken aan Raafstraat te Helmond", VB, False),
    ("Ontwerp Verkeersbesluit 30-zonebord Eindhovensebaan.", VB, False),
    ("Verkeersbesluit uitbreiding parkeerverbod Furkapas", VB, False),
    ("Besluit op aanvraag omgevingsvergunning: in stand houden van tijdelijk kunstwerk", "omgevingsvergunning", False),
]:
    assert O.relevant(titel, rub) is verwacht, titel
assert O.classify_gmb("Besluit op aanvraag: GLOW Eindhoven", EV)[2] == "besluit"
assert O.classify_gmb("Ingekomen evenementenaanvraag: Oktoberfest 2026", EV)[2] == "aanvraag"
assert O.classify_gmb("Ontvangen melding evenement Burendag", "evenementmelding")[2] == "melding"
print("selectie OK")

# echte teksten: datum evenement i.p.v. procedure-data
pub = dt.date(2026, 10, 22)
T = {
    "Besluit op aanvraag: DARK Zaaknummer: EHV-ZP2026-009217 Omschrijving: DARK: Halloween Festival Eindhoven Datum evenement: 31-10-2026 "
    "Locatie: - Pastoor Petersstraat 180 Soort aanvraag: A-evenement Besluit: verleend Besluitdatum: 20-10-2026 Heeft u direct belang?": ["2026-10-31"],
    "Hit The City Omschrijving: Evenementenvergunning aanvragen Hit The City Datum evenement: 28 en 29 november 2026 Locatie: Ketelhuisplein": ["2026-11-28", "2026-11-29"],
    "De burgemeester van Best heeft op 20 oktober 2026 besloten een evenementenvergunning te verlenen. Het besluit gaat over: Omschrijving: "
    "Glow Best van 7 t/m 14 november 2026 Locatie: Centrum in Best Dossiernummer: Z2026-00001353 Dat doet u voor 2 december 2026": ["2026-11-07", "2026-11-14"],
    "Van 7 november 2026 tot en met 14 november 2026 vindt het evenement Glow plaats. De weggedeelten moeten worden afgesloten. "
    "Eindhoven,28 oktober 2026 Bezwaarmogelijkheid binnen zes weken met ingang van 31 oktober 2026.": ["2026-11-07", "2026-11-14"],
}
for tekst, verwacht in T.items():
    assert O.lees_publicatie(tekst, today, pub)["dates"] == verwacht, tekst
i = O.lees_publicatie("Omschrijving: Glow Best van 7 t/m 14 november 2026 Locatie: Centrum in Best", today, pub)
assert i["om"] == "Glow Best van 7 t/m 14 november 2026", i
assert O.lees_publicatie("Datum evenement: 1-12-2026 Besluit: geweigerd", today, pub)["af"]
print("teksten OK")

# coordinaten
assert O.geo_mid("51.4380705771451 5.47129546783217") == (51.43807, 5.47130)
assert O.geo_mid("POLYGON((5.40 51.40,5.50 51.50))") == (51.45, 5.45)
assert O.geo_mid("LINESTRING(5.6556679 51.48,5.6556679 51.48") == (51.48, 5.65567)
assert O.geo_mid("") is None

# aanvraag + besluit van hetzelfde evenement = 1 regel; besluit blijft
basis = {"plaats": "Helmond", "cat": "evenement", "start": "2026-11-21", "lat": 51.48, "lon": 5.69}
u = O.ontdubbel([{**basis, "titel": "Intocht sinterklaas op 21 november 2026 aan Brouwhorst te Helmond", "label": "Aanvraag"},
                 {**basis, "titel": "Intocht Sinterklaas Brouwhuis op 21 november 2026 aan Brouwhorst te Helmond", "label": "Vergund/besluit"},
                 {**basis, "titel": "Kerstconcert Fanfare", "label": "Aanvraag", "lat": 51.1}])
assert len(u) == 2 and u[0]["label"] == "Vergund/besluit", u
print("ontdubbelen OK")

# einddatum in het verleden in de titel: niet tonen, ook niet als 'datum onbekend'; rubriek zonder trefwoord: wel tonen
RECS[:] = [rec("gmb-2026-8", "Aanvraag vergunning voor het evenement Griezelberg op 30 oktober 2026 aan Gooisehof", "Eindhoven", "2026-10-29"),
           rec("gmb-2026-9", "Besluit op aanvraag: Brainport FANzone, Philips Stadion", "Eindhoven", "2026-10-29")]
SRU_OK = f'<?xml version="1.0"?><sru:searchRetrieveResponse {NS}><sru:numberOfRecords>2</sru:numberOfRecords><sru:records>{"".join(RECS)}</sru:records></sru:searchRetrieveResponse>'
TEXT_9 = b"<html><body><p>Gepubliceerd op 2026-10-29</p><p>Omschrijving: Brainport FANzone Datum evenement: 8 november 2026 Locatie: Philips Stadion</p></body></html>"
_oud = O.http_get
O.http_get = lambda url, timeout=0, tries=0: TEXT_9 if "gmb-2026-9" in url else SRU_OK.encode()
st, cache.d = {}, {"geo": {}, "gmb": {}, "sru": {}}
items = O.fetch_gmb(P, today, today + dt.timedelta(days=30), cache, st)
assert [i["id"] for i in items] == ["gmb-2026-9"] and items[0]["start"] == "2026-11-08", items
assert items[0]["titel"] == "Brainport FANzone, Philips Stadion", items
print("verleden/rubriek OK")

# aanvragen tellen mee, met label Aanvraag; hetzelfde evenement met besluit wordt één regel
RECS[:] = [rec("gmb-2026-10", "Aanvraag vergunning voor de Intocht op 14 november 2026 aan Markt", "Eindhoven", "2026-10-29"),
           rec("gmb-2026-13", "Toestemming voor de Intocht op 14 november 2026 aan Markt", "Eindhoven", "2026-10-29"),
           rec("gmb-2026-15", "Ingekomen evenementenaanvraag: Kerstmarkt op 20 november 2026", "Eindhoven", "2026-10-29")]
_sru = f'<?xml version="1.0"?><sru:searchRetrieveResponse {NS}><sru:numberOfRecords>3</sru:numberOfRecords><sru:records>{"".join(RECS)}</sru:records></sru:searchRetrieveResponse>'
_vorige = O.http_get
O.http_get = lambda url, timeout=0, tries=0: _sru.encode()
st, _c = {}, cache.d
cache.d = {"geo": {}, "gmb": {}, "sru": {}}
items = O.fetch_gmb(P, today, today + dt.timedelta(days=30), cache, st)
assert sorted((i["id"], i["label"]) for i in items) == [("gmb-2026-13", "Vergund/besluit"), ("gmb-2026-15", "Aanvraag")], items
print("aanvragen OK")
O.http_get, cache.d = _vorige, _c

# cache: binnen 6 uur geen nieuwe SRU-vraag; bij fout het laatste goede antwoord
n = len(calls)
sru_calls = []
O.http_get = lambda url, timeout=0, tries=0: (sru_calls.append(url), TEXT_9 if "gmb-2026-9" in url else SRU_OK.encode())[1]
st = {}
O.fetch_gmb(P, today, today + dt.timedelta(days=30), cache, st, nu=cache.d["sru"]["Eindhoven"]["t"] + 3600)
assert not [u for u in sru_calls if "/sru?" in u] and st["Eindhoven"]["relevant"] == 1, (sru_calls, st)
def kapot(url, timeout=0, tries=0):
    raise RuntimeError("stuk")
O.http_get = kapot
st = {}
O.fetch_gmb(P, today, today + dt.timedelta(days=30), cache, st, nu=cache.d["sru"]["Eindhoven"]["t"] + 99999)
assert st["Eindhoven"]["ok"] and st["Eindhoven"].get("oud") and st["Eindhoven"]["relevant"] == 1, st
print("sru-cache OK")
