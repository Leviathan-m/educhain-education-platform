const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// JWT authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    req.user = user;
    req.token = token;

    // API 액세스 감사 로그 기록 (민감하지 않은 리소스만)
    if (!req.path.includes('/health') && !req.path.includes('/dashboard') && req.method !== 'GET') {
      try {
        const { GovernanceService } = require('../services/governanceService');
        await GovernanceService.logActivity(user._id, 'access', req.path.split('/')[2] || 'api', {
          method: req.method,
          path: req.path,
          ip: req.ip
        }, req);
      } catch (logError) {
        logger.error('Audit log error:', logError);
      }
    }

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Optional authentication (for routes that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded._id);

      if (user && user.isActive) {
        req.user = user;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

// Company-based authorization (check if user belongs to company)
const authorizeCompany = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Allow admins to access all companies
    if (req.user.role === 'admin') {
      return next();
    }

    const companyId = req.params.companyId || req.body.companyId || req.query.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID required.'
      });
    }

    // Check if user belongs to the company
    if (req.user.company.toString() !== companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User does not belong to this company.'
      });
    }

    next();
  } catch (error) {
    logger.error('Company authorization error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed.'
    });
  }
};

// API key authentication for company integrations
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key') || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required.'
      });
    }

    const Company = require('../models/Company');
    const company = await Company.findOne({ apiKey });

    if (!company || !company.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key.'
      });
    }

    // Check quota
    if (!company.checkQuota()) {
      return res.status(429).json({
        success: false,
        message: 'API quota exceeded.'
      });
    }

    req.company = company;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed.'
    });
  }
};

// Combined middleware for different auth methods
const requireAuth = (options = {}) => {
  return async (req, res, next) => {
    const { allowApiKey = false, roles = [], requireCompany = false } = options;

    // Try JWT authentication first
    try {
      await authenticate(req, res, () => {});
    } catch (error) {
      // If JWT fails and API key is allowed, try API key
      if (allowApiKey) {
        try {
          await authenticateApiKey(req, res, () => {});
        } catch (apiError) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required.'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }
    }

    // Check roles if specified
    if (roles.length > 0) {
      const roleAuth = authorize(...roles);
      roleAuth(req, res, (error) => {
        if (error) return;
      });
    }

    // Check company access if required
    if (requireCompany) {
      await authorizeCompany(req, res, next);
    } else {
      next();
    }
  };
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  authorizeCompany,
  authenticateApiKey,
  requireAuth
};
