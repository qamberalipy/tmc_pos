# AGENTS.md — TMC POS (root)

Medical imaging centre POS system. Flask + SQLAlchemy + Flask-Migrate, deployed on Neon (serverless Postgres). Server-rendered Jinja2 templates with Bootstrap 5; client-side JS calls JSON APIs in the same app.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Flask (app factory in `app/__init__.py`) |
| ORM | SQLAlchemy via Flask-SQLAlchemy |
| Migrations | Flask-Migrate (Alembic under the hood) |
| Database | PostgreSQL on Neon (serverless — `pool_pre_ping: True` is critical) |
| Auth | Session-based (`flask.session`), **no** Flask-Login |
| Passwords | `werkzeug.security.generate_password_hash` / `check_password_hash` |
| File storage | Cloudflare R2 (S3-compatible), accessed via `boto3` |
| Templates | Jinja2, base template at `app/templates/base.html` |
| Frontend | Bootstrap 5, Bootstrap Icons, vanilla JS (no React/Vue) |

## Session keys (set at login in `main/routes.py`)

| Key | Type | Notes |
|---|---|---|
| `user_id` | int | |
| `user_name` | str | |
| `user_email` | str | |
| `user_role` | str | One of `admin`, `staff`, `doctor`, `techician` (**typo is canonical** — do NOT "fix" it) |
| `role_id` | int | |
| `branch_id` | int | Admin can change this at runtime via `/admin/switch-branch` |
| `doctor_signature` | dict | `{"name": "...", "degrees": "...", "title": "..."}`, parsed from JSON Text column |
| `active_shift_id` | int | Set/cleared by shift start/end endpoints in `users` blueprint |

## Role system

Roles live in the `role` table. Code hardcodes role IDs in several places:
- **`role_id == 2`** → staff (used in `users/services.py: get_all_staff_users`)
- **`role_id == 4`** → doctor (used in `users/services.py: get_all_doctors`)

Role names in `session['user_role']`: `admin`, `staff`, `doctor`, `techician`.
The spelling `techician` (missing an 'n') is **intentional** and used everywhere — `menu.py`, login routing, templates. Do not correct it.

## Shift guard (`app/shift_guard.py` + `app/__init__.py`)

- `@app.before_request` — only enforced for `user_role == 'staff'`
- Staff without an active `ShiftSession` (status='Open') see `shift_gate.html` on page loads or get `403 {"error":"shift_required"}` on API calls
- Shifts auto-close after **15 hours** — `get_active_shift()` checks elapsed time and force-closes stale shifts
- Exempt endpoints: `main.login`, `main.logout`, `users.api_start_shift`, `users.api_end_shift`, `users.api_shift_status`

## Date / timezone conventions ⚠️

- **All datetimes stored as UTC** in the database
- Branch timezone stored in `Branch.timezone` (default `'Asia/Karachi'`)
- **Lab-day ≠ calendar day**: a "lab day" runs from **08:00 local → 04:00+1 local** (20-hour window). This is used consistently in reports, daily summaries, shift queries, and film inventory. The helper `app/helper.py: get_lab_date_bounds()` implements this
- `TestBooking` timestamp columns are `create_at` / `update_at` (not `created_at` / `updated_at`) — see Models section

## Key app-level files

| File | Purpose |
|---|---|
| `app/__init__.py` | App factory, blueprint registration, `before_request` shift guard, context processor injecting session vars + menu |
| `app/config.py` | `Config` class — DB URI from `.env`, SQLAlchemy pool settings for Neon |
| `app/extensions.py` | Creates `db` (SQLAlchemy) and `migrate` (Flask-Migrate) instances |
| `app/decorators.py` | `login_required` (checks `session['user_id']`), `role_required` (unused/broken — decorator stacking bug, `@wraps` missing arg) |
| `app/helper.py` | `get_lab_date_bounds(from_date_str, to_date_str, branch_id)` → UTC bounds for the 8AM–4AM lab-day window |
| `app/menu.py` | `MENU` dict keyed by role → sidebar nav structure. Separate entries for `admin`, `staff`, `doctor`, `techician`, `default` |
| `app/shift_guard.py` | `get_active_shift(user_id)` — returns open shift or None; auto-closes >15h shifts |

## Models (`app/models/`)

