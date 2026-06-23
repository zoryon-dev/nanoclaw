#!/usr/bin/env python3
"""Tests for napkin_slides.py via --dry-run (host-runnable, no gateway)."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("napkin_slides.py")
PLACEHOLDER = "<style_id-do-slide-1>"


def _dry_run(blocks: list, *extra: str) -> list[dict]:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as fh:
        json.dump(blocks, fh)
        path = fh.name
    out = subprocess.run(
        [sys.executable, str(SCRIPT), "--blocks", path, "--dry-run", *extra],
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    payloads = []
    for line in out.stdout.splitlines():
        m = re.match(r"slide \d+: (\{.*\})", line)
        if m:
            payloads.append(json.loads(m.group(1)))
    return payloads


def test_slide1_establishes_style_rest_reuse():
    blocks = [
        {"content": "setup: duas entradas", "label": "beat3"},
        {"content": "destaque: a saída ruim", "label": "beat4"},
        {"content": "resolução: a ordem certa", "label": "beat5"},
    ]
    ps = _dry_run(blocks)
    assert len(ps) == 3
    # Slide 1 establishes the style → no style_id pinned.
    assert "style_id" not in ps[0]
    assert ps[0]["content"] == "setup: duas entradas"
    # Slides 2+ reuse slide-1's style for congruence.
    assert ps[1]["style_id"] == PLACEHOLDER
    assert ps[2]["style_id"] == PLACEHOLDER
    # Shared params propagate (pack defaults).
    for p in ps:
        assert p["language"] == "pt-BR"
        assert p["color_mode"] == "dark"
        assert p["transparent_background"] is True
        assert p["number_of_visuals"] == 1


def test_pinned_style_applies_to_all():
    blocks = [{"content": "a"}, {"content": "b"}]
    ps = _dry_run(blocks, "--style-id", "ABC123")
    assert ps[0]["style_id"] == "ABC123"  # pinned → even slide 1
    assert ps[1]["style_id"] == "ABC123"


def test_out_path_naming():
    import importlib.util
    spec = importlib.util.spec_from_file_location("napkin_slides", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    p = mod._out_path(Path("/r"), "diagrama", 2, "beat4-destaque", "png")
    assert str(p) == "/r/diagrama-2-beat4-destaque.png"
    p2 = mod._out_path(Path("/r"), "diagrama", 1, None, "svg")
    assert str(p2) == "/r/diagrama-1.svg"


if __name__ == "__main__":
    test_slide1_establishes_style_rest_reuse()
    test_pinned_style_applies_to_all()
    test_out_path_naming()
    print("ok")
