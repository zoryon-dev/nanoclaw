import importlib.util
import pathlib

SCRIPT = str(pathlib.Path(__file__).with_name("backfill_sheets.py"))
_spec = importlib.util.spec_from_file_location("backfill_sheets", SCRIPT)
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)


def test_rows_to_records_maps_headers_and_skips_empty():
    values = [
        ["id", "data", "valor", "ignored_col"],
        ["lan-1", "2026-05-01", "80", "x"],
        [],                       # blank row -> skipped
        ["lan-2", "2026-05-02", "12.5", "y"],
    ]
    colmap = {"id": "id", "data": "data", "valor": "valor"}
    recs = backfill.rows_to_records(values, colmap)
    assert recs == [
        {"id": "lan-1", "data": "2026-05-01", "valor": "80"},
        {"id": "lan-2", "data": "2026-05-02", "valor": "12.5"},
    ]


def test_rows_to_records_handles_short_rows():
    values = [["id", "data", "valor"], ["lan-3", "2026-05-03"]]  # missing valor cell
    recs = backfill.rows_to_records(values, {"id": "id", "data": "data", "valor": "valor"})
    assert recs == [{"id": "lan-3", "data": "2026-05-03"}]  # absent cell omitted
