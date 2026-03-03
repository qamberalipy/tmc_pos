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

/**
 * Global UI Helper Functions
 */

// --- NEW GLOBAL LAB DATE HELPER ---
function getGlobalLabDate(offsetDays = 0) {
    let targetDate = new Date();
    
    // Apply Lab Day Rule: If it's before 8:00 AM, it counts as yesterday
    if (targetDate.getHours() < 8) {
        targetDate.setDate(targetDate.getDate() - 1);
    }
    
    // Apply offset for historical default dates (e.g., "30 days ago")
    if (offsetDays !== 0) {
        targetDate.setDate(targetDate.getDate() + offsetDays);
    }
    
    let year = targetDate.getFullYear();
    let month = String(targetDate.getMonth() + 1).padStart(2, '0');
    let day = String(targetDate.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
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


/**
 * =============================================================
 * STAFF SHIFT MANAGEMENT LOGIC
 * =============================================================
 */
$(document).ready(function () {
    
    // Shift Logic - Only execute if user role is defined and is NOT an admin
    if (typeof userRole !== 'undefined' && userRole !== 'admin') {
        initLiveClock();
        fetchShiftStatus();
    }

    let shiftTimerInterval = null;

    // 1. Live Current Time Clock
    function initLiveClock() {
        setInterval(() => {
            const now = new Date();
            $('#liveClock').text(now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            $('#liveDate').text(now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
        }, 1000);
    }

    // 2. Fetch True Shift Status from Server
    function fetchShiftStatus() {
        axios.get(`${baseUrl}/users/shift/status`)
            .then(res => {
                $('#shiftLoader').addClass('d-none');
                if (res.data.is_active) {
                    renderActiveShift(res.data.start_time);
                } else {
                    renderInactiveShift();
                }
            })
            .catch(err => {
                console.error("Error loading shift status", err);
                $('#shiftLoader').html('<span class="text-danger small fw-bold">Sync Error</span>');
            });
    }

    // 3. UI State: Shift Active
    function renderActiveShift(startTimeUtcStr) {
        $('#btnStartShift').addClass('d-none');
        $('#btnEndShift').removeClass('d-none');
        $('#shiftTimerBadge').removeClass('d-none').addClass('d-flex');

        // Automatically converts UTC DB string to User's Local Browser Time
        const startTime = new Date(startTimeUtcStr);

        clearInterval(shiftTimerInterval);
        shiftTimerInterval = setInterval(() => {
            const now = new Date();
            const diffMs = now - startTime;
            
            if (diffMs < 0) return; // Guard clause for clock sync differences

            const h = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
            const m = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');

            $('#shiftTimer').text(`${h}:${m}:${s}`);
        }, 1000);
    }

    // 4. UI State: Shift Inactive
    function renderInactiveShift() {
        clearInterval(shiftTimerInterval);
        $('#shiftTimerBadge').removeClass('d-flex').addClass('d-none');
        $('#btnEndShift').addClass('d-none');
        $('#btnStartShift').removeClass('d-none');
    }

    // 5. Start Shift Action
    $('#btnStartShift').on('click', function () {
        Swal.fire({
            title: 'Start your shift?',
            text: "Your transactions will now be tracked under a new active session.",
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#0d6efd',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '<i class="bi bi-play-circle"></i> Yes, Start Shift'
        }).then((result) => {
            if (result.isConfirmed) {
                myshowLoader();
                axios.post(`${baseUrl}/users/shift/start`)
                    .then(res => {
                        myhideLoader();
                        showToastMessage('success', 'Shift started successfully.');
                        renderActiveShift(res.data.start_time);
                    })
                    .catch(err => {
                        myhideLoader();
                        showToastMessage('error', err.response?.data?.error || 'Failed to start shift.');
                    });
            }
        });
    });

    // 6. End Shift Action
    $('#btnEndShift').on('click', function () {
        Swal.fire({
            title: 'End your shift?',
            text: "This will close your current session and stop the timer. You cannot undo this action.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '<i class="bi bi-stop-circle"></i> Yes, End Shift'
        }).then((result) => {
            if (result.isConfirmed) {
                myshowLoader();
                axios.post(`${baseUrl}/users/shift/end`)
                    .then(res => {
                        myhideLoader();
                        showToastMessage('success', 'Shift ended successfully.');
                        renderInactiveShift();
                    })
                    .catch(err => {
                        myhideLoader();
                        showToastMessage('error', err.response?.data?.error || 'Failed to end shift.');
                    });
            }
        });
    });
});