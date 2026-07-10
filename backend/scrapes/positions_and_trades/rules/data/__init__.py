"""Packaged rule data for position and trade normalization."""

from backend.scrapes.positions_and_trades.rules.data.account_catalog import (
    ACCOUNT_LOOKUP_SPECS,
    AccountLookupSpec,
    account_lookup_rows,
)
from backend.scrapes.positions_and_trades.rules.data.product_alias_catalog import (
    PRODUCT_ALIAS_SPECS,
    ProductAliasSpec,
    product_alias_rows,
)
from backend.scrapes.positions_and_trades.rules.data.product_definition_catalog import (
    PRODUCT_DEFINITION_SPECS,
    ProductDefinitionSpec,
    product_definition_rows,
)

__all__ = [
    "ACCOUNT_LOOKUP_SPECS",
    "PRODUCT_ALIAS_SPECS",
    "PRODUCT_DEFINITION_SPECS",
    "AccountLookupSpec",
    "ProductAliasSpec",
    "ProductDefinitionSpec",
    "account_lookup_rows",
    "product_alias_rows",
    "product_definition_rows",
]
