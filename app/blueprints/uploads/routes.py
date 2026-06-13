from flask import request, jsonify
from . import uploads_bp
from .services import start_multipart_upload, generate_part_urls, finish_multipart_upload

@uploads_bp.route('/api/upload/init', methods=['POST'])
def init_upload():
    """API Endpoint: Starts the upload session."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request. JSON payload missing."}), 400
        
    filename = data.get('filename')
    content_type = data.get('content_type')
    
    if not filename or not content_type:
        return jsonify({"error": "Missing required fields: 'filename' or 'content_type'"}), 400
        
    try:
        upload_id, file_key = start_multipart_upload(
            filename=filename, 
            content_type=content_type,
            target_folder=data.get('target_folder') 
        )
        return jsonify({"upload_id": upload_id, "file_key": file_key}), 200
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print(f"[Uploads-API] Fatal Init Error: {str(e)}")
        return jsonify({"error": "Failed to initialize upload session."}), 500


@uploads_bp.route('/api/upload/chunk-urls', methods=['POST'])
def get_chunk_urls():
    """API Endpoint: Generates pre-signed URLs for precise chunks."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request. JSON payload missing."}), 400
        
    required_fields = ['file_key', 'upload_id']
    if any(f not in data for f in required_fields):
        return jsonify({"error": f"Missing required fields. Expected: {', '.join(required_fields)}"}), 400
        
    try:
        # THE FIX: Extract the specific partNumber requested by Uppy
        part_number = data.get('partNumber') 
        total_parts = data.get('total_parts')
        
        if part_number is not None:
            urls = generate_part_urls(
                file_key=str(data['file_key']), 
                upload_id=str(data['upload_id']), 
                part_number=int(part_number)
            )
        elif total_parts is not None:
            urls = generate_part_urls(
                file_key=str(data['file_key']), 
                upload_id=str(data['upload_id']), 
                total_parts=int(total_parts)
            )
        else:
            raise ValueError("Missing chunk identification parameters (partNumber or total_parts).")
            
        return jsonify({"urls": urls}), 200
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print(f"[Uploads-API] Fatal Chunk Error: {str(e)}")
        return jsonify({"error": "Failed to generate secure chunk endpoints."}), 500


@uploads_bp.route('/api/upload/complete', methods=['POST'])
def complete_upload():
    """API Endpoint: Assembles the chunks into the final file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request. JSON payload missing."}), 400
        
    required_fields = ['file_key', 'upload_id', 'parts']
    if any(f not in data for f in required_fields):
        return jsonify({"error": f"Missing required fields. Expected: {', '.join(required_fields)}"}), 400
        
    try:
        final_url = finish_multipart_upload(
            file_key=str(data['file_key']), 
            upload_id=str(data['upload_id']), 
            parts=data['parts'] 
        )
        return jsonify({"message": "Upload assembled successfully", "file_url": final_url}), 200
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print(f"[Uploads-API] Fatal Assembly Error: {str(e)}")
        return jsonify({"error": "Failed to finalize file assembly on storage server."}), 500