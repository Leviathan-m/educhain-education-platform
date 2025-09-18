"""
Prediction API routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any

from app.services.contribution_analyzer import ContributionAnalyzer

router = APIRouter()

analyzer = ContributionAnalyzer()


class UserInsightsRequest(BaseModel):
    user_data: Dict[str, Any] = Field(default_factory=dict)


@router.post("/user-insights")
async def user_insights(request: UserInsightsRequest):
    try:
        growth = analyzer.predict_growth_potential(request.user_data)
        retention = analyzer.predict_retention_risk(request.user_data)
        return {
            "growth_potential": growth.get("growth_potential", 0),
            "retention_risk": retention.get("retention_risk", 0),
            "risk_level": retention.get("risk_level", "medium"),
            "confidence": min(growth.get("confidence", 0), retention.get("confidence", 0)),
            "factors": {
                **growth.get("factors", {}),
                **retention.get("factors", {})
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"User insights failed: {str(e)}")


