$(document).ready(function () {
    const bookingId = $("#original_booking_id").val();
    let originalHeldCash = 0;
    let selectedTestsList = [];
    let originBranchId = null;

    // --- 1. INITIALIZATION ---
    loadBranches();
    fetchOriginalBookingDetails();

    $('#target_tests').select2({
        theme: 'bootstrap-5',
        placeholder: "Search tests..."
    });

    // --- 2. FETCH ORIGINAL DATA ---
    function fetchOriginalBookingDetails() {
        myshowLoader();
        axios.get(`${baseUrl}/booking/details/${bookingId}`)
            .then(res => {
                const data = res.data.booking;
                $("#lbl_patient_name").text(data.patient_name);
                $("#lbl_mr_no").text(data.mr_no);
                $("#lbl_origin_branch").text(data.branch_name || `Branch ID: ${data.branch_id}`);
                
                originBranchId = data.branch_id;
                originalHeldCash = parseFloat(data.paid_amount || 0);
                
                $("#summary_held_cash").text(`Rs. ${originalHeldCash.toFixed(2)}`);
                calculateFinancials();
            })
            .catch(err => {
                showToastMessage("error", "Failed to load original booking details.");
                console.error(err);
            })
            .finally(() => myhideLoader());
    }

    // --- 3. FETCH TARGET BRANCHES ---
    function loadBranches() {
        axios.get(`${baseUrl}/admin/branches`)
            .then(res => {
                let options = '<option value="">-- Choose Branch --</option>';
                let branchData = res.data || []; 
                
                branchData.forEach(b => {
                    if (b.id != originBranchId) {
                        options += `<option value="${b.id}">${b.branch_name}</option>`;
                    }
                });
                $("#target_branch_id").html(options);
            })
            .catch(err => console.error("Error loading branches", err));
    }

    // --- 4. FETCH TESTS & DOCTORS FOR SELECTED BRANCH ---
// --- 4. FETCH TESTS & DOCTORS FOR SELECTED BRANCH ---
    $("#target_branch_id").on("change", function () {
        let t_branch_id = $(this).val();
        selectedTestsList = []; // Clear tests on branch change
        renderTestTable();

        if (!t_branch_id) {
            $("#target_tests").html('<option value="">-- Select Branch First --</option>').prop("disabled", true);
            $("#target_assignee").html('<option value="">-- Select Branch First --</option>').prop("disabled", true);
            return;
        }

        myshowLoader();
        
        // Prepare both API requests
        let requestTests = axios.get(`${baseUrl}/registrations/test/list/${t_branch_id}`);
        let requestStaff = axios.get(`${baseUrl}/users/user/staff/${t_branch_id}`);

        // Run both requests at the same time and wait for both to finish
        Promise.all([requestTests, requestStaff])
            .then(responses => {
                let testRes = responses[0];
                let staffRes = responses[1];

                // 1. Populate Tests Dropdown
                let testOptions = '<option value="">-- Select Test to Add --</option>';
                let testData = testRes.data.data || testRes.data; 
                testData.forEach(t => {
                    testOptions += `<option value="${t.id}" data-price="${t.price}" data-films="${t.no_of_films || 0}">${t.test_name} - Rs.${t.price}</option>`;
                });
                $("#target_tests").html(testOptions).prop("disabled", false);

                // 2. Populate Target Staff/Doctors Dropdown
                let staffOptions = '<option value="">-- No Assignment / Select Staff --</option>';
                let staffData = staffRes.data.data || staffRes.data;
                staffData.forEach(staff => {
                    staffOptions += `<option value="${staff.id}">${staff.name}</option>`;
                });
                $("#target_assignee").html(staffOptions).prop("disabled", false);
            })
            .catch(err => {
                console.error("Error fetching branch data:", err);
                showToastMessage("error", "Failed to load branch data.");
            })
            .finally(() => {
                // This guarantees the loader ALWAYS hides after both succeed or fail
                myhideLoader();
            });
    });

    // --- 5. ADD TEST TO TABLE ---
    $("#target_tests").on("change", function () {
        let option = $(this).find("option:selected");
        let t_id = option.val();
        
        if (!t_id) return;

        let t_name = option.text().split(" - ")[0];
        let t_price = parseFloat(option.data("price") || 0);
        let t_films = parseInt(option.data("films") || 0);

        // Prevent duplicates
        if (selectedTestsList.some(t => t.test_id == t_id)) {
            showToastMessage("warning", "Test already added.");
            $(this).val("").trigger("change");
            return;
        }

        selectedTestsList.push({
            test_id: t_id,
            test_name: t_name,
            price: t_price,
            no_of_films: t_films
        });

        renderTestTable();
        $(this).val("").trigger("change"); // Reset dropdown
    });

    // --- 6. RENDER DYNAMIC TABLE & CALCULATE MATH ---
    function renderTestTable() {
        let html = "";
        let newTotal = 0;

        if (selectedTestsList.length === 0) {
            html = `<tr><td colspan="4" class="text-center text-muted small py-3">No tests added yet.</td></tr>`;
        } else {
            selectedTestsList.forEach((t, index) => {
                newTotal += t.price;
                html += `
                    <tr>
                        <td class="align-middle">${t.test_name}</td>
                        <td class="text-center align-middle">Rs. ${t.price.toFixed(2)}</td>
                        <td class="text-center align-middle">${t.no_of_films}</td>
                        <td class="text-center align-middle">
                            <button class="btn btn-sm btn-outline-danger py-0 px-2 btn-remove-test" data-index="${index}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        $("#testListBody").html(html);
        $("#summary_new_total").text(`Rs. ${newTotal.toFixed(2)}`);
        calculateFinancials(newTotal);
    }

    $(document).on("click", ".btn-remove-test", function () {
        let index = $(this).data("index");
        selectedTestsList.splice(index, 1);
        renderTestTable();
    });

    function calculateFinancials(newTotal = 0) {
        let due = newTotal - originalHeldCash;
        if (due < 0) due = 0; 
        $("#summary_due_amount").text(`Rs. ${due.toFixed(2)}`);
        return due;
    }

    // --- 7. SUBMIT TRANSFER ---
    $("#btnExecuteTransfer").on("click", function () {
        let targetBranch = $("#target_branch_id").val();
        let targetAssignee = $("#target_assignee").val() || null;
        let reason = $("#transfer_reason").val().trim();

        if (!targetBranch) return showToastMessage("error", "Please select a target branch.");
        if (selectedTestsList.length === 0) return showToastMessage("error", "Please add at least one test.");
        if (!reason) return showToastMessage("error", "Transfer reason is required for auditing.");

        let newTotal = selectedTestsList.reduce((sum, t) => sum + t.price, 0);
        let finalDue = calculateFinancials(newTotal);

        let payload = {
            booking_id: parseInt(bookingId),
            target_branch_id: parseInt(targetBranch),
            new_tests: selectedTestsList, 
            due_amount: finalDue,
            reason: reason,
            assigned_to: targetAssignee // <--- Passing the Doctor ID safely to backend
        };

        if (confirm(`Are you sure you want to transfer this booking to the new branch?`)) {
            myshowLoader();
            axios.post(`${baseUrl}/booking/transfer-rebook`, payload)
                .then(res => {
                    Swal.fire("Transferred!", res.data.message, "success").then(() => {
                        window.location.href = `${baseUrl}/booking/view/view-booking`;
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