import os
import uuid
import boto3
from botocore.config import Config
from datetime import datetime, timezone

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv('R2_ACCESS_KEY'),
        aws_secret_access_key=os.getenv('R2_SECRET_KEY'),
        config=Config(signature_version='s3v4')
    )

def start_multipart_upload(filename, content_type):
    """Initiates the multipart upload and returns UploadId and Key."""
    allowed_types = {
        'application/zip': 'largezip',
        'application/x-zip-compressed': 'largezip',
        'application/pdf': 'documents',
        'image/jpeg': 'images',
        'image/png': 'images'
    }
    
    if content_type not in allowed_types:
        raise ValueError("Unsupported file format.")
        
    folder = allowed_types[content_type]
    now = datetime.now(timezone.utc)
    
    # Secure, predictable structure: folder/YYYY/MM/uuid_filename
    file_key = f"{folder}/{now.year}/{now.month:02d}/{uuid.uuid4()}_{filename}"
    
    s3 = get_r2_client()
    bucket = os.getenv('R2_BUCKET_NAME', 'tmc')
    
    response = s3.create_multipart_upload(
        Bucket=bucket,
        Key=file_key,
        ContentType=content_type
    )
    
    return response['UploadId'], file_key

def generate_part_urls(file_key, upload_id, total_parts):
    """Generates presigned URLs for each chunk of the file."""
    s3 = get_r2_client()
    bucket = os.getenv('R2_BUCKET_NAME', 'tmc')
    urls = []
    
    for part_num in range(1, total_parts + 1):
        url = s3.generate_presigned_url(
            ClientMethod='upload_part',
            Params={
                'Bucket': bucket,
                'Key': file_key,
                'UploadId': upload_id,
                'PartNumber': part_num
            },
            ExpiresIn=3600 # 1 hour validity per chunk
        )
        urls.append({"part_number": part_num, "url": url})
        
    return urls

def finish_multipart_upload(file_key, upload_id, parts):
    """Assembles the chunks in R2. Parts must be a list of dicts: [{'PartNumber': 1, 'ETag': '...'}, ...]"""
    s3 = get_r2_client()
    bucket = os.getenv('R2_BUCKET_NAME', 'tmc')
    
    try:
        s3.complete_multipart_upload(
            Bucket=bucket,
            Key=file_key,
            UploadId=upload_id,
            MultipartUpload={'Parts': parts}
        )
        return True
    except Exception as e:
        # Prevent orphaned storage segments if completion fails
        s3.abort_multipart_upload(
            Bucket=bucket,
            Key=file_key,
            UploadId=upload_id
        )
        raise e