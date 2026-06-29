from __future__ import annotations

import importlib
import warnings

import pandas as pd

from backend.scrapes.power.pjm import data_miner_feed
from backend.scrapes.power.pjm.data_miner_feed import (
    normalize_feed_frame,
    upsert_feed_frame,
)
from backend.scrapes.power.pjm.feed_configs import FEED_CONFIGS


BATCH_FEEDS = [
    "act_sch_interchange",
    "agg_definitions",
    "ancillary_services",
    "da_interface_flows_and_limits",
    "da_marginal_value",
    "da_transconstraints",
    "day_gen_capacity",
    "dispatched_reserves",
    "five_min_solar_generation",
    "load_frcstd_hist",
    "hourly_solar_power_forecast",
    "hourly_wind_power_forecast",
    "hrl_load_metered",
    "hrl_load_prelim",
    "hrl_dmd_bids",
    "frcstd_gen_outages",
    "rt_dispatch_reserves",
    "reserve_market_results",
    "rt_default_mv_override",
    "rt_marginal_value",
    "rt_short_term_mv_override",
    "rt_unverified_hrl_lmps",
    "load_frcstd_7_day",
    "ops_sum_frcst_peak_area",
    "ops_sum_frcst_peak_rto",
    "ops_sum_prev_period",
    "ops_sum_prjctd_tie_flow",
    "gen_outages_by_type",
    "solar_gen",
    "wind_gen",
]


def test_batch_feed_modules_match_data_miner_table_names():
    for feed in BATCH_FEEDS:
        module = importlib.import_module(f"backend.scrapes.power.pjm.{feed}")
        assert module.API_SCRAPE_NAME == feed
        assert module.TARGET_TABLE == feed
        assert module.TARGET_TABLE_FQN == f"pjm.{feed}"
        assert module.PRIMARY_KEY == list(FEED_CONFIGS[feed].primary_key)


def test_batch_feed_configs_have_contract_fields():
    for feed in BATCH_FEEDS:
        config = FEED_CONFIGS[feed]
        assert config.columns
        assert config.primary_key
        assert set(config.primary_key).issubset(config.columns)
        assert config.display_name
        assert config.posting_frequency
        assert config.retention_time


def test_forecast_feed_configs_have_90_day_hot_retention():
    assert FEED_CONFIGS["load_frcstd_hist"].hot_retention_days is None
    assert FEED_CONFIGS["frcstd_gen_outages"].hot_retention_days is None
    assert FEED_CONFIGS["gen_outages_by_type"].hot_retention_days is None

    expected = {
        "load_frcstd_7_day": "evaluated_at_datetime_utc",
        "hourly_solar_power_forecast": "evaluated_at_utc",
        "hourly_wind_power_forecast": "evaluated_at_utc",
    }
    for feed_name, retention_column in expected.items():
        config = FEED_CONFIGS[feed_name]
        assert config.hot_retention_days == 90
        assert config.hot_retention_column == retention_column


def test_data_miner_retention_purge_uses_config(monkeypatch):
    config = FEED_CONFIGS["hourly_solar_power_forecast"]
    captured: dict[str, object] = {}

    class FakeLogger:
        def section(self, message):
            captured["message"] = message

    def fake_purge_rows_older_than(**kwargs):
        captured.update(kwargs)
        return 5

    monkeypatch.setattr(
        data_miner_feed.retention,
        "purge_rows_older_than",
        fake_purge_rows_older_than,
    )

    deleted_rows = data_miner_feed._purge_retention_if_configured(
        config=config,
        database="helios_prod",
        rows_processed=10,
        run_logger=FakeLogger(),
    )

    assert deleted_rows == 5
    assert captured["schema"] == "pjm"
    assert captured["table_name"] == "hourly_solar_power_forecast"
    assert captured["timestamp_column"] == "evaluated_at_utc"
    assert captured["retention_days"] == 90
    assert captured["database"] == "helios_prod"


def test_normalize_feed_frame_coerces_and_dedupes():
    config = FEED_CONFIGS["hrl_load_metered"]
    df = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "is_verified": "true",
                    "load_area": " RTO ",
                    "mkt_region": " PJM ",
                    "mw": "100.5",
                    "nerc_region": " RFC ",
                    "zone": " RTO ",
                },
                {
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "is_verified": "true",
                    "load_area": " RTO ",
                    "mkt_region": " PJM ",
                    "mw": "101.5",
                    "nerc_region": " RFC ",
                    "zone": " RTO ",
                },
            ]
        ),
        config,
    )

    assert len(df) == 1
    assert df["mw"].iloc[0] == 101.5
    assert df["load_area"].iloc[0] == "RTO"
    assert bool(df["is_verified"].iloc[0]) is True
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])


