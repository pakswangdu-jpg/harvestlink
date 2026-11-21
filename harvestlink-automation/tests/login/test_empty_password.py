"""HL-LOGIN-009: Empty Password Validation Test."""

from __future__ import annotations

import pytest
from playwright.sync_api import expect

from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.empty_password")


@pytest.mark.login
@pytest.mark.negative
def test_empty_password(
    configured_page,
    login_page,
    screenshot_factory,
    test_meta,
) -> None:
    """Verify that leaving the password field blank triggers required-password validation."""
    sample_email = "qa.validation@harvestlink.dev"

    test_meta.test_case_id = "HL-LOGIN-009"
    test_meta.scenario = "Empty Password Validation"
    test_meta.role = "Validation"
    test_meta.input_data = f"Email: {sample_email} | Password: (empty)"
    test_meta.expected_result = "Empty password rejected with required-password message."

    screenshots = screenshot_factory("empty_password")

    logger.info("[%s] Starting Empty Password validation test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    screenshots.capture_login_page(configured_page)

    login_page.fill_email(sample_email)
    login_page.fill_password("")
    login_page.blur_password()

    validation_message = login_page.get_password_validation_error()
    assert "password" in validation_message.lower(), (
        f"Expected required-password error message, got: '{validation_message}'"
    )
    assert "/login" in configured_page.url, f"Expected to remain on /login, got: {configured_page.url}"
    expect(configured_page.locator(".app-shell")).to_have_count(0)

    test_meta.actual_result = f"Password validation displayed: {validation_message}"
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Empty password validation PASSED.", test_meta.test_case_id)
