"""Test de NDW-verwerking op een (ingekorte) uitsnede van de echte feed van 2 nov 2026.
Draai: python3 tests/test_ndw.py
"""
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ophalen as O  # noqa: E402

FEED = Path(__file__).with_name("ndw_voorbeeld.feed")
P = [{"naam": "Eindhoven", "lat": 51.4416, "lon": 5.4697, "straal_km": 6.0},
     {"naam": "Helmond", "lat": 51.4793, "lon": 5.657, "straal_km": 6.0},
     {"naam": "Best", "lat": 51.5075, "lon": 5.39, "straal_km": 3.0}]
now = dt.datetime(2026, 11, 2, 12, tzinfo=dt.timezone.utc)
stats = {"situaties": 0, "zonder_locatie": 0, "in_gebied": 0, "actief": 0}
ruw = O.parse_ndw(open(FEED, "rb"), P, now, now + dt.timedelta(days=45), stats)
items = {i["id"]: i for i in O.finish_ndw(ruw)}
assert stats["situaties"] == 3 and len(items) == 3, (stats, list(items))

a = items["NDW03_629500"]
assert a["titel"].startswith("Wilgenroosstraat Eindhoven") and "(629500)" not in a["titel"], a
assert a["label"] == "Weg dicht" and a["hinder"] == "middel", a  # woonstraat, klasse 1
assert a["bron"] == "Gemeente Eindhoven" and "Weg dicht in beide richtingen" in a["toelichting"], a
assert "Voorbeeld" not in str(a), "contactpersoon mag niet in de data"

b = items["AND01_90A02E4FA2D3452E8E78404A8AD8DD8F"]
assert b["plaats"] == "Helmond" and b["fiets"] and b["hinder"] == "laag" and b["label"] == "Fiets-/voetpad dicht", b
assert "omgeleid via Twentehof" in b["toelichting"], b

c = items["RWS01_SM1184084_D2"]
assert c["plaats"] == "Best" and c["snelweg"] and c["label"] == "Op-/afrit dicht" and c["hinder"] == "hoog", c
assert c["titel"].startswith("Op de A58 is de toerit Best"), c
assert c["bron"] == "RWS Zuid-Nederland", c
assert c["start"] == "2026-11-11T20:00" and c["eind"] == "2026-11-12T05:00", c
print("NDW OK:", [(i["plaats"], i["label"], i["hinder"]) for i in items.values()])

# vensters: nachtwerk telt alleen in de nacht
r = O.merge_periods([(now, now + dt.timedelta(hours=2)), (now + dt.timedelta(hours=1), now + dt.timedelta(hours=3)),
                     (now + dt.timedelta(days=1), now + dt.timedelta(days=2))])
assert len(r) == 2 and r[0][1] == now + dt.timedelta(hours=3), r
print("vensters OK")
