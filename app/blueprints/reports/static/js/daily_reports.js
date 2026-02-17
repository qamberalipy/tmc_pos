$(document).ready(function () {

    // Auto-fill today's date if empty
    if (!$("#report_date").val()) {
        let today = new Date();
        $("#report_date").val(today.toISOString().split("T")[0]);
    }

    loadDailyReport();

    $("#searchBtn").on("click", function () {
        loadDailyReport();
    });

    // =============================================================
    // MAIN LOADER FUNCTION
    // =============================================================
    async function loadDailyReport() {

        let date = $("#report_date").val();
        let userId = $("#staff_selector").val(); // Get Staff ID if selector exists

        if (!date) {
            showToastMessage("error", "Please select a date");
            return;
        }

        // 1. Show Loading State
        // Tables
        $("#testReportTable tbody").html('<tr><td colspan="3" class="text-center">Loading...</td></tr>');
        $("#dueReportTable tbody").html('<tr><td colspan="6" class="text-center">Loading...</td></tr>');
        $("#expenseReportTable tbody").html('<tr><td colspan="2" class="text-center">Loading...</td></tr>');
        
        // Cards (Reset to 0)
        $("#summary_income, #summary_expense, #summary_net").text("0.00");
        $("#film_start, #film_use, #film_closing").text("0");

        try {
            myshowLoader();

            // 2. Prepare API Parameters
            const params = { date: date };
            if (userId) {
                params.user_id = userId;
            }

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
            
            // Clear loading state on error
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

        // --- 2. FILMS INVENTORY CARDS (UPDATED) ---
        // filmsData is now { film_start: X, film_closing: Y, film_use: Z }
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
            dueBody = `<tr><td colspan="6" class="text-center text-muted">No dues cleared today</td></tr>`;
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

        // 2. Films Inventory Section (Text Only, no table)
        let fStart = $("#film_start").text();
        let fUse = $("#film_use").text();
        let fClose = $("#film_closing").text();

        doc.setFont(undefined, 'bold');
        doc.text("Films Inventory:", 14, y);
        doc.setFont(undefined, 'normal');
        y += 6;
        doc.text(`Opening Stock: ${fStart}   |   Used Today: ${fUse}   |   Closing Stock: ${fClose}`, 14, y);
        y += 12;

        // Helper Function for Tables
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
            y = doc.lastAutoTable.finalY + 10; // Spacing after table
        }

        // 3. Tests Table
        addTable("Tests Summary", "#testReportTable", [13, 110, 253]); // Blue
        
        // 4. Dues Table
        addTable("Due Clearance", "#dueReportTable", [25, 135, 84]); // Green
        
        // 5. Expenses Table
        addTable("Expenses", "#expenseReportTable", [220, 53, 69]); // Red

        doc.save(`Daily_Report_${date}.pdf`);
    });

    // =============================================================
    // EXPORT EXCEL FUNCTION
    // =============================================================
    $("#exportExcel").on("click", function () {
        let wb = XLSX.utils.book_new();

        // 1. Create a "Summary" Sheet with Financials + Films
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

        // 2. Append other tables as separate sheets
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