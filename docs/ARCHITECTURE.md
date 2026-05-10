# ConstructServ – System Architecture

This document describes the full architecture of the RukmerGPT platform, including:
- High-level system design  
- Backend architecture  
- Frontend architecture  
- Storage & processing pipeline  
- LLM analysis flow  
- Mermaid diagrams for clarity  

---

# 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph FE["Frontend Web App (React/Next.js)"]
      FE_Login[Login / Signup]
      FE_Upload[Upload Images / Videos]
      FE_Library[Media Library]
      FE_Viewer[Media Viewer]
      FE_GPT[Rukmer GPT Chat Panel]
    end

    subgraph BE["Backend API (FastAPI – Modular Monolith)"]
      BE_Auth[Auth & Tenants]
      BE_Media[Media Module]
      BE_Analysis["Analysis (Rukmer GPT)"]
      BE_Billing[Billing / Usage]
      BE_Admin[Admin / Monitoring]
      BE_MW[Tenant-Aware Middleware]
    end

    subgraph Storage[Storage Layer]
      Obj["Object Storage<br>(S3 / Blob / GCS)"]
      DB[(PostgreSQL)]
      VS[(Vector Store)]
    end

    subgraph Workers[Media Processing Workers / Functions]
      VidW[Video Pipeline<br>Transcode / Keyframes / Transcript / Tags]
      ImgW[Image Pipeline<br>Thumbnails / Tags]
      EmbW[Embedding Generation]
    end

    subgraph AI[LLM + Search Layer]
      VSrch[Tenant-Scoped Vector Search]
      LLM["External LLM<br>(OpenAI / Claude / etc.)"]
    end

    FE -->|"HTTPS (JWT with tenant_id,user_id)"| BE_MW
    BE_MW --> BE_Auth
    BE_MW --> BE_Media
    BE_MW --> BE_Analysis
    BE_MW --> BE_Billing
    BE_MW --> BE_Admin

    BE_Media --> Obj
    BE_Media --> DB
    BE_Analysis --> VS
    BE_Analysis --> DB

    Obj -->|Upload Events| Workers
    Workers --> DB
    Workers --> VS
    Workers --> Obj

    BE_Analysis --> VSrch
    VSrch --> VS
    VSrch --> LLM
```

---

# 2. Backend Architecture (Modular Monolith)

```mermaid
flowchart TD
    subgraph API["API Layer (FastAPI)"]
      AuthAPI[auth_api.py]
      MediaAPI[media_api.py]
      AnalysisAPI[analysis_api.py]
      BillingAPI[billing_api.py]
      AdminAPI[admin_api.py]
    end

    subgraph Services[Application Services]
      AuthSvc[AuthService]
      TenantSvc[TenantService]
      MediaSvc[MediaService]
      AnalysisSvc["AnalysisService<br>(Rukmer GPT)"]
      BillingSvc[BillingService]
    end

    subgraph Domain[Domain Layer]
      User[User]
      Tenant[Tenant]
      MediaAsset[MediaAsset]
      AnalysisReq[AnalysisRequest]
      AnalysisRes[AnalysisResult]
      UsageRec[UsageRecord]
    end

    subgraph Infra[Infrastructure Layer]
      subgraph DB[DB / Persistence]
        ORM[SQLAlchemy ORM Models]
        UserRepo[UserRepository]
        TenantRepo[TenantRepository]
        MediaRepo[MediaRepository]
        AnalysisRepo[AnalysisRepository]
        UsageRepo[UsageRepository]
      end

      subgraph Storage[Storage]
        BlobClient["BlobClient<br>(S3 / Blob)"]
      end

      subgraph Events[Events]
        EventPub["EventPublisher<br>(queues / bus)"]
      end

      subgraph AI[AI & Search]
        AIClient["AIClient<br>(LLM abstraction)"]
        VecClient[VectorStoreClient]
      end
    end

    subgraph Workers[Workers / Functions]
      VidWorker[VideoProcessorWorker]
      ImgWorker[ImageProcessorWorker]
      EmbWorker[EmbeddingWorker]
    end

    AuthAPI --> AuthSvc
    MediaAPI --> MediaSvc
    AnalysisAPI --> AnalysisSvc
    BillingAPI --> BillingSvc
    AdminAPI --> AuthSvc

    AuthSvc --> User
    TenantSvc --> Tenant
    MediaSvc --> MediaAsset
    AnalysisSvc --> AnalysisReq
    AnalysisSvc --> AnalysisRes
    BillingSvc --> UsageRec

    AuthSvc --> UserRepo
    TenantSvc --> TenantRepo
    MediaSvc --> MediaRepo
    AnalysisSvc --> AnalysisRepo
    BillingSvc --> UsageRepo

    MediaSvc --> BlobClient
    AnalysisSvc --> VecClient
    AnalysisSvc --> AIClient
    AnalysisSvc --> EventPub

    VidWorker --> BlobClient
    VidWorker --> AnalysisRepo
    VidWorker --> VecClient

    ImgWorker --> BlobClient
    ImgWorker --> AnalysisRepo
    ImgWorker --> VecClient

    EmbWorker --> VecClient
    EmbWorker --> AnalysisRepo
