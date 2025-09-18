"""
Evaluation Service for automated assessment and grading
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.services.nlp_service import NLPService
from app.core.config import settings

class EvaluationService:
    """Service for automated evaluation and grading"""

    def __init__(self):
        self.nlp_service = NLPService()
        self.executor = ThreadPoolExecutor(max_workers=4)

    async def load_models(self):
        """Load required models"""
        await self.nlp_service.load_models()

    async def evaluate_submission(
        self,
        submission: str,
        course_id: str,
        evaluation_criteria: Dict[str, Any],
        question_type: str = "essay"
    ) -> Dict[str, Any]:
        """
        Evaluate a student submission

        Args:
            submission: Student's answer/submission
            course_id: Course identifier
            evaluation_criteria: Evaluation criteria and rubrics
            question_type: Type of question (essay, short_answer, etc.)

        Returns:
            Evaluation result with score, feedback, and analysis
        """
        try:
            evaluation_result = {
                "score": 0.0,
                "max_score": evaluation_criteria.get("max_score", 100),
                "confidence": 0.0,
                "feedback": [],
                "criteria_scores": {},
                "analysis": {},
                "timestamp": datetime.utcnow().isoformat(),
                "ai_model_version": "1.0.0"
            }

            # Evaluate based on question type
            if question_type == "essay":
                result = await self._evaluate_essay(submission, evaluation_criteria)
            elif question_type == "short_answer":
                result = await self._evaluate_short_answer(submission, evaluation_criteria)
            elif question_type == "multiple_choice":
                result = await self._evaluate_multiple_choice(submission, evaluation_criteria)
            else:
                result = await self._evaluate_general(submission, evaluation_criteria)

            # Update evaluation result
            evaluation_result.update(result)

            return evaluation_result

        except Exception as e:
            print(f"Error evaluating submission: {e}")
            return {
                "score": 0.0,
                "max_score": evaluation_criteria.get("max_score", 100),
                "confidence": 0.0,
                "feedback": ["평가를 처리하는 중 오류가 발생했습니다."],
                "criteria_scores": {},
                "analysis": {"error": str(e)},
                "timestamp": datetime.utcnow().isoformat(),
                "ai_model_version": "1.0.0"
            }

    async def _evaluate_essay(self, submission: str, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate essay-type submissions"""
        result = {
            "score": 0.0,
            "confidence": 0.8,
            "feedback": [],
            "criteria_scores": {},
            "analysis": {}
        }

        # Get expected answer if available
        expected_answer = criteria.get("expected_answer", "")
        rubric = criteria.get("rubric", {})

        # Basic quality analysis
        quality_analysis = self.nlp_service.evaluate_answer_quality(submission, expected_answer)

        # Calculate score based on quality
        base_score = quality_analysis["score"] * criteria.get("max_score", 100)

        # Apply rubric-based adjustments
        rubric_score = await self._apply_rubric(submission, rubric)

        # Combine scores (weighted average)
        final_score = (base_score * 0.7) + (rubric_score * 0.3)

        result["score"] = round(final_score, 1)
        result["confidence"] = quality_analysis["confidence"]
        result["feedback"] = quality_analysis["feedback"]
        result["criteria_scores"] = quality_analysis["criteria"]
        result["analysis"] = {
            "word_count": len(submission.split()),
            "quality_score": quality_analysis["score"],
            "rubric_score": rubric_score,
            "similarity_to_expected": self.nlp_service.calculate_similarity(submission, expected_answer),
            "sentiment": self.nlp_service.analyze_sentiment(submission),
            "keywords": self.nlp_service.extract_keywords(submission, 5)
        }

        return result

    async def _evaluate_short_answer(self, submission: str, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate short answer submissions"""
        result = {
            "score": 0.0,
            "confidence": 0.9,
            "feedback": [],
            "criteria_scores": {},
            "analysis": {}
        }

        expected_answer = criteria.get("expected_answer", "")
        max_score = criteria.get("max_score", 100)

        # Calculate similarity to expected answer
        similarity = self.nlp_service.calculate_similarity(submission, expected_answer)

        # Basic scoring logic
        if similarity >= 0.9:
            score = max_score
            feedback = ["완벽한 답변입니다!"]
        elif similarity >= 0.7:
            score = max_score * 0.8
            feedback = ["좋은 답변이지만 조금 더 정확할 수 있습니다."]
        elif similarity >= 0.5:
            score = max_score * 0.6
            feedback = ["기본 개념은 맞지만 더 자세한 설명이 필요합니다."]
        else:
            score = max_score * 0.3
            feedback = ["답변을 다시 검토해보세요. 주요 개념이 포함되어 있나요?"]

        result["score"] = round(score, 1)
        result["feedback"] = feedback
        result["criteria_scores"] = {
            "accuracy": similarity,
            "relevance": similarity
        }
        result["analysis"] = {
            "similarity_score": similarity,
            "word_count": len(submission.split()),
            "expected_keywords": self.nlp_service.extract_keywords(expected_answer, 3),
            "submission_keywords": self.nlp_service.extract_keywords(submission, 3)
        }

        return result

    async def _evaluate_multiple_choice(self, submission: str, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate multiple choice submissions"""
        correct_answer = criteria.get("correct_answer", "")
        max_score = criteria.get("max_score", 100)

        # Simple exact match for multiple choice
        is_correct = submission.strip().lower() == correct_answer.strip().lower()

        result = {
            "score": max_score if is_correct else 0.0,
            "confidence": 1.0,
            "feedback": ["정답입니다!"] if is_correct else ["틀렸습니다. 다시 시도해보세요."],
            "criteria_scores": {
                "accuracy": 1.0 if is_correct else 0.0
            },
            "analysis": {
                "submitted_answer": submission,
                "correct_answer": correct_answer,
                "is_correct": is_correct
            }
        }

        return result

    async def _evaluate_general(self, submission: str, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """General evaluation for unspecified question types"""
        quality_analysis = self.nlp_service.evaluate_answer_quality(submission, "")

        result = {
            "score": quality_analysis["score"] * criteria.get("max_score", 100),
            "confidence": quality_analysis["confidence"],
            "feedback": quality_analysis["feedback"],
            "criteria_scores": quality_analysis["criteria"],
            "analysis": {
                "word_count": len(submission.split()),
                "sentiment": self.nlp_service.analyze_sentiment(submission),
                "keywords": self.nlp_service.extract_keywords(submission, 5)
            }
        }

        return result

    async def _apply_rubric(self, submission: str, rubric: Dict[str, Any]) -> float:
        """Apply rubric-based evaluation"""
        if not rubric:
            return 50.0  # Default neutral score

        score = 0.0
        total_weight = 0.0

        # Evaluate each rubric criterion
        for criterion, details in rubric.items():
            weight = details.get("weight", 1.0)
            max_points = details.get("max_points", 10)

            criterion_score = await self._evaluate_criterion(submission, details)
            score += (criterion_score / max_points) * weight
            total_weight += weight

        # Normalize to 0-100 scale
        if total_weight > 0:
            return (score / total_weight) * 100
        return 50.0

    async def _evaluate_criterion(self, submission: str, criterion_details: Dict[str, Any]) -> float:
        """Evaluate a specific rubric criterion"""
        criterion_type = criterion_details.get("type", "general")
        requirements = criterion_details.get("requirements", [])

        if criterion_type == "keyword_match":
            # Check for presence of required keywords
            submission_lower = submission.lower()
            matched_keywords = 0

            for keyword in requirements:
                if keyword.lower() in submission_lower:
                    matched_keywords += 1

            return (matched_keywords / len(requirements)) * criterion_details.get("max_points", 10)

        elif criterion_type == "length_check":
            # Check submission length
            min_length = criterion_details.get("min_length", 0)
            max_length = criterion_details.get("max_length", float('inf'))
            word_count = len(submission.split())

            if word_count >= min_length and word_count <= max_length:
                return criterion_details.get("max_points", 10)
            elif word_count < min_length:
                return (word_count / min_length) * criterion_details.get("max_points", 10)
            else:
                return criterion_details.get("max_points", 10) * 0.8  # Slight penalty for being too long

        elif criterion_type == "quality_check":
            # Use NLP quality analysis
            quality = self.nlp_service.evaluate_answer_quality(submission, "")
            return quality["score"] * criterion_details.get("max_points", 10)

        else:
            # General quality check
            quality = self.nlp_service.evaluate_answer_quality(submission, "")
            return quality["score"] * criterion_details.get("max_points", 10)

    async def batch_evaluate(
        self,
        submissions: List[Dict[str, Any]],
        course_id: str,
        evaluation_criteria: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Batch evaluate multiple submissions"""
        tasks = []
        for submission in submissions:
            task = self.evaluate_submission(
                submission["content"],
                course_id,
                evaluation_criteria,
                submission.get("question_type", "essay")
            )
            tasks.append(task)

        # Execute evaluations concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Handle evaluation errors
                processed_results.append({
                    "error": str(result),
                    "score": 0.0,
                    "submission_index": i
                })
            else:
                processed_results.append(result)

        return processed_results

    async def get_evaluation_statistics(
        self,
        evaluations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Calculate statistics for a set of evaluations"""
        if not evaluations:
            return {"error": "No evaluations provided"}

        scores = [eval["score"] for eval in evaluations if "score" in eval]

        if not scores:
            return {"error": "No valid scores found"}

        stats = {
            "count": len(scores),
            "mean": round(sum(scores) / len(scores), 2),
            "median": round(sorted(scores)[len(scores) // 2], 2),
            "min": min(scores),
            "max": max(scores),
            "standard_deviation": round((sum((x - sum(scores)/len(scores))**2 for x in scores) / len(scores))**0.5, 2),
            "distribution": {
                "excellent": len([s for s in scores if s >= 90]),
                "good": len([s for s in scores if 80 <= s < 90]),
                "average": len([s for s in scores if 70 <= s < 80]),
                "below_average": len([s for s in scores if 60 <= s < 70]),
                "poor": len([s for s in scores if s < 60])
            }
        }

        return stats
