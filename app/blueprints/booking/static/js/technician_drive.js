let localDataTableInstance = null;
let activeSessionBookingId = null;
let currentUppyInstance = null;

$(document).ready(function () {
    // Set Default Dates (Today & 2 Days Ago)
    const today = new Date();
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);

    $('#filterToDate').val(today.toISOString().split('T')[0]);
    $('#filterFromDate').val(twoDaysAgo.toISOString().split('T')[0]);

    initSystemComponents();

    // Event Bindings
    $('#btnFilterList').on('click', function() {
        if (localDataTableInstance) localDataTableInstance.ajax.reload();
    });
    $('#btnUpdateFilms').off('click').on('click', executeFilmStateUpdate);
    $('#btnSendChat').off('click').on('click', dispatchChatPayload);
});

function initSystemComponents() {
    const targetEndpoint = `${APP_BASE_URL}/booking/technician-drive/list`;

    localDataTableInstance = $('#patientsTable').DataTable({
        responsive: true,
        destroy: true,
        pageLength: 10,
        ajax: {
            url: targetEndpoint,
            data: function(d) {
                // Pass the dates natively to the API request
                d.from_date = $('#filterFromDate').val();
                d.to_date = $('#filterToDate').val();
                
                // Safely handle search if server-side processing is ever turned on
                if (d.search && d.search.value) {
                    d.search = d.search.value;
                } else {
                    delete d.search;
                }
            },
            dataSrc: function (json) {
                return json.data || json || [];
            },
            error: function(xhr, status, error) {
                console.error("API Fetch Error:", error);
                if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to load worklist.');
            }
        },
        columns: [
            // Bullet 1: Show Booking ID instead of MR
            { data: "id", className: "fw-bold text-dark align-middle" },
            // Bullet 2: Show Proper Patient Info
            { 
                data: null,
                className: "align-middle",
                render: function(data) {
                    const age = data.age || '--';
                    const gender = data.gender || '--';
                    const mr = data.mr_no || 'N/A';
                    return `
                        <div class="d-flex flex-column">
                            <span class="fw-bold text-primary" style="font-size: 0.95rem;">${data.patient_name || 'Unregistered'}</span>
                            <span class="text-muted small">MR: ${mr}</span>
                            <span class="text-muted small">Age: ${age} | ${gender}</span>
                        </div>
                    `;
                }
            },
            {
                data: null,
                className: "text-end align-middle",
                render: function(data) {
                    const safeName = (data.patient_name || '').replace(/'/g, "\\'");
                    const safeMr = (data.mr_no || '');
                    const safeAge = (data.age || '--');
                    const safeGender = (data.gender || '--');
                    
                    return `<button type="button" class="btn btn-sm btn-primary px-3 rounded-pill shadow-sm" 
                            onclick="mountWorkspaceScope(this, ${data.id}, '${safeName}', '${safeMr}', '${safeAge}', '${safeGender}', ${data.total_no_of_films_used || 0})">
                            Open <i class="bi bi-arrow-right-short"></i></button>`;
                }
            }
        ],
        order: [[0, "desc"]],
        language: { search: "", searchPlaceholder: "Search list..." }
    });
}
// Bullet 4 & 7: Loading explicit headers & Shifting Focus
window.mountWorkspaceScope = function(btnElement, bookingId, patientName, mrNo, age, gender, filmsCount) {
    activeSessionBookingId = bookingId;
    
    // UI Table Row Highlighting
    $('#patientsTable tbody tr').removeClass('active-row');
    $(btnElement).closest('tr').addClass('active-row');

    // UI Panel Switching
    $('#emptyWorkspacePanel').hide();
    $('#workspacePanel').fadeIn();

    // Populate Detailed Header Badges
    $('#wsPatientName').text(patientName);
    $('#wsBookingId').text(`Booking ID: ${bookingId}`);
    $('#wsMrNo').text(`MR: ${mrNo}`);
    $('#wsAgeGender').text(`Age: ${age} | ${gender}`);
    
    $('#filmUsageInput').val(filmsCount || 0);
    $('#chatMessageInput').val('');

    // Fetch Chat Log
    syncChatTimelineData(bookingId);

    // Initialize/Reset Minimal Uppy
    if (!currentUppyInstance) {
        setupUppyMultipartEngine();
    } else {
        currentUppyInstance.cancelAll();
    }

    // Auto-focus the chat box to draw user attention to the right side
    setTimeout(() => {
        $('#chatMessageInput').focus();
    }, 100);
};

function executeFilmStateUpdate() {
    if (!activeSessionBookingId) return;
    const currentCountValue = $('#filmUsageInput').val();

    if (typeof myshowLoader === 'function') myshowLoader();

    axios.post(`${APP_BASE_URL}/booking/films/`, { 
        booking_id: activeSessionBookingId,
        total_new_films_used: currentCountValue,
        usage_type: "Workspace Update", 
        test_id: 0, 
        reason: "Updated via Technician Workspace"
    })
    .then(response => {
        if (typeof showToastMessage === 'function') showToastMessage('success', 'Films adjusted successfully.');
        if (localDataTableInstance) localDataTableInstance.ajax.reload(null, false);
    })
    .catch(error => {
        console.error("Film update error:", error);
        if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to update films.');
    })
    .finally(() => {
        if (typeof myhideLoader === 'function') myhideLoader();
    });
}

function syncChatTimelineData(bookingId) {
    const $chatWrapper = $('#chatHistoryBox');
    
    // Keep overlay intact if it's there, just clear the bubbles
    $chatWrapper.children('.chat-bubble-row, .text-center').remove();
    $chatWrapper.append('<div class="text-center py-5 loading-msg"><div class="spinner-border text-primary"></div></div>');

    axios.get(`${APP_BASE_URL}/booking/api/v1/bookings/${bookingId}/chat`)
    .then(response => {
        $chatWrapper.find('.loading-msg').remove();
        compileAndRenderChatTimeline(response.data.messages || []);
    })
    .catch(error => {
        $chatWrapper.find('.loading-msg').remove();
        $chatWrapper.append('<div class="text-center text-danger py-5"><i class="bi bi-shield-exclamation fs-2"></i><br>Failed to sync history.</div>');
    });
}

function compileAndRenderChatTimeline(messages) {
    const $chatWrapper = $('#chatHistoryBox');

    if (!messages || messages.length === 0) {
        $chatWrapper.append('<div class="text-center text-muted small py-5 empty-msg">No comments logged yet. Start below.</div>');
        return;
    }

    messages.forEach(msg => {
        const isMe = (parseInt(msg.user_id) === INTERNAL_USER_ID || msg.user_name === 'You');
        const bubbleClass = isMe ? 'msg-right' : 'msg-left';
        const senderName = isMe ? 'You' : (msg.user_name || 'System');
        const timeLabel = new Date(msg.created_at).toLocaleString();

        let mediaHtml = '';
        if (msg.media && msg.media.length > 0) {
            mediaHtml = '<div class="chat-attachment-grid">';
            msg.media.forEach(attachment => {
                const typeStr = attachment.type || '';
                // Formatting File Size Native Output
                const sizeKB = (attachment.size / 1024).toFixed(1);
                
                if (typeStr.includes('image')) {
                    mediaHtml += `
                        <a href="${attachment.url}" target="_blank" class="chat-attachment-card">
                            <img src="${attachment.url}" alt="${attachment.name}">
                            <small class="d-block mt-1 text-muted" style="font-size:0.6rem;">${sizeKB} KB</small>
                        </a>`;
                } else {
                    mediaHtml += `
                        <a href="${attachment.url}" target="_blank" class="chat-attachment-card generic-doc text-decoration-none">
                            <i class="bi bi-file-earmark-arrow-down-fill"></i>
                            <small class="text-truncate d-block mt-2 w-100 font-monospace">${attachment.name}</small>
                            <small class="d-block text-muted" style="font-size:0.65rem;">${sizeKB} KB</small>
                        </a>`;
                }
            });
            mediaHtml += '</div>';
        }

        const safeText = (msg.message || '').replace(/\n/g, '<br>');

        const bubbleHtml = `
            <div class="chat-bubble-row ${bubbleClass}">
                <div class="chat-bubble-body">
                    <span class="chat-msg-sender">${senderName}</span>
                    <div>${safeText}</div>
                    ${mediaHtml}
                    <span class="chat-msg-meta">${timeLabel}</span>
                </div>
            </div>
        `;
        $chatWrapper.append(bubbleHtml);
    });

    $chatWrapper.animate({ scrollTop: $chatWrapper[0].scrollHeight }, 300);
}

function setupUppyMultipartEngine() {
    const mountingNode = document.getElementById('uppyDashboardContainer');
    if (!mountingNode) return;

    currentUppyInstance = new Uppy.Uppy({
        restrictions: { maxFileSize: 3221225472 }, // 3GB limit
        autoProceed: false
    })
    .use(Uppy.Dashboard, {
        target: mountingNode, 
        inline: true, 
        height: 180, // Bullet 6: Restricted height to prevent UI blowouts
        showProgressDetails: true, 
        hideUploadButton: true,
        theme: 'light', 
        proudlyDisplayPoweredByUppy: false
    })
    .use(Uppy.AwsS3Multipart, {
        limit: 4,
        createMultipartUpload(file) {
            return axios.post(`${APP_BASE_URL}/api/upload/init`, {
                filename: file.name, content_type: file.type, target_folder: 'technician_workspace'
            }).then(res => ({ uploadId: res.data.upload_id, key: res.data.file_key }));
        },
        signPart(file, partData) {
            return axios.post(`${APP_BASE_URL}/api/upload/chunk-urls`, {
                file_key: partData.uploadId, upload_id: partData.uploadId,
                total_parts: 1, partNumber: partData.partNumber
            }).then(res => ({ url: res.data.urls[0].url }));
        },
        completeMultipartUpload(file, uploadData) {
            return axios.post(`${APP_BASE_URL}/api/upload/complete`, {
                file_key: uploadData.key, upload_id: uploadData.uploadId, parts: uploadData.parts
            }).then(res => ({ location: res.data.file_url }));
        }
    });
}

async function dispatchChatPayload() {
    if (!activeSessionBookingId) return;

    const targetedMessageBody = $('#chatMessageInput').val().trim();
    const targetedActiveUploadFiles = currentUppyInstance ? currentUppyInstance.getFiles() : [];

    if (!targetedMessageBody && targetedActiveUploadFiles.length === 0) {
        if (typeof showToastMessage === 'function') showToastMessage('warning', 'Type a message or attach a file.');
        return;
    }

    // Bullet 5: Visual Lock state for large file uploads
    const isUploadingFiles = targetedActiveUploadFiles.length > 0;
    if (isUploadingFiles) {
        $('#uploadLockOverlay').css('display', 'flex');
    }
    
    const $actionBtn = $('#btnSendChat');
    $actionBtn.prop('disabled', true).html('<div class="spinner-border spinner-border-sm"></div>');

    try {
        let compiledMediaIds = [];

        // Storage Integration
        if (isUploadingFiles) {
            const uploadResult = await currentUppyInstance.upload();
            if (uploadResult.failed.length > 0) throw new Error("File upload failed.");

            for (const file of uploadResult.successful) {
                const dbRes = await axios.post(`${APP_BASE_URL}/booking/technician-media/${activeSessionBookingId}`, {
                    file_url: file.response.body.location,
                    file_name: file.name,
                    file_mime_type: file.type,
                    file_size_bytes: file.size
                });
                if (dbRes.data && dbRes.data.media_id) compiledMediaIds.push(dbRes.data.media_id);
            }
        }

        // Post Chat Message
        await axios.post(`${APP_BASE_URL}/booking/api/v1/bookings/${activeSessionBookingId}/chat`, {
            message: targetedMessageBody, media_ids: compiledMediaIds
        });

        // Reset
        $('#chatMessageInput').val('');
        if (currentUppyInstance) currentUppyInstance.cancelAll();

        syncChatTimelineData(activeSessionBookingId);

    } catch (error) {
        console.error("Pipeline fault:", error);
        if (typeof showToastMessage === 'function') showToastMessage('error', 'Failed to send message.');
    } finally {
        // Unlock UI
        $('#uploadLockOverlay').css('display', 'none');
        $actionBtn.prop('disabled', false).html('<i class="bi bi-send-fill fs-5 mb-1"></i><span class="small fw-bold">Send Msg</span>');
    }
}