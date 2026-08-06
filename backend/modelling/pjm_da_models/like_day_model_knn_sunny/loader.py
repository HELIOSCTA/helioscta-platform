"""Backend SQL loaders for the KNN Sunny model family."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

import numpy as np
import pandas as pd

from . import calendar as sunny_calendar
from . import configs, domains
from ..runtime import (
    coerce_date as _coerce_date,
    default_cutoff_utc,
    load_sql_input_frame,
    normalize_daily as _normalize_daily,
    normalize_hourly as _normalize_hourly,
    today_ept,
)


def _empty_hourly(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=["date", "hour_ending", *columns])


def load_lmp_history(
    *,
    start_date: date | str,
    end_date: date | str,
    hub: str = configs.HUB,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "actual_da_lmps_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "hub": hub,
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=("lmp", "lmp_system_energy_price"),
    )


def load_actual_da_lmps(
    *,
    target_date: date | str,
    hub: str = configs.HUB,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "actual_da_lmps_hourly.sql",
        {
            "target_date": _coerce_date(target_date),
            "hub": hub,
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=("lmp", "lmp_system_energy_price"),
    )


def actuals_hourly(actuals: pd.DataFrame) -> dict[int, float] | None:
    if actuals.empty or not {"hour_ending", "lmp"}.issubset(actuals.columns):
        return None
    output: dict[int, float] = {}
    for row in actuals.itertuples(index=False):
        value = getattr(row, "lmp", None)
        if pd.notna(value):
            output[int(getattr(row, "hour_ending"))] = float(value)
    return output or None


def actuals_by_date_hour(actuals: pd.DataFrame) -> dict[date, dict[int, float]]:
    if actuals.empty or not {"date", "hour_ending", "lmp"}.issubset(actuals.columns):
        return {}
    output: dict[date, dict[int, float]] = {}
    dates = pd.to_datetime(actuals["date"], errors="coerce").dt.date
    for row, resolved_date in zip(actuals.itertuples(index=False), dates):
        if pd.isna(resolved_date):
            continue
        value = getattr(row, "lmp", None)
        if pd.notna(value):
            output.setdefault(resolved_date, {})[
                int(getattr(row, "hour_ending"))
            ] = float(value)
    return output


def apply_label_source(
    labels: pd.DataFrame,
    label_source: str = configs.LABEL_SOURCE,
) -> pd.DataFrame:
    output = labels.copy()
    if output.empty or label_source == "hub_lmp":
        return output
    if label_source == "system_energy":
        if "lmp_system_energy_price" not in output.columns:
            raise KeyError(
                "label_source='system_energy' requires "
                "lmp_system_energy_price in the LMP frame."
            )
        output["lmp"] = pd.to_numeric(
            output["lmp_system_energy_price"],
            errors="coerce",
        )
        return output
    raise ValueError(f"Unknown label_source: {label_source!r}")


def load_rto_load_history(
    *,
    start_date: date | str,
    end_date: date | str,
    load_region: str = configs.LOAD_REGION,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "rto_load_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "load_region": load_region,
        },
    )
    return _normalize_hourly(rows, numeric_columns=("load_mw_at_hour",))


def load_rto_load_forecast_history(
    *,
    start_date: date | str,
    end_date: date | str,
    load_region: str = configs.LOAD_REGION,
    lead_days: int = 1,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "rto_load_forecast_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "load_region": load_region,
            "lead_days": int(lead_days),
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=("forecast_load_mw", "load_mw_at_hour"),
    )


def load_rto_load_latest_forecast(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_utc: str | None = None,
    run_date: date | str | None = None,
    load_region: str = configs.LOAD_REGION,
) -> pd.DataFrame:
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(resolved_run_date)
    rows = load_sql_input_frame(
        "rto_load_latest_forecast_hourly.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "cutoff_utc": resolved_cutoff_utc,
            "load_region": load_region,
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=("forecast_load_mw", "load_mw_at_hour"),
    )


def load_renewables_history(
    *,
    start_date: date | str,
    end_date: date | str,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "renewables_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
        },
    )
    pjm = _normalize_hourly(
        rows,
        numeric_columns=(
            "solar_pjm_forecast_at_hour",
            "wind_pjm_forecast_at_hour",
            "solar_actual_at_hour",
            "wind_actual_at_hour",
            "solar_at_hour",
            "wind_at_hour",
        ),
    )
    meteo = load_meteologica_rto_forecast_history(
        start_date=start_date,
        end_date=end_date,
    )
    if meteo.empty:
        return pjm

    meteo = meteo[
        ["date", "hour_ending", "solar_at_hour", "wind_at_hour"]
    ].rename(
        columns={
            "solar_at_hour": "solar_meteo_forecast_at_hour",
            "wind_at_hour": "wind_meteo_forecast_at_hour",
        }
    )
    output = _merge_hourly_frames([pjm, meteo])
    for source, target in (("solar", "solar_at_hour"), ("wind", "wind_at_hour")):
        pjm_forecast = f"{source}_pjm_forecast_at_hour"
        meteo_forecast = f"{source}_meteo_forecast_at_hour"
        actual = f"{source}_actual_at_hour"
        if pjm_forecast in output.columns:
            output[target] = pd.to_numeric(output[pjm_forecast], errors="coerce")
            if meteo_forecast in output.columns:
                output[target] = output[target].combine_first(
                    pd.to_numeric(output[meteo_forecast], errors="coerce")
                )
            if actual in output.columns:
                output[target] = output[target].combine_first(
                    pd.to_numeric(output[actual], errors="coerce")
                )
        elif meteo_forecast in output.columns:
            if target not in output.columns:
                output[target] = np.nan
            output[target] = pd.to_numeric(output[target], errors="coerce")
            output[target] = output[target].combine_first(
                pd.to_numeric(output[meteo_forecast], errors="coerce")
            )
    return _normalize_hourly(
        output,
        numeric_columns=("solar_at_hour", "wind_at_hour"),
    )


def load_renewables_pjm_forecast_history(
    *,
    start_date: date | str,
    end_date: date | str,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "renewables_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=(
            "solar_pjm_forecast_at_hour",
            "wind_pjm_forecast_at_hour",
        ),
    )


def load_renewables_latest_forecast(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_utc: str | None = None,
    run_date: date | str | None = None,
) -> pd.DataFrame:
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(resolved_run_date)
    rows = load_sql_input_frame(
        "renewables_latest_forecast_hourly.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "cutoff_utc": resolved_cutoff_utc,
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=("solar_at_hour", "wind_at_hour"),
    )


def load_gen_outages_history(
    *,
    start_date: date | str,
    end_date: date | str,
    region: str = configs.LOAD_REGION,
    lead_days: int = 1,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "gen_outages_daily_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "region": region,
            "lead_days": int(lead_days),
        },
    )
    return _normalize_daily(rows, numeric_columns=("outage_total_mw",))


def load_gen_outages_latest_forecast(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_date: date | str | None = None,
    region: str = configs.LOAD_REGION,
) -> pd.DataFrame:
    resolved_cutoff_date = _coerce_date(cutoff_date) if cutoff_date else today_ept()
    rows = load_sql_input_frame(
        "gen_outages_daily_latest_forecast.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "cutoff_date": resolved_cutoff_date,
            "region": region,
        },
    )
    return _normalize_daily(rows, numeric_columns=("outage_total_mw",))


def load_meteologica_rto_latest_forecast(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_utc: str | None = None,
    region: str = configs.METEO_REGION,
    forecast_area: str = configs.METEO_FORECAST_AREA,
) -> pd.DataFrame:
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc()
    rows = load_sql_input_frame(
        "meteo_pjm_rto_latest_forecast_hourly.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "cutoff_utc": resolved_cutoff_utc,
            "region": region,
            "forecast_area": forecast_area,
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=(
            "load_mw_at_hour",
            "solar_at_hour",
            "wind_at_hour",
            "net_load_at_hour",
        ),
    )


def load_meteologica_rto_forecast_history(
    *,
    start_date: date | str,
    end_date: date | str,
    region: str = configs.METEO_REGION,
    forecast_area: str = configs.METEO_FORECAST_AREA,
    lead_days: int = 1,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "meteo_pjm_rto_forecast_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "region": region,
            "forecast_area": forecast_area,
            "lead_days": int(lead_days),
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=(
            "load_mw_at_hour",
            "solar_at_hour",
            "wind_at_hour",
            "net_load_at_hour",
        ),
    )


def load_wsi_temperature_history(
    *,
    start_date: date | str,
    end_date: date | str,
    region: str = configs.WEATHER_REGION,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "wsi_temperature_hourly_history.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "region": region,
        },
    )
    return _normalize_hourly(rows, numeric_columns=("temp_at_hour",))


def load_wsi_temperature_coalesced(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_utc: str | None = None,
    run_date: date | str | None = None,
    region: str = configs.WEATHER_REGION,
) -> pd.DataFrame:
    observed = load_wsi_temperature_history(
        start_date=start_date,
        end_date=end_date,
        region=region,
    )
    forecast = load_wsi_temperature_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_utc=cutoff_utc or default_cutoff_utc(run_date),
        region=region,
    )
    if observed.empty:
        return forecast
    if forecast.empty:
        return observed

    observed_counts = observed.groupby("date")["hour_ending"].nunique()
    observed_covered_dates = set(observed_counts[observed_counts >= 24].index)
    observed_kept = observed[observed["date"].isin(observed_covered_dates)]
    forecast_fallback = forecast[~forecast["date"].isin(observed_covered_dates)]
    return _normalize_hourly(
        pd.concat([observed_kept, forecast_fallback], ignore_index=True),
        numeric_columns=("temp_at_hour",),
    )


def load_wsi_temperature_latest_forecast(
    *,
    start_date: date | str,
    end_date: date | str,
    cutoff_utc: str | None = None,
    region: str = configs.WEATHER_REGION,
) -> pd.DataFrame:
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc()
    rows = load_sql_input_frame(
        "wsi_temperature_hourly_latest_forecast.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
            "cutoff_utc": resolved_cutoff_utc,
            "region": region,
        },
    )
    return _normalize_hourly(rows, numeric_columns=("temp_at_hour",))


def load_gas_prices_hourly(
    *,
    start_date: date | str,
    end_date: date | str,
) -> pd.DataFrame:
    rows = load_sql_input_frame(
        "ice_python_next_day_gas_hourly.sql",
        {
            "start_date": _coerce_date(start_date),
            "end_date": _coerce_date(end_date),
        },
    )
    return _normalize_hourly(
        rows,
        numeric_columns=(
            "gas_henry_hub",
            "gas_m3",
            "gas_tco",
            "gas_tz6",
            "gas_dom_south",
        ),
    )


def load_gas_daily(
    *,
    start_date: date | str,
    end_date: date | str,
) -> pd.DataFrame:
    hourly = load_gas_prices_hourly(start_date=start_date, end_date=end_date)
    if hourly.empty or "gas_m3" not in hourly.columns:
        return pd.DataFrame(columns=["date", "gas_m3_daily_avg"])
    daily = (
        hourly.dropna(subset=["gas_m3"])
        .groupby("date", as_index=False)
        .agg(gas_m3_daily_avg=("gas_m3", "mean"))
    )
    return _normalize_daily(daily, numeric_columns=("gas_m3_daily_avg",))


def _merge_hourly_frames(frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    merged: pd.DataFrame | None = None
    for frame in frames:
        if frame is None or frame.empty:
            continue
        deduped = frame.drop_duplicates(subset=["date", "hour_ending"], keep="last")
        if merged is None:
            merged = deduped.copy()
        else:
            merged = merged.merge(
                deduped,
                on=["date", "hour_ending"],
                how="outer",
                suffixes=("", "_drop"),
            )
            drop_columns = [c for c in merged.columns if c.endswith("_drop")]
            if drop_columns:
                merged = merged.drop(columns=drop_columns)
    if merged is None:
        return _empty_hourly([])
    return merged.sort_values(["date", "hour_ending"]).reset_index(drop=True)


def _fill_hourly_column(
    base: pd.DataFrame,
    fallback: pd.DataFrame,
    *,
    value_column: str,
    fallback_column: str | None = None,
) -> pd.DataFrame:
    if fallback.empty:
        return base
    source_column = fallback_column or value_column
    if source_column not in fallback.columns:
        return base
    fb = fallback[["date", "hour_ending", source_column]].rename(
        columns={source_column: f"_{value_column}_fallback"}
    )
    output = _merge_hourly_frames([base, fb])
    if value_column not in output.columns:
        output[value_column] = np.nan
    output[value_column] = pd.to_numeric(output[value_column], errors="coerce")
    output[value_column] = output[value_column].combine_first(
        pd.to_numeric(output[f"_{value_column}_fallback"], errors="coerce")
    )
    return output.drop(columns=[f"_{value_column}_fallback"])


def _numeric_column(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index)
    return pd.to_numeric(frame[column], errors="coerce")


def add_load_ramps(frame: pd.DataFrame) -> pd.DataFrame:
    output = frame.copy().sort_values(["date", "hour_ending"]).reset_index(drop=True)
    if "load_mw_at_hour" not in output.columns:
        output["load_ramp_1h_at_hour"] = np.nan
        output["load_ramp_3h_at_hour"] = np.nan
        return output
    source = pd.to_numeric(output["load_mw_at_hour"], errors="coerce").to_numpy(dtype=float)
    shift1 = np.concatenate(([np.nan], source[:-1]))
    shift3 = np.concatenate(([np.nan, np.nan, np.nan], source[:-3]))
    output["load_ramp_1h_at_hour"] = source - shift1
    output["load_ramp_3h_at_hour"] = source - shift3
    return output


def attach_calendar(frame: pd.DataFrame) -> pd.DataFrame:
    output = frame.copy()
    if output.empty:
        for column in domains.CALENDAR_COLUMNS:
            output[column] = pd.Series(dtype=float)
        return output
    cal_rows = []
    for d in sorted(set(output["date"])):
        row = {"date": d}
        row.update(sunny_calendar.compute_sunny_calendar_row(d, is_nerc_holiday=False))
        cal_rows.append(row)
    cal = pd.DataFrame(cal_rows)
    return output.merge(cal, on="date", how="left")


def _broadcast_daily(frame: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    if daily.empty:
        return frame
    keep = [
        column
        for column in daily.columns
        if column in ("date", "outage_total_mw", "gas_m3_daily_avg")
    ]
    return frame.merge(daily[keep].drop_duplicates("date", keep="last"), on="date", how="left")


def build_pool_frame(
    *,
    run_date: date | str | None = None,
    history_days: int = configs.DEFAULT_HISTORY_DAYS,
    hub: str = configs.HUB,
    label_source: str = configs.LABEL_SOURCE,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
) -> pd.DataFrame:
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    end_date = resolved_run_date - timedelta(days=1)
    start_date = end_date - timedelta(days=max(1, int(history_days)) - 1)

    load = load_rto_load_history(
        start_date=start_date,
        end_date=end_date,
        load_region=load_region,
    )[["date", "hour_ending", "load_mw_at_hour"]]
    load_forecast = load_rto_load_forecast_history(
        start_date=start_date,
        end_date=end_date,
        load_region=load_region,
    )[["date", "hour_ending", "load_mw_at_hour"]]
    load = _fill_hourly_column(
        load,
        load_forecast,
        value_column="load_mw_at_hour",
    )
    renewables = load_renewables_history(
        start_date=start_date,
        end_date=end_date,
    )[["date", "hour_ending", "solar_at_hour", "wind_at_hour"]]
    temp = load_wsi_temperature_coalesced(
        start_date=start_date,
        end_date=end_date,
        run_date=resolved_run_date,
        region=weather_region,
    )[["date", "hour_ending", "temp_at_hour"]]
    labels = load_lmp_history(
        start_date=start_date,
        end_date=end_date,
        hub=hub,
    )[["date", "hour_ending", "lmp", "lmp_system_energy_price"]]
    labels = apply_label_source(labels, label_source)
    outages = load_gen_outages_history(
        start_date=start_date,
        end_date=end_date,
        region=load_region,
    )
    gas = load_gas_daily(
        start_date=start_date,
        end_date=end_date,
    )

    pool = _merge_hourly_frames([load, renewables, temp, labels])
    pool = add_load_ramps(pool)
    if "net_load_at_hour" not in pool.columns:
        pool["net_load_at_hour"] = (
            _numeric_column(pool, "load_mw_at_hour")
            - _numeric_column(pool, "solar_at_hour").fillna(0.0)
            - _numeric_column(pool, "wind_at_hour").fillna(0.0)
        )
    pool = _broadcast_daily(pool, outages)
    pool = _broadcast_daily(pool, gas)
    if "outage_total_mw" not in pool.columns:
        pool["outage_total_mw"] = np.nan
    if "gas_m3_daily_avg" not in pool.columns:
        pool["gas_m3_daily_avg"] = np.nan
    pool = attach_calendar(pool)
    return _ensure_model_columns(pool, include_lmp=True)


def _outages_for_dates(
    *,
    target_dates: list[date],
    run_date: date,
    load_region: str,
) -> pd.DataFrame:
    if not target_dates:
        return pd.DataFrame(columns=["date", "outage_total_mw"])
    start_date = min(target_dates)
    end_date = max(target_dates)
    forecast = load_gen_outages_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_date=run_date,
        region=load_region,
    )
    seed = load_gen_outages_history(
        start_date=start_date - timedelta(days=30),
        end_date=start_date - timedelta(days=1),
        region=load_region,
    )
    daily = pd.concat(
        [
            seed[["date", "outage_total_mw"]] if not seed.empty else pd.DataFrame(),
            forecast[["date", "outage_total_mw"]] if not forecast.empty else pd.DataFrame(),
        ],
        ignore_index=True,
    )
    daily = _normalize_daily(daily, numeric_columns=("outage_total_mw",))
    rows: list[dict[str, object]] = []
    for d in target_dates:
        value = np.nan
        if not daily.empty:
            sub = daily[daily["date"] <= d].dropna(subset=["outage_total_mw"])
            if not sub.empty:
                value = float(sub.iloc[-1]["outage_total_mw"])
        rows.append({"date": d, "outage_total_mw": value})
    return pd.DataFrame(rows)


def _pjm_old_semantics_load_for_dates(
    *,
    target_dates: list[date],
    load_region: str,
) -> pd.DataFrame:
    if not target_dates:
        return _empty_hourly(["load_mw_at_hour"])
    start_date = min(target_dates)
    end_date = max(target_dates)
    forecast = load_rto_load_forecast_history(
        start_date=start_date,
        end_date=end_date,
        load_region=load_region,
        lead_days=1,
    )
    realized: pd.DataFrame | None = None
    frames: list[pd.DataFrame] = []
    for target_date in target_dates:
        forecast_slice = (
            forecast[forecast["date"] == target_date] if not forecast.empty else forecast
        )
        if not forecast_slice.empty:
            frames.append(
                forecast_slice[["date", "hour_ending", "load_mw_at_hour"]]
            )
            continue
        if realized is None:
            realized = load_rto_load_history(
                start_date=start_date,
                end_date=end_date,
                load_region=load_region,
            )
        realized_slice = (
            realized[realized["date"] == target_date] if not realized.empty else realized
        )
        if not realized_slice.empty:
            frames.append(
                realized_slice[["date", "hour_ending", "load_mw_at_hour"]]
            )
    if not frames:
        return _empty_hourly(["load_mw_at_hour"])
    return _normalize_hourly(
        pd.concat(frames, ignore_index=True),
        numeric_columns=("load_mw_at_hour",),
    )


def _pjm_old_semantics_renewables_for_dates(
    *,
    start_date: date,
    end_date: date,
    meteo_region: str,
    meteo_forecast_area: str,
) -> pd.DataFrame:
    pjm = load_renewables_pjm_forecast_history(
        start_date=start_date,
        end_date=end_date,
    )
    if pjm.empty:
        renewables = _empty_hourly(["solar_at_hour", "wind_at_hour"])
    else:
        renewables = pjm[
            [
                "date",
                "hour_ending",
                "solar_pjm_forecast_at_hour",
                "wind_pjm_forecast_at_hour",
            ]
        ].rename(
            columns={
                "solar_pjm_forecast_at_hour": "solar_at_hour",
                "wind_pjm_forecast_at_hour": "wind_at_hour",
            }
        )

    meteo = load_meteologica_rto_forecast_history(
        start_date=start_date,
        end_date=end_date,
        region=meteo_region,
        forecast_area=meteo_forecast_area,
        lead_days=1,
    )
    if not meteo.empty:
        meteo = meteo[["date", "hour_ending", "solar_at_hour", "wind_at_hour"]]
        renewables = _fill_hourly_column(
            renewables,
            meteo,
            value_column="solar_at_hour",
        )
        renewables = _fill_hourly_column(
            renewables,
            meteo,
            value_column="wind_at_hour",
        )
    return _normalize_hourly(
        renewables,
        numeric_columns=("solar_at_hour", "wind_at_hour"),
    )


def _pjm_old_semantics_outages_for_dates(
    *,
    target_dates: list[date],
    load_region: str,
) -> pd.DataFrame:
    if not target_dates:
        return pd.DataFrame(columns=["date", "outage_total_mw"])
    start_date = min(target_dates)
    end_date = max(target_dates)
    daily = load_gen_outages_history(
        start_date=start_date,
        end_date=end_date,
        region=load_region,
        lead_days=1,
    )
    rows: list[dict[str, object]] = []
    for target_date in target_dates:
        value = np.nan
        if not daily.empty:
            sub = daily[daily["date"] == target_date].dropna(subset=["outage_total_mw"])
            if not sub.empty:
                value = float(sub.iloc[0]["outage_total_mw"])
        rows.append({"date": target_date, "outage_total_mw": value})
    return pd.DataFrame(rows)


def build_pjm_query_frames(
    *,
    target_dates: Iterable[date | str],
    run_date: date | str | None = None,
    cutoff_utc: str | None = None,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
    meteo_region: str = configs.METEO_REGION,
    meteo_forecast_area: str = configs.METEO_FORECAST_AREA,
) -> dict[date, pd.DataFrame]:
    resolved_dates = sorted({_coerce_date(value) for value in target_dates})
    if not resolved_dates:
        return {}
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(resolved_run_date)
    start_date = min(resolved_dates)
    end_date = max(resolved_dates)

    base = pd.DataFrame(
        [
            {"date": target_date, "hour_ending": hour}
            for target_date in resolved_dates
            for hour in configs.HOURS
        ]
    )
    load = _pjm_old_semantics_load_for_dates(
        target_dates=resolved_dates,
        load_region=load_region,
    )[["date", "hour_ending", "load_mw_at_hour"]]
    renewables = _pjm_old_semantics_renewables_for_dates(
        start_date=start_date,
        end_date=end_date,
        meteo_region=meteo_region,
        meteo_forecast_area=meteo_forecast_area,
    )[["date", "hour_ending", "solar_at_hour", "wind_at_hour"]]

    temp = load_wsi_temperature_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_utc=resolved_cutoff_utc,
        region=weather_region,
    )
    observed_temp = load_wsi_temperature_history(
        start_date=start_date,
        end_date=end_date,
        region=weather_region,
    )
    temp = _fill_hourly_column(
        temp,
        observed_temp,
        value_column="temp_at_hour",
    )[["date", "hour_ending", "temp_at_hour"]]

    hourly = _merge_hourly_frames([base, load, renewables, temp])

    prev_load = load_rto_load_history(
        start_date=start_date - timedelta(days=1),
        end_date=start_date - timedelta(days=1),
        load_region=load_region,
    )[["date", "hour_ending", "load_mw_at_hour"]]
    ramp_parts: list[pd.DataFrame] = []
    if not prev_load.empty:
        ramp_parts.append(prev_load)
    query_load = hourly[["date", "hour_ending"]].copy()
    query_load["load_mw_at_hour"] = _numeric_column(hourly, "load_mw_at_hour")
    ramp_parts.append(query_load)
    ramp_source = (
        pd.concat(ramp_parts, ignore_index=True)
        if ramp_parts
        else pd.DataFrame(columns=["date", "hour_ending", "load_mw_at_hour"])
    )
    ramps = add_load_ramps(ramp_source)
    ramps = ramps[ramps["date"].isin(resolved_dates)][
        ["date", "hour_ending", "load_ramp_1h_at_hour", "load_ramp_3h_at_hour"]
    ]
    hourly = hourly.drop(
        columns=[
            column
            for column in ("load_ramp_1h_at_hour", "load_ramp_3h_at_hour")
            if column in hourly.columns
        ]
    ).merge(ramps, on=["date", "hour_ending"], how="left")

    if "net_load_at_hour" not in hourly.columns:
        hourly["net_load_at_hour"] = (
            _numeric_column(hourly, "load_mw_at_hour")
            - _numeric_column(hourly, "solar_at_hour").fillna(0.0)
            - _numeric_column(hourly, "wind_at_hour").fillna(0.0)
        )
    outages = _pjm_old_semantics_outages_for_dates(
        target_dates=resolved_dates,
        load_region=load_region,
    )
    gas = load_gas_daily(
        start_date=start_date,
        end_date=end_date,
    )
    hourly = _broadcast_daily(hourly, outages)
    hourly = _broadcast_daily(hourly, gas)
    if "gas_m3_daily_avg" not in hourly.columns:
        hourly["gas_m3_daily_avg"] = np.nan
    hourly = attach_calendar(hourly)
    hourly = _ensure_model_columns(hourly, include_lmp=False)

    out: dict[date, pd.DataFrame] = {}
    for target_date in resolved_dates:
        out[target_date] = (
            hourly[hourly["date"] == target_date]
            .sort_values("hour_ending")
            .reset_index(drop=True)
        )
    return out


def build_horizon_query_frames(
    *,
    target_dates: Iterable[date | str],
    run_date: date | str | None = None,
    cutoff_utc: str | None = None,
    load_region: str = configs.LOAD_REGION,
    weather_region: str = configs.WEATHER_REGION,
    meteo_region: str = configs.METEO_REGION,
    meteo_forecast_area: str = configs.METEO_FORECAST_AREA,
) -> dict[date, pd.DataFrame]:
    resolved_dates = sorted({_coerce_date(value) for value in target_dates})
    if not resolved_dates:
        return {}
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(resolved_run_date)
    start_date = min(resolved_dates)
    end_date = max(resolved_dates)

    base = pd.DataFrame(
        [
            {"date": target_date, "hour_ending": hour}
            for target_date in resolved_dates
            for hour in configs.HOURS
        ]
    )
    meteo = load_meteologica_rto_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_utc=resolved_cutoff_utc,
        region=meteo_region,
        forecast_area=meteo_forecast_area,
    )
    temp = load_wsi_temperature_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_utc=resolved_cutoff_utc,
        region=weather_region,
    )
    observed_temp = load_wsi_temperature_history(
        start_date=start_date,
        end_date=end_date,
        region=weather_region,
    )
    temp = _fill_hourly_column(
        temp,
        observed_temp,
        value_column="temp_at_hour",
    )

    hourly = _merge_hourly_frames([base, meteo, temp])

    prev_load = load_rto_load_history(
        start_date=start_date - timedelta(days=1),
        end_date=start_date - timedelta(days=1),
        load_region=load_region,
    )[["date", "hour_ending", "load_mw_at_hour"]]
    ramp_parts: list[pd.DataFrame] = []
    if not prev_load.empty:
        ramp_parts.append(prev_load)
    if "load_mw_at_hour" in hourly.columns:
        meteo_load = hourly[["date", "hour_ending", "load_mw_at_hour"]].dropna(
            subset=["load_mw_at_hour"],
            how="all",
        )
        if not meteo_load.empty:
            ramp_parts.append(meteo_load)
    ramp_source = (
        pd.concat(ramp_parts, ignore_index=True)
        if ramp_parts
        else pd.DataFrame(columns=["date", "hour_ending", "load_mw_at_hour"])
    )
    ramps = add_load_ramps(ramp_source)
    ramps = ramps[ramps["date"].isin(resolved_dates)][
        ["date", "hour_ending", "load_ramp_1h_at_hour", "load_ramp_3h_at_hour"]
    ]
    hourly = hourly.drop(
        columns=[
            column
            for column in ("load_ramp_1h_at_hour", "load_ramp_3h_at_hour")
            if column in hourly.columns
        ]
    ).merge(ramps, on=["date", "hour_ending"], how="left")

    outages = _outages_for_dates(
        target_dates=resolved_dates,
        run_date=resolved_run_date,
        load_region=load_region,
    )
    gas = load_gas_daily(
        start_date=start_date,
        end_date=end_date,
    )
    hourly = _broadcast_daily(hourly, outages)
    hourly = _broadcast_daily(hourly, gas)
    if "gas_m3_daily_avg" not in hourly.columns:
        hourly["gas_m3_daily_avg"] = np.nan
    hourly = attach_calendar(hourly)
    hourly = _ensure_model_columns(hourly, include_lmp=False)

    out: dict[date, pd.DataFrame] = {}
    for target_date in resolved_dates:
        out[target_date] = (
            hourly[hourly["date"] == target_date]
            .sort_values("hour_ending")
            .reset_index(drop=True)
        )
    return out


def available_target_dates(
    *,
    run_date: date | str | None = None,
    horizon_days: int | None = None,
    cutoff_utc: str | None = None,
    meteo_region: str = configs.METEO_REGION,
    meteo_forecast_area: str = configs.METEO_FORECAST_AREA,
) -> list[date]:
    resolved_run_date = _coerce_date(run_date) if run_date else today_ept()
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(resolved_run_date)
    start_date = resolved_run_date + timedelta(days=1)
    end_date = (
        resolved_run_date + timedelta(days=horizon_days)
        if horizon_days is not None
        else resolved_run_date + timedelta(days=60)
    )
    meteo = load_meteologica_rto_latest_forecast(
        start_date=start_date,
        end_date=end_date,
        cutoff_utc=resolved_cutoff_utc,
        region=meteo_region,
        forecast_area=meteo_forecast_area,
    )
    if meteo.empty:
        return []
    required = ["load_mw_at_hour", "solar_at_hour", "wind_at_hour", "net_load_at_hour"]
    coverage = (
        meteo.dropna(subset=required)
        .groupby("date", as_index=False)
        .agg(n_hours=("hour_ending", "nunique"))
    )
    dates = [
        row.date
        for row in coverage.itertuples(index=False)
        if int(row.n_hours) >= 24
    ]
    if horizon_days is not None:
        dates = dates[:horizon_days]
    return dates


def _ensure_model_columns(frame: pd.DataFrame, *, include_lmp: bool) -> pd.DataFrame:
    output = frame.copy()
    if "net_load_at_hour" not in output.columns:
        output["net_load_at_hour"] = np.nan
    for column in domains.MODEL_COLUMNS:
        if column not in output.columns:
            output[column] = np.nan
    keep = list(domains.MODEL_COLUMNS)
    if include_lmp:
        for column in ("lmp", "lmp_system_energy_price"):
            if column not in output.columns:
                output[column] = np.nan
        keep.extend(["lmp", "lmp_system_energy_price"])
    return (
        output[keep]
        .drop_duplicates(subset=["date", "hour_ending"], keep="last")
        .sort_values(["date", "hour_ending"])
        .reset_index(drop=True)
    )
