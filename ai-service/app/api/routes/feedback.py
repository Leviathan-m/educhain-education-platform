"""
Feedback analysis API routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any

from app.services.feedback_engine import FeedbackEngine

router = APIRouter()

engine = FeedbackEngine()


class AnalyzeFeedbackRequest(BaseModel):
    content: str = Field(...)


class Analyze360Request(BaseModel):
    user_id: str = Field(...)
    feedbacks: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/analyze")
async def analyze_feedback(request: AnalyzeFeedbackRequest):
    try:
        return engine.analyze_feedback(request.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-360")
async def analyze_360(request: Analyze360Request):
    try:
        return engine.generate_feedback_report(request.user_id, request.feedbacks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"360 analysis failed: {str(e)}")


