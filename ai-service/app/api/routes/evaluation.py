"""
Evaluation API routes
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.services.evaluation_service import EvaluationService

router = APIRouter()

# Initialize service
evaluation_service = EvaluationService()

# Pydantic models for request/response
class EvaluationRequest(BaseModel):
    submission: str = Field(..., description="Student's submission/answer")
    course_id: str = Field(..., description="Course identifier")
    evaluation_criteria: Dict[str, Any] = Field(..., description="Evaluation criteria and rubrics")
    question_type: str = Field("essay", description="Type of question")
    student_id: Optional[str] = Field(None, description="Student identifier")

class BatchEvaluationRequest(BaseModel):
    submissions: List[Dict[str, Any]] = Field(..., description="List of submissions to evaluate")
    course_id: str = Field(..., description="Course identifier")
    evaluation_criteria: Dict[str, Any] = Field(..., description="Evaluation criteria")

class EvaluationResponse(BaseModel):
    score: float = Field(..., description="Calculated score")
    max_score: float = Field(..., description="Maximum possible score")
    confidence: float = Field(..., description="AI confidence in the evaluation")
    feedback: List[str] = Field(..., description="Feedback comments")
    criteria_scores: Dict[str, float] = Field(..., description="Scores for individual criteria")
    analysis: Dict[str, Any] = Field(..., description="Detailed analysis results")
    timestamp: str = Field(..., description="Evaluation timestamp")
    ai_model_version: str = Field(..., description="AI model version used")

class BatchEvaluationResponse(BaseModel):
    results: List[EvaluationResponse] = Field(..., description="Evaluation results")
    statistics: Dict[str, Any] = Field(..., description="Batch statistics")

@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_submission(
    request: EvaluationRequest,
    background_tasks: BackgroundTasks
):
    """
    Evaluate a single student submission

    This endpoint uses AI to automatically evaluate and grade student submissions
    based on the provided criteria and rubrics.
    """
    try:
        result = await evaluation_service.evaluate_submission(
            submission=request.submission,
            course_id=request.course_id,
            evaluation_criteria=request.evaluation_criteria,
            question_type=request.question_type
        )

        # Add background task for logging/analytics if needed
        if request.student_id:
            background_tasks.add_task(
                log_evaluation,
                request.student_id,
                request.course_id,
                result
            )

        return EvaluationResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@router.post("/evaluate/batch", response_model=BatchEvaluationResponse)
async def evaluate_batch_submissions(request: BatchEvaluationRequest):
    """
    Evaluate multiple submissions in batch

    This endpoint processes multiple student submissions concurrently
    for efficient grading of assignments.
    """
    try:
        results = await evaluation_service.batch_evaluate(
            submissions=request.submissions,
            course_id=request.course_id,
            evaluation_criteria=request.evaluation_criteria
        )

        # Calculate statistics
        valid_results = [r for r in results if "error" not in r]
        statistics = await evaluation_service.get_evaluation_statistics(valid_results)

        return BatchEvaluationResponse(
            results=[EvaluationResponse(**r) for r in valid_results],
            statistics=statistics
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch evaluation failed: {str(e)}")

@router.get("/evaluation/stats")
async def get_evaluation_statistics():
    """
    Get evaluation system statistics

    Returns metrics about the AI evaluation system's performance
    and usage patterns.
    """
    try:
        # This would typically fetch from a database/cache
        # For now, return mock statistics
        stats = {
            "total_evaluations": 1250,
            "average_confidence": 0.85,
            "model_accuracy": 0.92,
            "processing_time_avg": 2.3,  # seconds
            "uptime_percentage": 99.7,
            "last_updated": datetime.utcnow().isoformat()
        }

        return stats

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")

@router.post("/evaluate/preview")
async def preview_evaluation_criteria(criteria: Dict[str, Any]):
    """
    Preview evaluation criteria

    Test evaluation criteria configuration before applying to real submissions.
    """
    try:
        # Sample submission for testing
        sample_submission = """
        Artificial Intelligence (AI) is a field of computer science that focuses on creating
        systems capable of performing tasks that typically require human intelligence.
        These tasks include learning, reasoning, problem-solving, perception, and language understanding.
        AI systems use algorithms and data to make decisions and predictions.
        """

        result = await evaluation_service.evaluate_submission(
            submission=sample_submission,
            course_id="preview_course",
            evaluation_criteria=criteria,
            question_type="essay"
        )

        return {
            "sample_result": EvaluationResponse(**result),
            "criteria_analysis": {
                "total_criteria": len(criteria.get("rubric", {})),
                "has_expected_answer": "expected_answer" in criteria,
                "max_score": criteria.get("max_score", 100)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")

# Background task functions
async def log_evaluation(student_id: str, course_id: str, result: Dict[str, Any]):
    """
    Log evaluation for analytics (background task)
    """
    try:
        # This would typically save to database or send to analytics service
        print(f"Evaluation logged: Student {student_id}, Course {course_id}, Score {result.get('score', 0)}")
    except Exception as e:
        print(f"Failed to log evaluation: {e}")
