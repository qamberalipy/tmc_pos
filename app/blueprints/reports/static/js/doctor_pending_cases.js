$(document).ready(function () {
    // Load data on page load
    getDoctorBookings();

    // Bind Save Button Click
    $("#btnSaveReport").on("click", saveReport);
});

// =======================================================
// 🔥 1. FETCH DATA AND RENDER TABLE
// =======================================================
function getDoctorBookings() {
    if (typeof myshowLoader === 'function') myshowLoader();

    axios.get(baseUrl + "/reports/bookings/pendingcase")
        .then(res => {
            let data = res.data;
            let dtable = $("#doctorPendingTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                ordering: false,
                language: { emptyTable: "No pending cases found." }
            });

            dtable.clear().draw();
            let rowsToAdd = [];

            $.each(data, function (i, item) {
                // Formatting Helpers
                let reportIDHtml = `<span>R#${item.reporting_id}</span>`;
                let bookingIdHtml = `<span>${item.booking_id}</span>`;
                
                let testsHtml = `<span data-testid=${item.test_id} class="badge badge-test">${item.test_name}</span>`;
                let statusHtml = `<span class="badge bg-warning text-dark">${item.status}</span>`;

                // Comment Button Logic
                let commentBtn;
                const btnStyle = 'style="min-width: 125px;"';
                if (item.technician_comments) {
                    let safeCommentData = encodeURIComponent(item.technician_comments);
                    commentBtn = `<button class="btn btn-sm btn-info text-white view-comments" ${btnStyle} data-comments="${safeCommentData}"><i class="bi bi-chat-left-text-fill"></i> View History</button>`;
                } else {
                    commentBtn = `<button class="btn btn-sm btn-light text-muted border" disabled ${btnStyle}><i class="bi bi-dash-circle"></i> No History</button>`;
                }

                // Assigned Info
                let assignedBy = item.assigned_by || "-";
                let assignedAt = item.assigned_at || "-";

                // 🔥 ACTION BUTTON: Triggers fetchAndOpenReport instead of href
                // Escape single quotes in names just in case (e.g., "Parkinson's Test")
                let safeTestName = (item.test_name || "").replace(/'/g, "\\'");

                let actionBtn = `
                    <div class="d-flex justify-content-center gap-2">
                        <button class="btn btn-sm btn-primary" 
                                onclick="fetchAndOpenReport(${item.booking_id}, ${item.test_id}, '${safeTestName}')" 
                                title="Create Report">
                            <i class="bi-pencil-square"></i>
                        </button>

                        <button class="btn btn-sm btn-danger" 
                                onclick="declineAssignment(${item.reporting_id})" 
                                title="Decline Assignment">
                            <i class="bi-x-circle"></i>
                        </button>
                    </div>
                `;

                rowsToAdd.push([reportIDHtml, bookingIdHtml, testsHtml, statusHtml, commentBtn, assignedBy, assignedAt, actionBtn]);
            });

            if (rowsToAdd.length > 0) dtable.rows.add(rowsToAdd);
            dtable.draw(false);
            bindTableEvents();
        })
        .catch(err => console.error("Error fetching bookings:", err))
        .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}

// =======================================================
// 🔥 2. OPEN REPORT MODAL (GET API)
// =======================================================
function declineAssignment(reportingId) {
    Swal.fire({
        title: "Are you sure?",
        text: "You are about to decline this test assignment!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",   // Red for 'Decline'
        cancelButtonColor: "#212529", // Dark for 'Cancel'
        confirmButtonText: "Yes, decline it!"
    }).then((result) => {
        if (result.isConfirmed) {
            // User clicked "Yes"
            myshowLoader();

            axios.post(baseUrl + "/reports/decline-assignment", { reporting_id: reportingId })
                .then(res => {
                    // Success Message
                    Swal.fire({
                        title: "Declined!",
                        text: "The assignment has been declined.",
                        icon: "success",
                        timer: 1500,
                        showConfirmButton: false
                    });

                    // Reload the table
                    if (typeof loadPendingBookings === "function") {
                        loadPendingBookings();
                    } else {
                        location.reload();
                    }
                })
                .catch(err => {
                    console.error(err);
                    let msg = err.response?.data?.error || "Failed to decline assignment.";
                    
                    Swal.fire({
                        title: "Error!",
                        text: msg,
                        icon: "error"
                    });
                })
                .finally(() => {
                    myhideLoader();
                });
        }
    });
}

