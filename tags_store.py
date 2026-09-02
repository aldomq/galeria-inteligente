"""Registro maestro de etiquetas disponibles (independiente de qué fotos
las tengan asignadas). Se guarda como un archivo (_tags.json) dentro de
la misma carpeta de Drive conectada — así sobrevive a reinicios del
servidor, a diferencia de un archivo local en un host con disco efímero.
"""
import io
import json

from googleapiclient.http import MediaIoBaseUpload

import drive_store

TAGS_FILENAME = "_tags.json"

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


def get_tags():
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    content = service.files().get_media(fileId=file_id).execute()
    return json.loads(content or b"[]")


def _write(tags):
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    media = MediaIoBaseUpload(
        io.BytesIO(json.dumps(sorted(tags), ensure_ascii=False).encode("utf-8")),
        mimetype="application/json",
    )
    service.files().update(fileId=file_id, media_body=media).execute()


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
