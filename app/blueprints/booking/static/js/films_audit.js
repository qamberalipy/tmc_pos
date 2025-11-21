$(document).ready(function () {

    loadInventorySummary(); // Load default

    // Save IN transaction
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

                loadInventorySummary(); // REFRESH STATISTICS
            })
            .catch(err => {
                let msg = err.response?.data?.message || err.message;
                showToastMessage("error", msg);
            })
            .finally(() => myhideLoader());
    });


    /* ---------------------------------------------------
       DATE RANGE FILTER BUTTONS
    --------------------------------------------------- */
    $(".range-btn").on("click", function () {
        let text = $(this).text().trim();
        let today = new Date();
        let from_date, to_date;

        if (text === "Last 7 Days") {
            to_date = formatDate(today);
            from_date = formatDate(new Date(today.setDate(today.getDate() - 7)));
        }
        else if (text === "Last 30 Days") {
            to_date = formatDate(new Date());
            from_date = formatDate(new Date(today.setDate(today.getDate() - 30)));
        }
        else if (text === "This Month") {
            let first = new Date(today.getFullYear(), today.getMonth(), 1);
            from_date = formatDate(first);
            to_date = formatDate(new Date());
        }
        else if (text === "Custom Range") {
            return; // user manually selects
        }

        // Set date fields
        $("#from_date").val(from_date);
        $("#to_date").val(to_date);

        loadInventorySummary();
    });


    $("#searchBtn").on("click", function () {
        loadInventorySummary();
    });


    /* ---------------------------------------------------
       FUNCTION TO LOAD INVENTORY SUMMARY
    --------------------------------------------------- */
function convertToISO(dateStr) {
    if (!dateStr) return null;

    // If format is DD/MM/YYYY
    if (dateStr.includes("/")) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month}-${day}`;
    }

    // If format is already YYYY-MM-DD (default HTML date input)
    if (dateStr.includes("-")) {
        return dateStr;
    }

    return null;
}

    function loadInventorySummary() {
        console.log("Before Date Values:", $("#from_date").val(), $("#to_date").val());
        let from_date = convertToISO($("#from_date").val());
        let to_date = convertToISO($("#to_date").val());
        console.log("From:", from_date, "To:", to_date);    
        myshowLoader();
        axios.get(baseUrl + "/booking/inventory/summary", {
            params: { from_date, to_date }
        })
            .then(res => {
                $("#total_in").text(res.data.total_in);
                $("#total_out").text(res.data.total_out);
                $("#balance").text(res.data.balance);
                myhideLoader();
            })
            .catch(err => {
                console.log("Error:", err);
                myhideLoader();
            });
    }


    function formatDate(dateObj) {
        let month = ("0" + (dateObj.getMonth() + 1)).slice(0-2);
        let day = ("0" + dateObj.getDate()).slice(0-2);
        return dateObj.getFullYear() + "-" + month + "-" + day;
    }

});
