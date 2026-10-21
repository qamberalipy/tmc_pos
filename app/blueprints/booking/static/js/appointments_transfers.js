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

            if (data.length === 0) {
                tbody.html(`<tr><td colspan="8" class="text-center text-muted py-4">No appointments or transferred bookings found for the selected period.</td></tr>`);
                $("#tableRecordCount").text("0 records found");
                return;
            }

            $("#tableRecordCount").text(`${data.length} record(s) found`);

            data.forEach(function (r) {
                // Type badge (Appointment / Transferred In — pure span, NO links to prevent navigation)
                let typeBadge = '';
                if (r.type === 'both') {
                    typeBadge = `<span class="badge bg-info text-white me-1">Appointment</span>` +
                                `<span class="badge bg-warning text-dark"><i class="bi bi-box-arrow-in-right"></i> Transferred In</span>`;
                } else if (r.type === 'Appointment') {
                    typeBadge = `<span class="badge bg-info text-white">Appointment</span>`;
                } else if (r.type === 'Transferred In') {
                    let fromNote = (r.transfer_log && r.transfer_log.from_branch_name)
                        ? `<div class="text-muted" style="font-size: 0.7rem;">From: ${r.transfer_log.from_branch_name}</div>`
                        : '';
                    typeBadge = `<span class="badge bg-warning text-dark"><i class="bi bi-box-arrow-in-right"></i> Transferred In</span>${fromNote}`;
                } else {
                    typeBadge = `<span class="badge bg-secondary">${r.type || 'Normal'}</span>`;
                }

                // Amount breakdown
                let totalAmount = parseFloat(r.total_amount || 0).toFixed(2);
                let paidAmount = parseFloat(r.paid_amount || 0).toFixed(2);
                let dueAmount = parseFloat(r.due_amount || 0).toFixed(2);
                let dueClass = parseFloat(r.due_amount || 0) > 0 ? 'text-danger fw-bold' : 'text-muted';

                let amountHtml = `
                    <div class="amount-cell">
                        <div>Total: <b>Rs. ${totalAmount}</b></div>
                        <div class="text-success">Paid: <b>Rs. ${paidAmount}</b></div>
                        <div class="${dueClass}">Due: <b>Rs. ${dueAmount}</b></div>
                    </div>`;

                // Status badge
                let statusBadge = '';
                if (r.status === 'Paid') {
                    statusBadge = `<span class="badge bg-success">Paid</span>`;
                } else if (r.status === 'Partial') {
                    statusBadge = `<span class="badge bg-warning text-dark">Partial</span>`;
                } else {
                    statusBadge = `<span class="badge bg-danger">Unpaid</span>`;
                }

                // Action buttons: View link to view_booking + Convert button
                // Terminal transfer rule: is_transferred_in bookings NEVER show convert actions
                let convertBtnHtml = '';
                if (r.is_appointment && !r.is_transferred_in) {
                    convertBtnHtml = `
                        <button type="button" class="btn btn-sm btn-outline-success py-0 px-2 convert-appointment-btn" 
                                data-id="${r.booking_id}" 
                                title="Confirm Appointment → Normal Booking (deducts films)">
                            <i class="bi bi-calendar2-check"></i> Convert
                        </button>`;
                }

                let viewBtnHtml = `
                    <a href="${baseUrl}/booking/view/view-booking" 
                       class="btn btn-sm btn-outline-primary py-0 px-2" 
                       title="View Booking">
                        <i class="bi bi-eye"></i> View
                    </a>`;

                let rowHtml = `
                    <tr>
                        <td><span class="badge bg-light text-dark border font-monospace">${r.mr_no || 'N/A'}</span></td>
                        <td>
                            <div class="fw-bold text-dark">${r.patient_name || '—'}</div>
                            <div class="text-muted small">${r.contact_no || ''} ${r.age ? '(' + r.age + ' ' + (r.age_unit || 'Y') + ')' : ''}</div>
                        </td>
                        <td><span class="badge bg-secondary-subtle text-secondary-emphasis border px-2 py-1">${r.branch_name || 'N/A'}</span></td>
                        <td class="text-center">${typeBadge}</td>
                        <td><span class="small">${r.date || '—'}</span></td>
                        <td>${amountHtml}</td>
                        <td class="text-center">${statusBadge}</td>
                        <td class="text-center">
                            <div class="d-flex justify-content-center align-items-center gap-1">
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
                    emptyTable: "No appointments or transfers found."
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

    // 7. Initial Load on DOM ready
    loadData();
});
