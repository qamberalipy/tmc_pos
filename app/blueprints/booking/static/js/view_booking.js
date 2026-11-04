$(document).ready(function () {
    // ---------------------------------------------------------
    // 1. INITIALIZATION & SETUP
    // ---------------------------------------------------------
    const today = new Date();
    const toDate = today.toISOString().split("T")[0];
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const fromDate = past.toISOString().split("T")[0];

    $("#from_date").val(fromDate);
    $("#to_date").val(toDate);

    window.selectedBookingIds = new Set();
    window.bookingsMap = {}; // <--- NEW: Initialize Map

    // Load Data
    getAllTestBookings();
    loadShareProviders(); 

    // ---------------------------------------------------------
    // 2. EVENT LISTENERS
    // ---------------------------------------------------------

    $("#searchBtn").on("click", function () { getAllTestBookings(); });

    // Save Comment
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

    // Save Film Edit
    $("#SaveEditfilms").off("click").on("click", function () {
        const bookingId = parseInt($("#bookingIdInput").val());
        const testId = $("#testIdSelect").val();
        const currentTestFilms = Number($("#currentFilmsInput").val()) || 0;
        const addedFilms = Number($("#changedFilmsInput").val()) || 0;
        const filmsUnderTest = currentTestFilms + addedFilms;
        const totalNewFilmsUsed = Number($("#totalFilmsUsedInput").val());

        const payload = {
            booking_id: bookingId,
            test_id: parseInt(testId),
            films_under_test: filmsUnderTest,
            total_new_films_used: totalNewFilmsUsed,
            usage_type: $("#causeSelect").val(),
            reason: $("#reasonInput").val().trim()
        };

        if (!payload.test_id) return showToastMessage("error", "Please select a test.");
        if (addedFilms <= 0) return showToastMessage("error", "Please enter a valid number of films.");
        if (!payload.reason) return showToastMessage("error", "Reason is required.");

        myshowLoader();
        axios.post(baseUrl + "/booking/films/", payload)
            .then(res => {
                showToastMessage("success", "Film usage updated!");
                $("#filmsModal").modal("hide");
                getAllTestBookings();
            })
            .catch(err => handleAxiosError(err))
            .finally(() => myhideLoader());
    });

    // Save Referral Share Update
    $("#btnSaveShareUpdate").on("click", function () {
        let bookingId = $("#shareUpdateBookingId").val();
        let newProviderId = $("#shareProviderSelect").val(); 

        if (!bookingId) return;
        let $btn = $(this);
        let originalText = $btn.text();
        $btn.prop("disabled", true).text("Updating...");

        axios.post(baseUrl + "/booking/update-share-provider", {
            booking_id: bookingId,
            new_referred_id: newProviderId
        })
            .then(res => {
                showToastMessage("success", "Share provider updated successfully!");
                $("#updateShareModal").modal("hide");
                getAllTestBookings();
            })
            .catch(err => {
                let msg = err.response?.data?.error || "Failed to update share.";
                showToastMessage("error", msg);
            })
            .finally(() => {
                $btn.prop("disabled", false).text(originalText);
            });
    });

    // ---------------------------------------------------------
    // 3. REFUND LOGIC (NEW)
    // ---------------------------------------------------------
// ---------------------------------------------------------
    // 3. REFUND LOGIC (UPDATED)
    // ---------------------------------------------------------
    $(document).on("click", ".refund-booking", function() {
        let bookingId = $(this).data("id");
        
        // --- NEW VALIDATION: Check for Issued Tests ---
        let bookingData = window.bookingsMap[bookingId];
        if (bookingData && bookingData.test_booking_details) {
            // Check if ANY test in this booking is issued
            let hasIssuedTests = bookingData.test_booking_details.some(t => t.film_issued === true);
            
            if (hasIssuedTests) {
                Swal.fire({
                    icon: 'error',
                    title: 'Cannot Refund',
                    text: 'This booking contains ISSUED tests. Please revert the test status to "Pending" before refunding.',
                    confirmButtonColor: "#d33"
                });
                return; // STOP here, do not show the refund dialog
            }
        }
        // ----------------------------------------------

        Swal.fire({
            title: "Process Refund?",
            text: "This will DELETE the booking and creating a refund expense. This cannot be undone!",
            icon: "warning",
            input: "text",
            inputPlaceholder: "Enter reason for refund...",
            showCancelButton: true,
            confirmButtonColor: "#dc3545", // Red for danger
            confirmButtonText: "Yes, Refund & Delete",
            showLoaderOnConfirm: true,
            preConfirm: (reason) => {
                if (!reason) {
                    Swal.showValidationMessage("Reason is required to process refund");
                    return false;
                }
                // Call the backend API
                return axios.post(baseUrl + `/booking/refund/${bookingId}`, { reason: reason })
                    .then(res => {
                        return res.data;
                    })
                    .catch(error => {
                        let msg = error.response?.data?.error || error.message;
                        Swal.showValidationMessage(`Request failed: ${msg}`);
                    });
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: "Refunded!",
                    text: result.value.message,
                    icon: "success",
                    timer: 2000,
                    showConfirmButton: false
                });
                getAllTestBookings(); // Refresh the table
            }
        });
    });

    // ---------------------------------------------------------
    // 4. BULK ASSIGN LOGIC
    // ---------------------------------------------------------
    $("#selectAllBookings").on("change", function () {
        const isChecked = $(this).is(":checked");
        $(".chk-booking").prop("checked", isChecked);
        if (isChecked) {
            $(".chk-booking").each(function () { window.selectedBookingIds.add($(this).val()); });
        } else {
            window.selectedBookingIds.clear();
        }
        updateBulkButtonState();
    });

    $("#testReg_table").on("change", ".chk-booking", function () {
        const id = $(this).val();
        if ($(this).is(":checked")) { window.selectedBookingIds.add(id); }
        else { window.selectedBookingIds.delete(id); $("#selectAllBookings").prop("checked", false); }
        updateBulkButtonState();
    });

    $("#btnBulkAssign").on("click", function () {
        if (window.selectedBookingIds.size === 0) return;
        $("#modalSelectedCount").text(window.selectedBookingIds.size);
        $("#doctorSelectDropdown").html('<option value="" selected disabled>Loading Doctors...</option>');
        $("#assignDoctorModal").modal("show");

        axios.get(baseUrl + "/users/get_all_doctors")
            .then(res => {
                let options = `<option value="" selected disabled>-- Select Doctor --</option>`;
                res.data.forEach(dr => { options += `<option value="${dr.id}">${dr.name}</option>`; });
                $("#doctorSelectDropdown").html(options);
            })
            .catch(err => handleAxiosError(err));
    });

   $("#btnConfirmAssignment").on("click", function () {
        const doctorId = $("#doctorSelectDropdown").val();
        if (!doctorId) return showToastMessage("error", "Please select a doctor.");

        let bookingDetails = [];
        let hasIssuedSkipped = false; // Changed flag to track skipped 'Issued' tests

        // --- CHANGED LOGIC: Iterate Global Map Instead of DOM ---
        window.selectedBookingIds.forEach(function (bId) {
            let bookingData = window.bookingsMap[bId];

            if (bookingData && bookingData.test_booking_details) {
                // Filter for PENDING (unissued) tests directly from data object
                let pendingTests = bookingData.test_booking_details.filter(t => t.film_issued === false || !t.film_issued);
                
                if (pendingTests.length > 0) {
                    let idsArray = pendingTests.map(t => t.id);
                    bookingDetails.push({ booking_id: bId, test_ids: idsArray });
                } else {
                    hasIssuedSkipped = true; // All tests in this booking are issued, so we skip it
                }
            }
        });
        // -------------------------------------------------------

        if (bookingDetails.length === 0) {
            showToastMessage("warning", "None of the selected bookings have PENDING tests to assign.");
            return;
        }

        myshowLoader();
        axios.post(baseUrl + "/reports/assign-bookings", { doctor_id: doctorId, bookings: bookingDetails })
            .then(res => {
                let msg = "Bookings assigned successfully!";
                if(hasIssuedSkipped) msg += " (Issued tests were skipped)";
                showToastMessage("success", msg);
                
                $("#assignDoctorModal").modal("hide");
                window.selectedBookingIds.clear();
                updateBulkButtonState();
                $("#selectAllBookings").prop("checked", false);
                getAllTestBookings();
            })
            .catch(err => handleAxiosError(err))
            .finally(() => myhideLoader());
    });
});

