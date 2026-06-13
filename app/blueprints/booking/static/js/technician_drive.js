let localDataTableInstance = null;
let activeSessionBookingId = null;
let currentUppyInstance = null;
let pendingMediaUploads = []; // Queue for files ready to be sent

$(document).ready(function () {
    // 1. Initialize Dates
    const today = new Date();
    const onemonthAgo = new Date();
    onemonthAgo.setDate(today.getDate() - 30);
    $('#filterToDate').val(today.toISOString().split('T')[0]);
    $('#filterFromDate').val(onemonthAgo.toISOString().split('T')[0]);

    initSystemComponents();

    // 2. Event Bindings
    $('#btnFilterList').on('click', function() { if (localDataTableInstance) localDataTableInstance.ajax.reload(); });
    $('#btnUpdateFilms').off('click').on('click', executeFilmStateUpdate);
    $('#btnSendChat').off('click').on('click', dispatchUnifiedPayload);
    
    $('#chatMessageInput').on('keypress', function (e) {
        if (e.which === 13) { e.preventDefault(); dispatchUnifiedPayload(); }
    });

    // 3. Attachment Drawer Toggle Logic
    $('#btnToggleDrawer').on('click', function() {
        const $drawer = $('#attachmentDrawer');
        const $btn = $(this);
        
        if ($drawer.hasClass('open')) {
            $drawer.removeClass('open');
            $btn.removeClass('active');
        } else {
            $drawer.addClass('open');
            $btn.addClass('active');
            if (!currentUppyInstance) setupUppyMultipartEngine();
        }
    });
});

