# Table 31 — UNIT TESTING

The unit-test inventory below is based on the existing JavaScript/Vitest files in
`tests/Unit-Testing/`. The test-case IDs are intentionally shown separately so
that each scenario can be traced to one file and one application module.

| Proponent | Module Name | Unit Name | Date Tested | Test Case ID | Test Case Description | Expected Result | Actual Result | Result |
|---|---|---|---|---|---|---|---|---|
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-001 | Invalid login credentials | Login is rejected with the existing error message | Validation behavior is covered by the Login component test | Passed (last verified) |
| Jeyward Orias | Authentication Module | Common login service | 11/25/2026 | CASE-001 | Valid login authentication | Valid credentials return the authenticated user profile | Authentication service returns the mocked valid profile | Passed (last verified) |
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-002 | Empty email address | Email validation prevents authentication | Empty email is rejected before the authentication call | Passed (last verified) |
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-003 | Empty password | Password validation prevents authentication | Empty password is rejected before the authentication call | Passed (last verified) |
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-004 | Valid credentials | User is authenticated and follows the existing dashboard flow | Mocked successful authentication is handled correctly | Passed (last verified) |
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-005 | Correct email with wrong password | Invalid credentials message appears and login is blocked | Authentication rejection is handled without navigation | Passed (last verified) |
| Jeyward Orias | Admin Authentication | Admin login | 11/25/2026 | CASE-006 | Invalid administrator credentials | Admin login is rejected | Invalid admin credentials remain on the login page | Passed (last verified) |
| Jeyward Orias | Admin Authentication | Admin login | 11/25/2026 | CASE-007 | Empty administrator password | Required password validation appears | Authentication is not called for an empty password | Passed (last verified) |
| Jeyward Orias | Admin Authentication | Admin login | 11/25/2026 | CASE-008 | Valid administrator credentials | Administrator reaches the existing admin flow | Mocked admin authentication succeeds | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-009 | Invalid Philippine contact number | Invalid contact number is rejected | Validation message appears and registration is blocked | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-010 | Valid Philippine contact number | Contact number is accepted with the valid state | Existing Philippine-number rules accept the value | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-011 | Empty complete address and ZIP code | Required address validation appears | Submission is blocked for the missing fields | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-012 | Empty required farmer fields | Required-field validation prevents registration | Missing farmer fields are reported by the existing validator | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-013 | Existing email address | Duplicate-email registration is rejected | The mocked duplicate response is surfaced without account creation | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-014 | Empty email address | Required email validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-015 | Invalid email format | Invalid email format is rejected | The existing email validator blocks submission | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-016 | Empty password | Required password validation appears | Registration is prevented before authentication | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-017 | Weak password | Password strength requirements are enforced | Weak password is identified and registration is blocked | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-018 | Password mismatch | Confirmation mismatch is reported | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-019 | Terms and privacy not accepted | Registration requires agreement | Unchecked agreement prevents submission | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-020 | GPS location not captured | Required GPS validation appears | Missing coordinates block registration | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-021 | Valid registration details | Valid inputs pass field validation | Complete farmer data is accepted without field errors | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-022 | Missing captured GPS location | Address fields do not replace GPS coordinates | Registration remains blocked without captured coordinates | Passed (last verified) |
| Jeyward Orias | Farmer Registration | Farmer sign up | 11/25/2026 | CASE-023 | Missing certification or government ID | Required verification upload is enforced | Submission is blocked without the document | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-024 | Empty verification code | Six-digit code is required | Verification API is not called for an empty code | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-025 | Invalid verification code | Invalid code is rejected | Account remains unverified and on the verification page | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-026 | Expired verification code | Expired code is rejected according to the implementation | Expiration response is handled and resend remains available | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-027 | Valid verification code | Account is verified through the existing flow | Successful verification and redirect behavior are handled | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-028 | Resend verification code | Resend request succeeds and cooldown is applied | Resend API and confirmation behavior are handled | Passed (last verified) |
| Jeyward Orias | Farmer Verification | Email verification | 11/25/2026 | CASE-029 | Resend during cooldown | Duplicate resend is blocked during cooldown | Only the allowed request is sent | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-030 | Empty password and confirmation password | Required password messages appear | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-031 | Empty first name | Required first-name validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-032 | Empty last name | Required last-name validation appears | Registration is blocked on the sign-up page | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-033 | Invalid contact number | Invalid Philippine number is rejected | Existing contact validation prevents registration | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-034 | Valid contact number | Valid Philippine number is accepted | Valid state appears without an error | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-035 | GPS location not captured | Registration requires captured GPS | Missing coordinates prevent registration | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-036 | Empty complete address | Required address validation appears | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-037 | Invalid ZIP code | Four-digit ZIP validation rejects the value | Invalid ZIP prevents registration | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-038 | Empty email address | Required email validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-039 | Invalid email format | Invalid email format is rejected | Missing @ format is blocked | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-040 | Existing email address | Duplicate email response is shown | No new Buyer account is created | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-041 | Weak password | Existing password requirements reject the value | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-042 | Password mismatch | Password confirmation error appears | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-043 | Terms and privacy not accepted | Agreement is required | Sign-up remains blocked | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-044 | Empty contact number | Required contact validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Buyer Registration | Buyer sign up | 11/25/2026 | CASE-045 | Complete valid registration details | All required values pass validation | No required-field error appears | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-046 | Empty organization name | Required organization-name validation appears | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-047 | Empty organization description | Required description validation appears | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-048 | Empty representative first name | Required first-name validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-049 | Empty representative last name | Required last-name validation appears | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-050 | Empty representative position/role | Required position validation appears | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-051 | Invalid contact number | Invalid Philippine number is rejected | Existing contact rules block submission | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-052 | Valid contact number | Valid Philippine number is accepted | No invalid-contact error appears | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-053 | Empty email address | Required email validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-054 | Invalid email format | Invalid email is rejected | Missing @ format is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-055 | Existing email address | Duplicate email response is shown | No new organization account is created | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-056 | Empty password and confirmation password | Required password messages appear | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-057 | Weak password | Actual password requirements reject the value | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-058 | Password mismatch | Password mismatch is detected | Registration is prevented | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-059 | GPS location not captured | Required GPS validation appears | Missing coordinates block registration | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-060 | Empty Barangay | Required Barangay validation appears | Registration is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-061 | Missing verification document | Required document validation appears | Registration API is not called | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-062 | Empty partnership reason | Mandatory partnership reason is enforced | Registration remains blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-063 | Terms and privacy not accepted | Agreement is required | Sign-up remains blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-064 | Complete valid registration details | Stakeholder fields pass validation | No required-field errors appear | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-065 | Empty verification code | Six-digit verification code is required | Verification request is blocked | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-066 | Invalid verification code | Incorrect code is rejected | Account remains unverified | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-067 | Expired verification code | Expired code is rejected | Expiration handling is preserved | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-068 | Valid verification code | Verification succeeds | Existing post-verification flow runs | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-069 | Resend verification code | New code request succeeds | Cooldown and confirmation behavior are applied | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-070 | Resend during cooldown | Second request is blocked | Resend API is called only once | Passed (last verified) |
| Jeyward Orias | Stakeholder Verification | Email verification | 11/25/2026 | CASE-071 | Valid resent verification code | Newly resent code verifies the account | Successful verification is handled once | Passed (last verified) |
| Jeyward Orias | Stakeholder Registration | Partner organization sign up | 11/25/2026 | CASE-072 | Missing captured GPS location | Address values do not satisfy GPS requirement | Registration is blocked without coordinates | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-073 | Invalid email format | Reset request is prevented | Validation blocks the Supabase call | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-074 | Unregistered email address | Recovery handles the address according to the security policy | Existing generic/error behavior is preserved | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-075 | Valid registered email | Reset API receives the email once | Mocked reset request is processed | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-076 | Reset link successfully sent | Confirmation appears after a successful request | Success response is handled without login | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-077 | Expired reset link | Expired recovery credentials are rejected | Password update does not succeed | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-078 | Invalid reset link | Invalid recovery credentials are rejected | No authorized reset session is created | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-079 | Empty new password | Required password validation appears | Password update API is not called | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-080 | Weak new password | Existing strength requirements reject the value | Password update is prevented | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-081 | Password mismatch | “Passwords do not match.” is displayed | Password update is prevented | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-082 | Successful password reset | Strong matching password is accepted | Mocked password update succeeds | Passed (last verified) |
| Jeyward Orias | Authentication Module | Login | 11/25/2026 | CASE-083 | Login using the newly reset password | Login receives the supplied credentials | Mocked successful login response is handled | Passed (last verified) |
| Jeyward Orias | Password Recovery | Reset password | 11/25/2026 | CASE-084 | Reuse of a consumed reset link | Previously used recovery link is rejected | No password update or authenticated redirect occurs | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-085 | Password-reset rate-limit response | Rate-limit notification appears without success | Mocked 429 response is handled | Passed (last verified) |
| Jeyward Orias | Password Recovery | Forgot password | 11/25/2026 | CASE-086 | Network error during reset request | Network-specific notification appears | Request fails without crash or duplicate retry | Passed (last verified) |

## Execution Note

The numbered CASE files represent 86 distinct test-case IDs. `CASE-001` is
intentionally present in both the Login and Common Authentication modules because
they verify different layers. The legacy file
`stakeholder/signup/STAKEHOLDER_SIGNUP_TC55.test.js` is not part of the numbered
inventory and should not be counted as another case.

The maintained numbered-suite run recorded **87 passed tests** (the two
`CASE-001` files are both executed). The Vitest unit configuration intentionally
includes only `CASE-*.test.js`, so the legacy un-numbered file with the stray
identifier `go` is not executed or counted.

Run the numbered unit suite with:

```bash
npx vitest run --config vitest.unit.config.js tests/Unit-Testing
```
