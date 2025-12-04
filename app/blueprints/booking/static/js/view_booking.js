$(document).ready(function () {

    // --- INITIALIZATION ---
    const today = new Date();
    const toDate = today.toISOString().split("T")[0];
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const fromDate = past.toISOString().split("T")[0];

    $("#from_date").val(fromDate);
    $("#to_date").val(toDate);

    // Global variable to store selected IDs
    window.selectedBookingIds = new Set();

    // Load Initial Data
    getAllTestBookings();

    // --- EVENT LISTENERS ---

    // 1. Search Button
    $("#searchBtn").on("click", function () {
        let from_date = $("#from_date").val();
        let to_date = $("#to_date").val();

        if ((from_date && !to_date) || (!from_date && to_date)) {
            showToastMessage("error", "Please select both From and To dates.");
            return;
        }
        getAllTestBookings();
    });

    // 2. Comments Logic
    $("#saveCommentBtn").on("click", function () {
        let bookingId = $(this).data("booking-id");
        let commentText = $("#newComment").val().trim();

        if (!commentText) return showToastMessage("error", "Please enter a comment.");

        myshowLoader();
        axios.post(baseUrl + "/booking/comments/" + bookingId, { comment: commentText })
            .then(res => {
                let existingComments = $("#commentsHistory").data("comments") || [];
                existingComments.unshift(res.data.data);
                $("#commentsHistory").data("comments", existingComments);
                loadComments(existingComments);
                $("#newComment").val("");
            })
            .catch(err => handleAxiosError(err))
            .finally(() => myhideLoader());
    });

    // 3. Films Logic
    $("#SaveEditfilms").on("click", function () {
        const payload = {
            booking_id: parseInt($("#bookingIdInput").val()),
            new_films_used: Number($("#changedFilmsInput").val()),
            usage_type: $("#causeSelect").val(),
            reason: $("#reasonInput").val().trim()
        };

        if (!payload.new_films_used || payload.new_films_used <= 0) return showToastMessage("error", "Invalid films count.");
        if (!payload.reason) return showToastMessage("error", "Reason is required.");

        myshowLoader();
        axios.post(baseUrl + "/booking/films/", payload)
            .then(res => {
                showToastMessage("success", "Film usage updated!");
                $("#filmsModal").modal("hide");
                getAllTestBookings(); // Refresh table to show new values
            })
            .catch(err => handleAxiosError(err))
            .finally(() => myhideLoader());
    });

    // =======================================================
    // 🔥 BULK ASSIGN LOGIC
    // =======================================================

    // A. Handle "Select All" Checkbox
    $("#selectAllBookings").on("change", function() {
        const isChecked = $(this).is(":checked");
        
        $(".chk-booking").prop("checked", isChecked);
        
        if (isChecked) {
            $(".chk-booking").each(function() {
                window.selectedBookingIds.add($(this).val());
            });
        } else {
            window.selectedBookingIds.clear();
        }
        updateBulkButtonState();
    });

    // B. Handle Individual Row Checkbox (Delegated Event)
    $("#testReg_table").on("change", ".chk-booking", function() {
        const id = $(this).val();
        if ($(this).is(":checked")) {
            window.selectedBookingIds.add(id);
        } else {
            window.selectedBookingIds.delete(id);
            $("#selectAllBookings").prop("checked", false); // Uncheck master if one is unchecked
        }
        updateBulkButtonState();
    });

    // C. Open Assign Modal (Fetch Doctors)
    $("#btnBulkAssign").on("click", function() {
        if (window.selectedBookingIds.size === 0) return;

        // Reset Modal State
        $("#modalSelectedCount").text(window.selectedBookingIds.size);
        $("#doctorSelectDropdown").html('<option value="" selected disabled>Loading Doctors...</option>');
        $("#assignDoctorModal").modal("show");

        // Fetch Doctors API
        // NOTE: Ensure the branch ID (1) is correct or dynamic based on your logic
        axios.get(baseUrl + "/users/get_all_doctors/1")
            .then(res => {
                let doctors = res.data;
                let options = `<option value="" selected disabled>-- Select Doctor --</option>`;
                
                doctors.forEach(dr => {
                    options += `<option value="${dr.id}">${dr.name}</option>`;
                });
                
                $("#doctorSelectDropdown").html(options);
            })
            .catch(err => {
                $("#doctorSelectDropdown").html('<option disabled>Error loading doctors</option>');
                handleAxiosError(err);
            });
    });

    // D. Confirm Assignment (Submit to Backend)
    $("#btnConfirmAssignment").on("click", function() {
        const doctorId = $("#doctorSelectDropdown").val();
        const bookingIds = Array.from(window.selectedBookingIds); // Convert Set to Array

        if (!doctorId) {
            showToastMessage("error", "Please select a doctor.");
            return;
        }

        const payload = {
            bookingids: bookingIds,
            doctor_id: doctorId
        };

        myshowLoader();
        // NOTE: Adjust the endpoint prefix if your reports_bp has a prefix (e.g. /reports)
        axios.post(baseUrl + "/reports/assign-bookings", payload) 
            .then(res => {
                showToastMessage("success", res.data.message || "Bookings assigned successfully!");
                $("#assignDoctorModal").modal("hide");
                
                // Clear selections and refresh
                window.selectedBookingIds.clear();
                updateBulkButtonState();
                $("#selectAllBookings").prop("checked", false);
                getAllTestBookings();
            })
            .catch(err => handleAxiosError(err))
            .finally(() => myhideLoader());
    });

});

