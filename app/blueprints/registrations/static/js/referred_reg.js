// Open modal for adding new referred
$(document).on("click", "#trigger_add_referred", function () {
    $("#referred_form")[0].reset();
    $("#referred_id").val("");
    $("#referredModalLabel").text("Add Referred");
    $("#referredModal").modal("show");
});

// Load all referred persons
function getAllReferred() {
    myshowLoader();
    return axios.get(baseUrl + "/registrations/referred")
        .then(res => {
            let data = res.data;
            let dtable = $("#referred_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 14,
                lengthChange: false
            });
            dtable.clear().draw();

            $.each(data, function (i, r) {
                let type = r.is_doctor ? "Doctor" : "Non-Doctor";
                let statusToggle = `
                    <label class="switch-toggle-table">
                        <input type="checkbox" ${r.is_active ? "checked" : ""} 
                               data-id="${r.id}" class="status-toggle">
                        <span class="slider-toggle round-toggle"></span>
                    </label>
                `;
                let editBtn = `
                    <button class="border btn edit-referred" data-id="${r.id}">
                        <i class="bi-pencil-fill text-success"></i>
                    </button>
                `;

                dtable.row.add([
                    `R#${r.id}`,
                    r.name,
                    type,
                    r.contact_no || "-",
                    r.location || "-",
                    statusToggle,
                    editBtn
                ]).draw(false);
            });

            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching referred:", err);
            myhideLoader();
        });
}

// Save referred (Create or Update)
$(document).on("submit", "#referred_form", function (e) {
    e.preventDefault();
    myshowLoader();

    let id = $("#referred_id").val();
    let payload = {
        name: $("#doctor_name").val().trim(),
        contact_no: $("#contact_no").val().trim(),
        specialization: $("#specialization").val().trim(),
        location: $("#location").val().trim(),
        is_doctor: $("#referred_type").val() === "true",
        discount_to_patient: {
            give_discount: $("#give_discount").is(":checked"),
            value: parseFloat($("#discount_value").val()) || 0
        },
    };

    if (!payload.name) {
        myhideLoader();
        showToastMessage("error", "Name is required!");
        return;
    }
    if (payload.contact_no.length !== 11) {
        myhideLoader();
        showToastMessage("error", "Contact No must be exactly 11 digits!");
        return;
    }

    let request = id
        ? axios.put(`${baseUrl}/registrations/referred/${id}`, payload)
        : axios.post(`${baseUrl}/registrations/referred`, payload);

    request.then(res => {
        showToastMessage("success", res.data.message || "Saved successfully!");
        $("#referredModal").modal("hide");
        getAllReferred();
    })
    .catch(err => {
        console.error("Error saving referred:", err);
        showToastMessage("error", err.response?.data?.error || "Something went wrong!");
    })
    .finally(() => {
        myhideLoader();
    });
});

// Edit referred
$(document).on("click", ".edit-referred", function () {
    let id = $(this).data("id");
    myshowLoader();

    axios.get(`${baseUrl}/registrations/referred/${id}`)
        .then(res => {
            const r = res.data;

            $("#referred_id").val(r.id);
            $("#doctor_name").val(r.name);
            $("#contact_no").val(r.contact_no);
            $("#specialization").val(r.specialization);
            $("#location").val(r.location);
            $("#referred_type").val(r.is_doctor ? "true" : "false");
            $("#give_discount").prop("checked", r.discount_to_patient?.give_discount);
            $("#discount_value").val(r.discount_to_patient?.value || 0);

            $("#referredModalLabel").text("Edit Referred");
            $("#referredModal").modal("show");
        })
        .catch(err => {
            console.error(err);
            showToastMessage("error", "Failed to load referred data!");
        })
        .finally(() => {
            myhideLoader();
        });
});

// Toggle status
$(document).on("change", ".status-toggle", function () {
    let id = $(this).data("id");
    let newStatus = $(this).is(":checked");
    let $checkbox = $(this);

    Swal.fire({
        title: "Are you sure?",
        text: `This referred will be ${newStatus ? "activated" : "deactivated"}!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#212529",
        confirmButtonText: `Yes, ${newStatus ? "activate" : "deactivate"} it!`
    }).then(result => {
        if (result.isConfirmed) {
            axios.patch(`${baseUrl}/registrations/referred/${id}/status`, { is_active: newStatus })
                .then(res => {
                    showToastMessage("success", res.data.message || "Status updated!");
                })
                .catch(err => {
                    console.error(err);
                    showToastMessage("error", "Failed to update status!");
                    $checkbox.prop("checked", !newStatus);
                });
        } else {
            $checkbox.prop("checked", !newStatus);
        }
    });
});

// Init
$(document).ready(function () {
    getAllReferred();
    $('#discount_value').prop('disabled', true);
      $('#give_discount').on('change', function () {
    if ($(this).is(':checked')) {
      $('#discount_value').prop('disabled', false);
    } else {
      $('#discount_value').prop('disabled', true).val('');
    }
  });
});
