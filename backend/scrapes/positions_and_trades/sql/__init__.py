"""Generated SQL compiler for position and trade product rules."""

from importlib import import_module

_GENERATOR_EXPORTS = {
    "build_clear_street_trades_mufg_all_history_sql",
    "build_clear_street_trades_mufg_latest_sql",
    "build_nav_positions_all_history_sql",
    "build_nav_positions_latest_sql",
    "generated_files",
    "write_generated_sql",
}

__all__ = [
    "generator",
    "build_clear_street_trades_mufg_all_history_sql",
    "build_clear_street_trades_mufg_latest_sql",
    "build_nav_positions_all_history_sql",
    "build_nav_positions_latest_sql",
    "generated_files",
    "write_generated_sql",
]


def __getattr__(name: str):
    if name == "generator":
        return import_module(f"{__name__}.generator")
    if name in _GENERATOR_EXPORTS:
        module = import_module(f"{__name__}.generator")
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
