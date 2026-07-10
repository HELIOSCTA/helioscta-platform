"""Python source of truth for position and trade account lookups."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AccountLookupSpec:
    account_name: str
    account: str
    source: str
    source_label: str

    def as_json_row(self) -> dict[str, str]:
        return {
            "accountName": self.account_name,
            "account": self.account,
            "source": self.source,
            "sourceLabel": self.source_label,
        }


def nav(account_name: str, account: str) -> AccountLookupSpec:
    return AccountLookupSpec(
        account_name=account_name,
        account=account,
        source="nav",
        source_label="NAV Position File",
    )


def clear_street(account_name: str, account: str) -> AccountLookupSpec:
    return AccountLookupSpec(
        account_name=account_name,
        account=account,
        source="clear_street",
        source_label="Clear Street Trades",
    )


ACIM_ACCOUNTS = (
    nav("ACIM", "UBE 10051"),
    nav("ACIM", "51014112.0"),
    nav("ACIM", "51014112"),
    clear_street("ACIM", "EFD"),
    clear_street("ACIM", "365"),
)

PNT_ACCOUNTS = (
    nav("PNT", "ABN AMRO_1251PT034"),
    clear_street("PNT", "FCR"),
    clear_street("PNT", "690"),
)

DICKSON_ACCOUNTS = (
    nav("DICKSON", "RJO_35511229"),
    clear_street("DICKSON", "RJO"),
    clear_street("DICKSON", "685"),
)

TITAN_ACCOUNTS = (
    nav("TITAN", "969 ESKHL"),
    clear_street("TITAN", "ADU"),
    clear_street("TITAN", "905"),
)

ACCOUNT_LOOKUP_SPECS = (
    *ACIM_ACCOUNTS,
    *PNT_ACCOUNTS,
    *DICKSON_ACCOUNTS,
    *TITAN_ACCOUNTS,
)


def account_lookup_rows() -> list[dict[str, str]]:
    """Return account lookup rows in the engine input shape."""
    return [spec.as_json_row() for spec in ACCOUNT_LOOKUP_SPECS]
