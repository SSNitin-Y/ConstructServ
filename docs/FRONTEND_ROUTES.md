# Rukmer Frontend → Backend API Flow

This document outlines the main frontend pages, the APIs they use, and the exact request/response flows.

---

## 🔹 Core Frontend Pages

- **/login** – User login  
- **/signup** – New account + tenant creation  
- **/library** – User’s media library (list + uploads)  
- **/media/[id]** – Media viewer + GPT analysis panel  
- **/analysis** (optional) – List of all past GPT analyses  

---

## 1️⃣ Login Page (`/login`)

### What the user does

- Enters email + password  
- Clicks **Log in**

### API Used

`POST /auth/login`

### Request

```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123"
}
```

### Response
```json
{
  "user": {
    "id": "...",
    "tenant_id": "...",
    "email": "...",
    "name": "..."
  },
  "token": "jwt-token"
}
```

### Frontend Behavior
  - Save `token` (localStorage or memory store)
  - Save `user` session
  - Redirect → `/library`

## 2️⃣ Signup Page (/signup)

### What the user does
- Enters name, email, password, company name
- Clicks Sign up

### API Used

`POST /auth/signup`

### Request
```json
{
  "email": "user@example.com",
  "password": "MySecurePassword123",
  "name": "John Doe",
  "company_name": "Acme Construction"
}
```

### Response
```json
{
  "user": { },
  "token": "jwt-token"
}
```

### Frontend Behavior
Save `token` + `user`
Redirect → `/library`

## 3️⃣ Media Library Page (`/library`)

### What the user sees
  - Grid/list of all uploaded media
  - Upload file button
  - Status indicators (uploading, processing, ready)

### A) Load Media List:

### API Used
`GET /media`

### Response
```json
{
  "items": [
    {
      "id": "uuid-media-1",
      "filename": "image_001.jpg",
      "media_type": "image",
      "status": "ready",
      "thumbnail_url": "https://.../thumb.jpg"
    }
  ]
}
```

### Frontend Behavior
  - Display items as cards
  - Optionally poll or refetch to keep statuses updated

### B) Start Upload:

### API Used
`POST /media/upload-intent`

### Request
```json
{
  "filename": "roof_01.mp4",
  "media_type": "video"
}
```

### Response
```json
{
  "media": {
    "id": "uuid-media-new",
    "status": "uploading",
    "filename": "roof_01.mp4",
    "media_type": "video"
  },
  "upload_url": "https://storage-provider.com/presigned-url",
  "upload_headers": { "Content-Type": "video/mp4" }
}
```

### Frontend Behavior
  - Upload file directly to storage using `upload_url` and `upload_headers`
  - Show a new media card with status: `uploading` → `processing`
  - On refresh, `GET /media` will show final `status` as `ready` once backend finishes processing

## 4️⃣ Media Detail Page (`/media/[id]`)

### What the user sees
  - Full-size image or video viewer
  - Basic metadata (filename, type, created date, status)
  - GPT Q&A panel (chat-like interface)
  - Optional: past analyses for this file

### A) Load Single Media:

### API Used
`GET /media/{media_id}`

### Response
```json
{
  "id": "uuid-media-1",
  "filename": "image_001.jpg",
  "media_type": "image",
  "status": "ready",
  "thumbnail_url": "https://.../thumb.jpg",
  "analysis_status": "ready"
}
```
### B) Load Past Analyses (optional):

### API Used
`GET /analysis?media_id=uuid-media-1`
  - Returns list of previous analysis records for that file (shape similar to items from `GET /analysis` below).

### C) Ask GPT About This File

### API Used
`POST /analysis/query`

### Request
```json
{
  "question": "Do you see any safety issues in this image?",
  "scope": "file",
  "file_ids": ["uuid-media-1"]
}
```

### Response
```json
{
  "analysis_id": "uuid-analysis-1",
  "question": "Do you see any safety issues in this image?",
  "scope": "file",
  "file_ids": ["uuid-media-1"],
  "answer": {
    "summary": "Yes, I see one potential hazard.",
    "details": [
      {
        "title": "Unprotected edge",
        "description": "The worker stands near a ledge without visible guardrails.",
        "related_media_ids": ["uuid-media-1"]
      }
    ]
  },
  "created_at": "2025-01-01T12:30:00Z"
}
```

### Frontend Behavior
  - Show the answer in the GPT panel on the side
  - Append this result to the analysis history list for this media

## 5️⃣ “Analyze Everything” Flow (button on `/library`)

### User Action
  - Clicks a button like: **Analyze all my media**

### API Used
`POST /analysis/query` with `scope: "all_user_media"`

### Request
```json
{
  "question": "Give me an overview of everything in my library.",
  "scope": "all_user_media"
}
```

### Response

Same general shape as other `POST /analysis/query` responses, but with:
```json
"scope": "all_user_media"
```

- The backend:
  - Uses tenant-scoped media and analysis data
  - Runs the LLM
  - Stores the analysis in DB
  - Returns the created analysis record

### Frontend Behavior
  - Show the answer in a panel on `/library` (e.g., modal or side drawer)
  - Allow user to revisit this answer later via `/analysis` or a link to `/analysis/{analysis_id}` (if added)

## 6️⃣ Analysis History Page (`/analysis`) – Optional

### What the user sees
- List of past GPT analyses:
  - Question text
  - Scope (file/files/all_user_media)
  - Involved file_ids
  - Created timestamp

### API Used
`GET /analysis`

### Response
```json
{
  "items": [
    {
      "analysis_id": "uuid-analysis-1",
      "question": "Summarize safety issues.",
      "scope": "files",
      "file_ids": ["uuid-media-1", "uuid-media-2"],
      "created_at": "2025-01-01T12:30:00Z"
    }
  ]
}
```

### Frontend Behavior
- Display as a list or table
- On click:
  - Either navigate to /media/[id] with this analysis highlighted, or
  - Navigate to a dedicated /analysis/[analysis_id] page (if implemented)

## 🧩 Summary Table (Pages → APIs)
| Page / Screen	| URL	| APIs Used	| Purpose |
| --- | --- | --- | --- |
| Login |	`/login` |	`POST /auth/login` |	Authenticate user, get token |
| Signup |	`/signup` |	`POST /auth/signup` |	Create user + tenant + token |
| Media Library	| `/library` |	`GET /media`, `POST /media/upload-intent` |	List media, start uploads |
| Media Detail	| `/media/[id]` |	`GET /media/{id}`, `GET /analysis`, `POST /analysis/query` |	View file, show history, ask GPT for that file |
| Analyze Everything |	(button) |	`POST /analysis/query` (with `scope: "all_user_media"`)	| Ask GPT about full tenant media library |
| Analysis History |	`/analysis` |	`GET /analysis` |	List past analyses |
| Health (internal) |	—	| `GET /health` |	System monitoring |
