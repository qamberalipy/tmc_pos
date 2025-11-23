$(document).ready(function () {

    let auditTable = null;

    loadDashboardData(); // Initial load

    // --------------------------- 
    // Add Films
    // ---------------------------
    $("#Addfilms").on("click", function () {
        var no_of_films = $("#no_of_films").val();
        if (!no_of_films || no_of_films <= 0) {
            showToastMessage("error", "Please enter a valid number of films.");
            return;
        }

        myshowLoader();
        let payload = { quantity: no_of_films, transaction_type: 'IN' };

        axios.post(baseUrl + "/booking/inventory/", payload)
            .then(res => {
                showToastMessage("success", res.data.message);

                $("#no_of_films").val("");
                $("#addfilmModal").modal("hide");

                loadDashboardData(); // Reload both
            })
            .catch(err => {
                let msg = err.response?.data?.message || err.message;
                showToastMessage("error", msg);
            })
            .finally(() => myhideLoader());
    });

    // ---------------------------
    // Date Range Buttons
    // ---------------------------
    $(".range-btn").on("click", function () {
        let text = $(this).text().trim();
        let today = new Date();
        let from_date, to_date;

        if (text === "Last 7 Days") {
            to_date = formatDate(new Date());
            from_date = formatDate(new Date().setDate(today.getDate() - 7));
        } else if (text === "Last 30 Days") {
            to_date = formatDate(new Date());
            from_date = formatDate(new Date().setDate(today.getDate() - 30));
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
    // MAIN FUNCTION - Parallel Calls (Promise.all)
    // =============================================================
    async function loadDashboardData() {
        myshowLoader();

        let from_date = $("#from_date").val();
        let to_date = $("#to_date").val();

        try {
            const summaryPromise = axios.get(baseUrl + "/booking/inventory/summary", {
                params: { from_date, to_date }
            });

            const tablePromise = axios.get(baseUrl + "/booking/films-audit/data", {
                params: { from_date, to_date }
            });

            // Run both in parallel
            const [summaryRes, tableRes] = await Promise.all([summaryPromise, tablePromise]);

            // ----------------------
            // 1️⃣ Update Summary Cards
            // ----------------------
            $("#total_in").text(summaryRes.data.total_in);
            $("#total_out").text(summaryRes.data.total_out);
            $("#balance").text(summaryRes.data.balance);

            // ----------------------
            // 2️⃣ Load DataTable
            // ----------------------
            loadAuditTable(tableRes.data.data);

        } catch (err) {
            console.log("Error:", err);
            showToastMessage("error", "Error loading dashboard");
        } finally {
            myhideLoader();
        }
    }

    // =============================================================
    // DATATABLE INITIALIZATION / RELOAD
    // =============================================================
    function loadAuditTable(data) {

        if (auditTable) {
            auditTable.clear().rows.add(data).draw();
            return;
        }

        auditTable = $("#testReg_table").DataTable({
            data: data,
            responsive: true,
            destroy: true,
            columns: [
                { data: "booking_id" },
                { data: "films_required" },
                { data: "films_used" },
                { data: "usage_type" },
                { data: "reason" },
                { data: "used_by" },
                { data: "used_at" }
                
            ]
        });
    }

    function formatDate(dateObj) {
        let d = new Date(dateObj);
        let month = ("0" + (d.getMonth() + 1)).slice(-2);
        let day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }

});
