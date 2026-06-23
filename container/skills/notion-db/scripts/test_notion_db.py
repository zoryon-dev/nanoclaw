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


def _dry_create_db(db_key):
    out = subprocess.run(
        [sys.executable, SCRIPT, "--schema", SCHEMA, "create-db", db_key, "--dry-run"],
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_create_db_translates_property_types():
    p = _dry_create_db("lancamentos")
    assert p["parent"] == {"type": "page_id", "page_id": "00000000-0000-0000-0000-000000000000"}
    assert p["title"][0]["text"]["content"] == "Lançamentos"
    assert p["icon"] == {"type": "emoji", "emoji": "💸"}
    props = p["properties"]
    assert props["Descrição"] == {"title": {}}
    assert props["id"] == {"rich_text": {}}
    assert props["Data"] == {"date": {}}
    assert props["Criado em"] == {"created_time": {}}
    assert props["Valor"] == {"number": {"format": "number"}}
    assert props["Pago"] == {"checkbox": {}}
    assert props["Tipo"]["select"]["options"] == [{"name": "despesa"}, {"name": "receita"}]
    assert props["Categoria"]["relation"]["database_id"] == "DBID:categorias"


def test_create_db_requires_exactly_one_title():
    # categorias has exactly one title -> fine
    p = _dry_create_db("categorias")
    titles = [k for k, v in p["properties"].items() if v == {"title": {}}]
    assert titles == ["Nome"]


import importlib.util

_spec = importlib.util.spec_from_file_location("notion_db", SCRIPT)
notion_db = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(notion_db)


def test_parse_match_splits_on_first_equals():
    assert notion_db.parse_match("id=lan-3c7a8e") == ("id", "lan-3c7a8e")
    assert notion_db.parse_match("nome=A=B") == ("nome", "A=B")


def test_auth_hint_fires_on_401_403_and_restricted():
    assert notion_db.auth_hint(401, "") is not None
    assert notion_db.auth_hint(403, "") is not None
    assert notion_db.auth_hint(404, "object_not_found") is not None  # page not shared
    assert notion_db.auth_hint(400, "validation_error") is None


def test_match_filter_supported_types():
    title_spec = {"notion": "Descrição", "type": "title"}
    assert notion_db._match_filter(title_spec, "Uber") == {
        "property": "Descrição", "title": {"equals": "Uber"}
    }
    text_spec = {"notion": "id", "type": "text"}
    assert notion_db._match_filter(text_spec, "lan-1") == {
        "property": "id", "rich_text": {"equals": "lan-1"}
    }
    number_spec = {"notion": "Valor", "type": "number"}
    result = notion_db._match_filter(number_spec, "42")
    assert result == {"property": "Valor", "number": {"equals": 42.0}}
    assert isinstance(result["number"]["equals"], float)
    select_spec = {"notion": "Tipo", "type": "select"}
    assert notion_db._match_filter(select_spec, "despesa") == {
        "property": "Tipo", "select": {"equals": "despesa"}
    }


def test_match_filter_rejects_unsupported():
    checkbox_spec = {"notion": "X", "type": "checkbox"}
    try:
        notion_db._match_filter(checkbox_spec, "x")
        assert False, "expected SystemExit"
    except SystemExit:
        pass


def test_parse_match_strips_value():
    assert notion_db.parse_match("id= lan-1 ") == ("id", "lan-1")


def test_flatten_page_surfaces_relation_and_multi_select():
    db_schema = {
        "properties": {
            "tags": {"notion": "Tags", "type": "multi_select"},
            "categoria": {"notion": "Categoria", "type": "relation"},
        }
    }
    page = {
        "id": "page-abc",
        "properties": {
            "Tags": {
                "multi_select": [{"name": "saúde"}, {"name": "lazer"}]
            },
            "Categoria": {
                "relation": [{"id": "rel-id-1"}, {"id": "rel-id-2"}]
            },
        },
    }
    result = notion_db._flatten_page(db_schema, page)
    assert result["tags"] == ["saúde", "lazer"]
    assert result["categoria"] == ["rel-id-1", "rel-id-2"]
