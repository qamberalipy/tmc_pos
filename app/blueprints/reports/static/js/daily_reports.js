$(document).ready(function () {
    
    // Initialize Select2 on the Shift Dropdown
    $('#shift_selector').select2({
        theme: 'bootstrap-5',
        placeholder: "Click to view & select shifts...",
        allowClear: true,
        width: '100%',
        closeOnSelect: false 
    });

    // Auto-fill today's date if empty (Lab Day bounds)
    if (!$("#report_date").val()) {
        let today = new Date(); 
        
        if (today.getHours() < 8) {
            today.setDate(today.getDate() - 1);
        }
        
        let year = today.getFullYear();
        let month = String(today.getMonth() + 1).padStart(2, '0');
        let day = String(today.getDate()).padStart(2, '0');
        
        $("#report_date").val(`${year}-${month}-${day}`);
    }

    // Load initial data
    if ($("#staff_selector").val()) {
        fetchStaffShifts();
    } else {
        loadDailyReport(null); 
    }

    // --- Dynamic Shift Fetching with Loader ---
    function fetchStaffShifts() {
        let userId = $("#staff_selector").val();
        let dateStr = $("#report_date").val();
        
        let $shiftContainer = $("#shift_selector_container");
        let $shiftSelector = $("#shift_selector");
        let $spinner = $("#shift_spinner"); // The new spinner
        
        if (!userId) {
            $shiftContainer.hide();
            $shiftSelector.empty().trigger('change'); 
            return;
        }

        // Show container, show spinner, disable select dropdown
        $shiftContainer.fadeIn();
        $spinner.removeClass("d-none");
        $shiftSelector.prop("disabled", true);

        axios.get(`/users/user-shifts/${userId}?date=${dateStr}`)
            .then(res => {
                $shiftSelector.empty(); 
                
                if(res.data && res.data.length > 0) {
                    res.data.forEach(shift => {
                        $shiftSelector.append(new Option(shift.label, shift.id, false, false));
                    });
                } else {
                    $shiftSelector.append(new Option("No shifts recorded for this day", "", false, false));
                }
                
                $shiftSelector.trigger('change');
            })
            .catch(err => {
                console.error("Shift Fetch Error:", err);
                showToastMessage('error', 'Could not load shifts.');
            })
            .finally(() => {
                // Hide spinner, enable select dropdown
                $spinner.addClass("d-none");
                $shiftSelector.prop("disabled", false);
            });
    }

    // Trigger shift refresh on Staff or Date change
    $("#staff_selector, #report_date").on("change", function () {
        fetchStaffShifts();
    });

    // --- Action Buttons ---
    $("#searchBtn").on("click", function () {
        let shiftIds = $("#shift_selector").val(); 
        
        if ($("#staff_selector").val() && (!shiftIds || shiftIds.length === 0)) {
            showToastMessage('warning', 'Please select at least one shift, or use "All-Day Report".');
            return;
        }
        
        loadDailyReport(shiftIds ? shiftIds.join(',') : null);
    });

    $("#allDayBtn").on("click", function() {
        $("#staff_selector").val('');
        $("#shift_selector_container").hide();
        $("#shift_selector").val(null).trigger('change');
        
        loadDailyReport(null);
    });

    // ... (Keep the rest of your loadDailyReport, renderDailyReport, and Export functions exactly the same) ...$(document).ready(function () {

    // Auto-fill today's date if empty
    if (!$("#report_date").val()) {
        let today = new Date();
        $("#report_date").val(today.toISOString().split("T")[0]);
    }

    // Load initial shifts if staff is pre-selected (e.g., non-admin)
    if ($("#staff_selector").val()) {
        fetchStaffShifts();
    } else {
        loadDailyReport(null); // Load all-day by default for admin
    }

    // --- Dynamic Shift Fetching ---
    function fetchStaffShifts() {
        let userId = $("#staff_selector").val();
        let dateStr = $("#report_date").val();
        
        let $shiftContainer = $("#shift_selector_container");
        let $shiftSelector = $("#shift_selector");
        
        if (!userId) {
            $shiftContainer.hide();
            $shiftSelector.empty();
            return;
        }

        axios.get(`/users/user-shifts/${userId}?date=${dateStr}`)
            .then(res => {
                $shiftSelector.empty();
                if(res.data && res.data.length > 0) {
                    res.data.forEach(shift => {
                        $shiftSelector.append(new Option(shift.label, shift.id));
                    });
                    $shiftContainer.fadeIn();
                } else {
                    $shiftSelector.append(new Option("No shifts found", "", false, false));
                    $shiftContainer.fadeIn();
                }
            })
            .catch(err => {
                console.error("Shift Fetch Error:", err);
                showToastMessage('error', 'Could not load shifts.');
            });
    }

    // Trigger shift refresh on Staff or Date change
    $("#staff_selector, #report_date").on("change", function () {
        fetchStaffShifts();
    });

    // --- Action Buttons ---
    $("#searchBtn").on("click", function () {
        let shiftIds = $("#shift_selector").val(); 
        
        if ($("#staff_selector").val() && (!shiftIds || shiftIds.length === 0)) {
            showToastMessage('warning', 'Please select at least one shift, or use "All-Day Report".');
            return;
        }
        
        loadDailyReport(shiftIds ? shiftIds.join(',') : null);
    });

    $("#allDayBtn").on("click", function() {
        // Clear specific selections to enforce a full branch day query
        $("#staff_selector").val('');
        $("#shift_selector_container").hide();
        $("#shift_selector").empty();
        
        loadDailyReport(null);
    });


    // =============================================================
    // MAIN LOADER FUNCTION
    // =============================================================
    async function loadDailyReport(shiftIdsStr = null) {

        let date = $("#report_date").val();
        let userId = $("#staff_selector").val(); 

        if (!date) {
            showToastMessage("error", "Please select a date");
            return;
        }

        // 1. Show Loading State
        $("#testReportTable tbody").html('<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> Loading...</td></tr>');
        $("#dueReportTable tbody").html('<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> Loading...</td></tr>');
        $("#expenseReportTable tbody").html('<tr><td colspan="2" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> Loading...</td></tr>');
        
        $("#summary_income, #summary_expense, #summary_net").text("0.00");
        $("#film_start, #film_use, #film_closing").text("0");

        try {
            myshowLoader();

            // 2. Prepare API Parameters
            const params = { date: date };
            if (userId) params.user_id = userId;
            if (shiftIdsStr) params.shift_ids = shiftIdsStr; 

            // 3. Fetch All Reports in Parallel
            const [testRes, filmsRes, expRes, duesRes, summaryRes] = await Promise.all([
                axios.get(`/reports/daily-report/test-report`, { params }),
                axios.get(`/reports/daily-report/films`, { params }),
                axios.get(`/reports/daily-report/expenses`, { params }),
                axios.get(`/reports/daily-report/dues`, { params }),
                axios.get(`/reports/daily-report/summary`, { params }) 
            ]);

            // 4. Render Data
            renderDailyReport(testRes.data, filmsRes.data, expRes.data, duesRes.data, summaryRes.data, date);

        } catch (err) {
            console.error(err);
            showToastMessage("error", "Failed to load report data");
            $("#testReportTable tbody").html('<tr><td colspan="3" class="text-center text-danger">Error loading data</td></tr>');
        } finally {
            myhideLoader();
        }
    }


    function renderDailyReport(testData, filmsData, expData, duesData, summaryData, dateStr) {

        // --- 1. FINANCIAL SUMMARY CARDS ---
        if(summaryData) {
            $("#summary_income").text(formatCurrency(summaryData.total_income));
            $("#summary_expense").text(formatCurrency(summaryData.total_expense));
            $("#summary_net").text(formatCurrency(summaryData.net_cash));
        }

        // --- 2. FILMS INVENTORY CARDS ---
        $("#film_start").text(filmsData.film_start || 0);
        $("#film_use").text(filmsData.film_use || 0);
        $("#film_closing").text(filmsData.film_closing || 0);

        // --- 3. TEST REPORT TABLE ---
        let testBody = "";
        let totalTestAmt = 0;

        if (!testData || testData.length === 0) {
            testBody = `<tr><td colspan="3" class="text-center text-muted">No tests found</td></tr>`;
        } else {
            testData.forEach(row => {
                totalTestAmt += parseFloat(row.amount || 0);
                testBody += `
                    <tr>
                        <td>${row.test_name}</td>
                        <td class="text-center">${row.count}</td>
                        <td class="text-end fw-bold">${formatCurrency(row.amount)}</td>
                    </tr>
                `;
            });
        }
        $("#testReportTable tbody").html(testBody);
        $("#total_test_amount").text(formatCurrency(totalTestAmt));


        // --- 4. DUE CLEARANCE TABLE ---
        let dueBody = "";
        let totalDues = 0;

        if (!duesData || duesData.length === 0) {
            dueBody = `<tr><td colspan="6" class="text-center text-muted">No dues cleared</td></tr>`;
        } else {
            duesData.forEach(row => {
                totalDues += parseFloat(row.amount || 0);
                dueBody += `
                    <tr>
                        <td>${row.time}</td>
                        <td>${row.patient_name}</td>
                        <td>${row.mr_no}</td>
                        <td>${row.collected_by}</td>
                        <td>${row.type}</td>
                        <td class="text-end fw-bold">${formatCurrency(row.amount)}</td>
                    </tr>
                `;
            });
        }
        $("#dueReportTable tbody").html(dueBody);
        $("#total_dues_collected").text(formatCurrency(totalDues));


        // --- 5. EXPENSES TABLE ---
        let expBody = "";
        let totalExp = 0;

        if (!expData || expData.length === 0) {
            expBody = `<tr><td colspan="2" class="text-center text-muted">No expenses found</td></tr>`;
        } else {
            expData.forEach(row => {
                totalExp += parseFloat(row.total_amount || 0);
                expBody += `
                    <tr>
                        <td>${row.head_name}</td>
                        <td class="text-end fw-bold">${formatCurrency(row.total_amount)}</td>
                    </tr>
                `;
            });
        }
        $("#expenseReportTable tbody").html(expBody);
        $("#total_expense_amount").text(formatCurrency(totalExp));

    }

    // Helper: Format Currency
    function formatCurrency(val) {
        return parseFloat(val || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // =============================================================
    // EXPORT PDF FUNCTION
    // =============================================================
    $("#exportPDF").on("click", function () {
        const { jsPDF } = window.jspdf;
        let doc = new jsPDF();
        let y = 15;
        let date = $("#report_date").val();

        // Title
        doc.setFontSize(16);
        doc.text(`Daily Closing Report - ${date}`, 14, y);
        y += 10;

        // 1. Financial Summary Section
        let income = $("#summary_income").text();
        let expense = $("#summary_expense").text();
        let net = $("#summary_net").text();

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text("Financial Summary:", 14, y);
        doc.setFont(undefined, 'normal');
        y += 6;
        doc.text(`Income: ${income}   |   Expense: ${expense}   |   Net Cash: ${net}`, 14, y);
        y += 12;

        // 2. Films Inventory Section
        let fStart = $("#film_start").text();
        let fUse = $("#film_use").text();
        let fClose = $("#film_closing").text();

        doc.setFont(undefined, 'bold');
        doc.text("Films Inventory:", 14, y);
        doc.setFont(undefined, 'normal');
        y += 6;
        doc.text(`Opening Stock: ${fStart}   |   Used Today: ${fUse}   |   Closing Stock: ${fClose}`, 14, y);
        y += 12;

        function addTable(title, tableId, themeColor) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text(title, 14, y);
            y += 5;

            doc.autoTable({
                html: tableId,
                startY: y,
                theme: 'grid',
                headStyles: { fillColor: themeColor },
                styles: { fontSize: 9 },
                didDrawPage: function (data) {
                    y = data.cursor.y; 
                }
            });
            y = doc.lastAutoTable.finalY + 10; 
        }

        addTable("Tests Summary", "#testReportTable", [13, 110, 253]); 
        addTable("Due Clearance", "#dueReportTable", [25, 135, 84]); 
        addTable("Expenses", "#expenseReportTable", [220, 53, 69]); 

        doc.save(`Daily_Report_${date}.pdf`);
    });

    // =============================================================
    // EXPORT EXCEL FUNCTION
    // =============================================================
    $("#exportExcel").on("click", function () {
        let wb = XLSX.utils.book_new();

        let summaryData = [
            ["Daily Closing Report", $("#report_date").val()],
            [],
            ["FINANCIAL SUMMARY", ""],
            ["Total Income", $("#summary_income").text()],
            ["Total Expense", $("#summary_expense").text()],
            ["Net Cash", $("#summary_net").text()],
            [],
            ["FILMS INVENTORY", ""],
            ["Opening Stock", $("#film_start").text()],
            ["Used Today", $("#film_use").text()],
            ["Closing Stock", $("#film_closing").text()]
        ];

        let wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        function appendSheet(tableId, sheetName) {
            let table = document.getElementById(tableId.replace("#", ""));
            if (table) {
                let ws = XLSX.utils.table_to_sheet(table);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            }
        }

        appendSheet("#testReportTable", "Tests");
        appendSheet("#dueReportTable", "Due Clearance");
        appendSheet("#expenseReportTable", "Expenses");

        XLSX.writeFile(wb, `Daily_Report_${$("#report_date").val()}.xlsx`);
    });

});