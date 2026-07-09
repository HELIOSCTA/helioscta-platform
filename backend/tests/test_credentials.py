from __future__ import annotations

from backend import credentials


def test_email_senders_default_to_aidan():
    assert credentials.DEFAULT_OUTLOOK_SENDER == "aidan.keaveny@helioscta.com"
    assert credentials.AZURE_OUTLOOK_SENDER == "aidan.keaveny@helioscta.com"
    assert (
        credentials.CLEAR_STREET_NAV_EMAIL_SENDER
        == "aidan.keaveny@helioscta.com"
    )
