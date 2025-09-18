"""
360도 피드백 분석 엔진 - Feedback Analysis Engine
자연어 처리 기반 피드백 감성 분석 및 종합 평가
"""

from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
import numpy as np
from typing import List, Dict, Any, Tuple
import re
import logging
from collections import Counter

logger = logging.getLogger(__name__)

class FeedbackEngine:
    """360도 피드백 분석 및 감성 평가 엔진"""

    def __init__(self):
        self.sentiment_analyzer = None
        self.skill_extractor = None
        self.emotion_classifier = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._load_models()

    def _load_models(self):
        """모델 로드"""
        try:
            # 감성 분석 모델
            self.sentiment_analyzer = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                device=0 if torch.cuda.is_available() else -1
            )

            # 스킬 추출을 위한 NER 모델
            self.skill_extractor = pipeline(
                "ner",
                model="dbmdz/bert-large-cased-finetuned-conll03-english",
                device=0 if torch.cuda.is_available() else -1
            )

            logger.info("Feedback analysis models loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load models: {e}")
            # 폴백: 기본 감성 분석
            self.sentiment_analyzer = None

    def analyze_feedback(self, feedback_text: str) -> Dict[str, Any]:
        """개별 피드백 텍스트 분석"""
        if not feedback_text or len(feedback_text.strip()) < 10:
            return {
                'sentiment_score': 0.0,
                'skill_tags': [],
                'improvement_areas': [],
                'strengths': [],
                'confidence': 0.0,
                'feedback_type': 'neutral',
                'word_count': 0
            }

        try:
            # 감성 분석
            sentiment_result = self._analyze_sentiment(feedback_text)

            # 스킬 태그 추출
            skill_tags = self._extract_skills(feedback_text)

            # 개선 영역 및 강점 추출
            improvement_areas, strengths = self._categorize_feedback(feedback_text)

            # 피드백 유형 분류
            feedback_type = self._classify_feedback_type(feedback_text, sentiment_result)

            # 신뢰도 계산
            confidence = self._calculate_confidence(feedback_text, sentiment_result)

            return {
                'sentiment_score': sentiment_result['score'],
                'skill_tags': skill_tags,
                'improvement_areas': improvement_areas,
                'strengths': strengths,
                'confidence': confidence,
                'feedback_type': feedback_type,
                'word_count': len(feedback_text.split()),
                'sentiment_label': sentiment_result['label']
            }

        except Exception as e:
            logger.error(f"Feedback analysis failed: {e}")
            return {
                'sentiment_score': 0.0,
                'skill_tags': [],
                'improvement_areas': [],
                'strengths': [],
                'confidence': 0.0,
                'feedback_type': 'neutral',
                'word_count': len(feedback_text.split()),
                'error': str(e)
            }

    def _analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """감성 분석 수행"""
        if self.sentiment_analyzer:
            try:
                result = self.sentiment_analyzer(text)[0]

                # Convert to numerical score
                label = result['label'].lower()
                score = result['score']

                if label == 'label_2' or label == 'positive':
                    numerical_score = score  # Positive
                elif label == 'label_0' or label == 'negative':
                    numerical_score = -score  # Negative
                else:  # Neutral
                    numerical_score = 0.0

                return {
                    'score': numerical_score,
                    'label': label,
                    'confidence': score
                }
            except Exception as e:
                logger.warning(f"Sentiment analysis failed: {e}")

        # 폴백: 간단한 감성 분석
        return self._fallback_sentiment_analysis(text)

    def _fallback_sentiment_analysis(self, text: str) -> Dict[str, Any]:
        """기본 감성 분석 (모델이 없을 때)"""
        positive_words = ['excellent', 'great', 'good', 'outstanding', 'impressive', 'strong', 'effective', 'helpful']
        negative_words = ['poor', 'weak', 'inadequate', 'lacking', 'insufficient', 'problematic', 'difficult', 'challenging']

        text_lower = text.lower()
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)

        if positive_count > negative_count:
            score = min(0.8, positive_count * 0.2)
            label = 'positive'
        elif negative_count > positive_count:
            score = -min(0.8, negative_count * 0.2)
            label = 'negative'
        else:
            score = 0.0
            label = 'neutral'

        return {
            'score': score,
            'label': label,
            'confidence': 0.6
        }

    def _extract_skills(self, text: str) -> List[str]:
        """피드백에서 스킬/역량 태그 추출"""
        skills = []

        # 사전 정의된 스킬 키워드
        skill_keywords = {
            'technical': ['programming', 'coding', 'development', 'engineering', 'architecture'],
            'leadership': ['leading', 'management', 'guidance', 'direction', 'strategy'],
            'communication': ['communication', 'presentation', 'speaking', 'listening', 'writing'],
            'collaboration': ['teamwork', 'cooperation', 'collaboration', 'partnership'],
            'problem_solving': ['analysis', 'problem-solving', 'troubleshooting', 'critical thinking'],
            'innovation': ['creativity', 'innovation', 'design', 'improvement', 'optimization'],
            'project_management': ['planning', 'organization', 'coordination', 'execution']
        }

        text_lower = text.lower()

        for category, keywords in skill_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    skills.append(category)
                    break  # 각 카테고리당 하나만 추가

        # NER을 사용한 추가 스킬 추출
        if self.skill_extractor:
            try:
                entities = self.skill_extractor(text)
                for entity in entities:
                    if entity['entity'].startswith('B-'):
                        skills.append(entity['word'].lower())
            except Exception as e:
                logger.warning(f"NER skill extraction failed: {e}")

        return list(set(skills))  # 중복 제거

    def _categorize_feedback(self, text: str) -> Tuple[List[str], List[str]]:
        """피드백을 개선 영역과 강점으로 분류"""
        improvement_keywords = [
            'improve', 'better', 'develop', 'enhance', 'work on', 'focus on',
            'strengthen', 'increase', 'reduce', 'minimize', 'avoid', 'prevent',
            'need to', 'should', 'could', 'would benefit from'
        ]

        strength_keywords = [
            'excellent', 'great', 'strong', 'good at', 'effective', 'efficient',
            'outstanding', 'impressive', 'valuable', 'helpful', 'contributes',
            'brings', 'provides', 'demonstrates', 'shows'
        ]

        text_lower = text.lower()
        sentences = re.split(r'[.!?]+', text)

        improvements = []
        strengths = []

        for sentence in sentences:
            sentence_lower = sentence.lower().strip()

            if any(keyword in sentence_lower for keyword in improvement_keywords):
                improvements.append(sentence.strip())
            elif any(keyword in sentence_lower for keyword in strength_keywords):
                strengths.append(sentence.strip())

        return improvements[:3], strengths[:3]  # 최대 3개씩

    def _classify_feedback_type(self, text: str, sentiment: Dict) -> str:
        """피드백 유형 분류"""
        text_lower = text.lower()

        # 건설적 피드백 키워드
        constructive_indicators = [
            'suggest', 'recommend', 'consider', 'try', 'perhaps', 'maybe',
            'could improve', 'might want to', 'opportunity to'
        ]

        # 긍정적 피드백 키워드
        positive_indicators = [
            'excellent', 'outstanding', 'great', 'fantastic', 'wonderful',
            'brilliant', 'amazing', 'superb', 'perfect'
        ]

        # 부정적 피드백 키워드
        negative_indicators = [
            'poor', 'terrible', 'awful', 'horrible', 'disappointing',
            'inadequate', 'unsatisfactory', 'concerning'
        ]

        if any(indicator in text_lower for indicator in constructive_indicators):
            return 'constructive'
        elif any(indicator in text_lower for indicator in positive_indicators) or sentiment['score'] > 0.3:
            return 'positive'
        elif any(indicator in text_lower for indicator in negative_indicators) or sentiment['score'] < -0.3:
            return 'critical'
        else:
            return 'neutral'

    def _calculate_confidence(self, text: str, sentiment: Dict) -> float:
        """분석 신뢰도 계산"""
        # 텍스트 길이 기반
        word_count = len(text.split())
        length_confidence = min(word_count / 50, 1.0)  # 50단어 이상일 때 최대 신뢰도

        # 감성 점수 기반
        sentiment_confidence = abs(sentiment['score'])

        # 키워드 밀도 기반
        feedback_keywords = [
            'communication', 'leadership', 'technical', 'collaboration',
            'improve', 'excellent', 'better', 'strong', 'weak'
        ]
        keyword_density = sum(1 for keyword in feedback_keywords if keyword in text.lower())
        keyword_confidence = min(keyword_density / 3, 1.0)

        # 종합 신뢰도
        overall_confidence = (length_confidence * 0.4 + sentiment_confidence * 0.4 + keyword_confidence * 0.2)

        return min(overall_confidence, 1.0)

    def calculate_360_score(self, user_id: str, feedbacks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """360도 피드백 종합 점수 계산"""
        if not feedbacks:
            return {
                'overall_360_score': 0.0,
                'feedback_count': 0,
                'scores_by_source': {},
                'improvement_areas': [],
                'strengths': [],
                'skill_distribution': {},
                'confidence': 0.0
            }

        # 출처별 피드백 그룹화
        scores_by_source = {}
        all_sentiment_scores = []
        all_improvements = []
        all_strengths = []
        all_skills = []

        source_types = ['peer', 'manager', 'subordinate', 'customer']

        for source_type in source_types:
            source_feedbacks = [f for f in feedbacks if f.get('type') == source_type]

            if source_feedbacks:
                # 출처별 평균 점수 계산
                avg_rating = np.mean([f.get('ratings', {}).get('overall', 3) for f in source_feedbacks])
                avg_sentiment = np.mean([f.get('aiAnalysis', {}).get('sentimentScore', 0) for f in source_feedbacks])

                scores_by_source[source_type] = {
                    'average_rating': float(avg_rating),
                    'average_sentiment': float(avg_sentiment),
                    'feedback_count': len(source_feedbacks)
                }

                # 감성 점수 수집
                all_sentiment_scores.extend([f.get('aiAnalysis', {}).get('sentimentScore', 0) for f in source_feedbacks])

                # 개선 영역 및 강점 수집
                for feedback in source_feedbacks:
                    ai_analysis = feedback.get('aiAnalysis', {})
                    all_improvements.extend(ai_analysis.get('improvementAreas', []))
                    all_strengths.extend(ai_analysis.get('strengths', []))
                    all_skills.extend(ai_analysis.get('skillTags', []))
            else:
                scores_by_source[source_type] = {
                    'average_rating': 0.0,
                    'average_sentiment': 0.0,
                    'feedback_count': 0
                }

        # 종합 점수 계산 (가중치 적용)
        weights = {
            'peer': 0.3,
            'manager': 0.4,
            'subordinate': 0.2,
            'customer': 0.1
        }

        weighted_score = 0.0
        total_weight = 0.0

        for source_type, data in scores_by_source.items():
            if data['feedback_count'] > 0:
                # 평가 점수와 감성 점수의 평균
                combined_score = (data['average_rating'] / 5.0) * 0.6 + (data['average_sentiment'] + 1) / 2 * 0.4
                weighted_score += combined_score * weights[source_type]
                total_weight += weights[source_type]

        overall_score = (weighted_score / total_weight) * 100 if total_weight > 0 else 0.0

        # 스킬 분포 분석
        skill_distribution = Counter(all_skills)

        # 개선 영역 및 강점 정리 (중복 제거 및 카운팅)
        improvement_distribution = Counter(all_improvements)
        strength_distribution = Counter(all_strengths)

        # 상위 개선 영역 및 강점 추출
        top_improvements = [item[0] for item in improvement_distribution.most_common(5)]
        top_strengths = [item[0] for item in strength_distribution.most_common(5)]

        # 신뢰도 계산
        feedback_count = len(feedbacks)
        source_diversity = sum(1 for source in scores_by_source.values() if source['feedback_count'] > 0)
        confidence = min(feedback_count / 10 * 0.7 + source_diversity / 4 * 0.3, 1.0)

        return {
            'overall_360_score': round(overall_score, 1),
            'feedback_count': feedback_count,
            'scores_by_source': scores_by_source,
            'improvement_areas': top_improvements,
            'strengths': top_strengths,
            'skill_distribution': dict(skill_distribution.most_common(10)),
            'confidence': round(confidence, 2),
            'sentiment_summary': {
                'average_sentiment': round(np.mean(all_sentiment_scores), 3) if all_sentiment_scores else 0.0,
                'sentiment_distribution': {
                    'positive': len([s for s in all_sentiment_scores if s > 0.1]),
                    'neutral': len([s for s in all_sentiment_scores if -0.1 <= s <= 0.1]),
                    'negative': len([s for s in all_sentiment_scores if s < -0.1])
                }
            }
        }

    def generate_feedback_report(self, user_id: str, feedbacks: List[Dict]) -> Dict[str, Any]:
        """종합 피드백 리포트 생성"""
        analysis_360 = self.calculate_360_score(user_id, feedbacks)

        # 트렌드 분석
        feedback_timeline = self._analyze_feedback_timeline(feedbacks)

        # 개인화된 인사이트
        insights = self._generate_personalized_insights(analysis_360)

        from datetime import datetime
        return {
            'user_id': user_id,
            'analysis_date': datetime.utcnow().isoformat(),
            '360_analysis': analysis_360,
            'timeline_analysis': feedback_timeline,
            'personalized_insights': insights,
            'recommendations': self._generate_recommendations(analysis_360)
        }

    def _analyze_feedback_timeline(self, feedbacks: List[Dict]) -> Dict[str, Any]:
        """시간에 따른 피드백 트렌드 분석"""
        from datetime import datetime
        # 날짜별로 피드백 그룹화
        feedbacks_by_month = {}
        for feedback in feedbacks:
            created_at = feedback.get('createdAt') or feedback.get('created_at')
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                elif isinstance(created_at, (int, float)):
                    dt = datetime.utcfromtimestamp(created_at)
                else:
                    dt = datetime.utcnow()
            except Exception:
                dt = datetime.utcnow()
            month_key = dt.strftime('%Y-%m')
            feedbacks_by_month.setdefault(month_key, []).append(feedback)

        # 월별 평균 점수 계산
        monthly_scores = {}
        for month, month_feedbacks in feedbacks_by_month.items():
            scores = []
            for f in month_feedbacks:
                ratings = f.get('ratings') or {}
                overall = ratings.get('overall')
                if overall is None:
                    overall = 3
                scores.append(overall)
            avg_score = np.mean(scores) if scores else 0
            monthly_scores[month] = round(float(avg_score), 2)

        return {
            'monthly_scores': monthly_scores,
            'trend': self._calculate_trend(list(monthly_scores.values())),
            'period_count': len(monthly_scores)
        }

    def _calculate_trend(self, scores: List[float]) -> str:
        """점수 트렌드 계산"""
        if len(scores) < 2:
            return 'insufficient_data'

        recent_avg = np.mean(scores[-3:])  # 최근 3개월 평균
        earlier_avg = np.mean(scores[:-3]) if len(scores) > 3 else np.mean(scores[:len(scores)//2])

        if recent_avg > earlier_avg + 0.2:
            return 'improving'
        elif recent_avg < earlier_avg - 0.2:
            return 'declining'
        else:
            return 'stable'

    def _generate_personalized_insights(self, analysis_360: Dict) -> List[str]:
        """개인화된 인사이트 생성"""
        insights = []
        score = analysis_360['overall_360_score']

        if score >= 85:
            insights.append("탁월한 성과를 보여주고 있습니다. 리더십 역할에 적합합니다.")
        elif score >= 75:
            insights.append("좋은 평가를 받고 있습니다. 현재 역량을 유지하면서 성장 기회를 모색하세요.")
        elif score >= 65:
            insights.append("기본적인 역량은 갖추고 있지만 개선의 여지가 있습니다.")
        else:
            insights.append("개선을 위한 구체적인 액션 플랜이 필요합니다.")

        # 스킬별 인사이트
        skill_dist = analysis_360.get('skill_distribution', {})
        top_skills = list(skill_dist.keys())[:3]

        if top_skills:
            insights.append(f"가장 많이 언급된 역량: {', '.join(top_skills)}")

        return insights

    def _generate_recommendations(self, analysis_360: Dict) -> List[str]:
        """개선 추천사항 생성"""
        recommendations = []
        score = analysis_360['overall_360_score']

        if score < 70:
            recommendations.extend([
                "정기적인 피드백 세션을 통해 개선 방향을 확인하세요.",
                "멘토링 프로그램에 참여하여 역량 개발을 가속화하세요.",
                "구체적인 목표 설정과 달성 계획을 수립하세요."
            ])

        improvements = analysis_360.get('improvement_areas', [])
        if improvements:
            recommendations.append(f"개선 우선순위: {improvements[0]}")

        return recommendations