// =======================================================================
// 🔥 MAIN TABLE FUNCTION
// =======================================================================
function getAllTestBookings() {
    myshowLoader();
    const from_date = $("#from_date").val();
    const to_date = $("#to_date").val();
    let url = baseUrl + "/booking/test-booking";

    if (from_date && to_date) {
        url += `?from_date=${from_date}&to_date=${to_date}`;
    }

    axios.get(url)
        .then(res => {
            let data = res.data;
            let dtable = $("#testReg_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 14,
                lengthChange: false,
                ordering: false
            });

            dtable.clear(); // Clear internal data
            window.selectedBookingIds.clear(); // Reset selection on new fetch
            updateBulkButtonState();

            let rowsToAdd = [];

            $.each(data, function (i, t) {
                // Actions
                let printBtn = `<a href="${baseUrl}/booking/receipt/${t.booking_id}" target="_blank" class="border btn print-booking"><i class="bi-printer-fill text-success"></i></a>`;
                let commentBtn = `<button class="border btn comment-booking" data-id="${t.booking_id}"><i class="bi-chat-left-dots-fill text-primary"></i></button>`;
                let filmsBtn = `<button class="border btn edit-films" data-id="${t.booking_id}" data-films="${t.total_films || 0}"><i class="bi-pencil-square text-dark"></i></button>`;

                // Checkbox Column
                let checkbox = `<div class=""><input type="checkbox" class="chk-booking" value="${t.booking_id}" style="cursor: pointer;"></div>`;

                rowsToAdd.push([
                    checkbox,
                    `B#${t.booking_id}`,
                    t.patient_name || "-",
                    t.date || "-",
                    t.referred_dr || "-",
                    t.mr_no || "-",
                    t.test_name || "-",
                    t.total_amount || "0",
                    t.discount || "0",
                    t.net_amount || "0",
                    t.received || "0",
                    t.balance || "0",
                    `${printBtn} ${commentBtn} ${filmsBtn}`
                ]);
            });

            // Batch Add for Performance
            if(rowsToAdd.length > 0) {
                dtable.rows.add(rowsToAdd);
            }
            dtable.draw(false);
            
            rebindTableEvents();
            myhideLoader();
        })
        .catch(err => {
            console.error("Error:", err);
            myhideLoader();
        });
}

// Helper to rebind specific click events inside table
function rebindTableEvents() {
    $("#testReg_table").off("click", ".comment-booking").on("click", ".comment-booking", function () {
        let bookingId = $(this).data("id");
        $("#saveCommentBtn").data("booking-id", bookingId);
        fetchComments(bookingId);
        $("#commentsModal").modal("show");
    });

    $("#testReg_table").off("click", ".edit-films").on("click", ".edit-films", function () {
        let bookingId = $(this).data("id");
        let currentFilms = $(this).data("films");
        $("#currentFilmsInput").val(currentFilms);
        $("#changedFilmsInput").val("");
        $("#reasonInput").val("");
        $("#bookingIdInput").val(bookingId);
        $("#filmsModal").modal("show");
    });
}

function updateBulkButtonState() {
    const count = window.selectedBookingIds.size;
    $("#selectedCountBadge").text(count);
    
    if (count > 0) {
        $("#btnBulkAssign").fadeIn();
    } else {
        $("#btnBulkAssign").fadeOut();
    }
}

// Standard Error Helper
function handleAxiosError(err) {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message;
    showToastMessage("error", "Error: " + msg);
}

// Comment Logic (Kept same as yours)
function fetchComments(bookingId) {
    myshowLoader();
    axios.get(baseUrl + "/booking/comments/" + bookingId)
        .then(res => {
            let comments = res.data.comments || [];
            $("#commentsHistory").data("comments", comments);
            loadComments(comments);
        })
        .finally(() => myhideLoader());
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
                </div>
            `;
        });
    }
    $("#commentsHistory").html(html);
}