

// Open modal for adding new Expense
$(document).on("click", "#trigger_add_expense", function () {
    $("#expense_form")[0].reset();
    $("#expense_id").val(""); 
    $("#expenseModalLabel").text("Add Expense");
    $("#expenseModal").modal("show");
    $('#payment_method').val('').trigger('change');
});

function loadExpenseHeads() {
    const $select = $("#expense_head_id");
    $select.html('<option value="">Loading...</option>');
    axios.get(`${baseUrl}/registrations/expense-head/list`)
        .then(function (response) {
            const data = response.data;

            // If no records
            if (!data || data.length === 0) {
                $select.html('<option value="">--No Record--</option>');
                return;
            }

            // Clear and set default first option
            $select.html('<option value="">--Select Expense Head--</option>');

            // Also populate the filter dropdown
            const $filter = $("#filter_expense_head");
            $filter.html('<option value="">All</option>');

            // Populate options
            data.forEach(function (item) {
                $select.append(
                    `<option value="${item.id}">${item.name}</option>`
                );
                $filter.append(
                    `<option value="${item.id}">${item.name}</option>`
                );
            });
        })
        .catch(function (error) {
            console.error("Error loading expense heads:", error);

            // Show an error message in the select
            $select.html('<option value="">Error loading data</option>');
        });
}

// Load all Expenses into DataTable
function getAllExpenses() {
    myshowLoader();

    // --- NEW: Prepare Params ---
    const params = {
        from_date: $("#from_date").val(),
        to_date: $("#to_date").val(),
        expense_head_id: $("#filter_expense_head").val()
    };

    return axios.get(`${baseUrl}/transactions/expenses`, { params: params })
        .then(res => {
            let data = res.data;
            window.__lastExpenseData = data;
            let dtable = $("#expense_table").DataTable({
                pageLength: 14,
                lengthChange: false,
                destroy: true,
                responsive: true,
                order: [[8, "desc"]] // Sort by Created At (column 8 after inserting Description)
            });
            dtable.clear().draw();
            console.log(data);

            $.each(data, function (i, exp) {
                let editBtn = `
                    <button class="border-0 btn btn-sm edit-expense" data-id="${exp.id}" title="Edit">
                        <i class="bi bi-pencil-fill text-success"></i>
                    </button>
                `;
                let deleteBtn = `
                    <button class="border-0 btn btn-sm delete-expense" data-id="${exp.id}" title="Delete">
                        <i class="bi bi-trash-fill text-danger"></i>
                    </button>
                `;

                dtable.row.add([
                    exp.id,
                    exp.expense_head || "-",
                    exp.amount || "-",
                    exp.paid_to || "-",
                    exp.description || "-",
                    exp.payment_method || "-",
                    exp.branch || "-",
                    exp.created_by || "-",
                    formatDateOnly(exp.created_at) || "-",
                    `${editBtn} ${deleteBtn}`
                ]).draw(false);
            });

            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching expenses:", err);
            showToastMessage("error", err.response?.data?.error || "Failed to load expenses!");
            myhideLoader();
        });
}

// Handle Delete (Soft Delete)
$(document).on("click", ".delete-expense", function () {
    let expId = $(this).data("id");

    Swal.fire({
        title: "Are you sure?",
        text: "This expense will be soft-deleted and hidden from the list!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc3545",
        cancelButtonColor: "#212529",
        confirmButtonText: "Yes, delete it!"
    }).then(result => {
        if (result.isConfirmed) {
            axios.patch(`${baseUrl}/transactions/expenses/${expId}/deleted`, { is_deleted: true })
            .then(res => {
                showToastMessage("success", res.data.message || "Expense deleted successfully!");
                getAllExpenses(); 
            })
            .catch(err => {
                console.error(err);
                showToastMessage("error", err.response?.data?.error || "Failed to delete expense!");
            });
        }
    });
});

// Save (Create or Update) Expense
$(document).on("submit", "#expense_form", function (e) {
    e.preventDefault();
    myshowLoader();

    let expId = $("#expense_id").val();
    let expense_head_id = $("#expense_head_id").val().trim();
    let amount = $("#amount").val().trim();
    let description = $("#description").val().trim();
    let ref_no = $("#ref_no").val().trim();
    let payment_method = $("#payment_method").val();
    let paid_to = $("#paid_to").val().trim();

    if (!expense_head_id) { myhideLoader(); showToastMessage("error", "Expense Head is required!"); return; }
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) { myhideLoader(); showToastMessage("error", "Valid Amount is required!"); return; }
    if (!payment_method) { myhideLoader(); showToastMessage("error", "Payment Method is required!"); return; }

    let payload = {
        expense_head_id: parseInt(expense_head_id),
        amount: parseInt(amount),
        description: description || "",
        ref_no: ref_no || "",
        payment_method: payment_method,
        paid_to: paid_to || ""
    };

    let request;
    if (expId) {
        request = axios.put(`${baseUrl}/transactions/expenses/${expId}`, payload);
    } else {
        request = axios.post(`${baseUrl}/transactions/expenses`, payload);
    }

    request.then(res => {
        showToastMessage("success", res.data.message || "Saved successfully!");
        $("#expenseModal").modal("hide");
        getAllExpenses(); 
    })
    .catch(err => {
        console.error(err);
        showToastMessage("error", err.response?.data?.error || "Something went wrong!");
    })
    .finally(() => {
        myhideLoader();
    });
});

