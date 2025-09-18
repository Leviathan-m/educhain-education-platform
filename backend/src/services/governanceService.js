const mongoose = require('mongoose');
const logger = require('../utils/logger');

// 감사 로그 스키마
const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login', 'logout', 'create', 'read', 'update', 'delete',
      'export', 'import', 'approve', 'reject', 'nft_mint', 'certificate_issue'
    ]
  },
  resource: {
    type: String,
    required: true,
    enum: [
      'user', 'course', 'enrollment', 'certificate', 'company',
      'department', 'report', 'hris', 'blockchain', 'system'
    ]
  },
  resourceId: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  status: {
    type: String,
    enum: ['success', 'failure'],
    default: 'success'
  },
  errorMessage: {
    type: String
  },
  sessionId: {
    type: String
  }
}, {
  timestamps: true
});

// RBAC 정책 스키마
const rbacPolicySchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['student', 'instructor', 'admin']
  },
  resource: {
    type: String,
    required: true
  },
  actions: [{
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'approve', 'export']
  }],
  conditions: {
    type: mongoose.Schema.Types.Mixed // ownership, department 등
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// 데이터 보존 정책 스키마
const retentionPolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String
  },
  dataType: {
    type: String,
    required: true,
    enum: ['user_data', 'course_data', 'certificate_data', 'audit_logs', 'reports']
  },
  retentionPeriod: {
    type: Number, // days
    required: true,
    min: 30
  },
  autoDelete: {
    type: Boolean,
    default: false
  },
  complianceFrameworks: [{
    type: String,
    enum: ['gdpr', 'pipa', 'ccpa', 'iso27001']
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// GDPR/PIPA 준수 삭제 요청 스키마
const deletionRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestType: {
    type: String,
    required: true,
    enum: ['gdpr_right_to_erasure', 'pipa_deletion', 'account_deletion']
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending'
  },
  requestedDataTypes: [{
    type: String,
    enum: ['personal_data', 'learning_records', 'certificates', 'audit_logs', 'all']
  }],
  complianceOfficer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: {
    type: String
  },
  completedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  }
}, {
  timestamps: true
});

// 스마트 계약 거버넌스 스키마
const smartContractGovernanceSchema = new mongoose.Schema({
  contractAddress: {
    type: String,
    required: true,
    unique: true
  },
  contractName: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  network: {
    type: String,
    enum: ['ethereum', 'polygon', 'bsc'],
    default: 'polygon'
  },
  status: {
    type: String,
    enum: ['proposed', 'approved', 'deployed', 'deprecated'],
    default: 'proposed'
  },
  proposer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    signature: String
  }],
  timelockPeriod: {
    type: Number, // seconds
    default: 86400 // 24 hours
  },
  executionTime: {
    type: Date
  },
  executedAt: {
    type: Date
  },
  upgradePath: {
    type: String // 다음 버전 주소
  },
  auditReport: {
    auditor: String,
    reportUrl: String,
    findings: [{
      severity: {
        type: String,
        enum: ['critical', 'high', 'medium', 'low', 'info']
      },
      description: String,
      recommendation: String
    }],
    auditDate: Date
  }
}, {
  timestamps: true
});

// 모델들 등록
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const RBACPolicy = mongoose.model('RBACPolicy', rbacPolicySchema);
const RetentionPolicy = mongoose.model('RetentionPolicy', retentionPolicySchema);
const DeletionRequest = mongoose.model('DeletionRequest', deletionRequestSchema);
const SmartContractGovernance = mongoose.model('SmartContractGovernance', smartContractGovernanceSchema);

// 기본 RBAC 정책들
const defaultPolicies = [
  // 학생 권한
  { role: 'student', resource: 'course', actions: ['read'] },
  { role: 'student', resource: 'enrollment', actions: ['create', 'read', 'update'] },
  { role: 'student', resource: 'certificate', actions: ['read'] },
  { role: 'student', resource: 'user', actions: ['read'], conditions: { ownership: true } },

  // 강사 권한
  { role: 'instructor', resource: 'course', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'instructor', resource: 'enrollment', actions: ['read', 'update'] },
  { role: 'instructor', resource: 'certificate', actions: ['create', 'read'] },
  { role: 'instructor', resource: 'user', actions: ['read'] },
  { role: 'instructor', resource: 'company', actions: ['read'], conditions: { department: true } },

  // 관리자 권한
  { role: 'admin', resource: 'user', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'course', actions: ['create', 'read', 'update', 'delete', 'approve'] },
  { role: 'admin', resource: 'enrollment', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'certificate', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'company', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'system', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'admin', resource: 'report', actions: ['create', 'read', 'update', 'delete', 'export'] }
];

