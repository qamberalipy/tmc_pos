import os
import uuid
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from werkzeug.utils import secure_filename
from datetime import datetime, timezone

# Your R2 Dev URL or Custom Domain
PUBLIC_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN', '')

# Comprehensive MIME-Type Whitelist
ALLOWED_MIME_TYPES = {
    'application/zip': 'zips', 'application/x-zip-compressed': 'zips',
    'application/x-compressed': 'zips', 'application/x-rar-compressed': 'zips',
    'application/vnd.rar': 'zips', 'application/x-7z-compressed': 'zips',
    'application/gzip': 'zips',
    'application/pdf': 'documents', 'application/msword': 'documents',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documents',
    'application/vnd.ms-excel': 'documents',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'documents',
    'text/plain': 'documents', 'text/csv': 'documents',
    'image/jpeg': 'images', 'image/png': 'images',
    'image/webp': 'images', 'image/gif': 'images',
    'image/heic': 'images', 'image/heif': 'images',
    'video/mp4': 'videos', 'video/webm': 'videos',
    'video/quicktime': 'videos', 'video/x-msvideo': 'videos',
    'audio/webm': 'audio', 'audio/mp3': 'audio',
    'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio'
}

def get_r2_client():
    """Returns a highly resilient Boto3 client configured specifically for Cloudflare R2."""
    if not os.environ.get('R2_ACCOUNT_ID'):
        raise EnvironmentError("Critical: R2_ACCOUNT_ID is missing from environment variables.")

    return boto3.client(
        's3',
        endpoint_url=f"https://{os.environ.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ.get('R2_ACCESS_KEY'),
        aws_secret_access_key=os.environ.get('R2_SECRET_KEY'),
        region_name='auto', 
        config=Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'}, 
            retries={'max_attempts': 5, 'mode': 'standard'}
        )
    )

def start_multipart_upload(filename, content_type, target_folder=None):
    """Initiates a secure multipart upload session with Cloudflare R2."""
    if not content_type or content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Security: Unsupported or missing file format ({content_type}).")

    safe_filename = secure_filename(filename)
    file_extension = os.path.splitext(safe_filename)[1].lower() if '.' in safe_filename else ''
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    
    category_folder = ALLOWED_MIME_TYPES.get(content_type, 'others')
    safe_target = secure_filename(target_folder) if target_folder else 'misc'
    file_key = f"{safe_target}/{category_folder}/{unique_filename}"
    
    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
    
    try:
        response = s3.create_multipart_upload(Bucket=bucket, Key=file_key, ContentType=content_type)
        return response['UploadId'], file_key
    except ClientError as e:
        print(f"[R2 Init Error]: {e.response['Error']['Message']}")
        raise Exception("Storage integration failed during initialization.")

def generate_part_urls(file_key, upload_id, part_number=None, total_parts=None):
    """Generates precise, unkillable pre-signed URLs for specific file chunks."""
    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
    
    try:
        if part_number is not None:
            # THE FIX: Safely generate a signature for the exact chunk Uppy requested
            url = s3.generate_presigned_url(
                ClientMethod='upload_part',
                Params={'Bucket': bucket, 'Key': file_key, 'UploadId': upload_id, 'PartNumber': part_number},
                ExpiresIn=86400  # 24 Hours
            )
            return [{"part_number": part_number, "url": url}]
            
        elif total_parts is not None:
            # Fallback batch generation
            urls = []
            for part_num in range(1, total_parts + 1):
                url = s3.generate_presigned_url(
                    ClientMethod='upload_part',
                    Params={'Bucket': bucket, 'Key': file_key, 'UploadId': upload_id, 'PartNumber': part_num},
                    ExpiresIn=86400
                )
                urls.append({"part_number": part_num, "url": url})
            return urls
        else:
            raise ValueError("Must provide either part_number or total_parts.")
            
    except Exception as e:
        print(f"[R2 Presign Error]: {str(e)}")
        raise Exception("Failed to generate secure chunk signatures.")

def finish_multipart_upload(file_key, upload_id, parts):
    """Strictly validates and assembles the uploaded chunks into the final file."""
    if not isinstance(parts, list) or len(parts) == 0:
        raise ValueError("Missing or invalid parts array for assembly.")

    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
    
    formatted_parts = []
    for part in parts:
        if 'PartNumber' not in part or 'ETag' not in part:
            raise ValueError("Malformed chunk data. Missing PartNumber or ETag.")
            
        etag = str(part['ETag']).strip()
        if not etag.startswith('"'):
            etag = f'"{etag}"'
            
        try:
            formatted_parts.append({'PartNumber': int(part['PartNumber']), 'ETag': etag})
        except ValueError:
            raise ValueError("PartNumber must be an integer.")
            
    formatted_parts = sorted(formatted_parts, key=lambda k: k['PartNumber'])
    
    try:
        s3.complete_multipart_upload(
            Bucket=bucket, Key=file_key, UploadId=upload_id, MultipartUpload={'Parts': formatted_parts}
        )
        base_url = PUBLIC_DOMAIN.rstrip('/')
        return f"{base_url}/{file_key}"
        
    except ClientError as e:
        print(f"[R2 Assembly Error]: {e.response['Error']['Message']}")
        raise Exception("Storage integration failed during chunk assembly.")