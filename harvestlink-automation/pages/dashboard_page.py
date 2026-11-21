"""Page Object Model for post-login dashboard verification.

Verifies only authenticated state and role-specific dashboard routes/shells
using real selectors from `src/app/routes.jsx`, `src/components/layout/AppShell.jsx`,
and the four role dashboard components.
"""

from __future__ import annotations

import re
from typing import Optional

from playwright.sync_api import Page, expect

from utils.config import AutomationConfig
from utils.test_logger import get_logger

logger = get_logger("harvestlink.dashboard_page")


class DashboardPage:
    """Verifies successful authentication and role-specific dashboards."""

    APP_SHELL = ".app-shell"
    SIDEBAR = ".app-shell .sidebar"
    AUTH_FORM = "main.auth-page.auth-page-login"

    def __init__(self, page: Page, config: AutomationConfig) -> None:
        self.page = page
        self.config = config

    def verify_authenticated_state(self, expected_role: Optional[str] = None) -> None:
        """Assert that the browser is authenticated inside the HarvestLink AppShell."""
        timeout = self.config.login_timeout_ms

        expect(self.page.locator(self.AUTH_FORM)).to_have_count(0, timeout=timeout)
        expect(self.page.locator(self.APP_SHELL).first).to_be_visible(timeout=timeout)
        expect(self.page.locator(self.SIDEBAR).first).to_be_visible(timeout=timeout)

        if expected_role:
            role_shell = self.page.locator(f".app-shell.role-{expected_role}").first
            expect(role_shell).to_be_visible(timeout=timeout)

        logger.info("Authenticated state verified (role=%s, url=%s)", expected_role or "any", self.page.url)

    def verify_farmer_dashboard(self) -> None:
        """Verify Farmer route (`/farmer-dashboard`) and Farmer workspace markers."""
        timeout = self.config.login_timeout_ms
        expect(self.page).to_have_url(re.compile(r"/farmer-dashboard(?:/|\?|$)"), timeout=timeout)
        self.verify_authenticated_state(expected_role="farmer")
        expect(self.page.locator(".app-shell.role-farmer .sidebar a[href='/farmer-products']").first).to_be_visible(
            timeout=timeout
        )
        logger.info("Farmer dashboard verified: %s", self.page.url)

    def verify_buyer_dashboard(self) -> None:
        """Verify Buyer route (`/buyer-dashboard`) and Buyer workspace markers."""
        timeout = self.config.login_timeout_ms
        expect(self.page).to_have_url(re.compile(r"/buyer-dashboard(?:/|\?|$)"), timeout=timeout)
        self.verify_authenticated_state(expected_role="buyer")
        expect(self.page.locator("#buyer-overview-title")).to_be_visible(timeout=timeout)
        logger.info("Buyer dashboard verified: %s", self.page.url)

    def verify_stakeholder_dashboard(self) -> None:
        """Verify Stakeholder route (`/stakeholder-dashboard`) and Partner workspace markers."""
        timeout = self.config.login_timeout_ms
        expect(self.page).to_have_url(re.compile(r"/stakeholder-dashboard(?:/|\?|$)"), timeout=timeout)
        self.verify_authenticated_state(expected_role="stakeholder")
        expect(self.page.locator(".stakeholder-dashboard-page").first).to_be_visible(timeout=timeout)
        logger.info("Stakeholder dashboard verified: %s", self.page.url)

    def verify_admin_dashboard(self) -> None:
        """Verify Admin route (`/admin-dashboard`) and Admin Portal markers."""
        timeout = self.config.login_timeout_ms
        expect(self.page).to_have_url(re.compile(r"/admin-dashboard(?:/|\?|$)"), timeout=timeout)
        self.verify_authenticated_state(expected_role="admin")
        expect(self.page.locator(".admin-overview-page").first).to_be_visible(timeout=timeout)
        logger.info("Admin dashboard verified: %s", self.page.url)
