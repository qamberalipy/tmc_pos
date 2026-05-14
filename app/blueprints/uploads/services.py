import os
import uuid
import boto3
from botocore.config import Config
from datetime import datetime, timezone

# Your R2 Dev URL or Custom Domain
PUBLIC_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN')

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.environ.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ.get('R2_ACCESS_KEY'),
        aws_secret_access_key=os.environ.get('R2_SECRET_KEY'),
        region_name='auto', # CRITICAL for R2 compatibility with Boto3
        config=Config(signature_version='s3v4')
    )

def start_multipart_upload(filename, content_type, target_folder=None):
    """Initiates the multipart upload in the exact folder requested."""
    allowed_types = {
        'application/zip': 'zips',
        'application/x-zip-compressed': 'zips',
        'application/pdf': 'documents',
        'image/jpeg': 'images',
        'image/png': 'images',
        'application/msword': 'documents',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documents'
    }
    
    if content_type not in allowed_types:
        raise ValueError(f"Unsupported file format: {content_type}")
    
    # Clean filename to prevent URL breaking (removes special chars except dots, dashes, underscores)
    safe_filename = "".join([c for c in filename if c.isalnum() or c in " .-_"]).rstrip()
    unique_id = uuid.uuid4().hex
    
    # Determine the R2 Object Key (Path)
    if target_folder:
        # Strip leading/trailing slashes to prevent double slashes (e.g., //) in the URL
        clean_folder = target_folder.strip('/')
        file_key = f"{clean_folder}/{unique_id}_{safe_filename}"
    else:
        # Fallback structure: uncategorized/documents/2026/05/...
        folder_category = allowed_types[content_type]
        now = datetime.now(timezone.utc)
        file_key = f"uncategorized/{folder_category}/{now.year}/{now.month:02d}/{unique_id}_{safe_filename}"
    
    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
    
    response = s3.create_multipart_upload(
        Bucket=bucket,
        Key=file_key,
        ContentType=content_type
    )
    
    return response['UploadId'], file_key

def generate_part_urls(file_key, upload_id, total_parts):
    """Generates presigned URLs for each chunk for direct browser upload."""
    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
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
    """Assembles the chunks in R2 and returns the final public URL."""
    s3 = get_r2_client()
    bucket = os.environ.get('R2_BUCKET_NAME')
    
    # Fix potential ETag formatting issues from frontend (boto3 expects ETags to be wrapped in double quotes)
    formatted_parts = []
    for part in parts:
        etag = part['ETag']
        if not etag.startswith('"'):
            etag = f'"{etag}"'
            
        formatted_parts.append({
            'PartNumber': int(part['PartNumber']),
            'ETag': etag
        })
    
    try:
        s3.complete_multipart_upload(
            Bucket=bucket,
            Key=file_key,
            UploadId=upload_id,
            MultipartUpload={'Parts': formatted_parts}
        )
        
        # Clean up slashes for final URL
        base_url = PUBLIC_DOMAIN.rstrip('/')
        return f"{base_url}/{file_key}"
        
    except Exception as e:
        s3.abort_multipart_upload(Bucket=bucket, Key=file_key, UploadId=upload_id)
        print(f"R2 Assembly Error: {str(e)}")
        raise Exception("Failed to assemble file parts in cloud storage.")