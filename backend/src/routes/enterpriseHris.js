const express = require('express');
const router = express.Router();
const enterpriseHrisController = require('../controllers/enterpriseHrisController');
const SecurityManager = require('../services/securityManager');

// 보안 관리자 초기화
const securityManager = new SecurityManager();

// Oracle HCM 통합 (Enterprise 보안 적용)
router.get('/oracle/health',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        permission: 'hris_integration'
    }),
    enterpriseHrisController.oracleHcmHealthCheck
);

router.post('/oracle/sync/users',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        permission: 'hris_integration'
    }),
    enterpriseHrisController.syncOracleUsers
);

router.post('/oracle/sync/organizations',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        permission: 'hris_integration'
    }),
    enterpriseHrisController.syncOracleOrganizations
);

router.post('/oracle/sync/learning',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        permission: 'hris_integration'
    }),
    enterpriseHrisController.syncOracleLearningRecords
);

// Oracle HCM 웹훅 (인증 없이, IP 제한 적용)
router.post('/oracle/webhook',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true
    }),
    enterpriseHrisController.handleOracleWebhook
);

// 정부 HRIS 통합 (클라이언트 인증서 + Enterprise 보안 적용)
router.get('/government/health',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        clientCert: true,
        permission: 'gov_hris_integration'
    }),
    enterpriseHrisController.govHrisHealthCheck
);

router.post('/government/sync/users',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        clientCert: true,
        permission: 'gov_hris_integration'
    }),
    enterpriseHrisController.syncGovUsers
);

router.post('/government/sync/organizations',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        clientCert: true,
        permission: 'gov_hris_integration'
    }),
    enterpriseHrisController.syncGovOrganizations
);

router.post('/government/upload/training',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        clientCert: true,
        permission: 'gov_hris_integration'
    }),
    enterpriseHrisController.uploadGovTrainingRecords
);

// 정부 HRIS 웹훅 (클라이언트 인증서 적용)
router.post('/government/webhook',
    securityManager.createSecurityMiddleware({
        ipWhitelist: true,
        clientCert: true
    }),
    enterpriseHrisController.handleGovWebhook
);

// 통합 버스 상태 및 제어 (관리자 권한)
router.get('/status',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.getIntegrationStatus
);

router.get('/sync-results',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.getSyncResults
);

router.post('/sync-results/:jobId/retry',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.retryFailedSync
);

// 보안 모니터링 (관리자 권한)
router.get('/security/status',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.getSecurityStatus
);

router.get('/security/audit-logs',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.getAuditLogs
);

// 데이터 매핑 관리 (관리자 권한)
router.get('/mappings',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.getDataMappings
);

router.put('/mappings',
    securityManager.createSecurityMiddleware({
        permission: 'admin'
    }),
    enterpriseHrisController.updateDataMapping
);

module.exports = router;
