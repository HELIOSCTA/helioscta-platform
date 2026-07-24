from __future__ import annotations

from backend import credentials


def test_email_senders_default_to_aidan():
    assert credentials.DEFAULT_OUTLOOK_SENDER == "aidan.keaveny@helioscta.com"
    assert credentials.AZURE_OUTLOOK_SENDER == "aidan.keaveny@helioscta.com"
    assert (
        credentials.CLEAR_STREET_NAV_EMAIL_SENDER
        == "aidan.keaveny@helioscta.com"
    )


def test_internal_email_recipient_list_includes_kapil():
    required = "kapil.saxena@helioscta.com"

    assert required in [
        recipient.lower() for recipient in credentials.HELIOS_EMAIL_RECIPIENTS
    ]


def test_clear_street_nav_recipient_list_is_nav_only():
    assert credentials.CLEAR_STREET_NAV_EMAIL_RECIPIENT == (
        "HeliosCTA@navfundservices.com"
    )
    assert [
        recipient.lower()
        for recipient in credentials.CLEAR_STREET_NAV_EMAIL_RECIPIENTS
    ] == ["helioscta@navfundservices.com"]


def test_required_email_recipient_is_appended_and_deduped():
    assert credentials._with_required_email_recipients(
        ["aidan.keaveny@helioscta.com"]
    ) == [
        "aidan.keaveny@helioscta.com",
        "Kapil.Saxena@HeliosCTA.com",
    ]

    assert credentials._with_required_email_recipients(
        ["Kapil.Saxena@HeliosCTA.com", "kapil.saxena@helioscta.com"]
    ) == ["Kapil.Saxena@HeliosCTA.com"]
