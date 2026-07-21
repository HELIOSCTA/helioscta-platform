from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from backend.orchestration.weather.wsi import daily_weighted_observations
from backend.scrapes.weather.wsi import daily_weighted_degree_day_observations
from backend.scrapes.weather.wsi import daily_weighted_temperature_observations


def _observation_rows(
    *,
    dataset: str,
    entities: list[str],
    metrics: list[str],
    day_count: int = 2,
) -> pd.DataFrame:
    rows = []
    first_observation_date = date(2026, 7, 19)
    for entity_id in entities:
        for day_offset in range(day_count):
            observation_date = first_observation_date + timedelta(days=day_offset)
            for metric_name in metrics:
                rows.append(
                    {
                        "source_product_id": dataset,
                        "scrape_run_at_utc": pd.Timestamp(
                            "2026-07-21 10:44:00+0000"
                        ),
                        "entity_id": entity_id,
                        "observation_date": observation_date,
                        "metric_name": metric_name,
                    }
                )
    return pd.DataFrame(rows)


def _empty_rows() -> pd.DataFrame:
    df = pd.DataFrame(columns=daily_weighted_temperature_observations.OUTPUT_COLUMNS)
    df.attrs.update(
        {
            "source_banner": "WSI empty test fixture",
            "scrape_run_at_utc": pd.Timestamp("2026-07-21 10:44:00+0000"),
            "request_start_date": date(2026, 7, 20),
            "request_end_date": date(2026, 7, 21),
        }
    )
    return df


def test_daily_weighted_observations_main_runs_both_scrapes_and_emits_events(
    monkeypatch,
):
    emitted: list[dict] = []
    temp_df = _observation_rows(
        dataset="temperature",
        entities=daily_weighted_temperature_observations.DEFAULT_ENTITY_IDS,
        metrics=daily_weighted_temperature_observations.EXPECTED_METRIC_NAMES,
    )
    degree_df = _observation_rows(
        dataset="degree_day",
        entities=daily_weighted_degree_day_observations.DEFAULT_STATIONS,
        metrics=daily_weighted_degree_day_observations.EXPECTED_METRIC_NAMES,
    )

    monkeypatch.setattr(
        daily_weighted_observations.daily_weighted_temperature_observations,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_observations.daily_weighted_degree_day_observations,
        "main",
        lambda **_kwargs: degree_df,
    )
    monkeypatch.setattr(
        daily_weighted_observations,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_observations.main(database="helios_prod")

    assert set(result["events"]) == {"temperature", "degree_day"}
    assert [event["dataset"] for event in emitted] == [
        "wsi_daily_weighted_temperature_observations",
        "wsi_daily_weighted_degree_day_observations",
    ]
    assert all(event["completeness_status"] == "complete" for event in emitted)
    assert emitted[0]["business_date"] == date(2026, 7, 20)
    assert emitted[0]["period_count"] == 1
    assert emitted[0]["scope"] == "NA"
    assert emitted[0]["source_table"] == (
        "weather.wsi_daily_weighted_temperature_observations"
    )
    assert emitted[1]["source_table"] == (
        "weather.wsi_daily_weighted_degree_day_observations"
    )


def test_daily_weighted_observations_event_marks_missing_metric_partial(monkeypatch):
    emitted: list[dict] = []
    df = _observation_rows(
        dataset="temperature",
        entities=["PJM"],
        metrics=["min_temp_f", "max_temp_f"],
    )

    monkeypatch.setattr(
        daily_weighted_observations,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    daily_weighted_observations._emit_freshness_event(
        df=df,
        dataset="wsi_daily_weighted_temperature_observations",
        source_table="weather.wsi_daily_weighted_temperature_observations",
        expected_entities=["PJM"],
        expected_metric_names=(
            daily_weighted_temperature_observations.EXPECTED_METRIC_NAMES
        ),
        scope="PJM",
        database="helios_prod",
    )

    assert emitted[0]["completeness_status"] == "partial"
    assert emitted[0]["payload"]["missing_metric_names"] == ["avg_temp_f"]
    assert emitted[0]["payload"]["missing_entity_metric_count"] == 1


def test_daily_weighted_observations_main_emits_partial_events_for_empty_results(
    monkeypatch,
):
    emitted: list[dict] = []
    temp_df = _empty_rows()
    degree_df = _empty_rows()

    monkeypatch.setattr(
        daily_weighted_observations.daily_weighted_temperature_observations,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_observations.daily_weighted_degree_day_observations,
        "main",
        lambda **_kwargs: degree_df,
    )
    monkeypatch.setattr(
        daily_weighted_observations,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_observations.main(database="helios_prod")

    assert set(result["events"]) == {"temperature", "degree_day"}
    assert [event["completeness_status"] for event in emitted] == [
        "partial",
        "partial",
    ]
    assert [event["business_date"] for event in emitted] == [
        date(2026, 7, 21),
        date(2026, 7, 21),
    ]
    assert [event["row_count"] for event in emitted] == [0, 0]
    assert emitted[0]["payload"]["missing_entity_ids"] == sorted(
        daily_weighted_temperature_observations.DEFAULT_ENTITY_IDS
    )
    assert emitted[0]["payload"]["missing_metric_names"] == sorted(
        daily_weighted_temperature_observations.EXPECTED_METRIC_NAMES
    )
    assert emitted[1]["payload"]["missing_entity_ids"] == sorted(
        daily_weighted_degree_day_observations.DEFAULT_STATIONS
    )
