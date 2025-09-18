"""
기여도 분석 엔진 - Contribution Analyzer
멀티소스 데이터를 분석하여 개인별 기여도를 산출
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, accuracy_score
import joblib
import os
from typing import Dict, List, Any, Tuple
import logging

logger = logging.getLogger(__name__)

class ContributionAnalyzer:
    """기여도 분석 및 예측 모델"""

    def __init__(self, model_path: str = "./models"):
        self.model_path = model_path
        self.models = {}
        self.scalers = {}
        self.contribution_types = [
            'technical', 'collaboration', 'leadership',
            'innovation', 'operational', 'customer_success'
        ]
        self._load_models()

    def _load_models(self):
        """학습된 모델 로드"""
        for contrib_type in self.contribution_types:
            model_file = os.path.join(self.model_path, f'contribution_{contrib_type}_model.pkl')
            scaler_file = os.path.join(self.model_path, f'contribution_{contrib_type}_scaler.pkl')

            if os.path.exists(model_file):
                self.models[contrib_type] = joblib.load(model_file)
                self.scalers[contrib_type] = joblib.load(scaler_file)
                logger.info(f"Loaded {contrib_type} model")
            else:
                logger.warning(f"Model not found: {contrib_type}")

    def prepare_features(self, user_data: Dict[str, Any]) -> pd.DataFrame:
        """멀티소스 데이터를 ML 피처로 변환"""
        features = {}

        # 정량적 지표 (Quantitative Metrics)
        quantitative = user_data.get('quantitativeMetrics', {})

        # 프로젝트 관련
        features['project_completion_rate'] = self._calculate_completion_rate(
            quantitative.get('projectsCompleted', 0),
            quantitative.get('projectsAssigned', 0)
        )
        features['goal_achievement_rate'] = self._calculate_completion_rate(
            quantitative.get('goalsAchieved', 0),
            quantitative.get('goalsSet', 0)
        )

        # 코드 기여도
        features['code_contribution_score'] = self._calculate_code_score(quantitative)
        features['code_quality_score'] = user_data.get('codeQualityScore', 0)

        # 협업 지표
        features['collaboration_index'] = self._calculate_collaboration_index(user_data)
        features['mentoring_score'] = quantitative.get('mentoringHours', 0) / 10  # 정규화
        features['peer_feedback_score'] = self._calculate_peer_feedback_score(user_data)

        # 혁신 지표
        features['innovation_index'] = self._calculate_innovation_index(user_data)
        features['knowledge_sharing'] = quantitative.get('knowledgeSharing', 0) / 20  # 정규화

        # 리더십 지표
        features['leadership_score'] = self._calculate_leadership_score(user_data)

        # 네트워크 분석 지표
        features['network_centrality'] = user_data.get('networkCentrality', 0)
        features['cross_team_collaboration'] = quantitative.get('crossTeamProjects', 0) / 5

        # 고객 관련 지표
        features['customer_satisfaction'] = user_data.get('customerSatisfactionScore', 0)
        features['sales_performance'] = quantitative.get('salesRevenue', 0) / 100000  # 정규화

        return pd.DataFrame([features])

    def _calculate_completion_rate(self, completed: int, total: int) -> float:
        """완료율 계산"""
        return min(completed / max(total, 1), 1.0)

    def _calculate_code_score(self, quantitative: Dict) -> float:
        """코드 기여도 점수 계산"""
        commits = quantitative.get('codeCommits', 0)
        prs = quantitative.get('pullRequests', 0)
        reviews = quantitative.get('codeReviews', 0)

        # 가중치 적용
        score = (commits * 1 + prs * 3 + reviews * 2) / 50
        return min(score, 1.0)

    def _calculate_collaboration_index(self, user_data: Dict) -> float:
        """협업 지수 계산"""
        quantitative = user_data.get('quantitativeMetrics', {})

        # 다양한 협업 메트릭 결합
        centrality = user_data.get('networkCentrality', 0)
        cross_team = quantitative.get('crossTeamProjects', 0) / 5
        meetings = quantitative.get('meetingParticipationRate', 0) / 100
        feedback_given = len(user_data.get('feedbackGiven', [])) / 10

        return min((centrality * 0.3 + cross_team * 0.25 + meetings * 0.25 + feedback_given * 0.2), 1.0)

    def _calculate_peer_feedback_score(self, user_data: Dict) -> float:
        """동료 피드백 점수 계산"""
        feedbacks = user_data.get('peerFeedbacks', [])
        if not feedbacks:
            return 0.5  # 기본값

        scores = [f.get('rating', 3) for f in feedbacks]
        return np.mean(scores) / 5.0  # 5점 만점으로 정규화

    def _calculate_innovation_index(self, user_data: Dict) -> float:
        """혁신 지수 계산"""
        quantitative = user_data.get('quantitativeMetrics', {})

        # 혁신 관련 활동들
        patents = quantitative.get('patentsFiled', 0)
        innovations = quantitative.get('innovationsProposed', 0)
        process_improvements = quantitative.get('processImprovements', 0)

        score = (patents * 5 + innovations * 2 + process_improvements * 1) / 20
        return min(score, 1.0)

    def _calculate_leadership_score(self, user_data: Dict) -> float:
        """리더십 점수 계산"""
        quantitative = user_data.get('quantitativeMetrics', {})

        # 리더십 관련 메트릭
        team_size = quantitative.get('teamSizeManaged', 0) / 10
        projects_led = quantitative.get('projectsLed', 0) / 5
        mentoring_hours = quantitative.get('mentoringHours', 0) / 20

        return min((team_size * 0.4 + projects_led * 0.4 + mentoring_hours * 0.2), 1.0)

    def predict_contribution_score(
        self,
        user_data: Dict[str, Any],
        contribution_type: str
    ) -> Dict[str, Any]:
        """개인별 기여도 점수 예측"""
        if contribution_type not in self.models:
            return {
                'error': f'Model not available for {contribution_type}',
                'predicted_score': 0.0,
                'confidence': 0.0
            }

        try:
            features = self.prepare_features(user_data)
            model = self.models[contribution_type]
            scaler = self.scalers[contribution_type]

            # 데이터 정규화
            features_scaled = scaler.transform(features)

            # 예측
            predicted_score = model.predict(features_scaled)[0]

            # 신뢰도 계산 (간단한 방법)
            confidence = self._calculate_prediction_confidence(model, features_scaled)

            # 기여 요인 설명
            feature_importance = self._explain_prediction(model, features, features.columns)

            return {
                'predicted_score': float(predicted_score),
                'confidence': float(confidence),
                'contributing_factors': feature_importance,
                'feature_values': features.iloc[0].to_dict()
            }

        except Exception as e:
            logger.error(f"Prediction failed for {contribution_type}: {e}")
            return {
                'error': str(e),
                'predicted_score': 0.0,
                'confidence': 0.0
            }

    def _calculate_prediction_confidence(self, model, features_scaled) -> float:
        """예측 신뢰도 계산"""
        try:
            # 간단한 신뢰도 계산 (실제로는 더 정교한 방법 사용)
            predictions = []
            for _ in range(10):  # 여러 번 예측하여 분산 계산
                pred = model.predict(features_scaled)[0]
                predictions.append(pred)

            std_dev = np.std(predictions)
            confidence = max(0, 1 - std_dev)  # 표준편차가 작을수록 신뢰도 높음
            return min(confidence, 1.0)
        except:
            return 0.5  # 기본 신뢰도

    def _explain_prediction(self, model, features: pd.DataFrame, feature_names: List[str]) -> List[Dict]:
        """예측 기여 요인 설명"""
        try:
            if hasattr(model, 'feature_importances_'):
                importances = model.feature_importances_
                feature_importance = list(zip(feature_names, importances))
                feature_importance.sort(key=lambda x: x[1], reverse=True)

                explanations = []
                for feature, importance in feature_importance[:5]:  # 상위 5개
                    value = features.iloc[0][feature]
                    explanations.append({
                        'feature': feature,
                        'importance': float(importance),
                        'value': float(value),
                        'description': self._get_feature_description(feature, value)
                    })

                return explanations
            else:
                return []
        except:
            return []

    def _get_feature_description(self, feature: str, value: float) -> str:
        """피처 설명 생성"""
        descriptions = {
            'project_completion_rate': f'프로젝트 완료율: {value:.1%}',
            'code_contribution_score': f'코드 기여도: {value:.1f}/1.0',
            'collaboration_index': f'협업 지수: {value:.1f}/1.0',
            'leadership_score': f'리더십 점수: {value:.1f}/1.0',
            'innovation_index': f'혁신 지수: {value:.1f}/1.0',
            'network_centrality': f'네트워크 중심성: {value:.3f}',
        }
        return descriptions.get(feature, f'{feature}: {value:.2f}')

    def predict_growth_potential(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """성장 잠재력 예측"""
        try:
            # 성장 잠재력 예측 모델 (별도 모델이 필요)
            current_score = user_data.get('currentScore', 0)
            experience_years = user_data.get('experienceYears', 0)
            learning_rate = user_data.get('learningActivities', 0) / 12  # 월평균

            # 간단한 성장 잠재력 계산
            base_potential = min(current_score / 100 * 0.6 + experience_years / 10 * 0.2 + learning_rate * 0.2, 1.0)

            return {
                'growth_potential': base_potential,
                'confidence': 0.75,
                'factors': {
                    'current_performance': current_score / 100,
                    'experience': min(experience_years / 10, 1.0),
                    'learning_engagement': min(learning_rate, 1.0)
                }
            }
        except Exception as e:
            logger.error(f"Growth potential prediction failed: {e}")
            return {'growth_potential': 0.5, 'confidence': 0.5, 'factors': {}}

    def predict_retention_risk(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """이직 위험도 예측"""
        try:
            # 이직 위험 예측 모델 (별도 모델이 필요)
            satisfaction_score = user_data.get('satisfactionScore', 5) / 10
            engagement_score = user_data.get('engagementScore', 5) / 10
            compensation_satisfaction = user_data.get('compensationSatisfaction', 5) / 10

            # 간단한 위험도 계산
            risk_score = (1 - satisfaction_score) * 0.4 + (1 - engagement_score) * 0.4 + (1 - compensation_satisfaction) * 0.2

            risk_level = 'low' if risk_score < 0.3 else 'medium' if risk_score < 0.7 else 'high'

            return {
                'retention_risk': risk_score,
                'risk_level': risk_level,
                'confidence': 0.75,
                'factors': {
                    'satisfaction': satisfaction_score,
                    'engagement': engagement_score,
                    'compensation': compensation_satisfaction
                }
            }
        except Exception as e:
            logger.error(f"Retention risk prediction failed: {e}")
            return {'retention_risk': 0.5, 'risk_level': 'medium', 'confidence': 0.5, 'factors': {}}

    def train_models(self, training_data: pd.DataFrame):
        """모델 학습"""
        logger.info("Starting model training...")

        for contribution_type in self.contribution_types:
            try:
                # 해당 기여도 유형의 데이터 필터링
                type_data = training_data[training_data['contribution_type'] == contribution_type]

                if len(type_data) < 10:  # 최소 데이터 요구사항
                    logger.warning(f"Insufficient data for {contribution_type}")
                    continue

                # 피처 준비
                X = self.prepare_features(type_data)
                y = type_data['actual_performance_score']

                # 데이터 분할
                X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

                # 데이터 정규화
                scaler = StandardScaler()
                X_train_scaled = scaler.fit_transform(X_train)
                X_test_scaled = scaler.transform(X_test)

                # 모델 학습
                model = RandomForestRegressor(n_estimators=100, random_state=42)
                model.fit(X_train_scaled, y_train)

                # 모델 평가
                y_pred = model.predict(X_test_scaled)
                mse = mean_squared_error(y_test, y_pred)
                rmse = np.sqrt(mse)

                logger.info(f"{contribution_type} model trained - RMSE: {rmse:.2f}")

                # 모델 저장
                self.models[contribution_type] = model
                self.scalers[contribution_type] = scaler

                model_file = os.path.join(self.model_path, f'contribution_{contribution_type}_model.pkl')
                scaler_file = os.path.join(self.model_path, f'contribution_{contribution_type}_scaler.pkl')

                joblib.dump(model, model_file)
                joblib.dump(scaler, scaler_file)

            except Exception as e:
                logger.error(f"Failed to train {contribution_type} model: {e}")

        logger.info("Model training completed")
