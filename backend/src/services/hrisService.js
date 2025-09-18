const axios = require('axios');
const logger = require('../utils/logger');

class HRISClient {
  constructor(config) {
    this.config = config;
    this.api = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000
    });
    this.token = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      const response = await this.api.post('/oauth/token', {
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      this.token = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      this.api.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

      logger.info('HRIS authentication successful');
      return true;
    } catch (error) {
      logger.error('HRIS authentication failed:', error.message);
      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.token || Date.now() > this.tokenExpiry - 60000) { // 1분 전에 재인증
      await this.authenticate();
    }
  }

  async fetchUsers(params = {}) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get('/Users', { params });
      return response.data.Resources || response.data;
    } catch (error) {
      logger.error('Failed to fetch HRIS users:', error.message);
      throw error;
    }
  }

  async fetchUser(userId) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get(`/Users/${userId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch HRIS user ${userId}:`, error.message);
      throw error;
    }
  }

  async fetchOrganizations() {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get('/Organizations');
      return response.data.Resources || response.data;
    } catch (error) {
      logger.error('Failed to fetch HRIS organizations:', error.message);
      throw error;
    }
  }

  async fetchPositions() {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get('/Positions');
      return response.data.Resources || response.data;
    } catch (error) {
      logger.error('Failed to fetch HRIS positions:', error.message);
      throw error;
    }
  }

  async updateUser(userId, updates) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.patch(`/Users/${userId}`, updates);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update HRIS user ${userId}:`, error.message);
      throw error;
    }
  }

  async createUser(userData) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.post('/Users', userData);
      return response.data;
    } catch (error) {
      logger.error('Failed to create HRIS user:', error.message);
      throw error;
    }
  }
}

// HRIS 데이터를 플랫폼 데이터로 매핑하는 함수들
function mapHrisToPlatform(hrisUser) {
  return {
    userId: hrisUser.id,
    email: hrisUser.userName || hrisUser.emails?.[0]?.value,
    name: hrisUser.name?.formatted || `${hrisUser.name?.givenName} ${hrisUser.name?.familyName}`,
    department: hrisUser.department || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.department,
    position: hrisUser.title || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.jobTitle,
    company: hrisUser.organization || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.organization,
    managerId: hrisUser.manager?.value || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.manager?.value,
    hireDate: hrisUser.hireDate || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.hireDate,
    employeeNumber: hrisUser.employeeNumber || hrisUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.employeeNumber,
    active: hrisUser.active !== false,
    hrisLastSync: new Date()
  };
}

function mapPlatformToHris(platformUser) {
  return {
    id: platformUser.userId,
    userName: platformUser.email,
    name: {
      formatted: platformUser.name,
      givenName: platformUser.name?.split(' ')[0],
      familyName: platformUser.name?.split(' ').slice(1).join(' ')
    },
    emails: [{
      value: platformUser.email,
      primary: true
    }],
    active: platformUser.isActive,
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      department: platformUser.department,
      jobTitle: platformUser.position,
      organization: platformUser.company,
      manager: platformUser.managerId ? { value: platformUser.managerId } : undefined,
      hireDate: platformUser.hireDate,
      employeeNumber: platformUser.employeeNumber
    }
  };
}

// HRIS 연동 상태 추적을 위한 모델
const mongoose = require('mongoose');

const hrisSyncLogSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['successfactors', 'oracle_hcm', 'workday', 'sap_hcm', 'adp', 'other']
  },
  operation: {
    type: String,
    required: true,
    enum: ['full_sync', 'incremental_sync', 'user_sync', 'webhook_sync']
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'partial_success', 'failed'],
    default: 'success'
  },
  recordsProcessed: {
    type: Number,
    default: 0
  },
  recordsFailed: {
    type: Number,
    default: 0
  },
  errors: [{
    userId: String,
    error: String,
    timestamp: Date
  }],
  duration: {
    type: Number, // milliseconds
    required: true
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

const HrisSyncLog = mongoose.model('HrisSyncLog', hrisSyncLogSchema);

// HRIS 제공자별 설정 저장
const hrisConfigSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    unique: true,
    enum: ['successfactors', 'oracle_hcm', 'workday', 'sap_hcm', 'adp', 'other']
  },
  name: {
    type: String,
    required: true
  },
  baseUrl: {
    type: String,
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  clientSecret: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  syncSchedule: {
    type: String,
    default: '0 2 * * *', // 매일 오전 2시
    validate: {
      validator: function(v) {
        // 간단한 cron 표현식 검증
        return /^\s*(\*|([0-9]|[1-5][0-9])|\*\/[0-9]+)\s+(\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+)\s+(\*|([1-9]|[12][0-9]|3[01])|\*\/[0-9]+)\s+(\*|([1-9]|1[0-2])|\*\/[0-9]+)\s+(\*|[0-6]|\*\/[0-9]+)\s*$/.test(v);
      },
      message: 'Invalid cron expression'
    }
  },
  lastSync: Date,
  webhookUrl: String,
  webhookSecret: String,
  fieldMapping: {
    userId: { type: String, default: 'id' },
    email: { type: String, default: 'userName' },
    name: { type: String, default: 'name.formatted' },
    department: { type: String, default: 'department' },
    position: { type: String, default: 'title' },
    company: { type: String, default: 'organization' },
    managerId: { type: String, default: 'manager.value' },
    hireDate: { type: String, default: 'hireDate' },
    employeeNumber: { type: String, default: 'employeeNumber' }
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

const HrisConfig = mongoose.model('HrisConfig', hrisConfigSchema);

module.exports = {
  HRISClient,
  mapHrisToPlatform,
  mapPlatformToHris,
  HrisSyncLog,
  HrisConfig
};
