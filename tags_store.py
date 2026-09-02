"""Registro maestro de etiquetas disponibles (independiente de qué fotos
las tengan asignadas), cada una con un color. Se guarda como un archivo
(_tags.json) dentro de la misma carpeta de Drive conectada — así
sobrevive a reinicios del servidor, a diferencia de un archivo local en
un host con disco efímero.
"""
import io
import json

from googleapiclient.http import MediaIoBaseUpload

import drive_store

TAGS_FILENAME = "_tags.json"

DEFAULT_PALETTE = [
    "#6366f1", "#ec4899", "#f97316", "#22c55e",
    "#06b6d4", "#a855f7", "#eab308", "#ef4444",
]

_file_id = None


def _find_or_create_file():
    global _file_id
    if _file_id:
        return _file_id

    service = drive_store._get_service()
    folder_id = drive_store._folder_id()
    resp = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and name = '{TAGS_FILENAME}' and trashed = false",
            fields="files(id)",
        )
        .execute()
    )
    files = resp.get("files", [])
    if files:
        _file_id = files[0]["id"]
        return _file_id

    media = MediaIoBaseUpload(io.BytesIO(b"[]"), mimetype="application/json")
    created = (
        service.files()
        .create(body={"name": TAGS_FILENAME, "parents": [folder_id]}, media_body=media, fields="id")
        .execute()
    )
    _file_id = created["id"]
    return _file_id


def _normalize(raw):
    """Migra el formato viejo (lista de strings) a {name, color}."""
    tags = []
    for i, item in enumerate(raw):
        if isinstance(item, str):
            tags.append({"name": item, "color": DEFAULT_PALETTE[i % len(DEFAULT_PALETTE)]})
        else:
            tags.append(item)
    return tags


def get_tags():
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    content = service.files().get_media(fileId=file_id).execute()
    return sorted(_normalize(json.loads(content or b"[]")), key=lambda t: t["name"])


def _write(tags):
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    ordered = sorted(tags, key=lambda t: t["name"])
    media = MediaIoBaseUpload(
        io.BytesIO(json.dumps(ordered, ensure_ascii=False).encode("utf-8")),
        mimetype="application/json",
    )
    service.files().update(fileId=file_id, media_body=media).execute()
    return ordered


def add_tag(name):
    clean = name.strip().lower()
    if not clean:
        raise ValueError("nombre de etiqueta vacío")
    tags = get_tags()
    if not any(t["name"] == clean for t in tags):
        color = DEFAULT_PALETTE[len(tags) % len(DEFAULT_PALETTE)]
        tags.append({"name": clean, "color": color})
        return _write(tags)
    return tags


def remove_tag(name):
    tags = [t for t in get_tags() if t["name"] != name]
    return _write(tags)


def set_color(name, color):
    tags = get_tags()
    found = False
    for t in tags:
        if t["name"] == name:
            t["color"] = color
            found = True
    if not found:
        raise ValueError("etiqueta no encontrada")
    return _write(tags)
