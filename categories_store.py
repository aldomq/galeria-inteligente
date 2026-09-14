"""Registro de categorías (subgrupos como "Monturas", "Vinchas"). Cada
categoría es una subcarpeta de Drive dentro de la carpeta conectada —
las fotos y las etiquetas de esa categoría viven adentro de su propia
subcarpeta, para no mezclar todo en una sola carpeta plana.
"""
import io
import json

from googleapiclient.http import MediaIoBaseUpload

import drive_store

CATEGORIES_FILENAME = "_categories.json"

_file_id = None


def reset():
    global _file_id
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
            q=f"'{folder_id}' in parents and name = '{CATEGORIES_FILENAME}' and trashed = false",
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
        .create(body={"name": CATEGORIES_FILENAME, "parents": [folder_id]}, media_body=media, fields="id")
        .execute()
    )
    _file_id = created["id"]
    return _file_id


def get_categories():
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    content = service.files().get_media(fileId=file_id).execute()
    return sorted(json.loads(content or b"[]"), key=lambda c: c["name"])


def _write(categories):
    service = drive_store._get_service()
    file_id = _find_or_create_file()
    ordered = sorted(categories, key=lambda c: c["name"])
    media = MediaIoBaseUpload(
        io.BytesIO(json.dumps(ordered, ensure_ascii=False).encode("utf-8")),
        mimetype="application/json",
    )
    service.files().update(fileId=file_id, media_body=media).execute()
    return ordered


def add_category(name):
    clean = name.strip()
    if not clean:
        raise ValueError("nombre de categoría vacío")
    categories = get_categories()
    if any(c["name"].lower() == clean.lower() for c in categories):
        raise ValueError("ya existe una categoría con ese nombre")

    service = drive_store._get_service()
    root_folder_id = drive_store._folder_id()
    folder = (
        service.files()
        .create(
            body={
                "name": clean,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [root_folder_id],
            },
            fields="id",
        )
        .execute()
    )
    categories.append({"id": folder["id"], "name": clean})
    return _write(categories)


def remove_category(category_id):
    """Solo quita la categoría del menú — la subcarpeta y sus fotos
    siguen intactas en Drive, por si se quiere recuperar después."""
    categories = [c for c in get_categories() if c["id"] != category_id]
    return _write(categories)
