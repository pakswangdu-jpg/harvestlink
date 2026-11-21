"""Manual CAPTCHA coordination for HarvestLink login tests.

Never bypasses, disables, or automatically solves production CAPTCHA.
Pauses execution in headed Chromium so a human tester can complete the
challenge manually and confirm in the terminal, then verifies that the
login form reflects a valid, non-expired CAPTCHA state before continuing.
"""

from __future__ import annotations

import queue
import sys
import threading
import time
from dataclasses import dataclass
from typing import Optional

from playwright.sync_api import Page

from utils.test_logger import get_logger

logger = get_logger("harvestlink.captcha")


class CaptchaManualInterventionError(RuntimeError):
    """Raised when manual CAPTCHA completion cannot proceed (e.g., non-interactive terminal or timeout)."""


class CaptchaVerificationError(AssertionError):
    """Raised when the page reports an expired, failed, or incomplete CAPTCHA after confirmation."""


@dataclass(frozen=True)
class CaptchaStatus:
    """Observed CAPTCHA and login-form state on the HarvestLink login page."""

    provider: str
    widget_visible: bool
    submit_enabled: bool
    status_text: str
    error_text: str
    login_form_present: bool = True
    submission_in_progress: bool = False
    already_authenticated: bool = False
    login_error_text: str = ""


