from __future__ import annotations

import pandas as pd

from backend.scrapes.power.pjm import (
    agg_definitions,
    data_miner_feed,
    five_min_tie_flows,
    pnode,
    pricing_filters,
    rt_fivemin_hrl_lmps,
    rt_unverified_hrl_lmps,
)


def test_pricing_filter_helper_fetches_one_request_per_node_type(monkeypatch):
    captured: list[tuple[str, dict[str, str], dict[str, object]]] = []

    def fake_fetch_csv(feed: str, params: dict[str, str], **kwargs) -> pd.DataFrame:
        captured.append((feed, params, kwargs))
        return pd.DataFrame([{"type": params["type"]}])

    monkeypatch.setattr(pricing_filters.client, "fetch_csv", fake_fetch_csv)

    df = pricing_filters.fetch_csv_for_pricing_node_types(
        "rt_fivemin_hrl_lmps",
        base_params={"datetime_beginning_ept": "yesterday"},
        pnode_types=("hub", "zone", "interface"),
        pipeline_name="pipeline",
    )

    assert df["type"].tolist() == ["hub", "zone", "interface"]
    assert [item[0] for item in captured] == [
        "rt_fivemin_hrl_lmps",
        "rt_fivemin_hrl_lmps",
        "rt_fivemin_hrl_lmps",
    ]
    assert [item[1]["type"] for item in captured] == ["hub", "zone", "interface"]
    assert all(item[2]["pipeline_name"] == "pipeline" for item in captured)


def test_rt_fivemin_hrl_lmps_target_matches_pjm_feed_name():
    assert rt_fivemin_hrl_lmps.API_SCRAPE_NAME == "rt_fivemin_hrl_lmps"
    assert rt_fivemin_hrl_lmps.TARGET_TABLE == "rt_fivemin_hrl_lmps"
    assert rt_fivemin_hrl_lmps.TARGET_TABLE_FQN == "pjm.rt_fivemin_hrl_lmps"
    assert rt_fivemin_hrl_lmps.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "pnode_id",
        "pnode_name",
    ]


def test_rt_fivemin_hrl_pull_uses_current_hub_zone_interface_scope(monkeypatch):
    captured: dict[str, object] = {}

    def fake_pnode_pull(**kwargs) -> pd.DataFrame:
        captured["pnode_kwargs"] = kwargs
        return pd.DataFrame(
            [
                {
                    "pnode_id": "51288",
                    "pnode_name": "WESTERN HUB",
                    "pnode_type": "AGGREGATE",
                    "pnode_subtype": "HUB",
                },
                {
                    "pnode_id": "1",
                    "pnode_name": "PJM-RTO",
                    "pnode_type": "AGGREGATE",
                    "pnode_subtype": "ZONE",
                },
                {
                    "pnode_id": "48592",
                    "pnode_name": "ALDENE",
                    "pnode_type": "BUS",
                    "pnode_subtype": "LOAD",
                },
            ]
        )

    def fake_fetch_csv(feed: str, params: dict[str, str], **kwargs) -> pd.DataFrame:
        captured["feed"] = feed
        captured["params"] = params
        captured.update(kwargs)
        return pd.DataFrame(
            [
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "pnode_id": "51288",
                    "pnode_name": " WESTERN HUB ",
                    "voltage": None,
                    "equipment": None,
                    "type": " HUB ",
                    "zone": None,
                    "row_is_current": "True",
                    "version_nbr": "1",
                    "system_energy_price_rt": "19.0",
                    "total_lmp_rt": "20.5",
                    "congestion_price_rt": "1.0",
                    "marginal_loss_price_rt": "0.5",
                },
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "pnode_id": "51288",
                    "pnode_name": " WESTERN HUB ",
                    "voltage": None,
                    "equipment": None,
                    "type": " HUB ",
                    "zone": None,
                    "row_is_current": "True",
                    "version_nbr": "2",
                    "system_energy_price_rt": "19.0",
                    "total_lmp_rt": "21.5",
                    "congestion_price_rt": "1.0",
                    "marginal_loss_price_rt": "0.5",
                },
            ]
        )

    monkeypatch.setattr(rt_fivemin_hrl_lmps.pnode, "_pull", fake_pnode_pull)
    monkeypatch.setattr(rt_fivemin_hrl_lmps.client, "fetch_csv", fake_fetch_csv)

    df = rt_fivemin_hrl_lmps._pull(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:55",
        pnode_id_batch_size=100,
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "rt_fivemin_hrl_lmps"
    assert captured["params"] == {
        "datetime_beginning_ept": "2026-06-10 00:00 to 2026-06-10 23:55",
        "row_is_current": "1",
        "pnode_id": "1,51288",
    }
    assert captured["pnode_kwargs"]["run_id"] == "run-1"
    assert captured["pnode_kwargs"]["database"] == "stage_db"
    assert captured["pipeline_name"] == "rt_fivemin_hrl_lmps"
    assert captured["target_table"] == "pjm.rt_fivemin_hrl_lmps"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["pnode_name"].iloc[0] == "WESTERN HUB"
    assert df["type"].iloc[0] == "HUB"
    assert df["total_lmp_rt"].iloc[0] == 21.5
    assert bool(df["row_is_current"].iloc[0]) is True
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])


