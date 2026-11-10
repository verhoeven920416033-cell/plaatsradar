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
