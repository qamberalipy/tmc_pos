// -------------------------------
// Global State
// -------------------------------
const bookingState = {
    tests: [],   // {id, name, rate, qty, days, sample, films}
    discount: { type: "None", value: 0 },
    totals: { tests: 0, amount: 0, net: 0, reportingDate: "", films: 0 }
};

// -------------------------------
// Initial Load
// -------------------------------
$(document).ready(function () {
    loadDropdowns();

    // Bind add test button
    $("#add_test_btn").on("click", function () {
        let testId = $("#select_test").val();
        addTestToState(testId);
    });

    // Bind discount changes
    $("#discount_type, #discount_value").on("input change", function () {
        bookingState.discount.type = $("#discount_type").val();
        bookingState.discount.value = parseFloat($("#discount_value").val()) || 0;
        recalcState();
        renderBooking();
    });

    // Bind receivable changes (dues calculation)
    $("#net_receivable").on("input", function () {
        handleReceivableChange();
    });

    // ============================================
    // Contact No Formatting (03XX XXXXXXX)
    // ============================================
    
    // 1. Auto-add '03' on focus if empty
    $("#contact_no").on("focus", function () {
        if ($(this).val().trim() === "") {
            $(this).val("03");
        }
    });

    // 2. Handle Input Masking (Digits Only, Max 11, Space after 4th)
    $("#contact_no").on("input", function () {
        let val = $(this).val();

        // Remove all non-numeric characters
        val = val.replace(/\D/g, '');

        // Ensure it always starts with 03 if there is data
        if (val.length > 0 && !val.startsWith("03")) {
             val = "03" + val; 
        }

        // Limit to 11 digits
        if (val.length > 11) {
            val = val.substring(0, 11);
        }

        // Add the space after the 4th digit
        if (val.length > 4) {
            val = val.substring(0, 4) + " " + val.substring(4);
        }

        // Update the field
        $(this).val(val);
    });

    // 3. Clean up on blur
    $("#contact_no").on("blur", function () {
        if ($(this).val() === "03") {
            $(this).val("");
        }
    });

    // ============================================
    // Auto-Select Gender based on Title
    // ============================================
    $("#patient_title").on("change", function () {
        let title = $(this).val();

        if (title === "mr") {
            $("#gender").val("male");
        } 
        else if (["mrs", "ms", "miss"].includes(title)) {
            $("#gender").val("female");
        }
    });

    // ============================================
    // Find Existing Patient Logic (Search & Fill)
    // ============================================

    // 1. Open Modal and Focus
    $("#btn_open_patient_search").on("click", function() {
        // Clear previous results
        $("#txt_patient_search").val("");
        $("#patient_results_table tbody").html('<tr><td colspan="5" class="text-center text-muted">Type something and search...</td></tr>');
        
        $("#patientSearchModal").modal("show");
        setTimeout(() => $("#txt_patient_search").focus(), 500);
    });

    // 2. Trigger Search on Enter Key
    $("#txt_patient_search").on("keypress", function(e) {
        if(e.which === 13) {
            $("#btn_do_search").click();
        }
    });

    // 3. Perform Search API Call
    $("#btn_do_search").on("click", async function() {
        let term = $("#txt_patient_search").val().trim();
        if(term.length < 2) {
            showToastMessage("error", "Please enter at least 2 characters");
            return;
        }

        try {
            myshowLoader();
            // Assumes route is exposed at /booking/search-patient
            let res = await axios.get(baseUrl + "/booking/search-patient", { params: { term: term } });
            let data = res.data; // Array of patients

            let $tbody = $("#patient_results_table tbody");
            $tbody.empty();

            if(!data || data.length === 0) {
                $tbody.append(`<tr><td colspan="5" class="text-center text-danger">No patients found.</td></tr>`);
            } else {
                data.forEach(p => {
                    let pMr = p.mr_no || "-";
                    let pName = p.patient_name || "-";
                    let pContact = p.contact_no || "-";
                    let pInfo = `${p.gender || '-'} / ${p.age || '-'}`;
                    
                    // Encode data to pass to button
                    let patientData = encodeURIComponent(JSON.stringify(p));

                    let row = `
                        <tr>
                            <td class="fw-bold">${pMr}</td>
                            <td>${pName}</td>
                            <td>${pContact}</td>
                            <td>${pInfo}</td>
                            <td>
                                <button class="btn btn-sm btn-primary select-patient-btn" data-patient="${patientData}">
                                    Select
                                </button>
                            </td>
                        </tr>
                    `;
                    $tbody.append(row);
                });
            }

        } catch(err) {
            console.error(err);
            showToastMessage("error", "Failed to search patient");
        } finally {
            myhideLoader();
        }
    });

    // 4. Handle "Select" Click
    $(document).on("click", ".select-patient-btn", function() {
        let rawData = decodeURIComponent($(this).data("patient"));
        let p = JSON.parse(rawData);

        // --- Auto Fill Fields ---
        
        // 1. MR No
        $("#mr_ref_no").val(p.mr_no);

        // 2. Name
        $("#patient_name").val(p.patient_name).removeClass("input-error");

        // 3. Contact (Trigger input event to format)
        if(p.contact_no) {
            $("#contact_no").val(p.contact_no).trigger("input").removeClass("input-error");
        }

        // 4. Gender & Title
        if(p.gender) {
            let g = p.gender.toLowerCase();
            $("#gender").val(g).trigger("change"); 
            
            if(g === 'male') $("#patient_title").val("mr");
            else if(g === 'female') $("#patient_title").val("mrs");
        }

        // 5. Age
        if(p.age) {
            $("#age").val(p.age).removeClass("input-error");
        }

        // Close Modal & Show Success
        $("#patientSearchModal").modal("hide");
        showToastMessage("success", "Patient details auto-filled!");
    });

    // ============================================
    // Add Referred Functionality
    // ============================================

    // 1. Open Modal for Doctor
    $("#btn_add_doctor").on("click", function () {
        openReferredModal(true); // true = is_doctor
    });

    // 2. Open Modal for Non-Doctor
    $("#btn_add_non_doctor").on("click", function () {
        openReferredModal(false); // false = not doctor
    });

    // 3. Remove error class when user types
    $("#new_ref_name").on("input", function () {
        if ($(this).val().trim() !== "") {
            $(this).removeClass("input-error");
        }
    });

    // 4. Save New Referred
    $("#save_referred_btn").on("click", async function () {
        let name = $("#new_ref_name").val().trim();
        let isDoctor = $("#new_ref_is_doctor").val() === "true";

        // UX: Validation
        if (!name) {
            $("#new_ref_name").addClass("input-error");
            $("#new_ref_name").focus();
            return;
        }

        try {
            myshowLoader();

            let payload = {
                name: name,
                is_doctor: isDoctor,
                location: "Main Branch",
                specialization: "General",
                contact_no: ""
            };

            let res = await axios.post(baseUrl + "/registrations/referred", payload);

            if (res.status === 201 || res.status === 200) {
                let newId = res.data.id;
                let newName = name;

                showToastMessage("success", "Added successfully!");
                $("#addReferredModal").modal("hide");

                let targetSelect = isDoctor ? "#referred_dr" : "#referred_non_dr";
                let newOption = new Option(newName, newId, true, true);
                $(targetSelect).append(newOption).trigger('change');
            }
        } catch (err) {
            console.error("Failed to add referred:", err);
            let msg = err.response?.data?.error || "Failed to add record.";
            showToastMessage("error", msg);
        } finally {
            myhideLoader();
        }
    });
});

