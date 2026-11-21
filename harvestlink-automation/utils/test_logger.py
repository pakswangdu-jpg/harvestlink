"""Structured test logger for HarvestLink login automation.

Suppresses INFO/DEBUG terminal noise during normal test runs so the terminal
stays clean and minimal. Set `HL_DEBUG=1` to enable verbose console logging
for troubleshooting.
"""

from __future__ import annotations

import logging
import sys

from utils.terminal_reporter import is_debug_mode


def get_logger(name: str = "harvestlink.automation") -> logging.Logger:
    """Return a configured logger; silent on console unless HL_DEBUG=1."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        if is_debug_mode():
            handler: logging.Handler = logging.StreamHandler(sys.stdout)
            formatter = logging.Formatter(
                fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
                datefmt="%H:%M:%S",
            )
            handler.setFormatter(formatter)
            logger.setLevel(logging.DEBUG)
        else:
            handler = logging.NullHandler()
            logger.setLevel(logging.WARNING)
        logger.addHandler(handler)
        logger.propagate = False
    return logger
