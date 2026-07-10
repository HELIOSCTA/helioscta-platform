"""Packaged rule data for position and trade normalization."""

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
    "PRODUCT_ALIAS_SPECS",
    "PRODUCT_DEFINITION_SPECS",
    "ProductAliasSpec",
    "ProductDefinitionSpec",
    "product_alias_rows",
    "product_definition_rows",
]
