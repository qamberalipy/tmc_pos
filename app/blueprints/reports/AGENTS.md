# AGENTS.md — reports blueprint

URL prefix: `/reports`. Daily operational reports (5 sub-APIs: expenses, films, dues, summary, test breakdown), doctor case assignment and reporting workflow, radiologist and internal reporting logs, monthly commission sheets, and monthly case logs.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `reports_bp` Blueprint |
| `routes.py` | ~25 routes — 7 page renders + ~18 JSON APIs. Contains `get_lab_day_bounds()` and `get_shift_time_ranges()` helper functions inline |
| `services.py` | **1145 lines** — report aggregation queries, doctor assignment logic, report save/update |
| `templates/daily_report.html` | Daily report dashboard (expenses, films, dues, summary, test report tabs) |
| `templates/doctor_pending_cases.html` | Doctor view — pending cases to report on |
| `templates/doctor_reported_cases.html` | Doctor view — already-reported cases |
| `templates/view_patient_report.html` | Public/printable patient report view |
| `templates/check_report.html` | Report review page |
| `templates/radiologist_logs.html` | Per-doctor radiologist performance logs |
| `templates/doctor_reporting_logs.html` | Internal doctor reporting logs |
| `templates/monthly_commission_sheet.html` | Monthly commission summary for referring doctors |
| `templates/monthly_case_logs.html` | Monthly case volume logs |
| `templates/view_booking_result.html` | Booking result management / assignment page |

## Daily report system

All 5 daily report APIs share the same parameter pattern:

```
GET /reports/daily-report/{sub}?date=YYYY-MM-DD&shift_ids=1,2,3&user_id=5
```

- `date` → converted to **lab-day bounds** (8AM–4AM+1) via `get_lab_day_bounds()` (defined inline in `routes.py`, not the one from `app/helper.py`)
- `shift_ids` → optional comma-separated `ShiftSession.id` list. When provided, filtering switches from lab-day bounds to exact shift time ranges. If a shift is still open, `end_time` defaults to `now(UTC)`.
- `user_id` → optional. Only applied when `shift_ids` is also provided (filters by the staff member who created the record).

### Sub-APIs

| Endpoint | Service function | Returns |
|---|---|---|
| `/daily-report/expenses` | `get_expenses_report` | Expenses grouped by expense head `[{head_id, head_name, total_amount}]` |
| `/daily-report/films` | `get_daily_films_report` | `{film_start, film_closing, film_use, film_added}` — opening/closing stock + day activity |
| `/daily-report/dues` | `get_due_clearance_report` | DueClearance transactions with patient details |
| `/daily-report/summary` | `get_daily_summary` | Cash flow: `{regular_income, transferred_held_cash, total_income, total_expense, net_cash}` — uses `PaymentTransaction` |
| `/daily-report/test-report` | `get_daily_test_report` | Tests grouped by name `[{test_name, count, amount}]` |

## Doctor reporting workflow

### Assignment (staff/admin side)

1. **Assign bookings** (`POST /reports/assign-bookings`): Payload `{bookings: [{booking_id, test_ids: [...]}, ...], doctor_id}`. Creates `DoctorReportingdetails` rows (status=Pending) per booking+test combination. Deduplicates against existing pending assignments.
2. **View assignments** (`GET /reports/assigned-reports?from_date=...&to_date=...&status=Pending,Reported`): Joins `DoctorReportingdetails` → `TestBooking` (cast booking_id to Integer) → `User` (cast doctor_id to Integer). Uses lab-day bounds for date filtering.
3. **Delete assignment** (`DELETE /reports/assigned-reports/delete/<id>`): Hard-deletes the `DoctorReportingdetails` row.

### Reporting (doctor side)

4. **Pending cases** (`GET /reports/bookings/pendingcase`): Filters by `doctor_id = session['user_id']` (as string), status=Pending. Returns patient info, test name, technician comments, referring doctor name.
5. **Decline assignment** (`POST /reports/decline-assignment`): Sets status to "Declined" and `is_active = False`.
6. **Save report** (`POST /reports/api/save-report`): Creates `DoctorReportData` row with patient info + cloud file URL (from R2 upload). Updates corresponding `DoctorReportingdetails` → status=Reported, links `report_details_id`.
7. **Update report** (`PUT /reports/api/update-report/<report_id>`): Updates existing `DoctorReportData`.
8. **Reported cases** (`GET /reports/bookings/reportedcase`): Doctor's completed reports.
9. **View report** (`GET /reports/view-patient-report/<report_id>`): Server-rendered patient report page.

### Critical type-cast gotcha

`DoctorReportingdetails.booking_id` and `doctor_id` are **String(225)** columns despite storing integer IDs. All joins to `TestBooking.id` or `User.id` require `cast(DoctorReportingdetails.booking_id, Integer)` and `cast(DoctorReportingdetails.doctor_id, Integer)`. Forgetting the cast will produce zero results or type errors.

## Radiologist logs

- **Page** (`GET /reports/radiologist-logs`): Renders log viewer.
- **Data** (`GET /reports/radiologist-logs/<doctor_id>?start_date=...&end_date=...`): Returns per-booking report entries for the given doctor within the date range.

## Doctor reporting logs (internal)

- **Page** (`GET /reports/doctor-reporting-logs`): Renders log viewer.
- **Data** (`GET /reports/doctor-reporting-logs/<doctor_id>?start_date=...&end_date=...`): Similar to radiologist logs but for internal reporting tracking.

## Monthly commission sheet

- **Page** (`GET /reports/view/monthly-commission-sheet`)
- **Data** (`GET /reports/monthly-commission-sheet/data?month=YYYY-MM`): Calculates doctor commissions using `Test_registration.report_charges` per reported test. Aggregates by doctor with per-booking breakdown.

## Monthly case logs

- **Page** (`GET /reports/monthly-case-logs`)
- **Data** (`GET /reports/monthly-case-logs/data?from_date=...&to_date=...&referred_dr_id=...&referred_non_dr_id=...`): Case volume report filterable by referring doctor/agent. Returns booking details with test breakdowns.
