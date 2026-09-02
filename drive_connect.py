"""Intercambio del código de autorización (obtenido en el navegador vía
Google Identity Services + Picker) por un token permanente, y guardado de
la carpeta elegida. Reemplaza la autenticación de escritorio anterior.
"""
import json
import os
from pathlib import Path

# Google a veces devuelve más scopes de los pedidos si el proyecto tiene
# otros registrados en la pantalla de consentimiento; no truena por eso.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from google_auth_oauthlib.flow import Flow

ROOT = Path(__file__).parent
WEB_CLIENT_PATH = ROOT / "web_client.json"
TOKEN_PATH = ROOT / "token.json"
FOLDER_CONFIG_PATH = ROOT / "data" / "folder.json"

SCOPES = [
    # Lectura confiable de todas las fotos de la carpeta, sin importar quién
    # las suba — drive.file solo (probado dos veces) puede "olvidar" el
    # acceso a archivos ya existentes sin razón clara.
    "https://www.googleapis.com/auth/drive.readonly",
    # Escribir las etiquetas como propiedades de cada foto.
    "https://www.googleapis.com/auth/drive.metadata",
    # Crear y actualizar el contenido de _tags.json (el registro de
    # etiquetas) — ese archivo lo crea la app, así que este scope alcanza.
    "https://www.googleapis.com/auth/drive.file",
]


def _web_client():
    return json.loads(WEB_CLIENT_PATH.read_text())


def exchange_code(code):
    web = _web_client()
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": web["client_id"],
                "client_secret": web["client_secret"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri="postmessage",
    )
    flow.fetch_token(code=code)
    TOKEN_PATH.write_text(flow.credentials.to_json())


def save_folder(folder_id, folder_name):
    FOLDER_CONFIG_PATH.write_text(
        json.dumps({"id": folder_id, "name": folder_name}, ensure_ascii=False, indent=2)
    )


def get_folder_id():
    if not FOLDER_CONFIG_PATH.exists():
        return None
    return json.loads(FOLDER_CONFIG_PATH.read_text())["id"]
