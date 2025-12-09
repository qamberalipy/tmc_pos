$(document).ready(function () {
    // Load data on page load
    getReportedBookings();

    // Bind Update Button
    $("#btnUpdateReport").on("click", updateReport);
});

// =======================================================
// 🔥 1. FETCH DATA AND RENDER TABLE
// =======================================================
function getReportedBookings() {
    if (typeof myshowLoader === 'function') myshowLoader();

    axios.get(baseUrl + "/reports/bookings/reportedcase")
        .then(res => {
            let data = res.data;
            let dtable = $("#doctorReportedTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                ordering: false,
                language: { emptyTable: "No reported cases found." }
            });

            dtable.clear().draw();
            let rowsToAdd = [];

            $.each(data, function (i, item) {
                // 1. Booking ID
                let bookingIdHtml = `<span class="fw-bold text-primary">B#${item.booking_id}</span>`;

                // 2. Patient Info
                let patientHtml = `
                    <div class="d-flex flex-column">
                        <span class="fw-bold">${item.patient_name}</span>
                        <small class="text-muted">${item.age} Y / ${item.gender}</small>
                    </div>`;

                // 3. Test Name
                let testName = item.tests ? (item.tests.test_name || "-") : "-";
                let testHtml = `<span class="badge badge-test">${testName}</span>`;

                // 4. Status
                let statusHtml = `<span class="badge bg-success"><i class="bi bi-check-circle"></i> ${item.status}</span>`;

                // 5. Reported At
                let reportedAt = item.reported_at || "-";

                // 6. Action Buttons
                // View: Opens new tab | Edit: Opens Modal
                let viewBtn = `
                    <button class="btn btn-sm btn-info text-white me-1" 
                            onclick="viewReport(${item.report_details_id})" 
                            title="View Report">
                        <i class="bi bi-eye-fill"></i>
                    </button>`;
                
                let editBtn = `
                    <button class="btn btn-sm btn-warning text-dark" 
                            onclick="editReport(${item.report_details_id})" 
                            title="Edit Report">
                        <i class="bi bi-pencil-fill"></i>
                    </button>`;

                let actionHtml = `<div class="text-nowrap">${viewBtn} ${editBtn}</div>`;

                rowsToAdd.push([
                    bookingIdHtml,
                    patientHtml,
                    testHtml,
                    statusHtml,
                    reportedAt,
                    actionHtml
                ]);
            });

            if (rowsToAdd.length > 0) dtable.rows.add(rowsToAdd);
            dtable.draw(false);
        })
        .catch(err => {
            console.error("Error fetching reported cases:", err);
            if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to load data");
        })
        .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}

// =======================================================
// 🔥 2. VIEW REPORT (NEW TAB)
// =======================================================
function viewReport(reportId) {
    // Simply open the Flask route in a new tab
    let url = baseUrl + "/reports/view-patient-report/" + reportId;
    window.open(url, '_blank');
}

// =======================================================
// 🔥 3. EDIT REPORT LOGIC (PRE-FILL)
// =======================================================
function editReport(reportId) {
    if (typeof myshowLoader === 'function') myshowLoader();

    // API: /reports/get-report-data/<id>
    axios.get(baseUrl + "/reports/get-report-data/" + reportId)
        .then(res => {
            let data = res.data;

            // Fill Form Fields
            $("#edit_report_id").val(data.id);
            $("#edit_patientName").val(data.patient_name);
            $("#edit_testName").val(data.test_name || "-");
            $("#edit_referredDr").val(data.referred_doctor || "Self");
            
            $("#edit_clinical").val(data.clinical_info);
            $("#edit_protocols").val(data.scanning_protocols);
            $("#edit_findings").val(data.findings);
            $("#edit_conclusion").val(data.conclusion);

            $("#editReportModal").modal("show");
        })
        .catch(err => {
            console.error(err);
            showToastMessage("error", "Failed to load report data");
        })
        .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}

// =======================================================
// 🔥 4. UPDATE REPORT (PUT)
// =======================================================
function updateReport() {
    let reportId = $("#edit_report_id").val();
    
    // Construct Payload based on your python update_fields
    let payload = {
        clinical_info: $("#edit_clinical").val(),
        scanning_protocols: $("#edit_protocols").val(),
        findings: $("#edit_findings").val().trimStart(),
        conclusion: $("#edit_conclusion").val()
        // Note: Patient name/gender/test_id are usually not edited here 
        // unless you explicitly want to allow it.
    };

    if (!payload.findings.trim()) return showToastMessage("error", "Findings cannot be empty");

    if (typeof myshowLoader === 'function') myshowLoader();

    // API: /reports/update-report/<id>
    axios.put(baseUrl + "/reports/update-report/" + reportId, payload)
        .then(res => {
            showToastMessage("success", "Report updated successfully!");
            $("#editReportModal").modal("hide");
            getReportedBookings(); // Refresh Table
        })
        .catch(err => {
            let msg = err.response?.data?.error || "Update failed";
            showToastMessage("error", msg);
        })
        .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}