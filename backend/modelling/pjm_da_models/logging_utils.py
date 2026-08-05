"""Terminal logging helpers for backend modelling entrypoints."""

from __future__ import annotations

import logging
import os
import sys
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional


class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    YELLOW = "\033[33m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    BG_RED = "\033[41m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_MAGENTA = "\033[95m"


LEVEL_COLORS = {
    logging.DEBUG: Colors.DIM,
    logging.INFO: Colors.BRIGHT_GREEN,
    logging.WARNING: Colors.BRIGHT_YELLOW,
    logging.ERROR: Colors.BRIGHT_RED,
    logging.CRITICAL: Colors.BOLD + Colors.BG_RED + Colors.WHITE,
}

LEVEL_ICONS = {
    logging.DEBUG: "\U0001f50d",
    logging.INFO: "\u2139\ufe0f ",
    logging.WARNING: "\u26a0\ufe0f ",
    logging.ERROR: "\u274c",
    logging.CRITICAL: "\U0001f525",
}

ASCII_LEVEL_ICONS = {
    logging.DEBUG: "[DBG]",
    logging.INFO: "[INFO]",
    logging.WARNING: "[WARN]",
    logging.ERROR: "[ERR]",
    logging.CRITICAL: "[CRIT]",
}

_LOGGER_INSTANCE: Optional["PipelineLogger"] = None


def supports_unicode(stream=None) -> bool:
    stream = stream or sys.stdout
    encoding = getattr(stream, "encoding", None) or "utf-8"
    try:
        "\u2713 \u2139\ufe0f \u2500 \u23f1\ufe0f \u2705".encode(encoding)
    except Exception:
        return False
    return True


def supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    if sys.platform == "win32":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            return True
        except Exception:
            return os.environ.get("TERM") == "xterm"
    return True


def get_level_icon(levelno: int) -> str:
    if supports_unicode():
        return LEVEL_ICONS.get(levelno, "")
    return ASCII_LEVEL_ICONS.get(levelno, "")


def get_divider_char() -> str:
    return "\u2500" if supports_unicode() else "-"


class ColoredFormatter(logging.Formatter):
    def __init__(
        self,
        fmt: str,
        datefmt: str,
        *,
        use_colors: bool = True,
        use_icons: bool = True,
    ) -> None:
        super().__init__(fmt, datefmt)
        self.use_colors = use_colors and supports_color()
        self.use_icons = use_icons
        self._original_fmt = fmt
        self._colored_fmt = fmt.replace(
            "%(filename)s:%(funcName)s:%(lineno)d",
            "%(colored_location)s",
        )

    def format(self, record: logging.LogRecord) -> str:
        original_levelname = record.levelname
        original_msg = record.msg

        if self.use_colors:
            color = LEVEL_COLORS.get(record.levelno, Colors.RESET)
            record.levelname = f"{color}{record.levelname}{Colors.RESET}"
            record.colored_location = (
                f"{Colors.CYAN}{record.filename}{Colors.RESET}:"
                f"{Colors.BRIGHT_MAGENTA}{record.funcName}{Colors.RESET}:"
                f"{Colors.YELLOW}{record.lineno}{Colors.RESET}"
            )
            if record.levelno >= logging.WARNING:
                record.msg = f"{color}{record.msg}{Colors.RESET}"
            self._style._fmt = self._colored_fmt

        if self.use_icons:
            record.levelname = f"{get_level_icon(record.levelno)} {record.levelname}"

        result = super().format(record)
        record.levelname = original_levelname
        record.msg = original_msg
        if self.use_colors:
            self._style._fmt = self._original_fmt
        return result


def print_header(title: str, char: str = "=", length: int = 60) -> None:
    line = char * length
    centered = f" {title} ".center(length, char)
    print()
    if supports_color():
        print(f"{Colors.BRIGHT_CYAN}{line}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BRIGHT_CYAN}{centered}{Colors.RESET}")
        print(f"{Colors.BRIGHT_CYAN}{line}{Colors.RESET}")
    else:
        print(line)
        print(centered)
        print(line)


def print_section(title: str, side_len: int = 10) -> None:
    side = get_divider_char() * side_len
    print()
    if supports_color():
        print(f"{Colors.BRIGHT_BLUE}{side} {title} {side}{Colors.RESET}")
    else:
        print(f"{side} {title} {side}")


def print_divider(char: str = "-", length: int = 40, dim: bool = True) -> None:
    line = char * length
    if dim and supports_color():
        print(f"{Colors.DIM}{line}{Colors.RESET}")
    else:
        print(line)


def init_logging(
    name: str = "logger",
    log_dir: str | Path = "logs",
    level: int = logging.INFO,
    log_to_file: bool = False,
    log_to_console: bool = True,
    delete_if_no_errors: bool = True,
    use_colors: bool = True,
    use_icons: bool = True,
) -> "PipelineLogger":
    global _LOGGER_INSTANCE
    if _LOGGER_INSTANCE is not None:
        _LOGGER_INSTANCE.close()
    _LOGGER_INSTANCE = PipelineLogger(
        name=name,
        log_dir=log_dir,
        level=level,
        log_to_file=log_to_file,
        log_to_console=log_to_console,
        delete_if_no_errors=delete_if_no_errors,
        use_colors=use_colors,
        use_icons=use_icons,
    )
    return _LOGGER_INSTANCE


class PipelineLogger:
    def __init__(
        self,
        *,
        name: str,
        log_dir: str | Path,
        level: int,
        log_to_file: bool,
        log_to_console: bool,
        delete_if_no_errors: bool,
        use_colors: bool,
        use_icons: bool,
    ) -> None:
        self.name = name
        self.log_dir = Path(log_dir)
        self.log_to_file = log_to_file
        self.delete_if_no_errors = delete_if_no_errors
        self._has_errors = False
        self._log_file_path: Path | None = None
        self._file_handler: logging.FileHandler | None = None
        self._console_handler: logging.StreamHandler | None = None

        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)
        self.logger.handlers = []
        self.logger.propagate = False

        log_format = (
            "%(asctime)s | %(levelname)-8s | "
            "%(filename)s:%(funcName)s:%(lineno)d | %(message)s"
        )
        date_format = "%Y-%m-%d %H:%M:%S"

        if log_to_file:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%a_%b_%d_%H%M").lower()
            self._log_file_path = self.log_dir / f"{name}_{stamp}.log"
            self._file_handler = logging.FileHandler(self._log_file_path, encoding="utf-8")
            self._file_handler.setLevel(level)
            self._file_handler.setFormatter(logging.Formatter(log_format, date_format))
            self.logger.addHandler(self._file_handler)

        if log_to_console:
            self._console_handler = logging.StreamHandler(sys.stdout)
            self._console_handler.setLevel(level)
            self._console_handler.setFormatter(
                ColoredFormatter(
                    log_format,
                    date_format,
                    use_colors=use_colors,
                    use_icons=use_icons,
                )
            )
            self.logger.addHandler(self._console_handler)

    def info(self, msg: str) -> None:
        self.logger.info(msg)

    def warning(self, msg: str) -> None:
        self.logger.warning(msg)

    def error(self, msg: str) -> None:
        self._has_errors = True
        self.logger.error(msg)

    def exception(self, msg: str) -> None:
        self._has_errors = True
        self.logger.exception(msg)

    def success(self, msg: str) -> None:
        marker = "\u2713" if supports_unicode() else "+"
        if supports_color():
            self.logger.info(f"{Colors.BRIGHT_GREEN}{marker} {msg}{Colors.RESET}")
        else:
            self.logger.info(f"{marker} {msg}")

    @contextmanager
    def timer(self, name: str):
        started_at = datetime.now()
        start_label = "\u23f1\ufe0f  Starting" if supports_unicode() else "START"
        done_label = "\u2705 Completed" if supports_unicode() else "DONE"
        if supports_color():
            self.info(f"{Colors.BRIGHT_MAGENTA}{start_label}: {name}{Colors.RESET}")
        else:
            self.info(f"{start_label}: {name}")
        try:
            yield
        finally:
            elapsed = (datetime.now() - started_at).total_seconds()
            if supports_color():
                self.info(
                    f"{Colors.BRIGHT_GREEN}{done_label}: {name} ({elapsed:.2f}s)"
                    f"{Colors.RESET}"
                )
            else:
                self.info(f"{done_label}: {name} ({elapsed:.2f}s)")

    def close(self) -> None:
        if self._file_handler is not None:
            self._file_handler.close()
            self.logger.removeHandler(self._file_handler)
        if self._console_handler is not None:
            self._console_handler.close()
            self.logger.removeHandler(self._console_handler)
        if (
            self.delete_if_no_errors
            and self._log_file_path is not None
            and self._log_file_path.exists()
            and not self._has_errors
        ):
            self._log_file_path.unlink()
