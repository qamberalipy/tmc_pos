let baseUrl = new URL(window.location.href);
baseUrl = `${baseUrl.protocol}//${baseUrl.hostname}:${baseUrl.port}`;

/**
 * Global UI Helper Functions
 */
function myshowLoader() {
    $("#loader").show();
}
    
function myhideLoader() {
    $("#loader").hide();
}

function showToastMessage(type, text) {
    switch (type) {
        case 'success':
            toastr.success(text);
            break;
        case 'info':
            toastr.info(text);
            break;
        case 'error':
            toastr.error(text);
            break;
        case 'warning':
            toastr.warning(text);
            break;
        default:
            console.error('Invalid toast type');
            break;
    }
}

function formatDateOnly(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/** * Admin Branch Switching Logic
 * Resolves 404 error and adds UI validation
 */
$(document).ready(function () {
    const branchSwitcher = document.getElementById('globalBranchSwitcher');

    // Only proceed if the switcher element exists and user is admin
    if (branchSwitcher && typeof userRole !== 'undefined' && userRole === 'admin') {
        
        // 1. Fetch the list of branches to populate the dropdown
        fetch(`${baseUrl}/admin/branch/list`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load branches');
                return res.json();
            })
            .then(branches => {
                branches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.id;
                    option.textContent = branch.name;
                    // Pre-select the currently active branch in the session
                    if (branch.id == currentSessionBranchId) {
                        option.selected = true;
                    }
                    branchSwitcher.appendChild(option);
                });
            })
            .catch(err => {
                console.error("Error fetching branch list:", err);
                showToastMessage('error', 'Could not load branches.');
            });

        // 2. Event listener for changing the branch context
        branchSwitcher.addEventListener('change', function () {
            const selectedBranchId = this.value;

            // Validation: Don't trigger if the ID is empty or same as current
            if (!selectedBranchId || selectedBranchId == currentSessionBranchId) return;

            // UI Enhancement: Confirmation Dialog
            Swal.fire({
                title: 'Switch Branch?',
                text: "The page will reload to show data for the selected branch.",
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, Switch'
            }).then((result) => {
                if (result.isConfirmed) {
                    myshowLoader();

                    // POST to the admin blueprint route
                    fetch(`${baseUrl}/admin/switch-branch`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ branch_id: selectedBranchId })
                    })
                    .then(res => {
                        if (res.ok) {
                            // Reload to apply the new session context
                            window.location.reload();
                        } else {
                            throw new Error('Switch failed');
                        }
                    })
                    .catch(err => {
                        console.error("Error during branch switch:", err);
                        showToastMessage('error', 'An error occurred while switching branches.');
                        myhideLoader();
                        // Reset dropdown to previous value on failure
                        branchSwitcher.value = currentSessionBranchId;
                    });
                } else {
                    // Reset dropdown if user cancels the switch
                    branchSwitcher.value = currentSessionBranchId;
                }
            });
        });
    }
});