from __future__ import annotations

import os

BBG_HOST = os.getenv("BBG_HOST", "localhost")
BBG_PORT = int(os.getenv("BBG_PORT", "8194"))
REFDATA_SERVICE = "//blp/refdata"
DEFAULT_FIELD = "PX_LAST"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 300
DEFAULT_EVENT_TIMEOUT_MILLISECONDS = 5000
