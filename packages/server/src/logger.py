from __future__ import annotations

import logging
import os


def build_logger() -> logging.Logger:
    logger = logging.getLogger("wudao.server")
    if logger.handlers:
        return logger

    level_name = os.environ.get("WUDAO_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logger.setLevel(level)

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


logger = build_logger()
