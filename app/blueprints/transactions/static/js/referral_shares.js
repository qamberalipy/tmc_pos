$(document).ready(function () {
    // --- Utils & Config ---
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };
    
    // Ensure baseUrl is defined
    const baseUrl = window.baseUrl || ""; 

    let referralTable = null;
    let editModal = new bootstrap.Modal(document.getElementById('editAmountModal'));

    // --- 1. Initialization ---
    initDates();
    loadReferrers();
    loadReferralData(); // Load initial data

    // --- 2. Event Listeners ---
    
    // Quick Range Buttons
    $(".range-btn").on("click", function () {
        const range = $(this).data("range");
        const today = new Date();
        let fromDate, toDate = formatDate(today);
        
        if (range === "today") {
            fromDate = toDate;
        } else {
            let d = new Date();
            d.setDate(today.getDate() - parseInt(range));
            fromDate = formatDate(d);
        }
        $("#from_date").val(fromDate);
        $("#to_date").val(toDate);
        loadReferralData();
    });

    // Search & Filter
    $("#searchBtn").on("click", loadReferralData);
    $("#referrer_select").on("change", loadReferralData);

    // Save Edit Amount
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

    // Load Dropdown for Doctors
    function loadReferrers() {
        axios.get(baseUrl + "/registrations/referred/list")
            .then(res => {
                let options = `<option value="">-- All Referrers --</option>`;
                const list = Array.isArray(res.data) ? res.data : [];
                
                list.forEach(item => {
                    options += `<option value="${item.id}">${item.name}</option>`;
                });
                $("#referrer_select").html(options);
            })
            .catch(err => console.error("Error loading referrers:", err));
    }

    // Main Data Loader
    function loadReferralData() {
        myshowLoader();
        const params = {
            from_date: $("#from_date").val(),
            to_date: $("#to_date").val(),
            referred_id: $("#referrer_select").val()
        };

        axios.get(baseUrl + "/booking/referral-shares/list", { params })
            .then((res) => {
                const rows = (res.data && Array.isArray(res.data)) ? res.data : [];
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
            order: [[0, 'desc']], // Sort by Date Desc
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
                        let tests = row.test_list.join(", ");
                        return `<div>
                                  <strong>${row.patient_name}</strong><br>
                                  <small class="text-muted">${tests}</small>
                                </div>`;
                    }
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
                        if(data) return `<span class="badge-paid"><i class="bi bi-check-circle-fill"></i> PAID</span><br><small class="text-muted" style="font-size:10px">${row.paid_at || ''}</small>`;
                        return `<span class="badge-unpaid">UNPAID</span>`;
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
            // Removed 'B' from dom, removed buttons array
            dom: 'frtip', 
            language: { emptyTable: "No commissions found for this period" },
            
            // Calculate Total in Footer
            footerCallback: function (row, data, start, end, display) {
                let api = this.api();
                let intVal = function (i) {
                    return typeof i === 'string' ? i.replace(/[\$,]/g, '') * 1 : typeof i === 'number' ? i : 0;
                };

                let total = api.column(4, { page: 'current' }).data().reduce(function (a, b) {
                    return intVal(a) + intVal(b);
                }, 0);

                $(api.column(4).footer()).html(total.toFixed(2));
            }
        });
    }

    // --- 4. Action Handlers ---

    // Toggle Payment (Pay or Reverse)
    window.togglePayment = function(shareId, isCurrentlyPaid) {
        let confirmMsg = isCurrentlyPaid 
            ? "Are you sure you want to REVERSE this payment? This will delete the expense record." 
            : "Confirm payment for this referral share? An expense will be created.";

        if(!confirm(confirmMsg)) return;

        myshowLoader();
        axios.post(baseUrl + `/booking/referral-shares/${shareId}/toggle-payment`)
            .then(res => {
                showToastMessage("success", res.data.message);
                loadReferralData(); // Refresh table
            })
            .catch(err => {
                let msg = err.response?.data?.error || "Transaction failed";
                showToastMessage("error", msg);
            })
            .finally(() => myhideLoader());
    };

    // Open Edit Modal
    window.openEditModal = function(shareId, currentAmount) {
        $("#edit_share_id").val(shareId);
        $("#edit_share_amount").val(currentAmount);
        editModal.show();
    };

    // Submit Edit Amount
    function submitAmountUpdate() {
        const id = $("#edit_share_id").val();
        const amount = $("#edit_share_amount").val();

        if (amount < 0) {
            alert("Amount cannot be negative");
            return;
        }

        $("#saveAmountBtn").prop("disabled", true);
        
        axios.put(baseUrl + `/booking/referral-shares/${id}`, { amount: amount })
            .then(res => {
                showToastMessage("success", "Amount updated");
                editModal.hide();
                loadReferralData(); // Refresh table
            })
            .catch(err => {
                let msg = err.response?.data?.error || "Update failed";
                alert(msg);
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