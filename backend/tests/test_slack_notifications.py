from __future__ import annotations

from datetime import datetime, timezone

from backend.utils import slack_notifications


def test_pjm_da_release_slack_targets_power_channel_and_single_day_report(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_da_hrl_lmp_release_slack(
        event={
            "id": 9,
            "event_key": "pjm_da_hrl_lmps:data_ready:2026-07-02:hub",
        },
    )

    assert message["notification_key"] == (
        "pjm_da_hrl_lmps:data_ready:2026-07-02:hub:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 9
    assert message["dataset"] == "pjm_da_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM DA hourly LMPs are available for 2026-07-02."
    )
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=da" in report_url
    assert "date=2026-07-02" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url
    assert message["message_blocks"][0]["text"]["text"] == "PJM DA HRL LMPs Available"
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-07-02"},
        {"type": "mrkdwn", "text": "*Dataset*\nDay-ahead hourly LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/da_hrl_lmps/definition|"
                "PJM Data Miner 2 - da_hrl_lmps>"
            ),
        },
    ]
    button = message["message_blocks"][2]["elements"][0]
    assert button["text"]["text"] == "Open report"
    assert button["url"] == report_url
    source_button = message["message_blocks"][2]["elements"][1]
    assert source_button["text"]["text"] == "PJM source"
    assert (
        source_button["url"]
        == "https://dataminer2.pjm.com/feed/da_hrl_lmps/definition"
    )
    assert message["payload"]["source_feed"] == "da_hrl_lmps"


def test_pjm_rt_release_slack_targets_power_channel_and_single_day_report(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_rt_hrl_lmp_release_slack(
        event={
            "id": 10,
            "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub",
        },
    )

    assert message["notification_key"] == (
        "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 10
    assert message["dataset"] == "pjm_rt_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM verified RT hourly LMPs are available for 2026-06-30."
    )
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=rt" in report_url
    assert "source=verified" in report_url
    assert "date=2026-06-30" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url
    assert message["message_blocks"][0] == {
        "type": "header",
        "text": {
            "type": "plain_text",
            "text": "PJM RT HRL LMPs Available",
            "emoji": True,
        },
    }
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-06-30"},
        {"type": "mrkdwn", "text": "*Dataset*\nVerified RT hourly LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition|"
                "PJM Data Miner 2 - rt_hrl_lmps>"
            ),
        },
    ]
    button = message["message_blocks"][2]["elements"][0]
    assert button["text"]["text"] == "Open report"
    assert button["url"] == report_url
    source_button = message["message_blocks"][2]["elements"][1]
    assert source_button["text"]["text"] == "PJM source"
    assert (
        source_button["url"]
        == "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition"
    )
    assert message["message_blocks"][3]["elements"][0]["text"] == (
        "Source definition: "
        "<https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition|"
        "PJM Data Miner 2 `rt_hrl_lmps`>"
    )
    assert message["payload"]["source_system"] == "PJM Data Miner 2"
    assert message["payload"]["source_feed"] == "rt_hrl_lmps"
    assert message["payload"]["rt_source"] == "verified"
    assert (
        message["payload"]["source_url"]
        == "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition"
    )


def test_pjm_rt_fivemin_release_slack_uses_source_without_report_link(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_rt_fivemin_hrl_lmp_release_slack(
        event={
            "id": 11,
            "event_key": (
                "pjm_rt_fivemin_hrl_lmps:data_ready:"
                "2026-06-30:hub_zone_interface"
            ),
        },
    )

    assert message["notification_key"] == (
        "pjm_rt_fivemin_hrl_lmps:data_ready:"
        "2026-06-30:hub_zone_interface:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 11
    assert message["dataset"] == "pjm_rt_fivemin_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM verified RT five-minute LMPs are available for 2026-06-30."
    )
    assert "report_url" not in message["payload"]
    assert message["payload"]["source_feed"] == "rt_fivemin_hrl_lmps"
    assert message["payload"]["pricing_node_scope"] == "hub_zone_interface"
    assert message["payload"]["interval_minutes"] == 5
    assert message["message_blocks"][0]["text"]["text"] == (
        "PJM RT 5-Min HRL LMPs Available"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-06-30"},
        {"type": "mrkdwn", "text": "*Dataset*\nVerified RT five-minute LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition|"
                "PJM Data Miner 2 - rt_fivemin_hrl_lmps>"
            ),
        },
    ]
    buttons = message["message_blocks"][2]["elements"]
    assert len(buttons) == 1
    assert buttons[0]["text"]["text"] == "PJM source"
    assert (
        buttons[0]["url"]
        == "https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition"
    )


