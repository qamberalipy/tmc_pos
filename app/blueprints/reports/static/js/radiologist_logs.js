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
            showToastMessage("error", "Please select a Radiologist first.");
            return;
        }

        myshowLoader();
        const from_date = $("#from_date").val();
        const to_date = $("#to_date").val();
        // Assuming your route structure matches this
        const url = `/reports/radiologist-logs/${doctor_id}`;

        axios.get(url, { params: { start_date: from_date, end_date: to_date } })
            .then((res) => {
                let rows = [];
                if (Array.isArray(res.data)) {
                    rows = res.data;
                } else if (res.data && Array.isArray(res.data.data)) {
                    rows = res.data.data;
                }
                buildDynamicTable(rows);
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

    function buildDynamicTable(data) {
        if (reportTable) {
            reportTable.destroy();
            // CRITICAL FIX: Explicitly restore the table structure including tfoot
            // because DataTables destroys it.
            $('#report_table').empty().append('<thead></thead><tbody></tbody><tfoot></tfoot>'); 
        }

        // Fixed category columns — mirrors Internal Reporting Logs pattern
        const FIXED_CATEGORIES = ["Contrast", "Full Study", "Screening", "Other"];

        // Define Columns
        let columnsConfig = [
            { title: "S.No", data: "s_no" },
            { title: "Date", data: "date" },
            { title: "Radiologist Name", data: "radiologist_name" }
        ];

        // Add fixed category columns
        FIXED_CATEGORIES.forEach(cat => {
            columnsConfig.push({
                title: cat,
                data: null,
                className: "text-center fw-bold",
                render: function (data, type, row) {
                    const count = (row.test_breakdown && row.test_breakdown[cat]) ? row.test_breakdown[cat] : 0;
                    return count !== 0 ? `<b>${count}</b>` : "0";
                }
            });
        });

        // Add Fixed Summary Columns
        columnsConfig.push(
            { title: "Total Tests", data: "total_tests", className: "fw-bold text-primary" },
            { title: "Reports Made", data: "reports_made" },
            { title: "Films Issued", data: "films_issued" },
            { 
                title: "Report Charges", 
                data: "report_charges", 
                className: "text-end fw-bold",
                render: function(data, type, row) {
                    const amount = "Rs. " + parseFloat(data || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                    if (row.rate_missing) {
                        return `<span class="text-danger" title="Rate not set by admin for one or more reported tests">
                                    <i class="bi bi-exclamation-triangle-fill"></i> ${amount}
                                </span>`;
                    }
                    return `<span class="text-success">${amount}</span>`;
                }
            }
        );

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

                // Create the Row
                var $row = $('<tr class="grand-total-row"></tr>');

                api.columns().every(function (index) {
                    let headerName = $(this.header()).text().trim();

                    if (index === 0 || index === 1) {
                        $row.append('<th></th>'); 
                    } 
                    else if (index === 2) {
                        $row.append('<th class="text-end text-uppercase">GRAND TOTAL:</th>');
                    } 
                    else {
                        // Calculate Sum
                        let sum = this.data().reduce(function (a, b) {
                            if (typeof b === 'object' && b !== null) {
                                // Logic for dynamic columns
                                let count = (b.test_breakdown && b.test_breakdown[headerName]) ? b.test_breakdown[headerName] : 0;
                                return intVal(a) + intVal(count);
                            } else {
                                // Logic for standard columns
                                return intVal(a) + intVal(b);
                            }
                        }, 0);
                        
                        if (headerName.includes("Report Charges")) {
                            let money = "Rs. " + sum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                            $row.append(`<th class="text-end text-success">${money}</th>`);
                        } else {
                            $row.append(`<th class="text-center">${sum}</th>`);
                        }
                    }
                });

                // 1. Update the Internal (Hidden) Footer
                $(tfootNode).html($row);

                // 2. CRITICAL FIX: Force Update the Visible Scrolling Footer
                // DataTables creates a separate DIV for the scroll footer. We must copy our row there.
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
        const totals = { total_tests: 0, reports_made: 0, films_issued: 0, report_charges: 0, any_rate_missing: false, cats: { Contrast: 0, "Full Study": 0, Screening: 0, Other: 0 } };
        rows.forEach(r => {
            totals.total_tests  += Number(r.total_tests  || 0);
            totals.reports_made += Number(r.reports_made || 0);
            totals.films_issued += Number(r.films_issued || 0);
            totals.report_charges += Number(r.report_charges || 0);
            if (r.rate_missing) totals.any_rate_missing = true;
            cats.forEach(c => totals.cats[c] += Number((r.test_breakdown && r.test_breakdown[c]) || 0));
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
            cats.map(c => `<td>${(r.test_breakdown && r.test_breakdown[c]) || 0}</td>`).join('') +
            `<td>${r.total_tests}</td><td>${r.reports_made}</td><td>${r.films_issued}</td>` +
            `<td${r.rate_missing ? ' style="color:red;"' : ''}>Rs. ${Number(r.report_charges).toLocaleString(undefined, { minimumFractionDigits: 2 })}${r.rate_missing ? ' \u26a0' : ''}</td></tr>`
        ).join('');
        let footerRow = `<tr style="font-weight:bold;"><td colspan="3">GRAND TOTAL</td>` +
            cats.map(c => `<td>${totals.cats[c]}</td>`).join('') +
            `<td>${totals.total_tests}</td><td>${totals.reports_made}</td><td>${totals.films_issued}</td>` +
            `<td${totals.any_rate_missing ? ' style="color:red;"' : ''}>Rs. ${totals.report_charges.toLocaleString(undefined, { minimumFractionDigits: 2 })}${totals.any_rate_missing ? ' \u26a0' : ''}</td></tr>`;
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Radiologist Logs</title>
            <style>
                @page { size: landscape; margin: 12mm; }
                body { font-family: Arial, sans-serif; padding: 16px; }
                h3 { margin-bottom: 4px; } .meta { color:#555; margin-bottom:16px; font-size: 0.9rem; }
                table { width:100%; border-collapse: collapse; font-size: 0.85rem; }
                th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
                thead { background: #f1f1f1; }
            </style></head><body>
            <h3>Radiologist Logs</h3>
            <div class="meta">Radiologist: ${doctorName} &nbsp;|&nbsp; Period: ${from} to ${to}</div>
            <table><thead><tr><th>S.No</th><th>Date</th><th>Radiologist</th>${cats.map(c => `<th>${c}</th>`).join('')}<th>Total Tests</th><th>Reports Made</th><th>Films Issued</th><th>Report Charges</th></tr></thead>
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
        const header = ["S.No", "Date", "Radiologist", ...cats, "Total Tests", "Reports Made", "Films Issued", "Report Charges"];
        const data = [
            ["Radiologist Logs"],
            [`Radiologist: ${doctorName}`, `Period: ${from} to ${to}`],
            [],
            header,
            ...rows.map((r, i) => [
                i + 1, r.date, r.radiologist_name,
                ...cats.map(c => (r.test_breakdown && r.test_breakdown[c]) || 0),
                r.total_tests, r.reports_made, r.films_issued,
                r.rate_missing ? `${Number(r.report_charges)} \u26a0` : Number(r.report_charges)
            ]),
            ["", "", "GRAND TOTAL", ...cats.map(c => totals.cats[c]), totals.total_tests, totals.reports_made, totals.films_issued,
                totals.any_rate_missing ? `${totals.report_charges} \u26a0` : totals.report_charges]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Radiologist Logs");
        XLSX.writeFile(wb, `Radiologist_Logs_${from}_to_${to}.xlsx`);
    });

});