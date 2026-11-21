"""HL-LOGIN-008: Manual Empty Email Validation Test with Terminal ENTER Confirmation.

Opens the HarvestLink login page in a visible Chromium browser without auto-filling
or auto-submitting. Waits for the tester to manually leave the email empty, interact
with the form/CAPTCHA/Login button, and press ENTER in the terminal to evaluate the
actual validation result and capture screenshot evidence.
"""

from __future__ import annotations

import os
import queue
import sys
import threading
from typing import Optional

import pytest
from playwright.sync_api import expect

from utils.test_logger import get_logger

logger = get_logger("harvestlink.test.empty_email")


def _get_manual_timeout(default_sec: int) -> int:
    raw = os.getenv("MANUAL_SUBMISSION_TIMEOUT", "").strip()
    if raw:
        try:
            value = int(raw)
            if value > 0:
                return value
        except ValueError:
            pass
    return default_sec


def _wait_for_terminal_enter(timeout_sec: int) -> None:
    """Display the manual empty-email prompt and wait for ENTER in an interactive terminal."""
    prompt_block = (
        "\nHARVESTLINK EMPTY EMAIL TEST\n"
        "------------------------------------\n"
        "Browser opened.\n\n"
        "Leave the email empty and click Login in the browser.\n"
        "Return to this terminal when finished.\n\n"
        "Press ENTER to validate and generate results...\n"
    )
    stream = sys.__stdout__ or sys.stdout
    stream.write(prompt_block)
    stream.flush()

    if not sys.stdin or not sys.stdin.isatty():
        raise RuntimeError(
            "Manual empty-email test requires an interactive terminal (TTY). "
            "Run pytest with `-s -q --headed` in an interactive VS Code / PowerShell terminal."
        )

    result_queue: queue.Queue[Optional[str]] = queue.Queue(maxsize=1)

    def _reader() -> None:
        try:
            result_queue.put(input(""))
        except EOFError:
            result_queue.put(None)

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()

    try:
        response = result_queue.get(timeout=timeout_sec)
    except queue.Empty as exc:
        raise TimeoutError(
            f"Timed out after {timeout_sec}s waiting for ENTER confirmation in terminal."
        ) from exc

    if response is None:
        raise RuntimeError("Terminal input stream closed (EOF) before ENTER confirmation.")


@pytest.mark.login
@pytest.mark.negative
def test_empty_email(
    configured_page,
    login_page,
    app_config,
    screenshot_factory,
    test_meta,
) -> None:
    """Wait for manual empty-email submission + terminal ENTER, then verify rejection."""
    test_meta.test_case_id = "HL-LOGIN-008"
    test_meta.module_name = "Login Process"
    test_meta.unit_name = "Farmer Login"
    test_meta.scenario = "Empty Email Validation"
    test_meta.test_type = "Negative Testing"
    test_meta.role = "Validation"
    test_meta.action_description = "User left email empty, attempted login manually, and confirmed via terminal ENTER"
    test_meta.expected_result = "Empty email must be rejected with required-email message"
    test_meta.custom_header = "HARVESTLINK LOGIN AUTOMATION"
    test_meta.detailed_report = True

    screenshots = screenshot_factory("empty_email")
    safety_timeout_sec = _get_manual_timeout(app_config.captcha_timeout_sec)

    logger.info("[%s] Opening HarvestLink login page for manual empty email test.", test_meta.test_case_id)
    login_page.open_login_page(admin_portal=False)
    configured_page.bring_to_front()

    try:
        _wait_for_terminal_enter(timeout_sec=safety_timeout_sec)
    except (TimeoutError, RuntimeError) as exc:
        test_meta.actual_result = str(exc)
        test_meta.validation_msg = "None"
        test_meta.dashboard_access = "No"
        if not configured_page.is_closed():
            screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(str(exc))

    if configured_page.is_closed():
        test_meta.actual_result = "Browser was closed before validation could run."
        test_meta.validation_msg = "None"
        test_meta.dashboard_access = "No"
        pytest.fail(test_meta.actual_result)

    state = login_page.inspect_email_validation_state()

    # If the tester did not already trigger validation/submission, evaluate via blur/reportValidity without bypassing CAPTCHA
    if not state["authenticated"] and not state["custom_email_error"] and not state["form_error"] and state["native_valid"]:
        attempt = login_page.attempt_email_validation_and_submit()
        if attempt["clicked_submit"] and not configured_page.is_closed():
            configured_page.wait_for_timeout(400)
        state = login_page.inspect_email_validation_state()

    entered_email = state["email_value"].strip()
    test_meta.input_email = entered_email or "(empty)"
    test_meta.input_data = f"Email: {test_meta.input_email}"

    if state["authenticated"] or "/login" not in state["current_url"]:
        test_meta.dashboard_access = "Yes"
        test_meta.validation_msg = "None"
        test_meta.actual_result = f"Empty email was not rejected; navigated to {state['current_url']}."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(test_meta.actual_result)

    custom_msg = state["custom_email_error"]
    native_msg = state["native_message"]
    form_msg = state["form_error"]
    validation_msg = custom_msg or native_msg or form_msg
    test_meta.validation_msg = validation_msg or "None"
    test_meta.dashboard_access = "No"

    if entered_email:
        test_meta.actual_result = f"Email field was not empty (entered: '{entered_email}')."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(test_meta.actual_result)

    if not validation_msg:
        test_meta.actual_result = "No required-email validation message was displayed."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(test_meta.actual_result)

    expect(configured_page.locator(".app-shell")).to_have_count(0)
    expect(configured_page.locator(login_page.AUTH_PAGE_ROOT)).to_be_visible()

    test_meta.actual_result = "Empty email rejected by validation; user remained unauthenticated on /login."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Manual empty email test PASSED: %s", test_meta.test_case_id, validation_msg)
