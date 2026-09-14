$(document).ready(function () {
    // --- Utility stubs (match the rest of the app) ---
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () {};
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () {};
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (t, m) { console.log(t, m); };

    const baseUrl = window.baseUrl || "";
    let lastData = null; // keep last fetched data for export

    // --- Default month to current ---
    (function initMonth() {
        const now = new Date();
        const mm = ("0" + (now.getMonth() + 1)).slice(-2);
        $("#monthPicker").val(now.getFullYear() + "-" + mm);
    })();

    // --- Events ---
    $("#searchBtn").on("click", loadReport);

    // =============== FETCH & RENDER ===============
    function loadReport() {
        const month = $("#monthPicker").val();
        if (!month) { showToastMessage("error", "Please select a month."); return; }

        myshowLoader();
        axios.get(baseUrl + "/transactions/monthly-expense-log/data", { params: { month } })
            .then(res => {
                lastData = res.data;
                renderReport(lastData);
            })
            .catch(err => {
                console.error("Failed to load monthly expense log:", err);
                showToastMessage("error", "Failed to load report data.");
                $("#reportRoot").html('<div class="mel-empty">Error loading data.</div>');
            })
            .finally(() => myhideLoader());
    }

    function fmtMoney(n) {
        return "Rs. " + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtMonthLabel(monthStr) {
        const [y, m] = monthStr.split("-");
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        return months[parseInt(m, 10) - 1] + " " + y;
    }

    function fmtDateLabel(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }

    // =============== RENDER ===============
    function renderReport(data) {
        const root = $("#reportRoot").empty();
        if (!data || (!data.days || data.days.length === 0)) {
            root.html('<div class="mel-empty"><i class="bi bi-inbox" style="font-size:2.5rem;"></i><p class="mt-2">No expenses found for this month.</p></div>');
            return;
        }

        // --- Title ---
        root.append(`<div class="mel-title">MONTHLY EXPENSE REPORT &mdash; ${data.branch || "Branch"}</div>`);
        root.append(`<div class="mel-subtitle">${fmtMonthLabel(data.month)}</div>`);

        // --- Summary Cards ---
        root.append(`
            <div class="mel-summary-cards">
                <div class="mel-card mel-card-1">
                    <div class="label">Total Month Expenses</div>
                    <div class="value">${fmtMoney(data.total_expenses)}</div>
                </div>
                <div class="mel-card mel-card-2">
                    <div class="label">Daily Average Spend</div>
                    <div class="value">${fmtMoney(data.daily_average)}</div>
                </div>
                <div class="mel-card mel-card-3">
                    <div class="label">Total Transactions</div>
                    <div class="value">${data.total_transactions}</div>
                </div>
            </div>
        `);

        // --- Head Breakdown ---
        root.append('<div class="mel-section-title">Expense Head Breakdown</div>');
        let headHtml = `<table class="mel-table"><thead><tr>
            <th>Expense Head</th><th>Count</th><th>Total Spending</th><th>% of Total</th><th>Daily Average</th>
        </tr></thead><tbody>`;
        data.head_breakdown.forEach(h => {
            headHtml += `<tr>
                <td class="text-start">${h.head}</td>
                <td>${h.count}</td>
                <td class="text-end">${fmtMoney(h.total)}</td>
                <td>${h.pct}%</td>
                <td class="text-end">${fmtMoney(h.avg)}</td>
            </tr>`;
        });
        headHtml += `</tbody></table>`;
        root.append(headHtml);

        // --- Day-grouped sections ---
        root.append('<div class="mel-section-title">Daily Expense Detail</div>');
        let globalSno = 1;

        data.days.forEach(day => {
            root.append(`<div class="mel-day-header"><i class="bi bi-calendar3"></i> ${fmtDateLabel(day.date)}</div>`);
            let tbl = `<table class="mel-table"><thead><tr>
                <th style="width:50px;">S.No</th>
                <th>Date</th>
                <th>Expense Head</th>
                <th>Expense Detail</th>
                <th>Amount</th>
                <th>Paid To</th>
                <th>Authorized By</th>
            </tr></thead><tbody>`;

            day.rows.forEach(r => {
                tbl += `<tr>
                    <td>${globalSno++}</td>
                    <td>${r.date}</td>
                    <td class="text-start">${r.expense_head}</td>
                    <td class="text-start">${r.detail}</td>
                    <td class="text-end">${fmtMoney(r.amount)}</td>
                    <td>${r.paid_to}</td>
                    <td style="font-size:0.8rem;">${r.authorized_by}</td>
                </tr>`;
            });

            // subtotal row
            tbl += `<tr class="mel-subtotal-row">
                <td colspan="4" class="text-end">Total ${fmtDateLabel(day.date)} Expenditure</td>
                <td class="text-end">${fmtMoney(day.total)}</td>
                <td colspan="2"></td>
            </tr>`;
            tbl += `</tbody></table>`;
            root.append(tbl);
        });

        // --- Grand total row ---
        root.append(`<table class="mel-table"><tbody>
            <tr class="mel-grand-total-row">
                <td colspan="4" class="text-end" style="border:none;">Total Monthly Expenses</td>
                <td class="text-end" style="border:none;">${fmtMoney(data.total_expenses)}</td>
                <td colspan="2" style="border:none;"></td>
            </tr>
        </tbody></table>`);
    }

    // =============== PDF (Print View) ===============
    $(document).on("click", "#btnPrintPdf", function () {
        if (!lastData || !lastData.days || lastData.days.length === 0) {
            showToastMessage("error", "No data loaded yet.");
            return;
        }
        const d = lastData;

        // Build head breakdown rows
        let headRows = d.head_breakdown.map(h =>
            `<tr><td style="text-align:left">${h.head}</td><td>${h.count}</td><td style="text-align:right">${fmtMoney(h.total)}</td><td>${h.pct}%</td><td style="text-align:right">${fmtMoney(h.avg)}</td></tr>`
        ).join("");

        // Build day detail sections
        let sno = 1;
        let dayBlocks = d.days.map(day => {
            let rows = day.rows.map(r =>
                `<tr><td>${sno++}</td><td>${r.date}</td><td style="text-align:left">${r.expense_head}</td><td style="text-align:left">${r.detail}</td><td style="text-align:right">${fmtMoney(r.amount)}</td><td>${r.paid_to}</td><td style="font-size:0.8rem">${r.authorized_by}</td></tr>`
            ).join("");
            return `
                <tr style="background:#e0e7ff;"><td colspan="7" style="font-weight:bold;text-align:left;padding:8px;">${fmtDateLabel(day.date)}</td></tr>
                ${rows}
                <tr style="background:#fef3c7;font-weight:bold;"><td colspan="4" style="text-align:right">Total ${fmtDateLabel(day.date)} Expenditure</td><td style="text-align:right">${fmtMoney(day.total)}</td><td colspan="2"></td></tr>
            `;
        }).join("");

        const win = window.open("", "_blank");
        win.document.write(`<html><head><title>Monthly Expense Log</title>
        <style>
            @page { size: landscape; margin: 10mm; }
            body { font-family: Arial, sans-serif; padding: 12px; font-size: 12px; }
            h2 { margin: 0 0 2px; text-align: center; }
            .meta { text-align: center; color: #555; margin-bottom: 14px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #999; padding: 5px 7px; text-align: center; }
            thead th { background: #f1f1f1; }
            .summary { display: flex; gap: 20px; margin-bottom: 14px; }
            .summary div { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; }
            .summary .val { font-size: 1.2rem; font-weight: bold; }
            .summary .lbl { font-size: 0.75rem; color: #666; text-transform: uppercase; }
            .grand-row td { background: #1e3a5f; color: #fff; font-weight: bold; font-size: 0.95rem; }
        </style></head><body>
        <h2>MONTHLY EXPENSE REPORT &mdash; ${d.branch || "Branch"}</h2>
        <div class="meta">${fmtMonthLabel(d.month)}</div>

        <div class="summary">
            <div><div class="lbl">Total Month Expenses</div><div class="val">${fmtMoney(d.total_expenses)}</div></div>
            <div><div class="lbl">Daily Average Spend</div><div class="val">${fmtMoney(d.daily_average)}</div></div>
            <div><div class="lbl">Total Transactions</div><div class="val">${d.total_transactions}</div></div>
        </div>

        <h4>Expense Head Breakdown</h4>
        <table><thead><tr><th>Expense Head</th><th>Count</th><th>Total Spending</th><th>% of Total</th><th>Daily Average</th></tr></thead>
        <tbody>${headRows}</tbody></table>

        <h4>Daily Expense Detail</h4>
        <table><thead><tr><th style="width:40px">S.No</th><th>Date</th><th>Expense Head</th><th>Expense Detail</th><th>Amount</th><th>Paid To</th><th>Authorized By</th></tr></thead>
        <tbody>${dayBlocks}
        <tr class="grand-row"><td colspan="4" style="text-align:right;border:none;">Total Monthly Expenses</td><td style="text-align:right;border:none;">${fmtMoney(d.total_expenses)}</td><td colspan="2" style="border:none;"></td></tr>
        </tbody></table>

        </body></html>`);
        win.document.close();
        win.onload = () => win.print();
    });

    // =============== EXCEL (SheetJS) ===============
    $(document).on("click", "#btnExportExcel", function () {
        if (!lastData || !lastData.days || lastData.days.length === 0) {
            showToastMessage("error", "No data loaded yet.");
            return;
        }
        const d = lastData;
        const aoa = [];

        // Title & meta
        aoa.push(["MONTHLY EXPENSE REPORT — " + (d.branch || "Branch")]);
        aoa.push(["Month: " + fmtMonthLabel(d.month)]);
        aoa.push([]);

        // Summary
        aoa.push(["Total Month Expenses", d.total_expenses, "", "Daily Average Spend", d.daily_average, "", "Total Transactions", d.total_transactions]);
        aoa.push([]);

        // Head breakdown header
        aoa.push(["Expense Head", "Count", "Total Spending", "% of Total", "Daily Average"]);
        d.head_breakdown.forEach(h => {
            aoa.push([h.head, h.count, h.total, h.pct + "%", h.avg]);
        });
        aoa.push([]);

        // Detail header
        const detailHeader = ["S.No", "Date", "Expense Head", "Expense Detail", "Amount", "Paid To", "Authorized By"];
        aoa.push(detailHeader);

        let sno = 1;
        d.days.forEach(day => {
            day.rows.forEach(r => {
                aoa.push([sno++, r.date, r.expense_head, r.detail, r.amount, r.paid_to, r.authorized_by]);
            });
            // subtotal
            aoa.push(["", "", "", "Total " + day.date + " Expenditure", day.total, "", ""]);
        });

        // Grand total
        aoa.push([]);
        aoa.push(["", "", "", "Total Monthly Expenses", d.total_expenses, "", ""]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Monthly Expense Log");
        XLSX.writeFile(wb, `Monthly_Expense_Log_${d.month}.xlsx`);
    });

});
