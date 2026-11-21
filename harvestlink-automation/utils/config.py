"""Configuration loader for HarvestLink login automation.

Loads base URL, role credentials, and timeouts from `.env` using python-dotenv.
Never hardcodes credentials or prints sensitive secrets.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

# Load .env from harvestlink-automation/ without overriding explicit shell env vars
load_dotenv(dotenv_path=ENV_FILE, override=False)


@dataclass(frozen=True)
class RoleCredentials:
    """Represents non-empty credentials for a single HarvestLink user role."""

    role: str
    email: str
    password: str

    def __repr__(self) -> str:
        return f"RoleCredentials(role={self.role!r}, email={mask_email(self.email)!r}, password='***')"


@dataclass(frozen=True)
class AutomationConfig:
    """Central runtime configuration for login tests."""

    base_url: str
    captcha_timeout_sec: int
    login_timeout_ms: int
    reports_dir: Path
    screenshots_dir: Path
    html_reports_dir: Path

    @property
    def login_url(self) -> str:
        return f"{self.base_url}/login"

    @property
    def admin_login_url(self) -> str:
        return f"{self.base_url}/admin"


def mask_email(email: str) -> str:
    """Return a privacy-safe representation of an email address for logs/reports."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    prefix = local[:2] if len(local) >= 2 else local[:1]
    return f"{prefix}***@{domain}"


def _parse_positive_int(env_key: str, default: int) -> int:
    raw = os.getenv(env_key, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def load_config() -> AutomationConfig:
    """Load and normalize runtime settings from environment variables."""
    base_url = os.getenv("BASE_URL", "https://harvestlink.dev").strip().rstrip("/")
    captcha_timeout_sec = _parse_positive_int("CAPTCHA_TIMEOUT", 180)
    login_timeout_ms = _parse_positive_int("LOGIN_TIMEOUT", 30000)
    reports_dir = PROJECT_ROOT / "reports"
    return AutomationConfig(
        base_url=base_url,
        captcha_timeout_sec=captcha_timeout_sec,
        login_timeout_ms=login_timeout_ms,
        reports_dir=reports_dir,
        screenshots_dir=reports_dir / "screenshots",
        html_reports_dir=reports_dir / "html",
    )


def get_role_credentials(role: str) -> RoleCredentials:
    """Load credentials for a role (`farmer`, `buyer`, `stakeholder`, `admin`).

    Raises:
        ValueError: If email or password is not configured in `.env`.
    """
    normalized = role.strip().lower()
    prefix_map = {
        "farmer": "FARMER",
        "buyer": "BUYER",
        "stakeholder": "STAKEHOLDER",
        "admin": "ADMIN",
    }
    if normalized not in prefix_map:
        raise ValueError(f"Unsupported role '{role}'. Expected one of: {', '.join(prefix_map)}")

    prefix = prefix_map[normalized]
    email = os.getenv(f"{prefix}_EMAIL", "").strip()
    password = os.getenv(f"{prefix}_PASSWORD", "")

    missing = []
    if not email:
        missing.append(f"{prefix}_EMAIL")
    if not password:
        missing.append(f"{prefix}_PASSWORD")

    if missing:
        raise ValueError(
            f"Missing required environment variable(s) for role '{normalized}': "
            f"{', '.join(missing)}. Copy .env.example to .env and populate test credentials."
        )

    return RoleCredentials(role=normalized, email=email, password=password)


def get_invalid_credentials() -> RoleCredentials:
    """Return synthetic non-existent credentials for negative login verification.

    Allows overriding via INVALID_EMAIL / INVALID_PASSWORD in `.env`, falling back
    to a clearly synthetic RFC-2606 `.invalid` test address that cannot authenticate.
    """
    email = os.getenv("INVALID_EMAIL", "qa.invalid.user@harvestlink.invalid").strip()
    password = os.getenv("INVALID_PASSWORD", "InvalidQaPass!9999")
    return RoleCredentials(role="invalid_login", email=email, password=password)