```

---

# 3. Frontend Architecture (React / Next.js)

```mermaid
flowchart TD
    subgraph FE["Frontend (React / Next.js)"]
      subgraph Pages[pages/]
        Login[login.tsx]
        Signup[signup.tsx]
        Library[library.tsx]
        MediaPage["media/[id].tsx"]
      end

      subgraph Components[components/]
        Layout[Layout]
        MediaGrid[MediaGrid]
        MediaCard[MediaCard]
        MediaViewer[MediaViewer<br>image/video]
        GPTPanel[GPTChatPanel]
      end

      subgraph API[api/]
        ApiClient[client.ts<br>fetch wrapper]
        ApiAuth[auth.ts]
        ApiMedia[media.ts]
        ApiAnalysis[analysis.ts]
      end

      subgraph State[state/]
        AuthStore[authStore<br>token, user]
        UIStore[uiStore<br>selected files, filters]
      end
    end

    FE -->|HTTPS JWT| BE[(Backend API)]

    Login --> ApiAuth
    Signup --> ApiAuth
    Library --> ApiMedia
    MediaPage --> ApiMedia
    MediaPage --> ApiAnalysis
    MediaGrid --> ApiMedia
    GPTPanel --> ApiAnalysis

    ApiAuth --> ApiClient
    ApiMedia --> ApiClient
    ApiAnalysis --> ApiClient

    ApiAuth --> AuthStore
    ApiMedia --> UIStore
    ApiAnalysis --> UIStore
```

---

# 4. Cloud / Infrastructure Architecture

```mermaid
flowchart TD
    subgraph Edge[Edge / Entry]
      DNS[DNS / CDN / Front Door]
    end

    subgraph FE[Frontend Hosting]
      StaticHost["Static Hosting<br>(S3 / Blob / App Service)"]
    end

    subgraph BE[Backend API Tier]
      APIServer["Backend API<br>(FastAPI on ECS/AKS/VM)"]
    end

    subgraph Core[Platform Core]
      Obj["Object Storage<br>(S3 / Blob / GCS)"]
      PG[(PostgreSQL)]
      Queue["Queue / Bus<br>(SQS / Service Bus)"]
      VStore["(Vector Store<br>(pgvector / Pinecone))"]
    end

    subgraph Workers[Media Processing]
      VideoFunc["Video Processor<br>(Worker / Function)"]
      ImageFunc["Image Processor<br>(Worker / Function)"]
      EmbFunc[Embedding Worker]
    end

    subgraph ExternalAI[External AI Providers]
      GPT["LLM Provider<br>(OpenAI / Claude)"]
      VidIndexer["Video Indexer<br>(Azure / Custom)"]
    end

    DNS --> StaticHost
    DNS --> APIServer

    StaticHost --> APIServer

    APIServer --> Obj
    APIServer --> PG
    APIServer --> VStore
    APIServer --> Queue

    Obj -->|Upload Events| Queue

    Queue --> VideoFunc
    Queue --> ImageFunc

    VideoFunc --> Obj
    VideoFunc --> VidIndexer
    VideoFunc --> PG
    VideoFunc --> VStore

    ImageFunc --> Obj
    ImageFunc --> GPT
    ImageFunc --> PG
    ImageFunc --> VStore

    EmbFunc --> PG
    EmbFunc --> VStore

    APIServer --> GPT
