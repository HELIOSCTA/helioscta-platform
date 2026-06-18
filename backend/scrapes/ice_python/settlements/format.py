"""Format ICE Python settlement data into the raw wide table shape."""
from __future__ import annotations

import pandas as pd

from backend.scrapes.ice_python.fields import (
    ICE_FIELD_TO_COLUMN,
    SETTLEMENT_COLUMNS,
    SETTLEMENT_PRIMARY_KEY,
)


def format_settlements(df: pd.DataFrame) -> pd.DataFrame:
    """Pivot long ICE field rows to one row per trade_date and symbol."""
    if df.empty:
        return pd.DataFrame(columns=SETTLEMENT_COLUMNS)

    normalized = df.copy()
    normalized["settlement_column"] = normalized["data_type"].map(ICE_FIELD_TO_COLUMN)
    normalized = normalized.dropna(subset=["settlement_column"])
    if normalized.empty:
        return pd.DataFrame(columns=SETTLEMENT_COLUMNS)

    wide = (
        normalized.pivot_table(
            index=["trade_date", "symbol"],
            columns="settlement_column",
            values="value",
            aggfunc="last",
        )
        .reset_index()
        .rename_axis(None, axis=1)
    )
    for column in SETTLEMENT_COLUMNS:
        if column not in wide.columns:
            wide[column] = None
    wide["trade_date"] = pd.to_datetime(wide["trade_date"], errors="coerce").dt.date
    wide["symbol"] = wide["symbol"].fillna("").astype(str)
    for column in SETTLEMENT_COLUMNS[2:]:
        wide[column] = pd.to_numeric(wide[column], errors="coerce")
    wide = wide.dropna(subset=["trade_date", "symbol"])
    return wide[SETTLEMENT_COLUMNS].sort_values(SETTLEMENT_PRIMARY_KEY)
