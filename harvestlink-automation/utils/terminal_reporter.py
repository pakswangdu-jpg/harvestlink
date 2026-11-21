"""Clean minimal terminal reporter with Asia/Manila timestamps and perf_counter timing."""

from __future__ import annotations

import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

try:
    from zoneinfo import ZoneInfo

    MANILA_TZ = ZoneInfo("Asia/Manila")
except Exception:
    # Philippines observes PHT (UTC+08:00) year-round without DST
    MANILA_TZ = timezone(timedelta(hours=8), name="PHT")

TIMEZONE_LABEL = "PHT (UTC+08:00)"

TEST_DISPLAY_NAMES: Dict[str, str] = {
    "test_farmer_login": "Farmer Login",
    "test_buyer_login": "Buyer Login",
    "test_stakeholder_login": "Stakeholder Login",
    "test_admin_login": "Admin Login",
    "test_invalid_login": "Invalid Login",
    "test_invalid_email": "Invalid Email",
    "test_invalid_password": "Invalid Password",
    "test_empty_email": "Empty Email",
    "test_empty_password": "Empty Password",
}


def is_debug_mode() -> bool:
    """Return True when verbose debug output is explicitly enabled via environment variable."""
    raw = os.getenv("HL_DEBUG", os.getenv("HARVESTLINK_DEBUG", "")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def now_manila() -> datetime:
    """Return the current timezone-aware datetime in Asia/Manila (PHT, UTC+08:00)."""
    return datetime.now(MANILA_TZ)


def format_date(dt: Optional[datetime]) -> str:
    return dt.strftime("%Y-%m-%d") if dt else "N/A"


def format_time(dt: Optional[datetime]) -> str:
    return dt.strftime("%I:%M:%S %p") if dt else "N/A"


def format_duration(seconds: float) -> str:
    """Format elapsed seconds for single-test display."""
    safe_seconds = max(0.0, float(seconds))
    if safe_seconds < 60.0:
        return f"{safe_seconds:.2f} seconds"
    minutes = int(safe_seconds // 60)
    remainder = safe_seconds - (minutes * 60)
    return f"{minutes}m {remainder:05.2f}s"


def format_short_duration(seconds: float) -> str:
    return f"{max(0.0, float(seconds)):.2f}s"


def format_test_name(node_name: str) -> str:
    """Convert a pytest node name like `test_invalid_email[chromium]` into `Invalid Email`."""
    base = node_name.split("[", 1)[0].strip()
    if base in TEST_DISPLAY_NAMES:
        return TEST_DISPLAY_NAMES[base]
    cleaned = re.sub(r"^test_", "", base).replace("_", " ").strip()
    return cleaned.title() if cleaned else base


def extract_short_reason(longreprtext: str, fallback: str = "") -> str:
    """Extract a single concise, human-readable failure or skip reason."""
    if fallback:
        cleaned_fallback = fallback.strip()
        if cleaned_fallback:
            return cleaned_fallback

    if not longreprtext:
        return "Test did not meet expected verification criteria."

    lines = [line.strip() for line in longreprtext.splitlines() if line.strip()]
    for line in reversed(lines):
        if line.startswith("E "):
            candidate = line[2:].strip()
            candidate = re.sub(r"^(AssertionError|Failed|ValueError|RuntimeError|Captcha\w+Error):\s*", "", candidate)
            if candidate:
                return candidate[:160]

    for line in reversed(lines):
        if not line.startswith("File ") and not line.startswith(">") and not line.startswith("_"):
            candidate = re.sub(r"^(AssertionError|Failed|ValueError|RuntimeError|Captcha\w+Error):\s*", "", line)
            if candidate:
                return candidate[:160]

    return "Verification failed — inspect HTML report for full details."


@dataclass
class TestExecutionRecord:
    """Actual timing, metadata, and outcome captured for one Pytest test item."""

    nodeid: str
    display_name: str
    status: str = "RUNNING"  # PASS, FAIL, SKIPPED, BLOCKED
    test_case_id: str = ""
    scenario: str = ""
    module_name: str = ""
    unit_name: str = ""
    test_type: str = ""
    input_email: str = ""
    action_description: str = ""
    expected: str = ""
    actual: str = ""
    validation_msg: str = ""
    dashboard_access: str = ""
    action_result: str = ""
    reason: str = ""
    custom_header: str = ""
    detailed_report: bool = False
    screenshot_saved: bool = False
    screenshot_paths: List[str] = field(default_factory=list)
    start_dt: datetime = field(default_factory=now_manila)
    finish_dt: Optional[datetime] = None
    start_perf: float = field(default_factory=time.perf_counter)
    duration_sec: float = 0.0
    setup_outcome: Optional[str] = None
    call_outcome: Optional[str] = None
    teardown_outcome: Optional[str] = None

    def finalize_timing(self) -> None:
        self.finish_dt = now_manila()
        self.duration_sec = max(0.0, time.perf_counter() - self.start_perf)


class TerminalSummaryReporter:
    """Tracks full per-test and session timings and prints clean minimal summaries."""

    DIVIDER_BAR = "------------------------------------"
    TITLE = "HARVESTLINK LOGIN TESTING"

    def __init__(self) -> None:
        self.session_start_dt: Optional[datetime] = None
        self.session_finish_dt: Optional[datetime] = None
        self.session_start_perf: Optional[float] = None
        self.session_duration_sec: float = 0.0
        self.records: Dict[str, TestExecutionRecord] = {}
        self.order: List[str] = []

    def start_session(self) -> None:
        self.session_start_dt = now_manila()
        self.session_start_perf = time.perf_counter()

    def start_test(self, nodeid: str, node_name: str) -> TestExecutionRecord:
        record = TestExecutionRecord(
            nodeid=nodeid,
            display_name=format_test_name(node_name),
            start_dt=now_manila(),
            start_perf=time.perf_counter(),
        )
        self.records[nodeid] = record
        if nodeid not in self.order:
            self.order.append(nodeid)
        return record

    def get_record(self, nodeid: str) -> Optional[TestExecutionRecord]:
        return self.records.get(nodeid)

    def update_details(
        self,
        nodeid: str,
        *,
        test_case_id: str = "",
        scenario: str = "",
        module_name: str = "",
        unit_name: str = "",
        test_type: str = "",
        input_email: str = "",
        action_description: str = "",
        expected: str = "",
        actual: str = "",
        validation_msg: str = "",
        dashboard_access: str = "",
        action_result: str = "",
        custom_header: str = "",
        detailed_report: bool = False,
        screenshot_saved: bool = False,
        screenshot_paths: Optional[List[str]] = None,
    ) -> None:
        record = self.records.get(nodeid)
        if record is None:
            return
        if test_case_id:
            record.test_case_id = test_case_id
        if scenario:
            record.scenario = scenario
        if module_name:
            record.module_name = module_name
        if unit_name:
            record.unit_name = unit_name
        if test_type:
            record.test_type = test_type
        if input_email:
            record.input_email = input_email
        if action_description:
            record.action_description = action_description
        if expected:
            record.expected = expected
        if actual:
            record.actual = actual
        if validation_msg:
            record.validation_msg = validation_msg
        if dashboard_access:
            record.dashboard_access = dashboard_access
        if action_result:
            record.action_result = action_result
        if custom_header:
            record.custom_header = custom_header
        if detailed_report:
            record.detailed_report = True
        if screenshot_saved:
            record.screenshot_saved = True
        if screenshot_paths:
            record.screenshot_paths = list(screenshot_paths)
            record.screenshot_saved = True

    def record_phase(self, nodeid: str, when: str, outcome: str, reason: str = "", blocked: bool = False) -> None:
        record = self.records.get(nodeid)
        if record is None:
            return

        if when == "setup":
            record.setup_outcome = outcome
            if outcome == "failed":
                record.status = "BLOCKED" if blocked else "FAIL"
                if reason:
                    record.reason = reason
            elif outcome == "skipped":
                record.status = "BLOCKED" if blocked else "SKIPPED"
                if reason:
                    record.reason = reason
        elif when == "call":
            record.call_outcome = outcome
            if outcome == "passed":
                record.status = "PASS"
            elif outcome == "skipped":
                record.status = "BLOCKED" if blocked else "SKIPPED"
                if reason:
                    record.reason = reason
            else:
                record.status = "BLOCKED" if blocked else "FAIL"
                if reason:
                    record.reason = reason
        elif when == "teardown":
            record.teardown_outcome = outcome
            if outcome == "failed" and record.status == "PASS":
                record.status = "FAIL"
                if reason:
                    record.reason = reason
            record.finalize_timing()

    def finish_session(self) -> None:
        self.session_finish_dt = now_manila()
        if self.session_start_perf is not None:
            self.session_duration_sec = max(0.0, time.perf_counter() - self.session_start_perf)

        for record in self.records.values():
            if record.finish_dt is None:
                record.finalize_timing()

    def ordered_records(self) -> List[TestExecutionRecord]:
        return [self.records[nid] for nid in self.order if nid in self.records]

    def render(self) -> str:
        """Render the formatted terminal output for either a single test or a multi-test suite."""
        ordered = self.ordered_records()
        if not ordered:
            return ""
        if len(ordered) == 1:
            return self._render_single(ordered[0])
        return self._render_multiple(ordered)

    def _render_single(self, rec: TestExecutionRecord) -> str:
        header = rec.custom_header or self.TITLE
        if rec.detailed_report:
            bar = "=================================================="
            sub = "--------------------------------------------------"
            action_res = rec.action_result or (
                "Performed as Expected"
                if rec.status == "PASS"
                else "Not Performed as Expected"
                if rec.status == "FAIL"
                else rec.status.title()
            )
            eval_reason = rec.reason or (
                rec.actual if rec.status == "PASS" else "Validation did not match expected behavior."
            )
            screenshot_status = "Saved" if rec.screenshot_saved else "Failed"
            screenshot_path = rec.screenshot_paths[-1] if rec.screenshot_paths else "None"
            lines = [
                "",
                bar,
                f"       {header}",
                bar,
                "",
                "TEST INFORMATION",
                sub,
                f"Module             : {rec.module_name or 'Login Process'}",
                f"Unit               : {rec.unit_name or rec.display_name}",
                f"Scenario           : {rec.scenario or rec.display_name}",
                f"Test Type          : {rec.test_type or 'Negative Testing'}",
                "",
                "TEST EXECUTION",
                sub,
                f"Input Email        : {rec.input_email or '(none)'}",
                f"Expected Result    : {rec.expected}",
                f"Actual Result      : {rec.actual or rec.reason or '—'}",
                f"Validation Message : {rec.validation_msg or 'None'}",
                "",
                "TEST EVALUATION",
                sub,
                f"Action Result      : {action_res}",
                f"Status             : {rec.status}",
                f"Reason             : {eval_reason}",
                "",
                "EXECUTION DETAILS",
                sub,
                f"Started            : {format_date(rec.start_dt)} {format_time(rec.start_dt)} {TIMEZONE_LABEL}",
                f"Finished           : {format_date(rec.finish_dt)} {format_time(rec.finish_dt)} {TIMEZONE_LABEL}",
                f"Duration           : {format_duration(rec.duration_sec)}",
                "",
                "SCREENSHOT EVIDENCE",
                sub,
                f"Screenshot         : {screenshot_status}",
                f"Screenshot Path    : {screenshot_path}",
                bar,
                "",
            ]
            return "\n".join(lines)

        if rec.custom_header:
            lines = [
                "",
                header,
                self.DIVIDER_BAR,
                f"Test Case: {rec.test_case_id or rec.display_name}",
                f"Scenario: {rec.scenario or rec.display_name}",
                f"Expected: {rec.expected}",
                f"Actual: {rec.actual or rec.reason or '—'}",
                "",
                f"Status: {rec.status}",
            ]
            if rec.status != "PASS" and rec.reason and rec.reason != rec.actual:
                lines.append(f"Reason: {rec.reason}")
            lines.extend(
                [
                    f"Started:  {format_time(rec.start_dt)} {TIMEZONE_LABEL}",
                    f"Finished: {format_time(rec.finish_dt)} {TIMEZONE_LABEL}",
                    f"Duration: {format_duration(rec.duration_sec)}",
                    f"Screenshot: {'Saved' if rec.screenshot_saved else 'Not captured'}",
                    self.DIVIDER_BAR,
                    "",
                ]
            )
            return "\n".join(lines)

        lines = [
            "",
            header,
            self.DIVIDER_BAR,
            f"Test: {rec.display_name}",
            f"Status: {rec.status}",
        ]
        if rec.status != "PASS" and rec.reason:
            lines.append(f"Reason: {rec.reason}")

        if rec.expected or rec.actual:
            lines.append("")
            if rec.expected:
                lines.append(f"Expected: {rec.expected}")
            if rec.actual:
                lines.append(f"Actual: {rec.actual}")

        lines.extend(
            [
                "",
                f"Date:     {format_date(rec.start_dt)}",
                f"Started:  {format_time(rec.start_dt)} {TIMEZONE_LABEL}",
                f"Finished: {format_time(rec.finish_dt)} {TIMEZONE_LABEL}",
                f"Duration: {format_duration(rec.duration_sec)}",
                self.DIVIDER_BAR,
                "",
            ]
        )
        return "\n".join(lines)

    def _render_multiple(self, records: List[TestExecutionRecord]) -> str:
        passed = sum(1 for r in records if r.status == "PASS")
        failed = sum(1 for r in records if r.status == "FAIL")
        skipped = sum(1 for r in records if r.status == "SKIPPED")
        blocked = sum(1 for r in records if r.status == "BLOCKED")

        name_width = max(len(r.display_name) for r in records) + 2
        lines = [
            "",
            self.TITLE,
            self.DIVIDER_BAR,
        ]

        for rec in records:
            lines.append(f"{rec.display_name:<{name_width}}{rec.status:<8}{format_short_duration(rec.duration_sec):>7}")

        non_passing = [r for r in records if r.status != "PASS" and r.reason]
        if non_passing:
            lines.append("")
            for rec in non_passing:
                lines.append(f"{rec.display_name} ({rec.status}): {rec.reason}")

        summary_parts = [f"Passed: {passed}", f"Failed: {failed}"]
        if skipped:
            summary_parts.append(f"Skipped: {skipped}")
        if blocked:
            summary_parts.append(f"Blocked: {blocked}")

        start_dt = self.session_start_dt or records[0].start_dt
        finish_dt = self.session_finish_dt or records[-1].finish_dt
        total_duration = self.session_duration_sec or sum(r.duration_sec for r in records)

        lines.extend(
            [
                self.DIVIDER_BAR,
                " | ".join(summary_parts),
                "",
                f"Date:     {format_date(start_dt)}",
                f"Started:  {format_time(start_dt)} {TIMEZONE_LABEL}",
                f"Finished: {format_time(finish_dt)} {TIMEZONE_LABEL}",
                f"Duration: {format_duration(total_duration)}",
                "",
            ]
        )
        return "\n".join(lines)

    def print_summary(self) -> None:
        """Write the formatted summary directly to stdout."""
        output = self.render()
        if output:
            stream = sys.__stdout__ or sys.stdout
            stream.write(output)
            stream.flush()
