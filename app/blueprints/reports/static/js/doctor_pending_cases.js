$(document).ready(function () {
    // Load data on page load
    getDoctorBookings();
});

// =======================================================
// 🔥 FETCH DATA AND RENDER TABLE
// =======================================================
function getDoctorBookings() {
    // Assuming you have a global loader function like myshowLoader()
    if (typeof myshowLoader === 'function') myshowLoader();

    // Adjust URL if needed (added trailing slash based on your prompt)
    axios.get(baseUrl + "/reports/bookings/pendingcase")
        .then(res => {
            let data = res.data;

            // Initialize or Re-initialize DataTable
            let dtable = $("#doctorPendingTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                ordering: false, // Disable auto-ordering for custom logic if needed
                language: {
                    emptyTable: "No pending cases found."
                }
            });

            dtable.clear().draw();

            let rowsToAdd = [];

            $.each(data, function (i, item) {

                // 1. Format Booking ID
                let bookingIdHtml = `<span>B#${item.booking_id}</span>`;

                // 2. Format Test List (as Badges)
                let testsHtml = "";
                if (item.tests && item.tests.length > 0) {
                    item.tests.forEach(test => {
                        testsHtml += `<span class="badge badge-test">${test}</span> `;
                    });
                } else {
                    testsHtml = '<span class="text-muted">-</span>';
                }

                // 3. Format Status
                let statusHtml = `<span class="badge bg-warning text-dark">${item.status}</span>`;

                // 4. Format Technician Comment Button
                // We encode the JSON string to safely pass it into the data attribute
                // 4. Format Technician Comment Button
                let commentBtn;

                // Common style for consistency (width: 120px ensures they align perfectly)
                const btnStyle = 'style="min-width: 125px;"';

                if (item.technician_comments) {
                    // CASE A: Comments Exist -> Active Blue Button
                    let safeCommentData = encodeURIComponent(item.technician_comments);
                    commentBtn = `
        <button class="btn btn-sm btn-info text-white view-comments" ${btnStyle}
                data-comments="${safeCommentData}">
            <i class="bi bi-chat-left-text-fill"></i> View History
        </button>`;
                } else {
                    // CASE B: No Comments -> Disabled Grey Button (Same Size)
                    commentBtn = `
        <button class="btn btn-sm btn-light text-muted border" disabled ${btnStyle}>
            <i class="bi bi-dash-circle"></i> No History
        </button>`;
                }

                // 5. Assigned By/At
                let assignedBy = item.assigned_by || "-";
                let assignedAt = item.assigned_at || "-";

                // 6. Action Button (Pen Icon)
                let actionBtn = `
                    <div class="text-center">
                        <a href="${baseUrl}/reports/create/${item.booking_id}" class="border btn" title="Create Report">
                            <i class="bi-pencil-square text-dark"></i>
                        </a>
                    </div>
                `;

                // Add row data
                rowsToAdd.push([
                    bookingIdHtml,
                    testsHtml,
                    statusHtml,
                    commentBtn,
                    assignedBy,
                    assignedAt,
                    actionBtn
                ]);
            });

            // Add all rows and redraw
            if (rowsToAdd.length > 0) {
                dtable.rows.add(rowsToAdd);
            }
            dtable.draw(false);

            // Rebind Events
            bindTableEvents();
        })
        .catch(err => {
            console.error("Error fetching bookings:", err);
            // Handle error toast here
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
}

// =======================================================
// 🟢 EVENT HANDLERS
// =======================================================
function bindTableEvents() {
    // Unbind first to avoid duplicate events if table redraws
    $("#doctorPendingTable").off("click", ".view-comments");

    // Click Handler for "View History"
    $("#doctorPendingTable").on("click", ".view-comments", function () {
        let rawData = $(this).data("comments");

        try {
            // 1. Decode the URI Component
            let jsonString = decodeURIComponent(rawData);

            // 2. Parse the main JSON string
            let parsedObj = JSON.parse(jsonString);

            // 3. Extract the array (API returns { "comments": [...] })
            let commentsArray = parsedObj.comments || [];

            // 4. Load into Modal
            loadComments(commentsArray);

            // 5. Show Modal
            $("#commentsModal").modal("show");

        } catch (e) {
            console.error("Error parsing comments:", e);
            $("#commentsHistory").html('<p class="text-danger text-center">Error loading comment history.</p>');
            $("#commentsModal").modal("show");
        }
    });
}

// =======================================================
// 🎨 UI HELPERS
// =======================================================
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
                </div>
            `;
        });
    }
    $("#commentsHistory").html(html);
}