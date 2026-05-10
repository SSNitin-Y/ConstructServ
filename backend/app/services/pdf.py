# backend/app/services/pdf.py

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape


def _templates_dir() -> Path:
    # backend/templates
    return Path(__file__).resolve().parents[2] / "templates"


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_templates_dir())),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_roof_report_html(
    *,
    job_id: int,
    media_id: Optional[str],
    report: Dict[str, Any],
    created_at_iso: Optional[str] = None,
) -> str:
    env = _env()
    tpl = env.get_template("roof_report.html")

    created_at_iso = created_at_iso or datetime.utcnow().isoformat()
    return tpl.render(
        job_id=job_id,
        media_id=media_id,
        created_at=created_at_iso,
        report=report,
    )


def html_to_pdf_bytes(html: str) -> bytes:
    try:
        from weasyprint import HTML  # type: ignore
    except Exception as e:
        raise RuntimeError("WeasyPrint is not installed. Install: pip install weasyprint") from e

    return HTML(string=html).write_pdf()
