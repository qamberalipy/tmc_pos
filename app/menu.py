MENU = {
    "admin": [
        {"label": "Dashboard", "icon": "bi-house-door-fill", "endpoint": "admin.view_admin_dashboard"},
        {"label": "Department", "icon": "bi-bank2", "endpoint": None, "children": [
            {"label": "User", "icon": "bi-person-fill-add", "endpoint": "users.view_user"},
            {"label": "Branch", "icon": "bi-house-add-fill", "endpoint": "admin.view_branch"},
        ]},
         {"label": "Registration", "icon": "bi-bank2", "endpoint": None, "children": [
            {"label": "Test Reg", "icon": "bi-bag-plus-fill", "endpoint": "registrations.test_registration"},
            {"label": "Referred Dr Reg", "icon": "bi-person-fill-add", "endpoint": "registrations.referred_registration"},
            {"label": "Expense Head Reg", "icon": "bi-house-add-fill", "endpoint": "registrations.expense_registration"},
        ]},
        {"label": "Transactions", "icon": "bi-currency-exchange", "endpoint": None, "children": [
            {"label": "Payment", "icon": "bi-cash-stack", "endpoint": "#"},
            {"label": "Expense", "icon": "bi-wallet2", "endpoint": "transactions.view_expenses"},
        ]},
        {"label": "Reports", "icon": "bi-graph-up-arrow", "endpoint": None, "children": [
            {"label": "Daily Collection", "icon": "bi-journal-text", "endpoint": "users.view_user"},
            {"label": "Test Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
            {"label": "Doctor Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
            {"label": "Expense Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
        ]},
        
    ],
    "staff": [
        {"label": "Dashboard", "icon": "bi-house-door-fill", "endpoint": "admin.view_admin_dashboard"},
        {"label": "Registration", "icon": "bi-bank2", "endpoint": None, "children": [
            {"label": "Test Reg", "icon": "bi-bag-plus-fill", "endpoint": "registrations.test_registration"},
            {"label": "View Test", "icon": "bi bi-eye-fill", "endpoint": "registrations.view_test_registration"},
            {"label": "Referred Dr Reg", "icon": "bi-person-fill-add", "endpoint": "registrations.referred_registration"},
            {"label": "Expense Head Reg", "icon": "bi-house-add-fill", "endpoint": "registrations.expense_registration"},
        ]},
        {"label": "Booking", "icon": "bi-book", "endpoint": None, "children": [
            {"label": "Test Booking", "icon": "bi-bag-plus-fill", "endpoint": "booking.view_test_booking"},
            {"label": "View Booking", "icon": "bi bi-eye-fill", "endpoint": "booking.view_view_booking"},
            {"label": "Films Audit", "icon": "bi bi-file-medical", "endpoint": "booking.view_films_audit"},
        ]},
        {"label": "Transactions", "icon": "bi-currency-exchange", "endpoint": None, "children": [
            {"label": "Payment", "icon": "bi-cash-stack", "endpoint": "#"},
            {"label": "Expense", "icon": "bi-wallet2", "endpoint": "transactions.view_expenses"},
        ]},
        {"label": "Reports", "icon": "bi-graph-up-arrow", "endpoint": None, "children": [
            {"label": "Daily Collection", "icon": "bi-journal-text", "endpoint": "users.view_user"},
            {"label": "Test Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
            {"label": "Doctor Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
            {"label": "Expense Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
        ]},
        
    ],
    "default": [
        {"label": "Amazon", "icon": "bi-amazon", "endpoint": "#"},
    ]
}
