"""Shared PJM pricing feed filters."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from backend.scrapes.power.pjm import client


DEFAULT_PRICING_NODE_TYPES = ("hub", "zone", "interface")


def normalize_pricing_node_types(
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
) -> tuple[str, ...]:
    """Return normalized PJM pricing node types for bounded pricing pulls."""
    values = DEFAULT_PRICING_NODE_TYPES if pnode_types is None else pnode_types
    raw_types = [values] if isinstance(values, str) else list(values)

    normalized: list[str] = []
    for value in raw_types:
        clean = str(value).strip().lower()
        if clean and clean not in normalized:
            normalized.append(clean)

    if not normalized:
        raise ValueError("At least one PJM pricing node type is required.")

    return tuple(normalized)


def pricing_node_type_label(
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
) -> str:
    """Return a stable log/scope label for selected pricing node types."""
    return "/".join(normalize_pricing_node_types(pnode_types))


def fetch_csv_for_pricing_node_types(
    feed: str,
    *,
    base_params: dict[str, str],
    pnode_types: str | Iterable[str] | None = DEFAULT_PRICING_NODE_TYPES,
    **fetch_kwargs,
) -> pd.DataFrame:
    """Fetch a PJM pricing feed once per node type and concatenate results."""
    frames: list[pd.DataFrame] = []
    for pnode_type in normalize_pricing_node_types(pnode_types):
        frame = client.fetch_csv(
            feed,
            params={**base_params, "type": pnode_type},
            **fetch_kwargs,
        )
        if not frame.empty:
            frames.append(frame)

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)
