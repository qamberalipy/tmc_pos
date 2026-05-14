from flask import Blueprint, request, jsonify
from .services import start_multipart_upload, generate_part_urls, finish_multipart_upload
from . import uploads_bp


@uploads_bp.route('/api/upload/init', methods=['POST'])
def init_upload():
    data = request.get_json()
    if not data or 'filename' not in data or 'content_type' not in data:
        return jsonify({"error": "Missing filename or content_type"}), 400
        
    try:
        # target_folder allows frontend to dictate where in R2 the file goes
        upload_id, file_key = start_multipart_upload(
            data['filename'], 
            data['content_type'],
            target_folder=data.get('target_folder') 
        )
        return jsonify({"upload_id": upload_id, "file_key": file_key}), 200
    except ValueError as e:
        print(f"Init Upload Validation Error: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Init Upload Error: {e}")
        return jsonify({"error": "Failed to initialize upload"}), 500


@uploads_bp.route('/api/upload/chunk-urls', methods=['POST'])
def get_chunk_urls():
    data = request.get_json()
    required_fields = ['file_key', 'upload_id', 'total_parts']
    if not data or any(f not in data for f in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        urls = generate_part_urls(
            data['file_key'], 
            data['upload_id'], 
            int(data['total_parts'])
        )
        return jsonify({"urls": urls}), 200
    except Exception as e:
        print(f"Chunk URL Error: {e}")
        return jsonify({"error": "Failed to generate chunk URLs"}), 500


@uploads_bp.route('/api/upload/complete', methods=['POST'])
def complete_upload():
    data = request.get_json()
    required_fields = ['file_key', 'upload_id', 'parts']
    if not data or any(f not in data for f in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        # Assemble file in R2 and get public URL
        final_url = finish_multipart_upload(
            data['file_key'], 
            data['upload_id'], 
            data['parts'] # List of dicts: [{'PartNumber': 1, 'ETag': '"..."'}, ...]
        )
        
        return jsonify({
            "message": "Upload assembled successfully", 
            "file_url": final_url,
            "file_key": data['file_key']
        }), 200
        
    except Exception as e:
        print(f"Complete Upload Error: {e}")
        return jsonify({"error": str(e)}), 500