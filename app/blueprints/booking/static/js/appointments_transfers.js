$(document).ready(function () {
    // 1. Initial Dates (Last 30 Days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formatDate = d => {
        let year = d.getFullYear();
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (!$("#from_date").val()) $("#from_date").val(formatDate(thirtyDaysAgo));
    if (!$("#to_date").val()) $("#to_date").val(formatDate(today));

    let dtable = null;

    // Track tab counts locally from fetched datasets (no extra API calls)
    let tabCounts = { all: 0, appt: 0, trans: 0 };

    function updateTabBadges() {
        $("#count_all").text(tabCounts.all);
        $("#count_appt").text(tabCounts.appt);
        $("#count_trans").text(tabCounts.trans);
    }

    function initTooltips() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.map(function (el) {
                return new bootstrap.Tooltip(el);
            });
        }
    }

    function getFilterParams() {
        let params = {
            type: $("#filter_type").val() || 'All',
            from_date: $("#from_date").val() || '',
            to_date: $("#to_date").val() || '',
            search: ($("#search_input").val() || '').trim()
        };
        let branchVal = $("#filter_branch").val();
        if (branchVal && branchVal !== 'All') {
            params.branch_id = branchVal;
        }
        return params;
    }

    // 2. Fetch and render data client-side in place (no navigation)
    function loadData() {
        if (typeof myshowLoader === 'function') myshowLoader();
        let params = getFilterParams();

        axios.get(`${baseUrl}/booking/appointments-transfers/data`, { params: params })
        .then(res => {
            let data = res.data || [];

            // CRITICAL: Destroy DataTable if already initialized before modifying DOM
            if ($.fn.DataTable.isDataTable('#appointments_transfers_table')) {
                $('#appointments_transfers_table').DataTable().destroy();
                dtable = null;
            }

            const tbody = $("#appointments_transfers_body");
            tbody.empty();

            // Update live tab counts from fetched dataset
            let activeFilterType = ($("#filter_type").val() || 'All').trim().toLowerCase();
            if (activeFilterType === 'all') {
                tabCounts.all = data.length;
                tabCounts.appt = data.filter(r => r.is_appointment).length;
                tabCounts.trans = data.filter(r => r.is_transferred_in).length;
            } else if (activeFilterType === 'appointment') {
                tabCounts.appt = data.length;
            } else if (activeFilterType === 'transferred') {
                tabCounts.trans = data.length;
            }
            updateTabBadges();

            if (data.length === 0) {
                tbody.html(`
                    <tr>
                        <td colspan="8" class="text-center py-5 border-0">
                            <div class="d-flex flex-column align-items-center justify-content-center py-3">
                                <div class="empty-state-icon-circle mb-3">
                                    <i class="bi bi-calendar-x text-secondary" style="font-size: 2rem; opacity: 0.6;"></i>
                                </div>
                                <h6 class="fw-bold text-dark mb-1">No appointments or transfers found</h6>
                                <p class="text-muted small mb-3 text-center" style="max-width: 380px;">
                                    No records match your active filter criteria. Try adjusting the date range, branch selection, or search query.
                                </p>
                                <button type="button" class="btn btn-sm btn-outline-secondary px-3" id="emptyResetBtn">
                                    <i class="bi bi-arrow-counterclockwise me-1"></i> Reset Filters
                                </button>
                            </div>
                        </td>
                    </tr>
                `);
                $("#tableRecordCount").text("0 records found");
                return;
            }

            $("#tableRecordCount").text(`${data.length} record(s) found`);

            data.forEach(function (r) {
                // Type badge: softer pill shape, subordinate origin branch text
                let typeBadge = '';
                if (r.type === 'both') {
                    typeBadge = `<div class="d-flex flex-column align-items-center gap-1">` +
                                `<span class="badge badge-pill-soft badge-appt-soft"><i class="bi bi-calendar-event"></i> Appointment</span>` +
                                `<span class="badge badge-pill-soft badge-trans-soft"><i class="bi bi-box-arrow-in-right"></i> Transferred In</span>` +
                                `</div>`;
                } else if (r.type === 'Appointment') {
                    typeBadge = `<span class="badge badge-pill-soft badge-appt-soft"><i class="bi bi-calendar-event"></i> Appointment</span>`;
                } else if (r.type === 'Transferred In') {
                    let fromNote = (r.transfer_log && r.transfer_log.from_branch_name)
                        ? `<div class="origin-branch-text"><i class="bi bi-geo-alt opacity-75"></i> From: ${r.transfer_log.from_branch_name}</div>`
                        : '';
                    typeBadge = `<span class="badge badge-pill-soft badge-trans-soft"><i class="bi bi-box-arrow-in-right"></i> Transferred In</span>${fromNote}`;
                } else {
                    typeBadge = `<span class="badge badge-pill-soft bg-light text-secondary border">${r.type || 'Normal'}</span>`;
                }

                // Amount breakdown: compact 3-line stack with muted labels vs bold colored values
                let totalAmount = parseFloat(r.total_amount || 0).toFixed(2);
                let paidAmount = parseFloat(r.paid_amount || 0).toFixed(2);
                let dueVal = parseFloat(r.due_amount || 0);
                let dueAmount = dueVal.toFixed(2);
                let dueValClass = dueVal > 0 ? 'text-danger' : 'text-muted';

                let amountHtml = `
                    <div class="amount-stack">
                        <div class="d-flex justify-content-between align-items-center gap-2">
                            <span class="amount-stack-label">Total:</span>
                            <span class="amount-stack-val text-dark">Rs. ${totalAmount}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center gap-2">
                            <span class="amount-stack-label">Paid:</span>
                            <span class="amount-stack-val text-success">Rs. ${paidAmount}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center gap-2">
                            <span class="amount-stack-label">Due:</span>
                            <span class="amount-stack-val ${dueValClass}">Rs. ${dueAmount}</span>
                        </div>
                    </div>`;

                // Status badge: consistent sizing and padding with Type badge
                let statusBadge = '';
                if (r.status === 'Paid') {
                    statusBadge = `<span class="badge badge-pill-soft status-pill-paid"><i class="bi bi-check-circle-fill" style="font-size: 0.65rem;"></i> Paid</span>`;
                } else if (r.status === 'Partial') {
                    statusBadge = `<span class="badge badge-pill-soft status-pill-partial"><i class="bi bi-pie-chart-fill" style="font-size: 0.65rem;"></i> Partial</span>`;
                } else {
                    statusBadge = `<span class="badge badge-pill-soft status-pill-unpaid"><i class="bi bi-exclamation-circle-fill" style="font-size: 0.65rem;"></i> Unpaid</span>`;
                }

                // Action buttons: View link to view_booking + Convert button
                // Terminal transfer rule: is_transferred_in bookings NEVER show convert actions
                let convertBtnHtml = '';
                if (r.is_appointment && !r.is_transferred_in) {
                    convertBtnHtml = `
                        <button type="button" class="btn btn-sm btn-outline-success convert-appointment-btn" 
                                data-id="${r.booking_id}" 
                                title="Confirm Appointment → Normal Booking (deducts films)">
                            <i class="bi bi-calendar2-check me-1"></i>Convert
                        </button>`;
                }

                let viewBtnHtml = `
                    <a href="${baseUrl}/booking/view/view-booking" 
                       class="btn btn-sm btn-outline-primary" 
                       title="View Booking Details">
                        <i class="bi bi-eye me-1"></i>View
                    </a>`;

                let rowHtml = `
                    <tr>
                        <td><span class="badge bg-light text-dark border font-monospace px-2 py-1">${r.mr_no || 'N/A'}</span></td>
                        <td>
                            <div class="fw-bold text-dark">${r.patient_name || '—'}</div>
                            <div class="text-muted small">${r.contact_no || ''} ${r.age ? '(' + r.age + ' ' + (r.age_unit || 'Y') + ')' : ''}</div>
                        </td>
                        <td><span class="badge bg-secondary-subtle text-secondary-emphasis border px-2 py-1">${r.branch_name || 'N/A'}</span></td>
                        <td class="text-center">${typeBadge}</td>
                        <td><span class="small text-secondary">${r.date || '—'}</span></td>
                        <td>${amountHtml}</td>
                        <td class="text-center">${statusBadge}</td>
                        <td class="text-center">
                            <div class="d-flex justify-content-center align-items-center gap-1 action-btn-group" style="min-width: 140px;">
                                ${viewBtnHtml}
                                ${convertBtnHtml}
                            </div>
                        </td>
                    </tr>`;

                tbody.append(rowHtml);
            });

            // Initialize DataTable only AFTER tbody is fully populated
            dtable = $("#appointments_transfers_table").DataTable({
                destroy: true,
                responsive: true,
                pageLength: 20,
                ordering: true,
                order: [[4, 'desc']], // Sort by Date descending
                lengthChange: false,
                language: {
                    emptyTable: `
                        <div class="py-4 text-center">
                            <i class="bi bi-calendar-x text-muted d-block mb-2" style="font-size: 2rem; opacity: 0.5;"></i>
                            <h6 class="fw-bold text-secondary mb-1">No records found</h6>
                            <div class="text-muted small">No appointments or transfers match the selected filters.</div>
                        </div>
                    `
                }
            });
        })
        .catch(err => {
            console.error("Error loading appointments and transfers:", err);
            let msg = err.response?.data?.error || "Failed to load appointments and transfers.";
            if (typeof showToastMessage === 'function') {
                showToastMessage("error", msg);
            } else {
                alert(msg);
            }
        })
        .finally(() => {
            if (typeof myhideLoader === 'function') myhideLoader();
        });
    }

    // 3. Event Listeners for Filters (ALL call loadData() with preventDefault)

    // Type Tabs
    $(document).on("click", ".type-tab", function (e) {
        e.preventDefault();
        $(".type-tab").removeClass("active");
        $(this).addClass("active");
        $("#filter_type").val($(this).data("type"));
        loadData();
    });

    // Branch Dropdown
    $("#filter_branch").on("change", function (e) {
        e.preventDefault();
        loadData();
    });

    // Date Inputs
    $("#from_date, #to_date").on("change", function (e) {
        e.preventDefault();
        loadData();
    });

    // Search Button
    $("#searchBtn").on("click", function (e) {
        e.preventDefault();
        loadData();
    });

    // Reset Filters Button
    $(document).on("click", "#resetBtn, #emptyResetBtn", function (e) {
        e.preventDefault();
        $("#from_date").val(formatDate(thirtyDaysAgo));
        $("#to_date").val(formatDate(today));
        $("#search_input").val("");

        let $branch = $("#filter_branch");
        if ($branch.length) {
            let defaultBranchVal = $branch.find("option:first").val();
            $branch.val(defaultBranchVal);
        }

        $(".type-tab").removeClass("active");
        $(".type-tab[data-type='All']").addClass("active");
        $("#filter_type").val("All");

        loadData();
    });

    // Search Input (Enter key)
    $("#search_input").on("keypress", function (e) {
        if (e.which === 13) {
            e.preventDefault();
            loadData();
        }
    });

    // 4. Convert Appointment Action (POSTs to /booking/convert_booking)
    $(document).on("click", ".convert-appointment-btn", function (e) {
        e.preventDefault();
        const bookingId = $(this).data("id");
        if (!bookingId) return;

        Swal.fire({
            title: "Confirm Appointment?",
            text: "Convert this appointment to a confirmed booking? Films will be deducted from inventory now.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#198754",
            confirmButtonText: "Yes, Confirm Booking",
            showLoaderOnConfirm: true,
            preConfirm: () => {
                return axios.post(`${baseUrl}/booking/convert_booking`, {
                    booking_id: bookingId,
                    target_type: "normal"
                })
                .then(res => res.data)
                .catch(err => {
                    let errMsg = err.response?.data?.error || err.message || "Conversion failed";
                    Swal.showValidationMessage(`Conversion failed: ${errMsg}`);
                });
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: "Success",
                    text: result.value?.message || "Appointment confirmed as a booking.",
                    icon: "success",
                    timer: 2000,
                    showConfirmButton: false
                });
                loadData();
            }
        });
    });

    // =============================================================
    // 5. EXCEL EXPORT (SheetJS - copied from film_usage_log.js)
    // =============================================================
    $("#exportExcel").on("click", function (e) {
        e.preventDefault();
        let table = document.getElementById("appointments_transfers_table");
        if (!table) return;
        let wb = XLSX.utils.table_to_book(table, { sheet: "Appointments & Transfers" });
        XLSX.writeFile(wb, "Appointments_and_Transfers.xlsx");
    });

    // =============================================================
    // 6. PDF EXPORT (jsPDF + autoTable - copied from film_usage_log.js)
    // =============================================================
    $("#exportPDF").on("click", function (e) {
        e.preventDefault();
        const { jsPDF } = window.jspdf;
        let doc = new jsPDF("landscape");

        doc.setFontSize(14);
        doc.text("Appointments & Transfers Report", 14, 15);

        doc.autoTable({
            html: "#appointments_transfers_table",
            startY: 20,
            theme: "grid",
            styles: { fontSize: 8 },
            headStyles: { fillColor: [31, 73, 125] }
        });

        doc.save("Appointments_and_Transfers.pdf");
    });

    // 7. Initial Setup & Load on DOM ready
    initTooltips();
    loadData();
});

