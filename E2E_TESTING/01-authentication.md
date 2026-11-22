# Authentication Functional Checks

| ID | Action | Expected result | Result | Evidence |
|---|---|---|---|---|
| AUTH-01 | Open registration | Registration form loads without console/UI errors |  |  |
| AUTH-02 | Submit missing required fields | Field validation appears and no account is created |  |  |
| AUTH-03 | Register with valid isolated account | Verification flow is shown |  |  |
| AUTH-04 | Log in with invalid credentials | Clear error appears and user remains signed out |  |  |
| AUTH-05 | Log in as each role | User is redirected to the correct role dashboard |  |  |
| AUTH-06 | Refresh a protected page while signed in | Session remains valid |  |  |
| AUTH-07 | Open another role's protected URL | Access is denied or redirected |  |  |
| AUTH-08 | Log out | Session is cleared and protected pages require login |  |  |
| AUTH-09 | Request password recovery | Recovery confirmation is shown without exposing secrets |  |  |
| AUTH-10 | Use an expired/invalid recovery link | Password form remains locked |  |  |
