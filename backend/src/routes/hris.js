const express = require('express');
const router = express.Router();
const hrisController = require('../controllers/hrisController');
const { authenticate, authorize } = require('../middleware/auth');

// HRIS 설정 관리 (관리자만)
router.post('/configs', authenticate, authorize(['admin']), hrisController.createHrisConfig);
router.get('/configs', authenticate, authorize(['admin']), hrisController.getHrisConfigs);
router.put('/configs/:id', authenticate, authorize(['admin']), hrisController.updateHrisConfig);

// HRIS 동기화 (관리자만)
router.post('/sync/:provider', authenticate, authorize(['admin']), hrisController.syncHrisData);

// HRIS 동기화 로그 조회 (관리자만)
router.get('/sync-logs', authenticate, authorize(['admin']), hrisController.getHrisSyncLogs);

// HRIS 웹훅 (인증 없이, 시크릿으로 검증)
router.post('/webhook/:provider', hrisController.handleHrisWebhook);

// HRIS 사용자 매핑 조회 (인증된 사용자)
router.get('/user-mapping', authenticate, hrisController.getHrisUserMapping);

module.exports = router;
