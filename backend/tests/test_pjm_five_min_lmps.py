from __future__ import annotations

import pandas as pd

from backend.scrapes.power.pjm import (
    rt_fivemin_mnt_lmps,
    unverified_five_min_lmps,
)


def test_unverified_five_min_lmps_target_matches_pjm_feed_name():
    assert unverified_five_min_lmps.API_SCRAPE_NAME == "unverified_five_min_lmps"
    assert unverified_five_min_lmps.TARGET_TABLE == "unverified_five_min_lmps"
    assert unverified_five_min_lmps.TARGET_TABLE_FQN == "pjm.unverified_five_min_lmps"
    assert unverified_five_min_lmps.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "name",
        "type",
    ]


def test_rt_fivemin_mnt_lmps_target_matches_pjm_feed_name():
    assert rt_fivemin_mnt_lmps.API_SCRAPE_NAME == "rt_fivemin_mnt_lmps"
    assert rt_fivemin_mnt_lmps.TARGET_TABLE == "rt_fivemin_mnt_lmps"
    assert rt_fivemin_mnt_lmps.TARGET_TABLE_FQN == "pjm.rt_fivemin_mnt_lmps"
    assert rt_fivemin_mnt_lmps.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "pnode_id",
        "pnode_name",
    ]


def test_unverified_five_min_pull_uses_data_miner_feed_and_cleans_rows(monkeypatch):
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
                    "name": " WESTERN HUB ",
                    "type": " HUB ",
                    "five_min_rtlmp": "21.5",
                    "hourly_lmp": "20.0",
                },
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "name": " WESTERN HUB ",
                    "type": " HUB ",
                    "five_min_rtlmp": "22.5",
                    "hourly_lmp": "20.0",
                },
            ]
        )

    monkeypatch.setattr(unverified_five_min_lmps.client, "fetch_csv", fake_fetch_csv)

    df = unverified_five_min_lmps._pull(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:55",
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "unverified_five_min_lmps"
    assert captured["params"] == {
        "datetime_beginning_ept": "2026-06-10 00:00 to 2026-06-10 23:55",
        "type": "hub",
    }
    assert captured["pipeline_name"] == "unverified_five_min_lmps"
    assert captured["target_table"] == "pjm.unverified_five_min_lmps"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["name"].iloc[0] == "WESTERN HUB"
    assert df["type"].iloc[0] == "HUB"
    assert df["five_min_rtlmp"].iloc[0] == 22.5
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])


def test_rt_fivemin_mnt_pull_uses_data_miner_feed_and_cleans_rows(monkeypatch):
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
                    "pnode_id": 51288,
                    "pnode_name": " WESTERN HUB ",
                    "voltage": None,
                    "equipment": None,
                    "type": " HUB ",
                    "zone": None,
                    "system_energy_price_rt": "19.0",
                    "total_lmp_rt": "20.5",
                    "congestion_price_rt": "1.0",
                    "marginal_loss_price_rt": "0.5",
                },
                {
                    "datetime_beginning_utc": "6/10/2026 4:00:00 AM",
                    "datetime_beginning_ept": "6/10/2026 12:00:00 AM",
                    "pnode_id": 51288,
                    "pnode_name": " WESTERN HUB ",
                    "voltage": None,
                    "equipment": None,
                    "type": " HUB ",
                    "zone": None,
                    "system_energy_price_rt": "19.0",
                    "total_lmp_rt": "21.5",
                    "congestion_price_rt": "1.0",
                    "marginal_loss_price_rt": "0.5",
                },
            ]
        )

    monkeypatch.setattr(rt_fivemin_mnt_lmps.client, "fetch_csv", fake_fetch_csv)

    df = rt_fivemin_mnt_lmps._pull(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:55",
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "rt_fivemin_mnt_lmps"
    assert captured["params"] == {
        "datetime_beginning_ept": "2026-06-10 00:00 to 2026-06-10 23:55",
        "type": "hub",
    }
    assert captured["pipeline_name"] == "rt_fivemin_mnt_lmps"
    assert captured["target_table"] == "pjm.rt_fivemin_mnt_lmps"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert len(df) == 1
    assert df["pnode_name"].iloc[0] == "WESTERN HUB"
    assert df["type"].iloc[0] == "HUB"
    assert df["total_lmp_rt"].iloc[0] == 21.5
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])