// Helper to open modal and set state
function openReferredModal(isDoctor) {
    $("#new_ref_name").val("").removeClass("input-error");
    $("#new_ref_is_doctor").val(isDoctor);

    let title = isDoctor ? "Add New Doctor" : "Add New Referrer";
    $("#referredModalLabel").text(title);

    $("#addReferredModal").modal("show");
    setTimeout(() => $("#new_ref_name").focus(), 500);
}

// -------------------------------
// Dropdown Loaders
// -------------------------------
async function loadDropdowns() {
    try {
        myshowLoader();

        const [referredRes, testRes] = await Promise.all([
            axios.get(baseUrl + "/registrations/referred"), 
            axios.get(baseUrl + "/registrations/test/list")
        ]);

        populateReferredDropdowns(referredRes.data || []);
        populateTestDropdown(testRes.data || []);

    } catch (err) {
        console.error("❌ Error loading dropdowns:", err);
        showToastMessage("error", "Failed to load dropdown data!");
    } finally {
        myhideLoader();
    }
}

function populateReferredDropdowns(data) {
    let doctors = data.filter(r => r.is_doctor == true);
    let nonDoctors = data.filter(r => r.is_doctor == false);

    let $doctorSelect = $("#referred_dr");
    let $nonDoctorSelect = $("#referred_non_dr");

    $doctorSelect.empty().append(`<option value="">-- Select Doctor --</option>`);
    $nonDoctorSelect.empty().append(`<option value="">-- Select Non-Doctor --</option>`);

    doctors.forEach(d => $doctorSelect.append(`<option value="${d.id}">${d.name}</option>`));
    nonDoctors.forEach(nd => $nonDoctorSelect.append(`<option value="${nd.id}">${nd.name}</option>`));
}

