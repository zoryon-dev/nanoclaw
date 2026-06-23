#!/usr/bin/env python3
"""Stdlib test runner — no pytest needed. Discovers every test_*.py in this
directory, runs each test_* function, prints PASS/FAIL, exits non-zero on any
failure. Files stay pytest-collectable too."""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
failures = 0
for tf in sorted(HERE.glob("test_*.py")):
    spec = importlib.util.spec_from_file_location(tf.stem, tf)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for name in sorted(dir(mod)):
        if name.startswith("test_") and callable(getattr(mod, name)):
            try:
                getattr(mod, name)()
                print(f"PASS {tf.name}::{name}")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"FAIL {tf.name}::{name}: {exc!r}")
sys.exit(1 if failures else 0)
