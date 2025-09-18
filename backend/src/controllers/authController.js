const authService = require('../services/authService');
const User = require('../models/User');
const Company = require('../models/Company');
const logger = require('../utils/logger');

// Register user with email
const register = async (req, res) => {
  try {
    const { email, name, companyName, department, role = 'student' } = req.body;

    // Validate required fields
    if (!email || !name || !companyName) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and company name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Find or create company
    let company = await Company.findOne({ name: companyName });
    if (!company) {
      company = new Company({
        name: companyName,
        domain: email.split('@')[1] // Extract domain from email
      });
      await company.save();
    }

    // Register user
    const result = await authService.registerUser({
      email,
      name,
      company: company._id,
      department,
      role
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: result
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    const result = await authService.verifyEmail(token);

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: result
    });
  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Email verification failed'
    });
  }
};

// Login with email
const login = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const result = await authService.loginWithEmail(email);

    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('company', 'name domain')
      .select('-encryptedPrivateKey -verificationToken -resetPasswordToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
          department: user.department,
          walletAddress: user.walletAddress,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    logger.error('Profile retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, department } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (name) updateData.name = name;
    if (department !== undefined) updateData.department = department;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).populate('company', 'name domain');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
          department: user.department,
          walletAddress: user.walletAddress
        }
      }
    });
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Request password reset (placeholder for future password-based auth)
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // For now, just return success (password reset not implemented yet)
    res.json({
      success: true,
      message: 'If an account with this email exists, a reset link has been sent.'
    });
  } catch (error) {
    logger.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
};

// Resend verification email
const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const verificationToken = authService.generateVerificationToken();
    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    await authService.sendVerificationEmail(user.email, verificationToken);

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

// Get user's wallet info (without private key)
const getWalletInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletAddress');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress
      }
    });
  } catch (error) {
    logger.error('Wallet info retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet info'
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  login,
  getProfile,
  updateProfile,
  requestPasswordReset,
  resendVerification,
  getWalletInfo
};
