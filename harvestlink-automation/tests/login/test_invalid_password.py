"""HL-LOGIN-007: Invalid Password Validation Test."""

from __future__ import annotations

import os

import pytest
from playwright.sync_api import expect

from utils.config import mask_email
from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.invalid_password")


@pytest.mark.login
@pytest.mark.negative
def test_invalid_password(
    configured_page,
    login_page,
    captcha_handler,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that a valid email format with an incorrect password is rejected."""
    target_email = (
        os.getenv("FARMER_EMAIL", "").strip()
        or os.getenv("BUYER_EMAIL", "").strip()
        or "qa.wrongpass@harvestlink.invalid"
    )
    wrong_password = "WrongPassword!9999"

    test_meta.test_case_id = "HL-LOGIN-007"
    test_meta.scenario = "Invalid Password Authentication Rejection"
    test_meta.role = "Validation"
    test_meta.input_data = f"Email: {mask_email(target_email)} | Password: ******** (incorrect)"
    test_meta.expected_result = "Authentication rejected with invalid credentials error."

    screenshots = screenshot_factory("invalid_password")

    logger.info("[%s] Starting Invalid Password validation test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    screenshots.capture_login_page(configured_page)

    login_page.fill_credentials(target_email, wrong_password)
    screenshots.capture_credentials_entered(configured_page)

    captcha_status = captcha_handler.wait_for_manual_captcha("Invalid Password")
    if not (captcha_status.login_error_text or captcha_status.already_authenticated):
        screenshots.capture_captcha_completed(configured_page)
        login_page.submit_login()

    outcome = login_page.wait_for_login_result(expect_error=True)

    if outcome.authenticated:
        test_meta.actual_result = f"Unexpectedly authenticated with wrong password ({outcome.current_url})."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail("Security failure: incorrect password unexpectedly authenticated.")

    if not outcome.error_message:
        test_meta.actual_result = "No authentication error alert displayed."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail("Expected authentication error alert for incorrect password, but none was displayed.")

    assert "/login" in configured_page.url, f"Expected to remain on /login, got: {configured_page.url}"
    expect(configured_page.locator(".app-shell")).to_have_count(0)

    test_meta.actual_result = f"Authentication rejected: {outcome.error_message}"
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Invalid password rejection PASSED.", test_meta.test_case_id)
