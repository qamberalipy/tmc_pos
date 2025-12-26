$(document).ready(function () {
    // Utility functions placeholders (Safety checks)
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };
    
    // Ensure baseUrl is defined (use empty string if relative path)
    const baseUrl = window.baseUrl || ""; 

    let reportTable = null;

    // --- 1. Load Doctors Immediately ---
    loadDoctors();

    // --- 2. Initialize Dates (Default to current month) ---
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
        
        // Only load if a doctor is selected
        if ($("#doctor_select").val()) {
            loadReportData();
        }
    });

    // Search Button
    $("#searchBtn").on("click", function () {
        loadReportData();
    });

    // Auto-load when doctor is changed
    $("#doctor_select").on("change", function() {
        loadReportData();
    });


    // --- 4. Main Functions ---

    function loadDoctors() {
        axios.get(baseUrl + "/users/get_all_doctors")
            .then(res => {
                let options = `<option value="" selected disabled>-- Select Doctor --</option>`;
                // Handle different response structures
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
        
        // STOP if no doctor selected
        if (!doctor_id) {
            showToastMessage("error", "Please select a Radiologist first.");
            return;
        }

        myshowLoader();
        const from_date = $("#from_date").val();
        const to_date = $("#to_date").val();

        // --- UPDATED URL AS REQUESTED ---
        const url = `/reports/radiologist-logs/${doctor_id}`;

        axios.get(url, { params: { start_date: from_date, end_date: to_date } })
            .then((res) => {
                // FIX: Robust check for data array vs wrapper object
                let rows = [];
                if (Array.isArray(res.data)) {
                    rows = res.data;
                } else if (res.data && Array.isArray(res.data.data)) {
                    rows = res.data.data;
                }
                
                // console.log("Report Data Loaded:", rows); // Debugging
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
        // Destroy existing table to reset columns
        if (reportTable) {
            reportTable.destroy();
            $('#report_table').empty(); 
        }

        // --- Step A: Find Unique Dynamic Columns ---
        let uniqueTests = new Set();
        data.forEach(row => {
            if (row.test_breakdown) {
                Object.keys(row.test_breakdown).forEach(testName => uniqueTests.add(testName));
            }
        });
        const dynamicColumns = Array.from(uniqueTests).sort();

        // --- Step B: Define Columns ---
        let columnsConfig = [
            { title: "S.No", data: "s_no" },
            { title: "Date", data: "date" },
            { title: "Radiologist Name", data: "radiologist_name" }
        ];

        // Add Dynamic Test Columns
        dynamicColumns.forEach(testName => {
            columnsConfig.push({
                title: testName, 
                data: null, // Use null so we get the full row object in render
                render: function (data, type, row) {
                    const count = (row.test_breakdown && row.test_breakdown[testName]) 
                        ? row.test_breakdown[testName] 
                        : 0;
                    return count !== 0 ? `<b>${count}</b>` : "0";
                }
            });
        });

        // Add Fixed Summary Columns
        columnsConfig.push(
            { title: "Total Tests", data: "total_tests", className: "fw-bold text-primary" },
            { title: "Reports Made", data: "reports_made" },
            { title: "Films Issued", data: "films_issued" }
        );

        // --- Step C: Initialize DataTable ---
        reportTable = $("#report_table").DataTable({
            data: data,
            columns: columnsConfig,
            responsive: false, 
            scrollX: true,     
            pageLength: 50,    
            dom: 'Bfrtip',
            order: [[1, 'asc']], 
            buttons: [
                {
                    extend: 'excelHtml5',
                    text: '<i class="bi bi-file-earmark-excel"></i> Excel',
                    className: 'btn btn-success btn-sm',
                    title: 'Radiologist Performance Report',
                    exportOptions: { columns: ':visible' }
                },
                {
                    extend: 'pdfHtml5',
                    text: '<i class="bi bi-file-earmark-pdf"></i> PDF',
                    className: 'btn btn-danger btn-sm',
                    orientation: 'landscape',
                    pageSize: 'A3', 
                    title: 'Radiologist Performance Report'
                }
            ],
            language: { emptyTable: "No data available" },
            
            // --- Step D: Footer Totals (FIXED) ---
            footerCallback: function (row, data, start, end, display) {
                let api = this.api();
                
                // Helper to parse numbers
                let intVal = function (i) {
                    return typeof i === 'string' ? i.replace(/[\$,]/g, '') * 1 : typeof i === 'number' ? i : 0;
                };
        
                // Create Footer Row if missing
                if ($('#report_table tfoot').length === 0) {
                    $('#report_table').append('<tfoot><tr></tr></tfoot>');
                }
                let footerRow = $('#report_table tfoot tr');
                footerRow.empty(); 
        
                // Loop through all columns
                api.columns().every(function (index) {
                    // FIX: Capture header name HERE so it's available inside reduce
                    let headerName = this.header().textContent; 

                    if (index === 0) {
                         footerRow.append(`<th></th>`);
                    } else if (index === 1) {
                         footerRow.append(`<th></th>`);
                    } else if (index === 2) {
                        footerRow.append(`<th style="text-align:right">Total:</th>`);
                    } else {
                        // Calculate Sum
                        let sum = this.data().reduce(function (a, b) {
                            // If 'b' is an object, it's a dynamic column (data: null)
                            if (typeof b === 'object' && b !== null) {
                                // We use the captured 'headerName'
                                let count = (b.test_breakdown && b.test_breakdown[headerName]) ? b.test_breakdown[headerName] : 0;
                                return intVal(a) + intVal(count);
                            } 
                            // If 'b' is a primitive (number/string), it's a standard column (total_tests, etc.)
                            else {
                                return intVal(a) + intVal(b);
                            }
                        }, 0);
                        
                        footerRow.append(`<th style="text-align:center">${sum}</th>`);
                    }
                });
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
        const day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }
});