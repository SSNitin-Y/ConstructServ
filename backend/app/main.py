# backend/app/main.py

from dotenv import load_dotenv
load_dotenv()

import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api import media, jobs, ai
from app.api import conversations  # ✅ NEW: persisted conversation endpoints
from app.db import get_db

app = FastAPI(
    title="Rukmer Backend",
    version="0.1.0",
)

# ------------------------------------------------------------
# CORS
# ------------------------------------------------------------
# Local dev defaults
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Production / additional origins (comma-separated)
# Example:
# CORS_ORIGINS="https://rukmer-frontend-xxx.a.run.app,https://rukmer-frontend-yyy.run.app"
extra = os.getenv("CORS_ORIGINS", "")
if extra.strip():
    origins.extend([o.strip() for o in extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# Routers
# ------------------------------------------------------------
app.include_router(media.router)
app.include_router(jobs.router)
app.include_router(ai.router)
app.include_router(conversations.router)  # ✅ NEW

# ------------------------------------------------------------
# Health checks
# ------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/db-health")
async def db_health(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT 1"))
    one = result.scalar_one()
    return {"db": "ok", "result": int(one)}

@app.get("/")
async def root():
    return {"ok": True, "service": "rukmer-backend-api"}