def test_rt_fivemin_hrl_upsert_uses_bigint_for_pnode_id(monkeypatch):
    captured: dict[str, object] = {}
    df = pd.DataFrame(
        [
            {
                "datetime_beginning_utc": pd.Timestamp("2026-06-10 04:00:00"),
                "datetime_beginning_ept": pd.Timestamp("2026-06-10 00:00:00"),
                "pnode_id": 2156111904,
                "pnode_name": "SOUTH",
                "type": "INTERFACE",
                "row_is_current": True,
                "version_nbr": 1,
                "system_energy_price_rt": 19.0,
                "total_lmp_rt": 20.0,
                "congestion_price_rt": 0.5,
                "marginal_loss_price_rt": 0.5,
            }
        ]
    )

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(rt_fivemin_hrl_lmps.db, "upsert_dataframe", fake_upsert_dataframe)

    rt_fivemin_hrl_lmps._upsert(df, database="stage_db")

    pnode_id_type = dict(zip(captured["columns"], captured["data_types"]))["pnode_id"]
    assert pnode_id_type == "BIGINT"


def test_five_min_tie_flows_target_matches_pjm_feed_name():
    assert five_min_tie_flows.API_SCRAPE_NAME == "five_min_tie_flows"
    assert five_min_tie_flows.TARGET_TABLE == "five_min_tie_flows"
    assert five_min_tie_flows.TARGET_TABLE_FQN == "pjm.five_min_tie_flows"
    assert five_min_tie_flows.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "tie_flow_name",
    ]


def test_five_min_tie_flows_pull_uses_data_miner_feed_and_cleans_rows(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_csv(feed: str, params: dict[str, str], **kwargs) -> pd.DataFrame:
        captured["feed"] = feed
        captured["params"] = params
        captured.update(kwargs)
        return pd.DataFrame(
            [
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "tie_flow_name": " TIE A ",
                    "actual_mw": "100.5",
                    "scheduled_mw": "99.5",
                },
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "tie_flow_name": " TIE A ",
                    "actual_mw": "101.5",
                    "scheduled_mw": "99.5",
                },
            ]
        )

    monkeypatch.setattr(five_min_tie_flows.client, "fetch_csv", fake_fetch_csv)

    df = five_min_tie_flows._pull(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:55",
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "five_min_tie_flows"
    assert captured["params"] == {
        "datetime_beginning_ept": "2026-06-10 00:00 to 2026-06-10 23:55",
    }
    assert captured["pipeline_name"] == "five_min_tie_flows"
    assert captured["target_table"] == "pjm.five_min_tie_flows"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["tie_flow_name"].iloc[0] == "TIE A"
    assert df["actual_mw"].iloc[0] == 101.5
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])


def test_pnode_target_matches_pjm_feed_name():
    assert pnode.API_SCRAPE_NAME == "pnode"
    assert pnode.TARGET_TABLE == "pnode"
    assert pnode.TARGET_TABLE_FQN == "pjm.pnode"
    assert pnode.PRIMARY_KEY == ["pnode_id"]