function initSystemComponents() {
    const targetEndpoint = `${APP_BASE_URL}/booking/technician-drive/list`;

    localDataTableInstance = $('#patientsTable').DataTable({
        responsive: true, destroy: true,
        pageLength: 20, paging: false, info: false,
        scrollY: "calc(100vh - 180px)", 
        ajax: {
            url: targetEndpoint,
            data: function(d) {
                d.from_date = $('#filterFromDate').val();
                d.to_date = $('#filterToDate').val();
                if (d.search && d.search.value) d.search = d.search.value; else delete d.search;
            },
            dataSrc: function (json) { return json.data || json || []; }
        },
        columns: [
            { 
                data: null,
                render: function(data) {
                    const safeName = (data.patient_name || 'Unregistered').replace(/'/g, "\\'");
                    const targetId = data.booking_id || data.id; 
                    return `
                        <div class="py-2 px-3" style="cursor:pointer;" 
                             onclick="mountWorkspaceScope(this, ${targetId}, '${safeName}', '${data.mr_no || ''}', '${data.age || ''}', '${data.gender || ''}', ${data.total_no_of_films_used || 0})">
                            <div class="fw-bold mb-1" style="color: var(--text-main); font-size: 0.95rem;">${data.patient_name || 'Unregistered'}</div>
                            <div class="small fw-medium" style="color: var(--text-muted);">
                                <span style="color: var(--bs-primary);">B#${targetId}</span> &bull; MR: ${data.mr_no || 'N/A'}
                            </div>
                        </div>
                    `;
                }
            },
            {
                data: null, className: "text-end align-middle pe-4",
                render: function(data) {
                    const safeName = (data.patient_name || 'Unregistered').replace(/'/g, "\\'");
                    const targetId = data.booking_id || data.id; 
                    // Render the animated Chevron instead of the ugly blue button
                    return `
                        <div onclick="mountWorkspaceScope(this.closest('tr'), ${targetId}, '${safeName}', '${data.mr_no || ''}', '${data.age || ''}', '${data.gender || ''}', ${data.total_no_of_films_used || 0})" style="cursor:pointer;">
                            <i class="bi bi-chevron-right action-chevron"></i>
                        </div>
                    `;
                }
            }
        ],
        order: [[0, "desc"]],
        language: { search: "", searchPlaceholder: "Search records..." }
    });
}

// -------------------------------------------------------------
// MOBILE & WORKSPACE ORCHESTRATION
// -------------------------------------------------------------
window.mountWorkspaceScope = function(rowElement, bookingId, patientName, mrNo, age, gender, filmsCount) {
    if (!bookingId) return;
    activeSessionBookingId = bookingId;
    
    // Desktop Highlight
    $('#patientsTable tbody tr').removeClass('active-row');
    $(rowElement).closest('tr').addClass('active-row');

    // Mobile View Toggle
    $('body').addClass('mobile-workspace-active');

    // Reset UI
    $('#emptyWorkspacePanel').hide();
    $('#workspacePanel').css('display', 'flex');
    $('#wsPatientName').text(patientName);
    $('#wsBookingId').text(`B#${bookingId}`);
    $('#wsMrNo').text(`MR: ${mrNo}`);
    $('#wsAgeGender').text(`${age} Yrs | ${gender}`);
    $('#filmUsageInput').val(filmsCount || 0);
    $('#chatMessageInput').val('');
    
    resetUploadState();

    syncChatTimelineData(bookingId);
};

window.closeMobileWorkspace = function() {
    $('body').removeClass('mobile-workspace-active');
};

function resetUploadState() {
    pendingMediaUploads = [];
    $('#uploadPreviewArea').hide().empty();
    $('#attachmentDrawer').removeClass('open');
    $('#btnToggleDrawer').removeClass('active');
    if (currentUppyInstance) currentUppyInstance.cancelAll();
}

function executeFilmStateUpdate() {
    if (!activeSessionBookingId) return;
    const currentCountValue = $('#filmUsageInput').val();

    if (typeof myshowLoader === 'function') myshowLoader();
    axios.post(`${APP_BASE_URL}/booking/films/`, { 
        booking_id: activeSessionBookingId, total_new_films_used: currentCountValue,
        usage_type: "Workspace Update", test_id: 0, reason: "Updated via Technician Workspace"
    })
    .then(res => { if (typeof showToastMessage === 'function') showToastMessage('success', 'Films adjusted.'); })
    .finally(() => { if (typeof myhideLoader === 'function') myhideLoader(); });
}

// -------------------------------------------------------------
// CHAT RENDERING (Instagram Style)
// -------------------------------------------------------------
function syncChatTimelineData(bookingId) {
    const $chatWrapper = $('#chatHistoryBox');
    $chatWrapper.empty().append('<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>');

    axios.get(`${APP_BASE_URL}/booking/api/v1/bookings/${bookingId}/chat`)
    .then(response => { compileAndRenderChatTimeline(response.data.messages || []); })
    .catch(error => { $chatWrapper.html('<div class="text-center text-danger py-4 small">Failed to load comments.</div>'); });
}

function compileAndRenderChatTimeline(messages) {
    const $chatWrapper = $('#chatHistoryBox');
    $chatWrapper.empty();
    
    if (!messages || messages.length === 0) {
        $chatWrapper.append('<div class="text-center text-muted py-5 mt-5"><i class="bi bi-chat-left-text fs-1 opacity-50"></i><p class="mt-3">No comments yet.</p></div>');
        return;
    }

    messages.forEach(msg => {
        const senderName = msg.user_name || 'System';
        const initial = senderName.charAt(0).toUpperCase();
        const timeLabel = new Date(msg.created_at).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});

        let mediaHtml = '';
        if (msg.media && msg.media.length > 0) {
            mediaHtml = '<div class="media-grid">';
            msg.media.forEach(attachment => {
                const typeStr = attachment.type || '';
                const ext = attachment.name.split('.').pop().substring(0,3).toUpperCase();
                
                if (typeStr.includes('image')) {
                    mediaHtml += `<a href="${attachment.url}" target="_blank" class="media-tile"><img src="${attachment.url}"></a>`;
                } else {
                    mediaHtml += `
                        <a href="${attachment.url}" target="_blank" class="media-tile doc-tile">
                            <i class="bi bi-file-earmark-text"></i><span>${ext}</span>
                        </a>`;
                }
            });
            mediaHtml += '</div>';
        }

        const safeText = (msg.message || '').replace(/\n/g, '<br>');
        
        $chatWrapper.append(`
            <div class="comment-block">
                <div class="comment-avatar">${initial}</div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-name">${senderName}</span>
                        <span class="comment-time">${timeLabel}</span>
                    </div>
                    ${safeText ? `<div class="comment-text">${safeText}</div>` : ''}
                    ${mediaHtml}
                </div>
            </div>
        `);
    });

    $chatWrapper.animate({ scrollTop: $chatWrapper[0].scrollHeight }, 300);
}

