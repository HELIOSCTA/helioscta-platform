"""Read-only Postgres access for backend KNN Sunny models.

The connection boundary is shared with the Meteologica baseline model:
helios_prod only, helios_readonly only, no writes.
"""

from __future__ import annotations

from backend.modelling.pjm_da_models.db import (
    connect,
    fetch_df,
    stream_df,
)

__all__ = ["connect", "fetch_df", "stream_df"]
