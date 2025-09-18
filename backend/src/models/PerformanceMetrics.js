const mongoose = require('mongoose');

const quantitativeMetricsSchema = new mongoose.Schema({
  projectsCompleted: { type: Number, default: 0 },
  goalsAchieved: { type: Number, default: 0 },
  codeCommits: { type: Number, default: 0 },
  pullRequests: { type: Number, default: 0 },
  codeReviews: { type: Number, default: 0 },
  documentsCreated: { type: Number, default: 0 },
  meetingsLed: { type: Number, default: 0 },
  mentoringHours: { type: Number, default: 0 },
  knowledgeSharing: { type: Number, default: 0 },
  customerInteractions: { type: Number, default: 0 },
  salesRevenue: { type: Number, default: 0 }
});

const qualitativeMetricsSchema = new mongoose.Schema({
  peer360Score: { type: Number, min: 0, max: 10, default: 0 },
  managerRating: { type: Number, min: 0, max: 10, default: 0 },
  subordinateRating: { type: Number, min: 0, max: 10, default: 0 },
  collaborationIndex: { type: Number, min: 0, max: 100, default: 0 },
  innovationScore: { type: Number, min: 0, max: 100, default: 0 },
  communicationEffectiveness: { type: Number, min: 0, max: 100, default: 0 },
  leadershipScore: { type: Number, min: 0, max: 100, default: 0 },
  problemSolvingScore: { type: Number, min: 0, max: 100, default: 0 }
});

const aiGeneratedMetricsSchema = new mongoose.Schema({
  codeQualityScore: { type: Number, min: 0, max: 100, default: 0 },
  knowledgeSharingIndex: { type: Number, min: 0, max: 100, default: 0 },
  problemSolvingCreativity: { type: Number, min: 0, max: 100, default: 0 },
  communicationEffectiveness: { type: Number, min: 0, max: 100, default: 0 },
  networkCentrality: { type: Number, min: 0, max: 1, default: 0 },
  crossTeamCollaboration: { type: Number, min: 0, max: 100, default: 0 },
  mentorshipImpact: { type: Number, min: 0, max: 100, default: 0 },
  innovationContribution: { type: Number, min: 0, max: 100, default: 0 }
});

const performanceMetricsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  quantitativeMetrics: quantitativeMetricsSchema,
  qualitativeMetrics: qualitativeMetricsSchema,
  aiGeneratedMetrics: aiGeneratedMetricsSchema,

  // 종합 점수들
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  technicalScore: { type: Number, min: 0, max: 100, default: 0 },
  collaborationScore: { type: Number, min: 0, max: 100, default: 0 },
  leadershipScore: { type: Number, min: 0, max: 100, default: 0 },
  innovationScore: { type: Number, min: 0, max: 100, default: 0 },

  // 기여도 기반 NFT 목록
  contributionNFTs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContributionNFT'
  }],

  // 데이터 소스 추적
  dataSources: [{
    source: {
      type: String,
      enum: ['jira', 'github', 'slack', 'salesforce', 'hrms', 'erp', 'manual']
    },
    lastSync: Date,
    recordCount: Number,
    dataQuality: { type: Number, min: 0, max: 100 }
  }],

  // AI 분석 결과
  aiInsights: {
    growthPotential: { type: Number, min: 0, max: 100 },
    retentionRisk: { type: Number, min: 0, max: 100 },
    recommendedFocus: [String],
    predictedTrajectory: String,
    strengths: [String],
    improvementAreas: [String]
  },

  calculatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// 복합 인덱스
performanceMetricsSchema.index({ user: 1, 'period.start': -1, 'period.end': -1 });
performanceMetricsSchema.index({ 'period.start': 1, 'period.end': 1 });
performanceMetricsSchema.index({ overallScore: -1 });

// 정적 메서드들
performanceMetricsSchema.statics.calculateOverallScore = function(metrics) {
  const weights = {
    quantitative: 0.3,
    qualitative: 0.4,
    aiGenerated: 0.3
  };

  // 정량적 점수 계산
  const quantitativeScore = this.calculateQuantitativeScore(metrics.quantitativeMetrics);

  // 정성적 점수 계산
  const qualitativeScore = this.calculateQualitativeScore(metrics.qualitativeMetrics);

  // AI 생성 점수 계산
  const aiScore = this.calculateAIScore(metrics.aiGeneratedMetrics);

  return (quantitativeScore * weights.quantitative +
          qualitativeScore * weights.qualitative +
          aiScore * weights.aiGenerated);
};

performanceMetricsSchema.statics.calculateQuantitativeScore = function(quantitative) {
  // 프로젝트 완료율 (40%), 목표 달성율 (30%), 코드 기여도 (20%), 기타 활동 (10%)
  const projectScore = quantitative.projectsCompleted > 0 ?
    Math.min(quantitative.projectsCompleted / 10 * 40, 40) : 0;

  const goalScore = quantitative.goalsAchieved > 0 ?
    Math.min(quantitative.goalsAchieved / 5 * 30, 30) : 0;

  const codeScore = Math.min((quantitative.codeCommits + quantitative.pullRequests * 2) / 50 * 20, 20);
  const activityScore = Math.min((quantitative.documentsCreated + quantitative.meetingsLed) / 20 * 10, 10);

  return projectScore + goalScore + codeScore + activityScore;
};

performanceMetricsSchema.statics.calculateQualitativeScore = function(qualitative) {
  // 동료 평가 (25%), 관리자 평가 (30%), 협업 지수 (20%), 혁신 점수 (15%), 리더십 (10%)
  const peerScore = qualitative.peer360Score / 10 * 25;
  const managerScore = qualitative.managerRating / 10 * 30;
  const collaborationScore = qualitative.collaborationIndex / 100 * 20;
  const innovationScore = qualitative.innovationScore / 100 * 15;
  const leadershipScore = qualitative.leadershipScore / 100 * 10;

  return peerScore + managerScore + collaborationScore + innovationScore + leadershipScore;
};

performanceMetricsSchema.statics.calculateAIScore = function(aiMetrics) {
  // 네트워크 중심성 (25%), 크로스팀 협업 (20%), 멘토링 영향 (15%),
  // 혁신 기여 (15%), 코드 품질 (15%), 지식 공유 (10%)
  const networkScore = aiMetrics.networkCentrality * 25;
  const crossTeamScore = aiMetrics.crossTeamCollaboration / 100 * 20;
  const mentoringScore = aiMetrics.mentorshipImpact / 100 * 15;
  const innovationScore = aiMetrics.innovationContribution / 100 * 15;
  const codeQualityScore = aiMetrics.codeQualityScore / 100 * 15;
  const knowledgeScore = aiMetrics.knowledgeSharingIndex / 100 * 10;

  return networkScore + crossTeamScore + mentoringScore + innovationScore + codeQualityScore + knowledgeScore;
};

module.exports = mongoose.model('PerformanceMetrics', performanceMetricsSchema);
