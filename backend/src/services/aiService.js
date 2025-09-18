const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.baseURL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds for AI processing
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('AI Service error:', error.message);
        // Return a fallback response instead of throwing
        return {
          data: {
            score: 0,
            confidence: 0,
            feedback: ['AI 평가 서비스를 사용할 수 없습니다. 수동 평가를 진행해주세요.'],
            error: error.message
          }
        };
      }
    );
  }

  /**
   * Evaluate a student submission using AI
   * @param {string} submission - Student's answer/submission
   * @param {string} courseId - Course identifier
   * @param {object} evaluationCriteria - Evaluation criteria and rubrics
   * @param {string} questionType - Type of question (essay, short_answer, etc.)
   * @returns {Promise<object>} Evaluation result
   */
  async evaluateSubmission(submission, courseId, evaluationCriteria, questionType = 'essay') {
    try {
      const payload = {
        submission,
        course_id: courseId,
        evaluation_criteria: evaluationCriteria,
        question_type: questionType,
      };

      logger.info(`Sending evaluation request to AI service for course ${courseId}`);

      const response = await this.client.post('/api/evaluate', payload);

      const result = {
        score: response.data.score || 0,
        maxScore: response.data.max_score || 100,
        confidence: response.data.confidence || 0,
        feedback: response.data.feedback || [],
        criteriaScores: response.data.criteria_scores || {},
        aiEvaluation: {
          score: response.data.score || 0,
          feedback: response.data.feedback || [],
          suggestions: this._extractSuggestions(response.data.feedback || []),
          evaluatedAt: new Date(),
          modelVersion: response.data.ai_model_version || 'unknown',
          confidence: response.data.confidence || 0,
          analysis: response.data.analysis || {}
        }
      };

      logger.info(`AI evaluation completed with score: ${result.score}/${result.maxScore}`);

      return result;

    } catch (error) {
      logger.error('AI evaluation request failed:', error);
      return {
        score: 0,
        maxScore: evaluationCriteria.max_score || 100,
        confidence: 0,
        feedback: ['AI 평가 중 오류가 발생했습니다. 수동 평가를 진행해주세요.'],
        criteriaScores: {},
        aiEvaluation: {
          score: 0,
          feedback: ['AI 평가 중 오류가 발생했습니다.'],
          suggestions: ['수동 평가를 고려해주세요.'],
          evaluatedAt: new Date(),
          modelVersion: 'error',
          confidence: 0,
          analysis: { error: error.message }
        }
      };
    }
  }

  /**
   * Evaluate multiple submissions in batch
   * @param {Array} submissions - Array of submission objects
   * @param {string} courseId - Course identifier
   * @param {object} evaluationCriteria - Evaluation criteria
   * @returns {Promise<Array>} Array of evaluation results
   */
  async evaluateBatchSubmissions(submissions, courseId, evaluationCriteria) {
    try {
      const payload = {
        submissions,
        course_id: courseId,
        evaluation_criteria: evaluationCriteria,
      };

      logger.info(`Sending batch evaluation request for ${submissions.length} submissions`);

      const response = await this.client.post('/api/evaluate/batch', payload);

      const results = response.data.results.map(result => ({
        score: result.score || 0,
        maxScore: result.max_score || 100,
        confidence: result.confidence || 0,
        feedback: result.feedback || [],
        criteriaScores: result.criteria_scores || {},
        aiEvaluation: {
          score: result.score || 0,
          feedback: result.feedback || [],
          suggestions: this._extractSuggestions(result.feedback || []),
          evaluatedAt: new Date(),
          modelVersion: result.ai_model_version || 'unknown',
          confidence: result.confidence || 0,
          analysis: result.analysis || {}
        }
      }));

      logger.info(`Batch evaluation completed for ${results.length} submissions`);

      return results;

    } catch (error) {
      logger.error('Batch AI evaluation failed:', error);
      // Return fallback results for all submissions
      return submissions.map(() => ({
        score: 0,
        maxScore: evaluationCriteria.max_score || 100,
        confidence: 0,
        feedback: ['AI 평가 중 오류가 발생했습니다.'],
        criteriaScores: {},
        aiEvaluation: {
          score: 0,
          feedback: ['AI 평가 중 오류가 발생했습니다.'],
          suggestions: [],
          evaluatedAt: new Date(),
          modelVersion: 'error',
          confidence: 0,
          analysis: { error: error.message }
        }
      }));
    }
  }

  /**
   * Preview evaluation criteria with sample submission
   * @param {object} criteria - Evaluation criteria to preview
   * @returns {Promise<object>} Preview result
   */
  async previewEvaluationCriteria(criteria) {
    try {
      const response = await this.client.post('/api/evaluate/preview', criteria);

      return {
        sampleResult: {
          score: response.data.sample_result.score || 0,
          maxScore: response.data.sample_result.max_score || 100,
          confidence: response.data.sample_result.confidence || 0,
          feedback: response.data.sample_result.feedback || [],
          criteriaScores: response.data.sample_result.criteria_scores || {},
        },
        criteriaAnalysis: response.data.criteria_analysis || {}
      };

    } catch (error) {
      logger.error('AI criteria preview failed:', error);
      return {
        sampleResult: {
          score: 0,
          maxScore: criteria.max_score || 100,
          confidence: 0,
          feedback: ['프리뷰를 생성할 수 없습니다.'],
          criteriaScores: {},
        },
        criteriaAnalysis: { error: error.message }
      };
    }
  }

  /**
   * Get AI service health status
   * @returns {Promise<object>} Health status
   */
  async getHealthStatus() {
    try {
      const response = await this.client.get('/health/detailed');
      return response.data;
    } catch (error) {
      logger.error('AI service health check failed:', error);
      return {
        overall_status: 'unhealthy',
        error: error.message,
        service: { status: 'unavailable' }
      };
    }
  }

  /**
   * Get AI evaluation statistics
   * @returns {Promise<object>} Statistics
   */
  async getEvaluationStatistics() {
    try {
      const response = await this.client.get('/api/evaluation/stats');
      return response.data;
    } catch (error) {
      logger.error('AI statistics request failed:', error);
      return {
        error: 'Statistics unavailable',
        total_evaluations: 0,
        average_confidence: 0
      };
    }
  }

  /**
   * Extract suggestions from AI feedback
   * @param {Array<string>} feedback - AI feedback comments
   * @returns {Array<string>} Extracted suggestions
   */
  _extractSuggestions(feedback) {
    const suggestions = [];

    const suggestionKeywords = [
      '고려해보세요', '해보세요', '추천합니다', '개선', '향상',
      '포함', '추가', '더', '더욱', '충분히', '더 자세히'
    ];

    for (const comment of feedback) {
      if (suggestionKeywords.some(keyword => comment.includes(keyword))) {
        suggestions.push(comment);
      }
    }

    // If no specific suggestions found, add general improvement suggestion
    if (suggestions.length === 0 && feedback.length > 0) {
      suggestions.push('답변의 질을 높이기 위한 추가 개선을 고려해보세요.');
    }

    return suggestions;
  }

  /**
   * Track real-time activity for performance monitoring
   * @param {string} userId - User identifier
   * @param {string} activityType - Type of activity
   * @param {object} metadata - Activity metadata
   * @returns {Promise<object>} Tracking result
   */
  async trackActivity(userId, activityType, metadata = {}) {
    try {
      const payload = {
        user_id: userId,
        activity_type: activityType,
        metadata
      };

      const response = await this.client.post('/api/performance/track-activity', payload);

      return {
        success: true,
        tracked: response.data
      };
    } catch (error) {
      logger.error('Activity tracking failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get real-time performance dashboard data
   * @param {string} userId - User identifier
   * @returns {Promise<object>} Dashboard data
   */
  async getRealtimeDashboard(userId) {
    try {
      const response = await this.client.get(`/api/performance/dashboard/${userId}`);
      return response.data;
    } catch (error) {
      logger.error('Realtime dashboard fetch failed:', error);
      return {
        current_score: 0,
        recent_activities: [],
        today_activities: {},
        recent_notifications: []
      };
    }
  }

  /**
   * Get performance analytics for a period
   * @param {string} userId - User identifier
   * @param {string} period - Time period (weekly, monthly)
   * @returns {Promise<object>} Analytics data
   */
  async getPerformanceAnalytics(userId, period = 'weekly') {
    try {
      const response = await this.client.get(`/api/performance/analytics/${userId}`, {
        params: { period }
      });
      return response.data;
    } catch (error) {
      logger.error('Performance analytics fetch failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Analyze 360-degree feedback
   * @param {string} userId - User identifier
   * @param {Array} feedbacks - Feedback data array
   * @returns {Promise<object>} 360 analysis result
   */
  async analyze360Feedback(userId, feedbacks) {
    try {
      const payload = {
        user_id: userId,
        feedbacks
      };

      const response = await this.client.post('/api/feedback/analyze-360', payload);
      return response.data;
    } catch (error) {
      logger.error('360 feedback analysis failed:', error);
      return {
        overall_360_score: 0,
        feedback_count: 0,
        scores_by_source: {},
        improvement_areas: [],
        strengths: [],
        confidence: 0
      };
    }
  }

  /**
   * Analyze individual feedback text
   * @param {string} feedbackText - Feedback content
   * @returns {Promise<object>} Analysis result
   */
  async analyzeFeedback(feedbackText) {
    try {
      const payload = { content: feedbackText };
      const response = await this.client.post('/api/feedback/analyze', payload);
      return response.data;
    } catch (error) {
      logger.error('Feedback analysis failed:', error);
      return {
        sentiment_score: 0,
        skill_tags: [],
        improvement_areas: [],
        strengths: [],
        confidence: 0,
        feedback_type: 'neutral'
      };
    }
  }

  /**
   * Predict user growth potential and retention risk
   * @param {object} userData - User performance data
   * @returns {Promise<object>} Prediction results
   */
  async predictUserInsights(userData) {
    try {
      const response = await this.client.post('/api/prediction/user-insights', { user_data: userData });
      return response.data;
    } catch (error) {
      logger.error('User insights prediction failed:', error);
      return {
        growth_potential: 0.5,
        retention_risk: 0.5,
        confidence: 0,
        factors: {}
      };
    }
  }

  /**
   * Calculate contribution score using AI models
   * @param {object} userData - User data for scoring
   * @param {string} contributionType - Type of contribution
   * @returns {Promise<object>} Scoring result
   */
  async calculateContributionScore(userData, contributionType) {
    try {
      const payload = {
        user_data: userData,
        contribution_type: contributionType
      };

      const response = await this.client.post('/api/contribution/calculate-score', payload);
      return response.data;
    } catch (error) {
      logger.error('Contribution score calculation failed:', error);
      return {
        predicted_score: 0,
        confidence: 0,
        contributing_factors: []
      };
    }
  }

  /**
   * Check if AI service is available
   * @returns {Promise<boolean>} Service availability
   */
  async isAvailable() {
    try {
      const health = await this.getHealthStatus();
      return health.overall_status === 'healthy';
    } catch (error) {
      return false;
    }
  }
}

module.exports = new AIService();
