$(document).ready(function () {

    let initial_from_date = $("#from_date").val();
    let initial_to_date = $("#to_date").val();

    // Auto-fill date if empty
    if (!initial_from_date || !initial_to_date) {
        let today = new Date();
        let prior = new Date();
        prior.setDate(today.getDate() - 30);

        $("#from_date").val(prior.toISOString().split("T")[0]);
        $("#to_date").val(today.toISOString().split("T")[0]);
    }

    loadDashboardData();


    // --------------------------- 
    // Add Films
    // ---------------------------
    // --------------------------- 
    // Reset / Deduct Films (NEW)
    // ---------------------------
    $("#BtnResetFilms").on("click", function () {
        var qty = $("#reset_films_qty").val();
        var reason = $("#reset_reason").val() || "Manual Reset"; // Default reason if empty

        if (!qty || qty <= 0) {
            showToastMessage("error", "Please enter a valid number of films to reset.");
            return;
        }

        myshowLoader();
        axios.post(baseUrl + "/booking/inventory/", {
            quantity: qty,
            transaction_type: "OUT",  // "OUT" deducts from inventory
            reason: reason            // Send the reason to backend
        })
            .then(res => {
                showToastMessage("success", "Films reset successfully");
                $("#reset_films_qty").val("");
                $("#reset_reason").val("");
                $("#resetFilmModal").modal("hide");
                loadDashboardData(); // Refresh the numbers
            })
            .catch(err => {
                showToastMessage("error", err.response?.data?.message || err.message);
            })
            .finally(() => myhideLoader());
    });

    
    $("#Addfilms").on("click", function () {
        var qty = $("#no_of_films").val();
        if (!qty || qty <= 0) {
            showToastMessage("error", "Please enter a valid number of films.");
            return;
        }

        myshowLoader();
        axios.post(baseUrl + "/booking/inventory/", {
            quantity: qty,
            transaction_type: "IN"
        })
            .then(res => {
                showToastMessage("success", res.data.message);
                $("#no_of_films").val("");
                $("#addfilmModal").modal("hide");
                loadDashboardData();
            })
            .catch(err => {
                showToastMessage("error", err.response?.data?.message || err.message);
            })
            .finally(() => myhideLoader());
    });


    // ---------------------------
    // Quick Range Buttons
    // ---------------------------
    $(".range-btn").on("click", function () {
        let text = $(this).text().trim();
        let today = new Date();
        let from_date, to_date;

        if (text === "Last 7 Days") {
            to_date = formatDate(today);
            from_date = formatDate(new Date(today.setDate(today.getDate() - 7)));
        } else if (text === "Last 30 Days") {
            to_date = formatDate(new Date());
            from_date = formatDate(new Date().setDate(new Date().getDate() - 30));
        } else if (text === "This Month") {
            let first = new Date(today.getFullYear(), today.getMonth(), 1);
            from_date = formatDate(first);
            to_date = formatDate(new Date());
        } else if (text === "Custom Range") {
            return;
        }

        $("#from_date").val(from_date);
        $("#to_date").val(to_date);

        loadDashboardData();
    });

    $("#searchBtn").on("click", function () {
        loadDashboardData();
    });


    // =============================================================
    // LOAD DATA MAIN FUNCTION
    // =============================================================
    async function loadDashboardData() {
        myshowLoader();

        let from_date = $("#from_date").val();
        let to_date = $("#to_date").val();

        try {
            const [summaryRes, tableRes] = await Promise.all([
                axios.get(baseUrl + "/booking/inventory/summary", { params: { from_date, to_date } }),
                axios.get(baseUrl + "/booking/get-film-inventory-report", { params: { from_date, to_date } })
            ]);

            // Summary
            $("#total_in").text(summaryRes.data.total_in);
            $("#total_out").text(summaryRes.data.total_out);
            $("#balance").text(summaryRes.data.balance);

            // Table
            loadInventoryReport(tableRes.data.data);

        } catch (err) {
            console.log(err);
            showToastMessage("error", "Error loading dashboard");
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
                        <td colspan="5">${row.date} — ${row.message}</td>
                    </tr>
                `);
            } else {
                tbody.append(`
                    <tr>
                        <td>${row.date}</td>
                        <td>${row.opening}</td>
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
        let wb = XLSX.utils.table_to_book(table, { sheet: "Inventory Report" });
        XLSX.writeFile(wb, "MRI_Inventory_Report.xlsx");
    });


    // =============================================================
    // PDF EXPORT (jsPDF + autoTable)
    // =============================================================
    $("#exportPDF").on("click", function () {
        const { jsPDF } = window.jspdf;
        let doc = new jsPDF("landscape");

        doc.text("MRI Inventory Report", 14, 15);

        doc.autoTable({
            html: "#inventory_report",
            startY: 20,
            theme: "grid",
            styles: { fontSize: 8 }
        });

        doc.save("MRI_Inventory_Report.pdf");
    });


    // Helper
    function formatDate(dateObj) {
        let d = new Date(dateObj);
        return d.toISOString().split("T")[0];
    }

});
