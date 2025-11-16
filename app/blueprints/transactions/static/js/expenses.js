

// Open modal for adding new Expense
$(document).on("click", "#trigger_add_expense", function () {
    $("#expense_form")[0].reset();
    $("#expense_id").val(""); // clear hidden ID
    $("#expenseModalLabel").text("Add Expense");
    $("#expenseModal").modal("show");
});

// Load all Expenses into DataTable
function getAllExpenses() {
    myshowLoader();
    return axios.get(`${baseUrl}/transactions/expenses`)
        .then(res => {
            let data = res.data;
            let dtable = $("#expense_table").DataTable({
                pageLength: 14,
                lengthChange: false,
                destroy: true,
                responsive: true
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
            axios.patch(`${baseUrl}/transactions/expenses/${expId}/deleted`, {
                is_deleted: true
            })
            .then(res => {
                showToastMessage("success", res.data.message || "Expense deleted successfully!");
                getAllExpenses(); // Refresh table
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

    // Client-side validation
    if (!expense_head_id) {
        myhideLoader();
        showToastMessage("error", "Expense Head is required!");
        return;
    }
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
        myhideLoader();
        showToastMessage("error", "Valid Amount is required!");
        return;
    }
    if (!payment_method) {
        myhideLoader();
        showToastMessage("error", "Payment Method is required!");
        return;
    }

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
        // Update
        request = axios.put(`${baseUrl}/transactions/expenses/${expId}`, payload);
    } else {
        // Create
        request = axios.post(`${baseUrl}/transactions/expenses`, payload);
    }

    request.then(res => {
        if (res.data.error) {
            showToastMessage("error", res.data.error);
            return;
        }
        showToastMessage("success", res.data.message || "Saved successfully!");
        $("#expenseModal").modal("hide");
        getAllExpenses(); // Refresh table
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
            $("#expense_head_id").val(exp.expense_head_id);  // Assumes ID is in response
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

// Load expenses on page ready
$(document).ready(function () {
    getAllExpenses();
});