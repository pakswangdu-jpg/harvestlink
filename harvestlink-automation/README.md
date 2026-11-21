# HarvestLink Login Automation (Playwright + Pytest)

Automated end-to-end login test suite for **HarvestLink** (`https://harvestlink.dev`), implemented in Python with **Playwright**, **Pytest**, and **pytest-html**, supporting human-in-the-loop manual CAPTCHA verification.

---

## Project Structure

```text
harvestlink-automation/
├── tests/
│   ├── __init__.py
│   └── login/
│       ├── __init__.py
│       ├── test_farmer_login.py       # HL-LOGIN-001
│       ├── test_buyer_login.py        # HL-LOGIN-002
│       ├── test_stakeholder_login.py  # HL-LOGIN-003
│       ├── test_admin_login.py        # HL-LOGIN-004
│       └── test_invalid_login.py      # HL-LOGIN-005
├── pages/
│   ├── __init__.py
│   ├── login_page.py                  # LoginPage POM (/login and /admin)
│   └── dashboard_page.py              # Role-specific dashboard verification
├── utils/
│   ├── __init__.py
│   ├── config.py                      # python-dotenv configuration loader
│   ├── captcha_handler.py             # Manual CAPTCHA pause & state check
│   ├── screenshot_handler.py          # Timestamped, masked screenshot evidence
│   ├── report_handler.py              # pytest-html report metadata & embeds
│   └── test_logger.py                 # Console logger
├── reports/
│   ├── screenshots/
│   │   ├── farmer/
│   │   ├── buyer/
│   │   ├── stakeholder/
│   │   ├── admin/
│   │   └── invalid_login/
│   └── html/
├── conftest.py
├── pytest.ini
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

## 1. Installation (Windows PowerShell)

Open PowerShell in the `harvestlink-automation` directory:

```powershell
cd harvestlink-automation
python -m pip install -r requirements.txt
python -m playwright install chromium
```

> **Note:** Python 3.10+ is recommended. If `python` is not on your PATH, install Python from [python.org](https://www.python.org/downloads/) and check **"Add python.exe to PATH"**.

---

## 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your test account credentials:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```dotenv
BASE_URL=https://harvestlink.dev

FARMER_EMAIL=your-farmer@example.com
FARMER_PASSWORD=your-farmer-password

BUYER_EMAIL=your-buyer@example.com
BUYER_PASSWORD=your-buyer-password

STAKEHOLDER_EMAIL=your-stakeholder@example.com
STAKEHOLDER_PASSWORD=your-stakeholder-password

ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=your-admin-password

CAPTCHA_TIMEOUT=180
LOGIN_TIMEOUT=30000
```

- Never commit `.env` (it is excluded by `.gitignore`).
- Passwords are never logged to the console and are masked in screenshots.

---

## 3. Running Login Tests

Run all commands from inside the `harvestlink-automation` directory.

### Farmer Login (`HL-LOGIN-001`)

```powershell
python -m pytest tests/login/test_farmer_login.py -v --headed
```

### Buyer Login (`HL-LOGIN-002`)

```powershell
python -m pytest tests/login/test_buyer_login.py -v --headed
```

### Stakeholder Login (`HL-LOGIN-003`)

```powershell
python -m pytest tests/login/test_stakeholder_login.py -v --headed
```

### Admin Login (`HL-LOGIN-004`)

```powershell
python -m pytest tests/login/test_admin_login.py -v --headed
```

### Invalid Login (`HL-LOGIN-005`)

```powershell
python -m pytest tests/login/test_invalid_login.py -v --headed
```

### Run All Login Tests Sequentially

```powershell
python -m pytest tests/login/ -v --headed
```

---

## 4. Solving CAPTCHA During Execution

HarvestLink uses **Google reCAPTCHA v2** on `/login` and `/admin`. This suite never bypasses or auto-solves CAPTCHA:

1. Chromium opens automatically in headed mode and fills the email and password fields.
2. The terminal displays a `MANUAL CAPTCHA REQUIRED` banner and pauses up to `CAPTCHA_TIMEOUT` seconds.
3. Switch to the open Chromium window and solve the reCAPTCHA challenge manually.
4. Return to the terminal and press **ENTER**.
5. The framework verifies that CAPTCHA did not expire and that the **Sign in** button is enabled, then submits the form automatically.

---

## 5. Screenshots & HTML Reports

- **Screenshots**: Saved automatically per role and execution timestamp (never overwritten):
  ```text
  reports/screenshots/<role>/<YYYYMMDD_HHMMSS_mmm>/
  ├── 01_login_page.png
  ├── 02_credentials_entered.png
  ├── 03_captcha_completed.png
  └── 04_final_result_PASS.png   (or 04_final_result_FAIL.png)
  ```
- **HTML Report**: Generated automatically after every run (including failed runs) at:
  ```text
  reports/html/login_test_report.html
  ```
  Each row includes **Test Case ID**, **Role**, **Expected Result**, **Actual Result**, **Timestamp**, **Duration**, **Status**, and embedded screenshot evidence.

---

## 6. How PASS and FAIL Are Determined

| Test Case | Role | PASS Condition |
|---|---|---|
| `HL-LOGIN-001` | Farmer | Redirected to `/farmer-dashboard`, `.app-shell.role-farmer` and Farmer navigation visible. |
| `HL-LOGIN-002` | Buyer | Redirected to `/buyer-dashboard`, `.app-shell.role-buyer` and `#buyer-overview-title` visible. |
| `HL-LOGIN-003` | Stakeholder | Redirected to `/stakeholder-dashboard`, `.app-shell.role-stakeholder` and `.stakeholder-dashboard-page` visible. |
| `HL-LOGIN-004` | Admin | Accessed `/admin` portal, redirected to `/admin-dashboard`, `.app-shell.role-admin` and `.admin-overview-page` visible. |
| `HL-LOGIN-005` | Invalid Login | Authentication rejected, `.form-alert.error[role="alert"]` visible, user stays unauthenticated on `/login`. |

---

## 7. Troubleshooting

- **`Admin login portal is not accessible from this network/session`**: HarvestLink restricts `/admin` by IP allowlist (`ADMIN_ALLOWED_IPS` on the backend). Ensure your current network IP is authorized for Admin Portal access.
- **`Manual CAPTCHA verification requires an interactive terminal (TTY)`**: Run pytest directly in an interactive PowerShell window (with `-s`, already set in `pytest.ini`), not a non-interactive background runner.
- **`Login submit button is still disabled after pressing ENTER`**: Confirm the green reCAPTCHA checkmark appeared in Chromium before pressing ENTER, and check that the token did not expire.
- **`Missing required environment variable(s)`**: Copy `.env.example` to `.env` and populate the email and password for the role you are testing.
- **Browser fails to launch**: Re-run `python -m playwright install chromium`.
