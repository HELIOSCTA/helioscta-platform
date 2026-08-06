"""Legacy-style terminal printers for PJM-backed KNN Sunny forecasts."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from ...logging_utils import (
    Colors,
    print_divider,
    print_header,
    print_section,
    supports_color,
)
from .. import configs, domains
from ..configs import KnnModelConfig, ModelSpec

_COLOR_ON = supports_color()
_HL_FORECAST = (Colors.BOLD + Colors.BRIGHT_RED) if _COLOR_ON else ""
_HL_QUARTILE = Colors.CYAN if _COLOR_ON else ""
_HL_INNER = Colors.YELLOW if _COLOR_ON else ""
_HL_UP = Colors.BRIGHT_GREEN if _COLOR_ON else ""
_HL_DOWN = Colors.BRIGHT_RED if _COLOR_ON else ""
_RS = Colors.RESET if _COLOR_ON else ""
_ROW_STYLES: dict[str, str] = {
    "Forecast": _HL_FORECAST,
    "P25": _HL_QUARTILE,
    "P75": _HL_QUARTILE,
    "P37.5": _HL_INNER,
    "P62.5": _HL_INNER,
}

DAY_ABBR: dict[int, str] = {
    0: "Mon",
    1: "Tue",
    2: "Wed",
    3: "Thu",
    4: "Fri",
    5: "Sat",
    6: "Sun",
}

_FEATURE_KEYS: tuple[str, ...] = (
    "da_onpk",
    "load",
    "temp",
    "solar",
    "wind",
    "outages",
    "m3",
)


def quantile_label(q: float) -> str:
    q_pct = q * 100
    if float(q_pct).is_integer():
        return f"P{int(q_pct):02d}"
    return f"P{q_pct:.1f}".rstrip("0").rstrip(".")


def _display_hub(hub: str) -> str:
    return hub.title() if hub.isupper() else hub


def _resolve_config(
    *,
    result: dict[str, object],
    target_date: date,
    hub: str,
) -> tuple[KnnModelConfig, str, ModelSpec]:
    config = result.get("config")
    if not isinstance(config, configs.KnnModelConfig):
        config = configs.KnnModelConfig(forecast_date=target_date.isoformat(), hub=hub)
    resolved_config, day_type = config.with_day_type_overrides(target_date)
    return resolved_config, day_type, resolved_config.resolved_spec()


def print_config(
    config: KnnModelConfig,
    spec: ModelSpec,
    target_date: date,
    day_type: str,
    effective_weights: dict[str, float] | None = None,
) -> None:
    """Forecast configuration block matching the legacy Sunny report."""
    target_dow = DAY_ABBR[target_date.weekday()]
    weights = (
        effective_weights
        if effective_weights is not None
        else spec.feature_group_weights
    )

    window = config.season_window_days
    win_start = target_date - timedelta(days=window)
    win_end = target_date + timedelta(days=window)

    print_header("FORECAST CONFIGURATION", "=", 90)

    print(f"\n  Target        {target_date} ({target_dow})")
    print(f"  Day-type      {day_type}")
    print(f"  Hub           {config.hub}")
    print(f"  Spec          {spec.name}")
    print(f"  Description   {spec.description}")

    half_life = config.recency_half_life_days
    if half_life is not None and float(half_life) > 0:
        weight_method = (
            "inverse_distance_sq * linear_age_penalty "
            f"(half-life={float(half_life):g}d)"
        )
    else:
        weight_method = "inverse_distance_sq"

    print_section("Analog Selection")
    print(f"  N analogs          {config.n_analogs}")
    print(f"  Weight method      {weight_method}")
    print(f"  Label source       {config.label_source}")

    print_section("Pre-Filtering")
    print(
        f"  Season window      +/-{window}d  "
        f"({win_start.strftime('%b %d')} - {win_end.strftime('%b %d')})"
    )
    print(f"  Same DOW group     {config.same_dow_group}  (exact day-of-week match)")
    print(
        f"  Same weekend grp   {config.same_weekend_group}  "
        f"(weekends_only={config.same_weekend_group_for_weekends})"
    )
    print(f"  Exclude holidays   {config.exclude_holidays}")
    if config.exclude_dates:
        print(f"  Exclude dates      {', '.join(config.exclude_dates)}")
    print(f"  Min pool size      {config.min_pool_size}")

    print_section("Recency")
    print(f"  Max age years      {getattr(config, 'max_age_years', None)}")
    print(f"  Half-life days     {config.recency_half_life_days}")

    raw_weights = spec.raw_feature_group_weights
    active = {k: v for k, v in sorted(weights.items()) if v > 0}
    disabled = [k for k, v in sorted(weights.items()) if v == 0]
    raw_for_print = {k: raw_weights.get(k, 0.0) for k in active}
    raw_total = sum(raw_for_print.values())
    locations = domains.feature_group_weight_locations()

    print_section("Feature Group Weights")
    print(f"  Spec: {configs.__file__}")
    loc_strs = {
        k: f"{locations[k][0]}:{locations[k][1]}" for k in active if k in locations
    }
    loc_w = max((len(s) for s in loc_strs.values()), default=0)
    bar_w = max((int(w * 40) for w in active.values()), default=0)
    print(
        f"  {'group':<32} {'raw':>6} {'norm':>6}  "
        f"{'bar':<{bar_w}}  {'defined at':<{loc_w}}"
    )
    for name, weight in sorted(active.items(), key=lambda x: -x[1]):
        bar = "#" * int(weight * 40)
        raw = raw_for_print.get(name, 0.0)
        loc_str = loc_strs.get(name, "-")
        print(
            f"  {name:<32} {raw:>6.3f} {weight:>6.3f}  "
            f"{bar:<{bar_w}}  {loc_str:<{loc_w}}"
        )
    print(f"  {'(sum)':<32} {raw_total:>6.3f} {1.0:>6.3f}")

    if disabled:
        print_section("Disabled Groups")
        print(f"  {', '.join(disabled)}")

    print()
    print_divider("=", 90, dim=False)


def print_pool_summary(
    pool: pd.DataFrame,
    analogs: pd.DataFrame,
    config: KnnModelConfig,
    target_date: date,
    day_type: str,
) -> None:
    """Pool summary block matching the legacy long-pool engine view."""
    target_dow = DAY_ABBR[target_date.weekday()]
    print_header("POOL SUMMARY", "=", 110)
    print(
        f"  Forecast: {target_date} ({target_dow})  |  Day-type: {day_type}  "
        f"|  Hub: {config.hub}"
    )
    print_divider("=", 110, dim=False)

    raw_dates = int(pool["date"].nunique()) if len(pool) else 0
    pre_target = pool[pool["date"] < target_date] if len(pool) else pool
    pre_target_dates = int(pre_target["date"].nunique()) if len(pre_target) else 0

    season = config.season_window_days
    if season > 0 and pre_target_dates > 0:
        target_doy = pd.Timestamp(target_date).dayofyear
        doy = pd.to_datetime(pre_target["date"]).dt.dayofyear.to_numpy(dtype=float)
        direct = np.abs(doy - float(target_doy))
        circ = np.minimum(direct, 366.0 - direct)
        season_mask = circ <= float(season)
        season_dates = int(pre_target.loc[season_mask, "date"].nunique())
    else:
        season_dates = pre_target_dates

    max_age_years = getattr(config, "max_age_years", None)
    if max_age_years is not None and max_age_years > 0:
        cutoff = pd.Timestamp(target_date) - pd.DateOffset(years=int(max_age_years))
        max_age_dates = int(
            pre_target[pd.to_datetime(pre_target["date"]) >= cutoff]["date"].nunique()
        )
    else:
        max_age_dates = pre_target_dates

    n_analog_dates = int(analogs["date"].nunique()) if len(analogs) else 0
    n_analog_rows = len(analogs) if analogs is not None else 0

    print()
    print(f"  {'Stage':<5}  {'Filter':<30}  {'Detail':<46}  {'Survives':>9}")
    print("  " + "-" * 100)
    rows = [
        ("0", "raw history", f"build_pool: {len(pool):,} rows", f"{raw_dates:,}"),
        (
            "1",
            "chronological cut",
            f"date < target ({target_date})",
            f"{pre_target_dates:,}",
        ),
        (
            "2",
            "season window",
            f"+/-{season}d (DOY circular)",
            f"{season_dates:,}",
        ),
    ]
    if max_age_years is not None and max_age_years > 0:
        rows.append(
            (
                "3",
                "recency cap",
                f"max_age={max_age_years}y",
                f"{max_age_dates:,}",
            )
        )
    for idx, name, detail, survives in rows:
        print(f"  {idx:<5}  {name:<30}  {detail[:46]:<46}  {survives:>9}")
    print("  " + "-" * 100)

    final_color = f"{Colors.BOLD}{Colors.BRIGHT_GREEN}" if _COLOR_ON else ""
    print(
        f"  -> per-HE ladder selected {final_color}{n_analog_dates}{_RS} "
        f"unique analog date(s) across {n_analog_rows} (HE x rank) rows"
    )

    if len(analogs) > 0:
        per_hour = analogs.groupby("hour_ending")["date"].nunique()
        print(
            f"  -> per HE: min={int(per_hour.min())} median={int(per_hour.median())} "
            f"max={int(per_hour.max())} unique dates"
        )

    print()
    print_divider("=", 110, dim=False)


def _daily_features_long(pool: pd.DataFrame) -> pd.DataFrame:
    """Per-date daily features from a long-format pool."""
    if pool is None or len(pool) == 0:
        return pd.DataFrame()
    grouped = pool.groupby("date", sort=True)
    onpk_mask = pool["hour_ending"].between(8, 23, inclusive="both")
    onpk = (
        pool[onpk_mask].groupby("date")["lmp"].mean()
        if "lmp" in pool.columns
        else pd.Series(dtype=float)
    )
    out = pd.DataFrame(
        {
            "da_onpk": onpk,
            "load": grouped["load_mw_at_hour"].max()
            if "load_mw_at_hour" in pool.columns
            else np.nan,
            "temp": grouped["temp_at_hour"].mean()
            if "temp_at_hour" in pool.columns
            else np.nan,
            "solar": grouped["solar_at_hour"].max()
            if "solar_at_hour" in pool.columns
            else np.nan,
            "wind": grouped["wind_at_hour"].max()
            if "wind_at_hour" in pool.columns
            else np.nan,
            "outages": grouped["outage_total_mw"].first()
            if "outage_total_mw" in pool.columns
            else np.nan,
            "m3": grouped["gas_m3_daily_avg"].first()
            if "gas_m3_daily_avg" in pool.columns
            else np.nan,
        }
    )
    return out


def _daily_features_from_query(query: pd.DataFrame) -> dict[str, float | None]:
    """Same daily features for the 24-row target query."""
    if query is None or len(query) == 0:
        return {k: None for k in _FEATURE_KEYS}

    def _max(col: str) -> float | None:
        if col not in query.columns:
            return None
        values = query[col].astype(float).dropna()
        return float(values.max()) if len(values) else None

    def _mean(col: str) -> float | None:
        if col not in query.columns:
            return None
        values = query[col].astype(float).dropna()
        return float(values.mean()) if len(values) else None

    def _scalar(col: str) -> float | None:
        if col not in query.columns:
            return None
        values = query[col].dropna()
        return float(values.iloc[0]) if len(values) else None

    return {
        "da_onpk": None,
        "load": _max("load_mw_at_hour"),
        "temp": _mean("temp_at_hour"),
        "solar": _max("solar_at_hour"),
        "wind": _max("wind_at_hour"),
        "outages": _scalar("outage_total_mw"),
        "m3": _scalar("gas_m3_daily_avg"),
    }


def _pool_feature_stds_long(pool: pd.DataFrame) -> dict[str, float]:
    daily = _daily_features_long(pool)
    out: dict[str, float] = {}
    for key in _FEATURE_KEYS:
        if key not in daily.columns:
            out[key] = 1.0
            continue
        std = float(np.nanstd(daily[key].to_numpy(dtype=float), ddof=0))
        out[key] = std if std > 0 and not np.isnan(std) else 1.0
    return out


def _scalar_feature_he_z(
    pool: pd.DataFrame,
    query: pd.DataFrame,
    feature_col: str,
) -> dict[date, list[float | None]]:
    """Per-HE z-distance for one scalar feature."""
    if (
        feature_col not in pool.columns
        or feature_col not in query.columns
        or len(query) == 0
    ):
        return {}

    out: dict[date, list[float | None]] = {}
    target_by_he = query.set_index("hour_ending")[feature_col].astype(float).to_dict()

    for hour in range(1, 25):
        slice_pool = pool[pool["hour_ending"] == hour]
        if len(slice_pool) == 0:
            continue
        values = slice_pool[feature_col].astype(float).to_numpy()
        std = float(np.nanstd(values)) if not np.all(np.isnan(values)) else 1.0
        if std == 0 or np.isnan(std):
            std = 1.0
        target_v = target_by_he.get(hour)
        if target_v is None or pd.isna(target_v):
            continue
        diffs = (values - float(target_v)) / std
        for pool_date, z_value in zip(slice_pool["date"].tolist(), diffs):
            arr = out.setdefault(pool_date, [None] * 24)
            arr[hour - 1] = None if np.isnan(z_value) else float(z_value)
    return out


def _shade_z(z: float | None) -> str:
    if z is None or (isinstance(z, float) and np.isnan(z)):
        return "\u00b7"
    abs_z = abs(float(z))
    if abs_z < 0.25:
        return "\u2588"
    if abs_z < 0.50:
        return "\u2593"
    if abs_z < 1.00:
        return "\u2592"
    if abs_z < 2.00:
        return "\u2591"
    return "\u00b7"


def _he_strip_for_date(date_analogs: pd.DataFrame) -> tuple[str, int]:
    by_he: dict[int, int] = {
        int(row["hour_ending"]): int(row["rank"])
        for _, row in date_analogs.iterrows()
    }
    chars: list[str] = []
    for hour in range(1, 25):
        if hour not in by_he:
            chars.append("\u00b7")
        else:
            rank = by_he[hour]
            chars.append("\u2588" if rank <= 5 else ("\u2593" if rank <= 15 else "\u2592"))
    return "".join(chars), len(by_he)


def _fmt_num(
    value: float | None, width: int, decimals: int = 0, comma: bool = False
) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return f"{'-':>{width}}"
    spec = f">{width},.{decimals}f" if comma else f">{width}.{decimals}f"
    return f"{value:{spec}}"


def _fmt_diff(
    diff: float | None,
    total_width: int,
    decimals: int = 0,
    comma: bool = False,
) -> str:
    if diff is None or (isinstance(diff, float) and pd.isna(diff)):
        return " " * total_width
    spec = f"+,.{decimals}f" if comma else f"+.{decimals}f"
    body = f"({diff:{spec}})".rjust(total_width)
    if diff > 0:
        return f"{_HL_UP}{body}{_RS}"
    if diff < 0:
        return f"{_HL_DOWN}{body}{_RS}"
    return body


def _fmt_sigma(z: float | None, width: int = 7) -> str:
    if z is None or (isinstance(z, float) and pd.isna(z)):
        return f"{'-':>{width}}"
    body = f"{z:+.2f}".rjust(width)
    if z > 0:
        return f"{_HL_UP}{body}{_RS}"
    if z < 0:
        return f"{_HL_DOWN}{body}{_RS}"
    return body


def _format_hour_block(hours: tuple[int, ...]) -> str:
    if hours == tuple(configs.ONPEAK_HOURS):
        return "OnPeak HE8-23"
    if hours == tuple(configs.OFFPEAK_HOURS):
        return "OffPeak HE1-7,24"
    if hours == tuple(range(1, 25)):
        return "all HE1-24"
    runs: list[str] = []
    start: int | None = None
    prev: int | None = None
    for hour in sorted(set(hours)):
        if start is None:
            start = prev = hour
            continue
        if prev is not None and hour == prev + 1:
            prev = hour
            continue
        runs.append(f"HE{start}" if start == prev else f"HE{start}-{prev}")
        start = prev = hour
    if start is not None:
        runs.append(f"HE{start}" if start == prev else f"HE{start}-{prev}")
    return ",".join(runs) if runs else "no hours"


def print_analog_features(
    analogs: pd.DataFrame,
    pool: pd.DataFrame,
    query: pd.DataFrame,
    target_date: date,
    hub: str,
    n_show: int = 20,
    rank_hours: tuple[int, ...] | list[int] | None = None,
) -> None:
    """Combined daily-features and engine-view table for the active config."""
    target_dow = DAY_ABBR[target_date.weekday()]
    print_header("LIKE-DAY ANALOGS - Daily Features + Engine View", "=", 230)
    print(f"  Forecast: {target_date} ({target_dow})  |  Hub: {hub}")
    print(
        "  Each cell: value  (raw diff)  sigma-gap   "
        "(GREEN = analog higher, RED = lower)   "
        "HE strip rank: full<=5  med<=15  light>15  dot=miss"
    )
    print(
        "  Per-feature sub-rows |z|-shading:  full<0.25  med<0.50  "
        "light<1.0  faint<2.0  dot>=2 or n/a"
    )
    print_divider("=", 230, dim=False)

    if analogs is None or len(analogs) == 0:
        print("\n  (no analogs returned)")
        return

    rank_hours_t = tuple(
        int(h) for h in (rank_hours if rank_hours is not None else configs.ANALOG_RANK_HOURS)
    )
    rank_hour_set = set(rank_hours_t)
    rank_label = _format_hour_block(rank_hours_t)
    rank_analogs = analogs[analogs["hour_ending"].astype(int).isin(rank_hour_set)]
    if len(rank_analogs) == 0:
        print(f"\n  (no analogs returned in ranking block: {rank_label})")
        return
    print(
        f"  Date rank / weight / weighted avg use {rank_label}; "
        "HE strip still shows all 24 selected hourly analog slots."
    )

    by_date = rank_analogs.groupby("date", as_index=False).agg(
        summed_weight=("weight", "sum"),
        mean_distance=("distance", "mean"),
    )
    total_w = float(by_date["summed_weight"].sum())
    if total_w <= 0:
        print("\n  (zero total weight)")
        return
    by_date["w"] = by_date["summed_weight"] / total_w
    by_date = by_date.sort_values("w", ascending=False).reset_index(drop=True)

    daily_pool = _daily_features_long(pool)
    rows_features: list[dict[str, object]] = []
    for idx, row in by_date.iterrows():
        pool_date = row["date"]
        if pool_date in daily_pool.index:
            feats = {
                key: float(daily_pool.loc[pool_date, key])
                if pd.notna(daily_pool.loc[pool_date, key])
                else None
                for key in _FEATURE_KEYS
            }
        else:
            feats = {key: None for key in _FEATURE_KEYS}
        feats["date"] = pool_date
        feats["rank"] = int(idx) + 1
        feats["mean_distance"] = float(row["mean_distance"])
        feats["summed_weight"] = float(row["summed_weight"])
        feats["w"] = float(row["w"])
        feats["rank_hours_count"] = int(
            rank_analogs.loc[
                rank_analogs["date"] == pool_date,
                "hour_ending",
            ].nunique()
        )
        rows_features.append(feats)

    avg: dict[str, float | None] = {}
    for key in _FEATURE_KEYS:
        wsum = 0.0
        wseen = 0.0
        for row in rows_features:
            if row[key] is not None:
                wsum += float(row[key]) * float(row["w"])
                wseen += float(row["w"])
        avg[key] = (wsum / wseen) if wseen > 0 else None

    target_feats = _daily_features_from_query(query)
    if target_feats["da_onpk"] is None and target_date in daily_pool.index:
        value = daily_pool.loc[target_date, "da_onpk"]
        target_feats["da_onpk"] = float(value) if pd.notna(value) else None

    stds = _pool_feature_stds_long(pool)

    cols = (
        ("da_onpk", "DA OnPk", "($/MWh)", 8, 8, 2, False),
        ("load", "Load", "(MW)", 9, 9, 0, True),
        ("temp", "Temp", "(F)", 7, 7, 1, False),
        ("solar", "Solar", "(MW)", 9, 9, 0, True),
        ("wind", "Wind", "(MW)", 9, 9, 0, True),
        ("outages", "Outages", "(MW)", 9, 9, 0, True),
        ("m3", "M3", "($)", 6, 7, 2, False),
    )
    sigma_w = 6

    prefix = f"  {'rank':>4} {'Like Date':<22} {'rank_d':>7} {'sum_w':>7} {'w':>6}"
    prefix_units = f"  {'':>4} {'':<22} {'':>7} {'':>7} {'':>6}"
    head_parts = [prefix]
    unit_parts = [prefix_units]
    for _, label, units, value_w, diff_w, _, _ in cols:
        cell_w = value_w + 1 + diff_w + 1 + sigma_w
        head_parts.append(f"{label:^{cell_w}}")
        unit_parts.append(f"{units:^{cell_w}}")
    head_parts.append(f"{'HEs':>4}")
    unit_parts.append(f"{('/' + str(len(rank_hour_set))):>4}")
    header = "  ".join(head_parts)
    units_row = "  ".join(unit_parts)
    sep = "-" * len(header)

    print()
    print(header)
    print(units_row)
    print(sep)

    def _fmt_row(
        rank_str: str,
        label: str,
        mean_d_str: str,
        sum_w_str: str,
        w_str: str,
        features: dict[str, object],
        target: dict[str, float | None] | None,
        n_hours_str: str,
    ) -> str:
        parts = [
            f"  {rank_str:>4} {label:<22} {mean_d_str:>7} "
            f"{sum_w_str:>7} {w_str:>6}"
        ]
        for key, _, _, value_w, diff_w, decimals, comma in cols:
            val = features.get(key)
            val_num = float(val) if val is not None and not pd.isna(val) else None
            val_str = _fmt_num(val_num, value_w, decimals, comma=comma)
            if target is None:
                diff_str = " " * diff_w
                sigma_str = f"{'ref':>{sigma_w}}"
            elif val_num is None or target[key] is None:
                diff_str = " " * diff_w
                sigma_str = f"{'-':>{sigma_w}}"
            else:
                diff = val_num - float(target[key])
                diff_str = _fmt_diff(diff, diff_w, decimals, comma=comma)
                z_value = diff / stds[key]
                sigma_str = _fmt_sigma(z_value, sigma_w)
            parts.append(f"{val_str} {diff_str} {sigma_str}")
        parts.append(f"{n_hours_str:>4}")
        return "  ".join(parts)

    sub_prefixes: tuple[str, ...] = ("load", "temp", "solar", "wind")
    sub_to_col = {
        "load": "load_mw_at_hour",
        "temp": "temp_at_hour",
        "solar": "solar_at_hour",
        "wind": "wind_at_hour",
    }
    sub_z_by_feat: dict[str, dict[date, list[float | None]]] = {
        prefix_name: _scalar_feature_he_z(pool, query, sub_to_col[prefix_name])
        for prefix_name in sub_prefixes
    }

    def _print_sub_strips(pool_date: date, features: dict[str, object]) -> None:
        parts = [prefix_units]
        sub_strips: dict[str, str] = {
            prefix_name: "".join(
                _shade_z(z)
                for z in sub_z_by_feat[prefix_name].get(pool_date, [None] * 24)
            )
            for prefix_name in sub_prefixes
        }
        date_analogs = analogs[analogs["date"] == pool_date]
        sub_strips["da_onpk"], _ = _he_strip_for_date(date_analogs)
        for key in ("outages", "m3"):
            feature_value = features.get(key)
            target_value = target_feats[key]
            if (
                feature_value is not None
                and not pd.isna(feature_value)
                and target_value is not None
                and stds[key] > 0
            ):
                z_value = (float(feature_value) - float(target_value)) / stds[key]
                sub_strips[key] = _shade_z(z_value) * 24
            else:
                sub_strips[key] = "\u00b7" * 24
        for key, _, _, value_w, diff_w, _, _ in cols:
            cell_w = value_w + 1 + diff_w + 1 + sigma_w
            content = sub_strips.get(key, "")
            parts.append(f"{content:^{cell_w}}")
        print("  ".join(parts))

    print(_fmt_row("-", "TARGET", "-", "-", "-", target_feats, None, "-"))
    print(sep)
    n_displayed = min(n_show, len(rows_features))
    for index, row in enumerate(rows_features[:n_show]):
        d_str = pd.Timestamp(row["date"]).strftime("%a %b-%d %Y")
        print(
            _fmt_row(
                str(row["rank"]),
                d_str,
                f"{row['mean_distance']:.4f}",
                f"{row['summed_weight']:.4f}",
                f"{row['w']:.3f}",
                row,
                target_feats,
                str(row["rank_hours_count"]),
            )
        )
        _print_sub_strips(row["date"], row)
        if index < n_displayed - 1:
            print()
    print(sep)
    print(
        _fmt_row(
            "-",
            "Like-Day Avg (wtd)",
            "-",
            f"{total_w:.4f}",
            "1.000",
            avg,
            target_feats,
            "-",
        )
    )
    print(sep)

    n_dates = len(rows_features)
    shown_w = sum(float(row["w"]) for row in rows_features[: min(n_show, n_dates)])
    print(
        f"\n  Showing top {min(n_show, n_dates)} of {n_dates} unique analog dates  "
        f"|  Top-{n_show} weight share: {shown_w:.1%}  "
        f"|  Ranked on {rank_label}  "
        f"|  sigma-gap = (analog - target) / pool_std  "
        f"|  Like-Day Avg uses all {n_dates} dates"
    )


def print_forecast(table: pd.DataFrame, metrics: dict | None, hub: str) -> None:
    """Actual / Forecast / Error table plus inline metrics block."""
    print_header(f"DA LMP LIKE-DAY FORECAST - {_display_hub(hub)} ($/MWh)", "=", 120)

    header = f"{'Date':<12} {'Type':<10}"
    for hour in range(1, 25):
        header += f" {hour:>6}"
    header += f" {'OnPk':>7} {'OffPk':>7} {'Flat':>7}"
    print(header)
    print("-" * len(header))

    for _, row in table.iterrows():
        line = f"{str(row['Date']):<12} {row['Type']:<10}"
        for hour in range(1, 25):
            value = row.get(f"HE{hour}")
            line += f" {value:>6.1f}" if pd.notna(value) else f" {'':>6}"
        for col in ("OnPeak", "OffPeak", "Flat"):
            value = row.get(col)
            line += f" {value:>7.2f}" if pd.notna(value) else f" {'':>7}"
        style = _ROW_STYLES.get(row["Type"])
        if style:
            line = f"{style}{line}{_RS}"
        print(line)

    print("-" * len(header))

    if metrics:
        if {"mae", "rmse", "mape"}.issubset(metrics.keys()):
            print(
                f"  MAE: ${metrics['mae']:.2f}/MWh  |  "
                f"RMSE: ${metrics['rmse']:.2f}/MWh  |  "
                f"MAPE: {metrics['mape']:.1f}%"
            )
        if "rmae" in metrics:
            verdict = "better" if metrics["rmae"] < 1 else "worse"
            print(
                f"  rMAE vs naive (last week): {metrics['rmae']:.3f} "
                f"({verdict} than naive)"
            )
        cov_parts: list[str] = []
        for label, key in (
            ("80%PI", "coverage_80pct"),
            ("90%PI", "coverage_90pct"),
            ("98%PI", "coverage_98pct"),
        ):
            if metrics.get(key) is not None:
                cov_parts.append(f"{label}={metrics[key]:.0%}")
        if cov_parts:
            print(f"  Coverage: {' | '.join(cov_parts)}")
        if metrics.get("sharpness_90pct") is not None:
            print(f"  Sharpness (90%PI width): ${metrics['sharpness_90pct']:.2f}/MWh")
        if "crps" in metrics:
            print(f"  CRPS: {metrics['crps']:.4f}")

    print()
    print_divider("=", 120, dim=False)
    print()


def print_quantiles(table: pd.DataFrame) -> None:
    """Quantile bands table matching the legacy Sunny report."""
    print("  Quantile Bands ($/MWh)")
    print("-" * 100)

    header = f"{'Date':<12} {'Band':<10}"
    for hour in range(1, 25):
        header += f" {hour:>6}"
    header += f" {'OnPk':>7} {'OffPk':>7} {'Flat':>7}"
    print(header)
    print("-" * len(header))

    for _, row in table.iterrows():
        line = f"{str(row['Date']):<12} {row['Type']:<10}"
        for hour in range(1, 25):
            value = row.get(f"HE{hour}")
            line += f" {value:>6.1f}" if pd.notna(value) else f" {'':>6}"
        for col in ("OnPeak", "OffPeak", "Flat"):
            value = row.get(col)
            line += f" {value:>7.2f}" if pd.notna(value) else f" {'':>7}"
        style = _ROW_STYLES.get(row["Type"])
        if style:
            line = f"{style}{line}{_RS}"
        print(line)

    print("-" * len(header) + "\n")


def print_single_day_report(
    logger,
    *,
    title: str,
    target_date: date,
    run_date: date,
    hub: str,
    cutoff_utc: str,
    history_days: int,
    pool: pd.DataFrame,
    query: pd.DataFrame,
    result: dict[str, object],
) -> None:
    """Print the legacy five-section PJM RTO Sunny report body."""
    config, day_type, spec = _resolve_config(
        result=result,
        target_date=target_date,
        hub=hub,
    )
    logger.info(title)
    logger.info(
        f"run_date={run_date} | cutoff_utc={cutoff_utc} | "
        f"history_days={history_days:,} | pool_rows={result['n_pool']:,} | "
        f"analog_rows={len(result['analogs']):,}"
    )
    if not result["features_complete"]:
        logger.warning(f"Target feature set is incomplete for {target_date}.")

    print_config(
        config,
        spec,
        target_date,
        day_type,
        effective_weights=(
            result.get("feature_weights")
            if isinstance(result.get("feature_weights"), dict)
            else None
        ),
    )
    print_pool_summary(pool, result["analogs"], config, target_date, day_type)
    print_analog_features(result["analogs"], pool, query, target_date, config.hub)
    print_forecast(result["output_table"], result.get("metrics") or None, config.hub)
    print_quantiles(result["quantiles_table"])