def test_pnode_pull_uses_active_filter_and_cleans_rows(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_csv(feed: str, params: dict[str, str], **kwargs) -> pd.DataFrame:
        captured["feed"] = feed
        captured["params"] = params
        captured.update(kwargs)
        return pd.DataFrame(
            [
                {
                    "pnode_id": "1",
                    "pnode_name": " PJM-RTO ",
                    "pnode_type": " AGGREGATE ",
                    "pnode_subtype": " ZONE ",
                    "zone": None,
                    "voltage_level": None,
                    "effective_date": "9/8/2017 12:00:00 AM",
                    "termination_date": "12/31/9999 12:00:00 AM",
                },
                {
                    "pnode_id": "1",
                    "pnode_name": " PJM-RTO UPDATED ",
                    "pnode_type": " AGGREGATE ",
                    "pnode_subtype": " ZONE ",
                    "zone": None,
                    "voltage_level": None,
                    "effective_date": "9/8/2017 12:00:00 AM",
                    "termination_date": "12/31/9999 12:00:00 AM",
                },
            ]
        )

    monkeypatch.setattr(data_miner_feed.client, "fetch_csv", fake_fetch_csv)

    df = pnode._pull(run_id="run-1", database="stage_db")

    assert captured["feed"] == "pnode"
    assert captured["params"] == {"termination_date": "12/31/9999 exact"}
    assert captured["pipeline_name"] == "pnode"
    assert captured["target_table"] == "pjm.pnode"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["pnode_id"].iloc[0] == 1
    assert df["pnode_name"].iloc[0] == "PJM-RTO UPDATED"
    assert df["pnode_type"].iloc[0] == "AGGREGATE"
    assert str(df["effective_date"].iloc[0]) == "2017-09-08"
    assert str(df["termination_date"].iloc[0]) == "9999-12-31"


def test_agg_definitions_target_matches_pjm_feed_name():
    assert agg_definitions.API_SCRAPE_NAME == "agg_definitions"
    assert agg_definitions.TARGET_TABLE == "agg_definitions"
    assert agg_definitions.TARGET_TABLE_FQN == "pjm.agg_definitions"
    assert agg_definitions.PRIMARY_KEY == [
        "agg_pnode_id",
        "bus_pnode_id",
        "effective_date_ept",
    ]


def test_agg_definitions_pull_uses_active_filter_and_cleans_rows(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_csv(feed: str, params: dict[str, str], **kwargs) -> pd.DataFrame:
        captured["feed"] = feed
        captured["params"] = params
        captured.update(kwargs)
        return pd.DataFrame(
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
        )

    monkeypatch.setattr(data_miner_feed.client, "fetch_csv", fake_fetch_csv)

    df = agg_definitions._pull(run_id="run-1", database="stage_db")

    assert captured["feed"] == "agg_definitions"
    assert captured["params"] == {"terminate_date_ept": "12/31/9999 exact"}
    assert captured["pipeline_name"] == "agg_definitions"
    assert captured["target_table"] == "pjm.agg_definitions"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["agg_pnode_id"].iloc[0] == 2156119729
    assert df["bus_pnode_id"].iloc[0] == 2156120072
    assert df["agg_pnode_name"].iloc[0] == "AGG"
    assert df["bus_pnode_name"].iloc[0] == "BUS"
    assert df["bus_pnode_factor"].iloc[0] == 0.80
    assert str(df["terminate_date_ept"].iloc[0]) == "9999-12-31"


def test_rt_unverified_hrl_lmps_target_matches_pjm_feed_name():
    assert rt_unverified_hrl_lmps.API_SCRAPE_NAME == "rt_unverified_hrl_lmps"
    assert rt_unverified_hrl_lmps.TARGET_TABLE == "rt_unverified_hrl_lmps"
    assert rt_unverified_hrl_lmps.TARGET_TABLE_FQN == "pjm.rt_unverified_hrl_lmps"
    assert rt_unverified_hrl_lmps.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "pnode_name",
        "type",
    ]


def test_rt_unverified_hrl_pull_uses_hub_zone_interface_scope(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_for_types(feed: str, **kwargs) -> pd.DataFrame:
        captured["feed"] = feed
        captured.update(kwargs)
        return pd.DataFrame(
            [
                {
                    "datetime_beginning_utc": "2026-06-12T21:00:00",
                    "datetime_beginning_ept": "2026-06-12T17:00:00",
                    "pnode_name": " CHICAGO HUB ",
                    "type": " HUB ",
                    "total_lmp_rt": "55.235833",
                    "congestion_price_rt": "-34.350833",
                    "marginal_loss_price_rt": "-9.383333",
                },
                {
                    "datetime_beginning_utc": "2026-06-12T21:00:00",
                    "datetime_beginning_ept": "2026-06-12T17:00:00",
                    "pnode_name": " CHICAGO HUB ",
                    "type": " HUB ",
                    "total_lmp_rt": "56.235833",
                    "congestion_price_rt": "-34.350833",
                    "marginal_loss_price_rt": "-9.383333",
                },
            ]
        )

    monkeypatch.setattr(
        data_miner_feed,
        "fetch_csv_for_pricing_node_types",
        fake_fetch_for_types,
    )

    df = rt_unverified_hrl_lmps._pull(
        start_date="2026-06-12 00:00",
        end_date="2026-06-12 23:00",
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "rt_unverified_hrl_lmps"
    assert captured["base_params"] == {
        "datetime_beginning_ept": "2026-06-12 00:00 to 2026-06-12 23:00",
    }
    assert captured["pnode_types"] == ("hub", "zone", "interface")
    assert captured["pipeline_name"] == "rt_unverified_hrl_lmps"
    assert captured["target_table"] == "pjm.rt_unverified_hrl_lmps"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["pnode_name"].iloc[0] == "CHICAGO HUB"
    assert df["type"].iloc[0] == "HUB"
    assert df["total_lmp_rt"].iloc[0] == 56.235833
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])
