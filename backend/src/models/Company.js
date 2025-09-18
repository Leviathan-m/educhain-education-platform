const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  domain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String
  },
  logo: {
    type: String // URL or IPFS hash
  },
  subscription: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    default: 'basic'
  },
  apiKey: {
    type: String,
    unique: true,
    sparse: true
  },
  monthlyQuota: {
    type: Number,
    default: 1000 // Default quota for basic plan
  },
  usedQuota: {
    type: Number,
    default: 0
  },
  quotaResetDate: {
    type: Date,
    default: function() {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  settings: {
    allowSelfEnrollment: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    autoEnroll: {
      type: Boolean,
      default: false
    },
    certificateTemplate: {
      backgroundColor: {
        type: String,
        default: '#ffffff'
      },
      textColor: {
        type: String,
        default: '#000000'
      },
      logoPosition: {
        type: String,
        enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        default: 'top-right'
      }
    },
    notifications: {
      enrollmentConfirmation: {
        type: Boolean,
        default: true
      },
      courseCompletion: {
        type: Boolean,
        default: true
      },
      certificateReady: {
        type: Boolean,
        default: true
      }
    }
  },
  billing: {
    stripeCustomerId: String,
    currentPlan: {
      name: String,
      price: Number,
      interval: {
        type: String,
        enum: ['month', 'year']
      }
    },
    nextBillingDate: Date,
    paymentMethod: {
      type: String,
      last4: String,
      brand: String
    }
  },
  stats: {
    totalUsers: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    totalCourses: {
      type: Number,
      default: 0
    },
    completedCourses: {
      type: Number,
      default: 0
    },
    totalCertificates: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deactivatedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for domain-based lookups
companySchema.index({ domain: 1 });

// Pre-save middleware to generate API key
companySchema.pre('save', async function(next) {
  if (this.isNew && !this.apiKey) {
    const crypto = require('crypto');
    this.apiKey = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Method to check quota
companySchema.methods.checkQuota = function(requested = 1) {
  return (this.usedQuota + requested) <= this.monthlyQuota;
};

// Method to increment quota usage
companySchema.methods.incrementQuota = function(amount = 1) {
  this.usedQuota += amount;
  return this.save();
};

// Method to reset quota (call monthly)
companySchema.methods.resetQuota = function() {
  this.usedQuota = 0;
  this.quotaResetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  return this.save();
};

// Virtual for quota usage percentage
companySchema.virtual('quotaUsagePercent').get(function() {
  return Math.round((this.usedQuota / this.monthlyQuota) * 100);
});

module.exports = mongoose.model('Company', companySchema);
