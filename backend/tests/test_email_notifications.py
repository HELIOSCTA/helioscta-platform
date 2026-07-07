from __future__ import annotations

import base64
from datetime import datetime, timezone

from backend.utils import email_notifications


def test_pjm_da_release_email_targets_single_day_report(monkeypatch):
    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )

    message = email_notifications.build_pjm_da_hrl_lmp_release_email(
        event={
            "id": 10,
            "event_key": "pjm_da_hrl_lmps:data_ready:2026-07-01:hub",
        },
        recipient_email="aidan.keaveny@helioscta.com",
    )

    assert message["notification_key"] == (
        "pjm_da_hrl_lmps:data_ready:2026-07-01:hub:email:release"
    )
    assert message["recipient_email"] == "aidan.keaveny@helioscta.com"
    assert message["source_event_id"] == 10
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=da" in report_url
    assert "date=2026-07-01" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url


def test_enqueue_email_notification_is_idempotent(monkeypatch):
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
                "recipient_email": params[1],
                "status": "pending",
                "attempts": 0,
                "max_attempts": 6,
                "created": False,
            }
        ]

    monkeypatch.setattr(email_notifications.db, "execute_sql", fake_execute_sql)

    row = email_notifications.enqueue_email_notification(
        notification_key="event-1:email:release",
        recipient_email="aidan.keaveny@helioscta.com",
        subject="Subject",
        body_text="Body",
        dataset="pjm_da_hrl_lmps",
        source_event_key="event-1",
        source_event_id=10,
        payload={"report_url": "https://example.test"},
        database="stage_db",
    )

    assert row["created"] is False
    assert "ON CONFLICT (notification_key, recipient_email) DO NOTHING" in captured["query"]
    assert captured["database"] == "stage_db"
    assert captured["fetch"] is True
    assert captured["params"][0] == "event-1:email:release"
    assert captured["params"][1] == "aidan.keaveny@helioscta.com"


def test_send_due_email_notifications_skips_when_disabled(monkeypatch):
    claimed = False

    def fake_claim_due_notifications(**_kwargs):
        nonlocal claimed
        claimed = True
        return []

    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_NOTIFICATIONS_ENABLED",
        False,
    )
    monkeypatch.setattr(
        email_notifications,
        "_claim_due_notifications",
        fake_claim_due_notifications,
    )

    assert email_notifications.send_due_email_notifications(database="stage_db") == []
    assert claimed is False


def test_send_due_email_notifications_marks_failed_for_retry(monkeypatch):
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_NOTIFICATIONS_ENABLED",
        True,
    )
    monkeypatch.setattr(
        email_notifications,
        "_claim_due_notifications",
        lambda **_kwargs: [
            {
                "id": 7,
                "notification_key": "event-1:email:release",
                "recipient_email": "aidan.keaveny@helioscta.com",
                "subject": "Subject",
                "body_text": "Body",
                "body_html": None,
                "attempts": 1,
                "max_attempts": 6,
            }
        ],
    )
    monkeypatch.setattr(
        email_notifications,
        "send_email_via_graph",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    def fake_mark_failed(**kwargs):
        calls.append(kwargs)
        return {
            "id": kwargs["notification_id"],
            "notification_key": "event-1:email:release",
            "recipient_email": "aidan.keaveny@helioscta.com",
            "status": "failed",
            "attempts": kwargs["attempts"],
        }

    monkeypatch.setattr(email_notifications, "_mark_notification_failed", fake_mark_failed)

    results = email_notifications.send_due_email_notifications(
        database="stage_db",
        now=now,
    )

    assert results[0]["status"] == "failed"
    assert calls[0]["notification_id"] == 7
    assert calls[0]["attempts"] == 1
    assert calls[0]["max_attempts"] == 6
    assert calls[0]["error_type"] == "RuntimeError"
    assert calls[0]["database"] == "stage_db"


def test_send_email_via_graph_supports_file_attachments(monkeypatch, tmp_path):
    attachment = tmp_path / "Helios_Transactions_20260706.csv"
    attachment.write_text("record_id\n1\n", encoding="utf-8")
    posts: list[dict[str, object]] = []

    class FakeResponse:
        def __init__(self, status_code: int, payload: dict[str, str] | None = None):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = "ok"

        def json(self):
            return self._payload

    def fake_post(url, **kwargs):
        posts.append({"url": url, **kwargs})
        if "login.microsoftonline.com" in url:
            return FakeResponse(200, {"access_token": "token"})
        return FakeResponse(202)

    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_CLIENT_ID",
        "client-id",
    )
    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_TENANT_ID",
        "tenant-id",
    )
    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_CLIENT_SECRET",
        "secret",
    )
    monkeypatch.setattr(email_notifications.requests, "post", fake_post)

    email_notifications.send_email_via_graph(
        sender_email="admin@helioscta.com",
        recipient_email="nav@example.test",
        subject="Clear Street",
        body_text="Attached.",
        attachments=[attachment],
    )

    assert len(posts) == 2
    send_payload = posts[1]["json"]
    assert posts[1]["url"].endswith("/users/admin@helioscta.com/sendMail")
    assert send_payload["message"]["toRecipients"] == [
        {"emailAddress": {"address": "nav@example.test"}}
    ]
    assert send_payload["message"]["attachments"] == [
        {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": attachment.name,
            "contentBytes": base64.b64encode(attachment.read_bytes()).decode(
                "utf-8"
            ),
        }
    ]
