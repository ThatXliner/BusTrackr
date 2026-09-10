#!/usr/bin/env python3
"""Fetch the small local-scene NAIP image and its server supplied extent.

The request is intentionally fixed to the scene bounds and output size used by
the renderer.  It uses only the Python standard library so the asset can be
refreshed without adding a project dependency.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "public" / "local-scene"
GROUND_PATH = OUTPUT_DIR / "ground.jpg"
BOUNDS_PATH = OUTPUT_DIR / "ground-bounds.json"
README_PATH = OUTPUT_DIR / "README.md"

PRIMARY_SERVICE_URL = (
    "https://imagery.nationalmap.gov/arcgis/rest/services/"
    "USGSNAIPImagery/ImageServer"
)
FALLBACK_SERVICE_URL = (
    "https://apps.geo.fpac.usda.gov/geo-imagery/rest/services/"
    "naip/conus_naip/ImageServer"
)

EXPORT_PARAMS = {
    "bbox": "-121.843,37.2697,-121.8215,37.287",
    "bboxSR": "4326",
    "imageSR": "4326",
    "size": "2048,1700",
    "format": "jpg",
    "bandIds": "0,1,2",
    "f": "json",
    "adjustAspectRatio": "false",
}
if "--campus" in sys.argv:
    EXPORT_PARAMS.update(bbox="-121.8294,37.2738,-121.8216,37.2774", size="2048,1200")
    GROUND_PATH = OUTPUT_DIR / "campus.jpg"
    BOUNDS_PATH = OUTPUT_DIR / "campus-bounds.json"
    README_PATH = OUTPUT_DIR / "campus-source.md"

MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 60
USER_AGENT = "BusTrackr local-scene asset fetcher"


def request_json(url: str) -> dict[str, Any]:
    """Fetch an ArcGIS export response and return its JSON object."""

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        data = response.read(1024 * 1024)
    payload = json.loads(data.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("export response was not a JSON object")
    if "error" in payload:
        raise ValueError(f"ArcGIS export error: {payload['error']}")
    return payload


def read_bounded(response: Any) -> bytes:
    """Read a response while keeping an explicit upper bound on its size."""

    content_length = response.headers.get("Content-Length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_DOWNLOAD_BYTES:
                raise ValueError(
                    f"image response exceeds {MAX_DOWNLOAD_BYTES} byte limit"
                )
        except ValueError as error:
            if "byte limit" in str(error):
                raise

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_DOWNLOAD_BYTES:
            raise ValueError(f"image response exceeds {MAX_DOWNLOAD_BYTES} byte limit")
        chunks.append(chunk)
    return b"".join(chunks)


def download_image(url: str) -> bytes:
    """Download the returned image bytes with a bounded response size."""

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return read_bounded(response)


def jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """Read JPEG dimensions from a SOF marker using only builtin operations."""

    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError("downloaded image is not a JPEG")

    # SOF markers whose payload starts with precision, height, and width.
    sof_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    index = 2
    while index < len(data):
        while index < len(data) and data[index] != 0xFF:
            index += 1
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in (0xD8, 0xD9):
            continue
        if marker == 0xDA:
            break
        if index + 2 > len(data):
            break
        segment_length = int.from_bytes(data[index : index + 2], "big")
        if segment_length < 2 or index + segment_length > len(data):
            raise ValueError("truncated JPEG segment")
        payload_start = index + 2
        if marker in sof_markers:
            if segment_length < 7:
                raise ValueError("invalid JPEG frame segment")
            height = int.from_bytes(data[payload_start + 1 : payload_start + 3], "big")
            width = int.from_bytes(data[payload_start + 3 : payload_start + 5], "big")
            if width <= 0 or height <= 0:
                raise ValueError("JPEG dimensions were empty")
            return width, height
        index += segment_length

    raise ValueError("JPEG frame dimensions were not found")


def export_from(service_url: str) -> tuple[bytes, dict[str, Any], int, int]:
    """Export one service, download its href, and validate the image metadata."""

    query = urllib.parse.urlencode(EXPORT_PARAMS)
    export_url = f"{service_url}/exportImage?{query}"
    payload = request_json(export_url)
    href = payload.get("href")
    extent = payload.get("extent")
    if not isinstance(href, str) or not href:
        raise ValueError("export response did not include an href")
    if not isinstance(extent, dict):
        raise ValueError("export response did not include an extent")
    if not href.startswith(("https://", "http://")):
        raise ValueError("export href was not an HTTP(S) URL")

    image = download_image(href)
    if not image:
        raise ValueError("downloaded image was empty")
    width, height = jpeg_dimensions(image)
    response_width = payload.get("width")
    response_height = payload.get("height")
    if response_width is not None and int(response_width) != width:
        raise ValueError("JPEG width did not match export response")
    if response_height is not None and int(response_height) != height:
        raise ValueError("JPEG height did not match export response")
    return image, extent, width, height


def write_metadata(
    *, service_url: str, retrieved_at: str, extent: dict[str, Any], width: int, height: int
) -> None:
    """Write the returned extent and provenance beside the downloaded image."""

    BOUNDS_PATH.write_text(json.dumps(extent, indent=2) + "\n", encoding="utf-8")
    README_PATH.write_text(
        "\n".join(
            [
                "# Local scene aerial image",
                "",
                f"`{GROUND_PATH.name}` is a downloaded public-domain NAIP aerial image. "
                "It is source imagery, not a photograph created by this project.",
                "",
                f"- Service: {service_url}",
                f"- Retrieved: {retrieved_at}",
                f"- Image dimensions: {width} × {height} pixels",
                f"- Requested export: bbox `{EXPORT_PARAMS['bbox']}`, size `{EXPORT_PARAMS['size']}`, JPEG, RGB bands `0,1,2`",
                f"- The renderer should use `{BOUNDS_PATH.name}`, which preserves "
                "the extent returned by the service.",
                "",
                "Source service description: "
                "https://imagery.nationalmap.gov/arcgis/rest/services/"
                "USGSNAIPImagery/ImageServer",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    for service_url in (PRIMARY_SERVICE_URL, FALLBACK_SERVICE_URL):
        try:
            image, extent, width, height = export_from(service_url)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
            errors.append(f"{service_url}: {error}")
            continue

        GROUND_PATH.write_bytes(image)
        retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        write_metadata(
            service_url=service_url,
            retrieved_at=retrieved_at,
            extent=extent,
            width=width,
            height=height,
        )
        print(f"Saved {GROUND_PATH} ({len(image)} bytes, {width}x{height})")
        print(f"Actual extent: {json.dumps(extent, sort_keys=True)}")
        print(f"Source service: {service_url}")
        return 0

    print("Unable to fetch local-scene NAIP imagery from either approved service:")
    for error in errors:
        print(f"- {error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
