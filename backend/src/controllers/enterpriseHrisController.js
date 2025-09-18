// const IntegrationBus = require('../services/integrationBus');
// const SecurityManager = require('../services/securityManager');
const logger = require('../utils/logger');

// Enterprise HRIS 통합 관리자 초기화
let integrationBus;
let securityManager;

function initializeServices() {
    try {
        if (!integrationBus) {
            const IntegrationBus = require('../services/integrationBus');
            integrationBus = new IntegrationBus();
        }
        if (!securityManager) {
            const SecurityManager = require('../services/securityManager');
            securityManager = new SecurityManager();
        }
    } catch (error) {
        console.error('Service initialization failed:', error.message);
        // 폴백: 간단한 구현
        integrationBus = {
            redisHgetall: async () => ({}),
            redisKeys: async () => [],
            redisLpush: async () => 1,
            redisRpop: async () => null,
            redisHset: async () => 1,
            redisDel: async () => 1,
            getStatus: async () => ({ queueLength: 0, processingJobs: 0, failedJobsCount: 0, clientStatuses: {} }),
            emit: () => {}
        };
        securityManager = {
            createSecurityMiddleware: () => [() => {}],
            getSecurityStatus: async () => ({ status: 'mock' }),
            logAuditEvent: () => {},
            logSecurityEvent: () => {}
        };
    }
}

// Oracle HCM 통합 엔드포인트
exports.oracleHcmHealthCheck = async (req, res) => {
    try {
        initializeServices();
        const client = integrationBus.clients.get('oracle');

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Oracle HCM client not configured'
            });
        }

        const health = await client.healthCheck();

        res.json({
            success: true,
            data: health
        });

    } catch (error) {
        logger.error('Oracle HCM health check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
};

exports.syncOracleUsers = async (req, res) => {
    try {
        initializeServices();

        const options = {
            limit: req.query.limit || 100,
            offset: req.query.offset || 0,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };

        integrationBus.emit('sync-users', 'oracle', options);

        res.json({
            success: true,
            message: 'Oracle HCM user sync initiated',
            options
        });

    } catch (error) {
        logger.error('Oracle user sync initiation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Sync initiation failed',
            error: error.message
        });
    }
};

exports.syncOracleOrganizations = async (req, res) => {
    try {
        initializeServices();

        integrationBus.emit('sync-organizations', 'oracle');

        res.json({
            success: true,
            message: 'Oracle HCM organization sync initiated'
        });

    } catch (error) {
        logger.error('Oracle organization sync initiation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Sync initiation failed',
            error: error.message
        });
    }
};

exports.syncOracleLearningRecords = async (req, res) => {
    try {
        initializeServices();

        const options = {
            startDate: req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: req.query.endDate || new Date().toISOString().split('T')[0],
            limit: req.query.limit || 500
        };

        integrationBus.emit('sync-learning', 'oracle', options);

        res.json({
            success: true,
            message: 'Oracle HCM learning records sync initiated',
            options
        });

    } catch (error) {
        logger.error('Oracle learning sync initiation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Sync initiation failed',
            error: error.message
        });
    }
};

// 정부 HRIS 통합 엔드포인트
exports.govHrisHealthCheck = async (req, res) => {
    try {
        initializeServices();
        const client = integrationBus.clients.get('government');

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Government HRIS client not configured'
            });
        }

        const health = await client.healthCheck();

        res.json({
            success: true,
            data: health
        });

    } catch (error) {
        logger.error('Government HRIS health check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
};

exports.syncGovUsers = async (req, res) => {
    try {
        initializeServices();

        const options = {
            status: req.query.status || 'ACTIVE',
            department: req.query.department || 'ALL',
            hireDateFrom: req.query.hireDateFrom,
            hireDateTo: req.query.hireDateTo
        };

        integrationBus.emit('sync-users', 'government', options);

        res.json({
            success: true,
            message: 'Government HRIS user sync initiated',
            options
        });

    } catch (error) {
        logger.error('Government user sync initiation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Sync initiation failed',
            error: error.message
        });
    }
};

exports.syncGovOrganizations = async (req, res) => {
    try {
        initializeServices();

        integrationBus.emit('sync-organizations', 'government');

        res.json({
            success: true,
            message: 'Government HRIS organization sync initiated'
        });

    } catch (error) {
        logger.error('Government organization sync initiation failed:', error);
        res.status(500).json({
            success: false,
            message: 'Sync initiation failed',
            error: error.message
        });
    }
};

exports.uploadGovTrainingRecords = async (req, res) => {
    try {
        initializeServices();
        const client = integrationBus.clients.get('government');

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Government HRIS client not configured'
            });
        }

        const { records } = req.body;

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                message: 'Records array is required'
            });
        }

        const result = await client.uploadTrainingRecords(records, {
            fileName: `training_records_${Date.now()}.xml`
        });

        res.json({
            success: true,
            message: 'Training records uploaded to Government HRIS',
            data: result
        });

    } catch (error) {
        logger.error('Government training records upload failed:', error);
        res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message
        });
    }
};

// 통합 버스 상태 및 제어
exports.getIntegrationStatus = async (req, res) => {
    try {
        initializeServices();
        const status = await integrationBus.getStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        logger.error('Integration status check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Status check failed',
            error: error.message
        });
    }
};

