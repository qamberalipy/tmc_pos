$(document).ready(function () {
    
    // Default One Month Filter using Global Lab Date (from main.js)
    if (!$("#from_date").val() || !$("#to_date").val()) {
        if (typeof getGlobalLabDate === 'function') {
            $("#from_date").val(getGlobalLabDate(-30));
            $("#to_date").val(getGlobalLabDate(0));
        } else {
            // Fallback if main.js is missing
            let today = new Date().toISOString().split('T')[0];
            $("#from_date").val(today);
            $("#to_date").val(today);
        }
    }

    getAssignedReports();

    $("#searchBtn").on("click", function() {
        getAssignedReports();
    });
});

// =======================================================
// 1. FETCH DATA AND RENDER TABLE
// =======================================================
function getAssignedReports() {
    if (typeof myshowLoader === 'function') myshowLoader();

    let fromDate = $("#from_date").val();
    let toDate = $("#to_date").val();
    let statuses = $("#status_filter").val(); 

    const params = new URLSearchParams();
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);
    if (statuses && statuses.length > 0) {
        statuses.forEach(status => params.append('status', status));
    }

    axios.get(baseUrl + `/reports/assigned-reports?${params.toString()}`)
        .then(res => {
            let data = res.data;
            let table = $("#assignedReportsTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                order: [[0, "desc"]],
                language: { emptyTable: "No assignments found for the selected criteria." }
            });

            table.clear().draw();

            $.each(data, function (i, item) {
                let bookingHtml = `<span class="badge bg-light text-dark border">B#${item.booking_id}</span>`;
                
                let patientHtml = `
                    <div class="d-flex flex-column">
                        <span class="fw-bold">${item.patient_name || 'N/A'}</span>
                        <small class="text-muted">${item.age || 'N/A'} Yrs | ${item.gender || 'N/A'}</small>
                    </div>`;
                
                let contactHtml = `<span class="small">${item.contact_no || '-'}</span>`;
                let testHtml = `<span class="badge badge-test">${item.test_name}</span>`;

                // Status Formatting
                let statusBadge = "bg-secondary";
                let statusIcon = "bi-clock";
                if (item.status === 'Reported') { statusBadge = "bg-success"; statusIcon = "bi-check-circle"; }
                else if (item.status === 'Declined') { statusBadge = "bg-danger"; statusIcon = "bi-x-circle"; }
                else if (item.status === 'Pending') { statusBadge = "bg-warning text-dark"; }
                let statusHtml = `<span class="badge ${statusBadge}"><i class="bi ${statusIcon}"></i> ${item.status}</span>`;

                // Consolidated Assignment Column
                let assignHtml = `
                    <div class="d-flex flex-column small" style="gap: 2px;">
                        <span><strong class="text-dark">Dr:</strong> ${item.assign_to || '-'}</span>
                        <span class="text-muted"><i class="bi bi-person-fill-gear"></i> By: ${item.assign_by || '-'}</span>
                        <span class="text-muted" style="font-size: 0.7rem;"><i class="bi bi-clock"></i> ${item.assigned_at || '-'}</span>
                    </div>`;

                // Actions based on status
                let actionBtn = "";
                if (item.status === "Reported") {
                    actionBtn = `
                        <button class="btn btn-sm btn-primary shadow-sm" onclick="printReport(${item.report_details_id}, ${item.balance})" title="View / Print Document">
                            <i class="bi bi-printer"></i> View
                        </button>`;
                } else {
                    actionBtn = `
                        <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="deleteAssignment(${item.id})" title="Revoke Assignment">
                            <i class="bi bi-trash"></i>
                        </button>`;
                }

                table.row.add([bookingHtml, patientHtml, contactHtml, testHtml, statusHtml, assignHtml, actionBtn]).draw(false);
            });
        })
        .catch(err => {
            console.error(err);
            Swal.fire('Error', err.response?.data?.message || 'Failed to fetch assigned reports.', 'error');
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
}

// =======================================================
// 2. PRINT / VIEW REPORT (CLOUD AWARE)
// =======================================================
function printReport(reportDetailsId, dueAmount) {
    if (parseFloat(dueAmount) > 0) {
        return Swal.fire("Action Blocked", "Cannot print report. Please clear patient dues first.", "warning");
    }

    if (typeof myshowLoader === 'function') myshowLoader();

    // Fetch the report metadata to check for a cloud document URL
    axios.get(`${baseUrl}/reports/get-report-data/${reportDetailsId}`)
        .then(res => {
            let data = res.data;
            
            if (data.report_file_url) {
                // If it's a modern cloud upload, open the file directly in a new tab
                window.open(data.report_file_url, '_blank');
            } else {
                // Fallback to legacy text-based HTML report
                let url = baseUrl + "/reports/view-patient-report/" + reportDetailsId;
                window.open(url, '_blank');
            }
        })
        .catch(err => {
            console.error(err);
            Swal.fire('Error', 'Failed to retrieve document information.', 'error');
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
}

// =======================================================
// 3. DELETE ASSIGNMENT
// =======================================================
function deleteAssignment(id) {
    Swal.fire({
        title: "Revoke Assignment?",
        text: "The doctor will no longer see this request in their pending list.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#6c757d",
        confirmButtonText: "Yes, delete it!"
    }).then((result) => {
        if (result.isConfirmed) {
            if (typeof myshowLoader === 'function') myshowLoader();

            axios.delete(`${baseUrl}/reports/assigned-reports/delete/${id}`)
                .then(res => {
                    Swal.fire("Deleted!", "The request has been revoked.", "success");
                    getAssignedReports(); 
                })
                .catch(err => {
                    let msg = err.response?.data?.error || "Failed to delete assignment.";
                    Swal.fire("Error", msg, "error");
                })
                .finally(() => {
                    if (typeof myhideLoader === 'function') myhideLoader();
                });
        }
    });
}