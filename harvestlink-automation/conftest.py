"""Pytest configuration, Playwright fixtures, minimal terminal reporter, and HTML documentation hooks."""

from __future__ import annotations

from typing import Callable, Dict, List, Tuple

import pytest
from playwright.sync_api import Page

from pages.dashboard_page import DashboardPage
from pages.login_page import LoginPage
from utils.captcha_handler import CaptchaHandler, CaptchaManualInterventionError
from utils.config import AutomationConfig, load_config
from utils.report_handler import (
    TestReportMetadata,
    add_table_headers,
    add_table_row,
    attach_screenshots_to_report,
    configure_report_title,
    ensure_html_report_dir,
    generate_documentation_html,
)
from utils.screenshot_handler import ScreenshotHandler
from utils.terminal_reporter import (
    TIMEZONE_LABEL,
    TerminalSummaryReporter,
    TestExecutionRecord,
    extract_short_reason,
    format_date,
    format_duration,
    format_test_name,
    format_time,
    is_debug_mode,
)
from utils.test_logger import get_logger

logger = get_logger("harvestlink.conftest")

_TERMINAL_REPORTER = TerminalSummaryReporter()
_METADATA_BY_NODEID: Dict[str, TestReportMetadata] = {}
_ORIGINAL_TR_WRITE_LINE = None

ROLE_SCREENSHOT_FOLDERS = (
    "farmer",
    "buyer",
    "stakeholder",
    "admin",
    "invalid_login",
    "invalid_email",
    "invalid_password",
    "empty_email",
    "empty_password",
)


def _silence_default_terminal_output(config: pytest.Config) -> None:
    """Suppress verbose pytest terminal noise during normal runs while keeping stats & HTML reports intact."""
    global _ORIGINAL_TR_WRITE_LINE
    if is_debug_mode() or getattr(config.option, "collectonly", False):
        return

    tr = config.pluginmanager.get_plugin("terminalreporter")
    if tr is None:
        return

    if _ORIGINAL_TR_WRITE_LINE is None:
        _ORIGINAL_TR_WRITE_LINE = tr.write_line

    def _noop(*_args, **_kwargs) -> None:
        return None

    tr.write = _noop
    tr.write_line = _noop
    tr.write_sep = _noop
    tr.section = _noop
    tr.ensure_newline = _noop


def pytest_configure(config: pytest.Config) -> None:
    """Ensure report directories exist and configure clean terminal output."""
    app_cfg = load_config()
    ensure_html_report_dir(app_cfg.html_reports_dir)
    for role_folder in ROLE_SCREENSHOT_FOLDERS:
        (app_cfg.screenshots_dir / role_folder).mkdir(parents=True, exist_ok=True)
    _silence_default_terminal_output(config)


def pytest_sessionstart(session: pytest.Session) -> None:
    _TERMINAL_REPORTER.records.clear()
    _TERMINAL_REPORTER.order.clear()
    _METADATA_BY_NODEID.clear()
    _TERMINAL_REPORTER.start_session()


def pytest_runtest_setup(item: pytest.Item) -> None:
    """Start full execution timer before Playwright browser/context fixture setup."""
    _TERMINAL_REPORTER.start_test(item.nodeid, item.name)


def pytest_html_report_title(report) -> None:
    configure_report_title(report)


def pytest_html_results_table_header(cells) -> None:
    add_table_headers(cells)


def pytest_html_results_table_row(report, cells) -> None:
    add_table_row(report, cells)


@pytest.fixture(scope="session")
def app_config() -> AutomationConfig:
    """Load HarvestLink automation configuration once per test session."""
    return load_config()


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict) -> dict:
    """Configure a fresh, clean Chromium browser context per test without overriding pytest-playwright."""
    return {
        **browser_context_args,
        "viewport": {"width": 1366, "height": 860},
        "ignore_https_errors": False,
    }


@pytest.fixture
def configured_page(page: Page, app_config: AutomationConfig) -> Page:
    """Return the fresh per-test Playwright page with configured default timeouts."""
    page.set_default_timeout(app_config.login_timeout_ms)
    page.set_default_navigation_timeout(app_config.login_timeout_ms)
    return page


@pytest.fixture
def test_meta(request: pytest.FixtureRequest) -> TestReportMetadata:
    """Create and attach per-test report metadata for HTML reports and terminal summary."""
    meta = TestReportMetadata(test_name=format_test_name(request.node.name))
    rec = _TERMINAL_REPORTER.get_record(request.node.nodeid)
    if rec is not None:
        meta.date_str = format_date(rec.start_dt)
        meta.started_str = f"{format_time(rec.start_dt)} {TIMEZONE_LABEL}"
    request.node.hl_meta = meta
    _METADATA_BY_NODEID[request.node.nodeid] = meta
    return meta


@pytest.fixture
def screenshot_factory(
    request: pytest.FixtureRequest,
    app_config: AutomationConfig,
) -> Callable[[str], ScreenshotHandler]:
    """Provide a factory that creates a role-scoped ScreenshotHandler and registers it on the node."""

    def _create(role: str) -> ScreenshotHandler:
        handler = ScreenshotHandler(app_config.screenshots_dir, role=role)
        request.node.hl_screenshot_handler = handler
        return handler

    return _create


@pytest.fixture
def login_page(configured_page: Page, app_config: AutomationConfig) -> LoginPage:
    """Reusable LoginPage object bound to the current test's Playwright page."""
    return LoginPage(configured_page, app_config)


@pytest.fixture
def dashboard_page(configured_page: Page, app_config: AutomationConfig) -> DashboardPage:
    """Reusable DashboardPage object bound to the current test's Playwright page."""
    return DashboardPage(configured_page, app_config)


