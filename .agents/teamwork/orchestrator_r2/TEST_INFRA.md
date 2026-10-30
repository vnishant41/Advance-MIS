# E2E Test Infra: Advance ERP Role Scoping and Update History

## Test Philosophy
- Opaque-box, requirement-driven. Derived from ORIGINAL_REQUEST.md.
- Verification across 4 tiers: Feature Coverage (Tier 1), Boundary & Corner Cases (Tier 2), Cross-Feature Interaction (Tier 3), and Real-World Application Scenarios (Tier 4).

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Admin Unrestricted Surveillance Grid Access | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Teammate Scoped Surveillance Grid Access | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Teammate Scoped Reports & Categories | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Teammate Portfolio Chips Scoping | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Leader Role Admin Privilege Access | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Database Update Timestamp & History Extraction | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Mandatory History Fields Integrity (9 Fields) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Update History Immutability (Append-Only) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Update History Endpoint Role Scoping | ORIGINAL_REQUEST §R2, R3 | 5 | 5 | ✓ |
| 10 | Crishi Update History Tab UI & Filters | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Direct Portfolio Chip History Linking | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Test Account Seeding & Zero Data Loss | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Python unittest (`.venv\Scripts\python.exe -m unittest discover -s tests -p "test_crishi_history_*.py" -v`)
- Test files: `tests/test_crishi_history_and_scoping.py`
- Test users:
  - SuperAdmin: `nishant@agalabs.com` / `vaibhav@agalabs.com`
  - Manager: `ram@agalabs.com`
  - Leader: `test_e2e_leader@agalabs.com` (or dynamic token with `role='Leader'`)
  - Teammates: `bhawna@agalabs.com` (Soybeans, Cotton), `gopichand@agalabs.com` (Rice, Wheat), `nitesh@agalabs.com` (Maize, Sugar), `pankaj@agalabs.com` (Spices)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Bhawna (Teammate) logs in, sees only Soybeans/Cotton portfolio, verifies Trade Flow – Soybeans DB update (99 rows on 2026-07-01), sees only her own update records | F2, F3, F4, F6, F7, F9, F10 | High |
| 2 | Ram Gopal (Manager / Admin) logs in, views unrestricted grid (158 tables), inspects Bhawna's and Nishant's updates, filters update history by teammate | F1, F5, F6, F7, F9, F10, F11 | High |
| 3 | Teammate attempts unauthorized access to administrative mutating endpoints and queries other teammates' update history | F2, F3, F4, F8, F9 | Medium |
| 4 | Repeated database sync operations verify immutability: subsequent syncs append new history entries without mutating prior timestamps or records | F6, F7, F8, F9 | High |
| 5 | Leader user performs all administrative oversight actions across all commodities and teammates | F1, F5, F9, F10 | Medium |

## Coverage Thresholds
- Tier 1 (Feature Coverage): >=5 test cases per feature (>=60 test cases)
- Tier 2 (Boundary & Corner Cases): >=5 boundary cases per feature (>=60 test cases)
- Tier 3 (Cross-Feature Combinations): pairwise coverage across auth, grid, reports, history, and UI
- Tier 4 (Real-World Scenarios): >=5 comprehensive end-to-end user scenarios
