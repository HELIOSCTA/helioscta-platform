import os
from dotenv import load_dotenv
from pathlib import Path

import logging

logger = logging.getLogger(__name__)

env_file = Path(__file__).parent / ".env"
if env_file.exists():
    logger.debug("Loading %s", env_file)
    load_dotenv(dotenv_path=env_file, override=True)
else:
    logger.debug("No %s found; using process environment", env_file)


def _get_csv_env(name: str) -> list[str]:
    value = os.getenv(name, "")
    return [item.strip() for item in value.split(",") if item.strip()]


def _get_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return int(value.strip())


def _get_first_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value.strip()
    return default

# ────── Azure PostgreSQL ──────
AZURE_POSTGRESQL_DB_HOST = _get_first_env(
    "AZURE_POSTGRES_WRITER_HOST",
    "AZURE_POSTGRESQL_DB_HOST",
)
AZURE_POSTGRESQL_DB_USER = _get_first_env(
    "AZURE_POSTGRES_WRITER_USER",
    "AZURE_POSTGRESQL_DB_USER",
)
AZURE_POSTGRESQL_DB_PASSWORD = _get_first_env(
    "AZURE_POSTGRES_WRITER_PASSWORD",
    "AZURE_POSTGRESQL_DB_PASSWORD",
)
AZURE_POSTGRESQL_DB_PORT = _get_first_env(
    "AZURE_POSTGRES_WRITER_PORT",
    "AZURE_POSTGRESQL_DB_PORT",
    default="5432",
)
AZURE_POSTGRESQL_DB_NAME = _get_first_env(
    "AZURE_POSTGRES_WRITER_DBNAME",
    "AZURE_POSTGRESQL_DB_NAME",
    default="helios_prod",
)
AZURE_POSTGRESQL_DB_SSLMODE = _get_first_env(
    "AZURE_POSTGRES_WRITER_SSLMODE",
    "AZURE_POSTGRESQL_DB_SSLMODE",
    default="require",
)

# ────── AWS PostgreSQL (read-only) ──────
AWS_POSTGRESQL_DB_HOST = os.getenv("AWS_POSTGRESQL_DB_HOST")
AWS_POSTGRESQL_DB_USER = os.getenv("AWS_POSTGRESQL_DB_USER")
AWS_POSTGRESQL_DB_PASSWORD = os.getenv("AWS_POSTGRESQL_DB_PASSWORD")
AWS_POSTGRESQL_DB_PORT = os.getenv("AWS_POSTGRESQL_DB_PORT")
AWS_POSTGRESQL_DB_NAME = os.getenv("AWS_POSTGRESQL_DB_NAME")
AWS_POSTGRESQL_DB_SSLMODE = os.getenv("AWS_POSTGRESQL_DB_SSLMODE", "require")

# ────── Azure SQL Server ──────
AZURE_SQL_SERVER = os.getenv("AZURE_SQL_SERVER")
AZURE_SQL_USER = os.getenv("AZURE_SQL_USER")
AZURE_SQL_PASSWORD = os.getenv("AZURE_SQL_PASSWORD")

# ────── Azure Outlook (Graph API) ──────
AZURE_OUTLOOK_CLIENT_ID = os.getenv("AZURE_OUTLOOK_CLIENT_ID")
AZURE_OUTLOOK_TENANT_ID = os.getenv("AZURE_OUTLOOK_TENANT_ID")
AZURE_OUTLOOK_CLIENT_SECRET = os.getenv("AZURE_OUTLOOK_CLIENT_SECRET")
AZURE_OUTLOOK_SENDER = _get_first_env(
    "AZURE_OUTLOOK_SENDER",
    "HELIOS_EMAIL_FROM_ADDRESS",
)

# Email notifications. Disabled by default so production send behavior is
# opt-in through the VM environment file.
HELIOS_EMAIL_NOTIFICATIONS_ENABLED = _get_bool_env(
    "HELIOS_EMAIL_NOTIFICATIONS_ENABLED"
)
HELIOS_EMAIL_RECIPIENTS = (
    _get_csv_env("HELIOS_EMAIL_RECIPIENTS")
    or ["aidan.keaveny@helioscta.com"]
)
HELIOS_EMAIL_FRONTEND_BASE_URL = _get_first_env(
    "HELIOS_EMAIL_FRONTEND_BASE_URL",
    "FRONTEND_BASE_URL",
    default="https://frontend-helioscta.vercel.app",
)
HELIOS_EMAIL_MAX_ATTEMPTS = _get_int_env("HELIOS_EMAIL_MAX_ATTEMPTS", 6)
HELIOS_EMAIL_STALE_SENDING_MINUTES = _get_int_env(
    "HELIOS_EMAIL_STALE_SENDING_MINUTES",
    30,
)

# ────── Slack ──────
SLACK_DEFAULT_GROUP_ID = os.getenv("SLACK_DEFAULT_GROUP_ID")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN")
SLACK_DEFAULT_CHANNEL_NAME = os.getenv("SLACK_DEFAULT_CHANNEL_NAME")
SLACK_DEFAULT_WEBHOOK_URL = os.getenv("SLACK_DEFAULT_WEBHOOK_URL")
SLACK_DEFAULT_CHANNEL_ID = _get_first_env(
    "SLACK_DEFAULT_CHANNEL_ID",
    "SLACK_DEFAULT_GROUP_ID",
)
SLACK_POWER_ALERTS_CHANNEL_ID = _get_first_env("SLACK_POWER_ALERTS_CHANNEL_ID")
SLACK_POWER_ALERTS_CHANNEL_NAME = _get_first_env(
    "SLACK_POWER_ALERTS_CHANNEL_NAME",
    default="#helios-alerts-power",
)
HELIOS_SLACK_NOTIFICATIONS_ENABLED = _get_bool_env(
    "HELIOS_SLACK_NOTIFICATIONS_ENABLED"
)
HELIOS_SLACK_MAX_ATTEMPTS = _get_int_env("HELIOS_SLACK_MAX_ATTEMPTS", 6)
HELIOS_SLACK_STALE_SENDING_MINUTES = _get_int_env(
    "HELIOS_SLACK_STALE_SENDING_MINUTES",
    30,
)

