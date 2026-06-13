from __future__ import annotations

from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS


def test_dam_settlement_point_prices_reference_config_has_contract_fields():
    config = FEED_CONFIGS["dam_stlmnt_pnt_prices"]

    assert config.feed_name == "dam_stlmnt_pnt_prices"
    assert config.emil_id == "NP4-190-CD"
    assert config.report_type_id == 12331
    assert config.endpoint == "np4-190-cd/dam_stlmnt_pnt_prices"
    assert config.display_name == "DAM Settlement Point Prices"
    assert config.posting_frequency == "Event - Per DAM Run"
    assert config.retention_time == "N/A"
    assert set(config.primary_key).issubset(config.columns)
    assert config.primary_key == ("deliverydate", "hourending", "settlementpoint")
    assert config.default_params == {"DSTFlag": "false"}


def test_rt_settlement_point_prices_reference_config_has_contract_fields():
    config = FEED_CONFIGS["settlement_point_prices"]

    assert config.feed_name == "settlement_point_prices"
    assert config.emil_id == "NP6-905-CD"
    assert config.report_type_id == 12301
    assert config.endpoint == "np6-905-cd/spp_node_zone_hub"
    assert config.display_name == "Settlement Point Prices at Resource Nodes, Hubs and Load Zones"
    assert config.posting_frequency == "Chron - 15 Minutes"
    assert config.retention_time == "N/A"
    assert set(config.primary_key).issubset(config.columns)
    assert config.primary_key == (
        "deliverydate",
        "deliveryhour",
        "deliveryinterval",
        "settlementpoint",
    )
    assert config.default_params == {"DSTFlag": "false"}


def test_all_ercot_reference_configs_have_required_fields():
    for feed_name, config in FEED_CONFIGS.items():
        assert config.feed_name == feed_name
        assert config.emil_id
        assert config.report_type_id
        assert config.endpoint
        assert config.columns
        assert config.primary_key
        assert set(config.primary_key).issubset(config.columns)
        assert config.display_name
        assert config.category
        assert config.posting_frequency
        assert config.retention_time
