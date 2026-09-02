#!/usr/bin/env python3
"""Servidor del prototipo: sirve el frontend estático y una API mínima
para leer/editar tags, respaldada por Google Drive (ver drive_store.py).
"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

import drive_connect
import drive_store
import tags_store

ROOT = Path(__file__).parent
PUBLIC_DIR = ROOT / "public"

PHOTO_IMAGE_RE = re.compile(r"^/api/photos/([^/]+)/image/?$")
PHOTO_TAGS_RE = re.compile(r"^/api/photos/([^/]+)/tags/?$")
PHOTO_TAG_RE = re.compile(r"^/api/photos/([^/]+)/tags/([^/]+)$")
TAG_RE = re.compile(r"^/api/tags/([^/]+)$")

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silencia logs de acceso para no ensuciar la consola

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _binary(self, status, content, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "private, max-age=300")
        self.end_headers()
        self.wfile.write(content)

    def _static(self, path):
        rel = urlsplit(path).path.lstrip("/") or "index.html"
        file_path = (PUBLIC_DIR / rel).resolve()
        if PUBLIC_DIR not in file_path.parents and file_path != PUBLIC_DIR:
            self.send_error(403)
            return
        if not file_path.is_file():
            self.send_error(404)
            return
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME_TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if self.path == "/api/photos":
            try:
                self._json(200, drive_store.get_photos())
            except Exception as err:
                self._json(500, {"error": str(err)})
            return

        if self.path == "/api/tags":
            self._json(200, tags_store.get_tags())
            return

        if self.path == "/api/web-config":
            web = json.loads((ROOT / "web_client.json").read_text())
            self._json(200, {"apiKey": web["api_key"], "clientId": web["client_id"]})
            return

        match = PHOTO_IMAGE_RE.match(self.path)
        if match:
            try:
                content, mime = drive_store.get_image(match.group(1))
                self._binary(200, content, mime)
            except Exception as err:
                self._json(404, {"error": str(err)})
            return

        self._static(self.path)

    def do_POST(self):
        if self.path == "/api/connect":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            try:
                drive_connect.exchange_code(body["code"])
                drive_connect.save_folder(body["folder_id"], body["folder_name"])
                drive_store.reset()
                self._json(200, {"ok": True})
            except Exception as err:
                self._json(500, {"error": str(err)})
            return

        if self.path == "/api/tags":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            try:
                self._json(200, tags_store.add_tag(body.get("name") or ""))
            except ValueError as err:
                self._json(400, {"error": str(err)})
            return

        match = PHOTO_TAGS_RE.match(self.path)
        if not match:
            self.send_error(404)
            return
        photo_id = match.group(1)
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        tag = body.get("tag") or ""

        try:
            photo = drive_store.add_tag(photo_id, tag)
            self._json(200, photo)
        except ValueError as err:
            self._json(400, {"error": str(err)})
        except Exception as err:
            self._json(500, {"error": str(err)})

    def do_DELETE(self):
        tag_match = TAG_RE.match(self.path)
        if tag_match:
            self._json(200, tags_store.remove_tag(unquote(tag_match.group(1))))
            return

        match = PHOTO_TAG_RE.match(self.path)
        if not match:
            self.send_error(404)
            return
        photo_id, tag = match.group(1), unquote(match.group(2))

        try:
            photo = drive_store.remove_tag(photo_id, tag)
            self._json(200, photo)
        except Exception as err:
            self._json(500, {"error": str(err)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4173))
    host = "0.0.0.0" if "PORT" in os.environ else "localhost"
    server = HTTPServer((host, port), Handler)
    print(f"Galería en http://{host}:{port}")
    server.serve_forever()
