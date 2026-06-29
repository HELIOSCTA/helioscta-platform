from __future__ import annotations

from types import SimpleNamespace

from backend.orchestration.power.pjm import ops_sum


def test_ops_sum_feed_list_uses_requested_feeds():
    assert [feed.API_SCRAPE_NAME for feed in ops_sum.DEFAULT_FEEDS] == [
        "ops_sum_frcstd_tran_lim",
        "ops_sum_frcst_peak_area",
        "ops_sum_frcst_peak_rto",
        "ops_sum_prev_period",
        "ops_sum_prjctd_tie_flow",
    ]


def test_ops_sum_main_returns_nonzero_when_any_feed_fails():
    calls: list[tuple[str, str | None, dict[str, object]]] = []

    def make_feed(name: str, *, fails: bool = False):
        def main(**kwargs):
            calls.append((name, kwargs["database"], kwargs["metadata"]))
            if fails:
                raise RuntimeError("boom")

        return SimpleNamespace(API_SCRAPE_NAME=name, main=main)

    result = ops_sum.main(
        feeds=(
            make_feed("good_feed"),
            make_feed("bad_feed", fails=True),
            make_feed("later_feed"),
        ),
        database="stage_db",
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result == 1
    assert [call[0] for call in calls] == ["good_feed", "bad_feed", "later_feed"]
    assert all(call[1] == "stage_db" for call in calls)
    assert all(call[2] == {"run_mode": "manual", "source": "test"} for call in calls)


def test_ops_sum_main_returns_zero_when_all_feeds_succeed():
    calls: list[str] = []

    def make_feed(name: str):
        def main(**kwargs):
            calls.append(name)

        return SimpleNamespace(API_SCRAPE_NAME=name, main=main)

    result = ops_sum.main(feeds=(make_feed("feed_one"), make_feed("feed_two")))

    assert result == 0
    assert calls == ["feed_one", "feed_two"]
