#!/usr/bin/env python3
"""Fetch the fixed USGS campus tile in independently validated byte ranges."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import math
import os
import urllib.request


URL = (
    "https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/"
    "CA_SantaClaraCounty_2020_A20/CA_SantaClaraCounty_2020/LAZ/"
    "USGS_LPC_CA_SantaClaraCounty_2020_A20_17509250.laz"
)
EXPECTED_BYTES = 119_578_146
RANGE_BYTES = 4 * 1024 * 1024
MAX_WORKERS = 4
MAX_ATTEMPTS = 2
CACHE_DIR = Path(".cache-local-scene")
CHUNK_DIR = CACHE_DIR / "lidar-chunks"
DESTINATION = CACHE_DIR / "campus.laz"
COMPLETE = CACHE_DIR / "campus.laz.complete"


def bounds_for(index: int) -> tuple[int, int, int]:
    start = index * RANGE_BYTES
    end = min(start + RANGE_BYTES, EXPECTED_BYTES) - 1
    return start, end, end - start + 1


def valid_chunk(path: Path, expected_length: int) -> bool:
    return path.is_file() and path.stat().st_size == expected_length


def download_chunk(index: int) -> tuple[int, str]:
    start, end, expected_length = bounds_for(index)
    final = CHUNK_DIR / f"{index:03d}.bin"
    part = CHUNK_DIR / f"{index:03d}.part"

    if valid_chunk(final, expected_length):
        return index, "skipped"
    if final.exists():
        final.unlink()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            request = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(request, timeout=30) as response:
                if getattr(response, "status", None) != 206:
                    raise RuntimeError(f"HTTP {getattr(response, 'status', None)}, expected 206")
                content_range = response.headers.get("Content-Range", "")
                try:
                    range_part, total_part = content_range.split("/", 1)
                    response_range = range_part.split(" ", 1)[1]
                    response_start, response_end = map(int, response_range.split("-", 1))
                    response_total = int(total_part)
                except (ValueError, IndexError):
                    raise RuntimeError(f"invalid Content-Range {content_range!r}")
                if (response_start, response_end, response_total) != (start, end, EXPECTED_BYTES):
                    raise RuntimeError(
                        f"Content-Range {content_range!r}, expected "
                        f"bytes {start}-{end}/{EXPECTED_BYTES}"
                    )

                received = 0
                with part.open("wb") as output:
                    while received < expected_length:
                        chunk = response.read(min(1024 * 1024, expected_length - received))
                        if not chunk:
                            raise RuntimeError(f"received {received}/{expected_length} bytes")
                        output.write(chunk)
                        received += len(chunk)
                if received != expected_length or part.stat().st_size != expected_length:
                    raise RuntimeError(f"received {received}/{expected_length} bytes")
            os.replace(part, final)
            return index, "downloaded"
        except Exception:
            try:
                part.unlink()
            except FileNotFoundError:
                pass
            if attempt == MAX_ATTEMPTS:
                raise

    raise AssertionError("unreachable")


def concatenate(chunk_count: int) -> None:
    with COMPLETE.open("wb") as output:
        for index in range(chunk_count):
            _, _, expected_length = bounds_for(index)
            chunk = CHUNK_DIR / f"{index:03d}.bin"
            if not valid_chunk(chunk, expected_length):
                raise RuntimeError(f"missing or invalid chunk {chunk}")
            with chunk.open("rb") as source:
                while data := source.read(1024 * 1024):
                    output.write(data)
    if COMPLETE.stat().st_size != EXPECTED_BYTES:
        raise RuntimeError(
            f"assembled {COMPLETE.stat().st_size} bytes, expected {EXPECTED_BYTES}"
        )
    os.replace(COMPLETE, DESTINATION)


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CHUNK_DIR.mkdir(parents=True, exist_ok=True)
    chunk_count = math.ceil(EXPECTED_BYTES / RANGE_BYTES)
    print(f"Fetching {EXPECTED_BYTES} bytes in {chunk_count} ranges", flush=True)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(download_chunk, index) for index in range(chunk_count)]
        for future in as_completed(futures):
            index, result = future.result()
            print(f"chunk {index:03d}: {result}", flush=True)

    concatenate(chunk_count)
    print(f"Installed {DESTINATION} ({DESTINATION.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    main()
