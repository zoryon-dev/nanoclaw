#!/usr/bin/env python3
"""Tests for napkin_generate.py via --dry-run (host-runnable, no gateway)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("napkin_generate.py")


def _dry_run(*args: str) -> dict:
    out = subprocess.run(
        [sys.executable, str(SCRIPT), "--dry-run", *args],
        capture_output=True,
        text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_defaults_match_pack():
    p = _dry_run(
        "--content", "extremos bons, meio ruim",
        "--visual-query", "comparison",
        "--out", "d.png",
    )
    assert p["content"] == "extremos bons, meio ruim"
    assert p["visual_query"] == "comparison"
    # The pack always uses pt-BR + dark + transparent for the black canvas.
    assert p["language"] == "pt-BR"
    assert p["color_mode"] == "dark"
    assert p["transparent_background"] is True
    assert p["format"] == "png"


def test_overrides():
    p = _dry_run(
        "--content", "x",
        "--visual-query", "cycle",
        "--language", "en",
        "--color-mode", "light",
        "--no-transparent",
        "--format", "svg",
        "--style", "Elegant Outline",
        "--width", "1600",
        "--out", "d.svg",
    )
    assert p["language"] == "en"
    assert p["color_mode"] == "light"
    assert p["transparent_background"] is False
    assert p["format"] == "svg"
    assert p["style"] == "Elegant Outline"
    assert p["width"] == 1600


if __name__ == "__main__":
    test_defaults_match_pack()
    test_overrides()
    print("ok")
