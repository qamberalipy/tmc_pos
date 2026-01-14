MENU = {
    "admin": [
        {
            "label": "Dashboard", 
            "icon": "bi-house-door-fill", 
            "endpoint": "admin.view_admin_dashboard", 
            "css_class": ""
        },
        {
            "label": "Department", 
            "icon": "bi-bank2", 
            "endpoint": None, 
            "css_class": "nav-group-registration", # Blue (Standard)
            "children": [
                {"label": "User", "icon": "bi-person-fill-add", "endpoint": "users.view_user"},
                {"label": "Branch", "icon": "bi-house-add-fill", "endpoint": "admin.view_branch"},
            ]
        },
        {
            "label": "Registration", 
            "icon": "bi-bank2", 
            "endpoint": None, 
            "css_class": "nav-group-registration", # Blue (Standard)
            "children": [
                {"label": "Test Reg", "icon": "bi-bag-plus-fill", "endpoint": "registrations.test_registration"},
                {"label": "Referred Dr Reg", "icon": "bi-person-fill-add", "endpoint": "registrations.referred_registration"},
                {"label": "Expense Head Reg", "icon": "bi-house-add-fill", "endpoint": "registrations.expense_registration"},
            ]
        },
        {
            "label": "Transactions", 
            "icon": "bi-currency-exchange", 
            "endpoint": None, 
            "css_class": "nav-group-transactions", # Amber (Finance)
            "children": [
                {"label": "Payment", "icon": "bi-cash-stack", "endpoint": "#"},
                {"label": "Expense", "icon": "bi-wallet2", "endpoint": "transactions.view_expenses"},
            ]
        },
        {
            "label": "Reports", 
            "icon": "bi-graph-up-arrow", 
            "endpoint": None, 
            "css_class": "nav-group-reports", # Indigo (Data)
            "children": [
                {"label": "Daily Report", "icon": "bi-journal-text", "endpoint": "reports.view_daily_reports"},
                {"label": "Test Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
                {"label": "Doctor Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
                {"label": "Expense Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
            ]
        },
    ],
    
    "staff": [
        {
            "label": "Dashboard", 
            "icon": "bi-house-door-fill", 
            "endpoint": "admin.view_admin_dashboard", 
            "css_class": ""
        },
        {
            "label": "Registration", 
            "icon": "bi-bank2", 
            "endpoint": None, 
            "css_class": "nav-group-registration",
            "children": [
                {"label": "Test Reg", "icon": "bi-bag-plus-fill", "endpoint": "registrations.test_registration"},
                {"label": "View Test", "icon": "bi bi-eye-fill", "endpoint": "registrations.view_test_registration"},
                {"label": "Referred Dr Reg", "icon": "bi-person-fill-add", "endpoint": "registrations.referred_registration"},
                {"label": "Expense Head Reg", "icon": "bi-house-add-fill", "endpoint": "registrations.expense_registration"},
            ]
        },
        # --- BOOKING (Green Highlight) ---
        {
            "label": "Booking", 
            "icon": "bi-calendar2-check", 
            "endpoint": None, 
            "css_class": "nav-group-booking", # Green (Action)
            "children": [
                {"label": "Test Booking", "icon": "bi-clipboard-plus", "endpoint": "booking.view_test_booking"},
                {"label": "View Booking", "icon": "bi-list-check", "endpoint": "booking.view_view_booking"},
                {"label": "Book Results","icon": "bi-file-earmark-medical","endpoint": "booking.view_booking_result"},
                {"label": "View Dues", "icon": "bi-cash-stack", "endpoint": "booking.view_dues"}
            ]
        },
        {
            "label": "Films", 
            "icon": "bi bi-file-medical", 
            "endpoint": None, 
            "css_class": "nav-group-registration",
            "children": [
                {"label": "Inventory Audit", "icon": "bi-file-earmark-post", "endpoint": "booking.view_films_inventory_audit"},
                {"label": "Films Usage", "icon": "bi-file-earmark-text", "endpoint": "booking.view_films_usage"},
            ]
        },
        {
            "label": "Transactions", 
            "icon": "bi-currency-exchange", 
            "endpoint": None, 
            "css_class": "nav-group-transactions", # Amber (Finance)
            "children": [
                {"label": "Expense", "icon": "bi-wallet2", "endpoint": "transactions.view_expenses"},
                {"label": "Referral Share", "icon": "bi-cash-stack", "endpoint": "transactions.view_referral_share"}
            ]
        },
        {
            "label": "Reports", 
            "icon": "bi-graph-up-arrow", 
            "endpoint": None, 
            "css_class": "nav-group-reports", # Indigo (Data)
            "children": [
                {"label": "Daily Report", "icon": "bi-journal-text", "endpoint": "reports.view_daily_reports"},
                {"label": "Test Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
                {"label": "Doctor Wise Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
                {"label": "Expense Report", "icon": "bi-file-earmark-bar-graph", "endpoint": "#"},
                {"label": "Radiologist Logs", "icon": "bi-file-earmark-bar-graph", "endpoint": "reports.view_radiologist_logs"}
            ]
        },
    ],
    
    "doctor": [
        {
            "label": "Pending Cases", 
            "icon": "bi-bag-plus-fill", 
            "endpoint": "reports.view_pending_cases",
            "css_class": "nav-group-booking" 
        },
        {
            "label": "Report Cases", 
            "icon": "bi bi-eye-fill", 
            "endpoint": "reports.view_reported_cases",
            "css_class": "nav-group-booking" 
        },
    ],
    
    "default": [
        {"label": "Amazon", "icon": "bi-amazon", "endpoint": "#", "css_class": ""},
    ]
}