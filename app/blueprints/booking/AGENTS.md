# AGENTS.md — booking blueprint

URL prefix: `/booking`. The largest blueprint in the app. Handles the core business flow: creating patient test bookings, managing payments and dues, tracking X-ray/MRI film usage and inventory, managing referral doctor commissions, transferring bookings between branches, and providing a technician workspace with media uploads and per-booking chat.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `booking_bp` Blueprint |
| `routes.py` | ~35 routes — 10 page renders + ~25 JSON APIs |
| `services.py` | **1810 lines** — all business logic. Cross-imports `reports.services._to_float` |
| `templates/test_booking.html` | Create new booking page |
| `templates/view_booking.html` | Search/view/edit bookings list |
| `templates/view_booking_result.html` | Booking results management (assign to doctor) |
| `templates/view_dues.html` | Outstanding dues list |
| `templates/receipt.html` | Booking receipt (print-ready) |
| `templates/due_receipt.html` | Due clearance receipt |
| `templates/sticker.html` | Patient sticker (print-ready) |
| `templates/transfer_booking.html` | Branch transfer page |
| `templates/films_usage.html` | Film usage audit |
| `templates/films_inventory.html` | Film inventory management |
| `templates/film_usage_log.html` | Film usage log report |
| `templates/technician_drive.html` | Technician workspace (media uploads + chat) |

## Critical field-name gotchas

| What you'd expect | Actual column name | Model |
|---|---|---|
| `created_at` | **`create_at`** | `TestBooking` |
| `updated_at` | **`update_at`** | `TestBooking` |
| `created_by` | **`create_by`** | `TestBooking` |
| `updated_by` | **`update_by`** | `TestBooking` |

These non-standard names are used throughout all services and queries. Do not "correct" them.

## Booking creation flow

1. Frontend sends JSON with patient info + `tests: [{test_id, amount, no_of_films, ...}]`
2. Route injects `create_by` and `branch_id` from session
3. `create_test_booking()` does all of these in one atomic operation:
   - Generates `mr_no` via `_generate_mr_no()` (format: `YYMM-NNNN`, e.g., `2609-0042`). Retries up to 3 times on `IntegrityError` (collision)
   - Creates `TestBooking` row
   - Creates `ReferralShare` row if `referred_dr` is provided
   - Creates `PaymentTransaction` (direction=IN, type=Initial) if `paid_amount > 0`
   - Creates `TestBookingDetails` rows (line items)
   - Creates `TestFilmUsage` + `FilmInventoryTransaction` (type=OUT) if tests require films
4. Returns `{booking_id, mr_no, total_tests}`

## MR number format

`YYMM-NNNN` — e.g., `2609-0042` for the 42nd booking in Sept 2026. Generated from `_generate_mr_no()` which queries the last booking ID with the current month prefix and increments.

## Dues

- **View dues** (`GET /booking/dues`): Filters by branch, date range, and status (`unpaid`/`paid`/`all`). Uses lab-day bounds (8AM–4AM).
- **Clear due** (`POST /booking/clear-due/<booking_id>`): Partial payments allowed. Decrements `TestBooking.due_amount`, increments `paid_amount`, creates `PaymentTransaction` (direction=IN, type=DueClearance). Returns `transaction_id` for receipt printing.
- **Due receipt** (`GET /booking/receipt/due/<transaction_id>`): Server-rendered receipt page.

## Film tracking

Three interconnected models:
- `TestBookingDetails.no_of_films` — pre-allocated films per test (from `Test_registration`)
- `TestFilmUsage` — actual usage records per booking (usage_type: Normal/Extra/Repeat/Error)
- `FilmInventoryTransaction` — running inventory ledger (IN/OUT/ADJUST)

Key operations:
- **Edit film usage** (`POST /booking/films/`): Adjusts films for a specific booking+test. Creates inventory correction transactions.
- **Inventory transaction** (`POST /booking/inventory/`): Manual stock adjustments (e.g., new packet received = IN).
- **Films audit** (`GET /booking/films-audit/data`): Date-range query of all film usage with booking details.
- **Film inventory report** (`GET /booking/get-film-inventory-report`): Opening/closing balance with transaction-by-transaction detail. Returns `{data: [{date, type, ...}]}` where type is `"normal"` or `"packet"`.
- **Film status update** (`POST /booking/update-film-status`): Toggles `TestBookingDetails.film_issued` boolean for a specific test in a booking.

## Referral shares

- **List** (`GET /booking/referral-shares/list`): Filtered by branch (from session), optionally by `referred_id`, date range, and `is_paid` status.
- **Toggle payment** (`POST /booking/referral-shares/<share_id>/toggle-payment`): Marking as paid creates an `Expenses` record + `PaymentTransaction` (direction=OUT, type=Expense). Unmarking reverses both.
- **Update amount** (`PUT /booking/referral-shares/<share_id>`): Changes `share_amount`.
- **Update provider** (`POST /booking/update-share-provider`): Changes which referred doctor/agent gets the share. Blocked if share is already paid.

## Booking transfer

- **Transfer page** (`GET /booking/transfer/<booking_id>`): Shows transfer form.
- **Execute transfer** (`POST /booking/transfer-rebook`): Creates a new booking at target branch with new tests, logs in `BookingTransferLog`, handles cash held from original booking as `PaymentTransaction` (type=TransferOut_Held).

## Refund

- **Process refund** (`POST /booking/refund/<booking_id>`): Full refund flow. The `reason` field is optional (defaults to "Customer Request").

## Patient search

- `GET /booking/search-patient?term=...` — Searches by `patient_name` or `mr_no` (partial match), scoped to branch.

## Technician drive & chat

- **List** (`GET /booking/technician-drive/list`): Returns bookings with media counts. Non-staff get 40-day date limit.
- **Media CRUD**: Upload metadata saved to `TechnicianBookingMedia` (actual files go to R2 via the uploads blueprint). Soft-delete via `is_active = False`.
- **Chat** (`GET/POST /booking/api/v1/bookings/<id>/chat`): WhatsApp-style paginated chat. Messages saved in `TechnicianChatLog`, with optional media attachments linked via `chat_log_id` on `TechnicianBookingMedia`.

## Non-staff date limit

`get_all_test_bookings` route enforces a 40-day lookback limit for non-admin roles. If `from_date` is older than 40 days or not provided, it's forced to `now - 40 days`.

## Technician comments

`TestBooking.technician_comments` is a `db.Text` column that stores **JSON** (not plain text). The `add_booking_comment` service parses and appends to a `{"comments": [...]}` structure. Read via `get_booking_comments` which extracts the `technician_comments` field from booking details.
