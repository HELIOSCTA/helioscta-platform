"""Product definition and alias lookup for position and trade rules."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

RULES_ROOT = Path(__file__).resolve().parents[1] / "data"
PRODUCT_DEFINITIONS_PATH = RULES_ROOT / "product_definitions.json"
PRODUCT_ALIASES_PATH = RULES_ROOT / "product_aliases.json"

PRODUCT_RULE_GROUPS = {"Gas", "Power", "Basis"}
PRODUCT_ALIAS_SOURCES = {"nav", "marex", "clear_street", "any"}
PRODUCT_ALIAS_MATCH_TYPES = {"exact", "regex"}
PRODUCT_ALIAS_OPTION_TYPES = {"option", "future"}
EXCHANGE_NAMES = {"IFED", "NYME"}


@dataclass(frozen=True)
class ProductDefinition:
    exchange_code: str
    rule_group: str
    rule_region: str
    exchange_code_underlying: str | None
    bbg_exchange_code: str | None
    default_exchange_name: str | None

    @classmethod
    def from_json(cls, row: dict[str, Any]) -> "ProductDefinition":
        return cls(
            exchange_code=_required_text(row, "exchangeCode").upper(),
            rule_group=_required_text(row, "ruleGroup"),
            rule_region=_required_text(row, "ruleRegion"),
            exchange_code_underlying=_optional_upper_text(row.get("exchangeCodeUnderlying")),
            bbg_exchange_code=_optional_upper_text(row.get("bbgExchangeCode")),
            default_exchange_name=_optional_upper_text(row.get("defaultExchangeName")),
        )


@dataclass(frozen=True)
class ProductAliasRule:
    source: str
    match_type: str
    pattern: str
    exchange_code: str
    option_type: str | None = None

    @classmethod
    def from_json(cls, row: dict[str, Any]) -> "ProductAliasRule":
        return cls(
            source=_required_text(row, "source"),
            match_type=_required_text(row, "matchType"),
            pattern=_required_text(row, "pattern"),
            exchange_code=_required_text(row, "exchangeCode").upper(),
            option_type=_optional_text(row.get("optionType")),
        )


@dataclass(frozen=True)
class ProductLookupMatch:
    definition: ProductDefinition
    alias: ProductAliasRule | None


@dataclass(frozen=True)
class ProductRuleSet:
    product_definitions: tuple[ProductDefinition, ...]
    product_aliases: tuple[ProductAliasRule, ...]

    @property
    def products_by_code(self) -> dict[str, ProductDefinition]:
        return {
            definition.exchange_code.upper(): definition
            for definition in self.product_definitions
        }

    @property
    def nav_aliases(self) -> tuple[ProductAliasRule, ...]:
        return tuple(
            alias for alias in self.product_aliases if alias.source in {"nav", "any"}
        )

    @property
    def clear_street_aliases(self) -> tuple[ProductAliasRule, ...]:
        return tuple(
            alias
            for alias in self.product_aliases
            if alias.source in {"clear_street", "any"}
        )


def load_rule_set(
    product_definitions_path: str | Path = PRODUCT_DEFINITIONS_PATH,
    product_aliases_path: str | Path = PRODUCT_ALIASES_PATH,
) -> ProductRuleSet:
    """Load and validate product definitions and alias rules from JSON files."""
    definitions = tuple(
        ProductDefinition.from_json(row)
        for row in _load_json_rows(Path(product_definitions_path))
    )
    aliases = tuple(
        ProductAliasRule.from_json(row)
        for row in _load_json_rows(Path(product_aliases_path))
    )
    rule_set = ProductRuleSet(
        product_definitions=definitions,
        product_aliases=aliases,
    )
    validate_rule_set(rule_set)
    return rule_set


def validate_rule_set(rule_set: ProductRuleSet) -> None:
    """Raise ValueError when the packaged product rule data is inconsistent."""
    failures = collect_rule_set_failures(rule_set)
    if failures:
        raise ValueError("Invalid product rule set:\n- " + "\n- ".join(failures))


def collect_rule_set_failures(rule_set: ProductRuleSet) -> list[str]:
    failures: list[str] = []
    seen_product_codes: set[str] = set()

    for definition in rule_set.product_definitions:
        code = definition.exchange_code.upper()
        if not code:
            failures.append("product definition has a blank exchange_code")
        if code in seen_product_codes:
            failures.append(f"duplicate product definition exchange_code {code!r}")
        seen_product_codes.add(code)
        if definition.rule_group not in PRODUCT_RULE_GROUPS:
            failures.append(
                f"product {code!r} has unsupported rule_group {definition.rule_group!r}"
            )
        if (
            definition.default_exchange_name is not None
            and definition.default_exchange_name not in EXCHANGE_NAMES
        ):
            failures.append(
                f"product {code!r} has unsupported default_exchange_name "
                f"{definition.default_exchange_name!r}"
            )

    products_by_code = rule_set.products_by_code
    for index, alias in enumerate(rule_set.product_aliases, start=1):
        label = f"alias #{index} pattern {alias.pattern!r}"
        if alias.source not in PRODUCT_ALIAS_SOURCES:
            failures.append(f"{label} has unsupported source {alias.source!r}")
        if alias.match_type not in PRODUCT_ALIAS_MATCH_TYPES:
            failures.append(f"{label} has unsupported match_type {alias.match_type!r}")
        if (
            alias.option_type is not None
            and alias.option_type not in PRODUCT_ALIAS_OPTION_TYPES
        ):
            failures.append(f"{label} has unsupported option_type {alias.option_type!r}")
        if alias.exchange_code not in products_by_code:
            failures.append(
                f"{label} references unknown exchange_code {alias.exchange_code!r}"
            )
        if alias.match_type == "regex":
            try:
                re.compile(alias.pattern)
            except re.error as exc:
                failures.append(f"{label} has invalid regex: {exc}")
        if alias.match_type == "exact" and normalize_product_text(alias.pattern) != alias.pattern:
            failures.append(
                f"{label} exact pattern should be normalized uppercase text"
            )

    return failures


def normalize_product_text(value: str | None) -> str | None:
    trimmed = value.strip() if value is not None else ""
    if not trimmed:
        return None
    return re.sub(r"\s+", " ", trimmed).upper()


def get_product_definition(
    exchange_code: str | None,
    *,
    rule_set: ProductRuleSet | None = None,
) -> ProductDefinition | None:
    if not exchange_code:
        return None
    selected_rule_set = rule_set or DEFAULT_RULE_SET
    return selected_rule_set.products_by_code.get(exchange_code.strip().upper())


def find_product_alias(
    source: str,
    product_name: str | None,
    is_option: bool,
    *,
    rule_set: ProductRuleSet | None = None,
) -> ProductAliasRule | None:
    normalized_product = normalize_product_text(product_name)
    if not normalized_product:
        return None

    selected_rule_set = rule_set or DEFAULT_RULE_SET
    for alias in selected_rule_set.product_aliases:
        if (
            _alias_source_matches(alias, source)
            and _alias_option_matches(alias, is_option)
            and _alias_pattern_matches(alias, normalized_product)
        ):
            return alias
    return None


def resolve_product_lookup(
    *,
    source: str,
    product_name: str | None = None,
    exchange_code: str | None = None,
    is_option: bool = False,
    rule_set: ProductRuleSet | None = None,
) -> ProductLookupMatch | None:
    selected_rule_set = rule_set or DEFAULT_RULE_SET

    explicit_definition = get_product_definition(
        exchange_code,
        rule_set=selected_rule_set,
    )
    if explicit_definition is not None:
        return ProductLookupMatch(definition=explicit_definition, alias=None)

    alias = find_product_alias(
        source,
        product_name,
        is_option,
        rule_set=selected_rule_set,
    )
    if alias is None:
        return None

    definition = get_product_definition(alias.exchange_code, rule_set=selected_rule_set)
    return ProductLookupMatch(definition=definition, alias=alias) if definition else None


def _load_json_rows(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"Expected {path} to contain a JSON array.")
    if not all(isinstance(row, dict) for row in payload):
        raise ValueError(f"Expected every row in {path} to be a JSON object.")
    return payload


def _required_text(row: dict[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing required text field {key!r}.")
    return value.strip()


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Expected optional text value, got {type(value).__name__}.")
    trimmed = value.strip()
    return trimmed or None


def _optional_upper_text(value: Any) -> str | None:
    text = _optional_text(value)
    return text.upper() if text else None


def _alias_source_matches(alias: ProductAliasRule, source: str) -> bool:
    return alias.source == "any" or alias.source == source


def _alias_option_matches(alias: ProductAliasRule, is_option: bool) -> bool:
    if alias.option_type is None:
        return True
    return is_option if alias.option_type == "option" else not is_option


def _alias_pattern_matches(alias: ProductAliasRule, normalized_product: str) -> bool:
    if alias.match_type == "exact":
        return normalized_product == alias.pattern
    return re.search(alias.pattern, normalized_product, flags=re.IGNORECASE) is not None


DEFAULT_RULE_SET = load_rule_set()
PRODUCT_DEFINITIONS = DEFAULT_RULE_SET.product_definitions
PRODUCT_ALIASES = DEFAULT_RULE_SET.product_aliases
PRODUCTS_BY_CODE = DEFAULT_RULE_SET.products_by_code
