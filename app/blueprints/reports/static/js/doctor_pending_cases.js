$(document).ready(function () {
    const API_BASE = typeof baseUrl !== 'undefined' ? baseUrl : '';

    let currentItem = null;
    let selectedFile = null;
    let finalUploadedUrl = null;
    let isUploadingProcess = false;

    // =======================================================
    // 1. DATA TABLE & API CALLS (Restored Old Layout)
    // =======================================================
    window.getDoctorBookings = function() {
        if (typeof myshowLoader === 'function') myshowLoader();

        axios.get(`${API_BASE}/reports/bookings/pendingcase`)
            .then(res => {
                let data = res.data;
                let dtable = $("#doctorPendingTable").DataTable({
                    destroy: true,
                    responsive: true,
                    pageLength: 10,
                    ordering: false,
                    language: { emptyTable: "No pending cases found." }
                });

                dtable.clear().draw();

                $.each(data, function (i, item) {
                    let reportIDHtml = `<span>R#${item.reporting_id}</span>`;
                    let bookingIdHtml = `<span>${item.booking_id}</span>`;
                    let testsHtml = `<span class="badge badge-test">${item.test_name}</span>`;
                    let statusHtml = `<span class="badge bg-warning text-dark">${item.status}</span>`;
                    
                    let assignedBy = item.assigned_by || "-";
                    let assignedAt = item.assigned_at || "-";

                    // Technician Comment Button (Restored)
                    let commentBtn;
                    if (item.technician_comments) {
                        let safeCommentData = encodeURIComponent(item.technician_comments);
                        commentBtn = `<button class="btn btn-sm btn-info text-white view-comments" style="min-width: 125px;" data-comments="${safeCommentData}"><i class="bi bi-chat-left-text-fill"></i> View History</button>`;
                    } else {
                        commentBtn = `<button class="btn btn-sm btn-light text-muted border" disabled style="min-width: 125px;"><i class="bi bi-dash-circle"></i> No History</button>`;
                    }
                    
                    let safeItem = encodeURIComponent(JSON.stringify(item));
                    let actionBtn = `
                        <div class="d-flex justify-content-center gap-2">
                            <button class="btn btn-sm btn-primary btn-upload" data-item="${safeItem}" title="Upload Report"><i class="bi bi-cloud-arrow-up"></i></button>
                            <button class="btn btn-sm btn-danger btn-decline" data-id="${item.reporting_id}" title="Decline Assignment"><i class="bi bi-x-circle"></i></button>
                        </div>
                    `;

                    dtable.row.add([ reportIDHtml, bookingIdHtml, testsHtml, statusHtml, commentBtn, assignedBy, assignedAt, actionBtn ]).draw(false);
                });

                if (typeof myhideLoader === 'function') myhideLoader();
            })
            .catch(err => {
                console.error(err);
                if (typeof myhideLoader === 'function') myhideLoader();
                Swal.fire('Error', 'Failed to load pending cases.', 'error');
            });
    };

    getDoctorBookings();

    // =======================================================
    // 2. COMMENTS & DECLINE LOGIC
    // =======================================================
    $('#doctorPendingTable tbody').on('click', '.view-comments', function () {
        let rawData = $(this).data("comments");
        try {
            let jsonString = decodeURIComponent(rawData);
            let parsedObj = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            let comments = parsedObj.comments || [];
            
            let html = "";
            if (comments.length === 0) {
                html = `<div class="text-muted text-center py-2">No comments yet.</div>`;
            } else {
                comments.forEach(c => {
                    html += `
                        <div class="timeline-item d-flex">
                            <div class="timeline-icon">
                                <span class="rounded-circle bg-success d-inline-flex align-items-center justify-content-center" style="width:28px; height:28px;">
                                    <i class="bi bi-person-fill-check text-white" style="font-size: 14px;"></i>
                                </span>
                            </div>
                            <div class="timeline-content ms-3 flex-grow-1">
                                <div class="card pb-2 px-3 border-0 shadow-sm bg-light">
                                    <div class="d-flex justify-content-between mt-2">
                                        <strong>${c.user_name} <span class="badge bg-secondary" style="font-size:10px">${c.role}</span></strong>
                                        <small class="text-muted">${c.datetime}</small>
                                    </div>
                                    <div class="mt-1">${c.comment}</div>
                                </div>
                            </div>
                        </div>`;
                });
            }
            $("#commentsHistory").html(html);
            $("#commentsModal").modal("show");
        } catch (e) {
            console.error("Error parsing comments:", e);
        }
    });

    $('#doctorPendingTable tbody').on('click', '.btn-decline', function () {
        let reportingId = $(this).data('id');
        Swal.fire({
            title: "Are you sure?",
            text: "You are about to decline this test assignment!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#212529",
            confirmButtonText: "Yes, decline it!"
        }).then((result) => {
            if (result.isConfirmed) {
                if (typeof myshowLoader === 'function') myshowLoader();
                axios.post(`${API_BASE}/reports/decline-assignment`, { reporting_id: reportingId })
                    .then(() => {
                        Swal.fire("Declined!", "The assignment has been declined.", "success");
                        getDoctorBookings();
                    })
                    .catch(err => Swal.fire("Error!", err.response?.data?.error || "Failed.", "error"))
                    .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
            }
        });
    });

    // =======================================================
    // 3. UPLOAD MODAL LOGIC
    // =======================================================
    $('#doctorPendingTable tbody').on('click', '.btn-upload', function () {
        currentItem = JSON.parse(decodeURIComponent($(this).data('item')));
        
        // Populate Compact Form Fields
        $('#rep_bookingId').val(currentItem.booking_id);
        $('#rep_patientName').val(currentItem.patient_name || 'N/A');
        $('#rep_age').val(currentItem.age || 'N/A');
        $('#rep_gender').val(currentItem.gender || 'N/A');
        $('#rep_testName').val(currentItem.test_name);

        resetUploadUI();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('uploadModal')).show();
    });

    function resetUploadUI() {
        selectedFile = null; finalUploadedUrl = null; isUploadingProcess = false;
        $('#fileInput').val('');
        $('#btnSaveReport').prop('disabled', true);
        $('#selectionZone').show();
        $('#uploadProgressZone, #previewZone').hide();
        $('#uploadProgressBar').css('width', '0%');
    }

    const dropZone = document.getElementById('selectionZone');
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
    $('#btnReplaceFile').on('click', resetUploadUI);

    function handleFileSelection(file) {
        const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(file.type)) return Swal.fire('Invalid File', 'Please upload a PDF or Word document.', 'error');
        if (file.size > 15 * 1024 * 1024) return Swal.fire('File Too Large', 'Maximum allowed size is 15MB.', 'error');

        selectedFile = file;
        executeCloudUpload();
    }

    async function executeCloudUpload() {
        if (!selectedFile || !currentItem) return;
        isUploadingProcess = true;
        
        $('#selectionZone').hide();
        $('#uploadProgressZone').fadeIn();
        $('#selectedFileName').text(selectedFile.name);
        $('#btnSaveReport').prop('disabled', true); 

        const updateProgress = (pct, text) => { $('#uploadProgressBar').css('width', `${pct}%`); $('#uploadStatusText').text(text); };

        try {
            updateProgress(5, "Initializing connection...");
            const initRes = await axios.post(`${API_BASE}/uploads/api/upload/init`, { 
                filename: selectedFile.name, content_type: selectedFile.type, target_folder: `doctor_reports/booking_${currentItem.booking_id}` 
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
                $('#previewZone').fadeIn();
                
                // Word Preview Integration Fix
                if (selectedFile.type === 'application/pdf') {
                    $('#iframeContainer').html(`<iframe class="preview-iframe" src="${finalUploadedUrl}"></iframe>`);
                } else {
                    let officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(finalUploadedUrl)}`;
                    $('#iframeContainer').html(`<iframe class="preview-iframe" src="${officeUrl}"></iframe>`);
                }
                
                isUploadingProcess = false;
                $('#btnSaveReport').prop('disabled', false);
            }, 600);

        } catch (error) {
            console.error(error);
            isUploadingProcess = false; resetUploadUI();
            Swal.fire('Upload Failed', 'Cloud connection failed. Please try again.', 'error');
        }
    }

    // =======================================================
    // 4. DATABASE SUBMIT
    // =======================================================
    $('#btnSaveReport').on('click', async function() {
        if (!finalUploadedUrl || !currentItem) return;
        
        let btn = $(this); let originalText = btn.html();
        btn.html('<span class="spinner-border spinner-border-sm"></span> Submitting...').prop('disabled', true);

        const dbPayload = {
            booking_id: currentItem.booking_id,
            doctor_id: currentItem.assigned_doctor_id || currentItem.doctor_id || $('#currentDoctorId').val() || null,
            patient_name: currentItem.patient_name || 'Unknown',
            gender: currentItem.gender || 'Unknown',
            age: currentItem.age || 0,
            test_id: currentItem.test_id,
            report_file_url: finalUploadedUrl,
            report_file_name: selectedFile.name,
            file_mime_type: selectedFile.type,
            file_size_bytes: selectedFile.size
        };

        try {
            await axios.post(`${API_BASE}/reports/api/save-report`, dbPayload);
            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
            Swal.fire('Success!', 'Report submitted successfully.', 'success');
            getDoctorBookings(); 
        } catch (error) {
            Swal.fire('Database Error', error.response?.data?.error || 'Failed to save.', 'error');
            btn.html(originalText).prop('disabled', false);
        }
    });
});