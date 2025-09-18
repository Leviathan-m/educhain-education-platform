"""
Contribution scoring API routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any

from app.services.contribution_analyzer import ContributionAnalyzer

router = APIRouter()

analyzer = ContributionAnalyzer()


class ContributionScoreRequest(BaseModel):
    user_data: Dict[str, Any] = Field(default_factory=dict)
    contribution_type: str = Field(...)


@router.post("/calculate-score")
async def calculate_score(request: ContributionScoreRequest):
    try:
        return analyzer.predict_contribution_score(request.user_data, request.contribution_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Contribution score failed: {str(e)}")


