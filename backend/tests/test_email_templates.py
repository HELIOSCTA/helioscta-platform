from __future__ import annotations

from backend.utils import email_templates


def test_render_email_escapes_dynamic_values_and_uses_table_shell():
    html = email_templates.render_email(
        title="Clear Street <File>",
        preheader="preheader <hidden>",
        status_label="Loaded",
        status_tone="success",
        intro="Source <file> is ready.",
        facts=[("Trade date", "2026-07-08"), ("File", "a<b>.csv")],
        sections=[
            email_templates.text_section("Next action", "Review <mapping>."),
        ],
    )

    assert "<table role=\"presentation\"" in html
    assert "HeliosCTA Alerts" in html
    assert "Clear Street &lt;File&gt;" in html
    assert "a&lt;b&gt;.csv" in html
    assert "Review &lt;mapping&gt;." in html
    assert "<script" not in html


def test_product_warning_section_renders_actionable_product_identifiers():
    section = email_templates.product_warning_section(
        products=[
            {
                "product": "ALQ-Algonquin Citygates Basis Future",
                "row_count": 2,
                "source_fields": {
                    "futures_code": "H9",
                    "exch_comm_cd": "ALQ",
                    "exchange_name": "IPE",
                },
                "contract_year_months": ["202611"],
                "trade_statuses": ["New"],
            }
        ],
        product_count=1,
    )

    html = section["html"]
    assert "ALQ-Algonquin Citygates Basis Future" in html
    assert ">2<" in html
    assert "futures H9" in html
    assert "exch ALQ" in html
    assert "months 202611" in html