function populateTestDropdown(data) {
    let $testSelect = $("#select_test");
    $testSelect.empty().append(`<option value="">-- Select Test --</option>`);

    data.forEach(t => {
        $testSelect.append(`<option value="${t.id}">${t.test_name}</option>`);
    });

    $testSelect.select2({
        theme: "bootstrap-5",
        placeholder: "Search or select a test",
        allowClear: true,
        width: '100%'
    });
}

// -------------------------------
// Booking State Management
// -------------------------------
async function addTestToState(testId) {
    if (!testId) {
        return showToastMessage("warning", "Please select a test first!");
    }

    try {
        myshowLoader();

        let existing = bookingState.tests.find(t => t.id == testId);
        if (existing) {
            showToastMessage("warning", `${existing.name} already added!`);
        } else {
            let res = await axios.get(baseUrl + "/registrations/test-registration/" + testId);
            let test = res.data;

            bookingState.tests.push({
                id: test.id,
                name: test.test_name,
                rate: test.charges,
                qty: 1,
                days: parseInt(test.required_days) || 0,
                sample: test.sample_collection || "-",
                films: parseInt(test.no_of_films) || 0,
            });
        }

        recalcState();
        renderBooking();
        showToastMessage("success", "Test added successfully!");
    } catch (err) {
        console.error("❌ Error fetching test:", err);
        showToastMessage("error", "Failed to fetch test details!");
    } finally {
        myhideLoader();
    }
}

function recalcState() {
    let totalTests = 0, totalAmount = 0, maxDays = 0, totalFilms = 0;

    bookingState.tests.forEach(t => {
        totalTests += t.qty;
        totalAmount += t.qty * t.rate;
        maxDays = Math.max(maxDays, t.days);
        totalFilms += t.qty * t.films;
    });

    let net = totalAmount;
    if (bookingState.discount.type === "Percentage") {
        net -= totalAmount * bookingState.discount.value / 100;
    } else if (bookingState.discount.type === "Amount") {
        net -= bookingState.discount.value;
    }
    if (net < 0) net = 0;

    let reportingDate = new Date();
    reportingDate.setDate(reportingDate.getDate() + maxDays);

    bookingState.totals = {
        tests: totalTests,
        amount: totalAmount,
        net: net,
        films: totalFilms,
        reportingDate: reportingDate.toISOString().split("T")[0]
    };
}

