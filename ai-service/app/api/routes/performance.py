"""
Performance tracking API routes
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

from app.services.performance_tracker import RealTimeTracker

router = APIRouter()

tracker = RealTimeTracker()


class TrackActivityRequest(BaseModel):
    user_id: str = Field(...)
    activity_type: str = Field(...)
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.on_event("startup")
async def on_startup():
    await tracker.initialize()


@router.post("/track-activity")
async def track_activity(request: TrackActivityRequest):
    try:
        await tracker.track_activity(request.user_id, request.activity_type, request.metadata)
        return {"status": "tracked", "user_id": request.user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking failed: {str(e)}")


@router.get("/dashboard/{user_id}")
async def get_dashboard(user_id: str):
    try:
        return await tracker.get_realtime_dashboard(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard fetch failed: {str(e)}")


@router.get("/analytics/{user_id}")
async def get_analytics(user_id: str, period: Optional[str] = "weekly"):
    try:
        return await tracker.get_performance_analytics(user_id, period or "weekly")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics fetch failed: {str(e)}")


