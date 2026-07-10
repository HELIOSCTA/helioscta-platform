"""Account lookup rules for position and trade sources."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from backend.scrapes.positions_and_trades.rules.data.account_catalog import (
    account_lookup_rows,
)

ACCOUNT_LOOKUP_SOURCES = {"nav", "clear_street"}


@dataclass(frozen=True)
class AccountLookupRule:
    account_name: str
    account: str
    source: str
    source_label: str

    @classmethod
    def from_json(cls, row: dict[str, Any]) -> "AccountLookupRule":
        return cls(
            account_name=_required_text(row, "accountName").upper(),
            account=_required_text(row, "account"),
            source=_required_text(row, "source"),
            source_label=_required_text(row, "sourceLabel"),
        )

    @property
    def normalized_account(self) -> str:
        return normalize_account_text(self.account)


@dataclass(frozen=True)
class AccountRuleSet:
    account_lookups: tuple[AccountLookupRule, ...]

    @property
    def nav_accounts(self) -> tuple[AccountLookupRule, ...]:
        return tuple(rule for rule in self.account_lookups if rule.source == "nav")

    @property
    def clear_street_accounts(self) -> tuple[AccountLookupRule, ...]:
        return tuple(
            rule for rule in self.account_lookups if rule.source == "clear_street"
        )


def load_account_rule_set() -> AccountRuleSet:
    """Load and validate account lookup rules."""
    rule_set = AccountRuleSet(
        account_lookups=tuple(
            AccountLookupRule.from_json(row) for row in account_lookup_rows()
        )
    )
    validate_account_rule_set(rule_set)
    return rule_set


def validate_account_rule_set(rule_set: AccountRuleSet) -> None:
    """Raise ValueError when the packaged account lookup data is inconsistent."""
    failures = collect_account_rule_set_failures(rule_set)
    if failures:
        raise ValueError("Invalid account rule set:\n- " + "\n- ".join(failures))


def collect_account_rule_set_failures(rule_set: AccountRuleSet) -> list[str]:
    failures: list[str] = []
    seen_keys: set[tuple[str, str]] = set()

    for index, rule in enumerate(rule_set.account_lookups, start=1):
        label = f"account lookup #{index} account {rule.account!r}"
        if rule.source not in ACCOUNT_LOOKUP_SOURCES:
            failures.append(f"{label} has unsupported source {rule.source!r}")
        if rule.account_name != rule.account_name.upper():
            failures.append(f"{label} account_name should be uppercase text")

        key = (rule.source, rule.normalized_account)
        if key in seen_keys:
            failures.append(
                f"{label} duplicates source/account key {rule.source!r}/"
                f"{rule.normalized_account!r}"
            )
        seen_keys.add(key)

    return failures


def normalize_account_text(value: str | None) -> str:
    trimmed = value.strip() if value is not None else ""
    return re.sub(r"\s+", " ", trimmed).upper()


def find_account_lookup(
    source: str,
    account: str | None,
    *,
    rule_set: AccountRuleSet | None = None,
) -> AccountLookupRule | None:
    normalized_account = normalize_account_text(account)
    if not normalized_account:
        return None

    selected_rule_set = rule_set or DEFAULT_ACCOUNT_RULE_SET
    normalized_source = _normalize_source(source)
    for rule in selected_rule_set.account_lookups:
        if (
            rule.source == normalized_source
            and rule.normalized_account == normalized_account
        ):
            return rule
    return None


def _required_text(row: dict[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing required text field {key!r}.")
    return value.strip()


def _normalize_source(source: str) -> str:
    normalized_source = source.strip().lower()
    if normalized_source in {"clearstreet", "clear street", "clear_street"}:
        return "clear_street"
    return normalized_source


DEFAULT_ACCOUNT_RULE_SET = load_account_rule_set()
ACCOUNT_LOOKUPS = DEFAULT_ACCOUNT_RULE_SET.account_lookups
