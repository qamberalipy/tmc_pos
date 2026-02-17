$(document).ready(function () {
    // 1. Load data on page load
    getAssignedReports();

    // 2. Bind Search Button
    $("#searchBtn").on("click", function() {
        getAssignedReports();
    });
});

// =======================================================
// 🔥 FETCH DATA AND RENDER TABLE
// =======================================================
function getAssignedReports() {
    if (typeof myshowLoader === 'function') myshowLoader();

    // 1. Gather Filter Values
    let fromDate = $("#from_date").val();
    let toDate = $("#to_date").val();
    let statuses = $("#status_filter").val(); // Returns an array e.g., ['Pending', 'Reported']

    // 2. Build Query Parameters for Axios
    const params = new URLSearchParams();
    
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);
    
    if (statuses && statuses.length > 0) {
        statuses.forEach(s => params.append('status', s));
    }

    // 3. Make API Call
    axios.get(baseUrl + "/reports/assigned-reports?" + params.toString())
        .then(res => {
            let data = res.data;
            
            // Check for API error response
            if(data.status === "error") {
                showToastMessage("error", data.message);
                return;
            }

            // Initialize/Destroy DataTable
            let dtable = $("#assignedReportsTable").DataTable({
                destroy: true,
                responsive: true,
                order: [[0, 'desc']] // Sort by Booking ID descending
            });

            dtable.clear();
            let rowsToAdd = [];

            data.forEach(item => {
                
                // --- 1. Patient Info (Name + Age/Gender) ---
                let patientInfoHtml = `
                    <div class="d-flex flex-column">
                        <span class="fw-bold text-dark">${item.patient_name || '-'}</span>
                        <small class="text-muted" style="font-size:0.85em;">
                            ${item.age || '-'} / ${item.gender || '-'}
                        </small>
                    </div>
                `;

                // --- 2. Contact Column ---
                let contactHtml = `<span class="text-secondary">${item.contact_no || 'N/A'}</span>`;

                // --- 3. Status Badge ---
                let statusClass = "bg-warning text-dark";
                if(item.status === 'Reported') statusClass = "bg-success";
                else if(item.status === 'Declined') statusClass = "bg-danger";
                
                let statusHtml = `<span class="badge ${statusClass}">${item.status}</span>`;

                // --- 4. Booking ID & Test ---
                let bookingIdHtml = `<span class="fw-bold text-primary">#${item.booking_id}</span>`;
                let testHtml = `<span class="fw-semibold">${item.test_name}</span>`;
                
                // --- 5. Assign Info ---
                let assignToHtml = `<span class="fw-bold text-dark">${item.assign_to}</span>`;
                let assignByHtml = `
                    <div class="d-flex flex-column">
                        <span class="text-dark small fw-bold">${item.assign_by}</span>
                        <small class="text-muted" style="font-size: 0.75rem;">${item.assigned_at || ''}</small>
                    </div>
                `;

                // --- 6. Action Buttons ---
                let printBtn = "";
                
                // Only show View/Print button if Reported or Pending (Pending might view details)
                if (item.report_details_id) {
                    printBtn = `
                        <button class="btn btn-sm btn-info text-white me-1" 
                            onclick="viewReport('${item.report_details_id}', ${item.balance})" 
                            title="View Report">
                            <i class="bi bi-eye"></i>
                        </button>`;
                } else {
                    // Placeholder for pending
                    printBtn = `
                        <button class="btn btn-sm btn-secondary me-1" disabled title="Report not ready">
                            <i class="bi bi-eye-slash"></i>
                        </button>`;
                }

                // Delete Button (New)
                let deleteBtn = `
                    <button class="btn btn-sm btn-danger" 
                        onclick="deleteAssignment('${item.id}')" 
                        title="Delete Assignment Request">
                        <i class="bi bi-trash"></i>
                    </button>
                `;

                rowsToAdd.push([
                    bookingIdHtml,
                    patientInfoHtml, // New
                    contactHtml,     // New
                    testHtml,
                    statusHtml,
                    assignToHtml,
                    assignByHtml,    // Combined By + At
                    `<div class="d-flex">${printBtn} ${deleteBtn}</div>`
                ]);
            });

            if (rowsToAdd.length > 0) dtable.rows.add(rowsToAdd);
            dtable.draw(false);
        })
        .catch(err => {
            console.error("Error fetching reports:", err);
            let msg = err.response?.data?.message || "Failed to load data";
            if (typeof showToastMessage === 'function') showToastMessage("error", msg);
        })
        .finally(() => { 
            if (typeof myhideLoader === 'function') myhideLoader(); 
        });
}

// =======================================================
// 🔥 VIEW / PRINT REPORT
// =======================================================
function viewReport(reportDetailsId, dueAmount) {
    if (!reportDetailsId) return;

    // Safety Check
    if (dueAmount > 0) {
        if (typeof showToastMessage === 'function') {
            showToastMessage("error", "Cannot print report. Clear dues first.");
        } else {
            alert("Cannot print report. Clear dues first.");
        }
        return;
    }

    // Open route in new tab
    let url = baseUrl + "/reports/view-patient-report/" + reportDetailsId;
    window.open(url, '_blank');
}

// =======================================================
// 🔥 DELETE ASSIGNMENT (NEW)
// =======================================================
function deleteAssignment(id) {
    if (!confirm("Are you sure you want to delete this assignment? The doctor will no longer see this request.")) {
        return;
    }

    if (typeof myshowLoader === 'function') myshowLoader();

    axios.delete(baseUrl + `/reports/assigned-reports/delete/${id}`)
        .then(res => {
            if (typeof showToastMessage === 'function') {
                showToastMessage("success", "Request deleted successfully");
            } else {
                alert("Request deleted successfully");
            }
            getAssignedReports(); // Refresh table
        })
        .catch(err => {
            let msg = err.response?.data?.error || "Failed to delete assignment";
            if (typeof showToastMessage === 'function') {
                showToastMessage("error", msg);
            } else {
                alert(msg);
            }
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
}