class GovernanceService {
  // 감사 로그 기록
  async logActivity(userId, action, resource, details = {}, req = null) {
    try {
      const logData = {
        userId,
        action,
        resource,
        details,
        status: 'success'
      };

      if (req) {
        logData.ipAddress = req.ip || req.connection.remoteAddress;
        logData.userAgent = req.get('User-Agent');
        logData.sessionId = req.sessionID;
      }

      const log = new AuditLog(logData);
      await log.save();

      logger.info(`Audit log: ${action} on ${resource} by user ${userId}`);

    } catch (error) {
      logger.error('Error logging activity:', error);
    }
  }

  // 권한 확인
  async checkPermission(userId, action, resource, context = {}) {
    try {
      // 사용자 정보 조회
      const User = mongoose.model('User');
      const user = await User.findById(userId);
      if (!user) return false;

      // 관리자는 모든 권한
      if (user.role === 'admin') return true;

      // 해당 역할과 리소스에 대한 정책 조회
      const policies = await RBACPolicy.find({
        role: user.role,
        resource,
        isActive: true
      });

      for (const policy of policies) {
        if (policy.actions.includes(action)) {
          // 조건 확인 (소유권, 부서 등)
          if (this.checkConditions(policy.conditions, user, context)) {
            return true;
          }
        }
      }

      return false;

    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  checkConditions(conditions, user, context) {
    if (!conditions) return true;

    // 소유권 조건
    if (conditions.ownership && context.resourceOwnerId) {
      return user._id.toString() === context.resourceOwnerId.toString();
    }

    // 부서 조건
    if (conditions.department && context.departmentId) {
      return user.department === context.departmentId;
    }

    return true;
  }

  // 기본 정책 초기화
  async initializeDefaultPolicies() {
    try {
      for (const policy of defaultPolicies) {
        const existing = await RBACPolicy.findOne({
          role: policy.role,
          resource: policy.resource
        });

        if (!existing) {
          await RBACPolicy.create(policy);
        }
      }

      logger.info('Default RBAC policies initialized');
    } catch (error) {
      logger.error('Error initializing default policies:', error);
    }
  }

  // 데이터 보존 정책 적용
  async applyRetentionPolicies() {
    try {
      const policies = await RetentionPolicy.find({ isActive: true, autoDelete: true });

      for (const policy of policies) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriod);

        switch (policy.dataType) {
          case 'audit_logs':
            const deletedLogs = await AuditLog.deleteMany({
              createdAt: { $lt: cutoffDate }
            });
            logger.info(`Deleted ${deletedLogs.deletedCount} audit logs older than ${policy.retentionPeriod} days`);
            break;

          case 'reports':
            // 리포트 파일 삭제 로직
            break;
        }
      }
    } catch (error) {
      logger.error('Error applying retention policies:', error);
    }
  }

  // GDPR/PIPA 준수 데이터 삭제
  async processDeletionRequest(requestId) {
    try {
      const request = await DeletionRequest.findById(requestId);
      if (!request || request.status !== 'approved') {
        throw new Error('Invalid deletion request');
      }

      const userId = request.userId;

      // 삭제할 데이터 타입에 따라 처리
      for (const dataType of request.requestedDataTypes) {
        switch (dataType) {
          case 'personal_data':
            await this.deletePersonalData(userId);
            break;
          case 'learning_records':
            await this.deleteLearningRecords(userId);
            break;
          case 'certificates':
            await this.deleteCertificates(userId);
            break;
          case 'audit_logs':
            await this.anonymizeAuditLogs(userId);
            break;
          case 'all':
            await this.deleteAllUserData(userId);
            break;
        }
      }

      // 요청 상태 업데이트
      request.status = 'completed';
      request.completedAt = new Date();
      await request.save();

      // 감사 로그 기록
      await this.logActivity(request.complianceOfficer, 'delete', 'user_data', {
        requestId,
        userId,
        dataTypes: request.requestedDataTypes
      });

      logger.info(`Deletion request ${requestId} processed for user ${userId}`);

    } catch (error) {
      logger.error('Error processing deletion request:', error);
      throw error;
    }
  }

