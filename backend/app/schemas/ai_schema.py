from pydantic import BaseModel
from typing import Optional

class PromptRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    system: Optional[str] = None
    media_id: Optional[str] = None
    job_id: Optional[int] = None
    report_summary: Optional[str] = None

class PromptResponse(BaseModel):
    model: str
    reply: str
