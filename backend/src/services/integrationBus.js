const { EventEmitter } = require('events');
const cron = require('node-cron');
const logger = require('../utils/logger');
const OracleHCMClient = require('./oracleHcmClient');
const GovHRISClient = require('./govHrisClient');

// Redis import - 사용 가능할 때만 로드
let Redis;
try {
    Redis = require('ioredis');
} catch (error) {
    logger.warn('Redis not available, using in-memory storage');
    Redis = null;
}

class IntegrationBus extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000,
            batchSize: config.batchSize || 100,
            ...config
        };

        // Redis 또는 in-memory 스토리지 초기화
        if (Redis) {
            this.redis = new Redis(this.config.redisUrl);
        } else {
            this.memoryStorage = new Map();
        }
        this.clients = new Map();
        this.syncQueue = [];
        this.isProcessing = false;
        this.retryQueue = [];
        this.eventHandlers = new Map();

        this.initializeClients();
        this.setupEventHandlers();
        this.startQueueProcessor();
        this.schedulePeriodicSync();
    }

    // Redis 메소드 헬퍼들 (in-memory 대체)
    async redisGet(key) {
        if (this.redis) {
            return await this.redis.get(key);
        }
        return this.memoryStorage.get(key);
    }

    async redisSet(key, value) {
        if (this.redis) {
            return await this.redis.set(key, value);
        }
        this.memoryStorage.set(key, value);
        return 'OK';
    }

    async redisSetex(key, ttl, value) {
        if (this.redis) {
            return await this.redis.setex(key, ttl, value);
        }
        this.memoryStorage.set(key, value);
        // TTL은 메모리에서는 무시
        return 'OK';
    }

    async redisDel(key) {
        if (this.redis) {
            return await this.redis.del(key);
        }
        return this.memoryStorage.delete(key) ? 1 : 0;
    }

    async redisLpush(key, value) {
        if (this.redis) {
            return await this.redis.lpush(key, value);
        }
        // 간단한 큐 구현
        if (!this.memoryStorage.has(key)) {
            this.memoryStorage.set(key, []);
        }
        this.memoryStorage.get(key).unshift(value);
        return this.memoryStorage.get(key).length;
    }

    async redisRpop(key) {
        if (this.redis) {
            return await this.redis.rpop(key);
        }
        const list = this.memoryStorage.get(key);
        return list && list.length > 0 ? list.pop() : null;
    }

    async redisLlen(key) {
        if (this.redis) {
            return await this.redis.llen(key);
        }
        const list = this.memoryStorage.get(key);
        return list ? list.length : 0;
    }

    async redisHset(key, data) {
        if (this.redis) {
            return await this.redis.hset(key, data);
        }
        if (!this.memoryStorage.has(key)) {
            this.memoryStorage.set(key, {});
        }
        Object.assign(this.memoryStorage.get(key), data);
        return Object.keys(data).length;
    }

    async redisHgetall(key) {
        if (this.redis) {
            return await this.redis.hgetall(key);
        }
        return this.memoryStorage.get(key) || {};
    }

    async redisKeys(pattern) {
        if (this.redis) {
            return await this.redis.keys(pattern);
        }
        // 간단한 패턴 매칭
        const keys = Array.from(this.memoryStorage.keys());
        const regex = new RegExp(pattern.replace('*', '.*'));
        return keys.filter(key => regex.test(key));
    }

    async redisQuit() {
        if (this.redis) {
            return await this.redis.quit();
        }
        // 메모리 스토리지는 아무것도 하지 않음
    }

    async initializeClients() {
        try {
            // Oracle HCM 클라이언트 초기화
            if (process.env.ORACLE_HCM_BASE_URL) {
                const oracleConfig = {
                    baseUrl: process.env.ORACLE_HCM_BASE_URL,
                    clientId: process.env.ORACLE_CLIENT_ID,
                    clientSecret: process.env.ORACLE_CLIENT_SECRET,
                    username: process.env.ORACLE_USERNAME,
                    password: process.env.ORACLE_PASSWORD
                };
                this.clients.set('oracle', new OracleHCMClient(oracleConfig));
                logger.info('Oracle HCM client initialized');
            }

            // 정부 HRIS 클라이언트 초기화
            if (process.env.GOV_HRIS_SOAP_ENDPOINT) {
                const govConfig = {
                    soapEndpoint: process.env.GOV_HRIS_SOAP_ENDPOINT,
                    sftpHost: process.env.GOV_HRIS_SFTP_HOST,
                    username: process.env.GOV_HRIS_USERNAME,
                    privateKeyPath: process.env.GOV_HRIS_PRIVATE_KEY_PATH,
                    certPath: process.env.GOV_HRIS_CERT_PATH,
                    caPath: process.env.GOV_HRIS_CA_PATH,
                    orgCode: process.env.GOV_ORG_CODE
                };
                this.clients.set('government', new GovHRISClient(govConfig));
                logger.info('Government HRIS client initialized');
            }

        } catch (error) {
            logger.error('Client initialization failed:', error);
            throw error;
        }
    }

    setupEventHandlers() {
        // 데이터 동기화 이벤트 핸들러
        this.on('sync-users', async (clientType, options = {}) => {
            await this.queueSync('users', clientType, options);
        });

        this.on('sync-organizations', async (clientType, options = {}) => {
            await this.queueSync('organizations', clientType, options);
        });

        this.on('sync-learning', async (clientType, options = {}) => {
            await this.queueSync('learning', clientType, options);
        });

        this.on('sync-compensation', async (clientType, userId) => {
            await this.queueSync('compensation', clientType, { userId });
        });

        // 데이터 변경 이벤트 핸들러
        this.on('user-updated', async (userData, sourceSystem) => {
            await this.handleUserUpdate(userData, sourceSystem);
        });

        this.on('organization-updated', async (orgData, sourceSystem) => {
            await this.handleOrganizationUpdate(orgData, sourceSystem);
        });

        this.on('learning-completed', async (learningData, sourceSystem) => {
            await this.handleLearningCompletion(learningData, sourceSystem);
        });
    }

    async queueSync(syncType, clientType, options = {}) {
        const syncJob = {
            id: `${syncType}_${clientType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: syncType,
            client: clientType,
            options: options,
            timestamp: new Date(),
            status: 'queued',
            retryCount: 0,
            maxRetries: this.config.maxRetries
        };

        // Redis 큐에 추가
        await this.redisLpush('integration_sync_queue', JSON.stringify(syncJob));

        // 메모리 큐에도 추가
        this.syncQueue.push(syncJob);

        logger.info(`Queued sync job: ${syncJob.id} (${syncType} from ${clientType})`);

        // 이벤트 발행
        this.emit('sync-job-queued', syncJob);
    }

    async startQueueProcessor() {
        setInterval(async () => {
            if (!this.isProcessing && this.syncQueue.length > 0) {
                await this.processNextSyncJob();
            }
        }, 2000); // 2초마다 처리

        // 재시도 큐 처리
        setInterval(async () => {
            if (this.retryQueue.length > 0) {
                const retryJob = this.retryQueue.shift();
                if (retryJob) {
                    await this.redis.lpush('integration_sync_queue', JSON.stringify(retryJob));
                    this.syncQueue.push(retryJob);
                }
            }
        }, 30000); // 30초마다 재시도
    }

    async processNextSyncJob() {
        this.isProcessing = true;

        try {
        // Redis에서 작업 가져오기
        const jobData = await this.redisRpop('integration_sync_queue');
            if (!jobData) {
                this.isProcessing = false;
                return;
            }

            const job = JSON.parse(jobData);
            logger.info(`Processing sync job: ${job.id}`);

            const client = this.clients.get(job.client);
            if (!client) {
                throw new Error(`Client ${job.client} not found`);
            }

            let result;

            // 작업 유형에 따른 처리
            switch (job.type) {
                case 'users':
                    result = await this.syncUsers(client, job.options);
                    break;
                case 'organizations':
                    result = await this.syncOrganizations(client, job.options);
                    break;
                case 'learning':
                    result = await this.syncLearningRecords(client, job.options);
                    break;
                case 'compensation':
                    result = await this.syncCompensation(client, job.options);
                    break;
                default:
                    throw new Error(`Unknown sync type: ${job.type}`);
            }

            // 성공 로깅
            await this.redisHset(`sync_results:${job.id}`, {
                status: 'completed',
                result: JSON.stringify(result),
                completedAt: new Date().toISOString(),
                duration: Date.now() - new Date(job.timestamp).getTime()
            });

            logger.info(`Completed sync job: ${job.id}`, result);

            // 이벤트 발행
            this.emit('sync-job-completed', job, result);

        } catch (error) {
            logger.error('Sync job failed:', error);

            // 실패한 작업 재시도 큐에 추가
            const failedJob = JSON.parse(await this.redis.lindex('integration_sync_queue', -1));
            if (failedJob && failedJob.retryCount < failedJob.maxRetries) {
                failedJob.retryCount++;
                failedJob.lastError = error.message;
                failedJob.nextRetry = new Date(Date.now() + this.config.retryDelay).toISOString();

                this.retryQueue.push(failedJob);

                // 실패 로깅
                await this.redisHset(`sync_results:${failedJob.id}`, {
                    status: 'retry',
                    error: error.message,
                    retryCount: failedJob.retryCount,
                    nextRetry: failedJob.nextRetry
                });
            } else {
                // 최대 재시도 초과
                await this.redis.hset(`sync_results:${failedJob.id}`, {
                    status: 'failed',
                    error: error.message,
                    finalFailure: true,
                    failedAt: new Date().toISOString()
                });

                this.emit('sync-job-failed', failedJob, error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    async syncUsers(client, options) {
        const result = await client.syncUsers(options);
        const { users } = result;

        // 플랫폼에 사용자 동기화
        for (const user of users) {
            await this.syncUserToPlatform(user, client.constructor.name);
        }

        return result;
    }

    async syncOrganizations(client, options) {
        let result;

        if (client.constructor.name === 'OracleHCMClient') {
            result = await client.syncOrganizations();
        } else if (client.constructor.name === 'GovHRISClient') {
            result = await client.fetchOrganizationsViaSoap();
        }

        // 플랫폼에 조직 동기화
        for (const org of result) {
            await this.syncOrganizationToPlatform(org, client.constructor.name);
        }

        return result;
    }

    async syncLearningRecords(client, options) {
        const result = await client.syncLearningRecords(options);

        // 플랫폼에 학습 기록 동기화
        for (const record of result.records) {
            await this.syncLearningRecordToPlatform(record, client.constructor.name);
        }

        return result;
    }

    async syncCompensation(client, options) {
        if (client.constructor.name === 'OracleHCMClient') {
            const result = await client.syncCompensationData(options.userId);
            await this.syncCompensationToPlatform(result, options.userId, 'oracle_hcm');
            return result;
        }

        return [];
    }

    // 플랫폼 동기화 헬퍼 함수들
    async syncUserToPlatform(userData, sourceSystem) {
        const User = require('../models/User');
        const axios = require('axios');

        try {
            // 기존 사용자 찾기 또는 새로 생성
            let user = await User.findOne({ email: userData.email });

            if (user) {
                // 기존 사용자 업데이트
                await User.findByIdAndUpdate(user._id, {
                    ...userData,
                    hrisProvider: sourceSystem.toLowerCase(),
                    hrisLastSync: new Date()
                });
            } else {
                // 새 사용자 생성
                const newUser = new User({
                    ...userData,
                    password: 'temp_password_' + Date.now(),
                    role: 'student',
                    hrisProvider: sourceSystem.toLowerCase(),
                    hrisLastSync: new Date()
                });
                await newUser.save();
            }

            // 감사 로그 기록
            await this.logAuditEvent('user_sync', 'platform', {
                userId: user?._id || newUser._id,
                sourceSystem,
                action: user ? 'updated' : 'created'
            });

        } catch (error) {
            logger.error('Platform user sync failed:', error);
            throw error;
        }
    }

    async syncOrganizationToPlatform(orgData, sourceSystem) {
        // 조직 모델이 없으면 간단한 로깅만 수행
        logger.info('Organization sync:', orgData);

        // 실제 구현에서는 Organization 모델에 저장
        await this.logAuditEvent('organization_sync', 'platform', {
            orgId: orgData.externalId,
            sourceSystem,
            action: 'synced'
        });
    }

    async syncLearningRecordToPlatform(recordData, sourceSystem) {
        const Enrollment = require('../models/Enrollment');

        try {
            // 학습 기록을 enrollment로 변환하여 저장
            const enrollment = {
                user: recordData.userId,
                course: recordData.courseCode,
                status: 'completed',
                finalEvaluation: {
                    score: recordData.score,
                    completedAt: new Date(recordData.completionDate)
                },
                hrisSource: sourceSystem.toLowerCase(),
                hrisLastSync: new Date()
            };

            // 실제 저장 로직 (중복 방지 등)
            logger.info('Learning record sync:', enrollment);

        } catch (error) {
            logger.error('Platform learning record sync failed:', error);
            throw error;
        }
    }

    async syncCompensationToPlatform(compensationData, userId, sourceSystem) {
        // 급여 정보 동기화 (필요한 경우)
        logger.info('Compensation sync for user:', userId, compensationData);
    }

    // 이벤트 핸들러들
    async handleUserUpdate(userData, sourceSystem) {
        logger.info('User update event:', userData);
        await this.syncUserToPlatform(userData, sourceSystem);
    }

    async handleOrganizationUpdate(orgData, sourceSystem) {
        logger.info('Organization update event:', orgData);
        await this.syncOrganizationToPlatform(orgData, sourceSystem);
    }

    async handleLearningCompletion(learningData, sourceSystem) {
        logger.info('Learning completion event:', learningData);
        await this.syncLearningRecordToPlatform(learningData, sourceSystem);
    }

    // 데이터 변환 및 매핑
    async transformUserData(userData, sourceSystem, targetSystem) {
        const mappingKey = `mapping:${sourceSystem}:${targetSystem}`;
        const mappingRules = await this.redisHgetall(mappingKey);

        const transformed = {};
        for (const [sourceField, targetField] of Object.entries(mappingRules)) {
            if (userData[sourceField] !== undefined) {
                transformed[targetField] = userData[sourceField];
            }
        }

        return transformed;
    }

    // 감사 로그 기록
    async logAuditEvent(action, resource, details) {
        const auditData = {
            action,
            resource,
            details,
            timestamp: new Date(),
            source: 'integration_bus'
        };

        await this.redis.lpush('audit_logs', JSON.stringify(auditData));
    }

    // 정기 동기화 스케줄링
    schedulePeriodicSync() {
        // 매일 오전 2시 전체 사용자 동기화
        cron.schedule('0 2 * * *', () => {
            logger.info('Starting scheduled user sync');
            this.emit('sync-users', 'oracle');
            this.emit('sync-users', 'government');
        });

        // 매일 오전 3시 조직도 동기화
        cron.schedule('0 3 * * *', () => {
            logger.info('Starting scheduled organization sync');
            this.emit('sync-organizations', 'oracle');
            this.emit('sync-organizations', 'government');
        });

        // 매시간 교육 이력 동기화
        cron.schedule('0 * * * *', () => {
            logger.info('Starting scheduled learning sync');
            this.emit('sync-learning', 'oracle');
        });

        logger.info('Periodic sync schedules initialized');
    }

    // 상태 모니터링
    async getStatus() {
        const queueLength = await this.redis.llen('integration_sync_queue');
        const processingJobs = this.syncQueue.filter(job => job.status === 'processing').length;
        const failedJobs = await this.redis.keys('sync_results:*:failed');

        const clientStatuses = {};
        for (const [name, client] of this.clients) {
            try {
                clientStatuses[name] = await client.healthCheck();
            } catch (error) {
                clientStatuses[name] = { status: 'error', error: error.message };
            }
        }

        return {
            queueLength,
            processingJobs,
            failedJobsCount: failedJobs.length,
            clientStatuses,
            uptime: process.uptime()
        };
    }

    // 정상 종료
    async shutdown() {
        logger.info('Shutting down Integration Bus');

        // 모든 클라이언트 연결 종료
        for (const [name, client] of this.clients) {
            try {
                await client.disconnect();
            } catch (error) {
                logger.error(`Error disconnecting ${name} client:`, error);
            }
        }

        // Redis 연결 종료
        await this.redisQuit();

        this.removeAllListeners();
        logger.info('Integration Bus shutdown complete');
    }
}

module.exports = IntegrationBus;
