"""Registro maestro de etiquetas disponibles (independiente de qué fotos
las tengan asignadas). Vive localmente porque es solo un vocabulario de
nombres, no contenido de Drive.
"""
import json
from pathlib import Path

TAGS_PATH = Path(__file__).parent / "data" / "tags.json"


def get_tags():
    if not TAGS_PATH.exists():
        return []
    return json.loads(TAGS_PATH.read_text())


def _write(tags):
    TAGS_PATH.write_text(json.dumps(sorted(tags), ensure_ascii=False, indent=2))


def add_tag(name):
    clean = name.strip().lower()
    if not clean:
        raise ValueError("nombre de etiqueta vacío")
    tags = get_tags()
    if clean not in tags:
        tags.append(clean)
        _write(tags)
    return get_tags()


def remove_tag(name):
    tags = [t for t in get_tags() if t != name]
    _write(tags)
    return tags
