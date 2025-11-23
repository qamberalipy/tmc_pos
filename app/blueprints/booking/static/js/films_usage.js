$(document).ready(function () {
    if (typeof window.myshowLoader !== "function") window.myshowLoader = function () { };
    if (typeof window.myhideLoader !== "function") window.myhideLoader = function () { };
    if (typeof window.showToastMessage !== "function") window.showToastMessage = function (type, msg) { console[type === "error" ? "error" : "log"](msg); };

    let auditTable = null;

    (function initDates() {
        const fromEl = $("#from_date");
        const toEl = $("#to_date");
        if (!fromEl.val() || !toEl.val()) {
            let today = new Date();
            let prior = new Date(); prior.setDate(today.getDate() - 30);
            fromEl.val(formatDate(prior));
            toEl.val(formatDate(today));
        }
    })();

    loadAuditData();

    $(".range-btn").on("click", function () {
        const range = $(this).data("range");
        const today = new Date();
        let fromDate, toDate;
        if (range === "today") fromDate = toDate = formatDate(today);
        else {
            toDate = formatDate(today);
            let d = new Date();
            d.setDate(today.getDate() - parseInt(range));
            fromDate = formatDate(d);
        }
        $("#from_date").val(fromDate);
        $("#to_date").val(toDate);
        loadAuditData();
    });

    $("#searchBtn").on("click", function () {
        loadAuditData();
    });

    function loadAuditData() {
        myshowLoader();
        const from_date = $("#from_date").val();
        const to_date = $("#to_date").val();

        axios.get(baseUrl + "/booking/films-audit/data", { params: { from_date, to_date } })
            .then((res) => {
                const rows = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
                renderAuditTable(rows);
            })
            .catch((err) => {
                console.error("Failed to load audit data:", err);
                showToastMessage("error", "Failed to load audit data");
                renderAuditTable([]);
            })
            .finally(() => myhideLoader());
    }

    function renderAuditTable(data) {
        if (auditTable) {
            auditTable.clear().rows.add(data).draw();
            return;
        }

        auditTable = $("#testReg_table").DataTable({
            data: data,
            responsive: true,
            deferRender: true,
            autoWidth: false,
            columns: [
                { data: "booking_id", defaultContent: "" },
                { data: "films_required", defaultContent: "" },
                { data: "films_used", defaultContent: "" },
                { data: "usage_type", defaultContent: "" },
                { data: "reason", defaultContent: "" },
                { data: "used_by", defaultContent: "" },
                { data: "used_at", defaultContent: "" }
            ],
            dom: 'Bfrtip',
            buttons: [
                {
                    extend: 'excelHtml5',
                    text: '<i class="bi bi-file-earmark-excel"></i> Download Excel',
                    className: 'btn btn-success',
                    title: 'Films Usage Logs',
                    filename: function () {
                        const d = new Date();
                        return 'Films_Usage_Logs_' + d.toISOString().slice(0, 10);
                    },
                    exportOptions: { columns: ':visible' }
                },
                {
                    extend: 'pdfHtml5',
                    text: '<i class="bi bi-file-earmark-pdf"></i> Download PDF',
                    className: 'btn btn-danger',
                    title: 'Films Usage Logs',
                    filename: function () {
                        const d = new Date();
                        return 'Films_Usage_Logs_' + d.toISOString().slice(0, 10);
                    },
                    orientation: 'landscape',
                    pageSize: 'A4',
                    exportOptions: { columns: ':visible' },
                    customize: function (doc) {
                        if (doc.content && doc.content[1] && doc.content[1].table) {
                            doc.content[1].table.widths = Array(doc.content[1].table.body[0].length).fill('*');
                            doc.styles.tableBodyEven.fontSize = 9;
                            doc.styles.tableBodyOdd.fontSize = 9;
                            doc.styles.tableHeader.fontSize = 10;
                        }
                    }
                }
            ]
            ,
            language: { emptyTable: "No records to display" },
            columnDefs: [{ targets: "_all", defaultContent: "" }]
        });

        try {
            const btnContainer = auditTable.buttons().container();
            if (btnContainer && $("#exportButtons").children().length === 0) {
                $(btnContainer).addClass('ms-2').appendTo('#exportButtons');
            }
        } catch (err) {
            console.warn("Could not move DataTable buttons to custom container", err);
        }
    }

    function formatDate(dateObj) {
        const d = new Date(dateObj);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const day = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + month + "-" + day;
    }
});
