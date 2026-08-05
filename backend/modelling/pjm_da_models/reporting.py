"""Shared terminal reporting helpers for backend PJM DA model pipelines."""

from __future__ import annotations

from datetime import date
from numbers import Real

import pandas as pd

from .logging_utils import Colors, supports_color


HOURS = tuple(range(1, 25))
ONPEAK_HOURS = tuple(range(8, 24))
OFFPEAK_HOURS = tuple(hour for hour in HOURS if hour not in ONPEAK_HOURS)
HE_COLUMNS = tuple(f"HE{hour}" for hour in HOURS)
_RESET = Colors.RESET


def _color_enabled() -> bool:
    return supports_color()


def _style_line(line: str, color: str) -> str:
    return f"{color}{line}{_RESET}" if _color_enabled() else line


def _row_color(row: pd.Series) -> str:
    if "Type" in row:
        label = str(row["Type"])
        if label == "Actual":
            return Colors.BRIGHT_BLUE
        if label == "Forecast":
            return Colors.BRIGHT_GREEN
        if label == "Error":
            return Colors.BRIGHT_RED
        if label == "P50":
            return Colors.BRIGHT_YELLOW
        if label.startswith("P"):
            return Colors.BRIGHT_CYAN
    if "Rank" in row:
        label = str(row["Rank"])
        if label == "Target":
            return Colors.BRIGHT_YELLOW
        if label == "Avg":
            return Colors.BRIGHT_GREEN
        try:
            rank = int(row["Rank"])
        except (TypeError, ValueError):
            return ""
        if rank == 1:
            return Colors.BRIGHT_GREEN
        if rank <= 5:
            return Colors.BRIGHT_CYAN
        return Colors.DIM
    return ""


def _float_format(value: object) -> str:
    if pd.isna(value):
        return ""
    return f"{float(value):.2f}"


def _text_format(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value)


def _is_float_column(series: pd.Series) -> bool:
    if pd.api.types.is_float_dtype(series):
        return True
    if pd.api.types.is_integer_dtype(series) or pd.api.types.is_bool_dtype(series):
        return False
    values = [value for value in series.dropna().tolist() if value is not None]
    return bool(values) and all(isinstance(value, Real) for value in values)


def _formatted_display(frame: pd.DataFrame) -> pd.DataFrame:
    output = frame.copy()
    for column in output.columns:
        formatter = _float_format if _is_float_column(frame[column]) else _text_format
        output[column] = frame[column].map(formatter)
    return output


def _mean_for(row: dict[str, object], hours: tuple[int, ...]) -> float | None:
    values = [
        row.get(f"HE{hour}")
        for hour in hours
        if row.get(f"HE{hour}") is not None and not pd.isna(row.get(f"HE{hour}"))
    ]
    return float(sum(float(value) for value in values) / len(values)) if values else None


def _summarize_hourly(row: dict[str, object]) -> dict[str, object]:
    row["OnPeak"] = _mean_for(row, ONPEAK_HOURS)
    row["OffPeak"] = _mean_for(row, OFFPEAK_HOURS)
    row["Flat"] = _mean_for(row, HOURS)
    return row


def _quantile_label(column: str) -> str:
    raw = column.removeprefix("q_")
    try:
        value = float(raw)
    except ValueError:
        return column
    pct = value * 100.0
    if pct.is_integer():
        return f"P{int(pct):02d}"
    return f"P{pct:.1f}".rstrip("0").rstrip(".")


def build_hourly_forecast_table(
    target_date: date | str,
    frame: pd.DataFrame,
) -> pd.DataFrame:
    columns = ["Date", "Type", *HE_COLUMNS, "OnPeak", "OffPeak", "Flat"]
    if frame.empty:
        return pd.DataFrame(columns=columns)

    quantile_columns = sorted(c for c in frame.columns if c.startswith("q_"))
    value_columns: list[str] = []
    forecast_inserted = False
    for column in quantile_columns:
        value_columns.append(column)
        if column == "q_0.50" and "point_forecast" in frame.columns:
            value_columns.append("point_forecast")
            forecast_inserted = True
    if "point_forecast" in frame.columns and not forecast_inserted:
        value_columns.insert(0, "point_forecast")
    rows: list[dict[str, object]] = []
    for value_column in value_columns:
        if value_column not in frame.columns:
            continue
        row: dict[str, object] = {
            "Date": target_date,
            "Type": "Forecast"
            if value_column == "point_forecast"
            else _quantile_label(value_column),
        }
        for _, forecast_row in frame.iterrows():
            hour = int(forecast_row["hour_ending"])
            value = forecast_row[value_column]
            row[f"HE{hour}"] = float(value) if pd.notna(value) else None
        rows.append(_summarize_hourly(row))
    return pd.DataFrame(rows, columns=columns)


def build_analog_lmp_table(
    analogs: pd.DataFrame,
    *,
    max_ranks: int = 20,
) -> pd.DataFrame:
    columns = ["Rank", *HE_COLUMNS]
    if analogs.empty:
        return pd.DataFrame(columns=columns)
    ranks = sorted(int(rank) for rank in analogs["rank"].dropna().unique())[:max_ranks]
    rows: list[dict[str, object]] = []
    for rank in ranks:
        row: dict[str, object] = {"Rank": rank}
        rank_rows = analogs[analogs["rank"] == rank]
        for analog_row in rank_rows.itertuples(index=False):
            value = getattr(analog_row, "lmp", None)
            if pd.notna(value):
                row[f"HE{int(analog_row.hour_ending)}"] = float(value)
        rows.append(row)
    return pd.DataFrame(rows, columns=columns)


def build_analog_date_table(
    analogs: pd.DataFrame,
    *,
    max_ranks: int = 20,
) -> pd.DataFrame:
    columns = ["Rank", *HE_COLUMNS]
    if analogs.empty:
        return pd.DataFrame(columns=columns)
    ranks = sorted(int(rank) for rank in analogs["rank"].dropna().unique())[:max_ranks]
    rows: list[dict[str, object]] = []
    for rank in ranks:
        row: dict[str, object] = {"Rank": rank}
        rank_rows = analogs[analogs["rank"] == rank]
        for analog_row in rank_rows.itertuples(index=False):
            row[f"HE{int(analog_row.hour_ending)}"] = str(analog_row.date)
        rows.append(row)
    return pd.DataFrame(rows, columns=columns)


def print_frame(title: str, frame: pd.DataFrame, *, max_rows: int | None = None) -> None:
    print()
    print(_style_line(title, Colors.BOLD + Colors.BRIGHT_CYAN))
    print(_style_line("-" * len(title), Colors.BRIGHT_CYAN))
    if frame.empty:
        print("(empty)")
        return
    display = frame if max_rows is None else frame.head(max_rows)
    formatted = _formatted_display(display)
    with pd.option_context("display.width", 500, "display.max_columns", 120):
        output = formatted.to_string(index=False)
    lines = output.splitlines()
    if not lines:
        return
    print(_style_line(lines[0], Colors.BOLD + Colors.BRIGHT_CYAN))
    for line, (_, row) in zip(lines[1:], display.iterrows()):
        color = _row_color(row)
        print(_style_line(line, color) if color else line)
