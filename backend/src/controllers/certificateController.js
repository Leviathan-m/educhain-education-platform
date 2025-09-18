const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const blockchainService = require('../services/blockchainService');
const ipfsService = require('../services/ipfsService');
const authService = require('../services/authService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Mint NFT certificate for completed course with enhanced privacy protection
const mintCertificate = async (req, res) => {
  try {
    const { enrollmentId } = req.body;
    const userId = req.user._id;

    // Find enrollment
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('course')
      .populate('user');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    // Check if user owns this enrollment
    if (enrollment.user._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if course is completed and passed
    if (enrollment.status !== 'completed' || !enrollment.finalEvaluation?.passed) {
      return res.status(400).json({
        success: false,
        message: 'Course not completed or evaluation not passed'
      });
    }

    // Check if certificate already minted
    if (enrollment.certificate?.tokenId) {
      return res.status(400).json({
        success: false,
        message: 'Certificate already minted'
      });
    }

    logger.info(`Minting privacy-protected certificate for user ${enrollment.user._id} - course ${enrollment.course._id}`);

    // 1. Prepare sensitive metadata (data to be stored on IPFS)
    const metadata = {
      courseName: enrollment.course.title,
      studentName: enrollment.user.name,
      studentEmail: enrollment.user.email,
      aiScore: enrollment.finalEvaluation.score,
      aiEvaluation: enrollment.finalEvaluation.feedback || enrollment.finalEvaluation.details,
      completionDate: (enrollment.completedAt || new Date()).toISOString(),
      issuedAt: new Date().toISOString(),
      courseDescription: enrollment.course.description,
      instructorName: enrollment.course.instructor?.name || 'System',
      companyName: enrollment.user.company?.name || 'Platform'
    };

    // 2. Upload sensitive metadata to IPFS
    const ipfsResult = await ipfsService.uploadMetadata(metadata);

    // 3. Store only hashes on blockchain (privacy protection)
    const mintingData = {
      recipientAddress: enrollment.user.walletAddress,
      courseId: enrollment.course._id.toString(),
      courseName: enrollment.course.title, // For logging, not stored on blockchain
      userId: enrollment.user._id.toString(),
      studentName: enrollment.user.name, // For logging, not stored on blockchain
      studentEmail: enrollment.user.email, // For logging, not stored on blockchain
      completionDate: enrollment.completedAt || new Date(),
      aiEvaluation: enrollment.finalEvaluation.feedback || enrollment.finalEvaluation.details,
      aiScore: enrollment.finalEvaluation.score,
      ipfsHash: ipfsResult.hash, // Store only IPFS CID on blockchain
      credentialType: 1, // Certificate
      isSoulbound: false,
      validUntil: 0 // Permanent
    };

    const mintResult = await blockchainService.mintCertificate(mintingData);

    // 4. Store sensitive information in off-chain database (Certificate model)
    const certificate = new Certificate({
      tokenId: mintResult.tokenId,
      contractAddress: process.env.CONTRACT_ADDRESS,
      blockchainNetwork: 'polygon',

      // Sensitive personal information (stored only off-chain)
      studentName: enrollment.user.name,
      studentEmail: enrollment.user.email,

      // Course information
      courseId: enrollment.course._id,
      courseName: enrollment.course.title,
      courseCode: enrollment.course.code,

      // Evaluation information
      aiScore: enrollment.finalEvaluation.score,
      aiEvaluation: enrollment.finalEvaluation.feedback || enrollment.finalEvaluation.details,
      evaluationDetails: enrollment.finalEvaluation,

      // Issuance information
      issuerId: req.user._id, // Administrator or system
      issuerName: req.user.name || 'System Administrator',
      recipientId: enrollment.user._id,
      recipientAddress: enrollment.user.walletAddress,

      // Certificate attributes
      credentialType: 1, // Certificate
      isSoulbound: false,

      // IPFS information
      ipfsHash: ipfsResult.hash,
      ipfsMetadata: metadata,

      // Hash values (for blockchain verification)
      courseHash: blockchainService.generateHash(enrollment.course._id.toString()),
      studentHash: blockchainService.generateHash(enrollment.user._id.toString()),
      evaluationHash: blockchainService.generateHash(enrollment.finalEvaluation.feedback || enrollment.finalEvaluation.details),

      // Transaction information
      transactionHash: mintResult.transactionHash,
      blockNumber: mintResult.blockNumber,
      gasUsed: mintResult.gasUsed,

      // Privacy protection related
      consentGiven: true,
      consentDate: new Date()
    });

    await certificate.save();

    // 5. Update enrollment with certificate reference (basic info only)
    enrollment.certificate = {
      tokenId: mintResult.tokenId,
      transactionHash: mintResult.transactionHash,
      mintedAt: new Date(),
      claimed: false,
      claimToken: crypto.randomBytes(32).toString('hex')
    };

    await enrollment.save();

    // Send NFT claim email
    try {
      await authService.sendNFTClaimEmail(
        enrollment.user.email,
        {
          ...certificateData,
          tokenId: mintResult.tokenId,
          claimToken,
          score: enrollment.finalEvaluation.score
        }
      );
    } catch (emailError) {
      logger.error('Failed to send NFT claim email:', emailError);
      // Don't fail the whole operation if email fails
    }

    res.json({
      success: true,
      message: 'Certificate minted successfully. Check your email for claiming instructions.',
      data: {
        certificate: {
          tokenId: mintResult.tokenId,
          transactionHash: mintResult.transactionHash,
          ipfsHash: ipfsResult.hash,
          claimToken
        }
      }
    });
  } catch (error) {
    logger.error('Certificate minting error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mint certificate'
    });
  }
};

// Claim NFT certificate (email-based claiming)
const claimCertificate = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Claim token is required'
      });
    }

    // Find enrollment with this claim token
    const enrollment = await Enrollment.findOne({
      'certificate.claimToken': token,
      'certificate.claimed': false
    }).populate('course').populate('user');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired claim token'
      });
    }

    // Mark certificate as claimed
    enrollment.certificate.claimed = true;
    enrollment.certificate.claimedAt = new Date();
    await enrollment.save();

    res.json({
      success: true,
      message: 'Certificate claimed successfully',
      data: {
        certificate: {
          tokenId: enrollment.certificate.tokenId,
          courseName: enrollment.course.title,
          studentName: enrollment.user.name,
          completionDate: enrollment.completedAt,
          transactionHash: enrollment.certificate.transactionHash
        }
      }
    });
  } catch (error) {
    logger.error('Certificate claiming error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim certificate'
    });
  }
};

