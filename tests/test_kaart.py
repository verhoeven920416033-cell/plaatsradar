"""Kaart: vereenvoudigen en compact opslaan (geen netwerk)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ophalen as o

r = [[5.0, 51.0], [5.05, 51.0001], [5.1, 51.0], [5.1, 51.1], [5.0, 51.1], [5.0, 51.0]]
v = o.vereenvoudig(r, 0.001)
assert [5.05, 51.0001] not in v and v[0] == r[0] and v[-1] == r[-1] and len(v) == 5, v
assert o.vereenvoudig(r, 0.00001) == r
assert o.plat([[5.47891, 51.43712]]) == [54789, 514371]
assert o.in_vlak(5.05, 51.05, [r]) and not o.in_vlak(5.2, 51.05, [r])
print("kaart OK")

# nieuw sinds: eerste run markeert niets, daarna alleen nieuwe ids
import datetime as dt, json, tempfile
c = o.Cache(Path(tempfile.mkdtemp()) / "c.json")
t1 = dt.datetime(2026, 11, 10, 8, tzinfo=dt.timezone.utc)
a = [{"id": "x1", "cat": "weg"}, {"id": "m", "cat": "markt"}]
o.markeer_nieuw(a, c, t1)
assert "sinds" not in a[0] and "sinds" not in a[1]
b = [{"id": "x1", "cat": "weg"}, {"id": "x2", "cat": "weg"}]
o.markeer_nieuw(b, c, t1 + dt.timedelta(hours=6))
assert "sinds" not in b[0] and b[1]["sinds"].startswith("2026-11-10T15:00"), b

# pc6: per pc4 ophalen, compact wegschrijven
c.d["kaart"]["pc4lijst"] = ["5611"]
antw = {"response": {"docs": [{"postcode": "5611AB", "centroide_ll": "POINT(5.4710 51.4320)"}, {"postcode": "5611AC", "centroide_ll": "POINT(5.4700 51.4300)"}]}}
o.http_get = lambda url, timeout=30: json.dumps(antw).encode()
uit = Path(tempfile.mkdtemp()) / "pc6.json"
st = o.pc6_punten(uit, c, 1e9)
d = json.loads(uit.read_text())
assert st["compleet"] == 1 and d["5611"] == [54700, 514300, "AB", 10, 20, "AC", 0, 0], d
print("nieuw + pc6 OK")
