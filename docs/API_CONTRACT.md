# API contract

API contracts define the rules on how the backend communicates with frontend.

## 1. Auth API

### 1) `POST /auth/signup`
**Purpose:** Creating a new user under a tenant (or create tenant + user, depending on our auth model).

**Request body example:**
```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123",
  "name": "John Doe",
  "company_name": "Acme Construction"
}
```

**Response (success):**
```json
{
  "user": {
    "id": "uuid-of-user",
    "tenant_id": "uuid-of-tenant",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt-token-string"
}
```

### 2) `POST /auth/login`

**Purpose:** Log in and get a token.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123"
}
```

**Response (success):**
```json
{
  "user": {
    "id": "uuid-of-user",
    "tenant_id": "uuid-of-tenant",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt-token-string"
}
```

Frontend will store the `token` and send it in `Authorization: Bearer <token>`.

### 3) `GET /auth/me`

**Purpose:** Get info about the currently logged-in user.

**Headers:**

```Authorization: Bearer <token>```


**Response:**
```json
{
  "id": "uuid-of-user",
  "tenant_id": "uuid-of-tenant",
  "email": "user@example.com",
  "name": "John Doe"
}
```

## 2. Media API (upload + library)

### 4) `POST /media/upload-intent`

**Purpose:** Start an upload.
Backend creates a media record and returns a **presigned URL** for the actual file upload.

**Headers:**

```Authorization: Bearer <token>```

**Request body:**
```json
{
  "filename": "drone_video_001.mp4",
  "media_type": "video"  // or "image"
}
```

**Response (success):**
```json
{
  "media": {
    "id": "uuid-of-media",
    "tenant_id": "uuid-of-tenant",
    "user_id": "uuid-of-user",
    "filename": "drone_video_001.mp4",
    "media_type": "video",
    "storage_path": "/tenant-id/raw/media-id.mp4",
    "status": "uploading",
    "created_at": "2025-01-01T12:00:00Z"
  },
  "upload_url": "https://storage-provider.com/...presigned-url...",
  "upload_headers": {
    "Content-Type": "video/mp4"
  }
}
```

**Frontend flow:**

Call `/media/upload-intent`
Get `upload_url`
Upload the file directly to storage using that URL

### 5) `GET /media`

**Purpose:** List all media for the current tenant (optionally filtered by user or pagination).

**Headers:**

```Authorization: Bearer <token>```


**Query params (optional):**

`page` – page number (e.g., `1`)

`page_size` – e.g., `20`

**Response:**
```json
{
  "items": [
    {
      "id": "uuid-media-1",
      "filename": "image_001.jpg",
      "media_type": "image",
      "status": "ready",
      "created_at": "2025-01-01T12:00:00Z",
      "thumbnail_url": "https://.../thumb_001.jpg"
    },
    {
      "id": "uuid-media-2",
      "filename": "drone_video_001.mp4",
      "media_type": "video",
      "status": "processing",
      "created_at": "2025-01-01T12:05:00Z",
      "thumbnail_url": "https://.../frame_0001.jpg"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 2
}
```

### 6) `GET /media/{media_id}`

**Purpose:** Get details about a single media item.

**Headers:**

```Authorization: Bearer <token>```

**Response:**
```json
{
  "id": "uuid-media-1",
  "tenant_id": "uuid-tenant",
  "user_id": "uuid-user",
  "filename": "image_001.jpg",
  "media_type": "image",
  "status": "ready",
  "storage_path": "/tenant/raw/media-id.jpg",
  "thumbnail_url": "https://.../thumb_001.jpg",
  "created_at": "2025-01-01T12:00:00Z",
  "analysis_status": "ready"  // or "processing", "not_started"
}
```

### 7) `DELETE /media/{media_id}`

**Purpose:** Delete a media item and (optionally) its analysis & embeddings.

**Headers:**

```Authorization: Bearer <token>```


**Response (success):**
```json
{
  "status": "deleted",
  "media_id": "uuid-media-1"
}
```

## 3. Analysis API (Rukmer GPT)

This is the heart of our product.

Where we’ll start with a single flexible endpoint:

- `POST /analysis/query` – user asks a question about:
  - one file,
  - a set of files,
  - or all media.

Then a couple of read endpoints.

### 8) `POST /analysis/query`

**Purpose:** Ask Rukmer GPT a question about media.

**Headers:**

```Authorization: Bearer <token>```

**Request body (three possible scopes):**

**👉 Scope 1 – Single file**
```json
{
  "question": "What do you see in this image/video?",
  "scope": "file",
  "file_ids": ["uuid-media-1"]
}
```

**👉 Scope 2 – Selected files**
```json
{
  "question": "Summarize the safety issues across these clips.",
  "scope": "files",
  "file_ids": ["uuid-media-1", "uuid-media-2", "uuid-media-3"]
}
```

**👉 Scope 3 – All media for this user/tenant**
```json
{
  "question": "Give me an overview of everything in my library.",
  "scope": "all_user_media"
}
```

**Response (success):**
```
{
  "analysis_id": "uuid-analysis-1",
  "question": "Summarize the safety issues across these clips.",
  "scope": "files",
  "file_ids": ["uuid-media-1", "uuid-media-2"],
  "answer": {
    "summary": "Across the selected clips, I see three main safety concerns.",
    "details": [
      {
        "title": "Unprotected edge",
        "description": "Workers are standing near a roof edge without guardrails.",
        "related_media_ids": ["uuid-media-1"]
      },
      {
        "title": "Loose materials",
        "description": "Debris and loose materials are present near walk paths.",
        "related_media_ids": ["uuid-media-2"]
      }
    ]
  },
  "created_at": "2025-01-01T12:30:00Z"
}
```

We can keep `answer` as flexible JSON that frontend can render as:
- summary text
- list of findings

## 9) `GET /analysis/{analysis_id}`

**Purpose:** Fetch a previous analysis answer by ID.

**Headers:**

```Authorization: Bearer <token>```


**Response:**

Same shape as above:
```json
{
  "analysis_id": "uuid-analysis-1",
  "question": "Summarize the safety issues across these clips.",
  "scope": "files",
  "file_ids": ["uuid-media-1", "uuid-media-2"],
  "answer": {
    "summary": "Across the selected clips, I see three main safety concerns.",
    "details": [
      {
        "title": "Unprotected edge",
        "description": "Workers are standing near a roof edge without guardrails.",
        "related_media_ids": ["uuid-media-1"]
      }
    ]
  },
  "created_at": "2025-01-01T12:30:00Z"
}
```

### 10) `GET /analysis (optional)`

**Purpose:** List past analyses, optionally filtered.

**Headers:**

```Authorization: Bearer <token>```


**Query params (optional):**
- `media_id` – only analyses that include this media
- `limit` – e.g., 20

**Response:**
```json
{
  "items": [
    {
      "analysis_id": "uuid-analysis-1",
      "question": "Summarize the safety issues across these clips.",
      "scope": "files",
      "file_ids": ["uuid-media-1", "uuid-media-2"],
      "created_at": "2025-01-01T12:30:00Z"
    },
    {
      "analysis_id": "uuid-analysis-2",
      "question": "What do you see in my entire library?",
      "scope": "all_user_media",
      "file_ids": [],
      "created_at": "2025-01-02T09:10:00Z"
    }
  ]
}
```

## 4. Health API

### 11) `GET /health`

**Purpose:** Simple health check for monitoring.

**Response:**
```json
{
  "status": "ok",
  "backend": "up"
}
```
