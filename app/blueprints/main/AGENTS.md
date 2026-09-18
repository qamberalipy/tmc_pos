# AGENTS.md — main blueprint

URL prefix: *(none — root)*. Handles authentication (login / logout), session bootstrap, the default dashboard, an error page, and a legacy user-creation endpoint.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `main_bp` Blueprint; sets `static_url_path='/static/main'` (avoids static-file collisions with other blueprints) |
| `routes.py` | 6 routes — login, logout, home, dashboard, error page, create_user |
| `services.py` | `create_user` (password hashing), `get_user_by_email` (login query with signature parsing) |
| `templates/login.html` | Login form (POST to `/login`) |
| `templates/base.html` | App-wide base template (sidebar, header) — **lives in `app/templates/`, not this blueprint's templates folder** |

## Domain notes

- **Login flow**: Form POST → `get_user_by_email()` joins `User` + `Role`, checks `is_active`, verifies password via `check_password_hash`. On success, sets 7 session keys (see root AGENTS.md) then redirects by role.
- **Role-based landing pages** after login:
  - `admin` → `admin.view_admin_dashboard`
  - `staff` → `admin.view_staff_dashboard` (yes, staff dashboard lives in the admin blueprint)
  - `doctor` → `reports.view_pending_cases`
  - `techician` → `booking.view_technician_drive` (spelling matches `menu.py`)
  - fallback → `main.dashboard`
- **Doctor signature gate**: If a doctor has no signature (`has_signature == False`), login redirects to `users.profile` instead of the landing page. `has_signature` is derived by checking that both `name` and `title` fields are non-empty in the parsed JSON.
- **`get_user_by_email` returns `doctor_signature` as a dict** (parsed from the JSON string in `User._signature_data`), not a raw string. The dict is stored directly in `session['doctor_signature']`.
- **`/create_user` route** is a legacy endpoint — the primary user creation flow is in the `users` blueprint. This one does not set `role_id` or `branch_id`.
- **`/` route** renders `login.html` directly (no redirect). There is no separate "home" page for unauthenticated users.
