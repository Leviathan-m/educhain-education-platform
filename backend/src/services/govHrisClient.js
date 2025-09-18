const soap = require('soap');
const Client = require('ssh2-sftp-client');
const fs = require('fs').promises;
const xml2js = require('xml2js');
const tls = require('tls');
const logger = require('../utils/logger');

class GovHRISClient {
    constructor(config) {
        this.config = {
            soapEndpoint: config.soapEndpoint,
            sftpHost: config.sftpHost,
            sftpPort: config.sftpPort || 22,
            username: config.username,
            privateKeyPath: config.privateKeyPath,
            certPath: config.certPath,
            caPath: config.caPath,
            orgCode: config.orgCode,
            vpnGateway: config.vpnGateway // VPN 게이트웨이 주소 (옵션)
        };
        this.soapClient = null;
        this.sftpClient = new Client();
        this.certificates = null;
        this.vpnConnected = false;
    }

    async initializeCertificates() {
        try {
            this.certificates = {
                cert: await fs.readFile(this.config.certPath),
                key: await fs.readFile(this.config.privateKeyPath),
                ca: await fs.readFile(this.config.caPath)
            };
            logger.info('Government HRIS certificates loaded');
        } catch (error) {
            logger.error('Certificate loading failed:', error);
            throw error;
        }
    }

    async initializeSoapClient() {
        try {
            if (!this.certificates) await this.initializeCertificates();

            // TLS 1.3 설정
            const tlsOptions = {
                cert: this.certificates.cert,
                key: this.certificates.key,
                ca: this.certificates.ca,
                rejectUnauthorized: true,
                secureProtocol: 'TLSv1_3_method',
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                minVersion: 'TLSv1.3'
            };

            this.soapClient = await soap.createClientAsync(this.config.soapEndpoint, {
                wsdl_options: tlsOptions,
                httpsOptions: tlsOptions,
                forceSoap12Headers: true
            });

            // X.509 인증서 기반 인증 추가
            this.soapClient.setSecurity(new soap.ClientSSLSecurity(
                this.certificates.key,
                this.certificates.cert,
                { ca: this.certificates.ca }
            ));

            logger.info('Government HRIS SOAP client initialized');
        } catch (error) {
            logger.error('SOAP client initialization failed:', error);
            throw error;
        }
    }

    async initializeSftpClient() {
        try {
            if (!this.certificates) await this.initializeCertificates();

            const sftpConfig = {
                host: this.config.sftpHost,
                port: this.config.sftpPort,
                username: this.config.username,
                privateKey: this.certificates.key,
                algorithms: {
                    kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512'],
                    cipher: ['aes256-ctr', 'aes256-gcm@openssh.com'],
                    hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
                    compress: ['zlib@openssh.com', 'zlib']
                },
                // 호스트 키 검증 (운영환경에서는 필수)
                hostVerifier: (keyHash) => {
                    // 실제 구현에서는 신뢰할 수 있는 호스트 키 목록과 비교
                    logger.info('SFTP host key hash:', keyHash);
                    return true; // 개발용
                },
                // VPN 터널을 통한 연결 (필요한 경우)
                ...(this.config.vpnGateway && {
                    socks: {
                        host: this.config.vpnGateway,
                        port: 1080
                    }
                })
            };

            await this.sftpClient.connect(sftpConfig);
            logger.info('Government HRIS SFTP client connected');
        } catch (error) {
            logger.error('SFTP connection failed:', error);
            throw error;
        }
    }

    // SOAP 웹서비스를 통한 사용자 조회
    async fetchUsersViaSoap(searchCriteria = {}) {
        try {
            if (!this.soapClient) await this.initializeSoapClient();

            const request = {
                Header: {
                    OrgCode: this.config.orgCode,
                    RequestDate: new Date().toISOString(),
                    RequestId: `REQ_${Date.now()}`,
                    Version: '2.0'
                },
                Body: {
                    SearchCriteria: {
                        Status: searchCriteria.status || 'ACTIVE',
                        Department: searchCriteria.department || 'ALL',
                        HireDateFrom: searchCriteria.hireDateFrom,
                        HireDateTo: searchCriteria.hireDateTo,
                        ...searchCriteria
                    }
                }
            };

            const [result] = await this.soapClient.GetPersonnelInfoAsync(request);

            if (!result || !result.PersonnelList) {
                logger.warn('No personnel data received from SOAP service');
                return [];
            }

            const personnel = Array.isArray(result.PersonnelList.Personnel)
                ? result.PersonnelList.Personnel
                : [result.PersonnelList.Personnel];

            const mappedUsers = personnel.map(this.mapGovUserToPlatform);

            logger.info(`Fetched ${mappedUsers.length} users from Government HRIS via SOAP`);

            return mappedUsers;

        } catch (error) {
            logger.error('SOAP user fetch failed:', error);
            throw error;
        }
    }

