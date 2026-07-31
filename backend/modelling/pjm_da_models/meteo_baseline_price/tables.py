"""Table builders for the direct-read Meteologica DA price baseline."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

if __package__ in (None, ""):
    from logging_utils import (  # type: ignore[import-not-found]
        Colors,
        print_section,
        supports_color,
        supports_unicode,
    )
else:
    from .logging_utils import Colors, print_section, supports_color, supports_unicode

HOURS = tuple(range(1, 25))
ONPEAK_HOURS = tuple(range(8, 24))
OFFPEAK_HOURS = tuple(hour for hour in HOURS if hour not in ONPEAK_HOURS)
HE_COLS = tuple(f"HE{hour}" for hour in HOURS)
OUTPUT_COLS = ("Date", "Type", *HE_COLS, "OnPeak", "OffPeak", "Flat")

SERIES_TO_COL = {
    "Det": "da_price_deterministic",
    "ENS Avg": "da_price_ens_average",
    "ENS Bottom": "da_price_ens_bottom",
    "ENS Top": "da_price_ens_top",
}
ENS_MEMBER_PREFIX = "da_price_ens_"

_COLOR_ON = supports_color()
_DARK_GREEN_256 = "\033[38;5;22m"
_GREEN_256 = "\033[38;5;28m"
_RED_256 = "\033[38;5;124m"
_DARK_RED_256 = "\033[38;5;88m"
_DARK_ORANGE_256 = "\033[38;5;166m"
_PURPLE_256 = "\033[38;5;93m"
_RS = Colors.RESET if _COLOR_ON else ""
_DIM = Colors.DIM if _COLOR_ON else ""
_ENS_ENVELOPE_STYLE = (Colors.BOLD + _DARK_ORANGE_256) if _COLOR_ON else ""
_ROW_STYLES: dict[str, str] = {
    "Actual": (Colors.BOLD + _PURPLE_256) if _COLOR_ON else "",
    "Det": (Colors.BOLD + Colors.BRIGHT_BLUE) if _COLOR_ON else "",
    "ENS Avg": (Colors.BOLD + Colors.YELLOW) if _COLOR_ON else "",
    "ENS Bottom": _ENS_ENVELOPE_STYLE,
    "ENS Top": _ENS_ENVELOPE_STYLE,
}


@dataclass(frozen=True)
class DispersionMetrics:
    width: np.ndarray
    iqr: np.ndarray
    skew: np.ndarray
    delta_p50: np.ndarray


def _mean_for_hours(hourly: dict[int, float], hours: tuple[int, ...]) -> float | None:
    values = [hourly[hour] for hour in hours if hour in hourly and pd.notna(hourly[hour])]
    if not values:
        return None
    return float(np.mean(values))


def _hourly_dict_from_df(df: pd.DataFrame, value_col: str) -> dict[int, float]:
    if df.empty or value_col not in df.columns:
        return {}
    out: dict[int, float] = {}
    for row in df.itertuples(index=False):
        hour = int(getattr(row, "hour_ending"))
        value = getattr(row, value_col)
        if pd.notna(value):
            out[hour] = float(value)
    return out


def _row(target_date: date, label: str, hourly: dict[int, float]) -> dict[str, object]:
    output: dict[str, object] = {"Date": target_date, "Type": label}
    for hour in HOURS:
        output[f"HE{hour}"] = hourly.get(hour)
    output["OnPeak"] = _mean_for_hours(hourly, ONPEAK_HOURS)
    output["OffPeak"] = _mean_for_hours(hourly, OFFPEAK_HOURS)
    output["Flat"] = _mean_for_hours(hourly, HOURS)
    return output


def _onpeak_sort_key(row: dict[str, object]) -> float:
    value = row.get("OnPeak")
    if value is None or pd.isna(value):
        return float("inf")
    return float(value)


def build_bands_table(target_date: date, forecast: pd.DataFrame) -> pd.DataFrame:
    rows = [
        _row(target_date, label, _hourly_dict_from_df(forecast, column))
        for label, column in SERIES_TO_COL.items()
    ]
    rows.sort(key=_onpeak_sort_key)
    return pd.DataFrame(rows, columns=list(OUTPUT_COLS))


def build_forecast_vs_actuals(
    target_date: date,
    forecast: pd.DataFrame,
    actuals_hourly: dict[int, float] | None,
    forecast_label: str = "Det",
) -> pd.DataFrame:
    if forecast.empty or not actuals_hourly:
        return pd.DataFrame(columns=list(OUTPUT_COLS))

    forecast_hourly = _hourly_dict_from_df(forecast, SERIES_TO_COL[forecast_label])
    error = {
        hour: forecast_hourly[hour] - actuals_hourly[hour]
        for hour in HOURS
        if hour in forecast_hourly and hour in actuals_hourly
    }
    abs_error = {hour: abs(value) for hour, value in error.items()}
    mape = {
        hour: abs(error[hour]) / abs(actuals_hourly[hour]) * 100.0
        for hour in error
        if abs(actuals_hourly[hour]) > 1e-9
    }
    return pd.DataFrame(
        [
            _row(target_date, "Actual", actuals_hourly),
            _row(target_date, "Forecast", forecast_hourly),
            _row(target_date, "Error", error),
            _row(target_date, "|Err|", abs_error),
            _row(target_date, "MAPE %", mape),
        ],
        columns=list(OUTPUT_COLS),
    )


def _empirical_crps_per_he(
    forecast: pd.DataFrame,
    actuals_hourly: dict[int, float],
) -> np.ndarray:
    crps = np.full(24, np.nan)
    members = _member_matrix(forecast)
    if members.shape[1] == 0:
        return crps

    for hour_idx in range(24):
        actual = actuals_hourly.get(hour_idx + 1)
        if actual is None or pd.isna(actual):
            continue
        row = members[hour_idx]
        row = row[np.isfinite(row)]
        if len(row) < 2:
            continue
        term1 = float(np.mean(np.abs(row - actual)))
        pairwise = float(np.mean(np.abs(row[:, None] - row[None, :])))
        crps[hour_idx] = term1 - 0.5 * pairwise
    return crps


def build_bands_vs_actuals(
    target_date: date,
    forecast: pd.DataFrame,
    actuals_hourly: dict[int, float] | None,
) -> pd.DataFrame:
    if forecast.empty or not actuals_hourly:
        return pd.DataFrame(columns=list(OUTPUT_COLS))

    bottom = _hourly_dict_from_df(forecast, "da_price_ens_bottom")
    top = _hourly_dict_from_df(forecast, "da_price_ens_top")

    in_band: dict[str, object] = {"Date": target_date, "Type": "InBand"}
    in_band_values = np.full(24, np.nan)
    for hour in HOURS:
        actual = actuals_hourly.get(hour)
        low = bottom.get(hour)
        high = top.get(hour)
        if actual is None or low is None or high is None or pd.isna(actual):
            in_band[f"HE{hour}"] = None
            continue
        ok = (low - 1e-9) <= actual <= (high + 1e-9)
        in_band[f"HE{hour}"] = "\u2713" if ok else "\u2717"
        in_band_values[hour - 1] = 1.0 if ok else 0.0

    for label, hours in (
        ("OnPeak", ONPEAK_HOURS),
        ("OffPeak", OFFPEAK_HOURS),
        ("Flat", HOURS),
    ):
        values = [in_band_values[hour - 1] for hour in hours]
        values = [value for value in values if np.isfinite(value)]
        in_band[label] = f"{int(round(float(np.mean(values)) * 100))}%" if values else None

    crps_array = _empirical_crps_per_he(forecast, actuals_hourly)
    crps_hourly = {
        hour: float(crps_array[hour - 1])
        for hour in HOURS
        if np.isfinite(crps_array[hour - 1])
    }

    return pd.DataFrame(
        [
            _row(target_date, "ENS Bottom", bottom),
            _row(target_date, "Actual", actuals_hourly),
            _row(target_date, "ENS Top", top),
            in_band,
            _row(target_date, "CRPS", crps_hourly),
        ],
        columns=list(OUTPUT_COLS),
    )


def member_columns(df: pd.DataFrame) -> list[str]:
    return sorted(
        [
            column
            for column in df.columns
            if column.startswith(ENS_MEMBER_PREFIX)
            and column[len(ENS_MEMBER_PREFIX) :].isdigit()
        ],
        key=lambda column: int(column[len(ENS_MEMBER_PREFIX) :]),
    )


def build_members_table(target_date: date, forecast: pd.DataFrame) -> pd.DataFrame:
    if forecast.empty:
        return pd.DataFrame(columns=list(OUTPUT_COLS))

    rows = [
        _row(target_date, "ENS Bottom", _hourly_dict_from_df(forecast, "da_price_ens_bottom"))
    ]
    middle = [
        _row(
            target_date,
            f"ENS_{column[len(ENS_MEMBER_PREFIX):]}",
            _hourly_dict_from_df(forecast, column),
        )
        for column in member_columns(forecast)
    ]
    middle.append(
        _row(target_date, "Det", _hourly_dict_from_df(forecast, "da_price_deterministic"))
    )
    middle.append(
        _row(target_date, "ENS Avg", _hourly_dict_from_df(forecast, "da_price_ens_average"))
    )
    middle.sort(key=_onpeak_sort_key)
    rows.extend(middle)
    rows.append(_row(target_date, "ENS Top", _hourly_dict_from_df(forecast, "da_price_ens_top")))
    return pd.DataFrame(rows, columns=list(OUTPUT_COLS))


def _per_he_array(df: pd.DataFrame, column: str) -> np.ndarray:
    values = np.full(24, np.nan)
    if df.empty or column not in df.columns:
        return values
    for row in df.itertuples(index=False):
        hour = int(getattr(row, "hour_ending"))
        if 1 <= hour <= 24:
            value = getattr(row, column)
            if pd.notna(value):
                values[hour - 1] = float(value)
    return values


def _member_matrix(df: pd.DataFrame) -> np.ndarray:
    columns = member_columns(df)
    if not columns:
        return np.empty((24, 0))
    matrix = np.full((24, len(columns)), np.nan)
    for row in df.itertuples(index=False):
        hour = int(getattr(row, "hour_ending"))
        if not 1 <= hour <= 24:
            continue
        for idx, column in enumerate(columns):
            value = getattr(row, column)
            if pd.notna(value):
                matrix[hour - 1, idx] = float(value)
    return matrix


def compute_dispersion_metrics(forecast: pd.DataFrame) -> DispersionMetrics | None:
    if forecast.empty:
        return None
    top = _per_he_array(forecast, "da_price_ens_top")
    bottom = _per_he_array(forecast, "da_price_ens_bottom")
    members = _member_matrix(forecast)
    width = top - bottom

    iqr = np.full(24, np.nan)
    p50 = np.full(24, np.nan)
    for hour_idx in range(24):
        row = members[hour_idx]
        row = row[np.isfinite(row)]
        if len(row) >= 2:
            iqr[hour_idx] = float(np.percentile(row, 75) - np.percentile(row, 25))
            p50[hour_idx] = float(np.percentile(row, 50))

    skew = (top - p50) - (p50 - bottom)
    delta_p50 = np.full(24, np.nan)
    delta_p50[1:] = np.diff(p50)
    return DispersionMetrics(width=width, iqr=iqr, skew=skew, delta_p50=delta_p50)


def build_dispersion_table(
    target_date: date,
    metrics: DispersionMetrics | None,
) -> pd.DataFrame:
    if metrics is None:
        return pd.DataFrame(columns=list(OUTPUT_COLS))

    def metric_row(label: str, values: np.ndarray) -> dict[str, object]:
        hourly = {
            hour: float(values[hour - 1])
            for hour in HOURS
            if np.isfinite(values[hour - 1])
        }
        return _row(target_date, label, hourly)

    return pd.DataFrame(
        [
            metric_row("Width", metrics.width),
            metric_row("IQR", metrics.iqr),
            metric_row("Skew", metrics.skew),
            metric_row(_delta_label(), metrics.delta_p50),
        ],
        columns=list(OUTPUT_COLS),
    )


def onpeak_value(table: pd.DataFrame, label: str) -> float | None:
    if table.empty:
        return None
    rows = table[table["Type"] == label]
    if rows.empty:
        return None
    value = rows.iloc[0].get("OnPeak")
    return None if value is None or pd.isna(value) else float(value)


def print_frame(title: str, frame: pd.DataFrame, *, max_rows: int | None = None) -> None:
    print()
    print(title)
    print("-" * len(title))
    if frame.empty:
        print("(empty)")
        return
    display = frame if max_rows is None else frame.head(max_rows)
    with pd.option_context("display.width", 220, "display.max_columns", 80):
        print(display.to_string(index=False))


def _delta_label() -> str:
    return "\u0394 P50" if supports_unicode() else "Delta P50"


def _gradient_color(value: float, max_abs: float) -> str:
    if not _COLOR_ON or not np.isfinite(value) or max_abs <= 0:
        return ""
    norm = abs(value) / max_abs
    if norm < 0.10:
        return _DARK_GREEN_256
    if norm < 0.20:
        return _GREEN_256
    if norm < 0.35:
        return ""
    if norm < 0.65:
        return _RED_256
    return _DARK_RED_256


def _wrap_gradient(raw_cell: str, value: float, max_abs: float) -> str:
    color = _gradient_color(value, max_abs)
    if not color:
        return raw_cell
    stripped = raw_cell.lstrip(" ")
    leading = raw_cell[: len(raw_cell) - len(stripped)]
    return f"{leading}{color}{stripped}{_RS}"


def _print_table_header() -> str:
    header = f"{'Date':<12} {'Type':<10}"
    for hour in HOURS:
        header += f" {hour:>6}"
    header += f" {'OnPk':>7} {'OffPk':>7} {'Flat':>7}"
    print(header)
    print("-" * len(header))
    return header


def _format_row(row: pd.Series, *, signed: bool) -> str:
    line = f"{str(row['Date']):<12} {row['Type']:<10}"
    he_format = "+6.1f" if signed else "6.1f"
    block_format = "+7.2f" if signed else "7.2f"
    for hour in HOURS:
        value = row.get(f"HE{hour}")
        line += f" {value:>{he_format}}" if pd.notna(value) else f" {'':>6}"
    for column in ("OnPeak", "OffPeak", "Flat"):
        value = row.get(column)
        line += f" {value:>{block_format}}" if pd.notna(value) else f" {'':>7}"
    return line


def _format_row_with_gradient(row: pd.Series, max_abs: float) -> str:
    line = f"{str(row['Date']):<12} {row['Type']:<10}"
    for hour in HOURS:
        value = row.get(f"HE{hour}")
        if pd.notna(value):
            line += _wrap_gradient(f" {value:>+6.1f}", float(value), max_abs)
        else:
            line += f" {'':>6}"
    for column in ("OnPeak", "OffPeak", "Flat"):
        value = row.get(column)
        if pd.notna(value):
            line += _wrap_gradient(f" {value:>+7.2f}", float(value), max_abs)
        else:
            line += f" {'':>7}"
    return line


def print_config(
    target_date: date,
    hub: str,
    lead_days: int | None,
    det_exec: pd.Timestamp | None,
    ens_exec: pd.Timestamp | None,
) -> None:
    print_section("Forecast Configuration")
    print(f"  Target           {target_date}")
    print(f"  Hub              {hub}")
    vintage = (
        "DA-cutoff (lead_days=1)"
        if lead_days == 1
        else ("all vintages" if lead_days is None else f"lead_days={lead_days}")
    )
    print(f"  Vintage          {vintage}")
    det_value = det_exec.strftime("%Y-%m-%d %H:%M") if det_exec is not None else "-"
    ens_value = ens_exec.strftime("%Y-%m-%d %H:%M") if ens_exec is not None else "-"
    print(f"  Det executed     {det_value}")
    print(f"  ENS executed     {ens_value}")


def print_bands_section(
    target_date: date,
    bands_table: pd.DataFrame,
    dispersion_metrics: DispersionMetrics | None = None,
    *,
    title: str = "ENS Bands ($/MWh)",
) -> None:
    print_section(title)
    print(
        f"  {_DIM}Per-HE bands: ENS Bottom = min envelope across 51 ECMWF "
        f"members at that hour; ENS Top = max envelope; ENS Avg = ensemble "
        f"mean. Det is the deterministic ECMWF point forecast (separate run).{_RS}"
    )
    print()
    if bands_table.empty:
        print("  (no rows)")
        return

    _print_table_header()
    for _, row in bands_table.iterrows():
        line = _format_row(row, signed=False)
        style = _ROW_STYLES.get(str(row["Type"]))
        print(f"{style}{line}{_RS}" if style else line)
    print("-" * (len(HE_COLS) * 7 + 12 + 11 + 7 * 3))

    if dispersion_metrics is not None:
        print_dispersion_block(target_date, dispersion_metrics)


def print_dispersion_block(
    target_date: date,
    metrics: DispersionMetrics,
) -> None:
    rule_width = len(HE_COLS) * 7 + 12 + 11 + 7 * 3
    for label, values, he_format, block_format in (
        ("Width", metrics.width, "6.2f", "7.2f"),
        ("IQR", metrics.iqr, "6.2f", "7.2f"),
        ("Skew", metrics.skew, "+6.2f", "+7.2f"),
        (_delta_label(), metrics.delta_p50, "+6.2f", "+7.2f"),
    ):
        finite = values[np.isfinite(values)] if len(values) else np.array([])
        max_abs = float(max(abs(finite.min()), abs(finite.max()))) if len(finite) else 0.0
        line = f"{str(target_date):<12} {label:<10}"
        for hour_index in range(24):
            value = values[hour_index] if hour_index < len(values) else np.nan
            if np.isfinite(value):
                line += _wrap_gradient(f" {value:>{he_format}}", float(value), max_abs)
            else:
                line += f" {'':>6}"
        for hours in (ONPEAK_HOURS, OFFPEAK_HOURS, HOURS):
            block = [values[hour - 1] for hour in hours if np.isfinite(values[hour - 1])]
            if block:
                mean = float(np.mean(block))
                line += _wrap_gradient(f" {mean:>{block_format}}", mean, max_abs)
            else:
                line += f" {'':>7}"
        print(line)
    print("-" * rule_width)


def print_forecast_vs_actuals_section(
    target_date: date,
    table: pd.DataFrame,
) -> None:
    print_section("Forecast vs Actuals")
    if table.empty:
        print(f"  {_DIM}(no settled DA LMP for the target date - skipping){_RS}")
        return

    _print_table_header()
    error_row = table[table["Type"] == "Error"]
    abs_error_row = table[table["Type"] == "|Err|"]
    mape_row = table[table["Type"] == "MAPE %"]
    error_max = _max_abs(error_row)
    abs_error_max = _max_abs(abs_error_row)
    mape_max = _max_abs(mape_row)

    for _, row in table.iterrows():
        label = str(row["Type"])
        if label == "Error":
            line = _format_row_with_gradient(row, error_max)
        elif label == "|Err|":
            line = _format_abs_like_row(row, abs_error_max, suffix="")
        elif label == "MAPE %":
            line = _format_abs_like_row(row, mape_max, suffix="%")
        else:
            line = _format_row(row, signed=False)
            style = _ROW_STYLES.get("Actual" if label == "Actual" else "Det")
            if style:
                line = f"{style}{line}{_RS}"
        print(line)
    print("-" * (len(HE_COLS) * 7 + 12 + 11 + 7 * 3))
    _print_rmse_footer(target_date, table)


def _format_abs_like_row(row: pd.Series, max_abs: float, *, suffix: str) -> str:
    line = f"{str(row['Date']):<12} {row['Type']:<10}"
    for hour in HOURS:
        value = row.get(f"HE{hour}")
        if pd.notna(value):
            raw = f" {value:>5.1f}{suffix}" if suffix else f" {value:>6.1f}"
            line += _wrap_gradient(raw, float(value), max_abs)
        else:
            line += f" {'':>6}"
    for column in ("OnPeak", "OffPeak", "Flat"):
        value = row.get(column)
        if pd.notna(value):
            raw = f" {value:>6.1f}{suffix}" if suffix else f" {value:>7.2f}"
            line += _wrap_gradient(raw, float(value), max_abs)
        else:
            line += f" {'':>7}"
    return line


def _max_abs(rows: pd.DataFrame) -> float:
    if rows.empty:
        return 0.0
    values = rows[list(HE_COLS)].to_numpy(dtype=float).ravel()
    finite = values[np.isfinite(values)]
    return float(np.max(np.abs(finite))) if len(finite) else 0.0


def _print_rmse_footer(target_date: date, table: pd.DataFrame) -> None:
    actual = table[table["Type"] == "Actual"]
    forecast = table[table["Type"] == "Forecast"]
    if actual.empty or forecast.empty:
        return
    actual_values = np.array(
        [actual.iloc[0].get(f"HE{hour}", np.nan) for hour in HOURS],
        dtype=float,
    )
    forecast_values = np.array(
        [forecast.iloc[0].get(f"HE{hour}", np.nan) for hour in HOURS],
        dtype=float,
    )
    parts = []
    for label, hours in (
        ("OnPeak", ONPEAK_HOURS),
        ("OffPeak", OFFPEAK_HOURS),
        ("Flat", HOURS),
    ):
        idx = [hour - 1 for hour in hours]
        mask = np.isfinite(actual_values[idx]) & np.isfinite(forecast_values[idx])
        if np.any(mask):
            errors = forecast_values[idx][mask] - actual_values[idx][mask]
            parts.append(f"{label}={float(np.sqrt(np.mean(errors * errors))):.2f}")
    if parts:
        print(f"  RMSE {target_date}: {'   '.join(parts)}")


def print_bands_vs_actuals_section(
    target_date: date,
    table: pd.DataFrame,
) -> None:
    print_section("ENS Bands vs Actuals")
    if table.empty:
        print(f"  {_DIM}(no settled DA LMP for the target date - skipping){_RS}")
        return

    _print_table_header()
    crps_row = table[table["Type"] == "CRPS"]
    crps_max = _max_abs(crps_row)
    for _, row in table.iterrows():
        label = str(row["Type"])
        if label == "InBand":
            line = _format_inband_row(row)
        elif label == "CRPS":
            line = _format_crps_row(row, crps_max)
        else:
            line = _format_row(row, signed=False)
            style = _ROW_STYLES.get(label)
            if style:
                line = f"{style}{line}{_RS}"
        print(line)
    print("-" * (len(HE_COLS) * 7 + 12 + 11 + 7 * 3))


def _format_inband_row(row: pd.Series) -> str:
    line = f"{str(row['Date']):<12} {row['Type']:<10}"
    for hour in HOURS:
        value = row.get(f"HE{hour}")
        cell = "" if value is None or (isinstance(value, float) and pd.isna(value)) else str(value)
        line += f" {cell:>6}"
    for column in ("OnPeak", "OffPeak", "Flat"):
        value = row.get(column)
        cell = "" if value is None else str(value)
        line += f" {cell:>7}"
    return line


def _format_crps_row(row: pd.Series, max_abs: float) -> str:
    line = f"{str(row['Date']):<12} {row['Type']:<10}"
    for hour in HOURS:
        value = row.get(f"HE{hour}")
        if value is not None and not pd.isna(value):
            line += _wrap_gradient(f" {float(value):>6.3f}", float(value), max_abs)
        else:
            line += f" {'':>6}"
    for column in ("OnPeak", "OffPeak", "Flat"):
        value = row.get(column)
        if value is not None and not pd.isna(value):
            line += _wrap_gradient(f" {float(value):>7.3f}", float(value), max_abs)
        else:
            line += f" {'':>7}"
    return line
