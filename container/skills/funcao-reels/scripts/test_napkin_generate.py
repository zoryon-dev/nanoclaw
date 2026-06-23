#!/usr/bin/env python3
"""Tests for napkin_generate.py via --dry-run (host-runnable, no gateway)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("napkin_generate.py")

# Exact set of fields the Napkin /v1/visual API accepts (verified 2026-06-22).
ALLOWED = {
    "content", "format", "language", "color_mode", "transparent_background",
    "number_of_visuals", "orientation", "style_id",
}


def _dry_run(*args: str) -> dict:
    out = subprocess.run(
        [sys.executable, str(SCRIPT), "--dry-run", *args],
        capture_output=True,
        text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_defaults_match_pack_and_api():
    p = _dry_run("--content", "Processo organizado × IA = escala", "--out", "d.png")
    assert p["content"] == "Processo organizado × IA = escala"
    # Pack defaults: pt-BR + dark + transparent for the black canvas.
    assert p["language"] == "pt-BR"
    assert p["color_mode"] == "dark"
    assert p["transparent_background"] is True
    assert p["format"] == "png"
    assert p["number_of_visuals"] == 1
    # Only API-accepted fields are sent (no visual_query/style/width).
    assert set(p).issubset(ALLOWED), f"unexpected fields: {set(p) - ALLOWED}"


def test_out_paths_naming():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "napkin_generate", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # One visual → the path as given.
    assert mod.out_paths("/x/diagrama.png", 1) == ["/x/diagrama.png"]
    # N visuals → stem-numbered siblings, suffix preserved.
    assert mod.out_paths("/x/diagrama.png", 3) == [
        "/x/diagrama-1.png", "/x/diagrama-2.png", "/x/diagrama-3.png"]
    assert mod.out_paths("/x/d.svg", 2) == ["/x/d-1.svg", "/x/d-2.svg"]


def test_overrides():
    p = _dry_run(
        "--content", "x", "--format", "svg", "--language", "en",
        "--color-mode", "light", "--no-transparent",
        "--orientation", "vertical", "--style-id", "ABC123", "--out", "d.svg",
    )
    assert p["format"] == "svg"
    assert p["language"] == "en"
    assert p["color_mode"] == "light"
    assert p["transparent_background"] is False
    assert p["orientation"] == "vertical"
    assert p["style_id"] == "ABC123"
    assert set(p).issubset(ALLOWED)


if __name__ == "__main__":
    test_defaults_match_pack_and_api()
    test_overrides()
    print("ok")