// -------------------------------------------------------------
// UPPY ENGINE (Camera Enabled) & PREVIEW PILLS
// -------------------------------------------------------------
function setupUppyMultipartEngine() {
    const mountingNode = document.getElementById('uppyDashboardContainer');
    if (!mountingNode) return;

    currentUppyInstance = new Uppy.Uppy({
        restrictions: { maxFileSize: 3221225472 },
        autoProceed: true 
    })
    .use(Uppy.Dashboard, {
        target: mountingNode, inline: true, height: 260, 
        showProgressDetails: true, hideUploadButton: true,
        theme: 'light', proudlyDisplayPoweredByUppy: false
    })
    .use(Uppy.Webcam, { // NEW: Camera Integration Enabled
        target: Uppy.Dashboard, modes: ['video-audio', 'video-only', 'audio-only', 'picture'],
        mirror: true, facingMode: 'environment'
    })
    .use(Uppy.AwsS3Multipart, {
        limit: 4,
        createMultipartUpload(file) {
            return axios.post(UPLOAD_API_INIT, {
                filename: file.name, content_type: file.type, target_folder: 'technician_workspace'
            }).then(res => ({ uploadId: res.data.upload_id, key: res.data.file_key }));
        },
        signPart(file, partData) {
            return axios.post(UPLOAD_API_CHUNK, {
                file_key: partData.key, upload_id: partData.uploadId,
                total_parts: 1, partNumber: partData.partNumber
            }).then(res => ({ url: res.data.urls[0].url }));
        },
        completeMultipartUpload(file, uploadData) {
            return axios.post(UPLOAD_API_COMPLETE, {
                file_key: uploadData.key, upload_id: uploadData.uploadId, parts: uploadData.parts
            }).then(res => ({ location: res.data.file_url }));
        },
        abortMultipartUpload(file, opts) { return Promise.resolve(); }
    });

    // Populate WhatsApp-Style Pills when upload completes
    currentUppyInstance.on('upload-success', (file, response) => {
        const fileId = file.id;
        pendingMediaUploads.push({
            id: fileId, // Tracking ID for removal
            file_url: response.body.location, 
            file_name: file.name,
            file_mime_type: file.type, 
            file_size_bytes: file.size
        });
        
        renderPreviewPills();
        
        // Auto-close drawer slightly to show the input
        $('#attachmentDrawer').removeClass('open');
        $('#btnToggleDrawer').removeClass('active');
    });
}

function renderPreviewPills() {
    const $area = $('#uploadPreviewArea');
    if (pendingMediaUploads.length === 0) {
        $area.hide().empty();
        return;
    }

    $area.empty().css('display', 'flex');
    pendingMediaUploads.forEach(media => {
        const icon = media.file_mime_type.includes('image') ? 'bi-image' : 'bi-file-earmark';
        const safeName = media.file_name.length > 15 ? media.file_name.substring(0,12) + '...' : media.file_name;
        
        $area.append(`
            <div class="preview-pill" id="pill-${media.id}">
                <i class="bi ${icon}"></i>
                <span>${safeName}</span>
                <i class="bi bi-x remove-btn" onclick="removePendingMedia('${media.id}')"></i>
            </div>
        `);
    });
}

window.removePendingMedia = function(fileId) {
    pendingMediaUploads = pendingMediaUploads.filter(m => m.id !== fileId);
    if (currentUppyInstance) currentUppyInstance.removeFile(fileId);
    renderPreviewPills();
};

// -------------------------------------------------------------
// UNIFIED SUBMISSION
// -------------------------------------------------------------
async function dispatchUnifiedPayload() {
    if (!activeSessionBookingId) return;

    const targetedMessageBody = $('#chatMessageInput').val().trim();

    // Prevent double submission / empty submission
    if (!targetedMessageBody && pendingMediaUploads.length === 0) return; 

    const $actionBtn = $('#btnSendChat');
    const originalIcon = $actionBtn.html();
    $actionBtn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm text-white"></span>');

    try {
        await axios.post(`${APP_BASE_URL}/booking/api/v1/bookings/${activeSessionBookingId}/chat`, {
            message: targetedMessageBody, 
            media: pendingMediaUploads
        });

        // Interface Clean Reset
        resetUploadState();
        $('#chatMessageInput').val('');
        
        syncChatTimelineData(activeSessionBookingId);

    } catch (error) {
        console.error("Pipeline fault:", error);
        if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to save.');
    } finally {
        $actionBtn.prop('disabled', false).html(originalIcon);
    }
}