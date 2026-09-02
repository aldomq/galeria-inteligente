"""Capa de datos respaldada por Google Drive. Usa drive.readonly +
drive.metadata para leer fotos y escribir etiquetas de forma confiable
(drive.file solo demostró perder acceso a archivos preexistentes sin
razón clara). Mientras la app esté en modo Prueba en Google Cloud, el
token hay que renovarlo cada ~7 días visitando /connect.html.

Tags: se guardan como la propiedad `tags` (string separado por comas) en
cada archivo de Drive, así viajan con la foto si algún día la mueves.
"""
import io
import mimetypes
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

import drive_connect

ROOT = Path(__file__).parent
TOKEN_PATH = ROOT / "token.json"
SCOPES = drive_connect.SCOPES

_service = None


def reset():
    """Fuerza reconstruir el cliente de Drive (tras reconectar en /connect.html)."""
    global _service
    _service = None


def _folder_id():
    folder_id = drive_connect.get_folder_id()
    if not folder_id:
        raise RuntimeError("No hay carpeta conectada todavía. Visita /connect.html primero.")
    return folder_id


def _get_service():
    global _service
    if _service is not None:
        return _service

    if not TOKEN_PATH.exists():
        raise RuntimeError("No hay conexión a Drive todavía. Visita /connect.html primero.")

    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
        else:
            raise RuntimeError("La conexión a Drive ya no es válida. Visita /connect.html para reconectar.")

    _service = build("drive", "v3", credentials=creds)
    return _service


def _tags_from_properties(properties):
    raw = (properties or {}).get("tags", "")
    return [t for t in raw.split(",") if t]


def get_photos():
    service = _get_service()
    folder_id = _folder_id()
    photos = []
    page_token = None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false",
                fields="nextPageToken, files(id, name, properties)",
                pageToken=page_token,
            )
            .execute()
        )
        for f in resp.get("files", []):
            properties = f.get("properties") or {}
            photos.append(
                {
                    "id": f["id"],
                    "filename": f["name"],
                    "name": properties.get("display_name") or f["name"],
                    "tags": _tags_from_properties(properties),
                }
            )
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return photos


def set_name(photo_id, name):
    clean = name.strip()
    if not clean:
        raise ValueError("nombre vacío")
    service = _get_service()
    service.files().update(
        fileId=photo_id,
        body={"properties": {"display_name": clean}},
    ).execute()
    return {"id": photo_id, "name": clean}


def get_image(file_id):
    service = _get_service()
    meta = service.files().get(fileId=file_id, fields="mimeType, name").execute()
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    mime = meta.get("mimeType") or mimetypes.guess_type(meta.get("name", ""))[0] or "application/octet-stream"
    return buf.getvalue(), mime


def _update_tags(photo_id, tags):
    service = _get_service()
    service.files().update(
        fileId=photo_id,
        body={"properties": {"tags": ",".join(tags)}},
    ).execute()
    return {"id": photo_id, "tags": tags}


def _current_tags(photo_id):
    service = _get_service()
    f = service.files().get(fileId=photo_id, fields="id, name, properties").execute()
    return f["name"], _tags_from_properties(f.get("properties"))


def add_tag(photo_id, tag):
    clean = tag.strip().lower()
    if not clean:
        raise ValueError("tag vacío")
    name, tags = _current_tags(photo_id)
    if clean not in tags:
        tags.append(clean)
    _update_tags(photo_id, tags)
    return {"id": photo_id, "filename": name, "tags": tags}


def remove_tag(photo_id, tag):
    name, tags = _current_tags(photo_id)
    tags = [t for t in tags if t != tag]
    _update_tags(photo_id, tags)
    return {"id": photo_id, "filename": name, "tags": tags}
