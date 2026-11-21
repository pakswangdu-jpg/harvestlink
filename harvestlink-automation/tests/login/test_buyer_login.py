"""HL-LOGIN-002: Buyer Login Automation Test."""

from __future__ import annotations

import pytest

from utils.config import get_role_credentials, mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.buyer_login")


@pytest.mark.login
@pytest.mark.buyer
def test_buyer_login(
    configured_page,
    login_page,
    dashboard_page,
    captcha_handler,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that a registered Buyer can sign in and reach `/buyer-dashboard`."""
    test_meta.test_case_id = "HL-LOGIN-002"
    test_meta.scenario = "Valid Buyer Login"
    test_meta.role = "Buyer"
    test_meta.expected_result = "Buyer authenticates and is redirected to /buyer-dashboard."

    screenshots = screenshot_factory("buyer")
    credentials = get_role_credentials("buyer")
    test_meta.input_data = f"Email: {mask_email(credentials.email)} | Password: ********"

    logger.info("[%s] Starting Buyer login test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    screenshots.capture_login_page(configured_page)

    login_page.fill_credentials(credentials.email, credentials.password)
    screenshots.capture_credentials_entered(configured_page)

    captcha_status = captcha_handler.wait_for_manual_captcha("Buyer")
    if captcha_status.already_authenticated:
        logger.info("[%s] Buyer already authenticated after manual CAPTCHA/login.", test_meta.test_case_id)
    else:
        screenshots.capture_captcha_completed(configured_page)
        login_page.submit_login()

    outcome = login_page.wait_for_login_result(expected_url_fragment="/buyer-dashboard")

    if not outcome.authenticated:
        test_meta.actual_result = f"Authentication failed: {outcome.error_message or outcome.current_url}"
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(f"Buyer login failed: {outcome.error_message or 'Not authenticated'}")

    dashboard_page.verify_buyer_dashboard()
    test_meta.actual_result = f"Authenticated successfully and loaded Buyer dashboard ({configured_page.url})."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Buyer login PASSED.", test_meta.test_case_id)
