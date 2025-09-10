// -------------------------------
// Global State
// -------------------------------
const bookingState = {
    tests: [],   // {id, name, rate, qty, days, sample}
    discount: { type: "None", value: 0 },
    totals: { tests: 0, amount: 0, net: 0, reportingDate: "" }
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
});

// -------------------------------
// Dropdown Loaders
// -------------------------------
async function loadDropdowns() {
    try {
        myshowLoader();

        const [referredRes, testRes] = await Promise.all([
            axios.get(baseUrl + "/registrations/referred/list"),
            axios.get(baseUrl + "/registrations/test/list")
        ]);

        populateReferredDropdowns(referredRes.data || []);
        populateTestDropdown(testRes.data || []);

        console.log("✅ Dropdowns loaded successfully");
    } catch (err) {
        console.error("❌ Error loading dropdowns:", err);
        showToastMessage("error", "Failed to load dropdown data!");
    } finally {
        myhideLoader();
    }
}

function populateReferredDropdowns(data) {
    let doctors = data.filter(r => r.type === true);
    let nonDoctors = data.filter(r => r.type === false);

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
            existing.qty += 1;
        } else {
            let res = await axios.get(baseUrl + "/registrations/test-registration/" + testId);
            let test = res.data;

            bookingState.tests.push({
                id: test.id,
                name: test.test_name,
                rate: test.charges,
                qty: 1,
                days: parseInt(test.required_days) || 0,
                sample: test.sample_collection || "-"
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
    let totalTests = 0, totalAmount = 0, maxDays = 0;

    bookingState.tests.forEach(t => {
        totalTests += t.qty;
        totalAmount += t.qty * t.rate;
        maxDays = Math.max(maxDays, t.days);
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
                  <input type="number" class="form-control qty" data-id="${t.id}" value="${t.qty}" min="1">
                </td>
                <td>${t.rate}</td>
                <td>${t.qty * t.rate}</td>
                <td>${t.days}</td>
                <td>${t.sample}</td>
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
