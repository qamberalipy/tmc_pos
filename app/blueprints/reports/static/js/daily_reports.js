$(document).ready(function () {
    
    // Toast helper fallback if global not found
    function showToast(type, msg) {
        if (typeof showToastMessage === 'function') {
            showToastMessage(type, msg);
        } else if (typeof toastr !== 'undefined') {
            if (type === 'error') toastr.error(msg);
            else if (type === 'warning') toastr.warning(msg);
            else toastr.success(msg);
        } else {
            alert(msg);
        }
    }

    // Initialize Select2 on the Shift Dropdown
    $('#shift_selector').select2({
        theme: 'bootstrap-5',
        placeholder: "Click to select shifts...",
        allowClear: true,
        width: '100%',
        closeOnSelect: false 
    });

    // Auto-fill today's date if empty (8:00 AM lab day boundary)
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

    // Fetch shifts for selected staff
    function fetchStaffShifts() {
        let userId = $("#staff_selector").val();
        let dateStr = $("#report_date").val();
        
        let $shiftContainer = $("#shift_selector_container");
        let $shiftSelector = $("#shift_selector");
        let $spinner = $("#shift_spinner"); 
        
        if (!userId) {
            $shiftContainer.hide();
            $shiftSelector.empty().trigger('change'); 
            return;
        }

        $shiftContainer.fadeIn();
        $spinner.removeClass("d-none");
        $shiftSelector.prop("disabled", true);

        axios.get(`/users/user-shifts/${userId}?date=${dateStr}`)
            .then(res => {
                $shiftSelector.empty(); 
                if (res.data && res.data.length > 0) {
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
                showToast('error', 'Could not load shifts.');
            })
            .finally(() => {
                $spinner.addClass("d-none");
                $shiftSelector.prop("disabled", false);
            });
    }

    // Trigger shifts fetch on initial load if staff is pre-selected
    if ($("#staff_selector").val()) {
        fetchStaffShifts();
    }

    $("#staff_selector, #report_date").on("change", function () {
        fetchStaffShifts();
    });

    // 1. Day Closing Sheet
    $("#btnDaySheet").on("click", function () {
        let date = $("#report_date").val();
        let userId = $("#staff_selector").val();

        if (!date) {
            showToast('warning', 'Please select a date.');
            return;
        }

        let url = `/reports/day-sheet?date=${encodeURIComponent(date)}`;
        if (userId) {
            url += `&user_id=${encodeURIComponent(userId)}`;
        }
        window.open(url, '_blank');
    });

    // 2. Shift Closing Sheet (Requires at least one selected shift)
    $("#btnShiftSheet").on("click", function () {
        let date = $("#report_date").val();
        let userId = $("#staff_selector").val();
        let shiftIds = $("#shift_selector").val();

        if (!date) {
            showToast('warning', 'Please select a date.');
            return;
        }

        // Validate shift selection
        if (!shiftIds || shiftIds.length === 0 || (shiftIds.length === 1 && !shiftIds[0])) {
            showToast('warning', 'Please select at least one shift to generate the Shift Closing Sheet.');
            // If shifts container is hidden (e.g. all staff selected), give clear hint
            if (!$("#shift_selector_container").is(":visible")) {
                showToast('warning', 'Please select a staff member first to view and select their shift.');
            }
            return;
        }

        let cleanShiftIds = shiftIds.filter(id => id && String(id).trim() !== "");
        if (cleanShiftIds.length === 0) {
            showToast('warning', 'Please select at least one valid shift.');
            return;
        }

        let url = `/reports/shift-sheet?date=${encodeURIComponent(date)}&shift_ids=${encodeURIComponent(cleanShiftIds.join(','))}`;
        if (userId) {
            url += `&user_id=${encodeURIComponent(userId)}`;
        }
        window.open(url, '_blank');
    });

    // 3. Cash Envelope Sticker
    $("#btnDaySticker").on("click", function () {
        let date = $("#report_date").val();
        let userId = $("#staff_selector").val();
        let shiftIds = $("#shift_selector").val();

        if (!date) {
            showToast('warning', 'Please select a date.');
            return;
        }

        let url = `/reports/day-sticker?date=${encodeURIComponent(date)}`;
        if (userId) {
            url += `&user_id=${encodeURIComponent(userId)}`;
        }
        if (shiftIds && shiftIds.length > 0 && shiftIds[0]) {
            let cleanShiftIds = shiftIds.filter(id => id && String(id).trim() !== "");
            if (cleanShiftIds.length > 0) {
                url += `&shift_ids=${encodeURIComponent(cleanShiftIds.join(','))}`;
            }
        }
        window.open(url, '_blank');
    });

});
