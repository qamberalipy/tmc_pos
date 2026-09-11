$(document).ready(function () {

    let initial_from_date = $("#from_date").val();
    let initial_to_date = $("#to_date").val();

    // Auto-fill date if empty -> Current month
    if (!initial_from_date || !initial_to_date) {
        let today = new Date();
        let first = new Date(today.getFullYear(), today.getMonth(), 1);
        $("#from_date").val(formatDate(first));
        $("#to_date").val(formatDate(today));
    }

    loadReport();

    $("#searchBtn").on("click", function () {
        loadReport();
    });

    // =============================================================
    // LOAD DATA MAIN FUNCTION
    // =============================================================
    async function loadReport() {
        myshowLoader();

        let from_date = $("#from_date").val();
        let to_date = $("#to_date").val();

        try {
            const tableRes = await axios.get(baseUrl + "/booking/get-film-inventory-report", { params: { from_date, to_date } });

            // Table
            loadInventoryReport(tableRes.data.data);

        } catch (err) {
            console.log(err);
            showToastMessage("error", "Error loading report");
        } finally {
            myhideLoader();
        }
    }

    // =============================================================
    // INVENTORY REPORT TABLE (COLSPAN SUPPORT)
    // =============================================================
    function loadInventoryReport(data) {
        const tbody = $("#inventory_body");
        tbody.empty();

        data.forEach(row => {
            if (row.type === "packet") {
                tbody.append(`
                    <tr style="background:yellow; font-weight:bold;">
                        <td colspan="6">${row.date} — ${row.message}</td>
                    </tr>
                `);
            } else {
                tbody.append(`
                    <tr>
                        <td>${row.date}</td>
                        <td>${row.opening}</td>
                        <td>${row.closing}</td>
                        <td>${row.closing}</td>
                        <td>${row.used}</td>
                        <td>${row.total_use}</td>
                    </tr>
                `);
            }
        });
    }

    // =============================================================
    // EXCEL EXPORT (SheetJS)
    // =============================================================
    $("#exportExcel").on("click", function () {
        let table = document.getElementById("inventory_report");
        let wb = XLSX.utils.table_to_book(table, { sheet: "Film Usage Log" });
        XLSX.writeFile(wb, "Film_Usage_Log.xlsx");
    });

    // =============================================================
    // PDF EXPORT (jsPDF + autoTable)
    // =============================================================
    $("#exportPDF").on("click", function () {
        const { jsPDF } = window.jspdf;
        let doc = new jsPDF("landscape");

        doc.text("Film Usage Log", 14, 15);

        doc.autoTable({
            html: "#inventory_report",
            startY: 20,
            theme: "grid",
            styles: { fontSize: 8 }
        });

        doc.save("Film_Usage_Log.pdf");
    });

    // Helper
    function formatDate(dateObj) {
        let d = new Date(dateObj);
        let year = d.getFullYear();
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

});
