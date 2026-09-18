# AGENTS.md — uploads blueprint

URL prefix: `/uploads`. Pure JSON API for uploading files to Cloudflare R2 via multipart upload. No templates, no static files. Used by the technician drive (booking blueprint) and doctor report submission (reports blueprint) for media/document uploads.

See the root `AGENTS.md` for repo-wide conventions.

## Files

| File | Purpose |
|---|---|
| `__init__.py` | Creates `uploads_bp` Blueprint — **no `template_folder` or `static_folder`** (API-only) |
| `routes.py` | 3 routes: init, chunk-urls, complete |
| `services.py` | R2 client setup, multipart orchestration, MIME validation |

## Flow

Three-step upload protocol (matches what Uppy.js expects on the frontend):

1. **`POST /uploads/api/upload/init`** — `{filename, content_type, target_folder?}` → returns `{upload_id, file_key}`
2. **`POST /uploads/api/upload/chunk-urls`** — `{file_key, upload_id, partNumber | total_parts}` → returns `{urls: [{part_number, url}]}`
3. **`POST /uploads/api/upload/complete`** — `{file_key, upload_id, parts: [{PartNumber, ETag}]}` → returns `{file_url}`

## Domain notes

- **MIME whitelist** (`ALLOWED_MIME_TYPES` in `services.py`): Maps content types to category folders (`zips`, `documents`, `images`, `videos`, `audio`). Any type not in the dict is rejected with 400.
- **File key structure**: `{target_folder}/{category_folder}/{unique_filename}`. Archives (zip/rar/7z/gzip) preserve original filename with an 8-char hex suffix; all other files get a full UUID hex name.
- **Pre-signed URLs expire in 24 hours** (`ExpiresIn=86400`).
- **R2 environment variables** (required): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`. Missing `R2_ACCOUNT_ID` raises `EnvironmentError` at client creation.
- **ETag quoting**: `finish_multipart_upload` normalises ETags to be double-quoted (`"..."`) — R2 requires this format for `complete_multipart_upload`.
- **No auth decorator**: Upload routes have no `@login_required`. Auth is expected to be enforced by the calling page/JS, not the upload API itself.