let grandTotalFilms = 0;

// ---------------------------------------------------------
// 4. MAIN TABLE RENDERER (UPDATED FOR TRANSFER BOOKING)
// ---------------------------------------------------------
function getAllTestBookings() {
    myshowLoader();
    const from_date = $("#from_date").val();
    const to_date = $("#to_date").val();
    let url = baseUrl + "/booking/test-booking";
    if (from_date && to_date) url += `?from_date=${from_date}&to_date=${to_date}`;

    axios.get(url).then(res => {
        let dtable = $("#testReg_table").DataTable({
            destroy: true, responsive: true, pageLength: 15, ordering: false, lengthChange: false
        });
        dtable.clear();
        window.selectedBookingIds.clear();
        updateBulkButtonState();
        
        // --- NEW: Reset Map ---
        window.bookingsMap = {}; 

        let rowsToAdd = [];
        $.each(res.data, function (i, t) {
            // --- NEW: Store Data in Map ---
            window.bookingsMap[t.booking_id] = t;

            let tests = t.test_booking_details || [];
            
            let allTestIdsStr = tests.map(obj => obj.id).join(",");

            // 1. TESTS & STATUS RENDERING
            let testHtml = `<div class="d-flex flex-column gap-2 py-1">`;
            tests.forEach(obj => {
                const isChecked = obj.film_issued ? 'checked' : '';
                const theme = obj.film_issued ? 'status-issued' : 'status-pending';
                testHtml += `
                <div class="test-status-card ${theme} d-flex align-items-center justify-content-between px-2 py-1 rounded-2">
                    <div class="d-flex flex-column">
                        <span class="test-title fw-bold text-uppercase">${obj.test_name}</span>
                        <span class="status-indicator small fw-bold">${obj.film_issued ? 'ISSUED' : 'PENDING'}</span>
                    </div>
                    <div class="form-check form-switch m-0">
                        <input class="form-check-input film-issue-toggle modern-switch" type="checkbox" 
                            ${isChecked} data-booking-id="${t.booking_id}" data-test-id="${obj.id}">
                    </div>
                </div>`;
            });
            testHtml += `</div>`; // Closed div

            let currentShareId = t.give_share_to || "";

            // --- 2. Badges ---
            let transferBadge = "";
            if (t.is_transferred_in) {
                let logInfo = t.transfer_in_log
                    ? ` <small class="opacity-75">(${t.transfer_in_log.transferred_at || ''})</small>`
                    : "";
                transferBadge = `<a href="${baseUrl}/booking/transfers" class="badge bg-warning text-dark ms-1 text-decoration-none" style="font-size:0.65rem;" title="View Transfer History">
                    <i class="bi bi-box-arrow-in-right"></i> Transferred In${logInfo}</a>`;
            }

            let sentBadge = t.sent_to_doctor
                ? `<br><span class="badge bg-info text-dark ms-1" style="font-size:0.65rem;"><i class="bi bi-send-check"></i> Sent to Dr</span><br>`
                : ``;

            let apptBadge = t.is_appointment
                ? `<span class="badge bg-info ms-1">Appointment</span>`
                : ``;

            // --- 3. UPDATE: Action Buttons with full terminal-state enforcement ---
            // If is_transferred_in == True the booking is terminal: NO convert/transfer/refund/share.

            let transferBtnHtml = (!t.is_transferred_in)
                ? `<a href="${baseUrl}/booking/transfer/${t.booking_id}" class="btn btn-action text-info shadow-sm" title="Transfer to Another Branch"><i class="bi bi-arrow-left-right"></i></a>` 
                : ``;

            let refundBtnHtml = (!t.is_transferred_in)
                ? `<button class="btn btn-action text-danger shadow-sm refund-booking" data-id="${t.booking_id}" title="Refund &amp; Delete"><i class="bi bi-arrow-counterclockwise"></i></button>`
                : ``;

            let shareBtnHtml = (!t.is_transferred_in)
                ? `<button class="btn btn-action text-warning shadow-sm edit-share" data-id="${t.booking_id}" data-share="${currentShareId}" title="Update Share"><i class="bi bi-person-gear"></i></button>`
                : ``;

            // Convert Appointment → Normal (Conversion #1): only for appointments, never for transferred-in
            let convertToNormalBtnHtml = (t.is_appointment && !t.is_transferred_in)
                ? `<button class="btn btn-action text-success shadow-sm convert-appointment" data-id="${t.booking_id}" title="Confirm Appointment → Normal Booking (deducts films)"><i class="bi bi-calendar2-check"></i></button>`
                : ``;

            // Convert Normal → Appointment (Conversion #2): only for non-appointments, never for transferred-in
            let convertToApptBtnHtml = (!t.is_appointment && !t.is_transferred_in)
                ? `<button class="btn btn-action text-primary shadow-sm convert-to-appointment" data-id="${t.booking_id}" title="Revert to Appointment (refunds films)"><i class="bi bi-calendar-plus"></i></button>`
                : ``;

            // 4. ASSEMBLE ACTIONS
            let actions = `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-action text-info shadow-sm view-full-details" data-id="${t.booking_id}" title="Full Details"><i class="bi bi-info-circle"></i></button>
                <a href="${baseUrl}/booking/receipt/${t.booking_id}" target="_blank" class="btn btn-action text-success shadow-sm" title="Print Receipt"><i class="bi bi-printer"></i></a>
                <a href="${baseUrl}/booking/print-sticker/${t.booking_id}" target="_blank" class="btn btn-action text-secondary shadow-sm" title="Print Sticker"><i class="bi bi-tag"></i></a>
                
                <button class="btn btn-action text-primary shadow-sm comment-booking" data-id="${t.booking_id}" title="Comments"><i class="bi bi-chat-left-text"></i></button>
                
                <button class="btn btn-action text-dark shadow-sm edit-films" data-id="${t.booking_id}" data-test-ids="${allTestIdsStr}" title="Edit Films"><i class="bi bi-plus-square"></i></button>
                
                ${shareBtnHtml}
                ${convertToNormalBtnHtml}
                ${convertToApptBtnHtml}
                ${transferBtnHtml}
                ${refundBtnHtml}
            </div>`;


            // 5. PUSH TO TABLE ROWS
            rowsToAdd.push([
                `<input type="checkbox" class="chk-booking custom-chk" value="${t.booking_id}">`,
                `<div><div class="fw-bold">#${t.booking_id}</div><div class="text-muted text-xs">${t.date}</div></div>`,
                `<div><div class="fw-bold text-primary">${t.patient_name} ${transferBadge}${sentBadge}${apptBadge}</div><div class="text-muted text-xs">MR: ${t.mr_no || 'N/A'}</div></div>`,
                testHtml,
                `<div class="text-xs fw-medium">${t.referred_dr || 'Self'}</div>`,
                `<div class=" text-xs">${t.total_amount}</div>`,
                `<div class=" fw-bold text-success">${t.received}</div>`,
                `<div class=" fw-bold ${t.balance > 0 ? 'text-danger' : 'text-success'}">${t.balance}</div>`,
                actions
            ]);
        });

        dtable.rows.add(rowsToAdd).draw(false);
        rebindTableEvents();
    }).catch(err => console.error(err)).finally(() => myhideLoader());
}

