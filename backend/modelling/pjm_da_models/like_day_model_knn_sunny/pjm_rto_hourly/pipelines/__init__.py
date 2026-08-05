"""PJM-backed KNN Sunny pipeline entrypoints."""


def run_tomorrow(*args: object, **kwargs: object) -> dict[str, object]:
    from .forecast_tomorrow import run

    return run(*args, **kwargs)


def run_single_day(*args: object, **kwargs: object) -> dict[str, object]:
    return run_tomorrow(*args, **kwargs)


__all__ = ["run_tomorrow", "run_single_day"]
