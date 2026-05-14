$(document).ready(function () {
    const API_BASE = typeof baseUrl !== 'undefined' ? baseUrl : '';

    let selectedFile = null;
    let finalUploadedUrl = null;
    let isUploadingProcess = false;

    // =======================================================
    // 1. FETCH DATA AND RENDER TABLE
    // =======================================================
    window.getReportedBookings = function() {
        if (typeof myshowLoader === 'function') myshowLoader();

        axios.get(`${API_BASE}/reports/bookings/reportedcase`)
            .then(res => {
                let data = res.data;
                let dtable = $("#doctorReportedTable").DataTable({
                    destroy: true,
                    responsive: true,
                    pageLength: 10,
                    ordering: false,
                    language: { emptyTable: "No reported cases found." }
                });

                dtable.clear().draw();

                $.each(data, function (i, item) {
                    let bookingIdHtml = `<span class="badge bg-light text-dark border">B#${item.booking_id}</span>`;

                    let patientHtml = `
                        <div class="d-flex flex-column">
                            <span class="fw-bold">${item.patient_name || 'N/A'}</span>
                            <small class="text-muted">${item.age || 'N/A'} Yrs | ${item.gender || 'N/A'}</small>
                        </div>`;

                    let testName = item.tests && item.tests.test_name ? item.tests.test_name : "N/A";
                    let testHtml = `<span class="badge badge-test">${testName}</span>`;

                    let statusHtml = `<span class="badge bg-success text-white"><i class="bi bi-check-circle"></i> Reported</span>`;

                    let timeHtml = `
                        <div class="d-flex flex-column small">
                            <span class="text-muted"><i class="bi bi-arrow-down-right"></i> ${item.assigned_at || '-'}</span>
                            <span class="text-primary"><i class="bi bi-arrow-up-right"></i> ${item.reported_at || '-'}</span>
                        </div>`;

                    let actionBtn = `
                        <div class="d-flex justify-content-center gap-2">
                            <button class="btn btn-sm btn-warning btn-edit" 
                                data-report-id="${item.report_details_id}" 
                                data-booking-id="${item.booking_id}"
                                data-patient="${encodeURIComponent(item.patient_name)}"
                                data-test="${encodeURIComponent(testName)}"
                                data-age="${item.age}"
                                data-gender="${item.gender}"
                                title="Edit / View Report">
                                <i class="bi bi-pencil-square"></i> Update
                            </button>
                        </div>`;

                    dtable.row.add([bookingIdHtml, patientHtml, testHtml, statusHtml, timeHtml, actionBtn]).draw(false);
                });

                if (typeof myhideLoader === 'function') myhideLoader();
            })
            .catch(err => {
                console.error(err);
                if (typeof myhideLoader === 'function') myhideLoader();
                Swal.fire('Error', 'Failed to load reported cases.', 'error');
            });
    }

    getReportedBookings();

    // =======================================================
    // 2. FETCH REPORT DATA AND OPEN MODAL
    // =======================================================
    $('#doctorReportedTable tbody').on('click', '.btn-edit', function () {
        let reportId = $(this).data('report-id');
        let bookingId = $(this).data('booking-id');
        
        $("#edit_report_id").val(reportId);
        $("#edit_booking_id").val(bookingId);
        $("#edit_bookingId_display").val(`B#${bookingId}`);
        $("#edit_patientName").val(decodeURIComponent($(this).data('patient')));
        $("#edit_testName").val(decodeURIComponent($(this).data('test')));
        $("#edit_age").val($(this).data('age'));
        $("#edit_gender").val($(this).data('gender'));

        resetUpdateUI();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('editReportModal')).show();
        fetchExistingDocument(reportId);
    });

    function fetchExistingDocument(reportId) {
        $("#documentIframeContainer").html(`<span class="text-muted"><div class="spinner-border spinner-border-sm"></div> Loading document...</span>`);
        
        axios.get(`${API_BASE}/reports/get-report-data/${reportId}`)
            .then(res => {
                let data = res.data;
                if (data.report_file_url) {
                    renderPreview(data.report_file_url, data.report_file_name);
                } else {
                    $("#documentIframeContainer").html(`
                        <div class="text-center p-4">
                            <i class="bi bi-file-earmark-text display-4 text-secondary"></i>
                            <h6 class="mt-2 text-muted">Legacy Text Report Found</h6>
                            <p class="small text-muted mb-0">This report was generated using the old text system. Upload a document to replace it.</p>
                        </div>
                    `);
                }
            })
            .catch(err => {
                $("#documentIframeContainer").html(`<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Failed to load document.</span>`);
            });
    }

    function renderPreview(fileUrl, fileName) {
        let isPdf = fileUrl.toLowerCase().includes('.pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));
        
        if (isPdf) {
            $("#documentIframeContainer").html(`<iframe class="preview-iframe" src="${fileUrl}"></iframe>`);
        } else {
            let officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
            $("#documentIframeContainer").html(`<iframe class="preview-iframe" src="${officeUrl}"></iframe>`);
        }
    }

    // =======================================================
    // 3. UI STATE MANAGEMENT FOR FILE REPLACEMENT
    // =======================================================
    function resetUpdateUI() {
        selectedFile = null;
        finalUploadedUrl = null;
        isUploadingProcess = false;

        $('#fileInput').val('');
        $('#btnUpdateReport').prop('disabled', true);
        
        // Reset badge to original state
        $('#documentStatusBadge').removeClass('bg-success').addClass('bg-secondary').html('<i class="bi bi-clock-history"></i> Original Document');
        
        $('#documentPreviewZone').show();
        $('#documentSelectionZone, #uploadProgressZone').hide();
        $('#uploadProgressBar').css('width', '0%');
    }

    $('#btnShowReplace').on('click', function() {
        $('#documentPreviewZone').hide();
        $('#documentSelectionZone').fadeIn();
    });

    $('#btnCancelReplace').on('click', function() {
        // If they click cancel, simply hide the drag/drop zone and go back to the single preview zone
        $('#documentSelectionZone').hide();
        $('#documentPreviewZone').fadeIn();
    });

    // =======================================================
    // 4. DRAG & DROP CLOUD UPLOAD LOGIC
    // =======================================================
    const dropZone = document.getElementById('documentSelectionZone');
    if (dropZone) {
        dropZone.addEventListener('click', () => $('#fileInput').click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0]);
        });
    }

    $('#fileInput').on('change', function(e) {
        if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
    });

    function handleFileSelection(file) {
        const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(file.type)) return Swal.fire('Invalid File', 'Please upload a PDF or Word document.', 'error');
        if (file.size > 15 * 1024 * 1024) return Swal.fire('File Too Large', 'Maximum allowed size is 15MB.', 'error');

        selectedFile = file;
        executeCloudUpload();
    }

    async function executeCloudUpload() {
        if (!selectedFile) return;
        isUploadingProcess = true;
        
        let bookingId = $("#edit_booking_id").val();

        $('#documentSelectionZone').hide();
        $('#uploadProgressZone').fadeIn();
        $('#selectedFileName').text(selectedFile.name);

        const updateProgress = (pct, text) => { $('#uploadProgressBar').css('width', `${pct}%`); $('#uploadStatusText').text(text); };

        try {
            updateProgress(5, "Initializing connection...");
            const initRes = await axios.post(`${API_BASE}/uploads/api/upload/init`, { 
                filename: selectedFile.name, content_type: selectedFile.type, target_folder: `doctor_reports/booking_${bookingId}` 
            });
            const { upload_id, file_key } = initRes.data;

            updateProgress(10, "Preparing secure transfer...");
            const CHUNK_SIZE = 5 * 1024 * 1024; 
            const totalParts = Math.ceil(selectedFile.size / CHUNK_SIZE);
            const urlsRes = await axios.post(`${API_BASE}/uploads/api/upload/chunk-urls`, { file_key, upload_id, total_parts: totalParts });
            
            let uploadedParts = [];
            for (let i = 0; i < urlsRes.data.urls.length; i++) {
                updateProgress(10 + Math.floor((i / urlsRes.data.urls.length) * 80), `Uploading part ${i+1}...`);
                const chunk = selectedFile.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const uploadRes = await axios.put(urlsRes.data.urls[i].url, chunk, { headers: { 'Content-Type': selectedFile.type } });
                
                let etag = uploadRes.headers.etag;
                if (!etag.startsWith('"')) etag = `"${etag}"`;
                uploadedParts.push({ PartNumber: urlsRes.data.urls[i].part_number, ETag: etag });
            }

            updateProgress(95, "Finalizing cloud assembly...");
            const completeRes = await axios.post(`${API_BASE}/uploads/api/upload/complete`, { file_key, upload_id, parts: uploadedParts });
            
            finalUploadedUrl = completeRes.data.file_url;
            updateProgress(100, "Upload Complete!");

            setTimeout(() => {
                $('#uploadProgressZone').hide();
                $('#documentPreviewZone').fadeIn();
                
                // Update Badge to show it's a new unsaved document
                $('#documentStatusBadge').removeClass('bg-secondary').addClass('bg-success').html('<i class="bi bi-check-circle"></i> New Unsaved Document');
                
                // Load the newly uploaded file into the single preview zone
                renderPreview(finalUploadedUrl, selectedFile.name);
                
                isUploadingProcess = false;
                $('#btnUpdateReport').prop('disabled', false); // Enable Save button
            }, 600);

        } catch (error) {
            console.error(error);
            isUploadingProcess = false; 
            resetUpdateUI();
            Swal.fire('Upload Failed', 'Cloud connection failed. Please try again.', 'error');
        }
    }

    // =======================================================
    // 5. UPDATE DATABASE (PUT)
    // =======================================================
    $('#btnUpdateReport').on('click', async function() {
        if (!finalUploadedUrl) return;
        
        let reportId = $("#edit_report_id").val();
        let btn = $(this); 
        let originalText = btn.html();
        
        btn.html('<span class="spinner-border spinner-border-sm"></span> Saving...').prop('disabled', true);

        const payload = {
            report_file_url: finalUploadedUrl,
            report_file_name: selectedFile.name,
            file_mime_type: selectedFile.type,
            file_size_bytes: selectedFile.size
        };

        try {
            await axios.put(`${API_BASE}/reports/api/update-report/${reportId}`, payload);
            
            bootstrap.Modal.getInstance(document.getElementById('editReportModal')).hide();
            Swal.fire({
                title: 'Success!',
                text: 'Report document has been successfully updated.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            
            getReportedBookings(); 
            
        } catch (error) {
            Swal.fire('Update Failed', error.response?.data?.error || 'Failed to update document.', 'error');
            btn.html(originalText).prop('disabled', false);
        }
    });

    const editModalEl = document.getElementById('editReportModal');
    if (editModalEl) {
        editModalEl.addEventListener('hide.bs.modal', function (event) {
            if (isUploadingProcess) {
                event.preventDefault(); 
                Swal.fire('Warning', 'Upload in progress. Please wait until it finishes.', 'warning');
            }
        });
    }
});