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

    // --- NEW: Save Referral Share Update ---
    $("#btnSaveShareUpdate").on("click", function () {
        let bookingId = $("#shareUpdateBookingId").val();
        let newProviderId = $("#shareProviderSelect").val(); // Takes value (ID) or empty string

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
                getAllTestBookings(); // Refresh table to show changes
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
    // 3. BULK ASSIGN LOGIC
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
        let hasUnissuedSkipped = false;

        window.selectedBookingIds.forEach(function (bId) {
            let $checkbox = $(`.chk-booking[value="${bId}"]`);
            if ($checkbox.length > 0) {
                // --- CHANGED HERE: Grab only ISSUED IDs ---
                let issuedIdsString = $checkbox.closest('tr').find('.test-info-cell').data('issued-ids');
                
                // If there are valid issued tests
                if (issuedIdsString && issuedIdsString.toString().length > 0) {
                    let idsArray = issuedIdsString.toString().split(',').map(Number);
                    bookingDetails.push({ booking_id: bId, test_ids: idsArray });
                } else {
                    hasUnissuedSkipped = true;
                }
            }
        });

        if (bookingDetails.length === 0) {
            showToastMessage("warning", "None of the selected bookings have ISSUED tests.");
            return;
        }

        myshowLoader();
        axios.post(baseUrl + "/reports/assign-bookings", { doctor_id: doctorId, bookings: bookingDetails })
            .then(res => {
                let msg = "Bookings assigned successfully!";
                if(hasUnissuedSkipped) msg += " (Unissued tests were skipped)";
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
// 4. MAIN TABLE RENDERER (UPDATED)
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

        let rowsToAdd = [];
        $.each(res.data, function (i, t) {
            let tests = t.test_booking_details || [];
            
            // --- CHANGED: Separate All IDs vs Issued IDs ---
            let allTestIdsStr = tests.map(obj => obj.id).join(",");
            let issuedTestIdsStr = tests.filter(obj => obj.film_issued === true).map(obj => obj.id).join(",");

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
            // Store both all IDs and ONLY issued IDs in data attributes
            testHtml += `<div style="display:none;" class="test-info-cell" 
                            data-ids="${allTestIdsStr}" 
                            data-issued-ids="${issuedTestIdsStr}">
                         </div></div>`;

            let currentShareId = t.give_share_to || "";

            // 3. ACTION BUTTONS
            let actions = `
            <div class="d-flex gap-1 justify-content-center">
                <a href="${baseUrl}/booking/receipt/${t.booking_id}" target="_blank" class="btn btn-action text-success shadow-sm" title="Print Receipt"><i class="bi bi-printer"></i></a>
                <button class="btn btn-action text-primary shadow-sm comment-booking" data-id="${t.booking_id}" title="Comments"><i class="bi bi-chat-left-text"></i></button>
                <button class="btn btn-action text-dark shadow-sm edit-films" data-id="${t.booking_id}" data-test-ids="${allTestIdsStr}" title="Edit Films"><i class="bi bi-plus-square"></i></button>
                <button class="btn btn-action text-warning shadow-sm edit-share" data-id="${t.booking_id}" data-share="${currentShareId}" title="Update Share"><i class="bi bi-person-gear"></i></button>
            </div>`;

            rowsToAdd.push([
                `<input type="checkbox" class="chk-booking custom-chk" value="${t.booking_id}">`,
                `<div><div class="fw-bold">#${t.booking_id}</div><div class="text-muted text-xs">${t.date}</div></div>`,
                `<div><div class="fw-bold text-primary">${t.patient_name}</div><div class="text-muted text-xs">MR: ${t.mr_no || 'N/A'}</div></div>`,
                testHtml,
                `<div class="text-xs fw-medium">${t.referred_dr || 'Self'}</div>`,
                `<div class="text-end text-muted text-xs">${t.total_amount}</div>`,
                `<div class="text-end fw-bold">${t.received}</div>`,
                // Due Column (Balance)
                `<div class="text-end fw-bold ${t.balance > 0 ? 'text-danger' : 'text-success'}">${t.balance}</div>`,
                actions
            ]);
        });

        dtable.rows.add(rowsToAdd).draw(false);
        rebindTableEvents();
    }).catch(err => console.error(err)).finally(() => myhideLoader());
}

// ---------------------------------------------------------
// 5. TABLE EVENT BINDINGS
// ---------------------------------------------------------
function rebindTableEvents() {
    $("#testReg_table").off("click", ".comment-booking").on("click", ".comment-booking", function () {
        let bookingId = $(this).data("id");
        $("#saveCommentBtn").data("booking-id", bookingId);
        fetchComments(bookingId);
        $("#commentsModal").modal("show");
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
// 6. HELPER FUNCTIONS
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
        .then(() => showToastMessage("success", "Film status updated"))
        .catch(err => {
            $toggle.prop('checked', !isIssued);
            handleAxiosError(err);
        })
        .finally(() => $card.css('opacity', '1'));
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