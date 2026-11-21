"""HL-LOGIN-005: Invalid Login Negative Automation Test."""

from __future__ import annotations

import pytest
from playwright.sync_api import expect

from utils.config import get_invalid_credentials, mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.invalid_login")


@pytest.mark.login
@pytest.mark.negative
def test_invalid_login(
    configured_page,
    login_page,
    captcha_handler,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that invalid credentials are rejected with a clear login error and no session."""
    test_meta.test_case_id = "HL-LOGIN-005"
    test_meta.scenario = "Invalid Login Credentials Rejection"
    test_meta.role = "Invalid Login"
    test_meta.expected_result = "Authentication is rejected, an error alert is displayed, and user stays on /login."

    screenshots = screenshot_factory("invalid_login")
    credentials = get_invalid_credentials()
    test_meta.input_data = f"Email: {mask_email(credentials.email)} | Password: ********"

    logger.info("[%s] Starting Invalid Login negative test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    screenshots.capture_login_page(configured_page)

    login_page.fill_credentials(credentials.email, credentials.password)
    screenshots.capture_credentials_entered(configured_page)

    captcha_status = captcha_handler.wait_for_manual_captcha("Invalid Login")
    if captcha_status.login_error_text or captcha_status.already_authenticated:
        logger.info("[%s] Login attempt already processed manually; proceeding to verify rejection.", test_meta.test_case_id)
    else:
        screenshots.capture_captcha_completed(configured_page)
        login_page.submit_login()

    outcome = login_page.wait_for_login_result(expect_error=True)

    if outcome.authenticated:
        test_meta.actual_result = f"Unexpectedly authenticated with invalid credentials ({outcome.current_url})."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail("Security failure: invalid credentials unexpectedly authenticated.")

    if not outcome.error_message:
        test_meta.actual_result = "No login error message was displayed after invalid submission."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail("Expected a visible login error alert, but none was displayed.")

    # Verify user remains unauthenticated on the login page
    assert "/login" in configured_page.url, f"Expected to remain on /login, got: {configured_page.url}"
    expect(configured_page.locator(".app-shell")).to_have_count(0)
    expect(configured_page.locator(login_page.AUTH_PAGE_ROOT)).to_be_visible()

    test_meta.actual_result = f"Correctly rejected invalid login with error: '{outcome.error_message}'."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Invalid login rejection PASSED.", test_meta.test_case_id)
