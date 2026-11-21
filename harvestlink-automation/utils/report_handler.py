"""HTML reporting for HarvestLink login automation.

Provides:
1. pytest-html integration (`reports/html/login_test_report.html`) with custom QA columns
   and embedded screenshots.
2. Academic-style HTML documentation report (`reports/html/login_test_documentation.html`)
   displaying each test case's metadata and actual screenshot evidence directly below
   its corresponding test result.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import pytest

from utils.terminal_reporter import (
    TIMEZONE_LABEL,
    TestExecutionRecord,
    format_date,
    format_duration,
    format_time,
    now_manila,
)


@dataclass
class TestReportMetadata:
    """Per-test metadata rendered into pytest-html and the documentation HTML report."""

    test_case_id: str = "UNASSIGNED"
    test_name: str = ""
    scenario: str = ""
    module_name: str = ""
    unit_name: str = ""
    test_type: str = ""
    role: str = "unknown"
    input_data: str = ""
    input_email: str = ""
    action_description: str = ""
    expected_result: str = ""
    actual_result: str = ""
    validation_msg: str = ""
    dashboard_access: str = ""
    action_result: str = ""  # "Performed as Expected" | "Not Performed as Expected" | "Skipped" | "Blocked"
    failure_reason: str = ""
    date_str: str = field(default_factory=lambda: format_date(now_manila()))
    started_str: str = field(default_factory=lambda: f"{format_time(now_manila())} {TIMEZONE_LABEL}")
    finished_str: str = ""
    total_duration_str: str = ""
    custom_header: str = ""
    detailed_report: bool = False
    screenshots: List[Path] = field(default_factory=list)


def ensure_html_report_dir(html_dir: Path) -> None:
    """Create reports/html/ before writing HTML reports."""
    html_dir.mkdir(parents=True, exist_ok=True)


def attach_screenshots_to_report(report: pytest.TestReport, screenshots: List[Path], pytest_html_plugin) -> None:
    """Embed captured PNG screenshots into pytest-html `extras`."""
    if pytest_html_plugin is None or not screenshots:
        return

    extras = list(getattr(report, "extras", []))
    for img_path in screenshots:
        if not img_path.exists():
            continue
        encoded = base64.b64encode(img_path.read_bytes()).decode("ascii")
        extras.append(pytest_html_plugin.extras.png(encoded, name=img_path.name))
    report.extras = extras


def configure_report_title(report) -> None:
    """Set a descriptive HTML report title."""
    report.title = "HarvestLink Login Automation Test Report"


def add_table_headers(cells: list) -> None:
    """Insert custom QA columns into the pytest-html results table."""
    cells.insert(1, "<th>Test Case ID</th>")
    cells.insert(2, "<th>Scenario</th>")
    cells.insert(3, "<th>Input Data</th>")
    cells.insert(4, "<th>Expected Result</th>")
    cells.insert(5, "<th>Actual Result</th>")
    cells.insert(6, "<th>Action Result</th>")
    cells.insert(7, "<th>Start (PHT)</th>")
    cells.insert(8, "<th>Finish (PHT)</th>")
    cells.insert(9, "<th>Total Duration</th>")


def add_table_row(report: pytest.TestReport, cells: list) -> None:
    """Populate custom QA columns from metadata attached to the pytest report."""
    meta: Optional[TestReportMetadata] = getattr(report, "hl_meta", None)
    if meta is None:
        meta = TestReportMetadata()

    actual = meta.actual_result
    if not actual:
        if report.passed:
            actual = "Passed as expected."
        elif report.skipped:
            actual = "Skipped."
        else:
            actual = "Failed — inspect failure reason, traceback, and screenshot."

    action = meta.action_result or (
        "Performed as Expected"
        if report.passed
        else "Skipped"
        if report.skipped
        else "Not Performed as Expected"
    )
    start_display = f"{meta.date_str} {meta.started_str}".strip()
    finish_display = meta.finished_str or "N/A"
    duration_display = meta.total_duration_str or format_duration(getattr(report, "duration", 0.0))

    cells.insert(1, f"<td>{_escape_html(meta.test_case_id)}</td>")
    cells.insert(2, f"<td>{_escape_html(meta.scenario or meta.test_name)}</td>")
    cells.insert(3, f"<td>{_escape_html(meta.input_data or '—')}</td>")
    cells.insert(4, f"<td>{_escape_html(meta.expected_result)}</td>")
    cells.insert(5, f"<td>{_escape_html(actual)}</td>")
    cells.insert(6, f"<td>{_escape_html(action)}</td>")
    cells.insert(7, f"<td>{_escape_html(start_display)}</td>")
    cells.insert(8, f"<td>{_escape_html(finish_display)}</td>")
    cells.insert(9, f"<td>{_escape_html(duration_display)}</td>")


def generate_documentation_html(
    items: List[Tuple[TestExecutionRecord, TestReportMetadata]],
    *,
    session_start_str: str,
    session_finish_str: str,
    session_duration_str: str,
    output_path: Path,
) -> Path:
    """Generate a self-contained academic-style HTML documentation report with inline screenshots."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    passed = sum(1 for rec, _ in items if rec.status == "PASS")
    failed = sum(1 for rec, _ in items if rec.status == "FAIL")
    skipped = sum(1 for rec, _ in items if rec.status == "SKIPPED")
    blocked = sum(1 for rec, _ in items if rec.status == "BLOCKED")

    sections: List[str] = []
    for rec, meta in items:
        badge_class = rec.status.lower()
        action_text = meta.action_result or (
            "Performed as Expected"
            if rec.status == "PASS"
            else "Not Performed as Expected"
            if rec.status == "FAIL"
            else rec.status.title()
        )

        screenshot_blocks: List[str] = []
        for img_path in meta.screenshots:
            if not img_path.exists():
                continue
            encoded = base64.b64encode(img_path.read_bytes()).decode("ascii")
            screenshot_blocks.append(
                f"""
                <figure class="evidence-item">
                    <figcaption>{_escape_html(img_path.name)}</figcaption>
                    <img src="data:image/png;base64,{encoded}" alt="{_escape_html(img_path.name)}" />
                </figure>
                """
            )

        screenshots_html = (
            f'<div class="evidence-grid">{"".join(screenshot_blocks)}</div>'
            if screenshot_blocks
            else '<p class="no-evidence">No screenshots captured for this test.</p>'
        )

        failure_row = (
            f"<tr><th>Failure Reason</th><td>{_escape_html(meta.failure_reason or rec.reason)}</td></tr>"
            if rec.status != "PASS" and (meta.failure_reason or rec.reason)
            else ""
        )

        sections.append(
            f"""
            <section class="case-card">
                <div class="case-header">
                    <div>
                        <span class="case-id">{_escape_html(meta.test_case_id)}</span>
                        <h2>{_escape_html(meta.scenario or rec.display_name)}</h2>
                    </div>
                    <span class="badge badge-{badge_class}">{_escape_html(rec.status)}</span>
                </div>
                <table class="case-table">
                    <tbody>
                        <tr><th>Test Case ID</th><td>{_escape_html(meta.test_case_id)}</td></tr>
                        <tr><th>Test Scenario</th><td>{_escape_html(meta.scenario or rec.display_name)}</td></tr>
                        <tr><th>Input Data (Non-Sensitive)</th><td>{_escape_html(meta.input_data or '—')}</td></tr>
                        <tr><th>Expected Result</th><td>{_escape_html(meta.expected_result)}</td></tr>
                        <tr><th>Actual Result</th><td>{_escape_html(meta.actual_result or rec.actual or '—')}</td></tr>
                        <tr><th>Action Result</th><td><strong>{_escape_html(action_text)}</strong></td></tr>
                        <tr><th>Status</th><td><span class="badge badge-{badge_class}">{_escape_html(rec.status)}</span></td></tr>
                        {failure_row}
                        <tr><th>Start Timestamp</th><td>{_escape_html(f'{meta.date_str} {meta.started_str}')}</td></tr>
                        <tr><th>Finish Timestamp</th><td>{_escape_html(f'{meta.date_str} {meta.finished_str}' if meta.finished_str else 'N/A')}</td></tr>
                        <tr><th>Total Duration</th><td>{_escape_html(meta.total_duration_str or format_duration(rec.duration_sec))}</td></tr>
                    </tbody>
                </table>
                <div class="evidence-section">
                    <h3>Actual Screenshot Evidence</h3>
                    {screenshots_html}
                </div>
            </section>
            """
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HarvestLink Login Automation — Test Documentation Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f6f8f7; color: #18231d; margin: 0; padding: 28px; line-height: 1.5; }}
    .container {{ max-width: 1080px; margin: 0 auto; }}
    header {{ background: #ffffff; border: 1px solid #d9e2dc; border-radius: 10px; padding: 22px 26px; margin-bottom: 24px; }}
    header h1 {{ margin: 0 0 6px; font-size: 22px; }}
    .meta-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 14px; font-size: 13px; color: #43534a; }}
    .meta-box {{ background: #f2f6f4; border: 1px solid #e1e8e4; border-radius: 8px; padding: 10px 12px; }}
    .meta-box strong {{ display: block; color: #18231d; font-size: 15px; margin-top: 2px; }}
    .case-card {{ background: #ffffff; border: 1px solid #d9e2dc; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; page-break-inside: avoid; }}
    .case-header {{ display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #e6ece8; padding-bottom: 12px; margin-bottom: 14px; }}
    .case-header h2 {{ margin: 4px 0 0; font-size: 17px; }}
    .case-id {{ font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #2f6b48; text-transform: uppercase; }}
    .case-table {{ width: 100%; border-collapse: collapse; font-size: 13.5px; }}
    .case-table th {{ width: 230px; text-align: left; padding: 8px 10px; background: #f6f9f7; border: 1px solid #e2e8e4; color: #34453b; font-weight: 600; vertical-align: top; }}
    .case-table td {{ padding: 8px 10px; border: 1px solid #e2e8e4; vertical-align: top; }}
    .badge {{ display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; }}
    .badge-pass {{ background: #e3f5ea; color: #146c3a; }}
    .badge-fail {{ background: #fde8e8; color: #b42318; }}
    .badge-skipped, .badge-blocked {{ background: #fef3c7; color: #92400e; }}
    .evidence-section {{ margin-top: 18px; }}
    .evidence-section h3 {{ margin: 0 0 10px; font-size: 14px; color: #2e3f35; text-transform: uppercase; letter-spacing: 0.04em; }}
    .evidence-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }}
    .evidence-item {{ margin: 0; border: 1px solid #dce4df; border-radius: 8px; padding: 10px; background: #fafcfb; }}
    .evidence-item figcaption {{ font-size: 12px; font-weight: 600; color: #43534a; margin-bottom: 8px; }}
    .evidence-item img {{ width: 100%; height: auto; border-radius: 4px; border: 1px solid #e3e8e5; display: block; }}
    .no-evidence {{ font-size: 13px; color: #64746b; }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>HarvestLink Login Automation — Test Documentation Report</h1>
      <div class="meta-grid">
        <div class="meta-box">Total Tests<strong>{len(items)}</strong></div>
        <div class="meta-box">Passed / Failed<strong>{passed} Passed | {failed} Failed{f' | {skipped} Skipped' if skipped else ''}{f' | {blocked} Blocked' if blocked else ''}</strong></div>
        <div class="meta-box">Started (PHT)<strong>{_escape_html(session_start_str)}</strong></div>
        <div class="meta-box">Finished (PHT)<strong>{_escape_html(session_finish_str)}</strong></div>
        <div class="meta-box">Total Duration<strong>{_escape_html(session_duration_str)}</strong></div>
      </div>
    </header>
    {"".join(sections)}
  </div>
</body>
</html>
"""
    output_path.write_text(html, encoding="utf-8")
    return output_path


def _escape_html(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
