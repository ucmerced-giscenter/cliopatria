"""Generate one interior label point per named polity and snapshot from the release GeoJSON."""
import argparse
import hashlib
import json
from collections import defaultdict
from contextlib import ExitStack
from pathlib import Path
from zipfile import ZipFile, is_zipfile

import ijson
from pyproj import Geod
from shapely.geometry import shape


WGS84 = Geod(ellps="WGS84")


def label_point(geometry):
    polygon = shape(geometry)
    if polygon.geom_type == "MultiPolygon":
        # AreaSqKM covers the entire record. Within it, choose the largest part.
        polygon = max(polygon.geoms, key=lambda part: abs(WGS84.geometry_area_perimeter(part)[0]))
    point = polygon.representative_point()
    return [point.x, point.y]


def largest_polity_labels(features):
    winners = defaultdict(dict)
    for feature in features:
        p = feature["properties"]
        name = p.get("Name")
        if p.get("Type") != "POLITY" or not (name or "").strip():
            continue
        panel = winners[p["Year"]]
        # Equal published areas are settled by the lower OBJECTID in the release file.
        rank = (p["AreaSqKM"], -p["OBJECTID"])
        if name not in panel or rank > panel[name][0]:
            panel[name] = (rank, label_point(feature["geometry"]))
    return winners


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Release ZIP or its extracted GeoJSON")
    args = parser.parse_args()
    data = Path(__file__).resolve().parents[1] / "data"
    manifest = json.loads((data / "manifest.json").read_bytes())
    with ExitStack() as files:
        if is_zipfile(args.source):
            archive = files.enter_context(ZipFile(args.source))
            members = [name for name in archive.namelist() if name.lower().endswith(".geojson")]
            if len(members) != 1:
                parser.error("Expected one GeoJSON file in the release ZIP.")
            source = files.enter_context(archive.open(members[0]))
        else:
            source = files.enter_context(args.source.open("rb"))
        digest = hashlib.file_digest(source, "sha256").hexdigest()
        if digest != manifest["sourceSHA256"]:
            parser.error("GeoJSON SHA-256 does not match the map manifest.")
        source.seek(0)
        winners = largest_polity_labels(ijson.items(source, "features.item", use_float=True))

    output = data / "polity-display"
    output.mkdir(exist_ok=True)
    for year in manifest["yearValues"]:
        points = [
            {"type": "Feature", "properties": {"Name": name},
             "geometry": {"type": "Point", "coordinates": coords}}
            for name, (_, coords) in sorted(winners[year].items())
        ]
        panel = {"type": "FeatureCollection", "year": year, "sourceSHA256": digest, "features": points}
        (output / f"{year}.json").write_bytes(
            (json.dumps(panel, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()
        )


if __name__ == "__main__":
    main()
