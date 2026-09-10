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
            order: [[2, 'desc']],
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


    }

    function formatDate(dateObj) {
        const d = new Date(dateObj);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const day   = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }

    // --- Export Helpers ---

    function buildReportRows() {
        const rows = reportTable.rows({ search: 'applied' }).data().toArray();
        const totals = { charge: 0, discount: 0, paid: 0, due: 0 };
        rows.forEach(r => {
            totals.charge   += Number(r.charge   || 0);
            totals.discount += Number(r.discount || 0);
            totals.paid     += Number(r.paid     || 0);
            totals.due      += Number(r.due      || 0);
        });
        return { rows, totals };
    }

    $(document).on('click', '#btnPrintPdf', function () {
        if (!reportTable) { showToastMessage('error', 'No data loaded yet.'); return; }
        const { rows, totals } = buildReportRows();
        const refDr    = $('#referred_dr_filter option:selected').text();
        const refNonDr = $('#referred_non_dr_filter option:selected').text();
        const from = $('#from_date').val(), to = $('#to_date').val();
        const fmtMoney = n => 'Rs. ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
        let bodyRows = rows.map((r, i) =>
            `<tr><td>${i + 1}</td><td>${r.booking_id}</td><td>${r.date}</td><td>${r.patient_name}</td>` +
            `<td>${r.mr_no}</td><td>${r.referred_dr || ''}</td><td>${r.referred_non_dr || ''}</td>` +
            `<td>${fmtMoney(r.charge)}</td><td>${fmtMoney(r.discount)}</td><td>${fmtMoney(r.paid)}</td><td>${fmtMoney(r.due)}</td></tr>`
        ).join('');
        let footerRow = `<tr style="font-weight:bold;"><td colspan="7">GRAND TOTAL</td>` +
            `<td>${fmtMoney(totals.charge)}</td><td>${fmtMoney(totals.discount)}</td><td>${fmtMoney(totals.paid)}</td><td>${fmtMoney(totals.due)}</td></tr>`;
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Monthly Case Logs</title>
            <style>
                @page { size: landscape; margin: 12mm; }
                body { font-family: Arial, sans-serif; padding: 16px; }
                h3 { margin-bottom: 4px; } .meta { color:#555; margin-bottom:16px; font-size: 0.9rem; }
                table { width:100%; border-collapse: collapse; font-size: 0.85rem; }
                th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
                thead { background: #f1f1f1; }
            </style></head><body>
            <h3>Monthly Case Logs</h3>
            <div class="meta">Referred Dr: ${refDr} &nbsp;|&nbsp; Referred Non-Dr: ${refNonDr} &nbsp;|&nbsp; Period: ${from} to ${to}</div>
            <table><thead><tr><th>S.No</th><th>Booking ID</th><th>Date</th><th>Patient Name</th><th>MR No</th><th>Referred Dr</th><th>Referred Non-Dr</th><th>Charge</th><th>Discount</th><th>Paid</th><th>Due</th></tr></thead>
            <tbody>${bodyRows}${footerRow}</tbody></table>
            </body></html>`);
        win.document.close();
        win.onload = () => win.print();
    });

    $(document).on('click', '#btnExportExcel', function () {
        if (!reportTable) { showToastMessage('error', 'No data loaded yet.'); return; }
        const { rows, totals } = buildReportRows();
        const refDr    = $('#referred_dr_filter option:selected').text();
        const refNonDr = $('#referred_non_dr_filter option:selected').text();
        const from = $('#from_date').val(), to = $('#to_date').val();
        const header = ["S.No", "Booking ID", "Date", "Patient Name", "MR No", "Referred Dr", "Referred Non-Dr", "Charge", "Discount", "Paid", "Due"];
        const data = [
            ["Monthly Case Logs"],
            [`Referred Dr: ${refDr}`, `Referred Non-Dr: ${refNonDr}`, `Period: ${from} to ${to}`],
            [],
            header,
            ...rows.map((r, i) => [
                i + 1, r.booking_id, r.date, r.patient_name, r.mr_no,
                r.referred_dr || '', r.referred_non_dr || '',
                Number(r.charge), Number(r.discount), Number(r.paid), Number(r.due)
            ]),
            ["", "", "", "", "", "", "GRAND TOTAL", totals.charge, totals.discount, totals.paid, totals.due]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Monthly Case Logs");
        XLSX.writeFile(wb, `Monthly_Case_Logs_${from}_to_${to}.xlsx`);
    });

});
