$(document).ready(function () {
    // 1. Set Default Dates (Current Month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1); 
    
    $("#to_date").val(today.toISOString().split('T')[0]);
    $("#from_date").val(firstDay.toISOString().split('T')[0]);

    // 2. Load Data immediately
    getDuesList();

    // 3. Bind Search Button
    $("#searchBtn").on("click", function() {
        getDuesList();
    });

    // 4. Bind Confirm Payment Button
    $("#btnConfirmPayment").off("click").on("click", function() {
        submitClearDue();
    });

    // 5. Event Delegation for "Clear Due" Button
    $(document).on("click", ".btn-open-pay", function() {
        let bookingId = $(this).data("id");
        let dueAmount = $(this).data("due");

        openPayModal(bookingId, dueAmount);
    });
});

// =======================================================
// 🔥 FETCH DATA AND RENDER TABLE
// =======================================================
function getDuesList() {
    if (typeof myshowLoader === 'function') myshowLoader();

    let fromDate = $("#from_date").val();
    let toDate = $("#to_date").val();
    let status = $("#status_filter").val(); // <--- NEW: Get Status Filter

    if (!fromDate || !toDate) {
        if (typeof showToastMessage === 'function') showToastMessage("error", "Please select both dates");
        if (typeof myhideLoader === 'function') myhideLoader();
        return;
    }

    const params = new URLSearchParams();
    params.append('from_date', fromDate);
    params.append('to_date', toDate);
    // Only append status if it exists (defaults to 'unpaid' in backend if missing)
    if (status) params.append('status', status); 

    axios.get(`${baseUrl}/booking/dues?` + params.toString())
        .then(res => {
            let responseData = res.data; 
            let data = responseData.dues || [];
            let totalOutstanding = responseData.total_outstanding_amount || 0;

            let dtable = $("#duesTable").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 10,
                ordering: false,
                language: { emptyTable: "No records found for this period." }
            });

            dtable.clear();
            let rowsToAdd = [];

            $.each(data, function (i, item) {
                // A. Booking Info
                let bookingIdHtml = `<span class="fw-bold text-primary">#${item.booking_id}</span>`;
                
                // B. Patient Info
                let patientHtml = `
                    <div class="d-flex flex-column">
                        <span class="fw-bold">${item.patient_name}</span>
                        <small class="text-muted">MR: ${item.mr_no || '-'}</small>
                        <small class="text-muted"><i class="bi bi-telephone"></i> ${item.contact_no}</small>
                    </div>`;

                // C. Financials
                let totalHtml = parseFloat(item.total_amount).toFixed(2);
                let paidHtml = parseFloat(item.paid_amount).toFixed(2);
                let dueVal = parseFloat(item.due_amount);
                
                // D. Due Amount Badge (UPDATED LOGIC)
                let dueHtml = "";
                if (dueVal > 0.01) { // Tolerance for floating point
                    dueHtml = `<span class="badge badge-due p-2" style="font-size: 0.9rem;">
                                ${dueVal.toFixed(2)}
                               </span>`;
                } else {
                    dueHtml = `<span class="badge bg-success p-2">PAID</span>`;
                }

                // E. Action Button (UPDATED LOGIC)
                // Only show "Clear Due" button if there is actually a due amount
                let actionBtn = "";
                if (dueVal > 0.01) {
                    actionBtn = `
                        <button class="btn btn-sm btn-outline-danger shadow-sm btn-open-pay" 
                                data-id="${item.booking_id}" 
                                data-due="${item.due_amount}">
                            <i class="bi bi-cash-stack"></i> Clear Due
                        </button>`;
                } else {
                    // It is PAID. Check if we have a transaction ID to print a receipt.
                    if (item.last_transaction_id) {
                        actionBtn = `
                            <div class="d-flex align-items-center">
                               
                                <a href="${baseUrl}/booking/receipt/due/${item.last_transaction_id}" 
                                   target="_blank" 
                                   class="btn btn-sm btn-light border shadow-sm text-secondary" 
                                   title="Print Last Receipt">
                                    <i class="bi bi-printer-fill"></i>
                                </a>
                            </div>`;
                    } else {
                        // Fallback if no transaction record exists
                        actionBtn = `<span class="badge bg-success">PAID</span>`;
                    }
                }

                rowsToAdd.push([
                    bookingIdHtml,
                    patientHtml,
                    item.date || '-',
                    totalHtml,
                    paidHtml,
                    dueHtml,
                    actionBtn
                ]);
            });

            if (rowsToAdd.length > 0) dtable.rows.add(rowsToAdd);
            dtable.draw(false);

            $("#footer_total_due").text(parseFloat(totalOutstanding).toFixed(2));

        })
        .catch(err => {
            console.error("Error fetching dues:", err);
            let msg = err.response?.data?.error || "Failed to load data";
            if (typeof showToastMessage === 'function') showToastMessage("error", msg);
        })
        .finally(() => { 
            if (typeof myhideLoader === 'function') myhideLoader(); 
        });
}

// =======================================================
// 💰 OPEN PAYMENT MODAL
// =======================================================
function openPayModal(bookingId, dueAmount) {
    $("#pay_booking_id").val(bookingId);
    $("#display_due_amount").val(dueAmount); 
    $("#pay_amount").val(dueAmount); 
    $("#pay_amount").attr("max", dueAmount); 
    
    $("#pay_method").val("Cash");
    $("#clearDueModal").modal("show");
}

// =======================================================
// ✅ SUBMIT PAYMENT
// =======================================================
// Locate the submitClearDue function and update the success block

function submitClearDue() {
    let bookingId = $("#pay_booking_id").val();
    let amountToPay = parseFloat($("#pay_amount").val());
    let maxDue = parseFloat($("#display_due_amount").val());
    let paymentType = $("#pay_method").val();

    if (!amountToPay || amountToPay <= 0) {
        alert("Please enter a valid amount greater than 0.");
        return;
    }

    if (amountToPay > maxDue) {
        alert(`You cannot pay more than the due amount (${maxDue}).`);
        return;
    }

    let payload = {
        amount: amountToPay,
        payment_type: paymentType
    };

    if (typeof myshowLoader === 'function') myshowLoader();

    axios.post(`${baseUrl}/booking/clear-due/${bookingId}`, payload)
        .then(res => {
            if (typeof showToastMessage === 'function') showToastMessage("success", res.data.message);
            $("#clearDueModal").modal("hide");
            
            // --- NEW CODE STARTS HERE ---
            // Open the Receipt in a new tab/window
            if (res.data.transaction_id) {
                let receiptUrl = `${baseUrl}/booking/receipt/due/${res.data.transaction_id}`;
                window.open(receiptUrl, '_blank');
            }
            // --- NEW CODE ENDS HERE ---

            getDuesList(); // Refresh list to update status/amount
        })
        .catch(err => {
            console.error(err);
            let msg = err.response?.data?.error || "Payment failed.";
            if (typeof showToastMessage === 'function') showToastMessage("error", msg);
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
}