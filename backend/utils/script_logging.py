from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Union
from zoneinfo import ZoneInfo

_logger_instance: Optional["PipelineLogger"] = None


class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_CYAN = "\033[96m"


LEVEL_COLORS = {
    logging.DEBUG: Colors.DIM,
    logging.INFO: Colors.BRIGHT_GREEN,
    logging.WARNING: Colors.BRIGHT_YELLOW,
    logging.ERROR: Colors.BRIGHT_RED,
    logging.CRITICAL: Colors.BOLD + Colors.RED,
}


def mountain_now() -> datetime:
    return datetime.now(ZoneInfo("America/Denver"))


def utc_now() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


def get_log_dir(default: Union[str, Path]) -> Path:
    configured = os.environ.get("HELIOS_LOG_DIR")
    if configured:
        return Path(configured)
    return Path(default)


def init_logging(
    name: str = "logger",
    log_dir: Union[str, Path] = "logs",
    level: int = logging.INFO,
    log_to_file: bool = True,
    delete_if_no_errors: bool = True,
    capture_root: bool = True,
) -> "PipelineLogger":
    global _logger_instance
    if _logger_instance is not None:
        _logger_instance.close()

    _logger_instance = PipelineLogger(
        name=name,
        log_dir=log_dir,
        level=level,
        log_to_file=log_to_file,
        delete_if_no_errors=delete_if_no_errors,
        capture_root=capture_root,
    )
    return _logger_instance


def close_logging() -> None:
    global _logger_instance
    if _logger_instance is not None:
        _logger_instance.close()
        _logger_instance = None


def supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    if sys.platform == "win32":
        return bool(os.environ.get("TERM")) or "MINGW" in os.environ.get("MSYSTEM", "")
    return True


class ColoredFormatter(logging.Formatter):
    def __init__(self, fmt: str, datefmt: str | None = None) -> None:
        super().__init__(fmt, datefmt)
        self.use_colors = supports_color()

    def format(self, record: logging.LogRecord) -> str:
        original_levelname = record.levelname
        original_msg = record.msg
        try:
            if self.use_colors:
                color = LEVEL_COLORS.get(record.levelno, "")
                record.levelname = f"{color}{record.levelname}{Colors.RESET}"
                if record.levelno >= logging.WARNING:
                    record.msg = f"{color}{record.msg}{Colors.RESET}"
            return super().format(record)
        finally:
            record.levelname = original_levelname
            record.msg = original_msg


class PipelineLogger:
    def __init__(
        self,
        name: str,
        log_dir: Union[str, Path],
        level: int = logging.INFO,
        log_to_file: bool = True,
        delete_if_no_errors: bool = True,
        capture_root: bool = True,
    ) -> None:
        self.name = name
        self.log_dir = Path(log_dir)
        self.level = level
        self.log_to_file = log_to_file
        self.delete_if_no_errors = delete_if_no_errors
        self.capture_root = capture_root
        self._has_errors = False
        self._log_file_path: Optional[Path] = None
        self._handlers: list[logging.Handler] = []

        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)
        self.logger.handlers = []
        self.logger.propagate = False
        self._setup_handlers()

    @property
    def log_file_path(self) -> Optional[Path]:
        return self._log_file_path

    def _setup_handlers(self) -> None:
        file_formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(filename)s:%(funcName)s:%(lineno)d | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        console_formatter = ColoredFormatter(
            "%(asctime)s | %(levelname)-8s | %(filename)s:%(funcName)s:%(lineno)d | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        if self.log_to_file:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            timestamp = mountain_now().strftime("%a_%b_%d_%H%M").lower()
            self._log_file_path = self.log_dir / f"{self.name}_{timestamp}.log"
            file_handler = logging.FileHandler(self._log_file_path, encoding="utf-8")
            file_handler.setLevel(logging.INFO)
            file_handler.setFormatter(file_formatter)
            self.logger.addHandler(file_handler)
            self._handlers.append(file_handler)

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(self.level)
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)
        self._handlers.append(console_handler)

        if self.capture_root:
            root_logger = logging.getLogger()
            root_logger.setLevel(self.level)
            root_logger.handlers = []
            for handler in self._handlers:
                root_logger.addHandler(handler)

        for noisy_logger in ["azure", "urllib3", "httpx", "asyncio"]:
            logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    def debug(self, msg: str) -> None:
        self.logger.debug(msg, stacklevel=2)

    def info(self, msg: str) -> None:
        self.logger.info(msg, stacklevel=2)

    def warning(self, msg: str) -> None:
        self.logger.warning(msg, stacklevel=2)

    def error(self, msg: str) -> None:
        self._has_errors = True
        self.logger.error(msg, stacklevel=2)

    def exception(self, msg: str) -> None:
        self._has_errors = True
        self.logger.exception(msg, stacklevel=2)

    def critical(self, msg: str) -> None:
        self._has_errors = True
        self.logger.critical(msg, stacklevel=2)

    def success(self, msg: str) -> None:
        marker = "+"
        if supports_color():
            self.logger.info(
                "%s%s %s%s",
                Colors.BRIGHT_GREEN,
                marker,
                msg,
                Colors.RESET,
                stacklevel=2,
            )
        else:
            self.logger.info("%s %s", marker, msg, stacklevel=2)

    def header(self, title: str, char: str = "=", length: int = 60) -> None:
        line = char * length
        centered = f" {title} ".center(length, char)
        if supports_color():
            self.info(f"{Colors.BRIGHT_CYAN}{line}{Colors.RESET}")
            self.info(f"{Colors.BOLD}{Colors.BRIGHT_CYAN}{centered}{Colors.RESET}")
            self.info(f"{Colors.BRIGHT_CYAN}{line}{Colors.RESET}")
        else:
            self.info(line)
            self.info(centered)
            self.info(line)

    def section(self, title: str) -> None:
        self.info("")
        message = f"---------- {title} ----------"
        if supports_color():
            self.info(f"{Colors.BRIGHT_BLUE}{message}{Colors.RESET}")
        else:
            self.info(message)

    def close(self) -> None:
        root_logger = logging.getLogger()
        for handler in self._handlers:
            if handler in self.logger.handlers:
                self.logger.removeHandler(handler)
            if self.capture_root and handler in root_logger.handlers:
                root_logger.removeHandler(handler)
            handler.close()

        if (
            self.delete_if_no_errors
            and not self._has_errors
            and self._log_file_path
            and self._log_file_path.exists()
        ):
            os.remove(self._log_file_path)