// Get user's certificates
const getUserCertificates = async (req, res) => {
  try {
    const userId = req.user._id;

    const enrollments = await Enrollment.find({
      user: userId,
      'certificate.tokenId': { $exists: true }
    })
    .populate('course', 'title description category level')
    .select('certificate course completedAt finalEvaluation.score')
    .sort({ 'certificate.mintedAt': -1 });

    const certificates = enrollments.map(enrollment => ({
      tokenId: enrollment.certificate.tokenId,
      course: enrollment.course,
      completionDate: enrollment.completedAt,
      score: enrollment.finalEvaluation.score,
      mintedAt: enrollment.certificate.mintedAt,
      claimed: enrollment.certificate.claimed,
      claimedAt: enrollment.certificate.claimedAt,
      transactionHash: enrollment.certificate.transactionHash,
      ipfsHash: enrollment.certificate.ipfsHash
    }));

    res.json({
      success: true,
      data: { certificates }
    });
  } catch (error) {
    logger.error('Get user certificates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificates'
    });
  }
};

// Get certificate by token ID
const getCertificate = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?._id?.toString();

    // 1. Get basic information from blockchain (hash + public info)
    const blockchainData = await blockchainService.getCertificate(tokenId);

    if (!blockchainData) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // 2. Get sensitive information from Certificate model (based on permissions)
    const certificate = await Certificate.findOne({ tokenId: tokenId });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate data not found'
      });
    }

    // 3. Check permissions and filter data
    const isOwner = certificate.recipientId.toString() === userId;
    const isIssuer = certificate.issuerId.toString() === userId;
    const isAdmin = req.user?.role === 'admin';

    let responseData;

    if (isOwner || isIssuer || isAdmin) {
      // Owner, issuer, admin can access all information
      responseData = {
        ...blockchainData,
        // Add sensitive data
        studentName: certificate.studentName,
        studentEmail: certificate.studentEmail,
        courseName: certificate.courseName,
        aiScore: certificate.aiScore,
        aiEvaluation: certificate.aiEvaluation,
        issuerName: certificate.issuerName,
        completionDate: certificate.ipfsMetadata?.completionDate,
        issuedAt: certificate.ipfsMetadata?.issuedAt,
        courseDescription: certificate.ipfsMetadata?.courseDescription
      };
    } else {
      // External users can only see hash information
      responseData = {
        ...blockchainData,
        // Exclude sensitive data
        message: 'Sensitive personal information can only be viewed by the certificate owner.'
      };
    }

    // Add common information
    responseData.verificationUrl = `${process.env.FRONTEND_URL}/verify/${tokenId}`;
    responseData.blockchainExplorerUrl = `https://polygonscan.com/token/${certificate.contractAddress}?a=${tokenId}`;

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    logger.error('Certificate retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Certificate retrieval failed',
      error: error.message
    });
  }
};

