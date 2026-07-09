from __future__ import annotations

import logging

import pytest

from backend.scrapes.positions_and_trades import sql_generator
from backend.scrapes.positions_and_trades import product_lookup
from backend.scrapes.positions_and_trades.product_lookup import (
    ProductAliasRule,
    ProductDefinition,
    ProductRuleSet,
    find_product_alias,
    load_rule_set,
    validate_rule_set,
)
from backend.scrapes.positions_and_trades.product_rules import (
    ProductRuleInput,
    normalize_nav_position_product,
    normalize_position_product,
)


PRODUCT_RULE_FIXTURES = [
    {
        "name": "NAV daily BALMO contract parses yyyy-mm and day",
        "input": {
            "source": "nav",
            "product": "ICE NGAS HH SWG DLY DAY-3",
            "exchangeName": "IFED",
            "monthYear": "06/03/2026",
        },
        "expected": {
            "contract_month": "2026-06",
            "contract_yyyymm": "202606",
            "contract_yyyymmdd": "20260603",
            "contract_day": 3,
            "futures_month_code": "M",
            "futures_month_code_y": "M6",
            "futures_month_code_yy": "M26",
            "exchange_code": "HHD",
            "rule_group": "Gas",
            "rule_region": "Henry Hub",
            "ice_xl_symbol": "HHD B0-IUS",
            "is_option": False,
        },
    },
    {
        "name": "NAV monthly gas future derives CME code",
        "input": {
            "source": "nav",
            "product": "NATURAL GAS",
            "exchangeName": "NYM",
            "monthYear": "JAN27",
        },
        "expected": {
            "contract_month": "2027-01",
            "contract_yyyymm": "202701",
            "contract_day": None,
            "futures_month_code": "F",
            "futures_month_code_y": "F7",
            "futures_month_code_yy": "F27",
            "exchange_code": "NG",
            "rule_group": "Gas",
            "rule_region": "Henry Hub",
            "cme_excel_symbol": "1|G|XNYM:F:NG:202701",
            "is_option": False,
        },
    },
    {
        "name": "NAV gas option derives CME and Bloomberg option codes",
        "input": {
            "source": "nav",
            "product": "NYM EUR NATURAL GAS",
            "exchangeName": "NYM",
            "monthYear": "JAN27",
            "callPut": "CALL",
            "strikePrice": 4.25,
        },
        "expected": {
            "contract_month": "2027-01",
            "exchange_code": "LN",
            "rule_group": "Gas",
            "rule_region": "Henry Hub",
            "product_code_underlying": "NG",
            "put_call": "C",
            "strike_price": 4.25,
            "cme_excel_symbol": "1|G|XNYM:O:LN:202701:C:4.25",
            "bbg_symbol": "NGF7C 4.25",
            "bbg_option_description": "CALL JAN 2027 4.25",
            "is_option": True,
        },
    },
    {
        "name": "NAV weekly gas option derives weekly CME and description",
        "input": {
            "source": "nav",
            "product": "NATURAL GAS FINANCIAL Week 2",
            "exchangeName": "NYM",
            "monthYear": "JUL25",
            "callPut": "P",
            "strikePrice": 9,
        },
        "expected": {
            "contract_month": "2025-07",
            "exchange_code": "LN2",
            "rule_group": "Gas",
            "rule_region": "Henry Hub",
            "product_code_underlying": "NG",
            "put_call": "P",
            "cme_excel_symbol": "1|G|XNYM:O:KN2:202507:P:9",
            "bbg_option_description": "PUT JUL 2025 WKLY WEEK2 9.00",
            "is_option": True,
        },
    },
    {
        "name": "NAV short-term power daily contract uses D0 ICE symbol",
        "input": {
            "source": "nav",
            "product": "ICE PJM WH RTD",
            "exchangeName": "IFED",
            "monthYear": "06/30/2026",
        },
        "expected": {
            "contract_month": "2026-06",
            "contract_day": 30,
            "exchange_code": "PDP",
            "rule_group": "Power",
            "rule_region": "PJM",
            "ice_xl_symbol": "PDP D0-IUS",
            "is_option": False,
        },
    },
    {
        "name": "Unknown product leaves derived product fields null",
        "input": {
            "source": "nav",
            "product": "UNKNOWN PRODUCT",
            "exchangeName": "IFED",
            "monthYear": "not-a-contract",
        },
        "expected": {
            "contract_month": None,
            "contract_yyyymm": None,
            "exchange_code": None,
            "rule_group": None,
            "rule_region": None,
            "ice_xl_symbol": None,
            "cme_excel_symbol": None,
            "bbg_symbol": None,
            "is_option": False,
        },
    },
]