function fetchAndOpenReport(bookingId, testId, testName) {
    if (typeof myshowLoader === 'function') myshowLoader();

    $("#reportForm")[0].reset();
    $("#rep_testName").val(testName); 
    $("#rep_testId").val(testId); 
    $("#rep_bookingId").val(bookingId);

    axios.get(baseUrl + "/booking/test-booking/" + bookingId)
        .then(res => {
            let data = res.data;

            // Populate Read-Only Patient Fields
            $("#rep_patientName").val(data.patient_name);
            $("#rep_age").val(data.age);
            $("#rep_gender").val(data.gender);
            $("#rep_refDr").val(data.referred_by || "Self");

            // We do NOT need to populate #rep_testSelect anymore
            // because we already set #rep_testName above.

            // 4. Show Modal
            $("#reportModal").modal("show");
        })
        .catch(err => {
            let msg = err.response?.data?.error || "Failed to load booking details.";
            showToastMessage ? showToastMessage("error", msg) : alert(msg);
        })
        .finally(() => { 
            if (typeof myhideLoader === 'function') myhideLoader(); 
        });
}
// =======================================================
// 🔥 3. SAVE REPORT (POST API)
// =======================================================
function saveReport() {
    // 1. Gather Data
    let bookingId = $("#rep_bookingId").val();
    let patientName = $("#rep_patientName").val();
    let gender = $("#rep_gender").val();
    let age = $("#rep_age").val();
    let referredBy = $("#rep_refDr").val();
    
    // --- UPDATED THIS LINE ---
    // Use the hidden input ID we created in the previous step
    let testId = $("#rep_testId").val(); 
    
    let clinicalInfo = $("#rep_clinical").val();
    let protocols = $("#rep_protocols").val();
    let findings = $("#rep_findings").val().trimStart();
    let conclusion = $("#rep_conclusion").val();
    
    // Get logged-in doctor ID from hidden field
    let doctorId = $("#currentDoctorId").val();

    // 2. Validation
    if (!testId) return showToastMessage("error", "Test ID is missing. Please close and reopen the form.");
    if (!findings.trim()) return showToastMessage("error", "Findings cannot be empty.");
    if (!doctorId || doctorId === "None") return showToastMessage("error", "Doctor session invalid. Please login again.");

    // 3. Construct Payload
    let payload = {
        booking_id: bookingId,
        doctor_id: doctorId,
        patient_name: patientName,
        gender: gender,
        age: age,
        test_id: testId,
        referred_doctor: referredBy, 
        clinical_info: clinicalInfo,
        scanning_protocols: protocols,
        findings: findings,
        conclusion: conclusion
    };

    if (typeof myshowLoader === 'function') myshowLoader();

    // 4. Send POST Request
    axios.post(baseUrl + "/reports/save-report", payload)
        .then(res => {
            // Success
            showToastMessage("success", "Report saved successfully!");
            $("#reportModal").modal("hide");
            
            // Refresh the table
            // Ensure this matches the function name you use to load the table (e.g. loadPendingBookings or getDoctorBookings)
            if (typeof loadPendingBookings === 'function') {
                loadPendingBookings();
            } else if (typeof getDoctorBookings === 'function') {
                getDoctorBookings();
            }
        })
        .catch(err => {
            let msg = err.response?.data?.error || "Failed to save report.";
            showToastMessage("error", msg);
            console.error(err);
        })
        .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}

// =======================================================
// 🟢 EVENT HANDLERS (COMMENTS & TOASTS)
// =======================================================
function bindTableEvents() {
    $("#doctorPendingTable").off("click", ".view-comments");
    $("#doctorPendingTable").on("click", ".view-comments", function () {
        let rawData = $(this).data("comments");
        try {
            let jsonString = decodeURIComponent(rawData);
            let parsedObj = JSON.parse(jsonString);
            let commentsArray = parsedObj.comments || [];
            loadComments(commentsArray);
            $("#commentsModal").modal("show");
        } catch (e) {
            console.error("Error parsing comments:", e);
        }
    });
}

function loadComments(comments) {
    let html = "";
    if (!comments || comments.length === 0) {
        html = `<div class="text-muted text-center py-2">No comments yet.</div>`;
    } else {
        comments.forEach(c => {
            html += `
                <div class="timeline-item d-flex">
                    <div class="timeline-icon">
                        <span class="rounded-circle bg-success d-inline-flex align-items-center justify-content-center" style="width:28px; height:28px;">
                            <i class="bi bi-person-fill-check text-white" style="font-size: 14px;"></i>
                        </span>
                    </div>
                    <div class="timeline-content ms-3 flex-grow-1">
                        <div class="card pb-2 px-3 border-0 shadow-sm bg-light">
                            <div class="d-flex justify-content-between mt-2">
                                <strong>${c.user_name} <span class="badge bg-secondary" style="font-size:10px">${c.role}</span></strong>
                                <small class="text-muted">${c.datetime}</small>
                            </div>
                            <div class="mt-1">${c.comment}</div>
                        </div>
                    </div>
                </div>`;
        });
    }
    $("#commentsHistory").html(html);
}

// Simple Toast fallback if not defined elsewhere
if (typeof showToastMessage !== 'function') {
    window.showToastMessage = function(type, msg) {
        alert(type.toUpperCase() + ": " + msg);
    }
}