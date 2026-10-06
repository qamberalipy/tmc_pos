$(document).ready(function () {
    const bookingId = $("#original_booking_id").val();
    let originalHeldCash = 0;
    let originBranchId = null;
    let originalTests = [];   // populated from the booking's own details — read-only display

    // --- 1. INITIALIZATION ---
    loadBranches();
    fetchOriginalBookingDetails();

    // --- 2. FETCH ORIGINAL BOOKING ---
    // We call two endpoints:
    //   /booking/details/<id>   → patient name, mr_no, branch_id, paid_amount
    //   /booking/test-booking/<id> → test list (tests[]) and net_receivable
    function fetchOriginalBookingDetails() {
        myshowLoader();
        Promise.all([
            axios.get(`${baseUrl}/booking/details/${bookingId}`),
            axios.get(`${baseUrl}/booking/test-booking/${bookingId}`)
        ])
            .then(([detailsRes, bookingRes]) => {
                const meta   = detailsRes.data.booking;  // {booking_id, patient_name, mr_no, branch_id, branch_name, paid_amount}
                const booking = bookingRes.data;           // flat booking object from get_booking_details

                $("#lbl_patient_name").text(meta.patient_name);
                $("#lbl_mr_no").text(meta.mr_no);

                originBranchId = meta.branch_id;
                originalHeldCash = parseFloat(meta.paid_amount || 0);
                $("#summary_held_cash").text(`Rs. ${originalHeldCash.toFixed(2)}`);

                // tests[] from get_booking_details has {test_name, amount, no_of_films, ...}
                const tests = booking.tests || [];
                const netTotal = booking.financials ? booking.financials.net_payable : 0;

                originalTests = tests;
                renderOriginalTests(tests, netTotal);
                calculateFinancials();

                // Now that we have originBranchId, filter the branches dropdown
                filterOriginBranch();
            })
            .catch(err => {
                showToastMessage("error", "Failed to load original booking details.");
                console.error(err);
            })
            .finally(() => myhideLoader());
    }

    function renderOriginalTests(tests, netTotal) {
        let html = "";
        if (!tests || tests.length === 0) {
            html = `<tr><td colspan="2" class="text-center text-muted small py-3">No tests found.</td></tr>`;
        } else {
            tests.forEach(t => {
                html += `
                    <tr>
                        <td class="align-middle">${t.test_name || `Test #${t.id}`}</td>
                        <td class="text-center align-middle">
                            <span class="badge ${t.film_issued ? 'bg-success' : 'bg-secondary'}">
                                ${t.film_issued ? 'Issued' : 'Pending'}
                            </span>
                        </td>
                    </tr>`;
            });
        }
        $("#originalTestsBody").html(html);
        $("#summary_new_total").text(`Rs. ${parseFloat(netTotal).toFixed(2)}`);
    }

    // --- 3. FETCH TARGET BRANCHES ---
    function loadBranches() {
        axios.get(`${baseUrl}/admin/branches`)
            .then(res => {
                window._allBranches = res.data || [];
                filterOriginBranch();
            })
            .catch(err => console.error("Error loading branches", err));
    }

    function filterOriginBranch() {
        let branchData = window._allBranches || [];
        let options = '<option value="">-- Choose Branch --</option>';
        branchData.forEach(b => {
            if (b.id != originBranchId) {
                options += `<option value="${b.id}">${b.branch_name}</option>`;
            }
        });
        $("#target_branch_id").html(options);
    }

    // --- 4. FETCH DOCTORS FOR SELECTED BRANCH (only assignee, no tests) ---
    $("#target_branch_id").on("change", function () {
        let t_branch_id = $(this).val();

        if (!t_branch_id) {
            $("#target_assignee").html('<option value="">-- Select Branch First --</option>').prop("disabled", true);
            return;
        }

        myshowLoader();
        axios.get(`${baseUrl}/users/user/staff/${t_branch_id}`)
            .then(res => {
                let staffData = res.data.data || res.data;
                let staffOptions = '<option value="">-- No Assignment / Select Staff --</option>';
                staffData.forEach(staff => {
                    staffOptions += `<option value="${staff.id}">${staff.name}</option>`;
                });
                $("#target_assignee").html(staffOptions).prop("disabled", false);
            })
            .catch(err => {
                console.error("Error fetching branch staff:", err);
                showToastMessage("error", "Failed to load branch staff.");
            })
            .finally(() => myhideLoader());
    });

    // --- 5. FINANCIAL SUMMARY ---
    function calculateFinancials() {
        // Due is always 0 for transfers since net_receivable is preserved
        // (patient owes any remaining due at target, origin holds the cash paid)
        let due = 0;
        $("#summary_due_amount").text(`Rs. ${due.toFixed(2)}`);
        return due;
    }

    // --- 6. SUBMIT TRANSFER ---
    $("#btnExecuteTransfer").on("click", function () {
        let targetBranch = $("#target_branch_id").val();
        let targetAssignee = $("#target_assignee").val() || null;
        let reason = $("#transfer_reason").val().trim();

        if (!targetBranch) return showToastMessage("error", "Please select a target branch.");
        if (!reason) return showToastMessage("error", "Transfer reason is required for auditing.");

        // Tests are auto-copied server-side from original TestBookingDetails
        let payload = {
            booking_id: parseInt(bookingId),
            target_branch_id: parseInt(targetBranch),
            due_amount: 0,   // financials preserved from original booking
            reason: reason,
            assigned_to: targetAssignee
        };

        if (confirm(`Are you sure you want to transfer this booking to the selected branch?\n\nAll ${originalTests.length} test(s) will be automatically copied.`)) {
            myshowLoader();
            axios.post(`${baseUrl}/booking/transfer-rebook`, payload)
                .then(res => {
                    Swal.fire("Transferred!", res.data.message, "success").then(() => {
                        window.location.href = `${baseUrl}/booking/transfers`;
                    });
                })
                .catch(err => {
                    let msg = err.response?.data?.error || "Transfer failed.";
                    showToastMessage("error", msg);
                })
                .finally(() => myhideLoader());
        }
    });
});