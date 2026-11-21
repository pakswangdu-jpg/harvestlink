"""Screenshot capture and evidence management for HarvestLink login tests.

Organizes real Playwright screenshots by role and execution timestamp,
masks password inputs so sensitive values are never exposed, and avoids
overwriting evidence from previous executions.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, List

from playwright.sync_api import Locator, Page

from utils.test_logger import get_logger

logger = get_logger("harvestlink.screenshots")


class ScreenshotHandler:
    """Captures and tracks structured screenshots for a single test execution."""

    STEP_LOGIN_PAGE = "01_login_page.png"
    STEP_CREDENTIALS_ENTERED = "02_credentials_entered.png"
    STEP_CAPTCHA_COMPLETED = "03_captcha_completed.png"
    STEP_FINAL_PASS = "04_final_result_PASS.png"
    STEP_FINAL_FAIL = "04_final_result_FAIL.png"

    def __init__(self, base_screenshots_dir: Path, role: str) -> None:
        self.role = role.strip().lower()
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        self.run_dir = base_screenshots_dir / self.role / self.timestamp
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.captured: Dict[str, Path] = {}
        self.final_captured: bool = False

    def _sensitive_locators(self, page: Page) -> List[Locator]:
        """Return locators for sensitive fields that must be masked in screenshots."""
        masks: List[Locator] = []
        password_input = page.locator("input#password, input[type='password']")
        if password_input.count() > 0:
            masks.append(password_input)
        return masks

    def _ensure_password_hidden(self, page: Page) -> None:
        """Ensure password input remains type='password' before capturing."""
        try:
            page.evaluate(
                """() => {
                    const pwd = document.getElementById('password');
                    if (pwd && pwd.tagName === 'INPUT') {
                        pwd.setAttribute('type', 'password');
                    }
                }"""
            )
        except Exception:
            # Page may have navigated or closed; proceed safely
            pass

    def capture(self, page: Page, filename: str, *, mask_sensitive: bool = True, full_page: bool = True) -> Path:
        """Capture a real Playwright screenshot and store it in the run folder."""
        self.run_dir.mkdir(parents=True, exist_ok=True)
        target_path = self.run_dir / filename

        masks: List[Locator] = []
        if mask_sensitive:
            self._ensure_password_hidden(page)
            masks = self._sensitive_locators(page)

        page.screenshot(
            path=str(target_path),
            full_page=full_page,
            mask=masks if masks else None,
        )
        self.captured[filename] = target_path
        logger.info("Saved screenshot: %s", target_path)
        return target_path

    def capture_login_page(self, page: Page) -> Path:
        return self.capture(page, self.STEP_LOGIN_PAGE, mask_sensitive=False)

    def capture_credentials_entered(self, page: Page) -> Path:
        return self.capture(page, self.STEP_CREDENTIALS_ENTERED, mask_sensitive=True)

    def capture_captcha_completed(self, page: Page) -> Path:
        return self.capture(page, self.STEP_CAPTCHA_COMPLETED, mask_sensitive=True)

    def capture_final_result(self, page: Page, passed: bool) -> Path:
        filename = self.STEP_FINAL_PASS if passed else self.STEP_FINAL_FAIL
        path = self.capture(page, filename, mask_sensitive=True)
        self.final_captured = True
        return path

    def list_screenshots(self) -> List[Path]:
        """Return captured screenshots in capture order."""
        return list(self.captured.values())