exports.getSyncResults = async (req, res) => {
    try {
        initializeServices();

        const { page = 1, limit = 20, status, client } = req.query;
        const redis = integrationBus.redis;

        // 모든 sync 결과 키 가져오기
        const keys = await integrationBus.redisKeys('sync_results:*');
        const results = [];

        for (const key of keys) {
            const result = await integrationBus.redisHgetall(key);
            if (result) {
                const jobId = key.replace('sync_results:', '');
                const jobData = {
                    jobId,
                    ...result,
                    completedAt: result.completedAt || result.failedAt,
                    duration: result.duration ? parseInt(result.duration) : null
                };

                // 필터 적용
                if (status && result.status !== status) continue;
                if (client && !jobId.includes(client)) continue;

                results.push(jobData);
            }
        }

        // 정렬 및 페이징
        results.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = results.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedResults,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(results.length / limit),
                totalResults: results.length,
                hasNext: endIndex < results.length,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        logger.error('Sync results fetch failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sync results',
            error: error.message
        });
    }
};

exports.retryFailedSync = async (req, res) => {
    try {
        initializeServices();

        const { jobId } = req.params;

        // 실패한 작업 정보 가져오기
        const failedJob = await integrationBus.redisHgetall(`sync_results:${jobId}`);

        if (!failedJob || failedJob.status !== 'failed') {
            return res.status(404).json({
                success: false,
                message: 'Failed job not found'
            });
        }

        // 재시도 작업 생성
        const retryJob = {
            id: `${jobId}_retry_${Date.now()}`,
            type: failedJob.type,
            client: failedJob.client,
            options: failedJob.options ? JSON.parse(failedJob.options) : {},
            timestamp: new Date(),
            status: 'queued',
            retryCount: 0,
            maxRetries: 3
        };

        await redis.lpush('integration_sync_queue', JSON.stringify(retryJob));

        res.json({
            success: true,
            message: 'Retry job queued',
            data: { retryJobId: retryJob.id }
        });

    } catch (error) {
        logger.error('Retry failed sync failed:', error);
        res.status(500).json({
            success: false,
            message: 'Retry initiation failed',
            error: error.message
        });
    }
};

// 보안 상태 및 감사 로그
exports.getSecurityStatus = async (req, res) => {
    try {
        initializeServices();
        const status = await securityManager.getSecurityStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        logger.error('Security status check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Security status check failed',
            error: error.message
        });
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        // 감사 로그는 별도 파일로 저장되므로 간단한 구현
        const fs = require('fs').promises;
        const path = require('path');

        const auditLogPath = path.join(process.cwd(), 'logs', 'security.log');

        try {
            const logData = await fs.readFile(auditLogPath, 'utf8');
            const logs = logData
                .split('\n')
                .filter(line => line.trim())
                .slice(-100) // 최근 100개
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return { raw: line };
                    }
                })
                .reverse();

            res.json({
                success: true,
                data: logs
            });

        } catch (fileError) {
            if (fileError.code === 'ENOENT') {
                res.json({
                    success: true,
                    data: []
                });
            } else {
                throw fileError;
            }
        }

    } catch (error) {
        logger.error('Audit logs fetch failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch audit logs',
            error: error.message
        });
    }
};

// 실시간 이벤트 웹훅
exports.handleOracleWebhook = async (req, res) => {
    try {
        const event = req.body;
        logger.info('Oracle HCM webhook received:', event);

        // 이벤트 타입에 따른 처리
        switch (event.eventType) {
            case 'WORKER_UPDATED':
                integrationBus.emit('user-updated', event.data, 'oracle_hcm');
                break;
            case 'ORGANIZATION_UPDATED':
                integrationBus.emit('organization-updated', event.data, 'oracle_hcm');
                break;
            case 'LEARNING_COMPLETED':
                integrationBus.emit('learning-completed', event.data, 'oracle_hcm');
                break;
        }

        res.status(200).json({ status: 'processed' });

    } catch (error) {
        logger.error('Oracle webhook processing failed:', error);
        res.status(500).json({ error: 'Processing failed' });
    }
};

exports.handleGovWebhook = async (req, res) => {
    try {
        const event = req.body;
        logger.info('Government HRIS webhook received:', event);

        // 이벤트 타입에 따른 처리
        switch (event.eventType) {
            case 'PERSONNEL_UPDATED':
                integrationBus.emit('user-updated', event.data, 'gov_hris');
                break;
            case 'ORGANIZATION_CHANGED':
                integrationBus.emit('organization-updated', event.data, 'gov_hris');
                break;
        }

        res.status(200).json({ status: 'processed' });

    } catch (error) {
        logger.error('Government webhook processing failed:', error);
        res.status(500).json({ error: 'Processing failed' });
    }
};

// 데이터 매핑 관리
exports.getDataMappings = async (req, res) => {
    try {
        initializeServices();
        const redis = integrationBus.redis;

        const mappings = {};
        const keys = await integrationBus.redisKeys('mapping:*');

        for (const key of keys) {
            mappings[key] = await integrationBus.redisHgetall(key);
        }

        res.json({
            success: true,
            data: mappings
        });

    } catch (error) {
        logger.error('Data mappings fetch failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch data mappings',
            error: error.message
        });
    }
};

exports.updateDataMapping = async (req, res) => {
    try {
        initializeServices();

        const { sourceSystem, targetSystem, mappings } = req.body;
        const redis = integrationBus.redis;
        const mappingKey = `mapping:${sourceSystem}:${targetSystem}`;

        // 기존 매핑 삭제
        await integrationBus.redisDel(mappingKey);

        // 새 매핑 설정
        if (mappings && typeof mappings === 'object') {
            await integrationBus.redisHset(mappingKey, mappings);
        }

        res.json({
            success: true,
            message: 'Data mapping updated successfully'
        });

    } catch (error) {
        logger.error('Data mapping update failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update data mapping',
            error: error.message
        });
    }
};
