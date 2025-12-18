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

// 3. Save Films Logic
$("#SaveEditfilms").off("click").on("click", function () {
    // Collect values from the UI
    const bookingId = parseInt($("#bookingIdInput").val());
    const testId = $("#testIdSelect").val(); // Get selected test ID
    
    // Individual Test Films: Current + what was added/changed in the input
    const currentTestFilms = Number($("#currentFilmsInput").val()) || 0;
    const addedFilms = Number($("#changedFilmsInput").val()) || 0;
    const filmsUnderTest = currentTestFilms + addedFilms; 

    // Booking Grand Total: Calculated automatically in our 'input' event listener
    const totalNewFilmsUsed = Number($("#totalFilmsUsedInput").val());

    const payload = {
        booking_id: bookingId,
        test_id: parseInt(testId),
        films_under_test: filmsUnderTest, // Updates TestBookingDetails
        total_new_films_used: totalNewFilmsUsed, // Updates TestFilmUsage & TestBooking
        usage_type: $("#causeSelect").val(),
        reason: $("#reasonInput").val().trim()
    };

    // --- Validations ---
    if (!payload.test_id) {
        return showToastMessage("error", "Please select a test.");
    }
    if (addedFilms <= 0) {
        return showToastMessage("error", "Please enter a valid number of films to add.");
    }
    if (!payload.reason) {
        return showToastMessage("error", "Reason is required.");
    }

    myshowLoader();
    axios.post(baseUrl + "/booking/films/", payload)
        .then(res => {
            showToastMessage("success", "Film usage updated!");
            $("#filmsModal").modal("hide");
            
            // Refresh table to show new values
            if (typeof getAllTestBookings === "function") {
                getAllTestBookings();
            }
        })
        .catch(err => {
            if (typeof handleAxiosError === "function") {
                handleAxiosError(err);
            } else {
                console.error(err);
                showToastMessage("error", "Something went wrong.");
            }
        })
        .finally(() => myhideLoader());
});

    // =======================================================
    // 🔥 BULK ASSIGN LOGIC
    // =======================================================

    // A. Handle "Select All" Checkbox
    $("#selectAllBookings").on("change", function () {
        const isChecked = $(this).is(":checked");

        $(".chk-booking").prop("checked", isChecked);

        if (isChecked) {
            $(".chk-booking").each(function () {
                window.selectedBookingIds.add($(this).val());
            });
        } else {
            window.selectedBookingIds.clear();
        }
        updateBulkButtonState();
    });

    // B. Handle Individual Row Checkbox (Delegated Event)
    $("#testReg_table").on("change", ".chk-booking", function () {
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
    $("#btnBulkAssign").on("click", function () {
        if (window.selectedBookingIds.size === 0) return;

        // Reset Modal State
        $("#modalSelectedCount").text(window.selectedBookingIds.size);
        $("#doctorSelectDropdown").html('<option value="" selected disabled>Loading Doctors...</option>');
        $("#assignDoctorModal").modal("show");

        // Fetch Doctors API
        // NOTE: Ensure the branch ID (1) is correct or dynamic based on your logic
        axios.get(baseUrl + "/users/get_all_doctors")
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
    $("#btnConfirmAssignment").on("click", function () {
        const doctorId = $("#doctorSelectDropdown").val();

        // 1. Validation
        if (!doctorId) {
            showToastMessage("error", "Please select a doctor.");
            return;
        }

        if (window.selectedBookingIds.size === 0) {
            showToastMessage("error", "No bookings selected.");
            return;
        }

        // 2. Build the detailed payload
        let bookingDetails = [];

        // Iterate through the Set of selected IDs
        window.selectedBookingIds.forEach(function (bId) {
            // Find the checkbox in the DOM with this value
            let $checkbox = $(`.chk-booking[value="${bId}"]`);

            // If found (Note: If using pagination, this only finds rows on the current page)
            if ($checkbox.length > 0) {
                // Traverse up to the row (tr), then find the hidden span (.test-info-cell)
                let $row = $checkbox.closest('tr');
                let $infoSpan = $row.find('.test-info-cell');

                // Retrieve the data-ids attribute (e.g., "2,5,6")
                let idsString = $infoSpan.data('ids');

                // Convert string "2,5,6" -> Array [2, 5, 6]
                let idsArray = [];
                if (idsString !== undefined && idsString !== null && idsString !== "") {
                    idsArray = idsString.toString().split(',').map(Number);
                }

                // Add to our list
                bookingDetails.push({
                    booking_id: bId,
                    test_ids: idsArray
                });
            }
        });

        const payload = {
            doctor_id: doctorId,
            bookings: bookingDetails // This now contains the list of objects
        };

        // 3. Send to Backend
        myshowLoader();
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
            .catch(err => {
                console.error(err);
                // Handle Axios error (assuming you have a helper or manual check)
                let msg = err.response && err.response.data ? err.response.data.error : "An error occurred";
                showToastMessage("error", msg);
            })
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
            console.log("Fetched Bookings:", data);

            let dtable = $("#testReg_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 14,
                lengthChange: false,
                ordering: false
            });

            dtable.clear(); 
            window.selectedBookingIds.clear(); 
            updateBulkButtonState();

            let rowsToAdd = [];

            $.each(data, function (i, t) {
                
                let hiddenTestIds = (t.test_ids || []).join(',');

        
                let printBtn = `<a href="${baseUrl}/booking/receipt/${t.booking_id}" target="_blank" class="border btn print-booking"><i class="bi-printer-fill text-success"></i></a>`;
                let commentBtn = `<button class="border btn comment-booking" data-id="${t.booking_id}"><i class="bi-chat-left-dots-fill text-primary"></i></button>`;
                
                // 2. I added data-test-ids to this button too, in case you need them here
                let filmsBtn = `<button class="border btn edit-films" data-id="${t.booking_id}" data-test-ids="${hiddenTestIds}" data-films="${t.total_films || 0}"><i class="bi-pencil-square text-dark"></i></button>`;

                // Checkbox Column
                let checkbox = `<div class=""><input type="checkbox" class="chk-booking" value="${t.booking_id}" style="cursor: pointer;"></div>`;

                // 3. Prepare the Test Name Cell with Hidden Data
                let testNameHtml = `<span class="test-info-cell"  data-booking-id="${t.booking_id}" data-ids="${hiddenTestIds}">
                                        ${t.test_name || "-"}
                                    </span>`;

                rowsToAdd.push([
                    checkbox,
                    `B#${t.booking_id}`,
                    t.patient_name || "-",
                    t.date || "-",
                    t.referred_dr || "-",
                    t.mr_no || "-",
                    testNameHtml, // <--- Using the HTML with hidden data here
                    t.total_amount || "0",
                    t.discount || "0",
                    t.net_amount || "0",
                    t.received || "0",
                    t.balance || "0",
                    `${printBtn} ${commentBtn} ${filmsBtn}`
                ]);
            });

            if (rowsToAdd.length > 0) {
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

// Global variable to track the booking's baseline total
let grandTotalFilms = 0;

function rebindTableEvents() {
    
    // --- Comment Booking Logic ---
    $("#testReg_table").off("click", ".comment-booking").on("click", ".comment-booking", function () {
        let bookingId = $(this).data("id");
        $("#saveCommentBtn").data("booking-id", bookingId);
        fetchComments(bookingId);
        $("#commentsModal").modal("show");
    });

    // --- Edit Films Logic ---
    $("#testReg_table").off("click", ".edit-films").on("click", ".edit-films", function () {
        const bookingId = $(this).data("id");
        const $testSelect = $("#testIdSelect");

        // 1. Reset Modal Fields
        $("#bookingIdInput").val(bookingId);
        $("#changedFilmsInput").val("");
        $("#reasonInput").val("");
        $("#currentFilmsInput").val("");
        $("#totalFilmsUsedInput").val(""); 
        $testSelect.html('<option value="">Loading tests...</option>');

        // 2. Fetch Data using Axios
        myshowLoader();
        axios.get(`${baseUrl}/booking/get-films-by-booking/${bookingId}`)
            .then(res => {
                const details = res.data.details || [];
                // Store the current grand total from DB
                grandTotalFilms = Number(res.data.grand_total_films) || 0;
                
                // Show the current total immediately
                $("#totalFilmsUsedInput").val(grandTotalFilms);

                $testSelect.empty().append('<option value="">-- Select Test --</option>');

                if (details.length > 0) {
                    details.forEach(item => {
                        let option = $('<option>', {
                            value: item.test_id,
                            text: item.test_name
                        }).data('films', item.films_used);

                        $testSelect.append(option);
                    });
                } else {
                    $testSelect.html('<option value="">No tests found</option>');
                }

                $("#filmsModal").modal("show");
            })
            .catch(err => {
                console.error("Error fetching films:", err);
                alert("Failed to load test details.");
            })
            .finally(() => {
                myhideLoader();
            });
    });
}

/** * Event: Calculate New Grand Total
 * Use 'input' instead of 'change' for real-time calculation as user types
 */
$(document).on("input", "#changedFilmsInput", function () {
    const additionalFilms = Number($(this).val()) || 0;
    const newTotal = grandTotalFilms + additionalFilms;
    $("#totalFilmsUsedInput").val(newTotal);
});

/**
 * Event: Update Selected Test Current Films
 */
$(document).on("change", "#testIdSelect", function () {
    const selectedFilms = $(this).find(':selected').data('films');
    if (selectedFilms !== undefined) {
        $("#currentFilmsInput").val(selectedFilms);
    } else {
        $("#currentFilmsInput").val("");
    }
});

/**
 * Event: Save Changes Axios Post
 */


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