@pytest.mark.parametrize(
    "fixture",
    PRODUCT_RULE_FIXTURES,
    ids=[fixture["name"] for fixture in PRODUCT_RULE_FIXTURES],
)
def test_normalize_position_product_matches_frontend_fixtures(fixture):
    result = normalize_position_product(fixture["input"])

    for field, expected in fixture["expected"].items():
        assert getattr(result, field) == expected


def test_normalize_position_product_accepts_dataclass_input():
    result = normalize_position_product(
        ProductRuleInput(
            source="nav",
            product="NATURAL GAS",
            exchange_name="NYM",
            month_year="JAN27",
        )
    )

    assert result.exchange_code == "NG"
    assert result.contract_yyyymm == "202701"


def test_normalize_nav_position_product_forces_nav_source():
    result = normalize_nav_position_product(
        {
            "source": "marex",
            "product": "ICE PJM WH RTD",
            "exchangeName": "IFED",
            "monthYear": "06/30/2026",
        }
    )

    assert result.exchange_code == "PDP"
    assert result.rule_region == "PJM"


def test_explicit_exchange_code_overrides_alias_lookup():
    result = normalize_position_product(
        {
            "source": "nav",
            "product": "UNKNOWN PRODUCT",
            "exchangeCode": "NG",
            "monthYear": "JAN27",
        }
    )

    assert result.exchange_code == "NG"
    assert result.rule_group == "Gas"
    assert result.cme_excel_symbol == "1|G|XNYM:F:NG:202701"


def test_packaged_rule_json_is_valid():
    rule_set = load_rule_set()

    validate_rule_set(rule_set)
    assert len(rule_set.product_definitions) > 0
    assert len(rule_set.product_aliases) > 0
    assert len(rule_set.nav_aliases) > 0
    assert len(rule_set.clear_street_aliases) > 0


def test_regex_alias_matching_uses_first_matching_rule():
    alias = find_product_alias("nav", "ICE PJM OFF PK-12", is_option=False)

    assert alias is not None
    assert alias.exchange_code == "OPJ"


def test_clear_street_aliases_match_source_descriptions():
    future_alias = find_product_alias(
        "clear_street",
        "PMI-PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE",
        is_option=False,
    )
    option_alias = find_product_alias(
        "clear_street",
        "PMI-OPTION ON PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE",
        is_option=True,
    )

    assert future_alias is not None
    assert future_alias.exchange_code == "PMI"
    assert option_alias is not None
    assert option_alias.exchange_code == "P1X"


def test_clear_street_algonquin_alias_handles_source_futures_code():
    result = normalize_position_product(
        {
            "source": "clear_street",
            "product": "ALQ-Algonquin Citygates Basis Future",
            "exchangeCode": "H9",
            "exchangeName": "IPE",
            "contractYyyymm": "202611",
            "type": "F",
        }
    )

    assert result.exchange_code == "ALQ"
    assert result.rule_group == "Basis"
    assert result.rule_region == "Algonquin"
    assert result.exchange_name == "IFED"
    assert result.is_option is False
    assert result.ice_xl_symbol == "ALQ X26-IUS"


def test_clear_street_source_uses_clear_street_aliases():
    result = normalize_position_product(
        {
            "source": "clear_street",
            "product": "PMI-OPTION ON PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE",
            "type": "OPTION",
            "contractYyyymm": "202607",
            "callPut": "C",
            "strikePrice": 50,
        }
    )

    assert result.exchange_code == "P1X"
    assert result.rule_group == "Power"
    assert result.rule_region == "PJM"
    assert result.is_option is True


def test_rule_validation_rejects_unknown_alias_product_code():
    definition = ProductDefinition(
        exchange_code="NG",
        rule_group="Gas",
        rule_region="Henry Hub",
        exchange_code_underlying=None,
        bbg_exchange_code="NG",
        default_exchange_name="NYME",
    )
    alias = ProductAliasRule(
        source="nav",
        match_type="exact",
        pattern="NATURAL GAS",
        exchange_code="BAD",
    )

    with pytest.raises(ValueError, match="unknown exchange_code"):
        validate_rule_set(
            ProductRuleSet(
                product_definitions=(definition,),
                product_aliases=(alias,),
            )
        )


def test_default_rule_set_is_import_loaded():
    assert product_lookup.PRODUCTS_BY_CODE["NG"].rule_region == "Henry Hub"


