# backend/app/services/firebase_auth.py
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import firebase_admin
from firebase_admin import auth, credentials


_initialized = False


def init_firebase() -> None:
    """
    Initialize Firebase Admin safely:

    - Local dev: uses service account JSON pointed to by FIREBASE_SERVICE_ACCOUNT
    - Cloud Run / GCP: falls back to Application Default Credentials (ADC)

    IMPORTANT: Do not crash at import-time. Only initialize when needed.
    """
    global _initialized
    if _initialized or firebase_admin._apps:
        _initialized = True
        return

    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT")

    # Local dev path (service account JSON)
    if sa_path and Path(sa_path).exists():
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
        print(f"✅ Firebase Admin initialized with service account: {sa_path}")
        _initialized = True
        return

    # Cloud Run / GCP path (ADC)
    # This works when the Cloud Run service account has permissions.
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
    print("✅ Firebase Admin initialized via Application Default Credentials (Cloud Run SA)")
    _initialized = True


def verify_firebase_token(token: str) -> Dict[str, Any]:
    """
    Verify Firebase ID token and return decoded claims.
    """
    init_firebase()
    decoded = auth.verify_id_token(token)
    return decoded