    // SFTP를 통한 배치 파일 동기화
    async syncUsersViaSftp(options = {}) {
        try {
            if (!this.sftpClient.sftp) await this.initializeSftpClient();

            const remoteFilePath = options.filePath || '/export/personnel_data.xml';
            const localFilePath = `/tmp/personnel_data_${Date.now()}.xml`;

            // 파일 다운로드
            await this.sftpClient.get(remoteFilePath, localFilePath);

            // XML 파싱
            const xmlData = await fs.readFile(localFilePath, 'utf8');
            const parser = new xml2js.Parser({
                explicitArray: false,
                ignoreAttrs: false,
                normalizeTags: true
            });

            const result = await parser.parseStringPromise(xmlData);

            // XML 구조 검증
            if (!result.PersonnelData || !result.PersonnelData.Personnel) {
                logger.warn('Invalid XML structure in personnel data file');
                return [];
            }

            const personnel = Array.isArray(result.PersonnelData.Personnel)
                ? result.PersonnelData.Personnel
                : [result.PersonnelData.Personnel];

            const mappedUsers = personnel.map(this.mapGovUserToPlatform);

            // 처리 완료 플래그 파일 업로드
            const processedFileName = `processed_${Date.now()}.flag`;
            await this.sftpClient.put(
                Buffer.from(`PROCESSED:${mappedUsers.length}:${new Date().toISOString()}`),
                `/processed/${processedFileName}`
            );

            // 로컬 임시 파일 정리
            await fs.unlink(localFilePath);

            logger.info(`Synced ${mappedUsers.length} users from Government HRIS via SFTP`);

            return mappedUsers;

        } catch (error) {
            logger.error('SFTP sync failed:', error);
            throw error;
        }
    }

    // 교육 이력 업로드 (SFTP)
    async uploadTrainingRecords(records, options = {}) {
        try {
            if (!this.sftpClient.sftp) await this.initializeSftpClient();

            // XML 형식으로 변환
            const xmlBuilder = new xml2js.Builder({
                rootName: 'TrainingData',
                xmldec: { version: '1.0', encoding: 'UTF-8' },
                renderOpts: { pretty: true, indent: '  ' }
            });

            const xmlData = xmlBuilder.buildObject({
                Header: {
                    OrgCode: this.config.orgCode,
                    UploadDate: new Date().toISOString(),
                    RecordCount: records.length,
                    Version: '2.0'
                },
                TrainingRecords: {
                    Record: records.map(record => ({
                        PersonnelId: record.externalId || record.userId,
                        CourseCode: record.courseCode,
                        CourseName: record.courseName,
                        CompletionDate: record.completionDate,
                        Score: record.score,
                        CertificateHash: record.nftHash,
                        CertificateUrl: record.nftUrl,
                        TrainingHours: record.duration,
                        Instructor: record.instructor,
                        Status: record.status || 'COMPLETED'
                    }))
                }
            });

            const uploadFileName = options.fileName || `training_records_${Date.now()}.xml`;
            const remoteUploadPath = `/import/${uploadFileName}`;

            await this.sftpClient.put(Buffer.from(xmlData), remoteUploadPath);

            logger.info(`Training records uploaded: ${uploadFileName} (${records.length} records)`);

            return {
                success: true,
                fileName: uploadFileName,
                recordCount: records.length,
                uploadTime: new Date()
            };

        } catch (error) {
            logger.error('Training records upload failed:', error);
            throw error;
        }
    }

    // 조직도 조회
    async fetchOrganizationsViaSoap() {
        try {
            if (!this.soapClient) await this.initializeSoapClient();

            const request = {
                Header: {
                    OrgCode: this.config.orgCode,
                    RequestDate: new Date().toISOString(),
                    RequestId: `ORG_REQ_${Date.now()}`
                },
                Body: {
                    IncludeInactive: false,
                    EffectiveDate: new Date().toISOString().split('T')[0]
                }
            };

            const [result] = await this.soapClient.GetOrganizationInfoAsync(request);

            if (!result || !result.OrganizationList) {
                logger.warn('No organization data received from SOAP service');
                return [];
            }

            const organizations = Array.isArray(result.OrganizationList.Organization)
                ? result.OrganizationList.Organization
                : [result.OrganizationList.Organization];

            const mappedOrgs = organizations.map(this.mapGovOrgToPlatform);

            logger.info(`Fetched ${mappedOrgs.length} organizations from Government HRIS`);

            return mappedOrgs;

        } catch (error) {
            logger.error('Organization fetch failed:', error);
            throw error;
        }
    }

