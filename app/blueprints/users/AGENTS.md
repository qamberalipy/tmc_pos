# AGENTS.md — users blueprint

URL prefix: `/users`. User CRUD, profile settings (email, password, doctor digital signature), shift start/end/status, and doctor lookup endpoints.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `users_bp` Blueprint |
| `routes.py` | 15 routes — 2 page renders + 13 JSON APIs (user CRUD, profile, shifts, doctors) |
| `services.py` | User CRUD, signature update, shift management, doctor queries |
| `templates/users.html` | User management page (admin) |
| `templates/profile_setting.html` | Self-service profile page (email, password, signature) |

## Domain notes — User CRUD

- **Create user** (`POST /users/user`): Requires `name, email, password, role_id, branch_id`. Password is hashed via `generate_password_hash`. Duplicate email check is done at the service level.
- **Update user** (`PUT /users/user/<id>`): Password is only updated if provided and non-empty. Email change triggers duplicate check.
- **Toggle status** (`PATCH /users/user/<id>/status`): Expects `{"is_active": true/false}`. Deactivated users are rejected at login.
- **Get all users** excludes the currently logged-in user (`User.id != session['user_id']`).
- **`get_user_by_id`** returns `role_id` and `branch_id` as integers (not role/branch names) — uses `_format_userwithID`, not `_format_user`.

## Domain notes — Profile & Signature

- **Email + name update** (`PATCH /users/profile/email`): Updates both `User.email` and `User.name` in one call. Also updates `session['user_name']` and `session['user_email']` immediately.
- **Password update** (`PATCH /users/profile/password`): No current-password verification — just sets the new password.
- **Doctor signature** (`POST /users/update_signature`): Form-encoded (not JSON). Fields: `sig_name`, `sig_degrees`, `sig_title`. Saved as JSON string in `User._signature_data` (column name `doctor_signature`). Values are uppercased before storage. After saving, the route manually updates `session['doctor_signature']` and marks `session.modified = True`.

## Domain notes — Shifts

Shifts are only enforced for `user_role == 'staff'` (see root AGENTS.md shift guard section).

- **Status** (`GET /users/shift/status`): Queries `ShiftSession` directly (DB is source of truth, not session). Returns `{is_active, shift_id?, start_time?}`.
- **Start** (`POST /users/shift/start`): If an open shift exists and is >15 hours old, it's auto-closed and a new one is started. If a valid open shift exists, returns it without creating a new one. Sets `session['active_shift_id']`.
- **End** (`POST /users/shift/end`): Sets `end_time = now(UTC)`, `status = 'Closed'`. Clears `session['active_shift_id']`.
- **User shifts** (`GET /users/user-shifts/<user_id>?date=YYYY-MM-DD`): Returns shifts within the **lab-day window** (8AM–4AM+1) for the given date. Times are converted from UTC to branch timezone for display as `"HH:MM AM/PM"` labels.

## Domain notes — Doctor queries

- **`GET /users/get_all_doctors`**: Hardcoded filter `User.role_id == 4` for doctors. Returns `[{id, name}]`.
- **`get_all_staff_users(branch_id)`**: Hardcoded filter `User.role_id == 2` for staff. Used by daily report page for staff dropdown.
