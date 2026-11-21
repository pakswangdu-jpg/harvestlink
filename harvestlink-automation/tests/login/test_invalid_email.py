"""CASE-001 (HL-LOGIN-006): Manual Invalid Email Test with Terminal ENTER Confirmation.

Opens the HarvestLink login page in a visible Chromium browser, pauses until
the tester types an invalid email and presses ENTER in the terminal, then
triggers validation/submission through Playwright, captures screenshot evidence,
and reports the actual observed result.
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

logger = get_logger("harvestlink.test.invalid_email")


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
    """Display the manual email prompt and wait for ENTER in an interactive terminal."""
    prompt_block = (
        "\nHARVESTLINK INVALID EMAIL TEST\n"
        "------------------------------------\n"
        "Browser opened.\n\n"
        "Enter an invalid email in the browser.\n"
        "Return to this terminal when finished.\n\n"
        "Press ENTER to validate and generate results...\n"
    )
    stream = sys.__stdout__ or sys.stdout
    stream.write(prompt_block)
    stream.flush()

    if not sys.stdin or not sys.stdin.isatty():
        raise RuntimeError(
            "Manual email test requires an interactive terminal (TTY). "
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
def test_invalid_email(
    configured_page,
    login_page,
    app_config,
    screenshot_factory,
    test_meta,
) -> None:
    """Wait for manual invalid email input + terminal ENTER, then validate via Playwright."""
    test_meta.test_case_id = "CASE-001"
    test_meta.module_name = "Login Process"
    test_meta.unit_name = "Farmer Login"
    test_meta.scenario = "Invalid Email Format"
    test_meta.test_type = "Negative Testing"
    test_meta.role = "Farmer"
    test_meta.action_description = "User entered email manually and confirmed via terminal ENTER"
    test_meta.expected_result = "Invalid email must be rejected"
    test_meta.custom_header = "HARVESTLINK LOGIN AUTOMATION"
    test_meta.detailed_report = True

    screenshots = screenshot_factory("invalid_email")
    safety_timeout_sec = _get_manual_timeout(app_config.captcha_timeout_sec)

    logger.info("[%s] Opening HarvestLink login page for manual invalid email test.", test_meta.test_case_id)
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

    # Trigger HTML5 native + React email validation and click Login if enabled (without bypassing CAPTCHA)
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
        test_meta.actual_result = f"Invalid email was not rejected; navigated to {state['current_url']}."
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(test_meta.actual_result)

    native_rejected = (not attempt["native_valid"]) or (not state["native_valid"])
    native_msg = attempt["native_message"] or state["native_message"]
    custom_msg = state["custom_email_error"]
    form_msg = state["form_error"]

    validation_msg = custom_msg or native_msg or form_msg
    test_meta.validation_msg = validation_msg or "None"
    test_meta.dashboard_access = "No"

    # Do NOT treat remaining on /login alone as proof of email validation
    if not (native_rejected or custom_msg or form_msg):
        test_meta.actual_result = (
            f"No email validation message was displayed for '{test_meta.input_email}'."
        )
        screenshots.capture_final_result(configured_page, passed=False)
        pytest.fail(test_meta.actual_result)

    expect(configured_page.locator(".app-shell")).to_have_count(0)
    expect(configured_page.locator(login_page.AUTH_PAGE_ROOT)).to_be_visible()

    test_meta.actual_result = "Invalid email rejected by validation; user remained unauthenticated on /login."
    screenshots.capture_final_result(configured_page, passed=True)
    logger.info("[%s] Manual invalid email test PASSED: %s", test_meta.test_case_id, validation_msg)
