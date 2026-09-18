# AGENTS.md — transactions blueprint

URL prefix: `/transactions`. Manages operational expenses with automatic dual-write to `PaymentTransaction` for financial integrity, and provides a monthly expense log report.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `transaction_bp` Blueprint — ⚠️ **variable is `transaction_bp`** (singular), but Blueprint name is `'transactions'` (plural). Endpoint references use `transactions.` prefix |
| `routes.py` | 8 routes — 2 page renders + 6 JSON APIs |
| `services.py` | Expense CRUD with PaymentTransaction sync, monthly log aggregation |
| `templates/view_expenses.html` | Expense list/create/edit page |
| `templates/referral_shares.html` | Referral share management page (data comes from booking blueprint APIs) |
| `templates/monthly_expense_log.html` | Monthly expense log report page |

## Domain notes

- **Dual-write pattern**: Every expense create/update/delete also creates/updates/deletes a corresponding `PaymentTransaction` row with `direction="OUT"` and `transaction_type="Expense"`. This keeps the `payment_transactions` table as the single source of truth for cash flow reports.
- **`create_expense` uses `"Branch_id"` (capital B)** in the request payload, not `"branch_id"`. The route handler sets `data["Branch_id"] = str(bid)` from session. The service reads `data["Branch_id"]` and casts to int. Do not rename this — the capital B is expected.
- **`created_by` is cast to string** in the route before passing to service: `data["created_by"] = str(uid)`. The service casts it back to int. This string↔int dance happens because the route and service were written at different times.
- **Soft delete** (`PATCH /transactions/expenses/<id>/deleted`): Sets `Expenses.is_deleted = True` and **hard-deletes** the associated `PaymentTransaction` row. Restoring (`is_deleted = False`) re-creates a fresh `PaymentTransaction`. This means the original transaction timestamp is lost on restore.
- **`ALLOWED_PAYMENT_METHODS`** = `{"Cash", "Card", "Online", "Other"}` — validated on create and update.
- **`Expenses.amount` is Integer** in the model (not Float or Numeric). Keep this in mind when doing arithmetic — no decimal precision.
- **Date filtering** on `GET /transactions/expenses`: Requires both `from_date` and `to_date` (YYYY-MM-DD format) or neither. Uses `Expenses.created_at` (not a custom lab-day window).
- **Monthly expense log** (`GET /transactions/monthly-expense-log/data?month=YYYY-MM`): Returns `{branch, month, total_expenses, daily_average, total_transactions, active_days, head_breakdown: [...], days: [...]}`. Groups expenses by calendar day and expense head. The `head_breakdown` includes percentage of grand total.
