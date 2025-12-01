$(document).ready(function () {

    // Load on page start
    const today = new Date();
    const toDate = today.toISOString().split("T")[0];

    const past = new Date();
    past.setDate(past.getDate() - 30);
    const fromDate = past.toISOString().split("T")[0];

    $("#from_date").val(fromDate);
    $("#to_date").val(toDate);

    // Load data with default filter
    getAllTestBookings();

    // ---------------------------
    // 🔍 APPLY DATE FILTER
    // ---------------------------
    $("#searchBtn").on("click", function () {
        let from_date = $("#from_date").val();
        let to_date = $("#to_date").val();

        // If only one date filled → show error
        if ((from_date && !to_date) || (!from_date && to_date)) {
            showToastMessage("error", "Please select both From and To dates.");
            return;
        }

        getAllTestBookings();
    });

    // Save comment
    $("#saveCommentBtn").on("click", function () {
        let bookingId = $(this).data("booking-id");
        let commentText = $("#newComment").val().trim();

        if (!commentText) {
            showToastMessage("error", "Please enter a comment before saving.");
            return;
        }

        let payload = { comment: commentText };

        myshowLoader();
        axios.post(baseUrl + "/booking/comments/" + bookingId, payload)
            .then(res => {
                let newComment = res.data.data;
                let existingComments = $("#commentsHistory").data("comments") || [];
                existingComments.unshift(newComment);
                $("#commentsHistory").data("comments", existingComments);
                loadComments(existingComments);
                $("#newComment").val("");
            })
            .catch(err => {
                let msg = err.response?.data?.error || err.response?.data?.message || err.message;
                showToastMessage("error", "Failed to save comment: " + msg);
            })
            .finally(() => myhideLoader());
    });

    // Save edited films
    $("#SaveEditfilms").on("click", function () {

        const bookingId = $("#bookingIdInput").val();
        const newFilms = Number($("#changedFilmsInput").val());
        const usageType = $("#causeSelect").val();
        const reason = $("#reasonInput").val().trim();

        if (!bookingId) return showToastMessage("error", "Invalid booking ID.");
        if (!newFilms || newFilms <= 0) return showToastMessage("error", "Please enter valid films.");
        if (!reason) return showToastMessage("error", "Please enter reason.");

        const payload = {
            booking_id: parseInt(bookingId),
            new_films_used: newFilms,
            usage_type: usageType,
            reason: reason
        };

        myshowLoader();

        axios.post(baseUrl + "/booking/films/", payload)
            .then(res => {
                showToastMessage("success", "Film usage updated successfully!");
                $(".modal").modal("hide");
            })
            .catch(err => {
                const msg = err.response?.data?.error || err.response?.data?.message || err.message;
                showToastMessage("error", "Failed to update: " + msg);
            })
            .finally(() => myhideLoader());
    });

});


// =======================================================================
// 🔥 MAIN FUNCTION – Fetch Bookings With Optional Date Filter
// =======================================================================
function getAllTestBookings() {

    myshowLoader();
    const from_date = $("#from_date").val();
    const to_date = $("#to_date").val();
    let url = baseUrl + "/booking/test-booking";

    // Attach query params only when dates exist
    if (from_date && to_date) {
        url += `?from_date=${from_date}&to_date=${to_date}`;
    }

    return axios.get(url)
        .then(res => {
            let data = res.data;

            let dtable = $("#testReg_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 14,
                lengthChange: false,
                ordering: false
            });

            dtable.clear().draw();

            $.each(data, function (i, t) {

                let printBtn = `
                    <a href="${baseUrl}/booking/receipt/${t.booking_id}" 
                       target="_blank" 
                       class="border btn print-booking">
                       <i class="bi-printer-fill text-success"></i>
                    </a>
                `;

                let commentBtn = `
                    <button class="border btn comment-booking" data-id="${t.booking_id}">
                       <i class="bi-chat-left-dots-fill text-primary"></i>
                    </button>
                `;

                let filmsBtn = `
                    <button class="border btn edit-films" data-id="${t.booking_id}" data-films="${t.total_films || 0}">
                       <i class="bi-pencil-square text-dark"></i>
                    </button>
                `;

                let actionBtns = printBtn + " " + commentBtn + " " + filmsBtn;

                dtable.row.add([
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
                    actionBtns
                ]).draw(false);

            });

            // Attach click events (must rebind)
            $("#testReg_table")
                .off("click", ".comment-booking")
                .on("click", ".comment-booking", function () {
                    let bookingId = $(this).data("id");
                    $("#saveCommentBtn").data("booking-id", bookingId);
                    fetchComments(bookingId);
                    $("#commentsModal").modal("show");
                });

            $("#testReg_table")
                .off("click", ".edit-films")
                .on("click", ".edit-films", function () {
                    let bookingId = $(this).data("id");
                    let currentFilms = $(this).data("films");

                    $("#currentFilmsInput").val(currentFilms);
                    $("#changedFilmsInput").val("");
                    $("#reasonInput").val("");
                    $("#bookingIdInput").val(bookingId);

                    $("#filmsModal").modal("show");
                });

            myhideLoader();
        })
        .catch(err => {
            console.error("Error fetching test bookings:", err);
            myhideLoader();
        });
}


// =======================================================================
// 🔹 COMMENT SYSTEM HELPERS
// =======================================================================

function loadComments(comments) {
    let html = "";

    if (!comments || comments.length === 0) {
        html = `<div class="text-muted">No comments yet.</div>`;
    } else {
        comments.forEach(c => {
            html += `
                <div class="timeline-item d-flex">
                    <div class="timeline-icon">
                        <span class="rounded-circle bg-success d-inline-flex align-items-center justify-content-center">
                            <i class="bi bi-person-fill-check text-white"></i>
                        </span>
                    </div>
                    <div class="timeline-content ms-3 flex-grow-1">
                        <div class="card pb-2 px-2">
                            <div class="d-flex justify-content-between">
                                <strong>${c.user_name} (${c.role})</strong>
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

function fetchComments(bookingId) {
    myshowLoader();
    axios.get(baseUrl + "/booking/comments/" + bookingId)
        .then(res => {
            let comments = res.data.comments || [];
            $("#commentsHistory").data("comments", comments);
            loadComments(comments);
        })
        .catch(err => console.error("Error loading comments:", err))
        .finally(() => myhideLoader());
}
