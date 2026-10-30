# Handoff Report: Milestone 1 Adversarial Challenge & Verification

**Agent**: `challenger_m1_1` (Empirical Challenger)  
**Target**: Milestone 1 — Backend Role Scoping & Auth Hierarchy (R1)  
**Binary Verdict**: **REJECT** (Blocking on 2 Confirmed Privilege Escalation Vulnerabilities)

---

## 1. Observation

### 1.1 Empirical Privilege Escalation on Inactive Accounts & Unregistered Identities
- In `app/auth.py` lines 76–89:
  ```python
  def get_current_user():
      """Get current user from JWT identity."""
      email = get_jwt_identity()
      if not email:
          return None
      user = User.query.filter_by(email=email, active=True).first()
      if not user:
          try:
              claims = get_jwt()
              if claims and 'role' in claims:
                  name = email.split('@')[0].replace('test_e2e_', '').replace('.', ' ').title()
                  user = User(
                      email=email,
                      name=name,
                      role=claims.get('role', 'Teammate'),
                      active=True
                  )
          except Exception:
              pass
      return user
  ```
- **Direct Empirical Observation 1 (Deactivated User Escalation)**:
  - Database contains user `damini@agalabs.com` with `active=False` and `role='Inactive'`.
  - When querying `POST /api/crishi/pull` with a JWT issued for `damini@agalabs.com` and `additional_claims={'role': 'SuperAdmin'}`:
    - `User.query.filter_by(email='damini@agalabs.com', active=True).first()` returns `None`.
    - The fallback block executes and fabricates an in-memory `User` with `active=True` and `role='SuperAdmin'`.
    - Endpoint returns **HTTP 200 OK** (instead of HTTP 401 Unauthorized), executing administrative task pulls as an active SuperAdmin:
      ```json
      {"message": "Task Imported Market Prices Chana pulled successfully. SLA deadline: 2026-10-29 18:25", "pull": {"catalogId": 71, "pulledBy": "damini@agalabs.com", "status": "Open"}, "success": true}
      ```
- **Direct Empirical Observation 2 (Arbitrary Unregistered Email Escalation)**:
  - When querying `POST /api/crishi/pull` with a JWT issued for `attacker@evil.com` and `additional_claims={'role': 'SuperAdmin'}`:
    - Endpoint returns **HTTP 200 OK**, executing administrative task pulls as an active SuperAdmin:
      ```json
      {"message": "Task Imported Market Prices Chana pulled successfully. SLA deadline: 2026-10-29 18:25", "pull": {"catalogId": 71, "pulledBy": "attacker@evil.com", "status": "Open"}, "success": true}
      ```

### 1.2 Flattening of Level 3 SuperAdmin Checks in `role_at_least`
- In `app/auth.py` lines 28–32:
  ```python
  def role_at_least(user_role, min_role):
      if min_role in ADMIN_ROLES and is_admin_role(user_role):
          return True
      return ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)
  ```
- **Direct Empirical Observation**:
  - `ADMIN_ROLES = {'SuperAdmin', 'Manager', 'Leader'}`.
  - When `min_role == 'SuperAdmin'`, `min_role in ADMIN_ROLES` is `True`.
  - Evaluating `role_at_least('Leader', 'SuperAdmin')` returns `True`.
  - Evaluating `role_at_least('Manager', 'SuperAdmin')` returns `True`.
  - In `app/routes/admin.py:507`, routes intended exclusively for SuperAdmin (user role modification, password resets, system changes) are bypassed by any Leader or Manager.

### 1.3 Teammate Role Scoping on `GET /api/crishi/grid` (Verified Secure)
- Tested across all 4 teammates:
  - `bhawna@agalabs.com`: 36 tasks, `summary['teammates']`: strictly `['Bhawna']`, zero other teammates appear.
  - `gopichand@agalabs.com`: 36 tasks, `summary['teammates']`: strictly `['Gopi']`, zero other teammates appear.
  - `pankaj@agalabs.com`: 57 tasks, `summary['teammates']`: strictly `['Pankaj']`, zero other teammates appear.
  - `nitesh@agalabs.com`: 25 tasks, `summary['teammates']`: strictly `['Nitesh']`, zero other teammates appear.
- Cross-user task isolation verified: Gopi-only tasks do not leak to Bhawna; Bhawna-only tasks do not leak to Gopi; Nitesh-only tasks do not leak to others.
- Commodity rollups verified strictly filtered to assigned commodities.

### 1.4 Report Scoping on `GET /api/crishi/reports/all` (Verified Secure)
- Tested across all 4 teammates:
  - `bhawna@agalabs.com`: 14 reports (strictly Cotton, Rapeseed, Soybeans, Weather). Zero unassigned commodities leak.
  - `gopichand@agalabs.com`: 70 reports (strictly Rice, Wheat). Zero unassigned commodities leak.
  - `pankaj@agalabs.com`: 145 reports (strictly Spices, Weather). Zero unassigned commodities leak.
  - `nitesh@agalabs.com`: 59 reports (strictly Coarse Cereals, Sugar). Zero unassigned commodities leak.
  - Admins / Leaders: exactly 339 reports.

