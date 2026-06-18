"""ICE settlement symbol registries grouped by product family."""
from __future__ import annotations

from backend.scrapes.ice_python.symbols import (
    east_power,
    ercot,
    gas,
    pjm,
    west_power,
)


ACTIVE_REGISTRY_NAMES = ("pjm", "ercot", "gas", "west_power", "east_power")


def get_active_registry_names() -> tuple[str, ...]:
    """Return active non-options ICE product registry names."""
    return ACTIVE_REGISTRY_NAMES


def get_product_dictionary_entries() -> list[dict]:
    """Return product dictionary entries from all active non-options registries."""
    rows: list[dict] = []
    for registry_name, registry in [
        ("pjm", pjm),
        ("ercot", ercot),
        ("gas", gas),
        ("west_power", west_power),
        ("east_power", east_power),
    ]:
        for row in registry.get_product_dictionary_entries():
            rows.append(
                {
                    **row,
                    "registry_group": registry_name,
                }
            )
    return rows


def get_active_symbol_patterns() -> list[str]:
    """Return ICE symbol patterns from all active non-options registries."""
    return [row["ice_symbol_pattern"] for row in get_product_dictionary_entries()]
