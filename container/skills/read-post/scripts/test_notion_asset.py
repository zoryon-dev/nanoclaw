import json
import pathlib
import subprocess
import sys

SCRIPT = str(pathlib.Path(__file__).with_name("notion_asset.py"))


def _dry(*args):
    out = subprocess.run(
        [sys.executable, SCRIPT, "--dry-run", *args],
        capture_output=True,
        text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_payload_has_required_props():
    p = _dry(
        "--material", "Logo Zoryon white", "--marca", "zoryon",
        "--tipo", "Logo", "--drive", "https://drive.google.com/x",
        "--formato", "svg", "--notas", "logo principal",
    )
    props = p["properties"]
    assert props["Material"]["title"][0]["text"]["content"] == "Logo Zoryon white"
    assert props["Marca"]["select"]["name"] == "Zoryon"      # normalized
    assert props["Tipo"]["select"]["name"] == "Logo"
    assert props["Formato"]["select"]["name"] == "SVG"       # normalized upper
    assert props["Arquivo (Drive)"]["url"] == "https://drive.google.com/x"
    assert props["Notas"]["rich_text"][0]["text"]["content"] == "logo principal"
    assert "URL pública (R2)" not in props                   # omitted when absent


def test_r2_included_when_given():
    p = _dry(
        "--material", "Brand ref", "--marca", "Geral", "--tipo", "Brand-ref",
        "--r2", "https://bucket-nanoclaw.zoryon.co/x.png",
    )
    assert p["properties"]["URL pública (R2)"]["url"] == "https://bucket-nanoclaw.zoryon.co/x.png"


if __name__ == "__main__":
    test_payload_has_required_props()
    test_r2_included_when_given()
    print("ok")