# ────── POWER──────
# PJM CREDENTIALS
PJM_API_KEY = os.getenv("PJM_API_KEY")

# ERCOT Public API credentials
ERCOT_USERNAME = os.getenv("ERCOT_USERNAME")
ERCOT_PASSCODE = os.getenv("ERCOT_PASSCODE")
ERCOT_API_KEY = os.getenv("ERCOT_API_KEY")

# Azure Blob Storage for private source-file handoff to frontend email senders.
SFTP_FILES_STORAGE_CONNECTION_STRING = (
    os.getenv("SFTP_FILES_STORAGE_CONNECTION_STRING")
    or os.getenv("ALERT_ATTACHMENTS_STORAGE_CONNECTION_STRING")
    or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
)
ALERT_ATTACHMENTS_BLOB_ENABLED = _get_bool_env("ALERT_ATTACHMENTS_BLOB_ENABLED")
ALERT_ATTACHMENTS_BLOB_CONTAINER = (
    os.getenv("ALERT_ATTACHMENTS_BLOB_CONTAINER")
    or os.getenv("SFTP_FILES_BLOB_CONTAINER")
    or "sftp-files"
)

# ────── WSI ──────
WSI_TRADER_USERNAME = os.getenv("WSI_TRADER_USERNAME")
WSI_TRADER_NAME = os.getenv("WSI_TRADER_NAME")
WSI_TRADER_PASSWORD = os.getenv("WSI_TRADER_PASSWORD")

# ────── METEOLOGICA ──────
# Lower 48 (US48 aggregate) account
XTRADERS_API_USERNAME_L48 = os.getenv("XTRADERS_API_USERNAME_L48")
XTRADERS_API_PASSWORD_L48 = os.getenv("XTRADERS_API_PASSWORD_L48")

# ISO-level account (PJM, ERCOT, MISO, etc.)
XTRADERS_API_USERNAME_ISO = os.getenv("XTRADERS_API_USERNAME_ISO")
XTRADERS_API_PASSWORD_ISO = os.getenv("XTRADERS_API_PASSWORD_ISO")

# ────── ENERGY ASPECTS ──────
# ENERGY ASPECTS CREDENTIALS
ENERGY_ASPECTS_API_KEY = os.getenv("ENERGY_ASPECTS_API_KEY")

# ────── EIA ──────
# Free API key from https://www.eia.gov/opendata/register.php
EIA_API_KEY = os.getenv("EIA_API_KEY")

# ────── SFTP feeds (NAV / Marex / Clear Street / MUFG) ──────
# Clear Street uses an RSA private key (CLEAR_STREET_SSH_KEY_CONTENT),
# not a password. NAV/Marex/MUFG use password auth.
CLEAR_STREET_SFTP_HOST = os.getenv("CLEAR_STREET_SFTP_HOST")
CLEAR_STREET_SFTP_USER = os.getenv("CLEAR_STREET_SFTP_USER")
CLEAR_STREET_SFTP_PORT = int(os.getenv("CLEAR_STREET_SFTP_PORT")) if os.getenv("CLEAR_STREET_SFTP_PORT") else None
CLEAR_STREET_SFTP_REMOTE_DIR = r'/'
CLEAR_STREET_SSH_KEY_CONTENT = os.getenv("CLEAR_STREET_SSH_KEY_CONTENT")

MUFG_SFTP_HOST = os.getenv("MUFG_SFTP_HOST")
MUFG_SFTP_USER = os.getenv("MUFG_SFTP_USER")
MUFG_SFTP_PASSWORD = os.getenv("MUFG_SFTP_PASSWORD")
MUFG_SFTP_PORT = int(os.getenv("MUFG_SFTP_PORT")) if os.getenv("MUFG_SFTP_PORT") else None
MUFG_SFTP_REMOTE_DIR = r'/'

MAREX_SFTP_HOST = os.getenv("MAREX_SFTP_HOST")
MAREX_SFTP_USER = os.getenv("MAREX_SFTP_USER")
MAREX_SFTP_PASSWORD = os.getenv("MAREX_SFTP_PASSWORD")
MAREX_SFTP_PORT = int(os.getenv("MAREX_SFTP_PORT")) if os.getenv("MAREX_SFTP_PORT") else None
MAREX_SFTP_REMOTE_DIR = r'/'

NAV_SFTP_HOST = os.getenv("NAV_SFTP_HOST")
NAV_SFTP_USER = os.getenv("NAV_SFTP_USER")
NAV_SFTP_PASSWORD = os.getenv("NAV_SFTP_PASSWORD")
NAV_SFTP_PORT = int(os.getenv("NAV_SFTP_PORT")) if os.getenv("NAV_SFTP_PORT") else None
NAV_SFTP_REMOTE_DIR = os.getenv("NAV_SFTP_REMOTE_DIR") or r'/'
