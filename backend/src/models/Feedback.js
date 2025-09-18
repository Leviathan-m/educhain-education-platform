const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['peer', 'manager', 'subordinate', 'customer', 'self'],
    required: true
  },

  // 피드백 내용
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },

  // 평가 점수들 (1-5 척도)
  ratings: {
    technical: { type: Number, min: 1, max: 5 },
    collaboration: { type: Number, min: 1, max: 5 },
    leadership: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    innovation: { type: Number, min: 1, max: 5 },
    overall: { type: Number, min: 1, max: 5, required: true }
  },

  // AI 분석 결과
  aiAnalysis: {
    sentimentScore: { type: Number, min: -1, max: 1 }, // 감성 분석 점수
    skillTags: [String], // 추출된 스킬 태그들
    improvementAreas: [String], // 개선 영역
    strengths: [String], // 강점
    confidence: { type: Number, min: 0, max: 1 }, // AI 분석 신뢰도
    feedbackType: {
      type: String,
      enum: ['constructive', 'positive', 'neutral', 'critical']
    }
  },

  // 피드백 관련 맥락
  context: {
    projectId: mongoose.Schema.Types.ObjectId,
    period: {
      start: Date,
      end: Date
    },
    category: {
      type: String,
      enum: ['performance', 'development', 'behavioral', 'technical']
    }
  },

  // 익명성 설정
  isAnonymous: {
    type: Boolean,
    default: false
  },

  // 상태 관리
  status: {
    type: String,
    enum: ['draft', 'submitted', 'reviewed', 'archived'],
    default: 'submitted'
  },

  // 리뷰 정보
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,

  // 메타데이터
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// 인덱스
feedbackSchema.index({ fromUser: 1, toUser: 1 });
feedbackSchema.index({ toUser: 1, type: 1, createdAt: -1 });
feedbackSchema.index({ 'aiAnalysis.sentimentScore': 1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

// 가상 필드들
feedbackSchema.virtual('isPositive').get(function() {
  return this.aiAnalysis.sentimentScore > 0.1;
});

feedbackSchema.virtual('isConstructive').get(function() {
  return this.aiAnalysis.feedbackType === 'constructive';
});

// 정적 메서드들
feedbackSchema.statics.get360Feedback = async function(userId, period = null) {
  const matchConditions = { toUser: userId, status: 'submitted' };

  if (period) {
    matchConditions.createdAt = {
      $gte: period.start,
      $lte: period.end
    };
  }

  return this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$type',
        feedbacks: { $push: '$$ROOT' },
        avgRating: { $avg: '$ratings.overall' },
        count: { $sum: 1 },
        avgSentiment: { $avg: '$aiAnalysis.sentimentScore' }
      }
    }
  ]);
};

feedbackSchema.statics.calculateFeedbackScore = async function(userId, feedbackType = null) {
  const matchConditions = { toUser: userId, status: 'submitted' };

  if (feedbackType) {
    matchConditions.type = feedbackType;
  }

  const result = await this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: null,
        totalFeedbacks: { $sum: 1 },
        avgOverall: { $avg: '$ratings.overall' },
        avgSentiment: { $avg: '$aiAnalysis.sentimentScore' },
        technicalAvg: { $avg: '$ratings.technical' },
        collaborationAvg: { $avg: '$ratings.collaboration' },
        leadershipAvg: { $avg: '$ratings.leadership' },
        communicationAvg: { $avg: '$ratings.communication' },
        innovationAvg: { $avg: '$ratings.innovation' }
      }
    }
  ]);

  return result[0] || {
    totalFeedbacks: 0,
    avgOverall: 0,
    avgSentiment: 0,
    technicalAvg: 0,
    collaborationAvg: 0,
    leadershipAvg: 0,
    communicationAvg: 0,
    innovationAvg: 0
  };
};

// 인스턴스 메서드들
feedbackSchema.methods.analyzeWithAI = async function() {
  // AI 서비스를 통해 피드백 분석
  const aiService = require('../services/aiService');

  try {
    const analysis = await aiService.analyzeFeedback(this.content);

    this.aiAnalysis = {
      sentimentScore: analysis.sentimentScore,
      skillTags: analysis.skillTags,
      improvementAreas: analysis.improvementAreas,
      strengths: analysis.strengths,
      confidence: analysis.confidence,
      feedbackType: analysis.feedbackType
    };

    await this.save();
    return this.aiAnalysis;
  } catch (error) {
    console.error('AI 피드백 분석 실패:', error);
    return null;
  }
};

module.exports = mongoose.model('Feedback', feedbackSchema);
