from flask import Blueprint, request, jsonify
from .services import start_multipart_upload, generate_part_urls, finish_multipart_upload

# Import your database extensions and models to save the final record
from app.extensions import db
from app.models.doctor_reporting_details import DoctorReportData
# from app.models.technician_uploads import TechnicianUpload # (If you created this)

uploads_bp = Blueprint('uploads', __name__)

@uploads_bp.route('/api/upload/init', methods=['POST'])
def init_upload():
    data = request.get_json()
    try:
        upload_id, file_key = start_multipart_upload(
            data.get('filename'), 
            data.get('content_type')
        )
        return jsonify({"upload_id": upload_id, "file_key": file_key}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Failed to initialize upload"}), 500

@uploads_bp.route('/api/upload/chunk-urls', methods=['POST'])
def get_chunk_urls():
    data = request.get_json()
    try:
        urls = generate_part_urls(
            data.get('file_key'),
            data.get('upload_id'),
            int(data.get('total_parts'))
        )
        return jsonify({"urls": urls}), 200
    except Exception as e:
        return jsonify({"error": "Failed to generate chunk URLs"}), 500

@uploads_bp.route('/api/upload/complete', methods=['POST'])
def complete_upload():
    data = request.get_json()
    file_key = data.get('file_key')
    upload_id = data.get('upload_id')
    parts = data.get('parts') # Frontend must provide the ETags
    
    # Identification payload to link the file to the correct database record
    record_type = data.get('record_type') # 'doctor_report' or 'technician_scan'
    record_id = data.get('record_id') 

    try:
        # 1. Assemble the file in R2
        finish_multipart_upload(file_key, upload_id, parts)
        
        # 2. Save the file_key to your database 
        if record_type == 'doctor_report':
            report = DoctorReportData.query.get(record_id)
            if report:
                report.report_file_key = file_key
                db.session.commit()
                
        elif record_type == 'technician_scan':
            pass
            # Create your TechnicianUpload record here and commit to DB

        return jsonify({"message": "Upload successful", "file_key": file_key}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to complete upload or save record"}), 500