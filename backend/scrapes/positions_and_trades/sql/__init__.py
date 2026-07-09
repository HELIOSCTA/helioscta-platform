"""Generated SQL compiler for position and trade product rules."""

from importlib import import_module

_GENERATOR_EXPORTS = {
    "build_clear_street_trades_mufg_latest_sql",
    "build_nav_positions_account_breakout_sql",
    "build_nav_positions_grouped_latest_sql",
    "build_nav_positions_grouped_vs_raw_totals_sql",
    "build_nav_positions_grouped_with_raw_examples_sql",
    "build_nav_positions_raw_rows_for_group_sql",
    "build_nav_positions_rule_exceptions_sql",
    "generated_files",
    "write_generated_sql",
}

__all__ = [
    "generator",
    "build_clear_street_trades_mufg_latest_sql",
    "build_nav_positions_account_breakout_sql",
    "build_nav_positions_grouped_latest_sql",
    "build_nav_positions_grouped_vs_raw_totals_sql",
    "build_nav_positions_grouped_with_raw_examples_sql",
    "build_nav_positions_raw_rows_for_group_sql",
    "build_nav_positions_rule_exceptions_sql",
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
