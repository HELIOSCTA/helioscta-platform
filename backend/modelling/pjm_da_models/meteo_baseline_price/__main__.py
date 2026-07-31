"""Default smoke run for the direct-read Meteologica DA price baseline."""

from .pipelines import run_tomorrow
from .._entrypoint import run_entrypoint


if __name__ == "__main__":
    run_entrypoint(
        name="pjm_da_meteo_baseline_price_tomorrow",
        module_file=__file__,
        runner=run_tomorrow,
    )
