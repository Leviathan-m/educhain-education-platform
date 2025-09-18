const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  // 블록체인 정보
  tokenId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  contractAddress: {
    type: String,
    required: true
  },
  blockchainNetwork: {
    type: String,
    enum: ['ethereum', 'polygon', 'polygon-mumbai'],
    default: 'polygon'
  },

  // 민감한 개인정보 (오프체인 저장)
  studentName: {
    type: String,
    required: true
  },
  studentEmail: {
    type: String,
    required: true
  },

  // 과정 정보
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  courseName: {
    type: String,
    required: true
  },
  courseCode: String,

  // 평가 정보
  aiScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  aiEvaluation: {
    type: String,
    required: true
  },
  evaluationDetails: mongoose.Schema.Types.Mixed, // 상세 평가 데이터

  // 발행 정보
  issuerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issuerName: String,

  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientAddress: {
    type: String,
    required: true
  },

  // 자격증 속성
  credentialType: {
    type: Number,
    enum: [1, 2, 3, 4], // 1:Certificate, 2:Badge, 3:Diploma, 4:MicroCredential
    default: 1
  },
  isSoulbound: {
    type: Boolean,
    default: false
  },
  validUntil: Date, // 유효기간 (null = 영구)

  // IPFS 메타데이터
  ipfsHash: String, // IPFS CID
  ipfsMetadata: mongoose.Schema.Types.Mixed, // IPFS에 저장된 메타데이터

  // 해시 값들 (블록체인 검증용)
  courseHash: String,
  studentHash: String,
  evaluationHash: String,
  zkProof: String,

  // 상태 정보
  status: {
    type: String,
    enum: ['minted', 'transferred', 'revoked', 'expired'],
    default: 'minted'
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  revokedAt: Date,
  revokedReason: String,

  // 트랜잭션 정보
  transactionHash: {
    type: String,
    required: true,
    index: true
  },
  blockNumber: Number,
  gasUsed: String,

  // 추가 메타데이터
  tags: [String],
  customFields: mongoose.Schema.Types.Mixed,

  // 개인정보 보호 관련
  dataRetentionPolicy: {
    type: String,
    enum: ['standard', 'extended', 'permanent'],
    default: 'standard'
  },
  consentGiven: {
    type: Boolean,
    default: true
  },
  consentDate: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  indexes: [
    { recipientId: 1, status: 1 },
    { issuerId: 1, createdAt: -1 },
    { courseId: 1, createdAt: -1 },
    { tokenId: 1 },
    { transactionHash: 1 },
    { 'validUntil': 1 }
  ]
});

// 유효기간이 지난 자격증 자동 업데이트
certificateSchema.pre('find', function() {
  this.where({
    $or: [
      { validUntil: null },
      { validUntil: { $gt: new Date() } }
    ]
  });
});

// 가상 필드: 유효성 상태
certificateSchema.virtual('isValid').get(function() {
  if (this.isRevoked) return false;
  if (!this.validUntil) return true; // 영구 유효
  return this.validUntil > new Date();
});

// 가상 필드: 만료까지 남은 일수
certificateSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.validUntil) return null;
  const now = new Date();
  const diffTime = this.validUntil.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// 정적 메소드: 해시로 자격증 찾기
certificateSchema.statics.findByHash = function(courseHash, studentHash) {
  return this.findOne({
    courseHash: courseHash,
    studentHash: studentHash,
    isRevoked: false
  });
};

// 정적 메소드: 사용자별 자격증 목록
certificateSchema.statics.findByRecipient = function(recipientId, options = {}) {
  const query = this.find({
    recipientId: recipientId,
    isRevoked: false
  });

  if (options.status) {
    query.where('status').equals(options.status);
  }

  if (options.credentialType) {
    query.where('credentialType').equals(options.credentialType);
  }

  return query.sort({ createdAt: -1 });
};

// 인스턴스 메소드: 자격증 취소
certificateSchema.methods.revoke = function(reason) {
  this.isRevoked = true;
  this.revokedAt = new Date();
  this.revokedReason = reason;
  this.status = 'revoked';
  return this.save();
};

// 인스턴스 메소드: 자격증 이전
certificateSchema.methods.transfer = function(newRecipientId, newRecipientAddress) {
  this.recipientId = newRecipientId;
  this.recipientAddress = newRecipientAddress;
  this.status = 'transferred';
  return this.save();
};

module.exports = mongoose.model('Certificate', certificateSchema);