@pytest.fixture
def captcha_handler(configured_page: Page, app_config: AutomationConfig) -> CaptchaHandler:
    """Reusable CaptchaHandler bound to the current test's Playwright page."""
    return CaptchaHandler(configured_page, timeout_sec=app_config.captcha_timeout_sec)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo):
    """Capture failure screenshots, record real outcomes/timings, and populate HTML report metadata."""
    outcome = yield
    report: pytest.TestReport = outcome.get_result()

    meta: TestReportMetadata = getattr(item, "hl_meta", TestReportMetadata(test_name=format_test_name(item.name)))
    handler: ScreenshotHandler | None = getattr(item, "hl_screenshot_handler", None)
    page: Page | None = item.funcargs.get("configured_page") or item.funcargs.get("page")

    is_blocked = bool(call.excinfo and issubclass(call.excinfo.type, CaptchaManualInterventionError))
    short_reason = ""

    if report.failed or report.skipped:
        fallback = meta.actual_result if report.failed else ""
        if report.skipped and isinstance(report.longrepr, tuple) and len(report.longrepr) >= 3:
            short_reason = str(report.longrepr[2]).replace("Skipped: ", "").strip()
        else:
            short_reason = extract_short_reason(report.longreprtext, fallback=fallback)

    if report.when == "call":
        if report.failed and handler is not None and page is not None and not handler.final_captured:
            try:
                if not page.is_closed():
                    handler.capture_final_result(page, passed=False)
            except Exception as exc:
                logger.warning("Unable to capture automatic failure screenshot: %s", exc)

        if report.passed:
            meta.action_result = "Performed as Expected"
        elif report.skipped:
            meta.action_result = "Blocked" if is_blocked else "Skipped"
        else:
            meta.action_result = "Blocked" if is_blocked else "Not Performed as Expected"
            meta.failure_reason = short_reason
            if not meta.actual_result:
                meta.actual_result = short_reason

        if handler is not None:
            meta.screenshots = handler.list_screenshots()

        pytest_html_plugin = item.config.pluginmanager.getplugin("html")
        attach_screenshots_to_report(report, meta.screenshots, pytest_html_plugin)

    _TERMINAL_REPORTER.record_phase(
        item.nodeid,
        when=report.when,
        outcome=report.outcome,
        reason=short_reason,
        blocked=is_blocked,
    )
    _TERMINAL_REPORTER.update_details(
        item.nodeid,
        test_case_id=meta.test_case_id,
        scenario=meta.scenario,
        module_name=meta.module_name,
        unit_name=meta.unit_name,
        test_type=meta.test_type,
        input_email=meta.input_email,
        action_description=meta.action_description,
        expected=meta.expected_result,
        actual=meta.actual_result,
        validation_msg=meta.validation_msg,
        dashboard_access=meta.dashboard_access,
        action_result=meta.action_result,
        custom_header=meta.custom_header,
        detailed_report=meta.detailed_report,
        screenshot_saved=bool(meta.screenshots),
        screenshot_paths=[str(p) for p in meta.screenshots],
    )

    rec = _TERMINAL_REPORTER.get_record(item.nodeid)
    if rec is not None:
        meta.date_str = format_date(rec.start_dt)
        meta.started_str = f"{format_time(rec.start_dt)} {TIMEZONE_LABEL}"
        if rec.finish_dt is not None:
            meta.finished_str = f"{format_time(rec.finish_dt)} {TIMEZONE_LABEL}"
            meta.total_duration_str = format_duration(rec.duration_sec)

    if report.when == "call" or not hasattr(report, "hl_meta"):
        report.hl_meta = meta
    item.hl_meta = meta
    _METADATA_BY_NODEID[item.nodeid] = meta


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Finalize timings and generate the academic HTML documentation report."""
    if getattr(session.config.option, "collectonly", False):
        return

    _TERMINAL_REPORTER.finish_session()

    ordered_items: List[Tuple[TestExecutionRecord, TestReportMetadata]] = []
    for rec in _TERMINAL_REPORTER.ordered_records():
        meta = _METADATA_BY_NODEID.get(rec.nodeid) or TestReportMetadata(test_name=rec.display_name)
        meta.date_str = format_date(rec.start_dt)
        meta.started_str = f"{format_time(rec.start_dt)} {TIMEZONE_LABEL}"
        if rec.finish_dt is not None:
            meta.finished_str = f"{format_time(rec.finish_dt)} {TIMEZONE_LABEL}"
        meta.total_duration_str = format_duration(rec.duration_sec)
        ordered_items.append((rec, meta))

    if ordered_items:
        app_cfg = load_config()
        start_dt = _TERMINAL_REPORTER.session_start_dt or ordered_items[0][0].start_dt
        finish_dt = _TERMINAL_REPORTER.session_finish_dt or ordered_items[-1][0].finish_dt
        generate_documentation_html(
            ordered_items,
            session_start_str=f"{format_date(start_dt)} {format_time(start_dt)} {TIMEZONE_LABEL}",
            session_finish_str=f"{format_date(finish_dt)} {format_time(finish_dt)} {TIMEZONE_LABEL}",
            session_duration_str=format_duration(_TERMINAL_REPORTER.session_duration_sec),
            output_path=app_cfg.html_reports_dir / "login_test_documentation.html",
        )


def pytest_terminal_summary(terminalreporter, exitstatus: int, config: pytest.Config) -> None:
    """Render the detailed HarvestLink report via Pytest's official terminal summary hook."""
    if getattr(config.option, "collectonly", False):
        return

    _TERMINAL_REPORTER.finish_session()
    rendered = _TERMINAL_REPORTER.render()
    if not rendered:
        return

    write_line = _ORIGINAL_TR_WRITE_LINE or terminalreporter.write_line
    for line in rendered.splitlines():
        write_line(line)
