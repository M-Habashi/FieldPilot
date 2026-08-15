from __future__ import annotations

import io
import struct
import unittest

from PIL import Image

from api.photo_exif_fallback import _validate_storage_url, parse_exif_location


def jpeg_with_gps_exif() -> bytes:
    tiff = bytearray(128)

    def u16(offset: int, value: int) -> None:
        struct.pack_into("<H", tiff, offset, value)

    def u32(offset: int, value: int) -> None:
        struct.pack_into("<I", tiff, offset, value)

    def rational(offset: int, numerator: int, denominator: int = 1) -> None:
        u32(offset, numerator)
        u32(offset + 4, denominator)

    tiff[0:2] = b"II"
    u16(2, 42)
    u32(4, 8)
    u16(8, 1)
    u16(10, 0x8825)
    u16(12, 4)
    u32(14, 1)
    u32(18, 26)
    u16(26, 4)
    u16(28, 1)
    u16(30, 2)
    u32(32, 2)
    tiff[36:38] = b"N\0"
    u16(40, 2)
    u16(42, 5)
    u32(44, 3)
    u32(48, 80)
    u16(52, 3)
    u16(54, 2)
    u32(56, 2)
    tiff[60:62] = b"W\0"
    u16(64, 4)
    u16(66, 5)
    u32(68, 3)
    u32(72, 104)
    rational(80, 39)
    rational(88, 46)
    rational(96, 625, 100)
    rational(104, 86)
    rational(112, 9)
    rational(120, 2916, 100)
    exif = b"Exif\0\0" + bytes(tiff)
    segment_length = len(exif) + 2
    output = io.BytesIO()
    Image.new("RGB", (1, 1), "white").save(output, format="JPEG")
    jpeg = output.getvalue()
    return jpeg[:2] + b"\xff\xe1" + struct.pack(">H", segment_length) + exif + jpeg[2:]


class PhotoExifFallbackTests(unittest.TestCase):
    def test_reads_gps_without_returning_other_metadata(self) -> None:
        self.assertEqual(
            parse_exif_location(jpeg_with_gps_exif()),
            {
                "status": "found",
                "latitude": 39.76840277777778,
                "longitude": -86.1581,
            },
        )

    def test_distinguishes_missing_and_unreadable_files(self) -> None:
        self.assertEqual(parse_exif_location(b"not an image"), {"status": "unreadable"})

    def test_accepts_only_convex_storage_urls(self) -> None:
        valid = "https://example-123.convex.cloud/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1"
        self.assertEqual(_validate_storage_url(valid), valid)
        for invalid in (
            "http://example-123.convex.cloud/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1",
            "https://example.com/api/storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1",
            "https://example-123.convex.cloud/not-storage/896c8c81-9be5-4b30-9a79-e0bcdbb7d7b1",
        ):
            with self.assertRaises(ValueError):
                _validate_storage_url(invalid)


if __name__ == "__main__":
    unittest.main()
