"""Page Object Model for HarvestLink login pages (`/login` and `/admin`).

Uses verified selectors from `src/features/auth/AuthPage.jsx`,
`src/components/common/PasswordInput.jsx`, `src/components/common/FormAlert.jsx`,
and `src/features/auth/AdminProtectedRoute.jsx`.
"""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Optional

from playwright.sync_api import Error as PlaywrightError, Page, expect

from utils.config import AutomationConfig, mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.login_page")


@dataclass(frozen=True)
class LoginOutcome:
    """Result observed after submitting the HarvestLink login form."""

    authenticated: bool
    current_url: str
    error_message: str


class LoginPage:
    """Encapsulates all interactions with the HarvestLink login form."""

    AUTH_PAGE_ROOT = "main.auth-page.auth-page-login"
    ADMIN_AUTH_ROOT = "main.auth-page.auth-page-login.auth-page-admin"
    ADMIN_ACCESS_SCREEN = "main.admin-access-screen"
    EMAIL_INPUT = "#email"
    PASSWORD_INPUT = "#password"
    SUBMIT_BUTTON = "button.auth-submit[type='submit']"
    FORM_ALERT_ERROR = ".form-alert.error[role='alert']"
    FORM_ALERT_TITLE = ".form-alert.error .form-alert-title"
    FORM_ALERT_BODY = ".form-alert.error .form-alert-body"
    EMAIL_ERROR = "#email-error"
    PASSWORD_ERROR = "#password-error"
    FIELD_ERROR = ".form-field .field-error, .form-field [role='alert']"
    APP_SHELL = ".app-shell"

    def __init__(self, page: Page, config: AutomationConfig) -> None:
        self.page = page
        self.config = config

    def open_login_page(self, *, admin_portal: bool = False) -> None:
        """Navigate to `/login` (or `/admin` for Admin Portal) and verify form visibility."""
        target_url = self.config.admin_login_url if admin_portal else self.config.login_url
        logger.info("Navigating to login page: %s", target_url)
        self.page.goto(target_url, wait_until="domcontentloaded", timeout=self.config.login_timeout_ms)

        if admin_portal:
            # AdminProtectedRoute first runs AdminNetworkGate before rendering AuthPage(adminPortal)
            form_or_gate = self.page.locator(f"{self.EMAIL_INPUT}, {self.ADMIN_ACCESS_SCREEN}").first
            form_or_gate.wait_for(state="visible", timeout=self.config.login_timeout_ms)
            if self.page.locator(self.ADMIN_ACCESS_SCREEN).is_visible():
                screen_text = self.page.locator(self.ADMIN_ACCESS_SCREEN).inner_text().strip()
                raise AssertionError(
                    f"Admin login portal is not accessible from this network/session: {screen_text}"
                )
            expect(self.page.locator(self.ADMIN_AUTH_ROOT)).to_be_visible(timeout=self.config.login_timeout_ms)
        else:
            expect(self.page.locator(self.AUTH_PAGE_ROOT)).to_be_visible(timeout=self.config.login_timeout_ms)

        expect(self.page.locator(self.EMAIL_INPUT)).to_be_visible(timeout=self.config.login_timeout_ms)
        expect(self.page.locator(self.PASSWORD_INPUT)).to_be_visible(timeout=self.config.login_timeout_ms)
        expect(self.page.locator(self.SUBMIT_BUTTON)).to_be_visible(timeout=self.config.login_timeout_ms)

    def fill_email(self, email: str) -> None:
        """Fill the email address input."""
        email_locator = self.page.locator(self.EMAIL_INPUT)
        email_locator.wait_for(state="visible", timeout=self.config.login_timeout_ms)
        email_locator.fill(email)
        logger.info("Entered email: %s", mask_email(email))

    def fill_password(self, password: str) -> None:
        """Fill the password input without logging the secret."""
        password_locator = self.page.locator(self.PASSWORD_INPUT)
        password_locator.wait_for(state="visible", timeout=self.config.login_timeout_ms)
        password_locator.fill(password)
        logger.info("Entered password: ********")

    def fill_credentials(self, email: str, password: str) -> None:
        """Fill both email and password inputs on the login form."""
        self.fill_email(email)
        self.fill_password(password)

    def blur_email(self) -> None:
        """Focus and blur the email input to trigger HarvestLink's onBlur validation."""
        email_locator = self.page.locator(self.EMAIL_INPUT)
        email_locator.focus()
        email_locator.blur()

    def blur_password(self) -> None:
        """Focus and blur the password input to trigger HarvestLink's onBlur validation."""
        password_locator = self.page.locator(self.PASSWORD_INPUT)
        password_locator.focus()
        password_locator.blur()

    def get_email_validation_error(self) -> str:
        """Wait for and return the visible email field validation error (`#email-error`)."""
        error_loc = self.page.locator(self.EMAIL_ERROR).first
        expect(error_loc).to_be_visible(timeout=self.config.login_timeout_ms)
        return error_loc.inner_text().strip()

    def get_password_validation_error(self) -> str:
        """Wait for and return the visible password field validation error (`#password-error`)."""
        error_loc = self.page.locator(self.PASSWORD_ERROR).first
        expect(error_loc).to_be_visible(timeout=self.config.login_timeout_ms)
        return error_loc.inner_text().strip()

    def install_manual_submission_listener(self) -> None:
        """Attach DOM listeners that detect an explicit manual submission attempt.

        Typing alone (input/change/blur) does NOT trigger submission.
        Detects:
        - HTML5 native `invalid` event (capture phase) when browser blocks submit
        - Form `submit` event (capture phase)
        - Clicking the Login submit button (enabled or disabled hitbox)
        - Pressing Enter inside the email or password input
        """
        self.page.evaluate(
            """() => {
                window.__hlManualSubmission = null;
                const record = (trigger) => {
                    if (window.__hlManualSubmission) return;
                    const emailEl = document.getElementById('email');
                    window.__hlManualSubmission = {
                        trigger,
                        emailValue: emailEl ? emailEl.value : '',
                        nativeValid: emailEl && typeof emailEl.checkValidity === 'function' ? emailEl.checkValidity() : true,
                        nativeMessage: emailEl ? (emailEl.validationMessage || '') : '',
                        timestamp: Date.now(),
                    };
                };

                document.addEventListener('invalid', (event) => {
                    const target = event.target;
                    if (target && (target.id === 'email' || target.id === 'password')) {
                        record('native-invalid');
                    }
                }, true);

                document.addEventListener('submit', (event) => {
                    if (event.target && event.target.tagName === 'FORM') {
                        record('form-submit');
                    }
                }, true);

                document.addEventListener('click', (event) => {
                    const btn = event.target && event.target.closest
                        ? event.target.closest("button.auth-submit[type='submit']")
                        : null;
                    if (btn) {
                        record('login-button-click');
                    }
                }, true);

                document.addEventListener('pointerdown', (event) => {
                    const btn = document.querySelector("button.auth-submit[type='submit']");
                    if (!btn) return;
                    const rect = btn.getBoundingClientRect();
                    if (
                        event.clientX >= rect.left && event.clientX <= rect.right &&
                        event.clientY >= rect.top && event.clientY <= rect.bottom
                    ) {
                        const emailEl = document.getElementById('email');
                        if (emailEl && btn.disabled) {
                            emailEl.blur();
                        }
                        record(btn.disabled ? 'login-button-disabled-click' : 'login-button-pointerdown');
                    }
                }, true);

                document.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter') return;
                    const target = event.target;
                    if (target && (target.id === 'email' || target.id === 'password')) {
                        if (target.id === 'email') {
                            target.blur();
                        }
                        record('enter-key');
                    }
                }, true);
            }"""
        )

    def wait_for_manual_submission(self, timeout_sec: int) -> dict:
        """Keep waiting until the tester explicitly submits the login form.

        Raises:
            RuntimeError: If the browser/page is closed before submission.
            TimeoutError: If `timeout_sec` expires without a manual submission attempt.
        """
        deadline = time.monotonic() + max(1, int(timeout_sec))
        while time.monotonic() < deadline:
            if self.page.is_closed():
                raise RuntimeError("Browser was closed before manual login submission.")

            try:
                if self.is_already_authenticated():
                    return {
                        "trigger": "navigated-authenticated",
                        "emailValue": "",
                        "nativeValid": True,
                        "nativeMessage": "",
                    }
                submission = self.page.evaluate("() => window.__hlManualSubmission")
            except PlaywrightError as exc:
                if self.page.is_closed() or "closed" in str(exc).lower():
                    raise RuntimeError("Browser was closed before manual login submission.") from exc
                # Navigation may be in progress right after manual submit
                return {
                    "trigger": "navigation-in-progress",
                    "emailValue": "",
                    "nativeValid": True,
                    "nativeMessage": "",
                }

            if submission:
                return submission

            self.page.wait_for_timeout(150)

        raise TimeoutError(
            f"Timed out after {timeout_sec}s waiting for manual email entry and login submission."
        )

    def attempt_email_validation_and_submit(self) -> dict:
        """Trigger browser-native + React email validation and click Login if enabled.

        Never forces clicks on disabled controls and never bypasses CAPTCHA.
        """
        if self.is_already_authenticated():
            return {"clicked_submit": False, "native_valid": True, "native_message": ""}

        email_loc = self.page.locator(self.EMAIL_INPUT).first
        if email_loc.count() > 0 and email_loc.is_visible():
            email_loc.blur()

        native = self.page.evaluate(
            """() => {
                const el = document.getElementById('email');
                if (!el) return { nativeValid: true, nativeMessage: '' };
                const valid = typeof el.reportValidity === 'function'
                    ? el.reportValidity()
                    : (typeof el.checkValidity === 'function' ? el.checkValidity() : true);
                return { nativeValid: Boolean(valid), nativeMessage: el.validationMessage || '' };
            }"""
        )

        clicked_submit = False
        submit_btn = self.page.locator(self.SUBMIT_BUTTON).first
        if (
            submit_btn.count() > 0
            and submit_btn.is_visible()
            and submit_btn.is_enabled()
            and not self.is_submitting()
        ):
            submit_btn.click()
            clicked_submit = True

        return {
            "clicked_submit": clicked_submit,
            "native_valid": bool(native.get("nativeValid", True)),
            "native_message": str(native.get("nativeMessage", "")).strip(),
        }

    def inspect_email_validation_state(self) -> dict:
        """Inspect actual post-submission validation, error alerts, and auth state."""
        authenticated = self.is_already_authenticated()
        email_error_loc = self.page.locator(self.EMAIL_ERROR).first
        custom_email_error = (
            email_error_loc.inner_text().strip()
            if email_error_loc.count() > 0 and email_error_loc.is_visible()
            else ""
        )
        form_error = self.get_error_message()

        dom_info = {"emailValue": "", "nativeValid": True, "nativeMessage": ""}
        if not authenticated and not self.page.is_closed():
            try:
                dom_info = self.page.evaluate(
                    """() => {
                        const el = document.getElementById('email');
                        if (!el) return { emailValue: '', nativeValid: true, nativeMessage: '' };
                        return {
                            emailValue: el.value || '',
                            nativeValid: typeof el.checkValidity === 'function' ? el.checkValidity() : true,
                            nativeMessage: el.validationMessage || '',
                        };
                    }"""
                )
            except PlaywrightError:
                pass

        return {
            "authenticated": authenticated,
            "current_url": self.page.url,
            "email_value": dom_info.get("emailValue", ""),
            "native_valid": bool(dom_info.get("nativeValid", True)),
            "native_message": str(dom_info.get("nativeMessage", "")).strip(),
            "custom_email_error": custom_email_error,
            "form_error": form_error,
        }

    def is_login_form_visible(self) -> bool:
        """Return True if the HarvestLink login form is currently visible."""
        form = self.page.locator(self.AUTH_PAGE_ROOT).first
        return form.count() > 0 and form.is_visible()

    def is_already_authenticated(self) -> bool:
        """Return True if the authenticated AppShell is already visible."""
        shell = self.page.locator(self.APP_SHELL).first
        return shell.count() > 0 and shell.is_visible()

    def is_submitting(self) -> bool:
        """Return True if the login button is currently in its submitting state."""
        submit_btn = self.page.locator(self.SUBMIT_BUTTON).first
        if submit_btn.count() == 0:
            return False
        aria_busy = (submit_btn.get_attribute("aria-busy") or "").strip().lower()
        btn_text = submit_btn.inner_text().strip().lower() if submit_btn.is_visible() else ""
        return aria_busy == "true" or "signing in" in btn_text

    def submit_login(self) -> bool:
        """Click the Sign in submit button if still on the login form and not already submitting.

        Returns:
            True if automation clicked the submit button, False if login was already
            submitted or authenticated manually by the tester.
        """
        if self.is_already_authenticated():
            logger.info("Already authenticated (%s); skipping Sign in button click.", self.page.url)
            return False

        if self.is_submitting():
            logger.info("Login submission is already in progress; skipping duplicate click.")
            return False

        if not self.is_login_form_visible():
            logger.info("Login form is no longer present (%s); skipping Sign in button click.", self.page.url)
            return False

        submit_btn = self.page.locator(self.SUBMIT_BUTTON)
        expect(submit_btn).to_be_visible(timeout=self.config.login_timeout_ms)
        expect(submit_btn).to_be_enabled(timeout=self.config.login_timeout_ms)
        logger.info("Submitting login form...")
        submit_btn.click()
        return True

    def get_error_message(self) -> str:
        """Return any visible form-level or field-level login error text."""
        alert = self.page.locator(self.FORM_ALERT_ERROR).first
        if alert.count() > 0 and alert.is_visible():
            title = ""
            body = ""
            title_loc = self.page.locator(self.FORM_ALERT_TITLE).first
            body_loc = self.page.locator(self.FORM_ALERT_BODY).first
            if title_loc.count() > 0 and title_loc.is_visible():
                title = title_loc.inner_text().strip()
            if body_loc.count() > 0 and body_loc.is_visible():
                body = body_loc.inner_text().strip()
            combined = " — ".join(part for part in (title, body) if part)
            return combined or alert.inner_text().strip()

        field_errors = [
            text.strip()
            for text in self.page.locator(self.FIELD_ERROR).all_inner_texts()
            if text.strip()
        ]
        return " | ".join(field_errors)

    def wait_for_login_result(
        self,
        *,
        expected_url_fragment: Optional[str] = None,
        expect_error: bool = False,
    ) -> LoginOutcome:
        """Wait explicitly for authentication redirect or a visible login error alert."""
        timeout = self.config.login_timeout_ms

        if expect_error:
            error_or_shell = self.page.locator(f"{self.FORM_ALERT_ERROR}, {self.APP_SHELL}").first
            error_or_shell.wait_for(state="visible", timeout=timeout)
            error_text = self.get_error_message()
            is_auth = self.page.locator(self.APP_SHELL).count() > 0 and self.page.locator(self.APP_SHELL).first.is_visible()
            return LoginOutcome(
                authenticated=is_auth,
                current_url=self.page.url,
                error_message=error_text,
            )

        # Positive login flow: wait for either authenticated shell or error alert
        shell_or_error = self.page.locator(f"{self.APP_SHELL}, {self.FORM_ALERT_ERROR}").first
        shell_or_error.wait_for(state="visible", timeout=timeout)

        error_text = self.get_error_message()
        if error_text:
            return LoginOutcome(
                authenticated=False,
                current_url=self.page.url,
                error_message=error_text,
            )

        if expected_url_fragment:
            self.page.wait_for_url(f"**{expected_url_fragment}**", timeout=timeout)

        expect(self.page.locator(self.APP_SHELL).first).to_be_visible(timeout=timeout)
        return LoginOutcome(
            authenticated=True,
            current_url=self.page.url,
            error_message="",
        )
