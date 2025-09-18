const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['student', 'instructor', 'admin'],
    default: 'student'
  },
  company: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  encryptedPrivateKey: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  lastLogin: {
    type: Date
  },
  // HRIS 연동 필드들
  userId: {
    type: String,
    sparse: true // 선택적 필드로 설정
  },
  managerId: {
    type: String
  },
  hireDate: {
    type: Date
  },
  employeeNumber: {
    type: String
  },
  hrisLastSync: {
    type: Date
  },
  hrisProvider: {
    type: String,
    enum: ['successfactors', 'oracle_hcm', 'workday', 'sap_hcm', 'adp', 'other']
  }
}, {
  timestamps: true
});

// Hash password before saving (if we add password field later)
userSchema.pre('save', async function(next) {
  // For now, we're using email-based auth, but this can be extended
  next();
});

// Compare password method (for future use)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token method
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { _id: this._id, email: this.email, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  return token;
};

module.exports = mongoose.model('User', userSchema);
