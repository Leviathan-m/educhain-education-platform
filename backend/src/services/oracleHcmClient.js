const axios = require('axios');
const xml2js = require('xml2js');
const logger = require('../utils/logger');

class OracleHCMClient {
    constructor(config) {
        this.config = {
            baseUrl: config.baseUrl, // https://your-tenant.hcm.oraclecloud.com
            username: config.username,
            password: config.password,
            clientId: config.clientId,
            clientSecret: config.clientSecret
        };
        this.token = null;
        this.tokenExpiry = null;
        this.restClient = null;
        this.soapClient = null;
        this.webSocketClient = null;

        this.initializeClients();
    }

    async initializeClients() {
        // REST API 클라이언트 초기화
        this.restClient = axios.create({
            baseURL: `${this.config.baseUrl}/hcmRestApi/resources/11.13.18.05/`,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // SOAP 클라이언트 초기화
        this.soapClient = axios.create({
            baseURL: `${this.config.baseUrl}/hcmCommonRepository/`,
            timeout: 30000,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': ''
            }
        });

        await this.authenticate();
    }

    async authenticate() {
        try {
            // OAuth 2.0 Client Credentials Grant
            const tokenResponse = await axios.post(`${this.config.baseUrl}/oauth2/v1/token`,
                new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    scope: 'urn:opc:resource:fa:instancemgmt'
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            this.token = tokenResponse.data.access_token;
            this.tokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);

            // 인증 헤더 설정
            this.restClient.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
            this.soapClient.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

            logger.info('Oracle HCM authentication successful');

            // 토큰 갱신 스케줄링 (만료 5분 전)
            const refreshTime = (tokenResponse.data.expires_in - 300) * 1000;
            setTimeout(() => this.authenticate(), refreshTime);

        } catch (error) {
            logger.error('Oracle HCM authentication failed:', error.message);
            throw error;
        }
    }

    async ensureAuthenticated() {
        if (!this.token || Date.now() > this.tokenExpiry - 60000) { // 1분 전에 재인증
            await this.authenticate();
        }
    }

    // SCIM 2.0 사용자 프로비저닝
    async syncUsers(params = {}) {
        await this.ensureAuthenticated();

        try {
            const response = await this.restClient.get('workers', {
                params: {
                    q: 'AssignmentStatus=ACTIVE',
                    expand: 'assignments,assignments.organization,workRelationships',
                    fields: 'PersonId,DisplayName,StartDate,assignments',
                    limit: params.limit || 500,
                    offset: params.offset || 0,
                    ...params
                }
            });

            const users = response.data.items || [];
            const mappedUsers = users.map(this.mapOracleUserToPlatform);

            logger.info(`Fetched ${users.length} users from Oracle HCM`);

            return {
                success: true,
                users: mappedUsers,
                totalCount: response.data.count || users.length,
                hasMore: users.length === (params.limit || 500)
            };

        } catch (error) {
            logger.error('User sync failed:', error);
            throw error;
        }
    }

    // SOAP를 통한 조직도 조회
    async syncOrganizations() {
        await this.ensureAuthenticated();

        try {
            const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
                <soapenv:Header>
                    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                        <wsse:UsernameToken>
                            <wsse:Username>${this.config.username}</wsse:Username>
                            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${this.config.password}</wsse:Password>
                        </wsse:UsernameToken>
                    </wsse:Security>
                </soapenv:Header>
                <soapenv:Body>
                    <GetOrganizationsRequest>
                        <EffectiveDate>${new Date().toISOString().split('T')[0]}</EffectiveDate>
                        <IncludeInactive>false</IncludeInactive>
                    </GetOrganizationsRequest>
                </soapenv:Body>
            </soapenv:Envelope>`;

            const response = await this.soapClient.post('OrganizationService', soapRequest);

            // XML 파싱
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(response.data);

            const organizations = result['soapenv:Envelope']['soapenv:Body'][0]['GetOrganizationsResponse'][0]['Organizations'][0]['Organization'] || [];

            return organizations.map(this.mapOracleOrgToPlatform);

        } catch (error) {
            logger.error('Organization sync failed:', error);
            throw error;
        }
    }

    // 교육 이력 동기화
    async syncLearningRecords(params = {}) {
        await this.ensureAuthenticated();

        try {
            const response = await this.restClient.get('learningRecords', {
                params: {
                    q: `CompletionDate>=${params.startDate || '2024-01-01'}`,
                    expand: 'learningItem,worker',
                    fields: 'LearningRecordId,worker.PersonId,learningItem.Title,CompletionDate,Score',
                    limit: params.limit || 1000,
                    offset: params.offset || 0,
                    ...params
                }
            });

            const records = response.data.items || [];
            const mappedRecords = records.map(this.mapLearningRecord);

            logger.info(`Fetched ${records.length} learning records from Oracle HCM`);

            return {
                success: true,
                records: mappedRecords,
                totalCount: response.data.count || records.length,
                hasMore: records.length === (params.limit || 1000)
            };

        } catch (error) {
            logger.error('Learning records sync failed:', error);
            throw error;
        }
    }

    // 급여 정보 동기화 (필요한 경우)
    async syncCompensationData(personId) {
        await this.ensureAuthenticated();

        try {
            const response = await this.restClient.get(`workers/${personId}/child/salaries`, {
                params: {
                    fields: 'SalaryId,SalaryAmount,SalaryBasis,EffectiveStartDate,EffectiveEndDate'
                }
            });

            return response.data.items || [];

        } catch (error) {
            logger.error(`Compensation data sync failed for person ${personId}:`, error);
            throw error;
        }
    }

    // 사용자 업데이트 전송
    async updateUserInOracle(personId, updates) {
        await this.ensureAuthenticated();

        try {
            const oracleUpdates = this.mapPlatformToOracle(updates);

            const response = await this.restClient.patch(`workers/${personId}`, oracleUpdates);

            logger.info(`Updated user ${personId} in Oracle HCM`);
            return response.data;

        } catch (error) {
            logger.error(`User update failed for person ${personId}:`, error);
            throw error;
        }
    }

    // 데이터 매핑 함수들
    mapOracleUserToPlatform(oracleUser) {
        const primaryAssignment = oracleUser.assignments?.find(assignment => assignment.PrimaryAssignmentFlag === true) || oracleUser.assignments?.[0];

        return {
            externalId: oracleUser.PersonId,
            email: primaryAssignment?.workEmail || oracleUser.WorkEmail,
            name: oracleUser.DisplayName,
            firstName: oracleUser.FirstName,
            lastName: oracleUser.LastName,
            department: primaryAssignment?.organization?.Name,
            departmentId: primaryAssignment?.organization?.OrganizationId,
            position: primaryAssignment?.JobCode,
            positionId: primaryAssignment?.JobId,
            hireDate: oracleUser.StartDate,
            managerId: primaryAssignment?.ManagerPersonId,
            managerName: primaryAssignment?.ManagerName,
            employmentStatus: primaryAssignment?.AssignmentStatus,
            location: primaryAssignment?.LocationCode,
            businessUnit: primaryAssignment?.BusinessUnitName,
            lastSync: new Date(),
            source: 'oracle_hcm'
        };
    }

    mapOracleOrgToPlatform(oracleOrg) {
        return {
            externalId: oracleOrg.OrganizationId?.[0],
            name: oracleOrg.Name?.[0],
            code: oracleOrg.OrganizationCode?.[0],
            type: oracleOrg.ClassificationCode?.[0],
            parentId: oracleOrg.ParentOrganizationId?.[0],
            effectiveStartDate: oracleOrg.EffectiveStartDate?.[0],
            effectiveEndDate: oracleOrg.EffectiveEndDate?.[0],
            lastSync: new Date(),
            source: 'oracle_hcm'
        };
    }

    mapLearningRecord(oracleRecord) {
        return {
            externalId: oracleRecord.LearningRecordId,
            userId: oracleRecord.worker?.PersonId,
            courseName: oracleRecord.learningItem?.Title,
            courseCode: oracleRecord.learningItem?.LearningItemId,
            completionDate: oracleRecord.CompletionDate,
            score: oracleRecord.Score,
            status: oracleRecord.Status,
            duration: oracleRecord.Duration,
            lastSync: new Date(),
            source: 'oracle_hcm'
        };
    }

    mapPlatformToOracle(platformUser) {
        return {
            DisplayName: platformUser.name,
            WorkEmail: platformUser.email,
            FirstName: platformUser.firstName,
            LastName: platformUser.lastName
            // 필요한 다른 필드들 추가
        };
    }

    // WebSocket 연결로 실시간 업데이트 수신
    setupWebSocketConnection(callback) {
        const WebSocket = require('ws');
        const wsUrl = `${this.config.baseUrl.replace('https', 'wss')}/hcmCoreApi/websocket`;

        this.webSocketClient = new WebSocket(wsUrl, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        this.webSocketClient.on('open', () => {
            logger.info('Oracle HCM WebSocket connected');
            // 구독 메시지 전송
            this.webSocketClient.send(JSON.stringify({
                type: 'subscribe',
                topics: ['worker-updates', 'learning-completions']
            }));
        });

        this.webSocketClient.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                logger.info('Oracle HCM WebSocket message:', message);
                if (callback) callback(message);
            } catch (error) {
                logger.error('WebSocket message parse error:', error);
            }
        });

        this.webSocketClient.on('error', (error) => {
            logger.error('Oracle HCM WebSocket error:', error);
        });

        this.webSocketClient.on('close', () => {
            logger.warn('Oracle HCM WebSocket closed, reconnecting...');
            setTimeout(() => this.setupWebSocketConnection(callback), 5000);
        });
    }

    // Bulk API를 통한 대량 데이터 동기화
    async bulkSyncUsers(userIds) {
        await this.ensureAuthenticated();

        try {
            const bulkRequest = {
                parts: userIds.map(id => ({
                    id,
                    path: `/workers/${id}`,
                    operation: 'get'
                }))
            };

            const response = await this.restClient.post('workers', bulkRequest, {
                headers: {
                    'Content-Type': 'application/json',
                    'REST-Framework-Version': '4'
                }
            });

            const users = response.data.parts?.map(part => part.body).filter(Boolean) || [];
            return users.map(this.mapOracleUserToPlatform);

        } catch (error) {
            logger.error('Bulk user sync failed:', error);
            throw error;
        }
    }

    // 연결 상태 확인
    async healthCheck() {
        try {
            await this.ensureAuthenticated();
            const response = await this.restClient.get('workers', { params: { limit: 1 } });
            return {
                status: 'healthy',
                timestamp: new Date(),
                recordCount: response.data.count || 0
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    // 연결 종료
    disconnect() {
        if (this.webSocketClient) {
            this.webSocketClient.close();
        }
        this.token = null;
        logger.info('Oracle HCM client disconnected');
    }
}

module.exports = OracleHCMClient;
