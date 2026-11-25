"""Build per-year display data from the map manifest's GeoJSON (requires Shapely 2.1)."""
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

from shapely import make_valid, union_all
from shapely.geometry import mapping, shape


def polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        for item in geometry.geoms:
            yield from polygon_parts(item)


def display_group(name, records):
    polygons = []
    for record in records:
        geometry = shape(record["geometry"])
        polygons.extend(polygon_parts(geometry if geometry.is_valid else make_valid(geometry)))
    ids = sorted(record["properties"]["OBJECTID"] for record in records)
    group = {"name": name, "ids": ids}
    if len(records) > 1:
        group["area"] = round(sum(record["properties"]["AreaSqKM"] for record in records), 2)
        articles = {record["properties"].get("Wikipedia") for record in records}
        group["wikipedia"] = articles.pop() if len(articles) == 1 else None
        merged = union_all(polygons)
        # Disconnected pieces can keep their existing tiles. Replace the drawn
        # polygons only where a shared or overlapping boundary disappears.
        if merged.length < sum(p.length for p in polygons) - 1e-8:
            group["geometry"] = mapping(merged)
            largest_record = max(records, key=lambda r: r["properties"]["AreaSqKM"])
            group["color"] = largest_record["properties"].get("Color")
            polygons = list(polygon_parts(merged))
    # Correct degree-area weighting for latitude when choosing the label's landmass.
    largest = max(polygons, key=lambda p: p.area * math.cos(math.radians(p.centroid.y)))
    anchor = largest.representative_point()
    group["anchor"] = [anchor.x, anchor.y]
    return group


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geojson", type=Path)
    args = parser.parse_args()
    data = Path(__file__).resolve().parents[1] / "data"
    manifest = json.loads((data / "manifest.json").read_bytes())
    raw = args.geojson.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest["sourceSHA256"]:
        parser.error("GeoJSON SHA-256 does not match the PMTiles build manifest.")
    years = defaultdict(lambda: defaultdict(list))
    for record in json.loads(raw)["features"]:
        p = record["properties"]
        if p.get("Type") == "POLITY" and (p.get("Name") or "").strip():
            years[p["Year"]][p["Name"]].append(record)
    output = data / "polity-display"
    output.mkdir(exist_ok=True)
    for year in manifest["yearValues"]:
        groups = [display_group(name, rows) for name, rows in sorted(years[year].items())]
        payload = {"year": year, "sourceSHA256": digest, "groups": groups}
        (output / f"{year}.json").write_bytes(
            (json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()
        )


if __name__ == "__main__":
    main()