// Verify certificate
const verifyCertificate = async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Get data from blockchain
    const verification = await blockchainService.verifyCertificate(
      tokenId,
      req.query.ownerAddress // Optional owner address for verification
    );

    // Also check database for additional metadata
    const enrollment = await Enrollment.findOne({
      'certificate.tokenId': tokenId
    })
    .populate('course', 'title instructor')
    .populate('user', 'name email')
    .select('completedAt finalEvaluation.score certificate.mintedAt');

    const response = {
      tokenId,
      isValid: verification.isValid,
      owner: verification.owner,
      isVerified: verification.isVerified,
      blockchainVerified: verification.isValid
    };

    if (enrollment) {
      response.databaseVerified = true;
      response.metadata = {
        courseName: enrollment.course.title,
        studentName: enrollment.user.name,
        studentEmail: enrollment.user.email,
        instructorName: enrollment.course.instructor?.name,
        completionDate: enrollment.completedAt,
        score: enrollment.finalEvaluation.score,
        mintedAt: enrollment.certificate.mintedAt
      };
    } else {
      response.databaseVerified = false;
    }

    res.json({
      success: true,
      data: { verification: response }
    });
  } catch (error) {
    logger.error('Certificate verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify certificate'
    });
  }
};

// Get certificate statistics
const getCertificateStats = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'admin' && user.role !== 'instructor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const totalCertificates = await Enrollment.countDocuments({
      'certificate.tokenId': { $exists: true }
    });

    const claimedCertificates = await Enrollment.countDocuments({
      'certificate.claimed': true
    });

    const unclaimedCertificates = totalCertificates - claimedCertificates;

    // Get recent certificates
    const recentCertificates = await Enrollment.find({
      'certificate.tokenId': { $exists: true }
    })
    .populate('course', 'title')
    .populate('user', 'name email')
    .select('certificate course user completedAt')
    .sort({ 'certificate.mintedAt': -1 })
    .limit(10);

    res.json({
      success: true,
      data: {
        stats: {
          totalCertificates,
          claimedCertificates,
          unclaimedCertificates,
          claimRate: totalCertificates > 0 ? Math.round((claimedCertificates / totalCertificates) * 100) : 0
        },
        recentCertificates: recentCertificates.map(cert => ({
          tokenId: cert.certificate.tokenId,
          courseName: cert.course.title,
          studentName: cert.user.name,
          studentEmail: cert.user.email,
          mintedAt: cert.certificate.mintedAt,
          claimed: cert.certificate.claimed
        }))
      }
    });
  } catch (error) {
    logger.error('Get certificate stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get certificate statistics'
    });
  }
};

module.exports = {
  mintCertificate,
  claimCertificate,
  getUserCertificates,
  getCertificate,
  verifyCertificate,
  getCertificateStats
};
