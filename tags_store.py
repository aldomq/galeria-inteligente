"""Registro de etiquetas disponibles, independiente de qué fotos las
tengan asignadas, cada una con un color. Es por categoría — cada
subcarpeta de categoría tiene su propio _tags.json, así las etiquetas
de "vinchas" no se mezclan con las de "monturas". Se guarda en Drive
para sobrevivir a reinicios del servidor.
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

_file_ids = {}  # category folder_id -> id del _tags.json dentro de esa carpeta


def reset():
    _file_ids.clear()


def _find_or_create_file(folder_id):
    if folder_id in _file_ids:
        return _file_ids[folder_id]

    service = drive_store._get_service()
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
        _file_ids[folder_id] = files[0]["id"]
        return _file_ids[folder_id]

    media = MediaIoBaseUpload(io.BytesIO(b"[]"), mimetype="application/json")
    created = (
        service.files()
        .create(body={"name": TAGS_FILENAME, "parents": [folder_id]}, media_body=media, fields="id")
        .execute()
    )
    _file_ids[folder_id] = created["id"]
    return _file_ids[folder_id]


def _normalize(raw):
    """Migra el formato viejo (lista de strings) a {name, color}."""
    tags = []
    for i, item in enumerate(raw):
        if isinstance(item, str):
            tags.append({"name": item, "color": DEFAULT_PALETTE[i % len(DEFAULT_PALETTE)]})
        else:
            tags.append(item)
    return tags


def get_tags(folder_id):
    service = drive_store._get_service()
    file_id = _find_or_create_file(folder_id)
    content = service.files().get_media(fileId=file_id).execute()
    return sorted(_normalize(json.loads(content or b"[]")), key=lambda t: t["name"])


def _write(folder_id, tags):
    service = drive_store._get_service()
    file_id = _find_or_create_file(folder_id)
    ordered = sorted(tags, key=lambda t: t["name"])
    media = MediaIoBaseUpload(
        io.BytesIO(json.dumps(ordered, ensure_ascii=False).encode("utf-8")),
        mimetype="application/json",
    )
    service.files().update(fileId=file_id, media_body=media).execute()
    return ordered


def add_tag(folder_id, name):
    clean = name.strip().lower()
    if not clean:
        raise ValueError("nombre de etiqueta vacío")
    tags = get_tags(folder_id)
    if not any(t["name"] == clean for t in tags):
        color = DEFAULT_PALETTE[len(tags) % len(DEFAULT_PALETTE)]
        tags.append({"name": clean, "color": color})
        return _write(folder_id, tags)
    return tags


def remove_tag(folder_id, name):
    tags = [t for t in get_tags(folder_id) if t["name"] != name]
    return _write(folder_id, tags)


def set_color(folder_id, name, color):
    tags = get_tags(folder_id)
    found = False
    for t in tags:
        if t["name"] == name:
            t["color"] = color
            found = True
    if not found:
        raise ValueError("etiqueta no encontrada")
    return _write(folder_id, tags)