def test_generated_clear_street_mufg_sql_contains_legacy_extract_shape():
    sql = sql_generator.build_clear_street_trades_mufg_latest_sql()

    assert sql.startswith("-- Generated by python -m")
    assert "clear_street_trades_mufg_latest.sql" in sql
    assert "Purpose: read-only latest MUFG Clear Street trade extract" in sql
    assert "CTE 01 - params" in sql
    assert "CTE 10 - trades_with_rules" in sql
    assert "CTE 13 - latest_sftp_date" in sql
    assert "Final select - legacy MUFG export shape" in sql
    assert "product_catalog(" in sql
    assert "product_aliases(" in sql
    assert "source_trades as (" in sql
    assert "trades_with_rules as (" in sql
    assert "trades_with_export_base as (" in sql
    assert "trades_with_export_codes as (" in sql
    assert "from clear_street.eod_transactions as t" in sql
    assert "give_in_out_firm_num in ('ADU', '905')" in sql
    assert "latest_sftp_date as (" in sql
    assert "product_code_grouping" in sql
    assert "product_code_region" in sql
    assert "'New' as trade_status" in sql
    assert "ice_product_code" in sql
    assert "cme_product_code" in sql
    assert "bbg_product_code" in sql
    assert "'PMI-PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE'" in sql
    assert "'unresolved_product'" in sql
    assert "'missing_contract_yyyymm'" in sql
    assert "'non_product_cash_adjustment'" in sql


def test_generated_nav_positions_sql_contains_grouped_latest_shape():
    sql = sql_generator.build_nav_positions_grouped_latest_sql()

    assert sql.startswith("-- Generated by python -m")
    assert "nav_positions/marts/grouped_latest.sql" in sql
    assert "Purpose: read-only NAV position query shaping" in sql
    assert "CTE 04 - source_positions" in sql
    assert "CTE 10 - positions_with_rules" in sql
    assert "Final select - grouped latest NAV positions" in sql
    assert "product_catalog(" in sql
    assert "product_aliases(" in sql
    assert "from nav.positions as p" in sql
    assert "latest_upload_by_fund as (" in sql
    assert "positions_with_rules as (" in sql
    assert "filtered_positions as (" in sql
    assert "product_code" in sql
    assert "product_family" in sql
    assert "market_name" in sql
    assert "underlying_product_code" in sql
    assert "contract_yyyymm" in sql
    assert "strike_price_normalized" in sql
    assert "'unresolved_product'" in sql
    assert "'unparsed_contract'" in sql
    assert "select * from final;" in sql


def test_generated_clear_street_sql_rejects_unsafe_source_table():
    with pytest.raises(ValueError, match="source_table"):
        sql_generator.build_clear_street_trades_mufg_latest_sql(
            source_table="clear_street.eod_transactions; drop table x"
        )


def test_generated_nav_positions_sql_rejects_unsafe_source_table():
    with pytest.raises(ValueError, match="source_table"):
        sql_generator.build_nav_positions_grouped_latest_sql(
            source_table="nav.positions; drop table x"
        )


def test_write_generated_sql_writes_clear_street_mufg_file(tmp_path):
    stale_path = tmp_path / "clear_street_unmatched_products.sql"
    stale_path.write_text("stale", encoding="utf-8")
    nested_stale_path = tmp_path / "nav_positions" / "checks" / "stale.sql"
    nested_stale_path.parent.mkdir(parents=True)
    nested_stale_path.write_text("stale", encoding="utf-8")

    written = sql_generator.write_generated_sql(output_dir=tmp_path)

    assert {path.relative_to(tmp_path).as_posix() for path in written} == {
        "clear_street_trades_mufg_latest.sql",
        "nav_positions/marts/grouped_latest.sql",
        "nav_positions/marts/grouped_with_raw_examples.sql",
        "nav_positions/marts/account_breakout.sql",
        "nav_positions/checks/rule_exceptions.sql",
        "nav_positions/checks/grouped_vs_raw_totals.sql",
        "nav_positions/drilldowns/raw_rows_for_group.sql",
    }
    assert not stale_path.exists()
    assert not nested_stale_path.exists()
    for path in written:
        text = path.read_text(encoding="utf-8")
        assert text.startswith("-- Generated by python -m")
        if path.name == "clear_street_trades_mufg_latest.sql":
            assert "clear_street.eod_transactions" in text
        else:
            assert "nav.positions" in text


def test_checked_in_generated_sql_is_current():
    for path, expected_sql in sql_generator.generated_files().items():
        assert path.read_text(encoding="utf-8") == expected_sql


def test_sql_generator_main_logs_pseudo_test_and_extract_path(
    tmp_path,
    caplog,
):
    caplog.set_level(logging.INFO, logger=sql_generator.LOGGER.name)

    exit_code = sql_generator.main(output_dir=tmp_path)

    assert exit_code == 0
    assert "Rule pseudo-test" in caplog.text
    assert "Rule pseudo-test passed" in caplog.text
    assert "clear_street_trades_mufg_latest.sql" in caplog.text
