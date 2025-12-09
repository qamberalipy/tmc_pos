$(document).ready(function () {

    // Auto-fill today's date
    if (!$("#report_date").val()) {
        let today = new Date();
        $("#report_date").val(today.toISOString().split("T")[0]);
    }

    loadDailyReport();

    $("#searchBtn").on("click", function () {
        loadDailyReport();
    });

    // MAIN LOADER FUNCTION
    async function loadDailyReport() {

        let date = $("#report_date").val();

        if (!date) {
            showToastMessage("error", "Please select a date");
            return;
        }

        $("#daily-report-area").html(`
            <div class="text-center py-4">Loading report...</div>
        `);

        try {
            myshowLoader();

            const [testRes, filmsRes, expRes] = await Promise.all([
                axios.get(`/reports/daily-report/test-report`, { params: { date } }),
                axios.get(`/reports/daily-report/films`, { params: { date } }),
                axios.get(`/reports/daily-report/expenses`, { params: { date } })
            ]);

            renderDailyReport(testRes.data, filmsRes.data, expRes.data, date);

        } catch (err) {
            console.log(err);
            $("#daily-report-area").html(
                `<div class="alert alert-danger text-center">Error loading report</div>`
            );
        } finally {
            myhideLoader();
        }
    }

    // RENDER REPORT HTML
    function renderDailyReport(test, films, expenses, date) {

        let totalIncome = test.total_income || 0;
        let totalExpense = expenses.total_expenses || 0;
        let remainingCash = totalIncome - totalExpense;

        let html = `
        <div id="reportExportBox" style="width: 100%; max-width: 800px; margin: auto;">
            
            <h5 class="text-center mb-3 report-title">TMC – Civil Branch Daily Report</h5>

            <div class="section-header">Basic Information</div>
            <table class="table table-bordered report-table">
                <tr><td><b>Date & Day:</b></td><td>${date}</td></tr>
                <tr><td><b>Total Income:</b></td><td>Rs. ${totalIncome.toFixed(2)}</td></tr>
            </table>

            <div class="section-header">Expenses Head</div>
            <table class="table table-bordered report-table">
                <thead><tr><th>Item</th><th>Amount</th></tr></thead>
                <tbody>
        `;

        expenses.items.forEach((item, index) => {
            html += `
                <tr>
                    <td>${index + 1}. ${item.name}</td>
                    <td>Rs. ${item.amount}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>

            <table class="table table-bordered report-table">
                <tr><td><b>Total Expense:</b></td><td>Rs. ${totalExpense.toFixed(2)}</td></tr>
                <tr><td><b>Remaining Balance Cash:</b></td><td>Rs. ${remainingCash.toFixed(2)}</td></tr>
            </table>

            <div class="section-header">Daily Films Report</div>
            <table class="table table-bordered report-table">
                <tr><td>Film Start</td><td>${films.film_start}</td></tr>
                <tr><td>Film Closing</td><td>${films.film_closing}</td></tr>
                <tr><td>Film Use</td><td>${films.film_use}</td></tr>
            </table>

            <div class="section-header">Daily Test Report</div>
            <table class="table table-bordered report-table" id="testReportTable">
                <thead>
                    <tr><th>ID</th><th>Test Name</th><th>Frequency</th></tr>
                </thead>
                <tbody>
        `;

        test.tests.forEach((t, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${t.test_name}</td>
                    <td>${t.frequency}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        </div>
        `;

        $("#daily-report-area").html(html);
    }

    // EXPORT TO EXCEL
    $("#exportExcel").on("click", function () {
        let element = document.getElementById("reportExportBox");
        let wb = XLSX.utils.table_to_book(element, { sheet: "Daily Report" });
        XLSX.writeFile(wb, "Daily_Report.xlsx");
    });

    // EXPORT TO PDF (A4 + auto pages)
// ================================
// EXPORT CLEAN PDF (NO BLANK PAGES)
// ================================
$("#exportPDF").on("click", function () {

    const { jsPDF } = window.jspdf;

    let doc = new jsPDF("p", "pt", "a4");

    let pageWidth = doc.internal.pageSize.getWidth();

    // ------- PAGE TITLE ---------
    doc.setFontSize(16);
    doc.text("TMC – Civil Branch Daily Report", pageWidth / 2, 40, { align: "center" });

    let y = 70;

    // ============ SECTION 1: BASIC INFO ============
    doc.setFontSize(12);
    doc.setTextColor(0);

    doc.autoTable({
        startY: y,
        theme: "grid",
        headStyles: { fillColor: [230, 230, 230] },
        styles: { fontSize: 10, halign: "left" },
        body: [
            ["Date", $("#report_date").val()],
            ["Total Income", $("#reportExportBox").find("td:contains('Total Income')").next().text()],
            ["Total Expense", $("#reportExportBox").find("td:contains('Total Expense')").next().text()],
            ["Remaining Cash", $("#reportExportBox").find("td:contains('Remaining Cash')").next().text()],
        ],
    });

    y = doc.lastAutoTable.finalY + 20;

    // ============ SECTION 2: EXPENSE TABLE ============
    doc.setFontSize(12);
    doc.text("Expenses Head", 40, y);
    y += 10;

    let expRows = [];
    $("#reportExportBox table:eq(1) tbody tr").each(function () {
        expRows.push([
            $(this).find("td:eq(0)").text(),
            $(this).find("td:eq(1)").text()
        ]);
    });

    doc.autoTable({
        startY: y,
        theme: "grid",
        head: [["Item", "Amount"]],
        headStyles: { fillColor: [200, 220, 255] },
        styles: { fontSize: 10 },
        body: expRows
    });

    y = doc.lastAutoTable.finalY + 20;

    // ============ SECTION 3: FILMS REPORT ============
    doc.setFontSize(12);
    doc.text("Daily Films Report", 40, y);
    y += 10;

    let filmRows = [];
    $("#reportExportBox table:eq(2) tr").each(function () {
        filmRows.push([
            $(this).find("td:eq(0)").text(),
            $(this).find("td:eq(1)").text()
        ]);
    });

    doc.autoTable({
        startY: y,
        theme: "grid",
        headStyles: { fillColor: [255, 240, 200] },
        styles: { fontSize: 10 },
        body: filmRows
    });

    y = doc.lastAutoTable.finalY + 20;

    // ============ SECTION 4: TEST REPORT ============
    doc.setFontSize(12);
    doc.text("Daily Test Report", 40, y);
    y += 10;

    let testRows = [];
    $("#testReportTable tbody tr").each(function () {
        testRows.push([
            $(this).find("td:eq(0)").text(),
            $(this).find("td:eq(1)").text(),
            $(this).find("td:eq(2)").text(),
        ]);
    });

    doc.autoTable({
        startY: y,
        theme: "grid",
        head: [["ID", "Test Name", "Frequency"]],
        headStyles: { fillColor: [220, 255, 220] },
        styles: { fontSize: 10 },
        body: testRows
    });

    doc.save("Daily_Report.pdf");
});


});
