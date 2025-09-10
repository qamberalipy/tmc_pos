// Load All Test Registrations
function getAllTestRegistrations() {
    myshowLoader();
    return axios.get(baseUrl + "/registrations/test-registration")
        .then(res => {
            let data = res.data;
            let dtable = $("#testReg_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 14,
                lengthChange: false
            });
            dtable.clear().draw();

            $.each(data, function (i, t) {
                let statusToggle = `
                    <label class="switch-toggle-table">
                        <input type="checkbox" ${t.is_active ? "checked" : ""} 
                               data-id="${t.id}" class="status-toggle">
                        <span class="slider-toggle round-toggle"></span>
                    </label>
                `;

                let editBtn = `
                    <button class="border btn edit-testReg" data-id="${t.id}">
                        <i class="bi-pencil-fill text-success"></i>
                    </button>
                `;

                dtable.row.add([
                    `T#${t.id}`,
                    t.test_name || "-",
                    t.sample_collection || "-",
                    t.department_id || "-",
                    t.charges || "-",
                    t.required_days == "0" ? "Same day" : (t.required_days || "-"),
                    t.sequence_no || "-",
                    t.description || "-",
                    statusToggle,
                    editBtn
                ]).draw(false);
            });

            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching test registrations:", err);
            myhideLoader();
        });
}

// -----------------------------
// Edit Test Registration
// -----------------------------
$(document).on("click", ".edit-testReg", function () {
    let id = $(this).data("id");

    axios.get(baseUrl + "/registrations/test-registration/" + id)
        .then(res => {
            let t = res.data;

            // Fill modal fields
            $("#test_name").val(t.test_name);
            $("#sample_collection").val(t.sample_collection);
            $("#department_name").val(t.department_id); // adjust if mapping dept_id to name
            $("#charge").val(t.charges);
            $("#required_days").val(t.required_days);
            $("#sequence").val(t.sequence_no);
            $("#no_of_films").val(t.no_of_films);
            $("#description").val(t.description);

            // Store ID for update
            $("#update_testReg").data("id", t.id);

            $("#addtestRegModal").modal("show");
        })
        .catch(err => {
            console.error("Error fetching testReg by ID:", err);
            showToastMessage("error", "Failed to fetch test details!");
        });
});

// -----------------------------
// Update Test Registration
// -----------------------------
$(document).on("click", "#update_testReg", function () {
    let id = $(this).data("id");

    let payload = {
        test_name: $("#test_name").val().trim(),
        sample_collection: $("#sample_collection").val().trim(),
        department_id: $("#department_name").val(),
        charges: $("#charge").val(),
        required_days: $("#required_days").val(),
        sequence_no: $("#sequence").val(),
        no_of_films: $("#no_of_films").val(),
        description: $("#description").val().trim()
    };

    axios.put(baseUrl + "/registrations/test-registration/" + id, payload)
        .then(res => {
            showToastMessage("success", res.data.message || "Test Registration updated!");
            $("#addtestRegModal").modal("hide");
            getAllTestRegistrations();
        })
        .catch(err => {
            console.error("Error updating test registration:", err);
            showToastMessage("error", "Failed to update Test Registration!");
        });
});

// -----------------------------
// Toggle Status
// -----------------------------
$(document).on("change", ".status-toggle", function () {
    let id = $(this).data("id");
    let isActive = $(this).is(":checked");

    axios.patch(baseUrl + "/registrations/test-registration/" + id + "/status", { is_active: isActive })
        .then(res => {
            showToastMessage("success", res.data.message);
            getAllTestRegistrations();
        })
        .catch(err => {
            console.error("Error toggling status:", err);
            showToastMessage("error", "Failed to update status!");
        });
});

// -----------------------------
// Init
// -----------------------------
function getAllDepartmentsList() {
return axios.get(baseUrl + '/admin/department/list')
  .then(res => {
      let departments = res.data;
      let $departmentSelect = $('#department_name');
      $departmentSelect.empty();
      if (!departments?.length) {
          $departmentSelect.append('<option value="">No Department Found</option>').prop('disabled', true);
          return;
      }
      $departmentSelect.append('<option value="">Select Department</option>').prop('disabled', false);
      $.each(departments, (i, department) => {
          $departmentSelect.append(`<option value="${department.id}">${department.name}</option>`);
      });
  });
}
$(document).ready(function () {
    Promise.all([
        getAllDepartmentsList(),
        getAllTestRegistrations()
    ])
    .then(() => {
        console.log("All data loaded successfully!");
    })
    .catch(err => {
        console.error("Error during page load:", err);
    });
});
