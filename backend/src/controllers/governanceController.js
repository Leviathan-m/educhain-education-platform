const { GovernanceService, AuditLog, RBACPolicy, RetentionPolicy, DeletionRequest, SmartContractGovernance } = require('../services/governanceService');
const logger = require('../utils/logger');

// 감사 로그 조회
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action, resource, startDate, endDate } = req.query;

    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalLogs: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: '감사 로그 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// RBAC 정책 관리
exports.getRBACPolicies = async (req, res) => {
  try {
    const policies = await RBACPolicy.find({ isActive: true }).sort({ role: 1, resource: 1 });
    res.json({
      success: true,
      data: policies
    });

  } catch (error) {
    logger.error('Error fetching RBAC policies:', error);
    res.status(500).json({
      success: false,
      message: 'RBAC 정책 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.createRBACPolicy = async (req, res) => {
  try {
    const policyData = req.body;
    const policy = new RBACPolicy(policyData);
    await policy.save();

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'create', 'system', {
      resource: 'rbac_policy',
      policyId: policy._id
    }, req);

    res.status(201).json({
      success: true,
      message: 'RBAC 정책이 성공적으로 생성되었습니다.',
      data: policy
    });

  } catch (error) {
    logger.error('Error creating RBAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'RBAC 정책 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.updateRBACPolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const policy = await RBACPolicy.findByIdAndUpdate(id, updates, { new: true });
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'RBAC 정책을 찾을 수 없습니다.'
      });
    }

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'update', 'system', {
      resource: 'rbac_policy',
      policyId: policy._id
    }, req);

    res.json({
      success: true,
      message: 'RBAC 정책이 성공적으로 업데이트되었습니다.',
      data: policy
    });

  } catch (error) {
    logger.error('Error updating RBAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'RBAC 정책 업데이트 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 데이터 보존 정책 관리
exports.getRetentionPolicies = async (req, res) => {
  try {
    const policies = await RetentionPolicy.find().sort({ dataType: 1 });
    res.json({
      success: true,
      data: policies
    });

  } catch (error) {
    logger.error('Error fetching retention policies:', error);
    res.status(500).json({
      success: false,
      message: '보존 정책 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.createRetentionPolicy = async (req, res) => {
  try {
    const policyData = req.body;
    const policy = new RetentionPolicy(policyData);
    await policy.save();

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'create', 'system', {
      resource: 'retention_policy',
      policyId: policy._id
    }, req);

    res.status(201).json({
      success: true,
      message: '보존 정책이 성공적으로 생성되었습니다.',
      data: policy
    });

  } catch (error) {
    logger.error('Error creating retention policy:', error);
    res.status(500).json({
      success: false,
      message: '보존 정책 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// GDPR/PIPA 준수 데이터 삭제 요청
exports.createDeletionRequest = async (req, res) => {
  try {
    const { requestType, reason, requestedDataTypes } = req.body;

    // 기존 요청 확인
    const existingRequest = await DeletionRequest.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'processing'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: '이미 처리 중인 삭제 요청이 있습니다.'
      });
    }

    const request = new DeletionRequest({
      userId: req.user._id,
      requestType,
      reason,
      requestedDataTypes
    });

    await request.save();

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'create', 'user', {
      resource: 'deletion_request',
      requestId: request._id,
      requestType
    }, req);

    res.status(201).json({
      success: true,
      message: '삭제 요청이 성공적으로 제출되었습니다.',
      data: request
    });

  } catch (error) {
    logger.error('Error creating deletion request:', error);
    res.status(500).json({
      success: false,
      message: '삭제 요청 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.getDeletionRequests = async (req, res) => {
  try {
    const { status, userId } = req.query;
    const query = {};

    if (status) query.status = status;
    if (userId) query.userId = userId;

    // 일반 사용자는 자신의 요청만 볼 수 있음
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }

    const requests = await DeletionRequest.find(query)
      .populate('userId', 'name email')
      .populate('complianceOfficer', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: requests
    });

  } catch (error) {
    logger.error('Error fetching deletion requests:', error);
    res.status(500).json({
      success: false,
      message: '삭제 요청 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.processDeletionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reviewNotes } = req.body; // action: 'approve' or 'reject'

    const request = await DeletionRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: '삭제 요청을 찾을 수 없습니다.'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '이미 처리된 요청입니다.'
      });
    }

    if (action === 'approve') {
      request.status = 'processing';
      request.complianceOfficer = req.user._id;
      request.reviewNotes = reviewNotes;

      // 백그라운드에서 삭제 처리
      setTimeout(() => {
        GovernanceService.processDeletionRequest(id).catch(error => {
          logger.error('Error processing deletion request:', error);
        });
      }, 100);

    } else if (action === 'reject') {
      request.status = 'rejected';
      request.complianceOfficer = req.user._id;
      request.reviewNotes = reviewNotes;
      request.rejectionReason = reviewNotes;
    }

    await request.save();

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, action, 'user', {
      resource: 'deletion_request',
      requestId: request._id,
      action
    }, req);

    res.json({
      success: true,
      message: `삭제 요청이 ${action === 'approve' ? '승인' : '거부'}되었습니다.`,
      data: request
    });

  } catch (error) {
    logger.error('Error processing deletion request:', error);
    res.status(500).json({
      success: false,
      message: '삭제 요청 처리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 스마트 계약 거버넌스
exports.proposeContractUpgrade = async (req, res) => {
  try {
    const contractData = {
      ...req.body,
      proposer: req.user._id
    };

    const proposal = await GovernanceService.proposeContractUpgrade(contractData);

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'create', 'blockchain', {
      resource: 'contract_upgrade',
      contractAddress: contractData.contractAddress
    }, req);

    res.status(201).json({
      success: true,
      message: '스마트 계약 업그레이드 제안이 성공적으로 생성되었습니다.',
      data: proposal
    });

  } catch (error) {
    logger.error('Error proposing contract upgrade:', error);
    res.status(500).json({
      success: false,
      message: '계약 업그레이드 제안 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.approveContractUpgrade = async (req, res) => {
  try {
    const { contractAddress } = req.params;

    const proposal = await GovernanceService.approveContractUpgrade(contractAddress, req.user._id);

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'approve', 'blockchain', {
      resource: 'contract_upgrade',
      contractAddress
    }, req);

    res.json({
      success: true,
      message: '스마트 계약 업그레이드가 승인되었습니다.',
      data: proposal
    });

  } catch (error) {
    logger.error('Error approving contract upgrade:', error);
    res.status(500).json({
      success: false,
      message: '계약 업그레이드 승인 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.executeContractUpgrade = async (req, res) => {
  try {
    const { contractAddress } = req.params;

    const proposal = await GovernanceService.executeContractUpgrade(contractAddress);

    // 감사 로그 기록
    await GovernanceService.logActivity(req.user._id, 'update', 'blockchain', {
      resource: 'contract_upgrade',
      contractAddress
    }, req);

    res.json({
      success: true,
      message: '스마트 계약 업그레이드가 실행되었습니다.',
      data: proposal
    });

  } catch (error) {
    logger.error('Error executing contract upgrade:', error);
    res.status(500).json({
      success: false,
      message: '계약 업그레이드 실행 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.getContractGovernance = async (req, res) => {
  try {
    const proposals = await SmartContractGovernance.find()
      .populate('proposer', 'name email')
      .populate('approvers.user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: proposals
    });

  } catch (error) {
    logger.error('Error fetching contract governance:', error);
    res.status(500).json({
      success: false,
      message: '계약 거버넌스 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 시스템 초기화 (관리자용)
exports.initializeGovernance = async (req, res) => {
  try {
    await GovernanceService.initializeDefaultPolicies();

    // 기본 보존 정책 생성
    const defaultPolicies = [
      {
        name: '사용자 데이터 보존',
        description: 'GDPR/PIPA 준수 사용자 데이터 보존',
        dataType: 'user_data',
        retentionPeriod: 2555, // 7년 (GDPR 최대)
        complianceFrameworks: ['gdpr', 'pipa']
      },
      {
        name: '감사 로그 보존',
        description: '감사 및 컴플라이언스 목적 감사 로그 보존',
        dataType: 'audit_logs',
        retentionPeriod: 2555, // 7년
        complianceFrameworks: ['gdpr', 'iso27001']
      }
    ];

    for (const policy of defaultPolicies) {
      const existing = await RetentionPolicy.findOne({ name: policy.name });
      if (!existing) {
        await RetentionPolicy.create(policy);
      }
    }

    res.json({
      success: true,
      message: '거버넌스 시스템이 성공적으로 초기화되었습니다.'
    });

  } catch (error) {
    logger.error('Error initializing governance:', error);
    res.status(500).json({
      success: false,
      message: '거버넌스 초기화 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};
