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

        // Identify Dynamic Columns (Test Names)
        let uniqueTests = new Set();
        data.forEach(row => {
            if (row.test_breakdown) {
                Object.keys(row.test_breakdown).forEach(testName => uniqueTests.add(testName));
            }
        });
        const dynamicColumns = Array.from(uniqueTests).sort();

        // Define Columns
        let columnsConfig = [
            { title: "S.No", data: "s_no" },
            { title: "Date", data: "date" },
            { title: "Radiologist Name", data: "radiologist_name" }
        ];

        // Add dynamic columns
        dynamicColumns.forEach(testName => {
            columnsConfig.push({
                title: testName, 
                data: null, 
                render: function (data, type, row) {
                    const count = (row.test_breakdown && row.test_breakdown[testName]) 
                        ? row.test_breakdown[testName] : 0;
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
                title: "Total Amount", 
                data: "total_amount", 
                className: "text-end fw-bold text-success",
                render: function(data) {
                    return data 
                        ? "Rs. " + parseFloat(data).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})
                        : "Rs. 0.00";
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
            dom: 'Bfrtip',
            order: [[1, 'asc']], 
            buttons: [
                { extend: 'excelHtml5', text: '<i class="bi bi-file-earmark-excel"></i> Excel', className: 'btn btn-success btn-sm', footer: true },
                { extend: 'pdfHtml5', text: '<i class="bi bi-file-earmark-pdf"></i> PDF', className: 'btn btn-danger btn-sm', orientation: 'landscape', pageSize: 'A3', footer: true }
            ],
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
                        
                        if (headerName.includes("Total Amount")) {
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

        // Move buttons to the custom container
        try {
            const btnContainer = reportTable.buttons().container();
            $("#exportButtons").empty().append(btnContainer);
        } catch (e) { console.warn(e); }
    }

    function formatDate(dateObj) {
        const d = new Date(dateObj);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }
});