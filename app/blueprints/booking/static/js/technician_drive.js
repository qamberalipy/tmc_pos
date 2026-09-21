const { createApp } = Vue;

const app = createApp({
    delimiters: ['[[', ']]'],
    data() {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(today.getDate() - 30);
        
        return {
            bookings: [],
            loadingWorklist: false,
            filters: {
                from: oneMonthAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0],
                search: ''
            },
            selectedBooking: null,
            messages: [],
            loadingChat: false,
            
            // Composer & Upload
            newMessage: '',
            drawerOpen: false,
            dragActive: false,
            pendingMediaUploads: [],
            uppyInstance: null,
            sending: false,

            // Films Modal
            filmsModalObj: null,
            savingFilms: false,
            filmsForm: {
                tests: [],
                testId: '',
                changedFilms: '',
                cause: 'Extra',
                reason: '',
                grandTotalFilms: 0
            }
        };
    },
    computed: {
        groupedMessages() {
            if (!this.messages || this.messages.length === 0) return [];
            
            const groups = [];
            let currentGroup = null;
            let lastDateLabel = null;

            this.messages.forEach(msg => {
                const dateObj = new Date(msg.created_at);
                const dateLabel = this.formatDateSeparator(dateObj);
                
                if (dateLabel !== lastDateLabel) {
                    currentGroup = { dateLabel: dateLabel, messages: [] };
                    groups.push(currentGroup);
                    lastDateLabel = dateLabel;
                }
                
                // Add computed properties to the message for UI
                msg.is_own = (msg.user_id && msg.user_id === INTERNAL_USER_ID) || msg.is_optimistic;
                msg.senderName = msg.user_name || 'System';
                msg.initial = msg.senderName.charAt(0).toUpperCase();
                msg.timeLabel = dateObj.toLocaleString([], { hour: '2-digit', minute:'2-digit' });
                msg.safeText = (msg.message || '').replace(/\n/g, '<br>');
                
                currentGroup.messages.push(msg);
            });
            return groups;
        },
        currentTestFilms() {
            if (!this.filmsForm.testId) return 0;
            const t = this.filmsForm.tests.find(x => x.test_id == this.filmsForm.testId);
            return t ? (t.films_used || 0) : 0;
        },
        newTotalFilms() {
            return this.filmsForm.grandTotalFilms + (Number(this.filmsForm.changedFilms) || 0);
        }
    },
    methods: {
        fetchWorklist() {
            this.loadingWorklist = true;
            const params = new URLSearchParams({
                from_date: this.filters.from,
                to_date: this.filters.to
            });
            if (this.filters.search) params.append('search', this.filters.search);
            
            // Handle deep linking on first load
            const urlParams = new URLSearchParams(window.location.search);
            const deepLinkId = urlParams.get('booking_id');
            if (deepLinkId && !this.__deepLinkHandled) {
                params.append('booking_id', deepLinkId);
            }

            axios.get(`${APP_BASE_URL}/booking/technician-drive/list?${params.toString()}`)
                .then(res => {
                    this.bookings = res.data.data || res.data || [];
                    
                    if (deepLinkId && !this.__deepLinkHandled) {
                        this.__deepLinkHandled = true;
                        const match = this.bookings.find(r => String(r.booking_id || r.id) === String(deepLinkId));
                        if (match) {
                            this.selectBooking(match);
                            urlParams.delete('booking_id');
                            history.replaceState({}, '', `${location.pathname}${urlParams.toString() ? '?' + urlParams : ''}`);
                        }
                    }
                })
                .catch(err => {
                    console.error('Error fetching worklist:', err);
                    this.showToast('error', 'Failed to load worklist.');
                })
                .finally(() => {
                    this.loadingWorklist = false;
                });
        },
        selectBooking(booking) {
            this.selectedBooking = booking;
            document.body.classList.add('mobile-workspace-active');
            
            this.resetUploadState();
            this.newMessage = '';
            
            this.fetchChat();
        },
        closeMobileWorkspace() {
            document.body.classList.remove('mobile-workspace-active');
        },
        fetchChat() {
            if (!this.selectedBooking) return;
            const targetId = this.selectedBooking.booking_id || this.selectedBooking.id;
            
            this.loadingChat = true;
            this.messages = [];
            
            axios.get(`${APP_BASE_URL}/booking/api/v1/bookings/${targetId}/chat`)
                .then(res => {
                    this.messages = res.data.messages || [];
                    this.scrollToBottom();
                })
                .catch(err => {
                    console.error('Failed to load chat:', err);
                    this.showToast('error', 'Failed to load comments.');
                })
                .finally(() => {
                    this.loadingChat = false;
                });
        },
        scrollToBottom() {
            this.$nextTick(() => {
                const box = this.$refs.chatHistoryBox;
                if (box) {
                    box.scrollTop = box.scrollHeight;
                }
            });
        },
        handleKeydown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        },
        async sendMessage() {
            if (!this.selectedBooking || this.sending) return;
            const txt = this.newMessage.trim();
            if (!txt && this.pendingMediaUploads.length === 0) return;
            
            const targetId = this.selectedBooking.booking_id || this.selectedBooking.id;
            this.sending = true;
            
            // Optimistic UI append
            const tempId = 'temp_' + Date.now();
            const optimisticMsg = {
                client_id: tempId,
                message: txt,
                media: [...this.pendingMediaUploads],
                created_at: new Date().toISOString(),
                user_name: 'You',
                user_id: INTERNAL_USER_ID,
                is_optimistic: true,
                pending: true
            };
            this.messages.push(optimisticMsg);
            this.scrollToBottom();
            
            // Save payload
            const payloadMedia = [...this.pendingMediaUploads];
            this.newMessage = '';
            this.resetUploadState();

            try {
                await axios.post(`${APP_BASE_URL}/booking/api/v1/bookings/${targetId}/chat`, {
                    message: txt,
                    media: payloadMedia
                });
                
                // Refresh to get actual IDs and correct timestamps
                this.fetchChat();
            } catch (error) {
                console.error("Failed to send message:", error);
                this.showToast('error', 'Failed to send message.');
                // Remove optimistic message on failure
                this.messages = this.messages.filter(m => m.client_id !== tempId);
                // Restore state (simplified, assumes user might retry)
                this.newMessage = txt;
                this.pendingMediaUploads = payloadMedia;
            } finally {
                this.sending = false;
            }
        },
        
        // --- Date Formatters ---
        formatDateSeparator(dateObj) {
            const today = new Date();
            const yest = new Date(); yest.setDate(yest.getDate() - 1);
            if (dateObj.toDateString() === today.toDateString()) return 'Today';
            if (dateObj.toDateString() === yest.toDateString()) return 'Yesterday';
            return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        },
        
        // --- Media Helpers ---
        isImage(attachment) {
            const typeStr = (attachment.type || attachment.file_mime_type || '').toLowerCase();
            if (typeStr.includes('image')) return true;
            const ext = this.getExt(attachment).toLowerCase();
            return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
        },
        getExt(attachment) {
            const name = attachment.name || attachment.file_name || '';
            const parts = name.split('.');
            return parts.length > 1 ? parts.pop().substring(0,3).toUpperCase() : 'DOC';
        },
        truncate(str, len) {
            if (!str) return '';
            return str.length > len ? str.substring(0, len-3) + '...' : str;
        },
        
        // --- Uppy Integration ---
        toggleAttachmentDrawer() {
            this.drawerOpen = !this.drawerOpen;
            if (this.drawerOpen && !this.uppyInstance) {
                this.initUppy();
            }
        },
        resetUploadState() {
            this.pendingMediaUploads = [];
            this.drawerOpen = false;
            if (this.uppyInstance) {
                this.uppyInstance.cancelAll();
            }
        },
        initUppy() {
            const mountingNode = document.getElementById('uppyDashboardContainer');
            if (!mountingNode) return;

            this.uppyInstance = new Uppy.Uppy({
                restrictions: { maxFileSize: 3221225472 },
                autoProceed: true 
            })
            .use(Uppy.Dashboard, {
                target: mountingNode, inline: true, height: 260, 
                showProgressDetails: true, hideUploadButton: true,
                theme: 'light', proudlyDisplayPoweredByUppy: false
            })
            .use(Uppy.Webcam, {
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

            this.uppyInstance.on('upload-success', (file, response) => {
                this.pendingMediaUploads.push({
                    id: file.id,
                    file_url: response.body.location, 
                    file_name: file.name,
                    file_mime_type: file.type, 
                    file_size_bytes: file.size
                });
                // Auto-close drawer slightly to show the input
                this.drawerOpen = false;
            });
        },
        removePendingMedia(fileId) {
            this.pendingMediaUploads = this.pendingMediaUploads.filter(m => m.id !== fileId);
            if (this.uppyInstance) this.uppyInstance.removeFile(fileId);
        },

        // --- Edit Films Modal ---
        openFilmsModal() {
            if (!this.selectedBooking) return;
            const targetId = this.selectedBooking.booking_id || this.selectedBooking.id;
            
            this.filmsForm.testId = '';
            this.filmsForm.changedFilms = '';
            this.filmsForm.reason = '';
            this.filmsForm.tests = [];
            
            if (typeof myshowLoader === 'function') myshowLoader();
            axios.get(`${APP_BASE_URL}/booking/get-films-by-booking/${targetId}`)
                .then(res => {
                    this.filmsForm.grandTotalFilms = Number(res.data.grand_total_films) || 0;
                    this.filmsForm.tests = res.data.details || [];
                    
                    if (!this.filmsModalObj) {
                        this.filmsModalObj = new bootstrap.Modal(this.$refs.filmsModalRef);
                    }
                    this.filmsModalObj.show();
                })
                .catch(err => {
                    console.error(err);
                    this.showToast('error', 'Failed to load film data.');
                })
                .finally(() => {
                    if (typeof myhideLoader === 'function') myhideLoader();
                });
        },
        saveEditFilms() {
            if (!this.filmsForm.testId) return this.showToast("error", "Please select a test.");
            const addedFilms = Number(this.filmsForm.changedFilms) || 0;
            if (addedFilms <= 0) return this.showToast("error", "Please enter a valid number of films.");
            if (!this.filmsForm.reason.trim()) return this.showToast("error", "Reason is required.");

            const targetId = this.selectedBooking.booking_id || this.selectedBooking.id;
            const payload = {
                booking_id: targetId, 
                test_id: parseInt(this.filmsForm.testId),
                films_under_test: this.currentTestFilms + addedFilms, 
                total_new_films_used: this.newTotalFilms,
                usage_type: this.filmsForm.cause, 
                reason: this.filmsForm.reason.trim()
            };

            this.savingFilms = true;
            axios.post(`${APP_BASE_URL}/booking/films/`, payload)
                .then(() => { 
                    this.showToast("success", "Film usage updated!"); 
                    if (this.filmsModalObj) this.filmsModalObj.hide();
                    
                    // Optionally update the local UI model for total films if shown
                    if (this.selectedBooking.total_no_of_films_used !== undefined) {
                        this.selectedBooking.total_no_of_films_used = this.newTotalFilms;
                    }
                })
                .catch(err => {
                    if (typeof handleAxiosError === 'function') handleAxiosError(err);
                    else console.error(err);
                })
                .finally(() => {
                    this.savingFilms = false;
                });
        },

        // --- Toasts ---
        showToast(type, message) {
            if (typeof showToastMessage === 'function') {
                showToastMessage(type, message);
            } else {
                alert(`${type.toUpperCase()}: ${message}`);
            }
        }
    },
    mounted() {
        this.__deepLinkHandled = false;
        this.fetchWorklist();
    }
});

app.mount('#techDriveApp');