"""ERCOT Public Reports reference feed contracts.

These configs describe source shape for future promoted scrapes. They are not
runtime entry points and do not imply that a destination table exists.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ErcotPublicReportConfig:
    feed_name: str
    emil_id: str
    report_type_id: int
    endpoint: str
    display_name: str
    category: str
    posting_frequency: str
    retention_time: str
    columns: tuple[str, ...]
    primary_key: tuple[str, ...]
    date_columns: tuple[str, ...] = ()
    datetime_columns: tuple[str, ...] = ()
    numeric_columns: tuple[str, ...] = ()
    text_columns: tuple[str, ...] = ()
    default_params: dict[str, object] = field(default_factory=dict)
    sql_data_types: dict[str, str] = field(default_factory=dict)
    date_from_param: str | None = None
    date_to_param: str | None = None
    default_lookback_days: int = 0
    default_lookahead_days: int = 1
    target_schema: str = "ercot"
    target_database: str | None = None

    @property
    def target_table(self) -> str:
        return self.feed_name

    @property
    def target_table_fqn(self) -> str:
        return f"{self.target_schema}.{self.target_table}"


FEED_CONFIGS: dict[str, ErcotPublicReportConfig] = {
    "dam_stlmnt_pnt_prices": ErcotPublicReportConfig(
        feed_name="dam_stlmnt_pnt_prices",
        emil_id="NP4-190-CD",
        report_type_id=12331,
        endpoint="np4-190-cd/dam_stlmnt_pnt_prices",
        display_name="DAM Settlement Point Prices",
        category="Day-Ahead Market, Settlement Point Prices",
        posting_frequency="Event - Per DAM Run",
        retention_time="N/A",
        columns=(
            "deliverydate",
            "hourending",
            "settlementpoint",
            "settlementpointprice",
        ),
        primary_key=("deliverydate", "hourending", "settlementpoint"),
        date_columns=("deliverydate",),
        numeric_columns=("hourending", "settlementpointprice"),
        text_columns=("settlementpoint",),
        default_params={"DSTFlag": "false"},
        sql_data_types={
            "hourending": "INTEGER",
            "settlementpointprice": "DOUBLE PRECISION",
        },
        date_from_param="deliveryDateFrom",
        date_to_param="deliveryDateTo",
    ),
    "settlement_point_prices": ErcotPublicReportConfig(
        feed_name="settlement_point_prices",
        emil_id="NP6-905-CD",
        report_type_id=12301,
        endpoint="np6-905-cd/spp_node_zone_hub",
        display_name="Settlement Point Prices at Resource Nodes, Hubs and Load Zones",
        category="Real-Time Market, Settlement Point Prices",
        posting_frequency="Chron - 15 Minutes",
        retention_time="N/A",
        columns=(
            "deliverydate",
            "deliveryhour",
            "deliveryinterval",
            "settlementpoint",
            "settlementpointtype",
            "settlementpointprice",
        ),
        primary_key=(
            "deliverydate",
            "deliveryhour",
            "deliveryinterval",
            "settlementpoint",
        ),
        date_columns=("deliverydate",),
        numeric_columns=(
            "deliveryhour",
            "deliveryinterval",
            "settlementpointprice",
        ),
        text_columns=("settlementpoint", "settlementpointtype"),
        default_params={"DSTFlag": "false"},
        sql_data_types={
            "deliveryhour": "INTEGER",
            "deliveryinterval": "INTEGER",
            "settlementpointprice": "DOUBLE PRECISION",
        },
        date_from_param="deliveryDateFrom",
        date_to_param="deliveryDateTo",
        default_lookback_days=1,
        default_lookahead_days=0,
    ),
    "actual_system_load": ErcotPublicReportConfig(
        feed_name="actual_system_load",
        emil_id="NP6-346-CD",
        report_type_id=12304,
        endpoint="np6-346-cd/act_sys_load_by_fzn",
        display_name="Actual System Load by Forecast Zone",
        category="Load, Actual Load",
        posting_frequency="Hourly",
        retention_time="N/A",
        columns=(
            "operatingday",
            "hourending",
            "north",
            "south",
            "west",
            "houston",
            "total",
        ),
        primary_key=("operatingday", "hourending"),
        date_columns=("operatingday",),
        numeric_columns=(
            "hourending",
            "north",
            "south",
            "west",
            "houston",
            "total",
        ),
        default_params={"DSTFlag": "false"},
        sql_data_types={
            "hourending": "INTEGER",
            "north": "DOUBLE PRECISION",
            "south": "DOUBLE PRECISION",
            "west": "DOUBLE PRECISION",
            "houston": "DOUBLE PRECISION",
            "total": "DOUBLE PRECISION",
        },
        date_from_param="operatingDayFrom",
        date_to_param="operatingDayTo",
        default_lookback_days=7,
        default_lookahead_days=0,
    ),
    "seven_day_load_forecast": ErcotPublicReportConfig(
        feed_name="seven_day_load_forecast",
        emil_id="NP3-565-CD",
        report_type_id=12311,
        endpoint="np3-565-cd/lf_by_model_weather_zone",
        display_name="Seven-Day Load Forecast by Model and Weather Zone",
        category="Load, Load Forecast",
        posting_frequency="Hourly",
        retention_time="N/A",
        columns=(
            "posteddatetime",
            "deliverydate",
            "hourending",
            "coast",
            "east",
            "farwest",
            "north",
            "northcentral",
            "southcentral",
            "southern",
            "west",
            "systemtotal",
            "model",
        ),
        primary_key=("posteddatetime", "deliverydate", "hourending", "model"),
        datetime_columns=("posteddatetime",),
        date_columns=("deliverydate",),
        numeric_columns=(
            "hourending",
            "coast",
            "east",
            "farwest",
            "north",
            "northcentral",
            "southcentral",
            "southern",
            "west",
            "systemtotal",
        ),
        text_columns=("model",),
        default_params={"inUseFlag": "true", "DSTFlag": "false"},
        sql_data_types={
            "posteddatetime": "TIMESTAMP",
            "hourending": "INTEGER",
            "coast": "DOUBLE PRECISION",
            "east": "DOUBLE PRECISION",
            "farwest": "DOUBLE PRECISION",
            "north": "DOUBLE PRECISION",
            "northcentral": "DOUBLE PRECISION",
            "southcentral": "DOUBLE PRECISION",
            "southern": "DOUBLE PRECISION",
            "west": "DOUBLE PRECISION",
            "systemtotal": "DOUBLE PRECISION",
        },
        date_from_param="deliveryDateFrom",
        date_to_param="deliveryDateTo",
        default_lookback_days=0,
        default_lookahead_days=7,
    ),
}