def test_normalize_feed_frame_parses_pjm_datetimes_without_inference_warning():
    config = FEED_CONFIGS["wind_gen"]
    with warnings.catch_warnings(record=True) as captured_warnings:
        warnings.simplefilter("always")
        df = normalize_feed_frame(
            pd.DataFrame(
                [
                    {
                        "area": "RTO",
                        "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                        "datetime_beginning_utc": "2026-06-10T04:00:00",
                        "wind_generation_mw": "100.5",
                    },
                    {
                        "area": "MIDATL",
                        "datetime_beginning_ept": "2026-06-10 01:00:00",
                        "datetime_beginning_utc": "2026-06-10 05:00",
                        "wind_generation_mw": "200.5",
                    },
                    {
                        "area": "BAD",
                        "datetime_beginning_ept": "not a timestamp",
                        "datetime_beginning_utc": "",
                        "wind_generation_mw": "0",
                    },
                ]
            ),
            config,
        )

    warning_messages = [str(warning.message) for warning in captured_warnings]
    assert not any("Could not infer format" in message for message in warning_messages)
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert df["datetime_beginning_ept"].isna().sum() == 1
    assert df["datetime_beginning_utc"].isna().sum() == 1


def test_hourly_renewables_forecast_configs_preserve_source_vintages():
    solar = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "evaluated_at_utc": "6/16/2026 5:00:00 AM",
                    "evaluated_at_ept": "6/16/2026 1:00:00 AM",
                    "datetime_beginning_utc": "6/18/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/18/2026 12:00:00 AM",
                    "datetime_ending_utc": "6/18/2026 5:00:00 AM",
                    "datetime_ending_ept": "6/18/2026 1:00:00 AM",
                    "solar_forecast_mwh": "10.5",
                    "solar_forecast_btm_mwh": "3.25",
                },
                {
                    "evaluated_at_utc": "6/16/2026 6:00:00 AM",
                    "evaluated_at_ept": "6/16/2026 2:00:00 AM",
                    "datetime_beginning_utc": "6/18/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/18/2026 12:00:00 AM",
                    "datetime_ending_utc": "6/18/2026 5:00:00 AM",
                    "datetime_ending_ept": "6/18/2026 1:00:00 AM",
                    "solar_forecast_mwh": "11.5",
                    "solar_forecast_btm_mwh": "4.25",
                },
            ]
        ),
        FEED_CONFIGS["hourly_solar_power_forecast"],
    )
    wind = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "evaluated_at_utc": "6/16/2026 5:00:00 AM",
                    "evaluated_at_ept": "6/16/2026 1:00:00 AM",
                    "datetime_beginning_utc": "6/18/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/18/2026 12:00:00 AM",
                    "datetime_ending_utc": "6/18/2026 5:00:00 AM",
                    "datetime_ending_ept": "6/18/2026 1:00:00 AM",
                    "wind_forecast_mwh": "8443.551",
                }
            ]
        ),
        FEED_CONFIGS["hourly_wind_power_forecast"],
    )

    assert len(solar) == 2
    assert solar["solar_forecast_mwh"].tolist() == [10.5, 11.5]
    assert solar["solar_forecast_btm_mwh"].tolist() == [3.25, 4.25]
    assert len(wind) == 1
    assert wind["wind_forecast_mwh"].iloc[0] == 8443.551


def test_agg_definitions_preserves_bigint_ids_and_active_dates(monkeypatch):
    config = FEED_CONFIGS["agg_definitions"]
    df = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "effective_date_ept": "2026-06-01T00:00:00",
                    "terminate_date_ept": "9999-12-31T00:00:00",
                    "agg_pnode_id": "2156119729",
                    "agg_pnode_name": " AGG ",
                    "bus_pnode_id": "2156120072",
                    "bus_pnode_name": " BUS ",
                    "bus_pnode_factor": "0.75",
                },
                {
                    "effective_date_ept": "2026-06-01T00:00:00",
                    "terminate_date_ept": "9999-12-31T00:00:00",
                    "agg_pnode_id": "2156119729",
                    "agg_pnode_name": " AGG ",
                    "bus_pnode_id": "2156120072",
                    "bus_pnode_name": " BUS ",
                    "bus_pnode_factor": "0.80",
                },
            ]
        ),
        config,
    )
    captured: dict[str, object] = {}

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(data_miner_feed.db, "upsert_dataframe", fake_upsert_dataframe)

    upsert_feed_frame(df, config, database="stage_db")

    assert len(df) == 1
    assert str(df["terminate_date_ept"].iloc[0]) == "9999-12-31"
    assert df["agg_pnode_name"].iloc[0] == "AGG"
    assert df["bus_pnode_id"].iloc[0] == 2156120072
    assert df["bus_pnode_factor"].iloc[0] == 0.80
    assert captured["table_name"] == "agg_definitions"
    assert captured["database"] == "stage_db"
    assert captured["data_types"] == [
        "BIGINT",
        "DATE",
        "VARCHAR",
        "DOUBLE PRECISION",
        "BIGINT",
        "VARCHAR",
        "DATE",
    ]


