# Rukmer GPT – Backend Overview (Non-GPT Scope)

This covers:

- Auth & Tenants
- Media & Storage
- Multi-tenancy rules
- Health check & basics
- What the frontend expects (without GPT logic)

For detailed endpoint shapes (request/response), see:  
`docs/API_CONTRACT.md`

Rukmer GPT / analysis endpoints (`/analysis/query`, `/analysis/{id}`, `/analysis`) are owned by a separate colleague and **are intentionally out of scope here**.

---

## 1. Tech Stack (Backend)

Recommended stack for the backend:

- **Language**: Python
- **Framework**: FastAPI
- **DB**: PostgreSQL
- **ORM**: SQLAlchemy
- **Auth**: JWT (access token)
- **Storage**: S3 / Azure Blob / equivalent (presigned URLs)
- **Container**: Docker (optional, for deployment)
- **Env config**: `.env` / environment variables

---

## 2. High-Level Responsibilities (Your Scope)

Backend (in this document) is responsible for:

 1. **Auth & Tenants**
   - `POST /auth/signup`
   - `POST /auth/login`
   - `GET /auth/me`
   - JWT-based auth with `user_id` + `tenant_id` in the token

 2. **Media Management**
   - `POST /media/upload-intent`
   - `GET /media`
   - `GET /media/{media_id}`
   - `DELETE /media/{media_id}`

 3. **Multi-tenancy Enforcement**
   - All tenant-scoped queries **must** filter by `tenant_id` from the auth token.

 4. **Health Check**
   - `GET /health`

> The **Rukmer GPT / analysis endpoints** are owned by another dev:
> - `POST /analysis/query`
> - `GET /analysis/{analysis_id}`
> - `GET /analysis`
>
> They will integrate with LLMs, vector store, and media analysis data.

---

## 3. Auth & Tenants

### 3.1 Data Model (Minimal)

**tenants** table:

- `id` (UUID, PK)
- `name` (string)
- `created_at` (timestamp)

**users** table:

- `id` (UUID, PK)
- `tenant_id` (UUID, FK → tenants.id)
- `email` (string, unique per tenant)
- `name` (string)
- `password_hash` (string, hashed)
- `created_at` (timestamp)

### 3.2 Endpoints (Behavior Summary)

Details like JSON shapes are in `API_CONTRACT.md`.

#### `POST /auth/signup`

- Creates a **new tenant** and a **new user**, or:
  - (Later: can be adjusted to join existing tenant if needed.)
- Hashes password.
- Returns:
  - `user` object
  - `token` (JWT)

#### `POST /auth/login`

- Verifies email + password.
- Returns:
  - `user`
  - `token` (JWT)

#### `GET /auth/me`

- Requires `Authorization: Bearer <token>`.
- Returns current user info.

### 3.3 JWT Contents

JWT should minimally contain:

- `sub` → user ID
- `tenant_id`
- `exp` (expiration)

Example payload:

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "exp": 9999999999
}
```

A FastAPI dependency like `get_current_user()` should:
- Read the token from Authorization header.
- Validate it.
- Load user (and optionally tenant) from DB.
- Attach tenant_id to the request context / dependency chain.

---

## 4. Media & Storage
### 4.1 Data Model (Minimal)

**media** table:
- `id` (UUID, PK)
- `tenant_id` (UUID, FK)
- `user_id` (UUID, FK)
- `filename` (string)
- `media_type` ("image" or "video")
- `storage_path` (string; path/key in object storage)
- `status` ("uploading" | "processing" | "ready" | "deleted")
- `created_at` (timestamp)
- (Optional) `thumbnail_url` (string)
- (Optional) `deleted_at` (timestamp, for soft delete)

We assume actual files live in object storage (S3 / Blob), not in DB.

### 4.2 Storage Layout (Example)

This is not enforced by the frontend, but recommended layout:

- Raw uploads:

```bash
/{tenant_id}/raw/{media_id}.{ext}
```

- Processed outputs (e.g. thumbnails, keyframes, etc.):

```bash
/{tenant_id}/processed/{media_id}/...
```

Backend generates these keys and returns them as `storage_path` / URLs.

---

### 4.3 Endpoints (Behavior Summary)
`POST /media/upload-intent`
- Auth required.
- Body: { filename, media_type }.
- Behavior:
    - Generate a **new media ID**.
    - Create a `media` row with:
        - `status = "uploading"`
        - `storage_path` based on `tenant_id` + `media_id`.
    - Generate a presigned upload URL for object storage.
    - Return:
        - `media row` (JSON)
        - `upload_url`
        - `upload_headers` (e.g. Content-Type)

Frontend will:
 1. Call this endpoint.
 2. Use `upload_url` to upload directly to storage.
 3. Later, it will poll `/media` or `/media/{id}` to see status updates.

`GET /media`
 - Returns paginated media list for the **current tenant**.
 - Always filter where:
```sql
media.tenant_id = current_user.tenant_id
```

`GET /media/{media_id}`
 - Returns a single media row (only if it belongs to `tenant_id` from token).
 - Includes status and useful URLs (e.g. thumbnail).

`DELETE /media/{media_id}`
 - Optional behavior: soft delete.
    - Set status = "deleted" and deleted_at.
    - Optionally clean up storage asynchronously.

---

## 5. Multi-Tenancy Rules

**Key rule:**
All tenant-specific data must be filtered by `tenant_id` from the auth token.

This applies to:
`media`
`analyses` (even though analysis endpoints are owned by another dev)
Any future tables like `media_analysis`, `usage`, etc.

In code (pseudocode for queries):
```python
def list_media(current_user):
    return db.query(Media).filter(Media.tenant_id == current_user.tenant_id)
```

Never trust `tenant_id` from the frontend; always use the one from the JWT.

---

## 6. Health Check

A simple health endpoint is required for monitoring and for frontend sanity checks.

`GET /health`
- Returns something like:
```json
{
  "status": "ok",
  "backend": "up"
}
```

Later this can include DB / storage / worker checks, but for now simple is fine.

---

## 7. Frontend Expectations (Summary)

The frontend will:
 - Send Authorization: Bearer <token> header for all protected routes.
 - Store JWT token under:
```text
localStorage["rukmer_token"]
```

Call endpoints defined in `API_CONTRACT.md`, including:
 - `/auth/login`, `/auth/signup`, `/auth/me`
 - `/media/upload-intent`, `/media`, `/media/{id}`
 - (Later, `/analysis/...`)