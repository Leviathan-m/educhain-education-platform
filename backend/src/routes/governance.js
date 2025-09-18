const express = require('express');
const router = express.Router();
const governanceController = require('../controllers/governanceController');
const { authenticate, authorize } = require('../middleware/auth');

// 감사 로그 (관리자만)
router.get('/audit-logs', authenticate, authorize(['admin']), governanceController.getAuditLogs);

// RBAC 정책 관리 (관리자만)
router.get('/rbac-policies', authenticate, authorize(['admin']), governanceController.getRBACPolicies);
router.post('/rbac-policies', authenticate, authorize(['admin']), governanceController.createRBACPolicy);
router.put('/rbac-policies/:id', authenticate, authorize(['admin']), governanceController.updateRBACPolicy);

// 데이터 보존 정책 (관리자만)
router.get('/retention-policies', authenticate, authorize(['admin']), governanceController.getRetentionPolicies);
router.post('/retention-policies', authenticate, authorize(['admin']), governanceController.createRetentionPolicy);

// GDPR/PIPA 데이터 삭제 요청
router.post('/deletion-requests', authenticate, governanceController.createDeletionRequest);
router.get('/deletion-requests', authenticate, governanceController.getDeletionRequests);
router.post('/deletion-requests/:id/process', authenticate, authorize(['admin']), governanceController.processDeletionRequest);

// 스마트 계약 거버넌스 (관리자만)
router.post('/contract-upgrades', authenticate, authorize(['admin']), governanceController.proposeContractUpgrade);
router.post('/contract-upgrades/:contractAddress/approve', authenticate, authorize(['admin']), governanceController.approveContractUpgrade);
router.post('/contract-upgrades/:contractAddress/execute', authenticate, authorize(['admin']), governanceController.executeContractUpgrade);
router.get('/contract-governance', authenticate, authorize(['admin']), governanceController.getContractGovernance);

// 시스템 초기화 (관리자만, 일회성)
router.post('/initialize', authenticate, authorize(['admin']), governanceController.initializeGovernance);

module.exports = router;