// ---------------------------------------------------------
// 6. TABLE EVENT BINDINGS
// ---------------------------------------------------------
function rebindTableEvents() {
    $("#testReg_table").off("click", ".view-full-details").on("click", ".view-full-details", function () {
        const bookingId = $(this).data("id");
        openFullDetailsModal(bookingId);
    });

    $("#testReg_table").off("click", ".convert-appointment").on("click", ".convert-appointment", function () {
        const bookingId = $(this).data("id");
        Swal.fire({
            title: "Confirm Appointment?",
            text: "Convert this appointment to a confirmed booking? Films will be deducted from inventory now.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#198754",
            confirmButtonText: "Yes, Confirm Booking",
            showLoaderOnConfirm: true,
            preConfirm: () => {
                return axios.post(`${baseUrl}/booking/convert/${bookingId}`, { target_type: "normal" })
                    .then(res => res.data)
                    .catch(err => {
                        Swal.showValidationMessage(`Conversion failed: ${err.response?.data?.error || err.message}`);
                    });
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire({ title: "Success", text: "Appointment confirmed as a booking.", icon: "success", timer: 2000, showConfirmButton: false });
                getAllTestBookings();
            }
        });
    });

    $("#testReg_table").off("click", ".convert-to-appointment").on("click", ".convert-to-appointment", function () {
        const bookingId = $(this).data("id");

        // Client-side guard: check for issued films before hitting the server
        let bookingData = window.bookingsMap[bookingId];
        if (bookingData && bookingData.test_booking_details) {
            let issuedTests = bookingData.test_booking_details.filter(t => t.film_issued === true);
            if (issuedTests.length > 0) {
                Swal.fire({
                    icon: 'error',
                    title: 'Cannot Revert to Appointment',
                    html: `<b>${issuedTests.length} test(s)</b> have films already marked as <b>ISSUED</b>.<br>` +
                          `Revert all film statuses to <b>Pending</b> before converting.`,
                    confirmButtonColor: "#d33"
                });
                return;
            }
        }

        Swal.fire({
            title: "Revert to Appointment?",
            html: "This will <b>refund all consumed films</b> back to inventory and mark this booking as an Appointment again.<br><br>" +
                  "<small class='text-muted'>No cash is moved. The booking remains on the books.</small>",
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#0d6efd",
            confirmButtonText: "Yes, Revert to Appointment",
            showLoaderOnConfirm: true,
            preConfirm: () => {
                return axios.post(`${baseUrl}/booking/convert/${bookingId}`, { target_type: "appointment" })
                    .then(res => res.data)
                    .catch(err => {
                        Swal.showValidationMessage(`Failed: ${err.response?.data?.error || err.message}`);
                    });
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then((result) => {
            if (result.isConfirmed) {
                let msg = result.value.message || "Booking reverted to Appointment.";
                if (result.value.films_refunded > 0) {
                    msg += ` (${result.value.films_refunded} films returned to inventory)`;
                }
                Swal.fire({ title: "Reverted", text: msg, icon: "success", timer: 2500, showConfirmButton: false });
                getAllTestBookings();
            }
        });
    });

    $("#testReg_table").off("click", ".comment-booking").on("click", ".comment-booking", function () {
        let bookingId = $(this).data("id");
        window.open(`${baseUrl}/booking/view/technician-drive?booking_id=${bookingId}`, "_blank");
    });

    $("#testReg_table").off("click", ".edit-films").on("click", ".edit-films", function () {
        const bookingId = $(this).data("id");
        const $testSelect = $("#testIdSelect");
        $("#bookingIdInput").val(bookingId);
        $("#changedFilmsInput, #reasonInput, #currentFilmsInput").val("");
        $testSelect.html('<option value="">Loading tests...</option>');

        myshowLoader();
        axios.get(`${baseUrl}/booking/get-films-by-booking/${bookingId}`)
            .then(res => {
                grandTotalFilms = Number(res.data.grand_total_films) || 0;
                $("#totalFilmsUsedInput").val(grandTotalFilms);
                $testSelect.empty().append('<option value="">-- Select Test --</option>');
                (res.data.details || []).forEach(item => {
                    let opt = $('<option>', { value: item.test_id, text: item.test_name }).data('films', item.films_used);
                    $testSelect.append(opt);
                });
                $("#filmsModal").modal("show");
            })
            .finally(() => myhideLoader());
    });

    $("#testReg_table").off("click", ".edit-share").on("click", ".edit-share", function () {
        let bookingId = $(this).data("id");
        let currentShare = $(this).data("share");
        $("#shareUpdateBookingId").val(bookingId);
        if (!currentShare || currentShare == 0 || currentShare == "0") {
            $("#shareProviderSelect").val("").trigger('change');
        } else {
            $("#shareProviderSelect").val(currentShare).trigger('change');
        }
        $("#updateShareModal").modal("show");
    });
}

// ---------------------------------------------------------
// 7. HELPER FUNCTIONS
// ---------------------------------------------------------

function loadShareProviders() {
    axios.get(baseUrl + "/registrations/referred/list")
        .then(res => {
            let data = res.data || [];
            let $select = $("#shareProviderSelect");
            $select.empty().append('<option value="">-- No Share --</option>');
            let doctors = data.filter(d => d.is_doctor || d.type === true);
            let others = data.filter(d => !d.is_doctor && d.type !== true);

            if (doctors.length > 0) {
                let $group = $('<optgroup label="Doctors">');
                doctors.forEach(d => { $group.append(`<option value="${d.id}">${d.name}</option>`); });
                $select.append($group);
            }
            if (others.length > 0) {
                let $group = $('<optgroup label="Others">');
                others.forEach(d => { $group.append(`<option value="${d.id}">${d.name}</option>`); });
                $select.append($group);
            }
        })
        .catch(err => console.error("Failed to load providers", err));
}

$(document).on("change", ".film-issue-toggle", function () {
    const $toggle = $(this);
    const $card = $toggle.closest('.test-status-card');
    const $statusLabel = $card.find('.status-indicator');
    const bookingId = $toggle.data("booking-id");
    const testId = $toggle.data("test-id");
    const isIssued = $toggle.is(":checked");

    // Revert checkbox to previous state immediately — only apply after confirm
    $toggle.prop('checked', !isIssued);

    Swal.fire({
        title: isIssued ? 'Mark film as issued?' : 'Mark film as pending?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes',
        cancelButtonText: 'No'
    }).then((result) => {
        if (result.isConfirmed) {
            // Apply the checkbox and UI changes
            $toggle.prop('checked', isIssued);
            if (isIssued) {
                $card.removeClass('status-pending').addClass('status-issued');
                $statusLabel.text('ISSUED');
            } else {
                $card.removeClass('status-issued').addClass('status-pending');
                $statusLabel.text('PENDING');
            }

            $card.css('opacity', '0.6');
            axios.post(baseUrl + "/booking/update-film-status", {
                booking_id: bookingId, test_id: testId, film_issued: isIssued
            })
                .then(() => {
                    showToastMessage("success", "Film status updated");
                    // Also update the local map so if user clicks Bulk Assign immediately, data is fresh
                    if(window.bookingsMap[bookingId]) {
                         let tests = window.bookingsMap[bookingId].test_booking_details;
                         let tObj = tests.find(x => x.id === testId);
                         if(tObj) tObj.film_issued = isIssued;
                    }
                })
                .catch(err => {
                    $toggle.prop('checked', !isIssued);
                    if (isIssued) {
                        $card.removeClass('status-issued').addClass('status-pending');
                        $statusLabel.text('PENDING');
                    } else {
                        $card.removeClass('status-pending').addClass('status-issued');
                        $statusLabel.text('ISSUED');
                    }
                    handleAxiosError(err);
                })
                .finally(() => $card.css('opacity', '1'));
        }
        // On cancel/dismiss: checkbox already reverted, do nothing
    });
});

$(document).on("input", "#changedFilmsInput", function () {
    $("#totalFilmsUsedInput").val(grandTotalFilms + (Number($(this).val()) || 0));
});

$(document).on("change", "#testIdSelect", function () {
    $("#currentFilmsInput").val($(this).find(':selected').data('films') || 0);
});

function updateBulkButtonState() {
    const count = window.selectedBookingIds.size;
    $("#selectedCountBadge").text(count);
    count > 0 ? $("#btnBulkAssign").fadeIn() : $("#btnBulkAssign").fadeOut();
}

function handleAxiosError(err) {
    showToastMessage("error", err.response?.data?.error || err.message);
}

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
    let html = comments.length ? "" : `<div class="text-muted text-center py-2">No comments yet.</div>`;
    comments.forEach(c => {
        html += `
            <div class="timeline-item d-flex">
                <div class="timeline-icon"><span class="rounded-circle bg-success d-inline-flex align-items-center justify-content-center" style="width:28px; height:28px;"><i class="bi bi-person-fill-check text-white" style="font-size: 14px;"></i></span></div>
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
    $("#commentsHistory").html(html);
}

// ---------------------------------------------------------
// 8. FULL BOOKING DETAILS MODAL
// ---------------------------------------------------------

function openFullDetailsModal(bookingId) {
    // Reset state & show skeleton
    $('#fdSkeleton').show();
    $('#fdContent').hide();
    $('#fdBookingTitle').text('Loading…');
    $('#fdBadgesRow').html('');
    $('#fdPrintBtn').attr('href', baseUrl + '/booking/receipt/' + bookingId);
    $('#fullDetailsModal').modal('show');

    axios.get(baseUrl + '/booking/full-details/' + bookingId)
        .then(function(res) {
            renderFullDetails(res.data);
            $('#fdSkeleton').hide();
            $('#fdContent').show();
        })
        .catch(function(err) {
            $('#fdSkeleton').hide();
            $('#fdContent').show().html(
                '<div class="alert alert-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>' +
                (err.response?.data?.error || 'Failed to load booking details.') + '</div>'
            );
        });
}

function renderFullDetails(d) {
    // --- Header ---
    const mrText = d.mr_no || '—';
    $('#fdBookingTitle').html(
        '<i class="bi bi-bookmark-fill me-1"></i> Booking #' + d.booking_id +
        ' &nbsp;<span class="text-warning small" style="cursor:pointer;" id="fdCopyMrBtn" title="Click to copy MR No">MR: ' + mrText + ' <i class="bi bi-clipboard-fill" style="font-size:0.75rem;"></i></span>'
    );
    $('#fdCopyMrBtn').off('click').on('click', function() {
        if (d.mr_no) {
            navigator.clipboard.writeText(d.mr_no).then(function() {
                showToastMessage('success', 'MR No copied to clipboard: ' + d.mr_no);
            });
        }
    });

    let badges = '';
    if (d.is_appointment) {
        badges += '<span class="badge bg-info text-dark"><i class="bi bi-calendar-check me-1"></i>Appointment</span> ';
    }
    if (d.is_transferred_in) {
        badges += '<span class="badge bg-warning text-dark"><i class="bi bi-box-arrow-in-right me-1"></i>Transferred In</span> ';
    }
    if (!d.is_appointment && !d.is_transferred_in) {
        badges += '<span class="badge bg-secondary">Normal</span> ';
    }

    // Financial status badge
    let finBadge;
    if (d.due_amount <= 0) {
        finBadge = '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Paid</span>';
    } else if (d.paid_amount > 0 && d.due_amount > 0) {
        finBadge = '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Partial</span>';
    } else {
        finBadge = '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Unpaid</span>';
    }
    badges += finBadge;
    $('#fdBadgesRow').html(badges);

    // --- Patient ---
    $('#fdPatientName').text(d.patient_name || '—');
    $('#fdPatientMeta').text(
        (d.age != null ? d.age + ' ' + (d.age_unit || 'Years') : '—') + ' • ' + (d.gender || '—')
    );
    $('#fdPatientPhone').text(d.contact_no || '—');
    $('#fdBookingDate').html('<i class="bi bi-calendar3 me-1"></i>' + (d.created_at || '—'));
    $('#fdBookingCreatedBy').html('<i class="bi bi-person-check me-1"></i>Created by: <strong>' + (d.created_by_name || '—') + '</strong>');
    if (d.updated_at) {
        $('#fdBookingUpdated').html('<i class="bi bi-pencil-square me-1 text-warning"></i>Updated: ' + d.updated_at + (d.updated_by_name ? ' by <strong>' + d.updated_by_name + '</strong>' : '')).show();
    } else {
        $('#fdBookingUpdated').text('').hide();
    }
    $('#fdBranchName').text(d.booking_branch_name || '—');

    // --- Referral ---
    $('#fdReferredDr').text(d.referred_dr_name || '—');
    $('#fdReferredDrContact').text(d.referred_dr_contact ? ' (' + d.referred_dr_contact + ')' : '');
    $('#fdReferredNonDr').text(d.referred_non_dr_name || '—');
    $('#fdReferredNonDrContact').text(d.referred_non_dr_contact ? ' (' + d.referred_non_dr_contact + ')' : '');
    $('#fdGiveShareTo').text(d.give_share_to_name || '—');

    // Share status chip
    let shareHtml = '<span class="text-muted small fst-italic">No referral share record.</span>';
    if (d.referral_share) {
        let s = d.referral_share;
        let chip = s.is_paid
            ? '<span class="badge bg-success"><i class="bi bi-check2-all me-1"></i>Issued</span>'
            : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Pending</span>';
        shareHtml = '<div class="d-flex flex-wrap align-items-center gap-2 small">' +
            chip +
            '<span>Rs. <strong>' + s.share_amount.toFixed(2) + '</strong></span>' +
            '<span class="text-muted">To: <strong>' + (s.issued_to_name || '—') + '</strong></span>' +
            (s.is_paid ? '<span class="text-muted">on ' + (s.paid_at || '—') + ' by <strong>' + (s.created_by_name || '—') + '</strong></span>' : '') +
            '</div>';
    }
    $('#fdShareStatus').html(shareHtml);

    // --- Financial tiles ---
    let totalAmt = d.total_amount || 0;
    let discVal = d.discount_value || 0;
    let netRec = d.net_receivable || 0;
    let paidAmt = d.paid_amount || 0;
    let dueAmt = d.due_amount || 0;
    let discLabel = (d.discount_type && d.discount_type !== 'None') 
        ? (d.discount_type === 'Percentage' ? discVal + '%' : 'Rs. ' + discVal.toFixed(2)) 
        : 'None';

    let tilesHtml = `
        <div class="col"><div class="fd-stat-tile bg-light border"><div class="fd-stat-label">Total</div><div class="fd-stat-value">Rs. ${totalAmt.toFixed(2)}</div></div></div>
        <div class="col"><div class="fd-stat-tile bg-light border"><div class="fd-stat-label">Discount</div><div class="fd-stat-value text-warning">${discLabel}</div></div></div>
        <div class="col"><div class="fd-stat-tile bg-light border"><div class="fd-stat-label">Net</div><div class="fd-stat-value">Rs. ${netRec.toFixed(2)}</div></div></div>
        <div class="col"><div class="fd-stat-tile bg-success bg-opacity-10 border border-success"><div class="fd-stat-label text-success">Paid</div><div class="fd-stat-value text-success">Rs. ${paidAmt.toFixed(2)}</div></div></div>
        <div class="col"><div class="fd-stat-tile ${dueAmt > 0 ? 'bg-danger bg-opacity-10 border border-danger' : 'bg-light border'}"><div class="fd-stat-label ${dueAmt > 0 ? 'text-danger' : ''}">Due</div><div class="fd-stat-value ${dueAmt > 0 ? 'text-danger' : ''}">Rs. ${dueAmt.toFixed(2)}</div></div></div>
    `;
    $('#fdFinancialTiles').html(tilesHtml);

    // Progress bar
    let pct = netRec > 0 ? Math.min(100, Math.max(0, (paidAmt / netRec) * 100)) : 0;
    $('#fdProgressBar').css('width', pct.toFixed(1) + '%');
    $('#fdProgressLabel').text('Rs. ' + paidAmt.toFixed(2) + ' / Rs. ' + netRec.toFixed(2));

    // Payment timeline table
    let payHtml = '';
    if (d.payment_transactions && d.payment_transactions.length > 0) {
        d.payment_transactions.forEach(function(t) {
            let typeBadge = t.transaction_type === 'Initial'
                ? '<span class="badge bg-primary">Initial</span>'
                : '<span class="badge bg-info text-dark">Due Clearance</span>';
            payHtml += `<tr>
                <td>${typeBadge}</td>
                <td class="fw-bold">Rs. ${(t.amount || 0).toFixed(2)}</td>
                <td><span class="badge bg-secondary">${t.payment_type || '—'}</span></td>
                <td class="small">${t.payment_date || '—'}</td>
                <td class="small">${t.created_by_name || '—'}</td>
                <td class="small">${t.branch_name || '—'}</td>
            </tr>`;
        });
    }
    $('#fdPaymentRows').html(payHtml || '<tr><td colspan="6" class="text-muted text-center fst-italic">No payment records.</td></tr>');

    // --- Tests Table ---
    let testHtml = '';
    if (d.tests && d.tests.length > 0) {
        d.tests.forEach(function(t) {
            let filmBadge = t.film_issued
                ? '<span class="badge bg-success" style="font-size:0.65rem;">Issued</span>'
                : '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">Pending</span>';
            testHtml += `<tr>
                <td class="small fw-semibold">${t.test_name}</td>
                <td class="text-end small">Rs. ${(t.amount || 0).toFixed(2)}</td>
                <td class="text-center small">${t.quantity || 1}</td>
                <td class="text-center small">${t.no_of_films || 0}</td>
                <td class="text-center">${filmBadge}</td>
            </tr>`;
        });
    }
    $('#fdTestRows').html(testHtml || '<tr><td colspan="5" class="text-muted text-center fst-italic">—</td></tr>');
    $('#fdFilmsChip').text((d.total_films_used || 0) + ' films used');

    // --- Film Usages ---
    let filmHtml = '';
    if (d.film_usages && d.film_usages.length > 0) {
        d.film_usages.forEach(function(f) {
            filmHtml += `<div class="border-start border-warning border-3 ps-2 mb-2 small">
                <div class="fw-semibold">${f.usage_type} — ${f.films_used} film(s)</div>
                <div class="text-muted">${f.reason || '—'} &bull; ${f.used_at} &bull; ${f.used_by_name}</div>
            </div>`;
        });
    }
    $('#fdFilmUsages').html(filmHtml || '<span class="text-muted small fst-italic">No film usage records.</span>');

    // --- Doctor Reports ---
    let drHtml = '';
    if (d.doctor_reports && d.doctor_reports.length > 0) {
        d.doctor_reports.forEach(function(dr) {
            let statusBadge = dr.status === 'Reported'
                ? '<span class="badge bg-success">Reported</span>'
                : dr.status === 'Declined'
                    ? '<span class="badge bg-danger">Declined</span>'
                    : '<span class="badge bg-warning text-dark">Pending</span>';
            drHtml += `<div class="border rounded p-2 mb-2 small">
                <div class="fw-semibold">${dr.doctor_name} ${statusBadge}</div>
                <div class="text-muted">Assigned by: ${dr.assign_by_name} &bull; ${dr.assigned_at}</div>
                ${dr.returned_at ? '<div class="text-success mt-1"><i class="bi bi-check-circle me-1"></i>Returned: ' + dr.returned_at + '</div>' : '<div class="text-muted mt-1 fst-italic">Not yet returned</div>'}
            </div>`;
        });
    }
    $('#fdDoctorReports').html(drHtml || '<span class="text-muted small fst-italic">Not assigned to any doctor.</span>');

    // --- Activity Timeline ---
    let actHtml = '';
    // Created event
    actHtml += `<div class="timeline-item mb-3 d-flex align-items-start gap-2">
        <div class="timeline-dot bg-primary text-white"><i class="bi bi-plus-circle-fill" style="font-size:0.75rem;"></i></div>
        <div>
            <div class="small fw-semibold">Booking Created</div>
            <div class="text-muted" style="font-size:0.75rem;">${d.created_at || '—'} &bull; by <strong>${d.created_by_name || '—'}</strong></div>
        </div>
    </div>`;

    // Conversion logs
    if (d.conversion_logs && d.conversion_logs.length > 0) {
        d.conversion_logs.forEach(function(cv) {
            actHtml += `<div class="timeline-item mb-3 d-flex align-items-start gap-2">
                <div class="timeline-dot bg-secondary text-white"><i class="bi bi-arrow-repeat" style="font-size:0.75rem;"></i></div>
                <div>
                    <div class="small fw-semibold">Conversion: ${cv.from_type} → ${cv.to_type}</div>
                    <div class="text-muted" style="font-size:0.75rem;">${cv.created_at || '—'} &bull; by <strong>${cv.converted_by_name || '—'}</strong></div>
                    ${cv.reason ? '<div class="text-muted" style="font-size:0.75rem;">' + cv.reason + '</div>' : ''}
                </div>
            </div>`;
        });
    }

    // Technician comments
    if (d.technician_comments && d.technician_comments.length > 0) {
        d.technician_comments.forEach(function(c) {
            actHtml += `<div class="timeline-item mb-3 d-flex align-items-start gap-2">
                <div class="timeline-dot bg-success text-white"><i class="bi bi-chat-left-text-fill" style="font-size:0.75rem;"></i></div>
                <div>
                    <div class="small fw-semibold">${c.user_name || '—'} <span class="badge bg-secondary" style="font-size:0.65rem;">${c.role || ''}</span></div>
                    <div class="text-muted" style="font-size:0.75rem;">${c.datetime || '—'}</div>
                    <div class="small mt-1">${c.comment || ''}</div>
                </div>
            </div>`;
        });
    }

    // Chat summary
    if (d.chat_summary && d.chat_summary.total_messages > 0) {
        actHtml += `<div class="timeline-item mb-3 d-flex align-items-start gap-2">
            <div class="timeline-dot bg-info text-white"><i class="bi bi-chat-dots-fill" style="font-size:0.75rem;"></i></div>
            <div>
                <div class="small fw-semibold">Technician Chat (${d.chat_summary.total_messages} message${d.chat_summary.total_messages === 1 ? '' : 's'})</div>
                <div class="text-muted" style="font-size:0.75rem;">Last activity: ${d.chat_summary.last_activity || '—'}</div>
            </div>
        </div>`;
    }

    $('#fdActivityTimeline').html(actHtml || '<span class="text-muted small fst-italic">—</span>');

    // --- Transfer Card ---
    if (d.transfer_log) {
        let tl = d.transfer_log;
        let transferHtml = `
            <div class="small">
                <div class="mb-1"><i class="bi bi-geo-alt me-1 text-warning"></i><strong>From Branch:</strong> ${tl.from_branch_name}</div>
                <div class="mb-1"><i class="bi bi-geo-alt-fill me-1 text-success"></i><strong>To Branch:</strong> ${tl.to_branch_name}</div>
                <div class="mb-1"><i class="bi bi-person-fill me-1"></i><strong>Transferred By:</strong> ${tl.transferred_by_name} &bull; ${tl.transferred_at}</div>
                <div class="mb-1"><i class="bi bi-cash me-1"></i><strong>Cash Held:</strong> Rs. ${(tl.cash_held || 0).toFixed(2)}</div>
                ${tl.reason ? '<div class="mb-1"><i class="bi bi-chat-left me-1"></i><strong>Reason:</strong> ' + tl.reason + '</div>' : ''}
                <div class="text-muted mt-2" style="font-size:0.75rem;">Old Booking #${tl.old_booking_id} ${tl.new_booking_id ? '→ New Booking #' + tl.new_booking_id : ''}</div>
            </div>`;
        $('#fdTransferBody').html(transferHtml);
        $('#fdTransferCardCol').show();
    } else {
        $('#fdTransferCardCol').hide();
    }
}

// Global click handler delegation
$(document).on('click', '.view-full-details', function() {
    const bookingId = $(this).data('id');
    openFullDetailsModal(bookingId);
});
