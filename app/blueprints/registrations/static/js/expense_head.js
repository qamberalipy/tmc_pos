// Open modal for adding new Expense Head
$(document).on("click", "#trigger_add_expensehead", function () {
    $("#expensehead_form")[0].reset();
    $("#expensehead_id").val(""); // clear hidden ID
    $("#expenseheadModalLabel").text("Add Expense Head");
    $("#expenseheadModal").modal("show");
});

// Load all Expense Heads into DataTable
function getAllExpenseHeads() {
    myshowLoader();
    return axios.get(baseUrl + "/registrations/expense-head")
        .then(res => {
            let data = res.data;
            let dtable = $("#expense_table").DataTable({
                pageLength: 14,
                lengthChange: false,
                destroy: true,
                responsive: true
            });
            dtable.clear().draw();
            console.log(data)

            $.each(data, function (i, head) {
                let statusToggle = `
                    <label class="switch-toggle-table">
                        <input type="checkbox" ${head.is_active ? "checked" : ""} 
                               data-id="${head.id}" 
                               class="status-toggle">
                        <span class="slider-toggle round-toggle"></span>
                    </label>
                `;

                let editBtn = `
                    <button class="border btn edit-expense-head" data-id="${head.id}">
                        <i class="bi-pencil-fill text-success"></i>
                    </button>
                `;

                dtable.row.add([
                    `EH#${head.id}`,
                    head.name,
                    head.branch || "-",
                    head.created_by || "-",
                    formatDateOnly(head.created_at) || "-",
                    statusToggle,
                    editBtn
                ]).draw(false);
            });

            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching expense heads:", err);
            myhideLoader();
        });
}

// Handle Status Toggle
$(document).on("change", ".status-toggle", function () {
    let headId = $(this).data("id");
    let newStatus = $(this).is(":checked");
    let $checkbox = $(this);

    Swal.fire({
        title: "Are you sure?",
        text: `Expense Head will be ${newStatus ? "activated" : "deactivated"}!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#212529",
        confirmButtonText: `Yes, ${newStatus ? "activate" : "deactivate"} it!`
    }).then(result => {
        if (result.isConfirmed) {
            axios.patch(`${baseUrl}/registrations/expense-head/${headId}/status`, {
                is_active: newStatus
            })
            .then(res => {
                showToastMessage("success", res.data.message || "Status updated!");
            })
            .catch(err => {
                console.error(err);
                showToastMessage("error", "Failed to update status!");
                $checkbox.prop("checked", !newStatus); // revert if failed
            });
        } else {
            $checkbox.prop("checked", !newStatus); // revert if canceled
        }
    });
});

// Save (Create or Update) Expense Head
$(document).on("submit", "#expensehead_form", function (e) {
    e.preventDefault();
    myshowLoader();

    let headId = $("#expensehead_id").val();
    let name = $("#expensehead_name").val().trim();

    if (!name) {
        myhideLoader();
        showToastMessage("error", "Name is required!");
        return;
    }

    let request;
    if (headId) {
        // Update
        request = axios.put(`${baseUrl}/registrations/expense-head/${headId}`, { name });
    } else {
        // Create
        request = axios.post(baseUrl + "/registrations/expense-head", { name });
    }

    request.then(res => {
        if (res.data.error) {
            showToastMessage("error", res.data.error);
            return;
        }
        showToastMessage("success", res.data.message || "Saved successfully!");
        $("#expenseheadModal").modal("hide");
        getAllExpenseHeads();
    })
    .catch(err => {
        console.error(err);
        showToastMessage("error", err.response?.data?.error || "Something went wrong!");
    })
    .finally(() => {
        myhideLoader();
    });
});

// Load Expense Head into form for editing
$(document).on("click", ".edit-expense-head", function () {
    let headId = $(this).data("id");
    myshowLoader();

    axios.get(`${baseUrl}/registrations/expense-head/${headId}`)
        .then(res => {
            const head = res.data;

            $("#expenseheadModalLabel").text("Edit Expense Head");
            $("#expensehead_id").val(head.id);
            $("#expensehead_name").val(head.name);

            $("#expenseheadModal").modal("show");
        })
        .catch(err => {
            console.error(err);
            showToastMessage("error", "Failed to load expense head data!");
        })
        .finally(() => {
            myhideLoader();
        });
});

// Load expense heads on page ready
$(document).ready(function () {
    getAllExpenseHeads();
});
