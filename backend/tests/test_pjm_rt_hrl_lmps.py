from __future__ import annotations

import pandas as pd

from backend.scrapes.power.pjm import rt_hrl_lmps


def test_rt_hrl_lmps_target_matches_pjm_feed_name():
    assert rt_hrl_lmps.API_SCRAPE_NAME == "rt_hrl_lmps"
    assert rt_hrl_lmps.TARGET_TABLE == rt_hrl_lmps.API_SCRAPE_NAME
    assert rt_hrl_lmps.TARGET_TABLE_FQN == "pjm.rt_hrl_lmps"
    assert rt_hrl_lmps.PRIMARY_KEY == [
        "datetime_beginning_utc",
        "pnode_id",
        "pnode_name",
        "row_is_current",
        "version_nbr",
    ]


def test_rt_hrl_lmps_pull_uses_exact_feed_target_and_database(monkeypatch):
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
                    "pnode_name": "WESTERN HUB",
                    "row_is_current": True,
                    "version_nbr": 1,
                    "total_lmp_rt": 20.5,
                    "system_energy_price_rt": 19.0,
                    "congestion_price_rt": 1.0,
                    "marginal_loss_price_rt": 0.5,
                }
            ]
        )

    monkeypatch.setattr(rt_hrl_lmps.client, "fetch_csv", fake_fetch_csv)

    df = rt_hrl_lmps._pull(
        start_date="2026-06-10 00:00",
        end_date="2026-06-10 23:00",
        run_id="run-1",
        database="stage_db",
    )

    assert captured["feed"] == "rt_hrl_lmps"
    assert captured["params"] == {
        "datetime_beginning_ept": "2026-06-10 00:00 to 2026-06-10 23:00",
        "type": "hub",
    }
    assert captured["pipeline_name"] == "rt_hrl_lmps"
    assert captured["run_id"] == "run-1"
    assert captured["target_table"] == "pjm.rt_hrl_lmps"
    assert captured["database"] == "stage_db"
    assert captured["log_fetch"] is True
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_utc"])
    assert pd.api.types.is_datetime64_any_dtype(df["datetime_beginning_ept"])
