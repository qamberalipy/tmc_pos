function createMode(){
    $(".create-section").show();
    $(".update-section").hide();
    $("#branch_id").val("");
    $("#branch_name").val("");
    $("#contact-no").val("");
    $("#contact-no2").val("");
    $("#branch_address").val("");
    $("#branch_description").val("");
    $("#created_by").val("");
}

function updateMode() {
    $(".create-section").hide();
    $(".update-section").show();
    $("#branch_id").val("");
    $("#branch_name").val("");
    $("#contact-no").val("");
    $("#contact-no2").val("");
    $("#branch_address").val("");
    $("#branch_description").val("");
    $("#created_by").val("");
}
function truncateText(text, length = 10) {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
}

$(document).on('click', "#trigger_add_branch", function() {
    createMode();
    $("#addBranchModal").modal("show");
});

$(document).ready(function () {
    getAllBranches();
});

function getAllBranches() {
    myshowLoader();
    axios({
        method: 'GET',
        url: baseUrl + '/admin/branches'
    }).then(res => {
        let data = res.data;
        console.log("branches data", data);

        var dtable = $('#branch_table').DataTable({
            "pageLength": 14,
            "lengthChange": false,
            "destroy": true
        });

        dtable.clear().draw();

        $.each(data, function (i, branch) {
            let statusToggle = `
                <label class="switch-toggle-table">
                    <input type="checkbox" ${branch.is_active ? "checked" : ""} data-id="${branch.id}" class="status-toggle">
                    <span class="slider-toggle round-toggle"></span>
                </label>
            `;

            let editBtn = `
                <button class="border btn edit-branch" data-id="${branch.id}">
                    <i class="bi-pencil-fill text-success"></i>
                </button>
            `;

            dtable.row.add([
                `BR#${branch.id}`,
                branch.branch_name,
                branch.contact_number || "-",
                truncateText(branch.address, 15) || "-",
                truncateText(branch.description, 15) || "-",
                branch.created_by || "-",
                statusToggle,
                editBtn
            ]).draw(false);
        });

        myhideLoader();
    }).catch(err => {
        myhideLoader();
        console.error(err);
        showToastMessage('error', 'Something Went Wrong!')
    });
}

$(document).on('change', '.status-toggle', function () {
    let branchId = $(this).data('id');
    let newStatus = $(this).is(':checked');
    let $checkbox = $(this);

    Swal.fire({
        title: "Are you sure?",
        text: `Branch will be ${newStatus ? 'activated' : 'deactivated'}!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#212529",
        confirmButtonText: `Yes, ${newStatus ? 'activate' : 'deactivate'} it!`
    }).then((result) => {
        if (result.isConfirmed) {
            axios({
                method: 'POST',
                url: baseUrl + `/admin/branches/${branchId}/toggle`,
                data: { is_active: newStatus }
            }).then(res => {
                const response = res.data;
                showToastMessage('success', response.message || 'Branch status updated!');
            }).catch(err => {
                console.error(err);
                showToastMessage('error', 'Failed to update status!');
                $checkbox.prop('checked', !newStatus);
            });
        } else {
            $checkbox.prop('checked', !newStatus);
        }
    });
});

$(document).on('click', "#create_branch", function(e) {
    e.preventDefault();
    myshowLoader();

    let branch_name = $('#branch_name').val().trim();
    let contact_number = $('#contact-no').val().trim();
    let additional_contact_number = $('#contact-no2').val().trim();
    let address = $('#branch_address').val().trim();
    let description = $('#branch_description').val().trim();

    if (!branch_name) {
        myhideLoader();
        showToastMessage('error', 'Branch Name is required!');
        $('#branch_name').focus();
        return;
    }

    axios({
        method: 'POST',
        url: baseUrl +'/admin/create/branch',
        data: {
            branch_name: branch_name,
            contact_number: contact_number,
            additional_contact_number: additional_contact_number,
            address: address,
            description: description
        }
    }).then(res => {
        const response = res.data;
        if (res.status === 201) {
            showToastMessage('success', response.message);
            window.location.reload();
        } else {
            showToastMessage('error', 'Failed to Create Branch!');
        }
        myhideLoader();
    }).catch(err => {
        myhideLoader();
        console.error(err);
        showToastMessage('error', 'Something Went Wrong!');
    });
});

$(document).on('click', '.edit-branch', function () {
    let branchId = $(this).data('id');
    myshowLoader();
    axios.get(`${baseUrl}/admin/branch/${branchId}`)
        .then(res => {
            const branch = res.data;

            updateMode();

            $('#branch_id').val(branch.id);
            $('#branch_name').val(branch.branch_name);
            $('#contact-no').val(branch.contact_number);
            $('#contact-no2').val(branch.additional_contact_number);
            $('#branch_address').val(branch.address);
            $('#branch_description').val(branch.description);
            $('#created_by').val(branch.created_by);

            $("#addBranchModal").modal("show");
            myhideLoader();
        })
        .catch(err => {
            console.error(err);
            showToastMessage('error', 'Failed to load branch data!');
        });
});

$(document).on('click', '#update_branch', function (e) {
    e.preventDefault();
    let branchId = $('#branch_id').val();
    let branchName = $('#branch_name').val().trim();
    let contact_number = $('#contact-no').val().trim();
    let additional_contact_number = $('#contact-no2').val().trim();
    let address = $('#branch_address').val().trim();
    let branchDescription = $('#branch_description').val().trim();

    if (!branchName) {
        showToastMessage('error', 'Branch name is required');
        return;
    }

    axios.put(`${baseUrl}/admin/branch/${branchId}`, {
        branch_name: branchName,
        contact_number: contact_number,
        additional_contact_number: additional_contact_number,
        address: address,
        description: branchDescription
    })
    .then(res => {
        const response = res.data;
        if (response.error) {
            showToastMessage('error', response.error);
            return;
        }

        showToastMessage('success', response.message || 'Branch updated successfully');
        $('#addBranchModal').modal('hide');
        getAllBranches();
    })
    .catch(err => {
        console.error(err);
        showToastMessage('error', 'Something went wrong while updating branch');
    });
});
