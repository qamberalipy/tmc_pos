# AGENTS.md — admin blueprint

URL prefix: `/admin`. Manages branches (CRUD, activate/deactivate), provides admin and staff dashboards with summary cards and charts, and exposes lookup lists for roles and departments used by other blueprints' forms.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `admin_bp` Blueprint (name=`'admin'`) |
| `routes.py` | 12 routes — page renders + JSON APIs |
| `services.py` | All business logic; cross-imports `booking` and `transactions` services for staff dashboard |
| `templates/branch.html` | Branch management page |
| `templates/admin_dashboard.html` | Admin-role dashboard |
| `templates/staff_dashboard.html` | Staff-role dashboard |

## Domain notes

- **Double prefix on some routes**: Routes like `@admin_bp.route('/admin/branch')` sit inside a blueprint already mounted at `/admin`, producing actual URL `/admin/admin/branch`. This is intentional — do not "fix" the route path.
- **`Branch.created_by` is a String column** storing integer user IDs. The `get_all_branches()` service joins it to `User.id` via `cast(Branch.created_by, Integer)`. If you add new joins on this column, you must also cast.
- **Branch switching** (`POST /admin/switch-branch`): Only updates `session['branch_id']` — no DB write. Admin users can switch context to any branch; the rest of the app uses `session.get('branch_id')` everywhere to scope queries.
- **Admin dashboard summary** (`get_dashboard_summary`): Queries `TestBooking.create_at` (not `created_at`), sums `paid_amount`, `due_amount`, and `Expenses.amount`. Returns last-14-day revenue trend, test category breakdown, top 5 referring doctors.
- **Staff dashboard summary** (`get_staff_dashboard_summary`): Cross-calls `transaction_services.get_all_expenses()` and `booking_services.get_film_inventory_report()` to compute today's expense total and films balance. Recent results use `DoctorReportingdetails.is_active == True` subquery.
- **Lookup endpoints** (`/admin/branch/list`, `/admin/role/list`, `/admin/department/list`): Return simplified `[{id, name}]` arrays for dropdown population. Branch list filters `is_active == True`; roles and departments return all.
