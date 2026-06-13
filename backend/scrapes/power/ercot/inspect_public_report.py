"""Inspect an ERCOT Public Reports endpoint shape."""

from __future__ import annotations

from datetime import datetime
from pprint import pprint

from backend.scrapes.power.ercot import client


DEFAULT_ENDPOINT = "np6-905-cd/spp_node_zone_hub"
DEFAULT_DELIVERY_DATE = "2026-06-13"
DEFAULT_SETTLEMENT_POINT = "HB_NORTH"


def main(
    endpoint: str = DEFAULT_ENDPOINT,
    delivery_date: str = DEFAULT_DELIVERY_DATE,
    settlement_point: str | None = DEFAULT_SETTLEMENT_POINT,
    row_limit: int = 3,
) -> int:
    """Print field names and sample rows for one ERCOT Public Reports endpoint."""
    params: dict[str, object] = {
        "deliveryDateFrom": delivery_date,
        "deliveryDateTo": delivery_date,
        "DSTFlag": "false",
        "size": 1000000,
    }
    if settlement_point:
        params["settlementPoint"] = settlement_point

    response = client.make_get_request(
        endpoint,
        params=params,
        operation_name="inspect_public_report",
        log_fetch=False,
    )
    payload = response.json()
    fields = [field.get("name") for field in payload.get("fields", [])]
    data = payload.get("data") or []

    print(f"Endpoint: {endpoint}")
    print(f"Delivery date: {delivery_date}")
    print(f"Settlement point: {settlement_point or '(none)'}")
    print(f"Inspected at: {datetime.utcnow().isoformat()}Z")
    print(f"Rows returned: {len(data)}")
    print("Fields:")
    pprint(fields)
    print("Sample rows:")
    pprint(data[:row_limit])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