    // 데이터 매핑 함수들
    mapGovUserToPlatform(govUser) {
        return {
            externalId: govUser.PersonnelId || govUser['$']?.PersonnelId || govUser.PersonnelID,
            employeeNumber: govUser.EmployeeNumber || govUser['$']?.EmployeeNumber,
            name: govUser.FullName || govUser.Name || govUser['$']?.FullName,
            firstName: govUser.FirstName || govUser['$']?.FirstName,
            lastName: govUser.LastName || govUser['$']?.LastName,
            department: govUser.Department || govUser['$']?.Department,
            departmentCode: govUser.DepartmentCode || govUser['$']?.DepartmentCode,
            position: govUser.Position || govUser['$']?.Position,
            positionCode: govUser.PositionCode || govUser['$']?.PositionCode,
            rank: govUser.Rank || govUser['$']?.Rank,
            hireDate: govUser.HireDate || govUser['$']?.HireDate,
            email: govUser.Email || govUser['$']?.Email,
            phoneNumber: govUser.Phone || govUser['$']?.Phone,
            employmentStatus: govUser.Status || govUser['$']?.Status || 'ACTIVE',
            workLocation: govUser.WorkLocation || govUser['$']?.WorkLocation,
            managerId: govUser.ManagerId || govUser['$']?.ManagerId,
            lastSync: new Date(),
            source: 'gov_hris'
        };
    }

    mapGovOrgToPlatform(govOrg) {
        return {
            externalId: govOrg.OrganizationId || govOrg['$']?.OrganizationId,
            name: govOrg.Name || govOrg['$']?.Name,
            code: govOrg.Code || govOrg['$']?.Code,
            type: govOrg.Type || govOrg['$']?.Type,
            level: govOrg.Level || govOrg['$']?.Level,
            parentId: govOrg.ParentId || govOrg['$']?.ParentId,
            effectiveStartDate: govOrg.EffectiveStartDate || govOrg['$']?.EffectiveStartDate,
            effectiveEndDate: govOrg.EffectiveEndDate || govOrg['$']?.EffectiveEndDate,
            lastSync: new Date(),
            source: 'gov_hris'
        };
    }

    // 파일 목록 조회
    async listRemoteFiles(remotePath = '/') {
        try {
            if (!this.sftpClient.sftp) await this.initializeSftpClient();

            const fileList = await this.sftpClient.list(remotePath);

            return fileList.map(file => ({
                name: file.name,
                size: file.size,
                modifyTime: file.modifyTime,
                type: file.type,
                path: `${remotePath}/${file.name}`.replace('//', '/')
            }));

        } catch (error) {
            logger.error('File listing failed:', error);
            throw error;
        }
    }

    // 상태 확인
    async healthCheck() {
        try {
            // SOAP 연결 확인
            if (!this.soapClient) await this.initializeSoapClient();

            // SFTP 연결 확인
            if (!this.sftpClient.sftp) await this.initializeSftpClient();

            // 간단한 테스트 요청
            const testRequest = {
                Header: {
                    OrgCode: this.config.orgCode,
                    RequestDate: new Date().toISOString(),
                    RequestId: `HEALTH_CHECK_${Date.now()}`
                },
                Body: {
                    TestMode: true
                }
            };

            await this.soapClient.HealthCheckAsync(testRequest);

            return {
                status: 'healthy',
                timestamp: new Date(),
                services: {
                    soap: 'connected',
                    sftp: 'connected'
                }
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date(),
                services: {
                    soap: this.soapClient ? 'connected' : 'disconnected',
                    sftp: this.sftpClient.sftp ? 'connected' : 'disconnected'
                }
            };
        }
    }

    // VPN 연결 관리 (필요한 경우)
    async connectVPN() {
        if (this.config.vpnGateway && !this.vpnConnected) {
            try {
                // VPN 연결 로직 (실제 구현에서는 OpenVPN이나 다른 VPN 클라이언트 사용)
                logger.info(`Connecting to VPN gateway: ${this.config.vpnGateway}`);
                this.vpnConnected = true;
            } catch (error) {
                logger.error('VPN connection failed:', error);
                throw error;
            }
        }
    }

    async disconnectVPN() {
        if (this.vpnConnected) {
            try {
                // VPN 연결 해제 로직
                logger.info('Disconnecting from VPN');
                this.vpnConnected = false;
            } catch (error) {
                logger.error('VPN disconnection failed:', error);
            }
        }
    }

    // 연결 종료
    async disconnect() {
        try {
            if (this.sftpClient.sftp) {
                await this.sftpClient.end();
            }
            await this.disconnectVPN();
            this.soapClient = null;
            logger.info('Government HRIS client disconnected');
        } catch (error) {
            logger.error('Disconnect error:', error);
        }
    }
}

module.exports = GovHRISClient;
