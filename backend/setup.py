from setuptools import find_packages, setup

setup(
    name="helioscta-backend",
    version="0.1.0",
    package_dir={"backend": "."},
    packages=["backend"] + ["backend." + p for p in find_packages(exclude=["tests*"])],
    include_package_data=True,
    package_data={
        "backend.scrapes.positions_and_trades": [
            "sql/generated/clear_street_trades/mufg/*.sql",
            "sql/generated/nav_positions/checks/*.sql",
            "sql/generated/nav_positions/drilldowns/*.sql",
            "sql/generated/nav_positions/marts/*.sql",
            "sql/generated/README.md",
        ],
        "backend.scrapes.positions_and_trades.rules.data": ["*.json"],
    },
)
