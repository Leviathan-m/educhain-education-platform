const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Redis import - 사용 가능할 때만 로드
let Redis;
try {
    Redis = require('ioredis');
} catch (error) {
    logger.warn('Redis not available, using in-memory storage');
    Redis = null;
}

// winston import - 사용 가능할 때만 로드
let winston;
try {
    winston = require('winston');
} catch (error) {
    logger.warn('Winston not available, using console logging');
    winston = null;
}

class SecurityManager {
    constructor(config = {}) {
        this.config = {
            jwtSecret: config.jwtSecret || process.env.JWT_SECRET,
            jwtPublicKey: config.jwtPublicKey || process.env.JWT_PUBLIC_KEY,
            jwtPrivateKey: config.jwtPrivateKey || process.env.JWT_PRIVATE_KEY,
            encryptionKey: config.encryptionKey || process.env.ENCRYPTION_KEY,
            redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            ipWhitelist: config.ipWhitelist || (process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : []),
            auditLogPath: config.auditLogPath || './logs/security',
            sessionTimeout: config.sessionTimeout || 24 * 60 * 60 * 1000, // 24시간
            ...config
        };

        // Redis 또는 in-memory 스토리지 초기화
        if (Redis) {
            this.redis = new Redis(this.config.redisUrl);
        } else {
            this.memoryStorage = new Map();
        }
        this.initializeLogging();
        this.initializeEncryption();
        this.loadKeys();
    }

    async initializeLogging() {
        if (winston) {
            // 보안 감사 로그 초기화
            this.securityLogger = winston.createLogger({
                level: 'info',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.errors({ stack: true }),
                    winston.format.json()
                ),
                transports: [
                    new winston.transports.File({
                        filename: `${this.config.auditLogPath}/security.log`,
                        maxsize: 10 * 1024 * 1024, // 10MB
                        maxFiles: 30
                    }),
                    new winston.transports.File({
                        filename: `${this.config.auditLogPath}/security_error.log`,
                        level: 'error'
                    }),
                    // 콘솔 출력 (개발용)
                    new winston.transports.Console({
                        format: winston.format.simple()
                    })
                ]
            });
        } else {
            // winston이 없을 때는 간단한 로깅
            this.securityLogger = {
                info: (message, meta) => console.log('SECURITY INFO:', message, meta),
                warn: (message, meta) => console.warn('SECURITY WARN:', message, meta),
                error: (message, meta) => console.error('SECURITY ERROR:', message, meta),
                end: () => {} // 빈 함수
            };
        }