def test_configured_numeric_type_wins_for_all_null_columns(monkeypatch):
    config = FEED_CONFIGS["reserve_market_results"]
    df = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "as_mw": "1.5",
                    "as_req_mw": "2.5",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "dsr_as_mw": "",
                    "ircmwt2": "",
                    "locale": " RTO ",
                    "mcp": "3.5",
                    "mcp_capped": "",
                    "nsr_mw": "",
                    "reg_ccp": "",
                    "reg_pcp": "",
                    "regd_mw": "",
                    "service": " SYNCH ",
                    "ss_mw": "",
                    "tier1_mw": "",
                    "total_mw": "4.5",
                }
            ]
        ),
        config,
    )
    captured: dict[str, object] = {}

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(data_miner_feed.db, "upsert_dataframe", fake_upsert_dataframe)

    upsert_feed_frame(df, config, database="stage_db")

    assert captured["data_types"] == [
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "TIMESTAMP",
        "TIMESTAMP",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "VARCHAR",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "VARCHAR",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
    ]


def test_ops_sum_configs_preserve_generated_vintages():
    expected_keys = {
        "ops_sum_frcst_peak_area": [
            "projected_peak_datetime_utc",
            "generated_at_ept",
            "area",
        ],
        "ops_sum_frcst_peak_rto": [
            "projected_peak_datetime_utc",
            "generated_at_ept",
            "area",
        ],
        "ops_sum_prev_period": [
            "datetime_beginning_utc",
            "generated_at_ept",
            "area",
        ],
        "ops_sum_prjctd_tie_flow": [
            "projected_peak_datetime_utc",
            "generated_at_ept",
            "interface",
        ],
    }

    for feed_name, primary_key in expected_keys.items():
        config = FEED_CONFIGS[feed_name]
        assert list(config.primary_key) == primary_key
        assert "generated_at_ept" in config.datetime_columns
        assert config.retention_time == "Indefinitely"

    assert FEED_CONFIGS["ops_sum_prev_period"].default_lookahead_days == -1


def test_ops_sum_prev_period_normalization_marks_latest_duplicate():
    config = FEED_CONFIGS["ops_sum_prev_period"]
    df = normalize_feed_frame(
        pd.DataFrame(
            [
                {
                    "actual_load": "11920",
                    "area": " AEP ",
                    "area_load_forecast": "12060",
                    "datetime_beginning_ept": "8/23/2011 3:00:00 AM",
                    "datetime_beginning_utc": "8/23/2011 7:00:00 AM",
                    "datetime_ending_ept": "8/23/2011 4:00:00 AM",
                    "datetime_ending_utc": "8/23/2011 8:00:00 AM",
                    "dispatch_rate": "",
                    "generated_at_ept": "8/24/2011 8:30:20 AM",
                },
                {
                    "actual_load": "11940",
                    "area": " AEP ",
                    "area_load_forecast": "12060",
                    "datetime_beginning_ept": "8/23/2011 3:00:00 AM",
                    "datetime_beginning_utc": "8/23/2011 7:00:00 AM",
                    "datetime_ending_ept": "8/23/2011 4:00:00 AM",
                    "datetime_ending_utc": "8/23/2011 8:00:00 AM",
                    "dispatch_rate": "29.53",
                    "generated_at_ept": "8/24/2011 8:30:20 AM",
                },
            ]
        ),
        config,
    )

    assert len(df) == 1
    assert df["area"].iloc[0] == "AEP"
    assert df["actual_load"].iloc[0] == 11940
    assert df["dispatch_rate"].iloc[0] == 29.53
    assert pd.api.types.is_datetime64_any_dtype(df["generated_at_ept"])
