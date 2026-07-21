"""CAISO Historical OASIS bulk downloader helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from hashlib import sha256
import hmac
from io import BytesIO
import os
import time
from urllib.parse import quote, urlsplit
from zipfile import ZipFile

import pandas as pd
import requests

from backend.scrapes.power.caiso import _lmp
from backend.utils.ops_logging import log_api_fetch, redact_secrets


BULK_SEARCH_URL = "https://oasis-bulk.caiso.com/prod/search"
BULK_S3_BUCKET = "caiso-oasis-s3-prod-groupzips"
DEFAULT_AWS_REGION = "us-west-1"
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 5.0
CAISO_BULK_CA_BUNDLE_ENV_VAR = "CAISO_BULK_CA_BUNDLE"
REQUEST_PAYER = "requester"
UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"


@dataclass(frozen=True)
class BulkOasisFile:
    key: str
    size: int
    file_name: str
    group_name: str
    operating_date: str
    operating_hour: str | None = None
    last_modified: str | None = None


@dataclass(frozen=True)
class AwsCredentials:
    access_key_id: str
    secret_access_key: str
    session_token: str | None = None


def resolve_aws_credentials() -> AwsCredentials:
    """Resolve AWS credentials for CAISO requester-pays historical files."""
    access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
    secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    session_token = os.getenv("AWS_SESSION_TOKEN")

    if not access_key_id or not secret_access_key:
        raise RuntimeError(
            "CAISO historical OASIS files require AWS requester-pays "
            "credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY "
            "in the process environment or /etc/helioscta/backend.env."
        )
    return AwsCredentials(
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        session_token=session_token,
    )


def search_bulk_files(
    *,
    prefix: str,
    start_date: date,
    end_date: date,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    target_table: str | None = None,
    metadata: dict | None = None,
    database: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[BulkOasisFile, ...]:
    """Search CAISO's public Historical OASIS metadata endpoint."""
    params = {
        "prefix": prefix,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
    }
    parsed = urlsplit(BULK_SEARCH_URL)
    started = time.perf_counter()
    try:
        response = requests.get(
            BULK_SEARCH_URL,
            params=params,
            timeout=timeout_seconds,
            verify=_requests_verify(),
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        response.raise_for_status()
        rows = response.json()
        files = tuple(_bulk_file_from_row(row) for row in rows)
        _log_bulk_attempt(
            parsed_url=parsed,
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name="caiso_bulk_search",
            target_table=target_table,
            status="success",
            http_status=response.status_code,
            elapsed_ms=elapsed_ms,
            rows_returned=len(files),
            metadata={
                "bulk_prefix": prefix,
                "bulk_start_date": start_date.isoformat(),
                "bulk_end_date": end_date.isoformat(),
                **(metadata or {}),
            },
            database=database,
        )
        return files
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        _log_bulk_attempt(
            parsed_url=parsed,
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name="caiso_bulk_search",
            target_table=target_table,
            status="failure",
            http_status=(
                response.status_code
                if "response" in locals() and response is not None
                else None
            ),
            elapsed_ms=elapsed_ms,
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata={
                "bulk_prefix": prefix,
                "bulk_start_date": start_date.isoformat(),
                "bulk_end_date": end_date.isoformat(),
                **(metadata or {}),
            },
            database=database,
        )
        raise


def pull_bulk_lmps_for_trading_date(
    *,
    prefix: str,
    trading_date: date,
    nodes: list[str] | tuple[str, ...],
    source_query_name: str,
    source_version: int,
    pipeline_name: str,
    target_table: str,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    credentials: AwsCredentials | None = None,
    aws_region: str | None = None,
) -> pd.DataFrame:
    """Download and normalize CAISO Historical OASIS group ZIP rows for one day."""
    credentials = credentials or resolve_aws_credentials()
    region = aws_region or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    region = region or DEFAULT_AWS_REGION
    files = search_bulk_files(
        prefix=prefix,
        start_date=trading_date,
        end_date=trading_date,
        pipeline_name=pipeline_name,
        run_id=run_id,
        target_table=target_table,
        metadata=metadata,
        database=database,
    )
    files = _filter_lmp_files_for_prefix(prefix=prefix, files=files)
    if not files:
        return pd.DataFrame(columns=_lmp.TARGET_COLUMNS)

    frames: list[pd.DataFrame] = []
    for file_info in files:
        frame = fetch_bulk_lmp_file(
            file_info=file_info,
            nodes=nodes,
            source_query_name=source_query_name,
            source_version=source_version,
            pipeline_name=pipeline_name,
            target_table=target_table,
            run_id=run_id,
            database=database,
            metadata=metadata,
            credentials=credentials,
            aws_region=region,
        )
        if not frame.empty:
            frames.append(frame)

    if not frames:
        return pd.DataFrame(columns=_lmp.TARGET_COLUMNS)

    combined = pd.concat(frames, ignore_index=True)
    combined.drop_duplicates(subset=_lmp.PRIMARY_KEY, keep="last", inplace=True)
    combined.sort_values(_lmp.PRIMARY_KEY, inplace=True)
    combined.reset_index(drop=True, inplace=True)
    return combined[_lmp.TARGET_COLUMNS]


def fetch_bulk_lmp_file(
    *,
    file_info: BulkOasisFile,
    nodes: list[str] | tuple[str, ...],
    source_query_name: str,
    source_version: int,
    pipeline_name: str,
    target_table: str,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    credentials: AwsCredentials | None = None,
    aws_region: str | None = None,
) -> pd.DataFrame:
    """Download one requester-pays S3 group ZIP and normalize selected nodes."""
    credentials = credentials or resolve_aws_credentials()
    region = aws_region or DEFAULT_AWS_REGION
    started = time.perf_counter()
    parsed_url = urlsplit(_s3_object_url(file_info.key, region=region))
    try:
        response = _get_s3_object(
            key=file_info.key,
            credentials=credentials,
            region=region,
        )
        frame = parse_bulk_lmp_zip(
            response.content,
            nodes=nodes,
            source_query_name=source_query_name,
            source_version=source_version,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        _log_bulk_attempt(
            parsed_url=parsed_url,
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name="caiso_bulk_s3_get_object",
            target_table=target_table,
            status="success",
            http_status=response.status_code,
            elapsed_ms=elapsed_ms,
            rows_returned=len(frame),
            metadata={
                "bulk_bucket": BULK_S3_BUCKET,
                "bulk_key": file_info.key,
                "bulk_file_name": file_info.file_name,
                "bulk_group_name": file_info.group_name,
                "bulk_operating_hour": file_info.operating_hour,
                "request_payer": REQUEST_PAYER,
                **(metadata or {}),
            },
            database=database,
        )
        return frame
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        _log_bulk_attempt(
            parsed_url=parsed_url,
            pipeline_name=pipeline_name,
            run_id=run_id,
            operation_name="caiso_bulk_s3_get_object",
            target_table=target_table,
            status="failure",
            http_status=(
                response.status_code
                if "response" in locals() and response is not None
                else None
            ),
            elapsed_ms=elapsed_ms,
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata={
                "bulk_bucket": BULK_S3_BUCKET,
                "bulk_key": file_info.key,
                "bulk_file_name": file_info.file_name,
                "bulk_group_name": file_info.group_name,
                "bulk_operating_hour": file_info.operating_hour,
                "request_payer": REQUEST_PAYER,
                **(metadata or {}),
            },
            database=database,
        )
        raise


def parse_bulk_lmp_zip(
    content: bytes,
    *,
    nodes: list[str] | tuple[str, ...],
    source_query_name: str,
    source_version: int,
) -> pd.DataFrame:
    """Parse a CAISO bulk LMP group ZIP into the canonical LMP target shape."""
    raw_frames: list[pd.DataFrame] = []
    selected_nodes = {node.upper() for node in nodes}
    with ZipFile(BytesIO(content)) as archive:
        entries = [
            entry
            for entry in archive.infolist()
            if not entry.is_dir() and entry.filename.lower().endswith(".csv")
        ]
        for entry in entries:
            with archive.open(entry) as csv_file:
                frame = pd.read_csv(csv_file)
            if frame.empty:
                continue
            frame = _filter_bulk_nodes(frame, selected_nodes)
            if frame.empty:
                continue
            if "lmp_type" not in {
                column.strip().replace(" ", "_").replace("-", "_").lower()
                for column in frame.columns
            }:
                frame["LMP_TYPE"] = _lmp_type_from_filename(entry.filename)
            raw_frames.append(frame)

    if not raw_frames:
        return pd.DataFrame(columns=_lmp.TARGET_COLUMNS)

    raw = pd.concat(raw_frames, ignore_index=True)
    return _lmp.format_oasis_lmp_rows(
        raw,
        source_query_name=source_query_name,
        source_version=source_version,
    )


def _bulk_file_from_row(row: dict) -> BulkOasisFile:
    return BulkOasisFile(
        key=str(row["key"]),
        size=int(row.get("size") or row.get("Size") or 0),
        file_name=str(row.get("fileName") or row.get("file_name") or row["key"]),
        group_name=str(row.get("groupName") or row.get("group_name") or ""),
        operating_date=str(row.get("oprDate") or row.get("operating_date") or ""),
        operating_hour=(
            str(row["oprHour"]) if row.get("oprHour") is not None else None
        ),
        last_modified=(
            str(row["lastModified"]) if row.get("lastModified") is not None else None
        ),
    )


def _filter_lmp_files_for_prefix(
    *,
    prefix: str,
    files: tuple[BulkOasisFile, ...],
) -> tuple[BulkOasisFile, ...]:
    if prefix.upper() != "RTM_LMP":
        return files
    return tuple(file_info for file_info in files if file_info.operating_hour)


def _filter_bulk_nodes(
    frame: pd.DataFrame,
    selected_nodes: set[str],
) -> pd.DataFrame:
    if not selected_nodes:
        return frame

    rename_map = {
        column: column.strip().replace(" ", "_").replace("-", "_").lower()
        for column in frame.columns
    }
    normalized = frame.rename(columns=rename_map)
    for column in ("node_id", "node_id_xml", "node"):
        if column in normalized.columns:
            mask = normalized[column].astype(str).str.upper().isin(selected_nodes)
            return frame.loc[mask].copy()
    return frame


def _lmp_type_from_filename(filename: str) -> str:
    upper_name = filename.upper()
    for lmp_type in ("MGHG", "MCC", "MCE", "MCL", "LMP"):
        if f"_{lmp_type}_" in upper_name or upper_name.endswith(f"_{lmp_type}.CSV"):
            return lmp_type
    return "LMP"


def _get_s3_object(
    *,
    key: str,
    credentials: AwsCredentials,
    region: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
) -> requests.Response:
    url = _s3_object_url(key, region=region)
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        response: requests.Response | None = None
        headers = _signed_s3_headers(
            method="GET",
            key=key,
            credentials=credentials,
            region=region,
        )
        try:
            response = requests.get(
                url,
                headers=headers,
                timeout=timeout_seconds,
                verify=_requests_verify(),
            )
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            last_error = exc
            if attempt < max_attempts:
                time.sleep(
                    _retry_delay_seconds(
                        response=response,
                        default=retry_delay_seconds,
                    )
                )

    raise RuntimeError(
        f"Failed to download CAISO bulk OASIS object after "
        f"{max_attempts} attempts: {key} ({last_error})"
    )


def _signed_s3_headers(
    *,
    method: str,
    key: str,
    credentials: AwsCredentials,
    region: str,
    request_time: datetime | None = None,
) -> dict[str, str]:
    timestamp = request_time or datetime.utcnow()
    amz_date = timestamp.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = timestamp.strftime("%Y%m%d")
    host = _s3_host(region)
    canonical_uri = "/" + quote(key, safe="/~")
    headers = {
        "host": host,
        "x-amz-content-sha256": UNSIGNED_PAYLOAD,
        "x-amz-date": amz_date,
        "x-amz-request-payer": REQUEST_PAYER,
    }
    if credentials.session_token:
        headers["x-amz-security-token"] = credentials.session_token

    signed_headers = ";".join(sorted(headers))
    canonical_headers = "".join(
        f"{name}:{headers[name]}\n" for name in sorted(headers)
    )
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    canonical_request = "\n".join(
        [
            method,
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            UNSIGNED_PAYLOAD,
        ]
    )
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _signature_key(
        credentials.secret_access_key,
        date_stamp,
        region,
        "s3",
    )
    signature = hmac.new(
        signing_key,
        string_to_sign.encode("utf-8"),
        sha256,
    ).hexdigest()
    headers["Authorization"] = (
        "AWS4-HMAC-SHA256 "
        f"Credential={credentials.access_key_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return headers


def _signature_key(
    secret_access_key: str,
    date_stamp: str,
    region_name: str,
    service_name: str,
) -> bytes:
    key_date = _sign(("AWS4" + secret_access_key).encode("utf-8"), date_stamp)
    key_region = _sign(key_date, region_name)
    key_service = _sign(key_region, service_name)
    return _sign(key_service, "aws4_request")


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), sha256).digest()


def _s3_object_url(key: str, *, region: str) -> str:
    return f"https://{_s3_host(region)}/{quote(key, safe='/~')}"


def _s3_host(region: str) -> str:
    return f"{BULK_S3_BUCKET}.s3.{region}.amazonaws.com"


def _requests_verify() -> str | bool:
    return (
        os.getenv(CAISO_BULK_CA_BUNDLE_ENV_VAR)
        or os.getenv("REQUESTS_CA_BUNDLE")
        or True
    )


def _retry_delay_seconds(
    *,
    response: requests.Response | None,
    default: float,
) -> float:
    if response is None:
        return default
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(default, float(retry_after))
        except ValueError:
            return default
    if response.status_code in {429, 500, 502, 503, 504}:
        return max(default, 15.0)
    return default


def _log_bulk_attempt(
    *,
    parsed_url,
    pipeline_name: str | None,
    run_id: str | None,
    operation_name: str,
    target_table: str | None,
    status: str,
    http_status: int | None,
    elapsed_ms: int,
    rows_returned: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    metadata: dict | None = None,
    database: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="scrape",
        provider="caiso",
        pipeline_name=pipeline_name,
        run_id=run_id,
        operation_name=operation_name,
        feed_name=pipeline_name,
        target_table=target_table,
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status=status,
        http_status=http_status,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_returned,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata=metadata,
        database=database,
    )
