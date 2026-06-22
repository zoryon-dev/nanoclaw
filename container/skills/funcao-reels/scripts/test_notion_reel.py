#!/usr/bin/env python3
"""Tests for notion_reel.py via --dry-run (host-runnable, no gateway)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("notion_reel.py")
DB_ID = "5a920ab3-b2d6-4552-8ae5-3ff9c6582f27"


def _dry_run(*args: str) -> dict:
    out = subprocess.run(
        [sys.executable, str(SCRIPT), "--dry-run", *args],
        capture_output=True,
        text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_required_props_and_normalization():
    p = _dry_run(
        "--titulo", "Os 2 caminhos que funcionam",
        "--marca", "faryon",          # lowercase -> normalized
        "--formato", "r2",            # lowercase -> R2
        "--objetivo", "save",         # alias -> Salvar
        "--data", "2026-06-22",
        "--duracao", "15–30s",
        "--drive", "https://drive.google.com/x",
        "--hook", "Existem só 2 caminhos.",
    )
    assert p["parent"]["database_id"] == DB_ID
    props = p["properties"]
    assert props["Reel"]["title"][0]["text"]["content"] == "Os 2 caminhos que funcionam"
    assert props["Marca"]["select"]["name"] == "Faryon"
    assert props["Formato"]["select"]["name"] == "R2"
    assert props["Objetivo"]["select"]["name"] == "Salvar"
    assert props["Status"]["select"]["name"] == "Entregue"  # default
    assert props["Data"]["date"]["start"] == "2026-06-22"
    assert props["Pasta Drive"]["url"] == "https://drive.google.com/x"
    assert props["Hook"]["rich_text"][0]["text"]["content"] == "Existem só 2 caminhos."


def test_minimal_defaults():
    p = _dry_run("--titulo", "x")
    props = p["properties"]
    assert props["Marca"]["select"]["name"] == "Zoryon"   # default
    assert props["Status"]["select"]["name"] == "Entregue"
    assert "Formato" not in props
    assert "Objetivo" not in props


def test_objetivo_clamps_full_cta_phrase():
    # A full CTA phrase must collapse to the canonical option, never pollute.
    p = _dry_run("--titulo", "x", "--objetivo", "Comenta DIAGNÓSTICO — lead pro pré-diagnóstico")
    assert p["properties"]["Objetivo"]["select"]["name"] == "Comentar"


def test_objetivo_unknown_is_omitted():
    p = _dry_run("--titulo", "x", "--objetivo", "xpto qualquer coisa")
    assert "Objetivo" not in p["properties"]


if __name__ == "__main__":
    test_required_props_and_normalization()
    test_minimal_defaults()
    print("ok")
