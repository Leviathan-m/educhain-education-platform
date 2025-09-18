const crypto = require('crypto');
const { ethers } = require('ethers');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    // Email transporter setup - default configuration (use environment variables in production)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'mahzzangg@gmail.com',
        pass: process.env.SMTP_PASS || 'dummy-password'
      }
    });

    // Verify transporter (run asynchronously to avoid blocking app startup)
    setTimeout(() => {
      this.transporter.verify((error, success) => {
        if (error) {
          logger.warn('Email transporter verification failed (this is OK for development):', error.message);
        } else {
          logger.info('Email transporter is ready');
        }
      });
    }, 1000); // Verify after 1 second
  }

  // Generate wallet for user
  async generateWallet() {
    try {
      const wallet = ethers.Wallet.createRandom();

      return {
        address: wallet.address,
        privateKey: wallet.privateKey
      };
    } catch (error) {
      logger.error('Wallet generation error:', error);
      throw new Error('Failed to generate wallet');
    }
  }

  // Encrypt private key
  encryptPrivateKey(privateKey) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipher(algorithm, key);
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted: encrypted,
        iv: iv.toString('hex')
      };
    } catch (error) {
      logger.error('Private key encryption error:', error);
      throw new Error('Failed to encrypt private key');
    }
  }

  // Decrypt private key
  decryptPrivateKey(encryptedData, iv) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);

      const decipher = crypto.createDecipher(algorithm, key);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Private key decryption error:', error);
      throw new Error('Failed to decrypt private key');
    }
  }

  // Generate verification token
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Send verification email
  async sendVerificationEmail(email, token) {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

      const mailOptions = {
        from: process.env.SMTP_USER,
        to: email,
        subject: '이메일 인증 - NFT 교육 플랫폼',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>NFT 교육 플랫폼 이메일 인증</h2>
            <p>안녕하세요! NFT 교육 플랫폼에 가입해 주셔서 감사합니다.</p>
            <p>아래 링크를 클릭하여 이메일 주소를 인증해주세요:</p>
            <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">이메일 인증하기</a>
            <p>또는 다음 URL을 브라우저에 복사하여 접속해주세요:</p>
            <p>${verificationUrl}</p>
            <p>이 링크는 24시간 동안 유효합니다.</p>
            <br>
            <p>감사합니다.<br>NFT 교육 플랫폼 팀</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Verification email sent to ${email}`);
    } catch (error) {
      logger.error('Email sending error:', error);
      throw new Error('Failed to send verification email');
    }
  }

  // Send NFT claim email
  async sendNFTClaimEmail(email, certificateData) {
    try {
      const claimUrl = `${process.env.FRONTEND_URL}/claim-nft?token=${certificateData.claimToken}`;

      const mailOptions = {
        from: process.env.SMTP_USER,
        to: email,
        subject: '🎉 교육 과정 수료증 NFT 수령 안내',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🎉 축하합니다!</h2>
            <p><strong>${certificateData.studentName}</strong>님,</p>
            <p><strong>${certificateData.courseName}</strong> 교육 과정을 성공적으로 수료하셨습니다!</p>

            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3>수료 정보</h3>
              <ul>
                <li><strong>과정명:</strong> ${certificateData.courseName}</li>
                <li><strong>최종 점수:</strong> ${certificateData.score}%</li>
                <li><strong>수료일:</strong> ${new Date(certificateData.completionDate).toLocaleDateString('ko-KR')}</li>
                <li><strong>NFT Token ID:</strong> ${certificateData.tokenId}</li>
              </ul>
            </div>

            <p>아래 버튼을 클릭하여 NFT 자격증을 수령하세요:</p>
            <a href="${claimUrl}" style="display: inline-block; padding: 15px 30px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">NFT 자격증 수령하기</a>

            <p style="margin-top: 20px; color: #666;">
              이 링크를 클릭하면 자동으로 귀하의 이메일 주소와 연결된 지갑으로 NFT가 전송됩니다.<br>
              별도의 암호화폐 지갑이 필요하지 않습니다.
            </p>

            <br>
            <p>감사합니다.<br>NFT 교육 플랫폼 팀</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`NFT claim email sent to ${email}`);
    } catch (error) {
      logger.error('NFT claim email sending error:', error);
      throw new Error('Failed to send NFT claim email');
    }
  }

  // Register user with email
  async registerUser(userData) {
    try {
      const { email, name, company, department = '', role = 'student' } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Generate wallet
      const wallet = await this.generateWallet();

      // Encrypt private key
      const encryptedKey = this.encryptPrivateKey(wallet.privateKey);

      // Generate verification token
      const verificationToken = this.generateVerificationToken();

      // Create user
      const user = new User({
        email: email.toLowerCase(),
        name,
        role,
        company,
        department,
        walletAddress: wallet.address,
        encryptedPrivateKey: `${encryptedKey.encrypted}:${encryptedKey.iv}`,
        verificationToken
      });

      await user.save();

      // Send verification email
      await this.sendVerificationEmail(email, verificationToken);

      return {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress
        }
      };
    } catch (error) {
      logger.error('User registration error:', error);
      throw error;
    }
  }

  // Verify email
  async verifyEmail(token) {
    try {
      const user = await User.findOne({ verificationToken: token });

      if (!user) {
        throw new Error('Invalid verification token');
      }

      user.emailVerified = true;
      user.verificationToken = undefined;
      await user.save();

      // Generate JWT token
      const authToken = user.generateAuthToken();

      return {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress
        },
        token: authToken
      };
    } catch (error) {
      logger.error('Email verification error:', error);
      throw error;
    }
  }

  // Login with email (email verification required)
  async loginWithEmail(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      if (!user.emailVerified) {
        throw new Error('Email not verified');
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = user.generateAuthToken();

      return {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress,
          lastLogin: user.lastLogin
        },
        token
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  // Get wallet instance for user
  getUserWallet(user) {
    try {
      const [encrypted, iv] = user.encryptedPrivateKey.split(':');
      const privateKey = this.decryptPrivateKey(encrypted, iv);

      return new ethers.Wallet(privateKey);
    } catch (error) {
      logger.error('Wallet retrieval error:', error);
      throw new Error('Failed to retrieve user wallet');
    }
  }
}

module.exports = new AuthService();
