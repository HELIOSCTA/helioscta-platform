from __future__ import annotations

from types import SimpleNamespace

from backend.orchestration.power.pjm import data_miner_batch


def test_batch_feed_list_excludes_da_orchestration_target():
    assert "da_hrl_lmps" not in data_miner_batch.DEFAULT_FEEDS
    assert "rt_hrl_lmps" not in data_miner_batch.DEFAULT_FEEDS
    assert "rt_fivemin_hrl_lmps" not in data_miner_batch.DEFAULT_FEEDS
    assert "load_frcstd_7_day" not in data_miner_batch.DEFAULT_FEEDS
    assert "gen_outages_by_type" not in data_miner_batch.DEFAULT_FEEDS
    assert "hrl_dmd_bids" not in data_miner_batch.DEFAULT_FEEDS
    assert "da_transconstraints" not in data_miner_batch.DEFAULT_FEEDS
    assert "rt_unverified_hrl_lmps" not in data_miner_batch.DEFAULT_FEEDS
    assert "ops_sum_frcstd_tran_lim" not in data_miner_batch.DEFAULT_FEEDS
    assert "ops_sum_frcst_peak_area" not in data_miner_batch.DEFAULT_FEEDS
    assert "ops_sum_frcst_peak_rto" not in data_miner_batch.DEFAULT_FEEDS
    assert "ops_sum_prev_period" not in data_miner_batch.DEFAULT_FEEDS
    assert "ops_sum_prjctd_tie_flow" not in data_miner_batch.DEFAULT_FEEDS
    assert "gen_by_fuel" not in data_miner_batch.DEFAULT_FEEDS
    assert "rt_and_self_ecomax" in data_miner_batch.DEFAULT_FEEDS
    assert len(data_miner_batch.DEFAULT_FEEDS) == 24
    assert len(set(data_miner_batch.DEFAULT_FEEDS)) == len(data_miner_batch.DEFAULT_FEEDS)


def test_batch_main_returns_nonzero_when_any_feed_fails(monkeypatch):
    calls: list[str] = []

    def fake_import_module(name: str):
        feed = name.rsplit(".", 1)[-1]

        def main():
            calls.append(feed)
            if feed == "bad_feed":
                raise RuntimeError("boom")

        return SimpleNamespace(main=main)

    monkeypatch.setattr(data_miner_batch.importlib, "import_module", fake_import_module)

    result = data_miner_batch.main(feed_names=("good_feed", "bad_feed", "later_feed"))

    assert result == 1
    assert calls == ["good_feed", "bad_feed", "later_feed"]


def test_batch_main_returns_zero_when_all_feeds_succeed(monkeypatch):
    calls: list[str] = []

    def fake_import_module(name: str):
        feed = name.rsplit(".", 1)[-1]

        def main():
            calls.append(feed)

        return SimpleNamespace(main=main)

    monkeypatch.setattr(data_miner_batch.importlib, "import_module", fake_import_module)

    result = data_miner_batch.main(feed_names=("feed_one", "feed_two"))

    assert result == 0
    assert calls == ["feed_one", "feed_two"]