        logger.info('Security logging initialized');
    }

    initializeEncryption() {
        // 암호화 키 검증
        if (!this.config.encryptionKey || this.config.encryptionKey.length !== 32) {
            throw new Error('Encryption key must be 32 characters long');
        }
        this.encryptionKey = Buffer.from(this.config.encryptionKey, 'utf8');
    }

    async loadKeys() {
        try {
            if (this.config.jwtPublicKey && this.config.jwtPrivateKey) {
                this.jwtPublicKey = await fs.readFile(this.config.jwtPublicKey, 'utf8');
                this.jwtPrivateKey = await fs.readFile(this.config.jwtPrivateKey, 'utf8');
                logger.info('JWT keys loaded');
            }
        } catch (error) {
            logger.warn('JWT key files not found, using secret:', error.message);
        }
    }

    // JWT 토큰 생성 (RS256 사용)
    generateJWT(user, permissions = [], options = {}) {
        const payload = {
            userId: user._id || user.id,
            email: user.email,
            role: user.role,
            permissions: permissions,
            department: user.department,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 24 * 60 * 60), // 기본 24시간
            iss: 'nft-education-platform',
            aud: 'enterprise-api',
            jti: crypto.randomUUID() // 고유 토큰 ID
        };

        const signOptions = {
            algorithm: this.jwtPrivateKey ? 'RS256' : 'HS256'
        };

        const token = jwt.sign(
            payload,
            this.jwtPrivateKey || this.config.jwtSecret,
            signOptions
        );

        // 토큰을 Redis에 저장 (블랙리스트용)
        if (this.redis) {
            this.redis.setex(`jwt:${payload.jti}`, this.sessionTimeout / 1000, 'valid');
        }

        return token;
    }

    // JWT 토큰 검증
    async verifyJWT(token) {
        try {
            // 토큰이 블랙리스트에 있는지 확인
            const decoded = jwt.decode(token, { complete: true });
            if (decoded && decoded.payload.jti) {
                const isValid = this.redis ? await this.redis.get(`jwt:${decoded.payload.jti}`) : 'valid';
                if (!isValid) {
                    throw new Error('Token has been revoked');
                }
            }

            const verifyOptions = {
                algorithms: this.jwtPublicKey ? ['RS256'] : ['HS256'],
                issuer: 'nft-education-platform',
                audience: 'enterprise-api'
            };

            const payload = jwt.verify(
                token,
                this.jwtPublicKey || this.config.jwtSecret,
                verifyOptions
            );

            return payload;

        } catch (error) {
            this.logSecurityEvent({
                event: 'JWT_VERIFICATION_FAILED',
                error: error.message,
                tokenHash: crypto.createHash('sha256').update(token).digest('hex')
            });
            throw error;
        }
    }

    // JWT 토큰 폐기
    async revokeJWT(token) {
        try {
            const decoded = jwt.decode(token, { complete: true });
            if (decoded && decoded.payload.jti) {
                if (this.redis) await this.redis.del(`jwt:${decoded.payload.jti}`);
                this.logSecurityEvent({
                    event: 'JWT_REVOKED',
                    userId: decoded.payload.userId,
                    tokenId: decoded.payload.jti
                });
            }
        } catch (error) {
            logger.error('JWT revoke error:', error);
        }
    }

    // 세션 관리
    async createSession(user, metadata = {}) {
        const sessionId = crypto.randomUUID();
        const sessionData = {
            userId: user._id,
            email: user.email,
            role: user.role,
            department: user.department,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            createdAt: new Date(),
            lastActivity: new Date()
        };

        if (this.redis) {
            await this.redis.setex(
                `session:${sessionId}`,
                this.sessionTimeout / 1000,
                JSON.stringify(sessionData)
            );
        } else {
            // Redis가 없을 때는 메모리에 저장 (단순 구현)
            if (!this.memorySessions) this.memorySessions = new Map();
            this.memorySessions.set(sessionId, sessionData);
        }

        this.logAuditEvent('SESSION_CREATED', {
            sessionId,
            userId: user._id,
            ipAddress: metadata.ipAddress
        });

        return sessionId;
    }

    async validateSession(sessionId) {
        try {
            let sessionData;
            if (this.redis) {
                sessionData = await this.redis.get(`session:${sessionId}`);
            } else {
                sessionData = this.memorySessions ? JSON.stringify(this.memorySessions.get(sessionId)) : null;
            }

            if (!sessionData) return null;

            const session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;

            // 마지막 활동 시간 업데이트
            session.lastActivity = new Date();
            if (this.redis) {
                await this.redis.setex(
                    `session:${sessionId}`,
                    this.sessionTimeout / 1000,
                    JSON.stringify(session)
                );
            } else {
                this.memorySessions.set(sessionId, session);
            }

            return session;
        } catch (error) {
            logger.error('Session validation error:', error);
            return null;
        }
    }

    async destroySession(sessionId) {
        if (this.redis) {
            await this.redis.del(`session:${sessionId}`);
        } else if (this.memorySessions) {
            this.memorySessions.delete(sessionId);
        }
        this.logAuditEvent('SESSION_DESTROYED', { sessionId });
    }

    // RBAC 권한 확인
    async checkPermission(user, requiredPermission, resource = null, context = {}) {
        // 관리자는 모든 권한
        if (user.role === 'admin') return true;

        // 역할 기반 권한 확인
        const rolePermissions = await this.getRolePermissions(user.role);
        if (!rolePermissions.includes(requiredPermission)) {
            this.logSecurityEvent({
                event: 'PERMISSION_DENIED',
                userId: user._id,
                requiredPermission,
                userPermissions: rolePermissions,
                resource
            });
            return false;
        }

        // 리소스별 추가 검증
        if (resource && context) {
            return await this.checkResourcePermission(user, requiredPermission, resource, context);
        }

        return true;
    }

    async getRolePermissions(role) {
        // 역할별 기본 권한 매핑
        const rolePermissions = {
            admin: ['*'],
            instructor: [
                'course.create', 'course.read', 'course.update',
                'enrollment.read', 'enrollment.update',
                'certificate.create', 'certificate.read',
                'report.read'
            ],
            student: [
                'course.read',
                'enrollment.create', 'enrollment.read',
                'certificate.read'
            ]
        };

        return rolePermissions[role] || [];
    }

    async checkResourcePermission(user, permission, resource, context) {
        // 부서별 권한 검증
        if (context.departmentId && user.department !== context.departmentId && user.role !== 'admin') {
            return false;
        }

        // 소유권 검증
        if (context.ownerId && user._id !== context.ownerId && user.role !== 'admin') {
            return false;
        }

        return true;
    }

    // 데이터 암호화/복호화
    encryptSensitiveData(data) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);

            cipher.setIV(iv);

            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const tag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                algorithm: 'aes-256-gcm'
            };
        } catch (error) {
            logger.error('Data encryption failed:', error);
            throw error;
        }
    }

    decryptSensitiveData(encryptedData) {
        try {
            const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
            decipher.setIV(Buffer.from(encryptedData.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            logger.error('Data decryption failed:', error);
            throw error;
        }
    }

    // IP 화이트리스트 검증
    validateIPWhitelist(ipAddress) {
        if (!this.config.ipWhitelist || this.config.ipWhitelist.length === 0) {
            return true; // 화이트리스트가 설정되지 않은 경우 허용
        }

        const isAllowed = this.config.ipWhitelist.some(allowedIP => {
            // CIDR 표기법 지원 (간단한 구현)
            if (allowedIP.includes('/')) {
                return this.isIPInCIDR(ipAddress, allowedIP);
            }
            return ipAddress === allowedIP;
        });

        if (!isAllowed) {
            this.logSecurityEvent({
                event: 'IP_NOT_WHITELISTED',
                ipAddress,
                whitelist: this.config.ipWhitelist
            });
        }

        return isAllowed;
    }

    isIPInCIDR(ip, cidr) {
        // 간단한 CIDR 검증 (실제 구현에서는 ipaddr.js 등의 라이브러리 사용 권장)
        const [network, prefix] = cidr.split('/');
        const prefixLength = parseInt(prefix);

        // IPv4만 지원하는 간단한 구현
        const ipParts = ip.split('.').map(Number);
        const networkParts = network.split('.').map(Number);

        const ipBinary = ipParts.reduce((acc, part) => (acc << 8) + part, 0);
        const networkBinary = networkParts.reduce((acc, part) => (acc << 8) + part, 0);
        const mask = (0xFFFFFFFF << (32 - prefixLength)) >>> 0;

        return (ipBinary & mask) === (networkBinary & mask);
    }

    // X.509 인증서 검증
    validateClientCertificate(cert, expectedOrg = null) {
        try {
            if (!cert || !cert.subject) {
                this.logSecurityEvent({
                    event: 'NO_CLIENT_CERTIFICATE',
                    expectedOrg
                });
                return false;
            }

            // 인증서 유효성 검증
            const now = new Date();
            const notBefore = new Date(cert.valid_from);
            const notAfter = new Date(cert.valid_to);

            if (now < notBefore || now > notAfter) {
                this.logSecurityEvent({
                    event: 'INVALID_CERTIFICATE_VALIDITY',
                    subject: cert.subject,
                    validFrom: cert.valid_from,
                    validTo: cert.valid_to
                });
                return false;
            }

            // 조직 검증 (옵션)
            if (expectedOrg && !cert.subject.includes(expectedOrg)) {
                this.logSecurityEvent({
                    event: 'CERTIFICATE_ORG_MISMATCH',
                    subject: cert.subject,
                    expectedOrg
                });
                return false;
            }

            this.logAuditEvent('CERTIFICATE_VALIDATED', {
                subject: cert.subject,
                issuer: cert.issuer,
                validTo: cert.valid_to
            });

            return true;

        } catch (error) {
            this.logSecurityEvent({
                event: 'CERTIFICATE_VALIDATION_ERROR',
                error: error.message
            });
            return false;
        }
    }

    // 감사 로그 기록
    logAuditEvent(event, details = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            severity: 'info'
        };

        this.securityLogger.info('AUDIT_EVENT', auditEntry);
    }

    logSecurityEvent(securityEvent) {
        const eventEntry = {
            timestamp: new Date().toISOString(),
            ...securityEvent,
            severity: securityEvent.severity || 'high'
        };

        this.securityLogger.warn('SECURITY_EVENT', eventEntry);

        // 심각한 보안 이벤트의 경우 즉시 알림
        if (eventEntry.severity === 'critical') {
            this.sendSecurityAlert(eventEntry);
        }
    }

    // 보안 알림 발송 (실제 구현에서는 이메일, Slack 등으로 알림)
    sendSecurityAlert(event) {
        logger.error('CRITICAL SECURITY EVENT:', event);
        // 실제 구현에서는 보안팀에 알림 발송
    }

    // 비밀번호 정책 검증
    validatePasswordPolicy(password) {
        const policies = {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true
        };

        if (password.length < policies.minLength) return false;
        if (policies.requireUppercase && !/[A-Z]/.test(password)) return false;
        if (policies.requireLowercase && !/[a-z]/.test(password)) return false;
        if (policies.requireNumbers && !/\d/.test(password)) return false;
        if (policies.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;

        return true;
    }

    // 비밀번호 해시 생성
    hashPassword(password) {
        const salt = crypto.randomBytes(32);
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');

        return {
            hash: hash.toString('hex'),
            salt: salt.toString('hex'),
            algorithm: 'pbkdf2-sha512',
            iterations: 100000
        };
    }

    // 비밀번호 검증
    verifyPassword(password, hashData) {
        const hash = crypto.pbkdf2Sync(
            password,
            Buffer.from(hashData.salt, 'hex'),
            hashData.iterations,
            32,
            'sha512'
        );

        return hash.toString('hex') === hashData.hash;
    }

    // Express 미들웨어 생성
    createSecurityMiddleware(options = {}) {
        return [
            // IP 화이트리스트 검증
            ...(options.ipWhitelist ? [
                (req, res, next) => {
                    if (!this.validateIPWhitelist(req.ip)) {
                        return res.status(403).json({ error: 'IP not whitelisted' });
                    }
                    next();
                }
            ] : []),

            // 클라이언트 인증서 검증
            ...(options.clientCert ? [
                (req, res, next) => {
                    if (!this.validateClientCertificate(req.connection.getPeerCertificate(), options.expectedOrg)) {
                        return res.status(401).json({ error: 'Invalid client certificate' });
                    }
                    next();
                }
            ] : []),

            // JWT 검증
            async (req, res, next) => {
                try {
                    const token = req.headers.authorization?.replace('Bearer ', '');
                    if (!token) throw new Error('No token provided');

                    req.user = await this.verifyJWT(token);
                    next();
                } catch (error) {
                    res.status(401).json({ error: 'Unauthorized' });
                }
            },

            // 권한 검증
            ...(options.permission ? [
                async (req, res, next) => {
                    if (!await this.checkPermission(req.user, options.permission, req.path, {
                        departmentId: req.user.department,
                        ownerId: req.params.userId
                    })) {
                        return res.status(403).json({ error: 'Forbidden' });
                    }
                    next();
                }
            ] : [])
        ];
    }

    // 시스템 상태 확인
    async getSecurityStatus() {
        const status = {
            jwtKeysLoaded: !!(this.jwtPublicKey && this.jwtPrivateKey),
            encryptionKeyValid: this.encryptionKey && this.encryptionKey.length === 32,
            ipWhitelistEnabled: this.config.ipWhitelist.length > 0,
            redisConnected: this.redis ? this.redis.status === 'ready' : false,
            auditLoggingActive: true,
            activeSessions: 0,
            recentSecurityEvents: 0
        };

        try {
            // 활성 세션 수 확인
            const sessionKeys = await this.redis.keys('session:*');
            status.activeSessions = sessionKeys.length;

            // 최근 보안 이벤트 수 확인 (24시간)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            status.recentSecurityEvents = 'unknown'; // 로그 파일에서 확인 필요

        } catch (error) {
            logger.error('Security status check error:', error);
        }

        return status;
    }

    // 시스템 종료
    async shutdown() {
        logger.info('Shutting down Security Manager');
        if (this.redis) await this.redis.quit();
        if (this.securityLogger) this.securityLogger.end();
    }
}

module.exports = SecurityManager;
