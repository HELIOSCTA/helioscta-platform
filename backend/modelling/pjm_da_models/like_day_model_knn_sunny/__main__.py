"""Run tomorrow's KNN Sunny model forecast."""

from backend.modelling.pjm_da_models._entrypoint import run_entrypoint
from backend.modelling.pjm_da_models.pipelines.tomorrow.like_day_knn_sunny_meteo_rto_hourly import (
    ENTRYPOINT_NAME,
    run,
)


if __name__ == "__main__":
    run_entrypoint(
        name=ENTRYPOINT_NAME,
        module_file=__file__,
        runner=run,
    )
