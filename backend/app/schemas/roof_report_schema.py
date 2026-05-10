# app/schemas/roof_report_schema.py
from pydantic import BaseModel
from typing import List, Literal

class RoofIssue(BaseModel):
    id: int
    location: str
    issue_type: str
    severity: Literal["low", "medium", "high"]
    evidence: str
    recommended_action: str

class RoofReportResult(BaseModel):
    overall_damage_level: Literal["low", "medium", "high"]
    summary: str
    issues: List[RoofIssue]
    safety_risks: List[str]
    recommended_actions_overall: List[str]
