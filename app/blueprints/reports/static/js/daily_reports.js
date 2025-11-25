// daily_reports.js
$(document).ready(function () {
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (type, msg) { console[type === "error" ? "error" : "log"](msg); };

    $("#searchBtn").on("click", function () {
        loadAllReports();
    });

    function loadAllReports() {
        const selectedDate = $("#report_date").val();
        if (!selectedDate) {
            alert("Please select a date");
            return;
        }

        myshowLoader();

        Promise.all([
            axios.get(baseUrl + "/reports/daily-report/expenses", { params: { date: selectedDate } }),
            axios.get(baseUrl + "/reports/daily-report/films", { params: { date: selectedDate } }),
            axios.get(baseUrl + "/reports/daily-report/test-report", { params: { date: selectedDate } })
        ])
        .then(function (responses) {
            renderExpenses(responses[0].data);
            renderFilms(responses[1].data);
            renderTests(responses[2].data);
        })
        .catch(function (err) {
            console.error(err);
            showToastMessage("error", "Failed to load daily report.");
        })
        .finally(() => myhideLoader());
    }

    function renderExpenses(data) {
        let html = "";
        let total = data.total_expenses || 0;

        data.items.forEach(item => {
            html += `
                <tr>
                    <td>${item.name}</td>
                    <td>Rs.${item.amount}</td>
                </tr>`;
        });

        $("#expense_table_body").html(html);
        $("#expense_total").text("Rs." + total);
    }

    function renderFilms(data) {
        $("#film_start").text(data.film_start);
        $("#film_closing").text(data.film_closing);
        $("#film_use").text(data.film_use);
    }

    function renderTests(data) {
        let html = "";
        let tests = data.tests || [];

        tests.forEach((t, i) => {
            html += `
                <tr>
                    <td>${i + 1}</td>
                    <td>${t.test_name}</td>
                    <td>${t.frequency}</td>
                </tr>`;
        });

        $("#test_table_body").html(html);
        $("#total_income").text("Rs." + data.total_income);
    }
});
