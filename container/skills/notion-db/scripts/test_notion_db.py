import json
import pathlib
import subprocess
import sys

SCRIPT = str(pathlib.Path(__file__).with_name("notion_db.py"))
SCHEMA = str(pathlib.Path(__file__).parents[1] / "schema.example.json")


def _dry_create(db_key, flat):
    out = subprocess.run(
        [sys.executable, SCRIPT, "--schema", SCHEMA, "create-row", db_key,
         "--json", json.dumps(flat), "--dry-run"],
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_create_row_builds_each_property_type():
    p = _dry_create("lancamentos", {
        "descricao": "Uber", "id": "lan-3c7a8e", "data": "2026-05-11",
        "tipo": "despesa", "valor": 80, "pago": "sim", "categoria": "Transporte",
    })
    props = p["properties"]
    assert p["parent"]["database_id"] == ""  # not yet bootstrapped in the fixture
    assert props["Descrição"]["title"][0]["text"]["content"] == "Uber"
    assert props["id"]["rich_text"][0]["text"]["content"] == "lan-3c7a8e"
    assert props["Data"]["date"]["start"] == "2026-05-11"
    assert props["Tipo"]["select"]["name"] == "despesa"
    assert props["Valor"]["number"] == 80
    assert props["Pago"]["checkbox"] is True
    assert props["Categoria"]["relation"] == [{"id": "REL:categorias:Transporte"}]


def test_create_row_drops_readonly_and_absent():
    p = _dry_create("lancamentos", {
        "descricao": "Salário", "criado_em": "2026-05-11 10:00", "valor": None,
    })
    props = p["properties"]
    assert "Criado em" not in props      # created_time is read-only -> dropped
    assert "Valor" not in props          # None -> omitted
    assert "Tipo" not in props           # absent -> omitted


def test_checkbox_accepts_nao_as_false():
    p = _dry_create("lancamentos", {"descricao": "x", "pago": "não"})
    assert p["properties"]["Pago"]["checkbox"] is False
