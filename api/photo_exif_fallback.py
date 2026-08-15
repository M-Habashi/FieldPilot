from __future__ import annotations

import hmac
import io
import json
import math
import os
import re
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib import request as urlrequest
from urllib.parse import urlsplit

from PIL import ExifTags, Image
from pillow_heif import register_heif_opener

register_heif_opener()

MAX_CONTROL_BODY_BYTES = 16 * 1024
MAX_PHOTO_BYTES = 50 * 1024 * 1024
HEIC_CONTENT_TYPES = {"image/heic", "image/heif"}
STORAGE_PATH = re.compile(r"/api/storage/[0-9a-fA-F-]{36}")


class _NoRedirect(urlrequest.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Any,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _dms_to_decimal(values: Any, reference: Any) -> float | None:
    if not isinstance(values, (list, tuple)) or len(values) < 3:
        return None
    degrees = _to_float(values[0])
    minutes = _to_float(values[1])
    seconds = _to_float(values[2])
    if degrees is None or minutes is None or seconds is None:
        return None
    result = abs(degrees) + minutes / 60.0 + seconds / 3600.0
    if degrees < 0:
        result = -result
    if isinstance(reference, bytes):
        reference = reference.decode("ascii", "ignore")
    if isinstance(reference, str):
        normalized = reference.strip().upper()
        if normalized in {"S", "W"}:
            result = -abs(result)
        elif normalized in {"N", "E"}:
            result = abs(result)
    return result


def _valid_location(latitude: Any, longitude: Any) -> bool:
    return (
        isinstance(latitude, (int, float))
        and not isinstance(latitude, bool)
        and isinstance(longitude, (int, float))
        and not isinstance(longitude, bool)
        and math.isfinite(latitude)
        and math.isfinite(longitude)
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    )


def parse_exif_location(payload: bytes) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(payload)) as image:
            exif = image.getexif()
            if not exif:
                return {"status": "missing"}
            try:
                gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo) or {}
            except Exception:
                gps_ifd = {}
    except Exception:
        return {"status": "unreadable"}

    if not gps_ifd:
        return {"status": "missing"}
    latitude = _dms_to_decimal(gps_ifd.get(2), gps_ifd.get(1))
    longitude = _dms_to_decimal(gps_ifd.get(4), gps_ifd.get(3))
    if not _valid_location(latitude, longitude):
        return {"status": "missing"}
    return {"status": "found", "latitude": latitude, "longitude": longitude}


def _validate_storage_url(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 1_024:
        raise ValueError("Invalid source URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or not parsed.hostname.endswith(".convex.cloud")
        or parsed.port not in {None, 443}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or STORAGE_PATH.fullmatch(parsed.path) is None
    ):
        raise ValueError("Invalid source URL")
    return value


def _download_photo(source_url: str, expected_size: int, expected_content_type: str) -> bytes:
    opener = urlrequest.build_opener(_NoRedirect())
    request = urlrequest.Request(source_url, headers={"User-Agent": "FieldPilot-Exif-Fallback/1.0"})
    with opener.open(request, timeout=20) as response:
        content_type = response.headers.get_content_type().lower()
        if content_type not in HEIC_CONTENT_TYPES or content_type != expected_content_type:
            raise ValueError("Unexpected photo content type")
        content_length = response.headers.get("Content-Length")
        if content_length is not None and int(content_length) != expected_size:
            raise ValueError("Unexpected photo size")
        payload = response.read(MAX_PHOTO_BYTES + 1)
    if len(payload) > MAX_PHOTO_BYTES or len(payload) != expected_size:
        raise ValueError("Unexpected photo size")
    return payload


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        expected_secret = os.environ.get("PHOTO_EXIF_FALLBACK_SECRET", "")
        supplied_secret = self.headers.get("Authorization", "")
        if not expected_secret or not hmac.compare_digest(
            supplied_secret, f"Bearer {expected_secret}"
        ):
            self._send_json(401, {"error": "Unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_CONTROL_BODY_BYTES:
                raise ValueError("Invalid request size")
            request_body = json.loads(self.rfile.read(length))
            source_url = _validate_storage_url(request_body.get("sourceUrl"))
            expected_size = request_body.get("expectedSize")
            expected_content_type = str(request_body.get("expectedContentType", "")).lower()
            if (
                not isinstance(expected_size, int)
                or expected_size <= 0
                or expected_size > MAX_PHOTO_BYTES
                or expected_content_type not in HEIC_CONTENT_TYPES
            ):
                raise ValueError("Invalid photo description")
        except (ValueError, TypeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid request"})
            return

        try:
            payload = _download_photo(source_url, expected_size, expected_content_type)
        except Exception as error:
            print("photo_exif_fallback_source_failed", type(error).__name__)
            self._send_json(502, {"error": "Photo source unavailable"})
            return

        self._send_json(200, parse_exif_location(payload))

    def do_GET(self) -> None:  # noqa: N802
        self._send_json(405, {"error": "Method not allowed"})

    def _send_json(self, status_code: int, body: dict[str, Any]) -> None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)
