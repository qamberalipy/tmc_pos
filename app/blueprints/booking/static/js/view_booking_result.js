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
            
            // Initialize/Destroy DataTable
            let dtable = $("#assignedReportsTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                ordering: false, // Turn off auto-sorting to respect backend sort
                language: { emptyTable: "No assigned reports found." }
            });

            dtable.clear().draw();
            let rowsToAdd = [];

            $.each(data, function (i, item) {
                // --- A. Booking ID ---
                let bookingIdHtml = `<span class="fw-bold text-primary">${item.booking_id}</span>`;

                // --- B. Test Name ---
                let testHtml = `<span class="fw-bold">${item.test_name}</span>`;

                // --- C. Status Badge ---
                let badgeClass = "bg-secondary";
                if(item.status === "Reported") badgeClass = "bg-success";
                if(item.status === "Pending") badgeClass = "bg-warning text-dark";
                if(item.status === "Declined") badgeClass = "bg-danger";
                
                let statusHtml = `<span class="badge ${badgeClass}">${item.status}</span>`;

                // --- D. Assignments ---
                let assignToHtml = `<small>${item.assign_to}</small>`;
                let assignByHtml = `<small class="text-muted">${item.assign_by}</small>`;

                // --- E. Date ---
                let assignedAt = item.assigned_at || "-";

                // --- F. Action Buttons (LOGIC UPDATED) ---
                let printBtn = "";
                let balance = parseFloat(item.balance || 0);

                // Priority 1: Check Dues
                if (balance > 0) {
                    printBtn = `
                        <button class="btn btn-sm btn-outline-danger disabled" 
                                style="cursor: not-allowed; opacity: 0.7;" 
                                title="Cannot Print: Dues Pending (${balance})">
                            <i class="bi bi-exclamation-circle"></i> Due
                        </button>`;
                }
                // Priority 2: Check if Report Exists
                else if (item.report_details_id) {
                    printBtn = `
                        <button class="btn btn-sm btn-dark" 
                                onclick="viewReport(${item.report_details_id}, ${balance})" 
                                title="Print Report">
                            <i class="bi bi-printer-fill"></i> Print
                        </button>`;
                } 
                // Priority 3: Pending/Declined
                else {
                    printBtn = `
                        <button class="btn btn-sm btn-light text-muted border" 
                                disabled 
                                title="Not Reported Yet">
                            <i class="bi bi-printer"></i> Print
                        </button>`;
                }

                rowsToAdd.push([
                    bookingIdHtml,
                    testHtml,
                    statusHtml,
                    assignToHtml,
                    assignByHtml,
                    assignedAt,
                    printBtn
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