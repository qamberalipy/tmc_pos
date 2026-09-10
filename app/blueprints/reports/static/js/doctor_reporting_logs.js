$(document).ready(function () {
    // Utility functions (Mocking your existing utils if not defined globally)
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };
    
    const baseUrl = window.baseUrl || ""; 
    let reportTable = null;

    // --- 1. Load Doctors ---
    loadDoctors();

    // --- 2. Initialize Dates ---
    (function initDates() {
        const fromEl = $("#from_date");
        const toEl = $("#to_date");
        if (!fromEl.val() || !toEl.val()) {
            let today = new Date();
            let firstDay = new Date(today.getFullYear(), today.getMonth(), 1); 
            fromEl.val(formatDate(firstDay));
            toEl.val(formatDate(today));
        }
    })();

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
        
        // Only load if a doctor is already selected
        if ($("#doctor_select").val()) {
            loadReportData();
        }
    });

    $("#searchBtn").on("click", function () { loadReportData(); });
    $("#doctor_select").on("change", function() { loadReportData(); });

    // --- 4. Main Functions ---

    function loadDoctors() {
        axios.get(baseUrl + "/users/get_all_doctors")
            .then(res => {
                let options = `<option value="" selected disabled>-- Select Doctor --</option>`;
                const doctors = Array.isArray(res.data) ? res.data : (res.data.data || []);
                doctors.forEach(dr => { 
                    options += `<option value="${dr.id}">${dr.name}</option>`; 
                });
                $("#doctor_select").html(options);
            })
            .catch(err => {
                console.error("Error loading doctors:", err);
                showToastMessage("error", "Failed to load doctor list");
            });
    }

    function loadReportData() {
        const doctor_id = $("#doctor_select").val(); 
        if (!doctor_id) {
            showToastMessage("error", "Please select a Doctor first.");
            return;
        }

        myshowLoader();
        const from_date = $("#from_date").val();
        const to_date = $("#to_date").val();
        const url = `/reports/doctor-reporting-logs/${doctor_id}`;

        axios.get(url, { params: { start_date: from_date, end_date: to_date } })
            .then((res) => {
                let rows = [];
                if (Array.isArray(res.data)) {
                    rows = res.data;
                } else if (res.data && Array.isArray(res.data.data)) {
                    rows = res.data.data;
                }
                buildTable(rows);
            })
            .catch((err) => {
                console.error("Failed to load report:", err);
                showToastMessage("error", "Failed to load report data");
                if (reportTable) {
                    reportTable.clear().draw();
                }
            })
            .finally(() => myhideLoader());
    }

    function buildTable(data) {
        if (reportTable) {
            reportTable.destroy();
            // Restore the table structure including tfoot (DataTables destroys it on destroy())
            $('#report_table').empty().append(
                '<thead>' +
                '<tr>' +
                '<th>S.No</th><th>Date</th><th>Dr. Name</th>' +
                '<th>Contrast</th><th>Full Study</th><th>Screening</th><th>Other</th>' +
                '<th>Total Case</th><th>Films Used</th><th>Reports Made</th><th>Case Not Sent to Dr.</th>' +
                '</tr>' +
                '</thead><tbody></tbody><tfoot></tfoot>'
            );
        }

        // Fixed column definitions — category pivot (no dynamic columns)
        const columnsConfig = [
            { title: "S.No",               data: "s_no" },
            { title: "Date",               data: "date" },
            { title: "Dr. Name",           data: "radiologist_name" },
            { title: "Contrast",           data: "Contrast",    className: "fw-bold" },
            { title: "Full Study",         data: "Full Study",  className: "fw-bold",
              render: function(data, type, row) { return row["Full Study"] !== undefined ? row["Full Study"] : 0; }
            },
            { title: "Screening",          data: "Screening",   className: "fw-bold" },
            { title: "Other",              data: "Other",       className: "fw-bold" },
            { title: "Total Case",         data: "total_case",  className: "fw-bold text-primary" },
            { title: "Films Used",         data: "films_issued" },
            { title: "Reports Made",       data: "reports_made" },
            { title: "Case Not Sent to Dr.", data: "not_sent", className: "text-danger fw-bold" }
        ];

        // Initialize DataTable
        reportTable = $("#report_table").DataTable({
            data: data,
            columns: columnsConfig,
            responsive: false,
            paging: false,
            info: false,
            scrollX: true,
            scrollY: "60vh",
            scrollCollapse: true,
            order: [[1, 'asc']],
            language: { emptyTable: "No data available" },

            // --- GRAND TOTAL LOGIC ---
            footerCallback: function (tfootNode, data, start, end, display) {
                var api = this.api();

                // Safe number parser
                var intVal = function (i) {
                    if (typeof i === 'string') {
                        let clean = i.replace(/[^0-9.-]+/g, "");
                        return clean ? parseFloat(clean) : 0;
                    }
                    return typeof i === 'number' ? i : 0;
                };

                // Columns to sum (indices 3 onward; 0=S.No, 1=Date, 2=Dr.Name)
                var $row = $('<tr class="grand-total-row"></tr>');

                api.columns().every(function (index) {
                    if (index === 0 || index === 1) {
                        $row.append('<th></th>');
                    } else if (index === 2) {
                        $row.append('<th class="text-end text-uppercase">GRAND TOTAL:</th>');
                    } else {
                        let sum = this.data().reduce(function (a, b) {
                            return intVal(a) + intVal(typeof b === 'object' ? this.cell(
                                api.rows().indexes()[0], index
                            ).data() : b);
                        }.bind(this), 0);

                        // Re-compute sum cleanly from raw data
                        sum = 0;
                        api.column(index).data().each(function(val) {
                            sum += intVal(val);
                        });

                        $row.append(`<th class="text-center">${sum}</th>`);
                    }
                });

                // Update internal footer
                $(tfootNode).html($row);

                // Force update visible scrolling footer
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
        const day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }

    // --- Export Helpers ---

    function buildReportRows() {
        const rows = reportTable.rows({ search: 'applied' }).data().toArray();
        const cats = ["Contrast", "Full Study", "Screening", "Other"];
        const totals = { total_case: 0, films_issued: 0, reports_made: 0, not_sent: 0, cats: { Contrast: 0, "Full Study": 0, Screening: 0, Other: 0 } };
        rows.forEach(r => {
            totals.total_case    += Number(r.total_case    || 0);
            totals.films_issued  += Number(r.films_issued  || 0);
            totals.reports_made  += Number(r.reports_made  || 0);
            totals.not_sent      += Number(r.not_sent      || 0);
            cats.forEach(c => totals.cats[c] += Number(r[c] || 0));
        });
        return { rows, totals, cats };
    }

    $(document).on('click', '#btnPrintPdf', function () {
        if (!reportTable) { showToastMessage('error', 'No data loaded yet.'); return; }
        const { rows, totals, cats } = buildReportRows();
        const doctorName = $('#doctor_select option:selected').text();
        const from = $('#from_date').val(), to = $('#to_date').val();
        let bodyRows = rows.map((r, i) =>
            `<tr><td>${i + 1}</td><td>${r.date}</td><td>${r.radiologist_name}</td>` +
            cats.map(c => `<td>${r[c] || 0}</td>`).join('') +
            `<td>${r.total_case}</td><td>${r.films_issued}</td><td>${r.reports_made}</td><td>${r.not_sent}</td></tr>`
        ).join('');
        let footerRow = `<tr style="font-weight:bold;"><td colspan="3">GRAND TOTAL</td>` +
            cats.map(c => `<td>${totals.cats[c]}</td>`).join('') +
            `<td>${totals.total_case}</td><td>${totals.films_issued}</td><td>${totals.reports_made}</td><td>${totals.not_sent}</td></tr>`;
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Internal Reporting Logs</title>
            <style>
                @page { size: landscape; margin: 12mm; }
                body { font-family: Arial, sans-serif; padding: 16px; }
                h3 { margin-bottom: 4px; } .meta { color:#555; margin-bottom:16px; font-size: 0.9rem; }
                table { width:100%; border-collapse: collapse; font-size: 0.85rem; }
                th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
                thead { background: #f1f1f1; }
            </style></head><body>
            <h3>Internal Reporting Logs</h3>
            <div class="meta">Doctor: ${doctorName} &nbsp;|&nbsp; Period: ${from} to ${to}</div>
            <table><thead><tr><th>S.No</th><th>Date</th><th>Dr. Name</th>${cats.map(c => `<th>${c}</th>`).join('')}<th>Total Case</th><th>Films Used</th><th>Reports Made</th><th>Case Not Sent to Dr.</th></tr></thead>
            <tbody>${bodyRows}${footerRow}</tbody></table>
            </body></html>`);
        win.document.close();
        win.onload = () => win.print();
    });

    $(document).on('click', '#btnExportExcel', function () {
        if (!reportTable) { showToastMessage('error', 'No data loaded yet.'); return; }
        const { rows, totals, cats } = buildReportRows();
        const doctorName = $('#doctor_select option:selected').text();
        const from = $('#from_date').val(), to = $('#to_date').val();
        const header = ["S.No", "Date", "Dr. Name", ...cats, "Total Case", "Films Used", "Reports Made", "Case Not Sent to Dr."];
        const data = [
            ["Internal Reporting Logs"],
            [`Doctor: ${doctorName}`, `Period: ${from} to ${to}`],
            [],
            header,
            ...rows.map((r, i) => [
                i + 1, r.date, r.radiologist_name,
                ...cats.map(c => r[c] || 0),
                r.total_case, r.films_issued, r.reports_made, r.not_sent
            ]),
            ["", "", "GRAND TOTAL", ...cats.map(c => totals.cats[c]), totals.total_case, totals.films_issued, totals.reports_made, totals.not_sent]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Internal Reporting Logs");
        XLSX.writeFile(wb, `Internal_Reporting_Logs_${from}_to_${to}.xlsx`);
    });

});
