const { createApp } = Vue;

const app = createApp({
    // Avoid Jinja collision
    compilerOptions: { delimiters: ['[[', ']]'] },
    
    data() {
        return {
            filters: { fromDate: '', toDate: '', search: '' },
            patients: [],
            mediaFiles: [],
            currentBooking: null,
            newCommentText: '',
            isDragging: false,
            
            loading: {
                patients: false,
                commenting: false,
                media: false
            },
            
            // Multipart Upload State Tracking
            uploadStatus: {
                isUploading: false,
                currentFileName: '',
                progress: 0,
                uploadedBytes: 0,
                totalBytes: 0
            }
        };
    },
    
    mounted() {
        this.fetchPatients();
    },
    
    methods: {
        // --- 1. CORE API FETCHERS ---
        async fetchPatients() {
            this.loading.patients = true;
            try {
                // Build query string
                const params = new URLSearchParams();
                if (this.filters.fromDate) params.append('from_date', this.filters.fromDate);
                if (this.filters.toDate) params.append('to_date', this.filters.toDate);
                if (this.filters.search) params.append('search', this.filters.search);

                // URL aligned with Flask Blueprint
                const response = await axios.get(`/booking/technician-drive/list?${params.toString()}`);
                this.patients = response.data.data;
            } catch (error) {
                this.toastError("Failed to load patient records.");
            } finally {
                this.loading.patients = false;
            }
        },

        // --- 2. COMMENTS MODULE ---
        openCommentsModal(patient) {
            this.currentBooking = patient;
            this.newCommentText = ''; // Clear old text
            const modal = new bootstrap.Modal(document.getElementById('commentModal'));
            modal.show();
        },

        async saveComment() {
            if (!this.newCommentText.trim()) return;
            
            this.loading.commenting = true;
            try {
                // URL aligned with Flask Blueprint
                await axios.post(`/booking/comments/${this.currentBooking.booking_id}`, {
                    comment: this.newCommentText
                });
                
                this.toastSuccess("Comment saved successfully!");
                this.currentBooking.has_comments = true; // update UI badge
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('commentModal'));
                modal.hide();
            } catch (error) {
                this.toastError("Error saving comment.");
            } finally {
                this.loading.commenting = false;
            }
        },

        // --- 3. MEDIA DRIVE MODULE ---
        openDriveModal(patient) {
            this.currentBooking = patient;
            this.fetchMediaFiles(patient.booking_id);
            
            const modal = new bootstrap.Modal(document.getElementById('driveModal'));
            modal.show();
        },

        closeDriveModal() {
            if (this.uploadStatus.isUploading) {
                if(!confirm("An upload is in progress. Closing this will not stop the upload, but you won't see the progress. Close anyway?")) {
                    return;
                }
            }
            const modal = bootstrap.Modal.getInstance(document.getElementById('driveModal'));
            modal.hide();
        },

        async fetchMediaFiles(bookingId) {
            this.loading.media = true;
            try {
                // URL aligned with Flask Blueprint
                const response = await axios.get(`/booking/technician-media/${bookingId}`);
                this.mediaFiles = response.data.media;
            } catch (error) {
                this.toastError("Failed to fetch media files.");
            } finally {
                this.loading.media = false;
            }
        },

        async deleteMedia(mediaId) {
            if (!confirm("Are you sure you want to remove this file?")) return;
            
            try {
                // URL aligned with Flask Blueprint
                await axios.delete(`/booking/technician-media/${mediaId}`);
                this.toastSuccess("File deleted.");
                this.mediaFiles = this.mediaFiles.filter(m => m.media_id !== mediaId);
            } catch (error) {
                this.toastError("Error deleting file.");
            }
        },

        // --- 4. CLOUDFLARE R2 MULTIPART UPLOAD LOGIC (Industrial Grade) ---
        handleDrop(event) {
            this.isDragging = false;
            if (event.dataTransfer.files.length > 0) {
                this.processFiles(event.dataTransfer.files);
            }
        },

        handleFileSelect(event) {
            if (event.target.files.length > 0) {
                this.processFiles(event.target.files);
            }
            event.target.value = ''; // Reset input
        },

        async processFiles(files) {
            if (this.uploadStatus.isUploading) {
                this.toastError("Please wait for the current upload to finish.");
                return;
            }

            const MAX_SIZE = 3 * 1024 * 1024 * 1024; // 3GB Strict Limit
            const file = files[0]; // Processing one by one for UI safety. You can loop if needed.

            if (file.size > MAX_SIZE) {
                this.toastError(`File exceeds 3GB limit. (${this.formatBytes(file.size)})`);
                return;
            }

            await this.performMultipartUpload(file);
        },

        async performMultipartUpload(file) {
            this.uploadStatus = {
                isUploading: true,
                currentFileName: file.name,
                progress: 0,
                uploadedBytes: 0,
                totalBytes: file.size
            };

            const CHUNK_SIZE = 15 * 1024 * 1024; // 15MB chunks (Optimal for R2 stability)
            const totalParts = Math.ceil(file.size / CHUNK_SIZE);
            const targetFolder = `bookings/${this.currentBooking.booking_id}/technician_media`;
            
            // Prevent generic application/octet-stream if possible
            const contentType = file.type || 'application/zip'; 

            try {
                // STEP 1: Init Upload (Get UploadID from Server Uploads API)
                const initRes = await axios.post('/api/upload/init', {
                    filename: file.name,
                    content_type: contentType,
                    target_folder: targetFolder
                });
                
                const { upload_id, file_key } = initRes.data;

                // STEP 2: Request Pre-signed Chunk URLs
                const urlRes = await axios.post('/api/upload/chunk-urls', {
                    file_key: file_key,
                    upload_id: upload_id,
                    total_parts: totalParts
                });
                
                const chunkUrls = urlRes.data.urls; // [{part_number, url}]
                const completedParts = [];

                // STEP 3: Upload Chunks (Directly to Cloudflare, bypassing your Flask server)
                // We use a concurrency limit of 3 to avoid network timeouts on large files
                const CONCURRENCY = 3; 
                let currentIndex = 0;

                const uploadNextChunk = async () => {
                    if (currentIndex >= chunkUrls.length) return;
                    
                    const chunkIndex = currentIndex++;
                    const partInfo = chunkUrls[chunkIndex];
                    
                    const start = chunkIndex * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunkBlob = file.slice(start, end);

                    // Execute HTTP PUT to Cloudflare R2
                    const r2Response = await axios.put(partInfo.url, chunkBlob, {
                        headers: { 'Content-Type': contentType }
                    });

                    // Capture ETag (Must be enclosed in double quotes for R2 assembly)
                    const etag = r2Response.headers['etag'];
                    completedParts.push({ PartNumber: partInfo.part_number, ETag: etag });

                    // Update Progress
                    this.uploadStatus.uploadedBytes += chunkBlob.size;
                    this.uploadStatus.progress = Math.round((this.uploadStatus.uploadedBytes / this.uploadStatus.totalBytes) * 100);

                    // Recursively start next chunk
                    await uploadNextChunk();
                };

                // Start initial batch
                const workers = [];
                for (let i = 0; i < CONCURRENCY; i++) { workers.push(uploadNextChunk()); }
                await Promise.all(workers);

                // STEP 4: Tell Server to Assemble Chunks in Cloudflare
                // Sort parts just to be safe
                completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
                
                const completeRes = await axios.post('/api/upload/complete', {
                    file_key: file_key,
                    upload_id: upload_id,
                    parts: completedParts
                });

                const finalCloudUrl = completeRes.data.file_url;

                // STEP 5: Link the Media to the Patient in Database (URL aligned with Flask Blueprint)
                await axios.post(`/booking/technician-media/${this.currentBooking.booking_id}`, {
                    file_url: finalCloudUrl,
                    file_name: file.name,
                    file_mime_type: contentType,
                    file_size_bytes: file.size
                });

                this.toastSuccess("File successfully uploaded & linked!");
                
                // Refresh Grid
                this.fetchMediaFiles(this.currentBooking.booking_id);

            } catch (error) {
                console.error("Upload failed:", error);
                const msg = error.response?.data?.error || "Upload failed. Network error or CORS issue.";
                this.toastError(msg);
            } finally {
                this.uploadStatus.isUploading = false;
                this.uploadStatus.progress = 0;
            }
        },

        // --- 5. UI UTILITIES ---
        getFileIcon(mimeType) {
            if (mimeType.includes('pdf')) return 'bi-file-earmark-pdf-fill pdf';
            if (mimeType.includes('image')) return 'bi-file-earmark-image-fill image';
            if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'bi-file-earmark-zip-fill zip';
            if (mimeType.includes('video')) return 'bi-file-earmark-play-fill';
            return 'bi-file-earmark-text-fill';
        },

        formatBytes(bytes, decimals = 2) {
            if (!+bytes) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        },

        toastSuccess(msg) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: msg, toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            } else {
                alert("Success: " + msg);
            }
        },

        toastError(msg) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: msg, toast: true, position: 'top-end', timer: 4000, showConfirmButton: false });
            } else {
                alert("Error: " + msg);
            }
        }
    }
});

app.mount('#technicianDriveApp');