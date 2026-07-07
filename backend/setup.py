from setuptools import find_packages, setup

setup(
    name="helioscta-backend",
    version="0.1.0",
    package_dir={"backend": "."},
    packages=["backend"] + ["backend." + p for p in find_packages(exclude=["tests*"])],
    include_package_data=True,
    package_data={
        "backend.scrapes.positions_and_trades": [
            "generated_sql/*.sql",
            "generated_sql/nav_positions/checks/*.sql",
            "generated_sql/nav_positions/drilldowns/*.sql",
            "generated_sql/nav_positions/marts/*.sql",
            "generated_sql/README.md",
        ],
        "backend.scrapes.positions_and_trades.rules": ["*.json"],
    },
)
