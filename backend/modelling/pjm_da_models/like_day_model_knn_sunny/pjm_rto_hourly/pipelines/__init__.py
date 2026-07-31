"""PJM-backed KNN Sunny pipeline entrypoints."""


def run_single_day(*args: object, **kwargs: object) -> dict[str, object]:
    from .forecast_single_day import run

    return run(*args, **kwargs)

__all__ = ["run_single_day"]
