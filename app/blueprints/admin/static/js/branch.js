function createMode(){
    $(".create-section").show();
    $(".update-section").hide();
    $("#branch_id").val("");
    $("#branch_name").val("");
    $("#branch_description").val("");
    $("#created_by").val("");
}
function updateMode() {
    $(".create-section").hide();
    $(".update-section").show();
   $("#branch_id").val("");
    $("#branch_name").val("");
    $("#branch_description").val("");
    $("#created_by").val("");
}
$(document).on('click', "#trigger_add_branch", function() {
    createMode();
    $("#addBranchModal").modal("show");
});

$(document).ready(function () {
    getAllBranches();
});

function  getAllBranches() {
    myshowLoader();
    axios({
        method: 'GET',
        url: baseUrl + '/admin/branches'
    }).then(res => {
        let data = res.data;
        console.log("branches data", data);

        // Initialize or get DataTable
        var dtable = $('#branch_table').DataTable({
            "pageLength": 14,
            "lengthChange": false,
            "destroy": true // Re-initialize safely
        });

        dtable.clear().draw();

        // Add rows
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
                branch.description,
                branch.created_by,
                formatDateOnly(branch.created_at),
                statusToggle,
                editBtn
            ]).draw(false);
        });

        myhideLoader();
    }).catch(err => {
        myhideLoader();
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
                method: 'POST',  // if you want REST style, change to PATCH
                url: baseUrl + `/admin/branches/${branchId}/toggle`,
                data: { is_active: newStatus }
            }).then(res => {
                const response = res.data;
                showToastMessage('success', response.message || 'Branch status updated!');
            }).catch(err => {
                console.error(err);
                showToastMessage('error', 'Failed to update status!');
                $checkbox.prop('checked', !newStatus); // revert if failed
            });
        } else {
            // revert if user cancelled
            $checkbox.prop('checked', !newStatus);
        }
    });
});

$(document).on('click', "#create_branch", function(e) {
    e.preventDefault(); // stop form from submitting
    myshowLoader();
    console.log("BASE URL",baseUrl)

    let branch_name = $('#branch_name').val().trim();
    let branch_description = $('#branch_description').val().trim();

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
            description: branch_description
        }
    }).then(res => {
        const response = res.data;
        console.log(response);
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

            // Call your updateMode function (assuming it opens the modal)
            updateMode();

            // Populate modal fields
            $('#branch_id').val(branch.id);
            $('#branch_name').val(branch.branch_name);
            $('#branch_description').val(branch.description);
            $('#created_by').val(branch.created_by);
            // $('#branch_created_at').val(branch.created_at);
            $("#addBranchModal").modal("show");
            myhideLoader();
            // If you have a checkbox for status
            // $('#branch_is_active').prop('checked', branch.is_active);
        })
        .catch(err => {
            console.error(err);
            showToastMessage('error', 'Failed to load branch data!');
        });
});

$(document).on('click', '#update_branch', function (e) {
    e.preventDefault(); // stop form from submitting
    let branchId = $('#branch_id').val();
    let branchName = $('#branch_name').val().trim();
    let branchDescription = $('#branch_description').val().trim();

    // Simple validation
    if (!branchName) {
        showToastMessage('error', 'Branch name is required');
        return;
    }

    axios.put(`${baseUrl}/admin/branch/${branchId}`, {
        branch_name: branchName,
        description: branchDescription
    })
    .then(res => {
        const response = res.data;
        console.log(response);
        if (response.error) {
            showToastMessage('error', response.error);
            return;
        }

        showToastMessage('success', response.message || 'Branch updated successfully');
        $('#addBranchModal').modal('hide'); // Close modal if needed
        // window.location.reload();
        getAllBranches();
    })
    .catch(err => {
        console.error(err);
        showToastMessage('error', 'Something went wrong while updating branch');
    });
});

