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
    // We use URLSearchParams to handle the array 'status' correctly for Flask (status=A&status=B)
    const params = new URLSearchParams();
    
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);
    
    // Loop through selected statuses and append them individually
    if (statuses && statuses.length > 0) {
        statuses.forEach(s => params.append('status', s));
    }

    // 3. Make API Call
    // Note: We use params.toString() to attach query string
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

                // --- F. Action Buttons ---
                let printBtn = "";
                
                // CHECK: If report_details_id exists, enable button. Else, disable it.
                if (item.report_details_id) {
                    printBtn = `
                        <button class="btn btn-sm btn-dark" 
                                onclick="viewReport(${item.report_details_id})" 
                                title="Print Report">
                            <i class="bi bi-printer-fill"></i> Print
                        </button>`;
                } else {
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
function viewReport(reportDetailsId) {
    if (!reportDetailsId) return;

    // Open route in new tab
    let url = baseUrl + "/reports/view-patient-report/" + reportDetailsId;
    window.open(url, '_blank');
}