```

---

# 5. Sequence Diagram – Upload Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (React)
    participant B as Backend API (FastAPI)
    participant S as Object Storage
    participant DB as Database

    U->>F: Select file to upload
    F->>B: POST /media/upload-intent<br> (auth token)
    B->>DB: INSERT media row<br> (tenant_id, status='uploading')
    DB-->>B: media_id created
    B->>S: Generate presigned URL<br> /{tenant_id}/raw/{media_id}.ext
    S-->>B: Presigned URL
    B-->>F: { media_id, presigned_url }

    F->>S: PUT file via presigned URL
    S-->>F: 200 OK (upload complete)

    Note over S: Storage emits "media_uploaded" event<br/>to queue / event grid

    F->>B: (Optional) GET /media/{media_id}<br>to check status
    B->>DB: SELECT status FROM media
    DB-->>B: status = 'uploading' / 'processing' / 'ready'
    B-->>F: status response
```

---

# 6. Sequence Diagram – Media Processing Pipeline

```mermaid
sequenceDiagram
    participant S as Object Storage
    participant Q as Queue / Event Bus
    participant W as Media Worker
    participant AI as Video Indexer / Vision Models
    participant DB as Database
    participant VS as Vector Store

    S->>Q: Emit event "media_uploaded"<br/>{tenant_id, media_id, path, media_type}
    Q-->>W: Deliver message

    W->>S: Download raw file<br/>(/tenant_id/raw/media_id.ext)

    alt media_type == video
        W->>AI: Analyze video<br/>(transcript, labels, shots)
        AI-->>W: transcript, tags, timestamps
    else media_type == image
        W->>AI: Analyze image<br/>(labels, tags)
        AI-->>W: tags, features
    end

    W->>VS: Upsert embeddings<br/>(tenant_id, media_id, vectors, metadata)
    W->>DB: INSERT INTO media_analysis<br/>(tenant_id, media_id, transcript, tags, metadata)
    W->>S: Upload processed outputs<br/>(/tenant_id/processed/media_id/...)
    W->>DB: UPDATE media SET status='ready'<br/>WHERE media_id=...
```

---

# 7. Sequence Diagram – GPT Query Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend API
    participant DB as Database
    participant VS as Vector Store
    participant LLM as LLM Provider

    U->>F: Type question<br/>"Show me all clips with solar panels near roads"
    F->>B: POST /analysis/query<br/>{ question, scope=all_user_media }

    B->>DB: SELECT media for user/tenant
    DB-->>B: List of media_ids

    B->>VS: Vector search<br/>query + filter(tenant_id)
    VS-->>B: Top-k relevant embeddings<br/>(media_ids, snippets, metadata)

    B->>DB: Fetch transcripts/tags<br/>for relevant media_ids
    DB-->>B: transcript chunks, tags

    Note over B: Build prompt with<br/>question + snippets + instructions

    B->>LLM: Chat/completion request<br/>(prompt + context)
    LLM-->>B: Answer text + referenced media

    B->>DB: INSERT chat session / messages<br/>(tenant_id, user_id, content)
    B-->>F: JSON answer<br/>{ summary, related_clips }

    F-->>U: Render answer and links<br/>to videos/timestamps
```
---
