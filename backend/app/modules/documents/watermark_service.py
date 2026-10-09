"""
DSA OS — Document Watermarking & PDF Merge Service

Implements:
- FR-DOC-009: Merge images into single PDF on request
- NFR-SEC-010: Download watermark overlay (user, timestamp, organization)
"""

import io
import logging
from datetime import UTC, datetime

from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)


class DocumentWatermarkService:
    @staticmethod
    def apply_watermark(image: Image.Image, watermark_text: str) -> Image.Image:
        """Apply a diagonal security watermark across an image."""
        # Convert to RGBA for alpha overlay
        base = image.convert("RGBA")
        overlay = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)

        # Place repeated subtle watermark across image
        width, height = base.size
        step_x = max(200, width // 3)
        step_y = max(150, height // 4)

        for y in range(40, height, step_y):
            for x in range(30, width, step_x):
                draw.text(
                    (x, y),
                    watermark_text,
                    fill=(180, 180, 180, 80),
                )

        # Bottom footer watermark
        footer_text = f"DSA OS SECURE EXPORT — {watermark_text} — CONFIDENTIAL"
        draw.text(
            (20, height - 30),
            footer_text,
            fill=(100, 100, 100, 180),
        )

        watermarked = Image.alpha_composite(base, overlay)
        return watermarked.convert("RGB")

    @classmethod
    def merge_images_to_pdf(
        cls,
        image_bytes_list: list[bytes],
        watermark_text: str | None = None,
    ) -> bytes:
        """
        Merge multiple images (JPEG/PNG) into a single PDF document.
        Optionally applies security watermark to each page.
        """
        if not image_bytes_list:
            raise ValueError("At least one image is required to generate a PDF")

        pil_images: list[Image.Image] = []
        for img_bytes in image_bytes_list:
            raw_img = Image.open(io.BytesIO(img_bytes))
            processed: Image.Image = (
                cls.apply_watermark(raw_img, watermark_text)
                if watermark_text
                else raw_img.convert("RGB")
            )
            pil_images.append(processed)

        output_buffer = io.BytesIO()
        first_page = pil_images[0]
        other_pages = pil_images[1:] if len(pil_images) > 1 else []

        first_page.save(
            output_buffer,
            format="PDF",
            save_all=True,
            append_images=other_pages,
            resolution=100.0,
        )

        return output_buffer.getvalue()

    @classmethod
    def create_watermarked_export(
        cls,
        image_bytes_list: list[bytes],
        user_name: str,
        user_id: str,
        timestamp: datetime | None = None,
    ) -> bytes:
        """Formats standard audit watermark and returns merged PDF."""
        ts = timestamp or datetime.now(UTC)
        formatted_ts = ts.strftime("%Y-%m-%d %H:%M:%S UTC")
        watermark_text = f"{user_name} ({user_id[:8]}) {formatted_ts}"
        return cls.merge_images_to_pdf(image_bytes_list, watermark_text=watermark_text)