class CaptchaHandler:
    """Manages human-in-the-loop CAPTCHA verification on the login page."""

    AUTH_FORM = "main.auth-page.auth-page-login"
    APP_SHELL = ".app-shell"
    RECAPTCHA_CONTAINER = ".auth-recaptcha"
    RECAPTCHA_IFRAME = ".auth-recaptcha iframe[src*='recaptcha'], iframe[title*='reCAPTCHA' i]"
    HCAPTCHA_IFRAME = "iframe[src*='hcaptcha']"
    TURNSTILE_IFRAME = "iframe[src*='challenges.cloudflare.com']"
    STATUS_LOCATOR = ".auth-recaptcha-status"
    ERROR_LOCATOR = ".auth-recaptcha-error"
    FORM_ALERT_ERROR = ".form-alert.error[role='alert']"
    SUBMIT_BUTTON = "button.auth-submit[type='submit']"

    def __init__(self, page: Page, timeout_sec: int = 180) -> None:
        self.page = page
        self.timeout_sec = timeout_sec

    def detect_provider(self) -> str:
        """Identify the active CAPTCHA provider rendered on the page."""
        if self.page.locator(self.RECAPTCHA_IFRAME).count() > 0 or self.page.locator(self.RECAPTCHA_CONTAINER).count() > 0:
            return "Google reCAPTCHA v2"
        if self.page.locator(self.HCAPTCHA_IFRAME).count() > 0:
            return "hCaptcha"
        if self.page.locator(self.TURNSTILE_IFRAME).count() > 0:
            return "Cloudflare Turnstile"
        return "Unknown / Not Detected"

    def inspect_status(self) -> CaptchaStatus:
        """Inspect current CAPTCHA widget, login form, submission, and auth state."""
        auth_form = self.page.locator(self.AUTH_FORM).first
        login_form_present = auth_form.count() > 0 and auth_form.is_visible()

        app_shell = self.page.locator(self.APP_SHELL).first
        already_authenticated = app_shell.count() > 0 and app_shell.is_visible()

        provider = self.detect_provider()
        container = self.page.locator(self.RECAPTCHA_CONTAINER).first
        widget_visible = container.count() > 0 and container.is_visible()

        status_texts = [
            text.strip()
            for text in self.page.locator(self.STATUS_LOCATOR).all_inner_texts()
            if text.strip()
        ]
        error_texts = [
            text.strip()
            for text in self.page.locator(self.ERROR_LOCATOR).all_inner_texts()
            if text.strip()
        ]
        login_error_texts = [
            text.strip()
            for text in self.page.locator(self.FORM_ALERT_ERROR).all_inner_texts()
            if text.strip()
        ]

        submit_btn = self.page.locator(self.SUBMIT_BUTTON).first
        submit_exists = submit_btn.count() > 0
        submit_enabled = submit_btn.is_enabled() if submit_exists else False

        submission_in_progress = False
        if submit_exists:
            aria_busy = (submit_btn.get_attribute("aria-busy") or "").strip().lower()
            btn_text = submit_btn.inner_text().strip().lower() if submit_btn.is_visible() else ""
            submission_in_progress = aria_busy == "true" or "signing in" in btn_text

        return CaptchaStatus(
            provider=provider,
            widget_visible=widget_visible,
            submit_enabled=submit_enabled,
            status_text=" | ".join(status_texts),
            error_text=" | ".join(error_texts),
            login_form_present=login_form_present,
            submission_in_progress=submission_in_progress,
            already_authenticated=already_authenticated,
            login_error_text=" | ".join(login_error_texts),
        )

    def _wait_for_post_captcha_state(self, wait_ms: int = 5000) -> CaptchaStatus:
        """Wait briefly for React/reCAPTCHA state to settle after tester presses ENTER.

        Returns immediately as soon as any actionable state is observed:
        - User is already authenticated (dashboard loaded)
        - Authentication is already in progress (Sign in clicked manually)
        - Login submit button is enabled (ready for automation to click)
        - Login error alert appeared (e.g., invalid credentials already submitted)
        - CAPTCHA error or expiration is reported
        """
        deadline = time.monotonic() + (wait_ms / 1000.0)
        status = self.inspect_status()
        while time.monotonic() < deadline:
            if (
                status.already_authenticated
                or status.submission_in_progress
                or status.submit_enabled
                or bool(status.login_error_text)
                or bool(status.error_text)
                or "expired" in status.status_text.lower()
                or not status.login_form_present
            ):
                return status
            self.page.wait_for_timeout(200)
            status = self.inspect_status()
        return status

    def _wait_for_enter_with_timeout(self, prompt_text: str) -> None:
        """Wait for the tester to press ENTER in an interactive terminal within `timeout_sec`."""
        if not sys.stdin or not sys.stdin.isatty():
            raise CaptchaManualInterventionError(
                "Manual CAPTCHA verification requires an interactive terminal (TTY). "
                "Run pytest with `-s --headed` in an interactive PowerShell/terminal window."
            )

        result_queue: queue.Queue[Optional[str]] = queue.Queue(maxsize=1)

        def _reader() -> None:
            try:
                line = input(prompt_text)
                result_queue.put(line)
            except EOFError:
                result_queue.put(None)

        thread = threading.Thread(target=_reader, daemon=True)
        thread.start()

        try:
            response = result_queue.get(timeout=self.timeout_sec)
        except queue.Empty as exc:
            raise CaptchaManualInterventionError(
                f"Timed out after {self.timeout_sec}s waiting for manual CAPTCHA confirmation."
            ) from exc

        if response is None:
            raise CaptchaManualInterventionError(
                "Terminal input stream closed (EOF) before manual CAPTCHA confirmation."
            )

    def wait_for_manual_captcha(self, role_label: str) -> CaptchaStatus:
        """Pause before form submission so the tester can manually solve CAPTCHA.

        Does NOT assume pressing ENTER means CAPTCHA succeeded; validates page
        state afterwards for expiration, load errors, or an uncompleted challenge.
        """
        status_before = self.inspect_status()
        logger.info(
            "CAPTCHA detected: provider=%s | visible=%s | role=%s",
            status_before.provider,
            status_before.widget_visible,
            role_label,
        )

        if status_before.error_text:
            raise CaptchaVerificationError(
                f"CAPTCHA widget reported an error before verification: {status_before.error_text}"
            )
        if "not configured" in status_before.status_text.lower():
            raise CaptchaVerificationError(
                f"CAPTCHA is not configured on the target environment: {status_before.status_text}"
            )

        # Bring browser window to the front so the tester can immediately see the widget
        self.page.bring_to_front()

        prompt_block = (
            "\nCAPTCHA REQUIRED\n"
            "Solve the CAPTCHA in the browser.\n"
            "Press ENTER when finished...\n"
        )
        stream = sys.__stdout__ or sys.stdout
        stream.write(prompt_block)
        stream.flush()

        self._wait_for_enter_with_timeout("")

        status_after = self._wait_for_post_captcha_state(wait_ms=5000)
        logger.info(
            "Post-confirmation state: provider=%s | already_authenticated=%s | "
            "login_form_present=%s | submission_in_progress=%s | submit_enabled=%s | url=%s",
            status_after.provider,
            status_after.already_authenticated,
            status_after.login_form_present,
            status_after.submission_in_progress,
            status_after.submit_enabled,
            self.page.url,
        )

        # Scenario B: User already clicked Sign in manually and reached the dashboard or navigated away
        if status_after.already_authenticated:
            logger.info("Authenticated dashboard already detected after manual CAPTCHA.")
            return status_after

        if not status_after.login_form_present:
            logger.info("Login form is no longer present; continuing to verify navigation/dashboard.")
            return status_after

        if status_after.submission_in_progress:
            logger.info("Login submission is already in progress; waiting for authentication result.")
            return status_after

        if status_after.login_error_text:
            logger.info("Login error alert already visible after manual submission: %s", status_after.login_error_text)
            return status_after

        if status_after.error_text:
            raise CaptchaVerificationError(
                f"CAPTCHA verification failed on page: {status_after.error_text}"
            )
        if "expired" in status_after.status_text.lower():
            raise CaptchaVerificationError(
                f"CAPTCHA token expired before form submission: {status_after.status_text}"
            )
        if not status_after.submit_enabled:
            raise CaptchaVerificationError(
                "Login submit button is still disabled after pressing ENTER while still on the login form. "
                "CAPTCHA may be incomplete, expired, or rate-limited. "
                f"(url='{self.page.url}', status='{status_after.status_text or 'none'}')"
            )

        return status_after
