# AGENTS.md — registrations blueprint

URL prefix: `/registrations`. Master-data CRUD for three entities: diagnostic tests (`Test_registration`), referred doctors/agents (`Referred`), and expense categories (`Expense_head`). Each entity has full CRUD + active/inactive toggle + a simplified "list" endpoint for dropdown population.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `registrations_bp` Blueprint |
| `routes.py` | 18 routes — 4 page renders + 14 JSON APIs (CRUD × 3 entities + list endpoints) |
| `services.py` | All business logic, validation, formatting helpers |
| `templates/add_test.html` | Test registration form |
| `templates/view_test.html` | Test list/edit page |
| `templates/referred_reg.html` | Referred doctor/agent registration |
| `templates/expense_head.html` | Expense head registration |

## Conventions

- **Branch scoping**: API GET endpoints check `session.get("role")` — `admin` sees all branches, everyone else is filtered to `session.get("branch_id")`. POST/PUT inject `branch_id` and `created_by`/`updated_by` from session.
- **Service return pattern**: All service functions return `(result, status_code)` tuples. Routes unpack as `result, status = service_fn(...)`.
- **Toggle endpoints** use PATCH with `{"is_active": true/false}` — e.g., `PATCH /registrations/test-registration/<id>/status`.
- **List endpoints** (suffix `/list`) return `[{id, name}]` arrays filtered to `is_active == True` and `branch_id == session branch`. Used for populating dropdowns in booking forms.

## Domain notes — Test Registration

- Model: `Test_registration` (underscore in class name is canonical)
- `CATEGORY_CHOICES = ["Contrast", "Full Study", "Screening", "Other"]` — defined in `models/test_registration.py`, enforced on create/update; unrecognised values default to `"Other"`
- `charges` is **Float**, `report_charges` is Float (default 0.0) — report_charges is the doctor's per-report fee used in commission calculations
- `no_of_films` (Integer, nullable) — determines how many X-ray/MRI films are pre-allocated when this test is booked
- `sequence_no` is String, not Integer
- `required_days` is **String** (not Integer) — stores human-readable text like "2-3 days"
- Test list endpoint (`GET /registrations/test/list` and `/test/list/<branch_id>`) returns `{id, test_name, price, no_of_films}`

## Domain notes — Referred

- Model: `Referred` — represents both referring doctors and non-doctor agents
- `is_doctor` boolean distinguishes the two types; booking form separates them into `referred_dr` and `referred_non_dr`
- `discount_to_patient` is a **JSON column**: `{"give_discount": bool, "value": int}`. Default is `{"give_discount": false, "value": 0}`
- `location` and `specialization` are required on create (despite model not marking them `nullable=False`)
- ⚠️ **Bug**: `get_all_referred()` with a branch filter applies `Expense_head.branch_id == branch_id` instead of `Referred.branch_id == branch_id`. This means branch filtering for referred records is broken.
- Referred list endpoint returns `{id, name, type}` where `type` is the `is_doctor` boolean

## Domain notes — Expense Head

- Model: `Expense_head` (underscore in class name is canonical)
- Simple name + branch_id + audit fields
- Used as a foreign key in the `Expenses` model (transactions blueprint)