  async deletePersonalData(userId) {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(userId, {
      name: '[삭제됨]',
      email: `[deleted_${userId}@deleted.com]`,
      department: null,
      position: null
    });
  }

  async deleteLearningRecords(userId) {
    // 학습 기록 익명화 또는 삭제
    const Enrollment = mongoose.model('Enrollment');
    await Enrollment.updateMany(
      { user: userId },
      {
        $unset: {
          'progress': 1,
          'evaluations': 1,
          'finalEvaluation': 1
        },
        $set: {
          'anonymized': true,
          'anonymizedAt': new Date()
        }
      }
    );
  }

  async deleteCertificates(userId) {
    const Enrollment = mongoose.model('Enrollment');
    await Enrollment.updateMany(
      { user: userId },
      {
        $unset: {
          'certificate': 1
        }
      }
    );
  }

  async anonymizeAuditLogs(userId) {
    await AuditLog.updateMany(
      { userId },
      {
        $set: {
          userId: null,
          anonymized: true,
          anonymizedAt: new Date()
        }
      }
    );
  }

  async deleteAllUserData(userId) {
    // 모든 사용자 데이터 삭제 (계정 삭제)
    const User = mongoose.model('User');
    await User.findByIdAndDelete(userId);

    // 관련 데이터 cascade delete
    const Enrollment = mongoose.model('Enrollment');
    await Enrollment.deleteMany({ user: userId });

    await this.anonymizeAuditLogs(userId);
  }

  // 스마트 계약 거버넌스
  async proposeContractUpgrade(contractData) {
    try {
      const governance = new SmartContractGovernance(contractData);
      await governance.save();

      // 다중서명 요청 알림 로직 추가 가능

      logger.info(`Contract upgrade proposed: ${contractData.contractName} v${contractData.version}`);
      return governance;

    } catch (error) {
      logger.error('Error proposing contract upgrade:', error);
      throw error;
    }
  }

  async approveContractUpgrade(contractAddress, approverId) {
    try {
      const governance = await SmartContractGovernance.findOne({
        contractAddress,
        status: 'proposed'
      });

      if (!governance) {
        throw new Error('Contract upgrade proposal not found');
      }

      // 이미 승인했는지 확인
      const existingApproval = governance.approvers.find(
        a => a.user.toString() === approverId.toString()
      );

      if (existingApproval) {
        throw new Error('Already approved by this user');
      }

      governance.approvers.push({
        user: approverId,
        approvedAt: new Date()
      });

      // 필요한 승인 수 확인 (간단히 2명으로 설정)
      if (governance.approvers.length >= 2) {
        governance.status = 'approved';
        governance.executionTime = new Date(Date.now() + governance.timelockPeriod * 1000);
      }

      await governance.save();

      logger.info(`Contract upgrade approved: ${contractAddress} by ${approverId}`);
      return governance;

    } catch (error) {
      logger.error('Error approving contract upgrade:', error);
      throw error;
    }
  }

  async executeContractUpgrade(contractAddress) {
    try {
      const governance = await SmartContractGovernance.findOne({
        contractAddress,
        status: 'approved'
      });

      if (!governance || !governance.executionTime || governance.executionTime > new Date()) {
        throw new Error('Contract not ready for execution');
      }

      // 실제 스마트 계약 업그레이드 로직
      // 블록체인 네트워크에 업그레이드 트랜잭션 전송

      governance.status = 'deployed';
      governance.executedAt = new Date();
      await governance.save();

      logger.info(`Contract upgrade executed: ${contractAddress}`);
      return governance;

    } catch (error) {
      logger.error('Error executing contract upgrade:', error);
      throw error;
    }
  }
}

module.exports = {
  GovernanceService: new GovernanceService(),
  AuditLog,
  RBACPolicy,
  RetentionPolicy,
  DeletionRequest,
  SmartContractGovernance
};