function renderBooking() {
    let $tbody = $("#test_booking_table tbody");
    $tbody.empty();

    // Test rows
    bookingState.tests.forEach(t => {
        $tbody.append(`
            <tr>
                <td>${t.name}</td>
                <td>
                  <input type="number" class="form-control qty" data-id="${t.id}" value="${t.qty}" min="1" disabled>
                </td>
                <td>${t.rate}</td>
                <td>${t.qty * t.rate}</td>
                <td>${t.days}</td>
                <td>${t.sample}</td>
                <td class="d-none">${t.films * t.qty}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-danger remove-test" data-id="${t.id}">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
            </tr>
        `);
    });

    // Summary row
    $tbody.append(`
        <tr id="final_fields">
            <td>No of test: <span>${bookingState.totals.tests}</span></td>
            <td></td>
            <td></td>
            <td>Total Amount: <span>${bookingState.totals.amount}</span></td>
            <td>Reporting Date: <span>${bookingState.totals.reportingDate}</span></td>
            <td class="d-none">Total Films: <span>${bookingState.totals.films}</span></td>
            <td colspan="2"></td>
        </tr>
    `);

    // Set net amount
    $("#net_amount").val(bookingState.totals.net);

    // Reset receivable + dues whenever recalculated
    $("#net_receivable").val(bookingState.totals.net);
    $("#dues").val("").prop("disabled", true);

    // Bind qty change
    $(".qty").on("input", function () {
        let id = parseInt($(this).data("id"));
        let item = bookingState.tests.find(t => t.id === id);
        item.qty = parseInt($(this).val()) || 1;
        recalcState();
        renderBooking();
    });

    // Bind remove test
    $(".remove-test").on("click", function () {
        let id = parseInt($(this).data("id"));
        bookingState.tests = bookingState.tests.filter(t => t.id !== id);
        recalcState();
        renderBooking();
    });
}

// -------------------------------
// Dues Calculation
// -------------------------------
function handleReceivableChange() {
    let net = bookingState.totals.net;
    let receivable = parseFloat($("#net_receivable").val()) || 0;
    if (receivable > net) receivable = net;

    $("#net_receivable").val(receivable);

    let dues = net - receivable;
    if (dues > 0) {
        $("#dues").val(dues).prop("disabled", false);
    } else {
        $("#dues").val("").prop("disabled", true);
    }
}


// -------------------------------
// Submit Handler
// -------------------------------
$(document).on("click", "#close_receipt_btn", function () {
    $("#receipt_box").fadeOut(400);
});
// 1. Auto-remove error when user types or changes value
$(document).on("input change", ".input-error", function () {
    $(this).removeClass("input-error");
});