def test_pjm_da_reserve_market_results_slack_uses_source_without_report_link(
    monkeypatch,
):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_da_reserve_market_results_release_slack(
        event={
            "id": 12,
            "event_key": (
                "pjm_da_reserve_market_results:data_ready:"
                "2026-07-02:locale_service"
            ),
        },
    )

    assert message["notification_key"] == (
        "pjm_da_reserve_market_results:data_ready:"
        "2026-07-02:locale_service:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 12
    assert message["dataset"] == "pjm_da_reserve_market_results"
    assert message["message_text"].startswith(
        "PJM DA reserve market results are available for 2026-07-02."
    )
    assert "report_url" not in message["payload"]
    assert message["payload"]["source_feed"] == "da_reserve_market_results"
    assert message["payload"]["scope"] == "locale_service"
    assert message["message_blocks"][0]["text"]["text"] == (
        "PJM DA Reserve Market Results Available"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-07-02"},
        {"type": "mrkdwn", "text": "*Dataset*\nDay-ahead reserve market results"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/"
                "da_reserve_market_results/definition|"
                "PJM Data Miner 2 - da_reserve_market_results>"
            ),
        },
    ]
    buttons = message["message_blocks"][2]["elements"]
    assert len(buttons) == 1
    assert buttons[0]["text"]["text"] == "PJM source"
    assert (
        buttons[0]["url"]
        == "https://dataminer2.pjm.com/feed/da_reserve_market_results/definition"
    )


def test_enqueue_slack_notification_is_idempotent(monkeypatch):
    captured: dict[str, object] = {}

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        captured["query"] = query
        captured["params"] = params
        captured["database"] = database
        captured["fetch"] = fetch
        return [
            {
                "id": 42,
                "notification_key": params[0],
                "channel_id": params[1],
                "status": "pending",
                "attempts": 0,
                "max_attempts": 6,
                "created": False,
            }
        ]

    monkeypatch.setattr(slack_notifications.db, "execute_sql", fake_execute_sql)

    row = slack_notifications.enqueue_slack_notification(
        notification_key="event-1:slack:release",
        channel_id="C123",
        channel_name="#alerts",
        message_text="Message",
        dataset="pjm_da_hrl_lmps",
        source_event_key="event-1",
        source_event_id=10,
        payload={"report_url": "https://example.test"},
        database="stage_db",
    )

    assert row["created"] is False
    assert "ON CONFLICT (notification_key, channel_id) DO NOTHING" in captured["query"]
    assert captured["database"] == "stage_db"
    assert captured["fetch"] is True
    assert captured["params"][0] == "event-1:slack:release"
    assert captured["params"][1] == "C123"


def test_send_due_slack_notifications_skips_when_disabled(monkeypatch):
    claimed = False

    def fake_claim_due_notifications(**_kwargs):
        nonlocal claimed
        claimed = True
        return []

    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_SLACK_NOTIFICATIONS_ENABLED",
        False,
    )
    monkeypatch.setattr(
        slack_notifications,
        "_claim_due_notifications",
        fake_claim_due_notifications,
    )

    assert slack_notifications.send_due_slack_notifications(database="stage_db") == []
    assert claimed is False


def test_send_due_slack_notifications_marks_failed_for_retry(monkeypatch):
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_SLACK_NOTIFICATIONS_ENABLED",
        True,
    )
    monkeypatch.setattr(
        slack_notifications,
        "_claim_due_notifications",
        lambda **_kwargs: [
            {
                "id": 7,
                "notification_key": "event-1:slack:release",
                "channel_id": "C123",
                "message_text": "Message",
                "message_blocks": None,
                "attempts": 1,
                "max_attempts": 6,
            }
        ],
    )
    monkeypatch.setattr(
        slack_notifications,
        "send_slack_message",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    def fake_mark_failed(**kwargs):
        calls.append(kwargs)
        return {
            "id": kwargs["notification_id"],
            "notification_key": "event-1:slack:release",
            "channel_id": "C123",
            "status": "failed",
            "attempts": kwargs["attempts"],
        }

    monkeypatch.setattr(slack_notifications, "_mark_notification_failed", fake_mark_failed)

    results = slack_notifications.send_due_slack_notifications(
        database="stage_db",
        now=now,
    )

    assert results[0]["status"] == "failed"
    assert calls[0]["notification_id"] == 7
    assert calls[0]["attempts"] == 1
    assert calls[0]["max_attempts"] == 6
    assert calls[0]["error_type"] == "RuntimeError"
    assert calls[0]["database"] == "stage_db"


def test_send_slack_message_uses_bot_token(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = '{"ok": true}'

        def json(self):
            return {"ok": True, "ts": "123.456", "channel": "C123"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(slack_notifications.credentials, "SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setattr(slack_notifications.requests, "post", fake_post)

    result = slack_notifications.send_slack_message(
        channel_id="C123",
        message_text="Message",
        timeout_seconds=5,
    )

    assert captured["url"] == slack_notifications.SLACK_POST_MESSAGE_URL
    assert captured["headers"]["Authorization"] == "Bearer xoxb-test"
    assert captured["json"] == {
        "channel": "C123",
        "text": "Message",
        "unfurl_links": False,
        "unfurl_media": False,
    }
    assert captured["timeout"] == 5
    assert result == {
        "provider": "slack_chat_post_message",
        "provider_message_id": "123.456",
        "provider_channel_id": "C123",
    }
