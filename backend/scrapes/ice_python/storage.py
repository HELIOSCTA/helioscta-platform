"""PostgreSQL writes for ICE Python settlement scrapes."""
from __future__ import annotations

import pandas as pd

from backend.utils import db


def upsert_dataframe(
    df: pd.DataFrame,
    schema: str,
    table_name: str,
    columns: list[str],
    data_types: list[str],
    primary_key: list[str],
    database: str | None = None,
) -> None:
    """Upsert a DataFrame into an operator-created ICE table."""
    if df.empty:
        return

    upsert_df = (
        df[columns]
        .drop_duplicates(subset=primary_key, keep="last")
        .where(pd.notna(df[columns]), None)
        .reset_index(drop=True)
    )
    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=upsert_df,
        columns=columns,
        data_types=data_types,
        primary_key=primary_key,
    )
