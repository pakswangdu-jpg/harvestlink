"""HL-LOGIN-004: Admin Login Automation Test."""

from __future__ import annotations

import pytest

from utils.config import get_role_credentials, mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.admin_login")


@pytest.mark.login
@pytest.mark.admin
def test_admin_login(
    configured_page,
    login_page,
    dashboard_page,
    captcha_handler,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that an authorized Admin can sign in at `/admin` and reach `/admin-dashboard`."""
    test_meta.test_case_id = "HL-LOGIN-004"
    test_meta.scenario = "Valid Admin Portal Login"
    test_meta.role = "Admin"
    test_meta.expected_result = "Admin authenticates via /admin portal and is redirected to /admin-dashboard."

    screenshots = screenshot_factory("admin")
    credentials = get_role_credentials("admin")
    test_meta.input_data = f"Email: {mask_email(credentials.email)} | Password: ********"

    logger.info("[%s] Starting Admin login test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=True)
    screenshots.capture_login_page(configured_page)

    login_page.fill_credentials(credentials.email, credentials.password)
    screenshots.capture_credentials_entered(configured_page)

    captcha_status = captcha_handler.wait_for_manual_captcha("Admin")
    if captcha_status.already_authenticated:
        logger.info("[%s] Admin already authenticated after manual CAPTCHA/login.", test_meta.test_case_id)
    else:
        screenshots.capture_captcha_completed(configured_page)
        login_page.submit_login()

    outcome = login_page.wait_for_login_result(expected_url_fragment="/admin-dashboard")

    if not outcome.authenticated:
        test_meta.actual_result = f"Authentication failed: {outcome.error_message or outcome.current_url}"
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(f"Admin login failed: {outcome.error_message or 'Not authenticated'}")

    dashboard_page.verify_admin_dashboard()
    test_meta.actual_result = f"Authenticated successfully and loaded Admin dashboard ({configured_page.url})."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Admin login PASSED.", test_meta.test_case_id)
