import unittest

from shapely.geometry import MultiPolygon, Point, Polygon, box, mapping

from scripts.build_polity_display import largest_polity_labels


def record(object_id, year, area, geometry, kind="POLITY"):
    return {
        "properties": {"Name": "Example", "Year": year, "Type": kind,
                       "OBJECTID": object_id, "AreaSqKM": area},
        "geometry": mapping(geometry),
    }


class PolityLabelTests(unittest.TestCase):
    def test_largest_record_per_snapshot_even_when_smaller_pieces_touch(self):
        west, east = box(0, 0, 2, 2), box(2, 0, 4, 2)
        largest = Polygon([(6, 0), (9, 0), (9, 2), (6, 2)],
                          holes=[[(7, 0.5), (8, 0.5), (8, 1.5), (7, 1.5)]])
        rows = [record(1, 207, 40, west), record(2, 207, 40, east),
                record(3, 207, 50, largest), record(4, 207, 99, west, "GROUP"),
                record(5, 211, 40, east), record(6, 211, 20, largest)]
        labels = largest_polity_labels(rows)
        self.assertTrue(largest.contains(Point(labels[207]["Example"][1])))
        self.assertTrue(east.contains(Point(labels[211]["Example"][1])))

    def test_ties_and_multipart_records(self):
        equator = box(0, 0, 2, 2)
        polar = box(0, 80, 4, 84)
        winner = record(6, 674, 100, MultiPolygon([polar, equator]))
        tied = record(9, 674, 100, box(10, 10, 12, 12))
        for rows in ([winner, tied], [tied, winner]):
            labels = largest_polity_labels(rows)
            self.assertTrue(equator.contains(Point(labels[674]["Example"][1])))
