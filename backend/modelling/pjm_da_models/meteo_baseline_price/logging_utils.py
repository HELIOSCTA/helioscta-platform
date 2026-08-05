"""Compatibility wrapper for shared PJM DA model logging helpers."""

from __future__ import annotations

import sys
from pathlib import Path


def _find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "backend" / "modelling" / "pjm_da_models").exists():
            return parent
    raise RuntimeError(
        "Could not locate helioscta-platform repo root with "
        "backend/modelling/pjm_da_models."
    )


if __package__ in (None, ""):
    _REPO_ROOT = _find_repo_root()
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))

from backend.modelling.pjm_da_models.logging_utils import (  # noqa: F401
    ASCII_LEVEL_ICONS,
    LEVEL_COLORS,
    LEVEL_ICONS,
    Colors,
    ColoredFormatter,
    PipelineLogger,
    get_divider_char,
    get_level_icon,
    init_logging,
    print_divider,
    print_header,
    print_section,
    supports_color,
    supports_unicode,
)

__all__ = [
    "ASCII_LEVEL_ICONS",
    "LEVEL_COLORS",
    "LEVEL_ICONS",
    "Colors",
    "ColoredFormatter",
    "PipelineLogger",
    "get_divider_char",
    "get_level_icon",
    "init_logging",
    "print_divider",
    "print_header",
    "print_section",
    "supports_color",
    "supports_unicode",
]
