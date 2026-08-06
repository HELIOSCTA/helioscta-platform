"""Default smoke run for the direct-read Meteologica DA price baseline."""

from backend.modelling.pjm_da_models._entrypoint import run_entrypoint
from backend.modelling.pjm_da_models.pipelines.tomorrow.meteo_baseline_price_meteo_da_price import (
    ENTRYPOINT_NAME,
    run,
)


if __name__ == "__main__":
    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
