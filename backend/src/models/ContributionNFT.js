const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  projectIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  metricsSnapshot: {
    type: mongoose.Schema.Types.Mixed // 유연한 메트릭 데이터 저장
  },
  peerEndorsements: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feedback'
  }],
  managerApproval: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  documents: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['pdf', 'doc', 'link', 'image']
    }
  }]
});

const contributionNFTSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // NFT 기본 정보
  tokenId: {
    type: String,
    required: true,
    unique: true
  },
  transactionHash: {
    type: String,
    required: true
  },

  // 기여도 정보
  achievementType: {
    type: String,
    enum: [
      'project_excellence',
      'innovation',
      'collaboration',
      'leadership',
      'mentorship',
      'customer_success',
      'technical_expertise',
      'knowledge_sharing'
    ],
    required: true
  },

  title: {
    type: String,
    required: true
  },

  description: {
    type: String,
    required: true
  },

  // 증거 자료
  evidence: evidenceSchema,

  // 점수 및 메트릭
  contributionScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },

  performanceMetrics: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PerformanceMetrics'
  },

  // AI 분석 결과
  aiValidation: {
    confidence: { type: Number, min: 0, max: 1 },
    verifiedSkills: [String],
    impactAssessment: {
      individual: { type: Number, min: 0, max: 100 },
      team: { type: Number, min: 0, max: 100 },
      organization: { type: Number, min: 0, max: 100 }
    },
    rarityScore: { type: Number, min: 0, max: 100 }, // NFT 희귀도
    futureValue: { type: Number, min: 0, max: 100 } // 미래 가치 예측
  },

  // 블록체인 정보
  blockchainData: {
    contractAddress: String,
    network: {
      type: String,
      enum: ['polygon', 'ethereum', 'arbitrum', 'optimism'],
      default: 'polygon'
    },
    ipfsHash: String,
    metadataURI: String
  },

  // 상태 및 검증
  status: {
    type: String,
    enum: ['pending', 'verified', 'minted', 'transferred', 'burned'],
    default: 'pending'
  },

  verificationStatus: {
    type: String,
    enum: ['unverified', 'peer_review', 'manager_approved', 'ai_verified', 'blockchain_confirmed'],
    default: 'unverified'
  },

  // 추천 및 승인
  endorsements: [{
    endorser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    endorsementType: {
      type: String,
      enum: ['peer', 'manager', 'expert', 'ai']
    },
    comment: String,
    endorsedAt: { type: Date, default: Date.now },
    weight: { type: Number, min: 0, max: 1, default: 1 } // 추천 가중치
  }],

  requiredEndorsements: {
    type: Number,
    default: 3,
    min: 1,
    max: 10
  },

  // 유효성 및 만료
  validUntil: Date,
  isTransferable: {
    type: Boolean,
    default: true
  },
  isBurnable: {
    type: Boolean,
    default: false
  },

  // 메타데이터
  tags: [String],
  category: {
    type: String,
    enum: ['technical', 'leadership', 'innovation', 'collaboration', 'customer', 'operational']
  },

  // 이벤트 로그
  events: [{
    type: {
      type: String,
      enum: ['created', 'endorsed', 'verified', 'minted', 'transferred', 'burned']
    },
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],

  // 통계
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  endorsementsCount: { type: Number, default: 0 }

}, {
  timestamps: true
});

// 인덱스
contributionNFTSchema.index({ user: 1, achievementType: 1 });
contributionNFTSchema.index({ tokenId: 1 }, { unique: true });
contributionNFTSchema.index({ status: 1, verificationStatus: 1 });
contributionNFTSchema.index({ 'aiValidation.rarityScore': -1 });
contributionNFTSchema.index({ createdAt: -1 });

// 가상 필드들
contributionNFTSchema.virtual('endorsementProgress').get(function() {
  return this.endorsements.length / this.requiredEndorsements;
});

contributionNFTSchema.virtual('isFullyEndorsed').get(function() {
  return this.endorsements.length >= this.requiredEndorsements;
});

contributionNFTSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.validUntil) return null;
  const now = new Date();
  const expiry = new Date(this.validUntil);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// 정적 메서드들
contributionNFTSchema.statics.getUserContributions = function(userId, status = null) {
  const query = { user: userId };
  if (status) query.status = status;

  return this.find(query)
    .populate('user', 'name email')
    .populate('endorsements.endorser', 'name email')
    .sort({ createdAt: -1 });
};

contributionNFTSchema.statics.getTopContributions = function(limit = 10, category = null) {
  const query = { status: 'minted' };
  if (category) query.category = category;

  return this.find(query)
    .populate('user', 'name email company')
    .sort({ 'aiValidation.rarityScore': -1, contributionScore: -1 })
    .limit(limit);
};

contributionNFTSchema.statics.getContributionStats = async function(userId = null) {
  const matchStage = {};
  if (userId) matchStage.user = mongoose.Types.ObjectId(userId);

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalContributions: { $sum: 1 },
        mintedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'minted'] }, 1, 0] }
        },
        totalScore: { $sum: '$contributionScore' },
        avgRarity: { $avg: '$aiValidation.rarityScore' },
        byCategory: {
          $push: {
            category: '$category',
            score: '$contributionScore',
            rarity: '$aiValidation.rarityScore'
          }
        },
        byAchievementType: {
          $push: {
            type: '$achievementType',
            score: '$contributionScore'
          }
        }
      }
    }
  ]);
};

// 인스턴스 메서드들
contributionNFTSchema.methods.addEndorsement = async function(endorserId, endorsementType, comment = '') {
  if (this.endorsements.some(e => e.endorser.toString() === endorserId.toString())) {
    throw new Error('이미 추천했습니다.');
  }

  this.endorsements.push({
    endorser: endorserId,
    endorsementType,
    comment,
    endorsedAt: new Date()
  });

  this.endorsementsCount = this.endorsements.length;

  // 이벤트 로그 추가
  this.events.push({
    type: 'endorsed',
    timestamp: new Date(),
    details: { endorser: endorserId, type: endorsementType }
  });

  await this.save();
  return this;
};

contributionNFTSchema.methods.verifyAndMint = async function() {
  if (!this.isFullyEndorsed) {
    throw new Error('충분한 추천이 없습니다.');
  }

  // AI 검증 로직 (추후 구현)
  this.verificationStatus = 'ai_verified';
  this.status = 'verified';

  // 블록체인 민팅 로직 호출 (추후 구현)
  // const mintResult = await contractService.mintContributionNFT(this);

  this.events.push({
    type: 'verified',
    timestamp: new Date(),
    details: { endorsementsCount: this.endorsements.length }
  });

  await this.save();
  return this;
};

contributionNFTSchema.methods.recordView = async function(viewerId = null) {
  this.views += 1;

  this.events.push({
    type: 'viewed',
    timestamp: new Date(),
    details: { viewer: viewerId }
  });

  await this.save();
};

contributionNFTSchema.methods.recordShare = async function(sharerId = null) {
  this.shares += 1;

  this.events.push({
    type: 'shared',
    timestamp: new Date(),
    details: { sharer: sharerId }
  });

  await this.save();
};

module.exports = mongoose.model('ContributionNFT', contributionNFTSchema);
