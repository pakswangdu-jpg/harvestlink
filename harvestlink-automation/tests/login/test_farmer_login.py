"""HL-LOGIN-001: Farmer Login Automation Test."""

from __future__ import annotations

import pytest

from utils.config import get_role_credentials, mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.farmer_login")


@pytest.mark.login
@pytest.mark.farmer
def test_farmer_login(
    configured_page,
    login_page,
    dashboard_page,
    captcha_handler,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that a registered Farmer can sign in and reach `/farmer-dashboard`."""
    test_meta.test_case_id = "HL-LOGIN-001"
    test_meta.scenario = "Valid Farmer Login"
    test_meta.role = "Farmer"
    test_meta.expected_result = "Farmer authenticates and is redirected to /farmer-dashboard."

    screenshots = screenshot_factory("farmer")
    credentials = get_role_credentials("farmer")
    test_meta.input_data = f"Email: {mask_email(credentials.email)} | Password: ********"

    logger.info("[%s] Starting Farmer login test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    screenshots.capture_login_page(configured_page)

    login_page.fill_credentials(credentials.email, credentials.password)
    screenshots.capture_credentials_entered(configured_page)

    captcha_status = captcha_handler.wait_for_manual_captcha("Farmer")
    if captcha_status.already_authenticated:
        logger.info("[%s] Farmer already authenticated after manual CAPTCHA/login.", test_meta.test_case_id)
    else:
        screenshots.capture_captcha_completed(configured_page)
        login_page.submit_login()

    outcome = login_page.wait_for_login_result(expected_url_fragment="/farmer-dashboard")

    if not outcome.authenticated:
        test_meta.actual_result = f"Authentication failed: {outcome.error_message or outcome.current_url}"
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(f"Farmer login failed: {outcome.error_message or 'Not authenticated'}")

    dashboard_page.verify_farmer_dashboard()
    test_meta.actual_result = f"Authenticated successfully and loaded Farmer dashboard ({configured_page.url})."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Farmer login PASSED.", test_meta.test_case_id)