// 2. Submit Handler with Error Highlighting
$(document).on("click", "#submit_booking", async function () {
    try {
        // Clear previous errors
        $(".input-error").removeClass("input-error");

        myshowLoader();

        let isValid = true; 

        // --- 1. Validate Share Logic ---
        let give_share_to = null;
        let shareType = $("input[name='shareType']:checked").val();

        if (shareType === "doctor") {
            give_share_to = $("#referred_dr").val();
            if (!give_share_to) {
                $("#referred_dr").addClass("input-error").focus();
                $("#referred_dr").next(".select2-container").find(".select2-selection").addClass("border-danger");
                showToastMessage("error", "Please select a doctor to give share!");
                myhideLoader();
                return;
            }
        } else if (shareType === "nonDoctor") {
            give_share_to = $("#referred_non_dr").val();
            if (!give_share_to) {
                $("#referred_non_dr").addClass("input-error").focus();
                $("#referred_non_dr").next(".select2-container").find(".select2-selection").addClass("border-danger");
                showToastMessage("error", "Please select a Non-Doctor to give share!");
                myhideLoader();
                return;
            }
        }

        // --- 2. Collect Data ---
        const payload = {
            mr_no: $("#mr_ref_no").val().trim() || null, // Will use auto-gen if null
            patient_name: $("#patient_name").val().trim(),
            gender: $("#gender").val(),
            age: $("#age").val() ? parseInt($("#age").val()) : null,
            contact_no: $("#contact_no").val().trim(),

            referred_dr: $("#referred_dr").val() || null,
            referred_non_dr: $("#referred_non_dr").val() || null,
            give_share_to: give_share_to,

            discount_type: $("#discount_type").val(),
            discount_value: parseFloat($("#discount_value").val()) || 0,
            net_receivable: parseFloat($("#net_receivable").val()) || 0,
            payment_type: $("#payment_type").val() || "Cash",
            paid_amount: parseFloat($("#net_receivable").val()) || 0,
            due_amount: parseFloat($("#dues").val()) || 0,
            total_no_of_films: bookingState.totals.films,
            tests: bookingState.tests.map(t => ({
                test_id: t.id,
                quantity: t.qty,
                amount: t.qty * t.rate,
                required_days: t.days,
                sample_to_follow: t.sample,
                no_of_films: t.films,
                reporting_date: bookingState.totals.reportingDate
            }))
        };

        // --- 3. Validate Required Fields & Highlight ---

        if (!payload.patient_name) {
            $("#patient_name").addClass("input-error");
            isValid = false;
        }

        if (!payload.gender) {
            $("#gender").addClass("input-error");
            isValid = false;
        }
        
        if (!payload.age || isNaN(payload.age) || payload.age <= 0) {
            $("#age").addClass("input-error");
            isValid = false;
        }

        if (!payload.contact_no) {
            $("#contact_no").addClass("input-error");
            isValid = false;
        }

        if (payload.net_receivable === "" || isNaN(payload.net_receivable)) {
            $("#net_receivable").addClass("input-error");
            isValid = false;
        }

        // Stop if validation failed
        if (!isValid) {
            showToastMessage("error", "Please fill all required fields!");
            $('html, body').animate({
                scrollTop: $(".input-error").first().offset().top - 100
            }, 500);

            myhideLoader();
            return;
        }

        // --- 4. POST to API ---
        payload.gender = capitalizeFirstLetter(payload.gender);

        const res = await axios.post(baseUrl + "/booking/create/", payload, {
            headers: { "Content-Type": "application/json" }
        });

        var responseData = res.data[0];
        var responseStatus = res.data[1];

        if (responseStatus === 201) {
            showToastMessage("success", responseData.message || "Booking created!");
            $("#receipt_box").fadeIn(100);

            $("#booking_id").text(responseData.booking_id);
            $("#print_receipt_btn").attr("href", baseUrl + "/booking/receipt/" + responseData.booking_id);

            $("html, body").animate({ scrollTop: 0 }, 500);
            $(".select2-selection").removeClass("border-danger");

            resetBookingForm();
        } else {
            showToastMessage("error", "Unexpected response from server!");
        }

    } catch (err) {
        console.error("❌ Booking submission failed:", err);
        let msg = err.response?.data?.error || "Failed to create booking!";
        showToastMessage("error", msg);
    } finally {
        myhideLoader();
    }
});

// -------------------------------
// Helpers
// -------------------------------
function capitalizeFirstLetter(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function resetBookingForm() {
    // Clear MR No so backend generates a new one for next patient
    $("#mr_ref_no").val(""); 
    
    $("#patient_name, #age, #contact_no, #discount_value, #net_receivable, #dues").val("");
    $("#gender").val("male");
    $("#discount_type").val("None");
    $("#payment_type").val("Cash");
    $("input[name='shareType'][value='nobody']").prop("checked", true);

    bookingState.tests = [];
    recalcState();
    renderBooking();
}function resetBookingForm() {
    // 1. Text Fields
    $("#mr_ref_no").val(""); 
    $("#patient_name, #age, #contact_no, #discount_value, #net_receivable, #dues, #txt_patient_search").val("");
    
    // 2. Standard Dropdowns (Gender, Age Type, Discount, Payment)
    $("#gender").val("male");
    $("#patient_title").val("mr"); // Reset Title
    $("#age_type").val("years");   // Reset Age Type to default
    $("#discount_type").val("None");
    $("#payment_type").val("Cash");

    // 3. Referred Dropdowns (Doctor & Non-Doctor)
    $("#referred_dr").val("").trigger("change");
    $("#referred_non_dr").val("").trigger("change");

    // 4. Test Select Dropdown (Important for Select2)
    $("#select_test").val("").trigger("change");

    // 5. Radio Buttons (Share Type)
    $("input[name='shareType'][value='nobody']").prop("checked", true);

    // 6. Global State Reset
    $(".input-error").removeClass("input-error"); // Remove any red borders
    
    // 7. Reset Totals Display
    $("#net_amount").val("0"); 
    
    bookingState.tests = [];
    recalcState();
    renderBooking();
}