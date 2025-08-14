function createMode() {
    $(".create-section").show();
    $(".update-section").hide();


    $("#user_id").val("");
    $("#user_name").val("");
    $("#user_email").val("");
    $("#user_password").val("");
    $("#user_role").val("");
    $("#user_branch").val("");
}

function updateMode() {
    $(".create-section").hide();
    $(".update-section").show();


    $("#user_id").val("");
    $("#user_name").val("");
    $("#user_email").val("");
    $("#user_password").val("");
    $("#user_role").val("");
    $("#user_branch").val("");
}

$(document).on('click', "#trigger_add_user", function() {
    createMode();
    $("#adduserModal").modal("show");
});

$(document).ready(function () {
    getAllUsers()
        .then(() => getAllBranchesList())
        .then(() => getAllRolesList())
        .catch(err => console.error("Error during page load:", err));
});

function getAllRolesList() {
    return axios.get(baseUrl + '/admin/role/list')
        .then(res => {
            let roles = res.data;
            let $roleSelect = $('#user_role');
            $roleSelect.empty();
            if (!roles?.length) {
                $roleSelect.append('<option value="">No Role Found</option>').prop('disabled', true);
                return;
            }
            $roleSelect.append('<option value="">Select Role</option>').prop('disabled', false);
            $.each(roles, (i, role) => {
                $roleSelect.append(`<option value="${role.id}">${role.name}</option>`);
            });
        });
}

function getAllBranchesList() {
    return axios.get(baseUrl + '/admin/branch/list')
        .then(res => {
            let branches = res.data;
            let $branchSelect = $('#user_branch');
            $branchSelect.empty();
            if (!branches?.length) {
                $branchSelect.append('<option value="">No Branch Found</option>').prop('disabled', true);
                return;
            }
            $branchSelect.append('<option value="">Select Branch</option>').prop('disabled', false);
            $.each(branches, (i, branch) => {
                $branchSelect.append(`<option value="${branch.id}">${branch.name}</option>`);
            });
        });
}

function getAllUsers() {
    myshowLoader();
    return axios.get(baseUrl + '/users/user')
        .then(res => {
            let data = res.data;
            let dtable = $('#user_table').DataTable({
                pageLength: 14,
                lengthChange: false,
                destroy: true
            });
            dtable.clear().draw();
            $.each(data, function (i, user) {
                let statusToggle = `
                    <label class="switch-toggle-table">
                        <input type="checkbox" ${user.is_active ? "checked" : ""} 
                               data-id="${user.id}" 
                               class="status-toggle">
                        <span class="slider-toggle round-toggle"></span>
                    </label>
                `;
                let editBtn = `
                    <button class="border btn edit-user" data-id="${user.id}">
                        <i class="bi-pencil-fill text-success"></i>
                    </button>
                `;
                dtable.row.add([
                    `U#${user.id}`,
                    user.name,
                    user.email,
                    user.role,
                    user.branch,
                    statusToggle,
                    editBtn
                ]).draw(false);
            });
            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching users:", err);
            myhideLoader();
        });
}



$(document).on('change', '.status-toggle', function () {
    let userId = $(this).data('id');
    let newStatus = $(this).is(':checked');
    let $checkbox = $(this);

    Swal.fire({
        title: "Are you sure?",
        text: `User will be ${newStatus ? 'activated' : 'deactivated'}!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#212529",
        confirmButtonText: `Yes, ${newStatus ? 'activate' : 'deactivate'} it!`
    }).then((result) => {
        if (result.isConfirmed) {
            axios.patch(`${baseUrl}/users/user/${userId}/status`, {
                is_active: newStatus
            })
            .then(res => {
                const response = res.data;
                showToastMessage('success', response.message || 'User status updated!');
            })
            .catch(err => {
                console.error(err);
                showToastMessage('error', 'Failed to update user status!');
                $checkbox.prop('checked', !newStatus); // revert if failed
            });
        } else {
            // revert if user cancelled
            $checkbox.prop('checked', !newStatus);
        }
    });
});


$(document).on('click', "#create_user", function (e) {
    e.preventDefault();
    myshowLoader();

    // Collect values
    let user_name = $('#user_name').val().trim();
    let user_email = $('#user_email').val().trim();
    let user_password = $('#user_password').val().trim();
    let user_role = $('#user_role').val();
    let user_branch = $('#user_branch').val();

    // Put them in an array for quick validation
    let fields = [user_name, user_email, user_password, user_role, user_branch];

    // If any field is empty → show error and stop
    if (fields.includes("") || fields.includes(null)) {
        myhideLoader();
        showToastMessage('error', 'Please fill all the fields!');
        return;
    }

    // Send request
    axios.post(baseUrl + '/users/user', {
        name: user_name,
        email: user_email,
        password: user_password,
        role_id: user_role,
        branch_id: user_branch
    })
    .then(res => {
        if (res.status === 201) {
            showToastMessage('success', res.data.message);
            window.location.reload();
        } else {
            showToastMessage('error', res.data.error || 'Failed to create user!');
        }
    })
    .catch(err => {
        console.error(err);
        showToastMessage('error', err.response?.data?.error || 'Something went wrong!');
    })
    .finally(() => {
        myhideLoader();
    });
});

$(document).on('click', '.edit-user', function () {
    let userId = $(this).data('id');
    myshowLoader();

    axios.get(`${baseUrl}/users/user/${userId}`)
        .then(res => {
            const user = res.data;
            console.log(user);
            // Switch form to update mode
            updateMode();

            // Populate form fields
            $('#user_id').val(user.id);
            $('#user_name').val(user.name);
            $('#user_email').val(user.email);
            $('#user_role').val(user.role_id);
            $('#user_branch').val(user.branch_id);
            $('#user_is_active').prop('checked', user.is_active);

            // Show the modal
            $("#adduserModal").modal("show");

            myhideLoader();
        })
        .catch(err => {
            console.error(err);
            showToastMessage('error', 'Failed to load user data!');
            myhideLoader();
        });
});


$(document).on('click', '#update_user', function (e) {
    e.preventDefault();

    let userId = $('#user_id').val();
    let userName = $('#user_name').val().trim();
    let userEmail = $('#user_email').val().trim();
    let userPassword = $('#user_password').val().trim();
    let userRole = $('#user_role').val();
    let userBranch = $('#user_branch').val();

    // Validation: All except password must be filled
    if (!userName || !userEmail || !userRole || !userBranch) {
        showToastMessage('error', 'Please fill all required fields!');
        return;
    }
    // Build request data
    let requestData = {
        name: userName,
        email: userEmail,
        role_id: userRole,
        branch_id: userBranch
    };
    
    if (userPassword) {
    requestData.password = userPassword;
    }
    // Only add password if provided
    if (userPassword) {
        requestData.password = userPassword;
    }

    axios.put(`${baseUrl}/users/user/${userId}`, requestData)
        .then(res => {
            const response = res.data;
            if (response.error) {
                showToastMessage('error', response.error);
                return;
            }
            showToastMessage('success', response.message || 'User updated successfully');
            $('#adduserModal').modal('hide');
            getAllUsers();
        })
        .catch(err => {
            console.error(err);
            showToastMessage('error', 'Something went wrong while updating user');
        });
});