// Load Expense into form for editing
$(document).on("click", ".edit-expense", function () {
    let expId = $(this).data("id");
    myshowLoader();

    axios.get(`${baseUrl}/transactions/expenses/${expId}`)
        .then(res => {
            const exp = res.data;
            $("#expenseModalLabel").text("Edit Expense");
            $("#expense_id").val(exp.id);
            $("#expense_head_id").val(exp.expense_head_id); 
            $("#amount").val(exp.amount);
            $("#payment_method").val(exp.payment_method);
            $("#ref_no").val(exp.ref_no);
            $("#paid_to").val(exp.paid_to);
            $("#description").val(exp.description);
            $("#expenseModal").modal("show");
        })
        .catch(err => {
            console.error(err);
            showToastMessage("error", err.response?.data?.error || "Failed to load expense data!");
        })
        .finally(() => {
            myhideLoader();
        });
});

// --- NEW: Helper to format date YYYY-MM-DD ---
function getTodayDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Load expenses on page ready
$(document).ready(function () {
    // 1. Initialize Dates to Today
    const today = getTodayDate();
    $("#from_date").val(today);
    $("#to_date").val(today);

    loadExpenseHeads();
    getAllExpenses();
});

// =============== PDF (Print View) ===============
$(document).on("click", "#btnPrintPdf", function () {
    if (!window.__lastExpenseData || window.__lastExpenseData.length === 0) {
        showToastMessage("error", "No data loaded yet.");
        return;
    }
    const rows = window.__lastExpenseData;
    const from = $("#from_date").val() || "All", to = $("#to_date").val() || "All";
    const branch = rows[0]?.branch || "All Branches";
    const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    let bodyRows = rows.map((r, i) => `
        <tr><td>${i + 1}</td><td>${r.expense_head || "-"}</td><td style="text-align:right">${Number(r.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>${r.paid_to || "-"}</td><td>${r.description || "-"}</td><td>${r.payment_method || "-"}</td>
        <td>${r.branch || "-"}</td><td>${r.created_by || "-"}</td><td>${formatDateOnly(r.created_at) || "-"}</td></tr>
    `).join("");

    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Expense Report</title>
    <style>
        @page { size: landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; padding: 12px; font-size: 12px; }
        h2 { margin: 0 0 2px; text-align: center; }
        .meta { text-align: center; color: #555; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 5px 7px; text-align: center; }
        thead th { background: #f1f1f1; }
        .grand-row td { background: #1e3a5f; color: #fff; font-weight: bold; }
    </style></head><body>
    <h2>EXPENSE REPORT &mdash; ${branch}</h2>
    <div class="meta">From: ${from} &nbsp;|&nbsp; To: ${to}</div>
    <table><thead><tr><th>S.No</th><th>Expense Head</th><th>Amount</th><th>Paid To</th><th>Description</th><th>Payment Method</th><th>Branch</th><th>Created By</th><th>Created At</th></tr></thead>
    <tbody>${bodyRows}
    <tr class="grand-row"><td colspan="2" style="text-align:right;">Grand Total</td><td style="text-align:right;">${total.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td colspan="6"></td></tr>
    </tbody></table>
    <script>window.onload = () => window.print();<` + `/script>
    </body></html>`);
    win.document.close();
});

// =============== EXCEL (SheetJS) ===============
$(document).on("click", "#btnExportExcel", function () {
    if (!window.__lastExpenseData || window.__lastExpenseData.length === 0) {
        showToastMessage("error", "No data loaded yet.");
        return;
    }
    const rows = window.__lastExpenseData;
    const from = $("#from_date").val() || "All", to = $("#to_date").val() || "All";
    const branch = rows[0]?.branch || "All Branches";
    const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const aoa = [];

    // Title & meta
    aoa.push(["EXPENSE REPORT — " + branch]);
    aoa.push(["From: " + from + "  |  To: " + to]);
    aoa.push([]);

    // Header
    aoa.push(["S.No", "Expense Head", "Amount", "Paid To", "Description", "Payment Method", "Branch", "Created By", "Created At"]);

    // Data rows
    rows.forEach((r, i) => {
        aoa.push([
            i + 1,
            r.expense_head || "-",
            parseFloat(r.amount) || 0,
            r.paid_to || "-",
            r.description || "-",
            r.payment_method || "-",
            r.branch || "-",
            r.created_by || "-",
            formatDateOnly(r.created_at) || "-"
        ]);
    });

    // Grand total
    aoa.push([]);
    aoa.push(["", "Grand Total", total, "", "", "", "", "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `Expense_Report_${from}_to_${to}.xlsx`);
});