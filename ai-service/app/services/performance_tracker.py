"""
실시간 성과 추적 서비스 - Real-time Performance Tracker
WebSocket과 Redis를 활용한 실시간 성과 모니터링 및 알림 시스템
"""

import asyncio
import json
import redis.asyncio as redis
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime, timedelta
import numpy as np

logger = logging.getLogger(__name__)

class RealTimeTracker:
    """실시간 성과 추적 및 알림 시스템"""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis_client = None
        self.active_connections = {}  # user_id -> websocket connections
        self.metric_buffers = {}  # 임시 메트릭 버퍼
        self.alert_thresholds = {
            'score_drop': -5,  # 점수가 5점 이상 하락시 알림
            'activity_streak': 7,  # 7일 연속 활동시 축하
            'milestone_achievement': [50, 100, 200, 500]  # 주요 마일스톤
        }

    async def initialize(self):
        """Redis 연결 초기화"""
        try:
            self.redis_client = redis.from_url(self.redis_url)
            await self.redis_client.ping()
            logger.info("Redis connection established for performance tracking")

            # 백그라운드 태스크 시작
            asyncio.create_task(self._process_metric_buffer())
            asyncio.create_task(self._check_alert_conditions())

        except Exception as e:
            logger.error(f"Failed to initialize Redis: {e}")
            raise

    async def track_activity(self, user_id: str, activity_type: str, metadata: Dict[str, Any]):
        """실시간 활동 추적"""
        try:
            timestamp = datetime.utcnow().timestamp()

            # 활동 데이터 구조화
            activity_data = {
                'user_id': user_id,
                'activity_type': activity_type,
                'timestamp': timestamp,
                'metadata': metadata,
                'score_increment': self._calculate_score_increment(activity_type, metadata)
            }

            # Redis에 실시간 데이터 저장
            await self._store_activity_data(user_id, activity_data)

            # 메트릭 버퍼에 추가 (배치 처리용)
            if user_id not in self.metric_buffers:
                self.metric_buffers[user_id] = []
            self.metric_buffers[user_id].append(activity_data)

            # 실시간 점수 업데이트
            await self._update_realtime_score(user_id, activity_data['score_increment'])

            # WebSocket을 통한 실시간 알림
            await self._notify_user(user_id, 'activity_tracked', activity_data)

            # 마일스톤 체크
            await self._check_milestones(user_id)

            logger.info(f"Activity tracked: {user_id} - {activity_type}")

        except Exception as e:
            logger.error(f"Failed to track activity: {e}")

    async def _store_activity_data(self, user_id: str, activity_data: Dict):
        """활동 데이터를 Redis에 저장"""
        # 실시간 대시보드용 데이터
        dashboard_key = f"dashboard:{user_id}:recent_activities"
        await self.redis_client.lpush(dashboard_key, json.dumps(activity_data))
        await self.redis_client.ltrim(dashboard_key, 0, 49)  # 최근 50개만 유지

        # 일별 집계 데이터
        date_key = datetime.utcnow().strftime("%Y-%m-%d")
        daily_key = f"daily:{user_id}:{date_key}:{activity_data['activity_type']}"
        await self.redis_client.incr(daily_key)

        # 활동 스트림 (전체 기록)
        stream_key = f"stream:{user_id}:activities"
        await self.redis_client.xadd(stream_key, {
            'activity_type': activity_data['activity_type'],
            'timestamp': str(activity_data['timestamp']),
            'metadata': json.dumps(activity_data['metadata']),
            'score_increment': str(activity_data['score_increment'])
        })

    def _calculate_score_increment(self, activity_type: str, metadata: Dict) -> int:
        """활동 유형별 점수 가중치 계산"""
        base_scores = {
            'code_commit': 2,
            'pull_request': 5,
            'code_review': 3,
            'meeting_participation': 1,
            'meeting_led': 3,
            'knowledge_sharing': 4,
            'mentoring_session': 6,
            'project_completed': 10,
            'goal_achieved': 8,
            'peer_recognition': 5,
            'customer_feedback': 4,
            'innovation_idea': 3,
            'presentation_given': 4,
            'training_completed': 6,
            'feedback_given': 2,
            'feedback_received': 1
        }

        base_score = base_scores.get(activity_type, 1)

        # 메타데이터 기반 추가 점수 계산
        multiplier = 1.0

        # 프로젝트 크기에 따른 배율
        if 'project_size' in metadata:
            if metadata['project_size'] == 'large':
                multiplier *= 1.5
            elif metadata['project_size'] == 'medium':
                multiplier *= 1.2

        # 영향력에 따른 배율
        if 'impact_level' in metadata:
            if metadata['impact_level'] == 'high':
                multiplier *= 1.3
            elif metadata['impact_level'] == 'medium':
                multiplier *= 1.1

        # 시간 투입도에 따른 배율
        if 'duration_hours' in metadata:
            hours = metadata['duration_hours']
            if hours > 8:
                multiplier *= 1.2
            elif hours > 4:
                multiplier *= 1.1

        return int(base_score * multiplier)

    async def _update_realtime_score(self, user_id: str, score_increment: int):
        """실시간 기여도 점수 업데이트"""
        score_key = f"scores:{user_id}:current"
        previous_score = int(await self.redis_client.get(score_key) or 0)
        new_score = previous_score + score_increment

        # 점수 업데이트
        await self.redis_client.set(score_key, new_score)

        # 마지막 업데이트 시간
        await self.redis_client.set(f"scores:{user_id}:last_updated", datetime.utcnow().timestamp())

        # 점수 변동 추적
        if abs(score_increment) >= 5:  # 5점 이상 변동시 기록
            change_key = f"score_changes:{user_id}"
            change_data = {
                'timestamp': datetime.utcnow().timestamp(),
                'previous_score': previous_score,
                'new_score': new_score,
                'change': score_increment,
                'reason': 'activity_score'
            }
            await self.redis_client.lpush(change_key, json.dumps(change_data))
            await self.redis_client.ltrim(change_key, 0, 99)  # 최근 100개만 유지

        # 실시간 알림 전송
        await self._notify_user(user_id, 'score_updated', {
            'new_score': new_score,
            'change': score_increment,
            'timestamp': datetime.utcnow().timestamp()
        })

    async def _check_milestones(self, user_id: str):
        """마일스톤 달성 체크"""
        current_score = int(await self.redis_client.get(f"scores:{user_id}:current") or 0)

        for milestone in self.alert_thresholds['milestone_achievement']:
            milestone_key = f"milestones:{user_id}:{milestone}"
            already_achieved = await self.redis_client.exists(milestone_key)

            if not already_achieved and current_score >= milestone:
                # 마일스톤 달성 기록
                await self.redis_client.set(milestone_key, datetime.utcnow().timestamp())

                # NFT 발행 자격 알림
                await self._notify_user(user_id, 'milestone_achieved', {
                    'milestone': milestone,
                    'current_score': current_score,
                    'timestamp': datetime.utcnow().timestamp(),
                    'nft_eligible': True
                })

                logger.info(f"Milestone achieved: {user_id} reached {milestone} points")

    async def _process_metric_buffer(self):
        """메트릭 버퍼 배치 처리 (매분 실행)"""
        while True:
            try:
                # 1분마다 배치 처리
                await asyncio.sleep(60)

                for user_id, activities in self.metric_buffers.items():
                    if activities:
                        # 배치 집계 처리
                        await self._batch_process_activities(user_id, activities)
                        # 버퍼 클리어
                        self.metric_buffers[user_id] = []

            except Exception as e:
                logger.error(f"Error in metric buffer processing: {e}")

    async def _batch_process_activities(self, user_id: str, activities: List[Dict]):
        """활동 배치 처리 및 집계"""
        # 활동 유형별 카운트
        activity_counts = {}
        total_score = 0

        for activity in activities:
            activity_type = activity['activity_type']
            activity_counts[activity_type] = activity_counts.get(activity_type, 0) + 1
            total_score += activity.get('score_increment', 0)

        # 배치 데이터 저장
        batch_key = f"batch:{user_id}:{int(datetime.utcnow().timestamp())}"
        batch_data = {
            'activity_counts': activity_counts,
            'total_activities': len(activities),
            'total_score': total_score,
            'timestamp': datetime.utcnow().timestamp(),
            'processed_at': datetime.utcnow().isoformat()
        }

        await self.redis_client.set(batch_key, json.dumps(batch_data))
        await self.redis_client.expire(batch_key, 86400 * 7)  # 7일 후 만료

        # 주간/월간 집계 업데이트
        await self._update_periodic_aggregates(user_id, activities)

    async def _update_periodic_aggregates(self, user_id: str, activities: List[Dict]):
        """주간/월간 집계 데이터 업데이트"""
        now = datetime.utcnow()

        # 주간 집계
        week_key = f"weekly:{user_id}:{now.strftime('%Y-W%W')}"
        for activity in activities:
            field = f"activity_{activity['activity_type']}"
            await self.redis_client.hincrby(week_key, field, 1)
            await self.redis_client.hincrby(week_key, 'total_score', activity.get('score_increment', 0))

        await self.redis_client.expire(week_key, 86400 * 30)  # 30일 후 만료

        # 월간 집계
        month_key = f"monthly:{user_id}:{now.strftime('%Y-%m')}"
        for activity in activities:
            field = f"activity_{activity['activity_type']}"
            await self.redis_client.hincrby(month_key, field, 1)
            await self.redis_client.hincrby(month_key, 'total_score', activity.get('score_increment', 0))

        await self.redis_client.expire(month_key, 86400 * 365)  # 1년 후 만료

    async def _check_alert_conditions(self):
        """알림 조건 주기적 체크 (매 5분)"""
        while True:
            try:
                await asyncio.sleep(300)  # 5분마다

                # 모든 사용자에 대해 알림 조건 체크
                user_keys = await self.redis_client.keys("scores:*:current")
                user_ids = [key.split(':')[1] for key in user_keys]

                for user_id in user_ids:
                    await self._check_user_alerts(user_id)

            except Exception as e:
                logger.error(f"Error in alert condition checking: {e}")

    async def _check_user_alerts(self, user_id: str):
        """개별 사용자 알림 조건 체크"""
        # 점수 급락 체크
        score_changes_key = f"score_changes:{user_id}"
        recent_changes = await self.redis_client.lrange(score_changes_key, 0, 4)  # 최근 5개

        if len(recent_changes) >= 3:
            recent_scores = []
            for change_json in recent_changes:
                change = json.loads(change_json)
                recent_scores.append(change['change'])

            avg_change = np.mean(recent_scores)
            if avg_change <= self.alert_thresholds['score_drop']:
                await self._notify_user(user_id, 'performance_alert', {
                    'type': 'score_drop',
                    'average_change': avg_change,
                    'message': '최근 성과 점수가 하락하고 있습니다.'
                })

        # 활동 연속 기록 체크
        daily_activities_key = f"daily:{user_id}:{datetime.utcnow().strftime('%Y-%m-%d')}:*"
        daily_keys = await self.redis_client.keys(daily_activities_key)

        total_activities = 0
        for key in daily_keys:
            count = await self.redis_client.get(key)
            total_activities += int(count or 0)

        if total_activities >= self.alert_thresholds['activity_streak']:
            await self._notify_user(user_id, 'activity_streak', {
                'streak_days': 1,  # 일일 계산으로 간소화
                'total_activities': total_activities,
                'message': f'오늘 {total_activities}개의 활동을 기록했습니다!'
            })

    async def _notify_user(self, user_id: str, event_type: str, data: Dict[str, Any]):
        """사용자에게 실시간 알림 전송"""
        notification = {
            'event_type': event_type,
            'user_id': user_id,
            'data': data,
            'timestamp': datetime.utcnow().timestamp()
        }

        # Redis Pub/Sub을 통한 알림 발행
        channel = f"user:{user_id}:notifications"
        await self.redis_client.publish(channel, json.dumps(notification))

        # 알림 히스토리 저장
        history_key = f"notifications:{user_id}"
        await self.redis_client.lpush(history_key, json.dumps(notification))
        await self.redis_client.ltrim(history_key, 0, 999)  # 최근 1000개만 유지

    async def get_realtime_dashboard(self, user_id: str) -> Dict[str, Any]:
        """실시간 대시보드 데이터 조회"""
        dashboard_data = {}

        # 현재 점수
        current_score = await self.redis_client.get(f"scores:{user_id}:current")
        dashboard_data['current_score'] = int(current_score or 0)

        # 최근 활동
        recent_activities_key = f"dashboard:{user_id}:recent_activities"
        recent_activities_json = await self.redis_client.lrange(recent_activities_key, 0, 9)
        dashboard_data['recent_activities'] = [
            json.loads(activity) for activity in recent_activities_json
        ]

        # 오늘의 활동 요약
        today = datetime.utcnow().strftime("%Y-%m-%d")
        today_activities = {}
        today_keys = await self.redis_client.keys(f"daily:{user_id}:{today}:*")

        for key in today_keys:
            activity_type = key.split(':')[-1]
            count = await self.redis_client.get(key)
            today_activities[activity_type] = int(count or 0)

        dashboard_data['today_activities'] = today_activities

        # 최근 알림
        notifications_key = f"notifications:{user_id}"
        recent_notifications_json = await self.redis_client.lrange(notifications_key, 0, 4)
        dashboard_data['recent_notifications'] = [
            json.loads(notification) for notification in recent_notifications_json
        ]

        # 점수 추이 (최근 7일)
        score_trend = []
        for i in range(7):
            date = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
            daily_score = await self.redis_client.get(f"daily_score:{user_id}:{date}")
            score_trend.append({
                'date': date,
                'score': int(daily_score or 0)
            })

        dashboard_data['score_trend'] = score_trend[::-1]  # 과거부터 현재순으로

        return dashboard_data

    async def get_performance_analytics(self, user_id: str, period: str = 'weekly') -> Dict[str, Any]:
        """성과 분석 데이터 조회"""
        analytics = {}

        if period == 'weekly':
            period_key = f"weekly:{user_id}:{datetime.utcnow().strftime('%Y-W%W')}"
        elif period == 'monthly':
            period_key = f"monthly:{user_id}:{datetime.utcnow().strftime('%Y-%m')}"
        else:
            return {'error': 'Invalid period'}

        # 기간별 활동 데이터
        period_data = await self.redis_client.hgetall(period_key)
        analytics['period_data'] = {
            key: int(value) for key, value in period_data.items()
        }

        # 평균 계산
        if period_data:
            total_score = int(period_data.get('total_score', 0))
            total_activities = sum(int(v) for k, v in period_data.items() if k.startswith('activity_'))
            analytics['averages'] = {
                'daily_score': total_score / 7 if period == 'weekly' else total_score / 30,
                'daily_activities': total_activities / 7 if period == 'weekly' else total_activities / 30
            }

        # 비교 데이터 (이전 기간)
        analytics['comparison'] = await self._get_period_comparison(user_id, period)

        return analytics

    async def _get_period_comparison(self, user_id: str, period: str) -> Dict[str, Any]:
        """이전 기간과의 비교 데이터"""
        now = datetime.utcnow()

        if period == 'weekly':
            current_week = now.strftime('%Y-W%W')
            previous_week = (now - timedelta(weeks=1)).strftime('%Y-W%W')
            prev_key = f"weekly:{user_id}:{previous_week}"
        else:  # monthly
            current_month = now.strftime('%Y-%m')
            previous_month = (now - timedelta(days=30)).strftime('%Y-%m')
            prev_key = f"monthly:{user_id}:{previous_month}"

        current_data = await self.redis_client.hgetall(f"{period}:{user_id}:{current_week if period == 'weekly' else current_month}")
        previous_data = await self.redis_client.hgetall(prev_key)

        comparison = {}
        for key in set(list(current_data.keys()) + list(previous_data.keys())):
            current_val = int(current_data.get(key, 0))
            previous_val = int(previous_data.get(key, 0))

            if previous_val > 0:
                change_percent = ((current_val - previous_val) / previous_val) * 100
            else:
                change_percent = 100 if current_val > 0 else 0

            comparison[key] = {
                'current': current_val,
                'previous': previous_val,
                'change_percent': round(change_percent, 1)
            }

        return comparison

    async def cleanup_old_data(self, days_to_keep: int = 90):
        """오래된 데이터 정리"""
        cutoff_timestamp = (datetime.utcnow() - timedelta(days=days_to_keep)).timestamp()

        # 오래된 일별 데이터 삭제
        daily_keys = await self.redis_client.keys("daily:*:*:*")
        for key in daily_keys:
            # 키에서 날짜 추출 및 비교
            parts = key.split(':')
            if len(parts) >= 3:
                try:
                    date_str = parts[2]
                    date_timestamp = datetime.strptime(date_str, "%Y-%m-%d").timestamp()
                    if date_timestamp < cutoff_timestamp:
                        await self.redis_client.delete(key)
                except:
                    continue

        logger.info(f"Cleaned up data older than {days_to_keep} days")