| File | Class(es) | Table | Key gotchas |
|---|---|---|---|
| `branch.py` | `Branch` | `branch` | `created_by` is **String** (not Integer FK) — joined via `cast(Integer)` in admin services |
| `user.py` | `User` | `user` | `_signature_data` maps to column `doctor_signature` (Text, stores JSON string). Has `@property signature_data` getter/setter |
| `role.py` | `Role` | `role` | Column is `role` (same as table name) — `Role.role` returns the role string |
| `department.py` | `Department` | `department` | `created_by`/`updated_by` are String, not Integer |
| `test_registration.py` | `Test_registration` | `test_registration` | `CATEGORY_CHOICES = ["Contrast", "Full Study", "Screening", "Other"]`, `charges` is Float (not Numeric), `no_of_films` determines film allocation per test |
| `test_booking.py` | `TestBooking` | `test_booking` | **`create_at`/`update_at`** (not created_at), **`create_by`/`update_by`** (not created_by). `mr_no` is auto-generated unique. `technician_comments` is Text storing JSON |
| | `TestFilmUsage` | `test_film_usage` | `usage_type` enum: Normal/Extra/Repeat/Error |
| | `FilmInventoryTransaction` | `film_inventory_transactions` | `transaction_type` enum: IN/OUT/ADJUST |
| | `BookingTransferLog` | `booking_transfer_logs` | Tracks inter-branch transfers |
| | `TechnicianBookingMedia` | `technician_booking_media` | R2 file pointers; `file_size_bytes` is BigInteger for 3GB+ |
| `test_booking_details.py` | `TestBookingDetails` | `test_booking_details` | Line items for a booking; `film_issued` boolean tracks per-test film status |
| `referred.py` | `Referred` | `referred` | `is_doctor` boolean, `discount_to_patient` is JSON column `{"give_discount": bool, "value": int}` |
| | `ReferralShare` | `referral_share` | Links booking→referred with `share_amount`; `is_paid`/`paid_at`/`expense_id` track payment |
| `expense_head.py` | `Expense_head` | `expense_head` | Underscore in class name is canonical |
| `expenses.py` | `Expenses` | `expenses` | `is_deleted` for soft-delete; `amount` is **Integer** (not Numeric/Float) |
| | `PaymentTransaction` | `payment_transactions` | `direction` IN/OUT, `transaction_type` Initial/DueClearance/Expense/TransferOut_Held |
| `shift.py` | `ShiftSession` | `shift_sessions` | `status` enum: Open/Closed. `@property is_active` |
| `doctor_reporting_details.py` | `DoctorReportingdetails` | `doctor_reporting_details` | **`booking_id` and `doctor_id` are String(225)** despite storing integer IDs — must cast when joining |
| | `DoctorReportData` | `doctor_report_data` | Report content shifted from text fields to cloud file URL (`report_file_url`). Legacy text fields kept nullable |
| `technician_chat_log.py` | `TechnicianChatLog` | `technician_chat_log` | Chat messages per booking; `media_attachments` relationship to `TechnicianBookingMedia` |

## Blueprint registration

All blueprints registered in `app/__init__.py`:

| Blueprint var | Name | URL prefix |
|---|---|---|
| `main_bp` | `main` | *(none — root)* |
| `admin_bp` | `admin` | `/admin` |
| `users_bp` | `users` | `/users` |
| `registrations_bp` | `registrations` | `/registrations` |
| `booking_bp` | `booking` | `/booking` |
| `transaction_bp` | `transactions` | `/transactions` |
| `reports_bp` | `reports` | `/reports` |
| `uploads_bp` | `uploads` | `/uploads` |

## Subsystem docs

Every blueprint has its own `AGENTS.md` with route-specific detail:

| Blueprint | AGENTS.md path | Summary |
|---|---|---|
| `admin` | `app/blueprints/admin/AGENTS.md` | Branch CRUD, admin + staff dashboards, branch switching, lookup lists (roles, departments) |
| `booking` | `app/blueprints/booking/AGENTS.md` | Test bookings, payments, dues, film tracking, referral shares, transfers, technician drive + chat |
| `main` | `app/blueprints/main/AGENTS.md` | Login/logout, session bootstrap, role-based redirects |
| `registrations` | `app/blueprints/registrations/AGENTS.md` | Master data CRUD: tests, referred doctors/agents, expense heads |
| `reports` | `app/blueprints/reports/AGENTS.md` | Daily reports (5 sub-APIs), doctor case assignment & reporting, radiologist logs, commission sheets, case logs |
| `transactions` | `app/blueprints/transactions/AGENTS.md` | Expenses CRUD with PaymentTransaction dual-write, monthly expense log |
| `uploads` | `app/blueprints/uploads/AGENTS.md` | Cloudflare R2 multipart upload (init → chunk → complete), pure API, no templates |
| `users` | `app/blueprints/users/AGENTS.md` | User CRUD, profile + doctor signature, shift management |
