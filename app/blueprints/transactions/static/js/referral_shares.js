$(document).ready(function () {
    // --- Utils & Config ---
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };
    
    const baseUrl = (window.baseUrl || "").replace(/\/$/, ""); 

    let referralTable = null;
    let editModal = new bootstrap.Modal(document.getElementById('editAmountModal'));

    // --- 1. Initialization ---
    initDates();
    loadReferrers(); 
    loadReferralData(); 

    // --- 2. Event Listeners ---
    $("#searchBtn").on("click", loadReferralData);
    $("#saveAmountBtn").on("click", submitAmountUpdate);

    // --- 3. Core Functions ---

    function initDates() {
        const fromEl = $("#from_date");
        const toEl = $("#to_date");
        if (!fromEl.val() || !toEl.val()) {
            let today = new Date();
            let start = new Date(); 
            start.setDate(today.getDate() - 30); // Default 30 days
            fromEl.val(formatDate(start));
            toEl.val(formatDate(today));
        }
    }

    function loadReferrers() {
        axios.get(baseUrl + "/registrations/referred/list")
            .then(res => {
                let options = `<option value="">-- All Referrers --</option>`;
                const list = Array.isArray(res.data) ? res.data : [];
                
                list.forEach(item => {
                    options += `<option value="${item.id}">${item.name}</option>`;
                });
                $("#referrer_select").html(options);

                $("#referrer_select").select2({
                    placeholder: "-- Search Referrer --",
                    allowClear: true,
                    width: '100%',
                    dropdownParent: $('#referrer_select').parent() 
                });
            })
            .catch(err => console.error("Error loading referrers:", err));
    }

    function loadReferralData() {
        myshowLoader();
        
        const params = {
            from_date: $("#from_date").val(),
            to_date: $("#to_date").val(),
            referred_id: $("#referrer_select").val()
        };

        const statusVal = $("#status_filter").val();
        if (statusVal !== "") {
            params.is_paid = statusVal; 
        }

        axios.get(baseUrl + "/booking/referral-shares/list", { params })
            .then((res) => {
                const rows = (res.data && Array.isArray(res.data)) ? res.data : (res.data.data || []); 
                renderTable(rows);
            })
            .catch((err) => {
                console.error("Failed to load shares:", err);
                showToastMessage("error", "Failed to load referral data");
                renderTable([]);
            })
            .finally(() => myhideLoader());
    }

    function renderTable(data) {
        if (referralTable) {
            referralTable.clear().rows.add(data).draw();
            return;
        }

        referralTable = $("#referral_table").DataTable({
            data: data,
            responsive: true,
            autoWidth: false,
            order: [[0, 'desc']], 
            columns: [
                { data: "booking_date", width: "12%" },
                { 
                    data: "booking_id", 
                    width: "10%",
                    render: function(data) { return `<span class="fw-bold text-secondary">#${data}</span>`; }
                },
                { data: "doctor_name" },
                { 
                    data: null, 
                    render: function(row) {
                        let tests = (row.test_list || []).join(", ");
                        return `<div>
                                  <strong>${row.patient_name}</strong><br>
                                  <small class="text-muted">${tests}</small>
                                </div>`;
                    }
                },
                // --- NEW COLUMN: Total Bill ---
                { 
                    data: "booking_amount", 
                    className: "text-end",
                    render: function(data) { return parseFloat(data).toFixed(2); }
                },
                { 
                    data: "share_amount", 
                    className: "text-end fw-bold",
                    render: function(data) { return parseFloat(data).toFixed(2); }
                },
                { 
                    data: "is_paid",
                    className: "text-center",
                    render: function(data, type, row) {
                        if(data) {
                            return `<div class="d-flex flex-column align-items-center">
                                        <span class="badge bg-success mb-1 py-1"><i class="bi bi-check-circle-fill"></i> PAID</span>
                                        <small class="text-muted" style="font-size:11px;">${row.paid_at || ''}</small>
                                    </div>`;
                        }
                        return `<span class="badge bg-warning text-dark">UNPAID</span>`;
                    }
                },
                {
                    data: null,
                    className: "text-center",
                    orderable: false,
                    render: function(data, type, row) {
                        if (row.is_paid) {
                            return `<button class="btn btn-sm btn-outline-danger" onclick="togglePayment(${row.share_id}, true)" title="Reverse Payment">
                                      <i class="bi bi-arrow-counterclockwise"></i> Reverse
                                    </button>`;
                        } else {
                            return `<div class="btn-group btn-group-sm">
                                      <button class="btn btn-success" onclick="togglePayment(${row.share_id}, false)" title="Mark as Paid">
                                        <i class="bi bi-cash-stack"></i> Pay
                                      </button>
                                      <button class="btn btn-outline-primary" onclick="openEditModal(${row.share_id}, ${row.share_amount})" title="Edit Amount">
                                        <i class="bi bi-pencil"></i>
                                      </button>
                                    </div>`;
                        }
                    }
                }
            ],
            dom: 'frtip', 
            language: { emptyTable: "No commissions found for this period" }
        });
    }

    // --- 4. Action Handlers ---

    window.togglePayment = function(shareId, isCurrentlyPaid) {
        
        // CASE 1: Reversing Payment (No Note Needed)
        if(isCurrentlyPaid) {
            Swal.fire({
                title: "Reverse Payment?",
                text: "This will mark the commission as UNPAID and remove the expense.",
                icon: "warning",
                showCancelButton: true,
                confirmButtonColor: "#dc3545",
                cancelButtonColor: "#6c757d",
                confirmButtonText: "Yes, Reverse it!"
            }).then((result) => {
                if (result.isConfirmed) {
                    performPaymentToggle(shareId, null);
                }
            });
            return;
        } 
        
        // CASE 2: Making Payment (Ask for Note)
        Swal.fire({
            title: "Confirm Payment",
            text: "Add a note for this expense (optional):",
            input: 'text',
            inputPlaceholder: "e.g. Paid via Check / Paid to Assistant",
            showCancelButton: true,
            confirmButtonText: "Pay Now",
            confirmButtonColor: "#198754",
            showLoaderOnConfirm: true,
            preConfirm: (note) => {
                return performPaymentToggle(shareId, note);
            },
            allowOutsideClick: () => !Swal.isLoading()
        });
    };

    function performPaymentToggle(shareId, note) {
        // Prepare Payload
        const payload = {};
        if (note) payload.description = note;

        // If triggered by Swal preConfirm, axios returns a promise that Swal waits for
        return axios.post(baseUrl + `/booking/referral-shares/${shareId}/toggle-payment`, payload)
            .then(res => {
                showToastMessage("success", res.data.message || "Status updated!");
                loadReferralData(); 
            })
            .catch(err => {
                let msg = err.response?.data?.error || "Transaction failed";
                showToastMessage("error", msg);
                // If inside Swal, this helps show the error
                Swal.showValidationMessage(`Request failed: ${msg}`);
            });
    }

    window.openEditModal = function(shareId, currentAmount) {
        $("#edit_share_id").val(shareId);
        $("#edit_share_amount").val(currentAmount);
        editModal.show();
    };

    function submitAmountUpdate() {
        const id = $("#edit_share_id").val();
        const amount = $("#edit_share_amount").val();

        if (amount < 0) {
            Swal.fire("Invalid Amount", "Amount cannot be negative", "error");
            return;
        }

        $("#saveAmountBtn").prop("disabled", true);
        
        axios.put(baseUrl + `/booking/referral-shares/${id}`, { amount: amount })
            .then(res => {
                showToastMessage("success", "Amount updated");
                editModal.hide();
                loadReferralData();
            })
            .catch(err => {
                let msg = err.response?.data?.error || "Update failed";
                showToastMessage("error", msg);
            })
            .finally(() => {
                $("#saveAmountBtn").prop("disabled", false);
            });
    }

    function formatDate(dateObj) {
        const d = new Date(dateObj);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }
});