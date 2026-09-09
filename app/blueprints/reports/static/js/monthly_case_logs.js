$(document).ready(function () {
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };

    const baseUrl = window.baseUrl || "";
    let reportTable = null;

    // --- 1. Initialize Dates (1st of current month → today) ---
    (function initDates() {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        $("#from_date").val(formatDate(firstDay));
        $("#to_date").val(formatDate(today));
    })();

    // --- 2. Load Referred Dropdowns ---
    loadReferredDropdowns();

    // --- 3. Event Listeners ---
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
        loadReportData();
    });

    $("#searchBtn").on("click", function () { loadReportData(); });

    // --- 4. Main Functions ---

    function loadReferredDropdowns() {
        axios.get(baseUrl + "/registrations/referred/list")
            .then(res => {
                const all = Array.isArray(res.data) ? res.data : [];
                let drOpts    = `<option value="">-- All --</option>`;
                let nonDrOpts = `<option value="">-- All --</option>`;
                all.forEach(r => {
                    const opt = `<option value="${r.id}">${r.name}</option>`;
                    if (r.type === true || r.type === 1) {
                        drOpts += opt;
                    } else {
                        nonDrOpts += opt;
                    }
                });
                $("#referred_dr_filter").html(drOpts);
                $("#referred_non_dr_filter").html(nonDrOpts);
            })
            .catch(err => {
                console.error("Error loading referred list:", err);
            });
    }

    function loadReportData() {
        myshowLoader();
        const params = {
            from_date: $("#from_date").val(),
            to_date:   $("#to_date").val(),
            referred_dr_id:     $("#referred_dr_filter").val()     || undefined,
            referred_non_dr_id: $("#referred_non_dr_filter").val() || undefined
        };

        axios.get("/reports/monthly-case-logs/data", { params })
            .then(res => {
                const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
                buildTable(rows);
            })
            .catch(err => {
                console.error("Failed to load Monthly Case Logs:", err);
                showToastMessage("error", "Failed to load report data");
                if (reportTable) reportTable.clear().draw();
            })
            .finally(() => myhideLoader());
    }

    function fmt(val) {
        const n = parseFloat(val) || 0;
        return "Rs. " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function buildTable(data) {
        if (reportTable) {
            reportTable.destroy();
            $('#report_table').empty().append(
                '<thead>' +
                '<tr>' +
                '<th>S.No</th><th>Booking ID</th><th>Date</th><th>Patient Name</th><th>MR No</th>' +
                '<th>Referred Dr</th><th>Referred Non-Dr</th>' +
                '<th class="text-end">Charge</th><th class="text-end">Discount</th>' +
                '<th class="text-end">Paid</th><th class="text-end">Due</th>' +
                '</tr>' +
                '</thead><tbody></tbody><tfoot></tfoot>'
            );
        }

        // Column indices for monetary columns (0-indexed): 7=Charge, 8=Discount, 9=Paid, 10=Due
        const MONEY_COLS = { 7: "charge", 8: "discount", 9: "paid", 10: "due" };

        const columnsConfig = [
            { title: "S.No",            data: "s_no" },
            { title: "Booking ID",      data: "booking_id" },
            { title: "Date",            data: "date" },
            { title: "Patient Name",    data: "patient_name" },
            { title: "MR No",           data: "mr_no" },
            { title: "Referred Dr",     data: "referred_dr" },
            { title: "Referred Non-Dr", data: "referred_non_dr" },
            { title: "Charge",   data: "charge",   className: "text-end", render: d => fmt(d) },
            { title: "Discount", data: "discount", className: "text-end", render: d => fmt(d) },
            { title: "Paid",     data: "paid",     className: "text-end", render: d => fmt(d) },
            { title: "Due",      data: "due",       className: "text-end fw-bold text-danger", render: d => fmt(d) }
        ];

        reportTable = $("#report_table").DataTable({
            data: data,
            columns: columnsConfig,
            responsive: false,
            paging: false,
            info: false,
            scrollX: true,
            scrollY: "60vh",
            scrollCollapse: true,
            dom: 'Bfrtip',
            order: [[2, 'desc']],
            buttons: [
                { extend: 'excelHtml5', text: '<i class="bi bi-file-earmark-excel"></i> Excel', className: 'btn btn-success btn-sm', footer: true, exportOptions: { columns: ':visible' } },
                {
                    extend: 'pdfHtml5', text: '<i class="bi bi-file-earmark-pdf"></i> PDF', className: 'btn btn-danger btn-sm',
                    orientation: 'landscape', pageSize: 'A4', footer: true,
                    exportOptions: { columns: ':visible' },
                    customize: function (doc) {
                        doc.pageOrientation = 'landscape';
                        doc.pageMargins = [20, 20, 20, 20];
                    }
                }
            ],
            language: { emptyTable: "No data available" },

            // --- GRAND TOTAL FOOTER ---
            footerCallback: function (tfootNode, data, start, end, display) {
                var api = this.api();

                var intVal = function (i) {
                    if (typeof i === 'string') {
                        let clean = i.replace(/[^0-9.-]+/g, "");
                        return clean ? parseFloat(clean) : 0;
                    }
                    return typeof i === 'number' ? i : 0;
                };

                var $row = $('<tr class="grand-total-row"></tr>');

                api.columns().every(function (index) {
                    if (index === 0 || index === 1) {
                        $row.append('<th></th>');
                    } else if (index === 2) {
                        $row.append('<th class="text-end text-uppercase">GRAND TOTAL:</th>');
                    } else if (MONEY_COLS[index]) {
                        // Sum from raw data key to avoid parsing formatted strings
                        let sum = 0;
                        api.column(index).data().each(function (val) {
                            sum += intVal(val);
                        });
                        $row.append(`<th class="text-end">${fmt(sum)}</th>`);
                    } else {
                        // Text columns: blank
                        $row.append('<th></th>');
                    }
                });

                $(tfootNode).html($row);

                var $scrollFoot = $(api.table().container()).find('.dataTables_scrollFootInner tfoot');
                if ($scrollFoot.length > 0) {
                    $scrollFoot.html($row.clone());
                }
            }
        });

        // Move buttons to custom container
        try {
            const btnContainer = reportTable.buttons().container();
            $("#exportButtons").empty().append(btnContainer);
        } catch (e) { console.warn(e); }
    }

    function formatDate(dateObj) {
        const d = new Date(dateObj);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const day   = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }
});
