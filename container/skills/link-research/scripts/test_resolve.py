import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import resolve  # noqa: E402


class TestClassifyType(unittest.TestCase):
    def test_reel_paths(self):
        for u in [
            "https://www.instagram.com/reel/Cabc123/",
            "https://instagram.com/reels/Xyz/",
            "https://www.tiktok.com/@user/video/7300000000000000000",
            "https://youtu.be/dQw4w9WgXcQ",
        ]:
            self.assertEqual(resolve.classify_type(u), "reel", u)

    def test_carousel_default(self):
        for u in [
            "https://www.instagram.com/p/Cabc123/",
            "https://www.instagram.com/username/",
        ]:
            self.assertEqual(resolve.classify_type(u), "carousel", u)


class TestParseCaption(unittest.TestCase):
    def test_extracts_description(self):
        data = json.dumps([[3, "https://img/1.jpg", {"description": "Texto da legenda aqui"}]])
        self.assertEqual(resolve.parse_caption(data), "Texto da legenda aqui")

    def test_falls_back_to_content_then_title(self):
        self.assertEqual(
            resolve.parse_caption(json.dumps([[3, "u", {"content": "via content"}]])),
            "via content",
        )
        self.assertEqual(
            resolve.parse_caption(json.dumps([[3, "u", {"title": "via title"}]])),
            "via title",
        )

    def test_empty_on_garbage_or_no_caption(self):
        self.assertEqual(resolve.parse_caption("not json"), "")
        self.assertEqual(resolve.parse_caption("[]"), "")
        self.assertEqual(resolve.parse_caption(json.dumps([[3, "u", {}]])), "")


if __name__ == "__main__":
    unittest.main()