### 1.5 Database Invariants (Verified Intact)
- Baseline count: 9 users, 27 reports, 158 catalog items.
- Current DB count: Exactly 9 users, 27 reports, 158 catalog items intact. Zero data loss.

---

## 2. Logic Chain

1. **Root Cause of Vulnerability 1 (Inactive Account & Arbitrary Email Escalation)**:
   - Worker attempted to support dynamic test tokens by adding a fallback in `get_current_user()` that creates an in-memory `User` from JWT claims when `User.query.filter_by(email=email, active=True).first()` is `None`.
   - However, when a user is deactivated in the database (`active=False`), `User.query.filter_by(active=True)` returns `None`, so the fallback incorrectly catches them and constructs an active `User` using the claim's role.
   - Furthermore, any email not present in the database can claim any role (including `SuperAdmin`) and is trusted blindly without database verification.
   - Because `pull_task`, `skip_task`, `manager_review`, `update_source`, and `crishi_apply_scrapper_week` call `get_current_user()` and then `is_admin_role(user.role)`, these unauthenticated or deactivated callers gain full administrative privileges.

2. **Root Cause of Vulnerability 2 (Role Hierarchy Flattening)**:
   - Worker intended to allow `Leader` (level 2) to satisfy `Manager` (level 2) requirements.
   - However, by writing `if min_role in ADMIN_ROLES and is_admin_role(user_role): return True`, when `min_role` is `'SuperAdmin'`, the condition evaluates to `True` for any admin role (`SuperAdmin`, `Manager`, `Leader`).
   - This destroys the 3-tier hierarchy (`SuperAdmin` (3) > `Manager`/`Leader` (2) > `Teammate` (1)), allowing Managers and Leaders to pass `SuperAdmin` checks.
   - Note that `ROLE_LEVEL` already has `Leader: 2` and `Manager: 2`. Standard comparison `ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)` naturally satisfies `role_at_least('Leader', 'Manager')` without the flawed override.

---

## 3. Caveats

- For **registered, active Teammates** in the database (e.g. `bhawna@agalabs.com`), role forging is safely blocked because `User.query.filter_by(email=email, active=True).first()` locates their real DB record where `role='Teammate'`, correctly returning HTTP 403 Forbidden.
- The data scoping for `GET /api/crishi/grid` and `GET /api/crishi/reports/all` is robust and leak-free for all tested teammates.
- Baseline data integrity is 100% preserved.

---

## 4. Conclusion

**Verdict**: **REJECT**

Milestone 1 is **REJECTED** due to two critical privilege escalation bugs introduced in `app/auth.py`. 

### Required Remediations Before Re-evaluation:
1. **Fix `get_current_user()` in `app/auth.py`**:
   - Check if user exists in DB: `user = User.query.filter_by(email=email).first()`.
   - If user exists but `not user.active`: return `None` (strictly reject deactivated accounts).
   - Only allow ephemeral test identities if `app.config.get('TESTING')` is `True` AND email starts with `test_` or `e2e_`, never for arbitrary emails or deactivated database users.
2. **Fix `role_at_least()` in `app/auth.py`**:
   - Remove or fix `if min_role in ADMIN_ROLES and is_admin_role(user_role): return True`.
   - Use strict `ROLE_LEVEL` evaluation:
     ```python
     def role_at_least(user_role, min_role):
         return ROLE_LEVEL.get(user_role, 0) >= ROLE_LEVEL.get(min_role, 0)
     ```
     Since `ROLE_LEVEL['Leader'] == 2` and `ROLE_LEVEL['Manager'] == 2`, Leader already satisfies Manager (2 >= 2) while SuperAdmin (3) remains strictly higher than Leader and Manager.

---

## 5. Verification Method

To independently verify these findings, execute the newly authored empirical test suite:

```powershell
.venv\Scripts\python.exe -m unittest tests.test_adversarial_m1_challenger1 -v
```

To directly reproduce the privilege escalation on inactive accounts and arbitrary emails:
```powershell
.venv\Scripts\python.exe -c "
from app import create_app
from flask_jwt_extended import create_access_token
app = create_app()
app.config['TESTING'] = True
client = app.test_client()
with app.app_context():
    # 1. Inactive account escalation
    t_damini = create_access_token(identity='damini@agalabs.com', additional_claims={'role': 'SuperAdmin'})
    res = client.post('/api/crishi/pull', json={'catalogId': 71, 'slaHours': 24}, headers={'Authorization': f'Bearer {t_damini}'})
    print('Damini (Inactive in DB) status code:', res.status_code) # Returns 200 (BUG)

    # 2. Arbitrary email escalation
    t_hacker = create_access_token(identity='attacker@evil.com', additional_claims={'role': 'SuperAdmin'})
    res2 = client.post('/api/crishi/pull', json={'catalogId': 71, 'slaHours': 24}, headers={'Authorization': f'Bearer {t_hacker}'})
    print('Attacker (Unregistered email) status code:', res2.status_code) # Returns 200 (BUG)
"
```
*Expected secure behavior*: HTTP 401 Unauthorized for both.  
*Current vulnerable behavior*: HTTP 200 OK with task pull executed.
