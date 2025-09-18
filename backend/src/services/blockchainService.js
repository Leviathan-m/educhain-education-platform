const { ethers } = require('ethers');
const crypto = require('crypto');
const logger = require('../utils/logger');

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.contractAddress = process.env.CONTRACT_ADDRESS;
    // Enhanced EducationNFT contract ABI with privacy protection
    this.contractABI = [
      // Enhanced privacy-focused functions
      "function mintCredential(address to, string memory courseHash, string memory studentHash, string memory evaluationHash, string memory ipfsMetadata, uint8 credentialType, bool isSoulbound, uint256 validUntil, bytes32 zkProof) external returns (uint256)",
      "function getCredential(uint256 tokenId) public view returns (tuple(string courseHash, string studentHash, uint256 completionDate, string evaluationHash, string ipfsMetadata, uint8 credentialType, bool isRevocable, bool isSoulbound, address issuer, uint256 validUntil, bytes32 zkProof, bool isVerified))",
      "function verifyCredential(uint256 tokenId) public view returns (bool)",
      "function ownerOf(uint256 tokenId) public view returns (address)",
      "function transferFrom(address from, address to, uint256 tokenId) public",
      "function totalSupply() public view returns (uint256)",
      "function revokeCredential(uint256 tokenId) external onlyRole(keccak256(\"VERIFIER_ROLE\"))",
      "event CredentialMinted(uint256 indexed tokenId, address indexed to, string courseHash, uint8 credentialType)"
    ];

    this.initializeProvider();
  }

  // Privacy protection utilities
  generateHash(data) {
    return crypto.createHash('sha256').update(String(data)).digest('hex');
  }

  generateCompositeHash(...data) {
    const combined = data.join('|');
    return this.generateHash(combined);
  }

  // Generate zero-knowledge proof placeholder (for future implementation)
  generateZKProof(data) {
    // Placeholder for ZK proof generation
    // In production, this would use actual ZK proof library
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 32);
  }

  // Initialize blockchain provider
  initializeProvider() {
    try {
      const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // Initialize signer with service wallet
      const privateKey = process.env.SERVICE_PRIVATE_KEY;
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
        logger.info('Blockchain service initialized with signer');
      } else {
        logger.warn('SERVICE_PRIVATE_KEY not provided - read-only mode');
      }

      // Initialize contract
      if (this.contractAddress) {
        this.contract = new ethers.Contract(
          this.contractAddress,
          this.contractABI,
          this.signer || this.provider
        );
        logger.info(`Contract initialized at ${this.contractAddress}`);
      }
    } catch (error) {
      logger.error('Blockchain provider initialization error:', error);
    }
  }

  // Mint NFT certificate with enhanced privacy protection
  async mintCertificate(certificateData) {
    try {
      if (!this.contract || !this.signer) {
        throw new Error('Contract not initialized or no signer available');
      }

      const {
        recipientAddress,
        courseId,        // Course ID (for hash generation)
        courseName,     // Course name (stored off-chain)
        userId,         // User ID (for hash generation)
        studentName,    // Student name (stored off-chain)
        studentEmail,   // Student email (stored off-chain)
        completionDate,
        aiEvaluation,   // AI evaluation result
        aiScore,        // AI score
        credentialType = 1, // 1:Certificate, 2:Badge, 3:Diploma
        isSoulbound = false,
        validUntil = 0    // 0 = permanent
      } = certificateData;

      // Privacy protection: Generate hashes instead of sensitive data
      const courseHash = this.generateHash(courseId || courseName);
      const studentHash = this.generateHash(userId);
      const evaluationHash = this.generateHash(aiEvaluation || aiScore);

      // Generate Zero Knowledge Proof (for future implementation)
      const zkProof = this.generateZKProof({
        courseCompleted: true,
        evaluationValid: true,
        issuerAuthorized: true
      });

      // Prepare IPFS metadata (sensitive data stored in IPFS, only CID on blockchain)
      let ipfsMetadata = certificateData.ipfsHash || '';

      // Handle sensitive metadata separately if provided
      if (certificateData.metadata) {
        // Upload metadata via IPFS service
        const ipfsService = require('./ipfsService');
        const metadataResult = await ipfsService.uploadMetadata({
          courseName: courseName,
          studentName: studentName,
          studentEmail: studentEmail,
          aiScore: aiScore,
          aiEvaluation: aiEvaluation,
          completionDate: completionDate.toISOString(),
          issuedAt: new Date().toISOString()
        });
        ipfsMetadata = metadataResult.hash;
      }

      logger.info(`Minting privacy-protected certificate for user ${userId} - course ${courseId}`);

      // Estimate gas for enhanced contract
      const gasEstimate = await this.contract.mintCredential.estimateGas(
        recipientAddress,
        courseHash,
        studentHash,
        evaluationHash,
        ipfsMetadata,
        credentialType,
        isSoulbound,
        validUntil,
        zkProof
      );

      // Add 20% buffer to gas estimate
      const gasLimit = Math.ceil(gasEstimate * 1.2);

      // Send transaction with privacy protection
      const tx = await this.contract.mintCredential(
        recipientAddress,
        courseHash,
        studentHash,
        evaluationHash,
        ipfsMetadata,
        credentialType,
        isSoulbound,
        validUntil,
        zkProof,
        { gasLimit }
      );

      logger.info(`Privacy-protected transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      // Extract token ID from events
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed.name === 'CertificateMinted';
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error('CertificateMinted event not found in transaction receipt');
      }

      const tokenId = event.args.tokenId.toString();

      logger.info(`Certificate minted successfully. Token ID: ${tokenId}`);

      return {
        tokenId,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('Certificate minting error:', error);
      throw new Error(`Failed to mint certificate: ${error.message}`);
    }
  }

  // Get certificate details with privacy protection
  async getCertificate(tokenId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const credential = await this.contract.getCredential(tokenId);

      // Return only basic hash information (sensitive personal data requires separate permissions)
      const result = {
        tokenId: tokenId,
        courseHash: credential[0],
        studentHash: credential[1],
        completionDate: new Date(credential[2] * 1000), // Convert from Unix timestamp
        evaluationHash: credential[3],
        ipfsMetadata: credential[4], // IPFS CID for additional metadata
        credentialType: credential[5],
        isRevocable: credential[6],
        isSoulbound: credential[7],
        issuer: credential[8],
        validUntil: credential[9] > 0 ? new Date(credential[9] * 1000) : null,
        zkProof: credential[10],
        isVerified: credential[11],
        isValid: credential[9] === 0 || credential[9] > Math.floor(Date.now() / 1000)
      };

      // IPFS 메타데이터가 있다면 추가 정보 조회 (선택적)
      if (result.ipfsMetadata && result.ipfsMetadata !== '') {
        try {
          const ipfsService = require('./ipfsService');
          const metadata = await ipfsService.getContent(result.ipfsMetadata);
          result.metadata = metadata; // Sensitive data accessible only with separate permissions
        } catch (ipfsError) {
          logger.warn(`Failed to fetch IPFS metadata for token ${tokenId}:`, ipfsError.message);
        }
      }

      return result;
    } catch (error) {
      logger.error(`Credential retrieval error for token ${tokenId}:`, error);
      throw new Error(`Failed to get credential: ${error.message}`);
    }
  }

  // Get certificate with full details (관리자용 또는 소유자용)
  async getCertificateWithDetails(tokenId, userId = null) {
    const credential = await this.getCertificate(tokenId);

    // Permission check: Return sensitive data only for owners or administrators
    if (userId) {
      try {
        const owner = await this.contract.ownerOf(tokenId);
        const signerAddress = this.signer ? await this.signer.getAddress() : null;

        if (owner.toLowerCase() === userId.toLowerCase() ||
            (signerAddress && signerAddress.toLowerCase() === userId.toLowerCase())) {

          // Retrieve sensitive information from off-chain database
          const Certificate = require('../models/Certificate');
          const certData = await Certificate.findOne({ tokenId: tokenId });

          if (certData) {
            return {
              ...credential,
              courseName: certData.courseName,
              studentName: certData.studentName,
              studentEmail: certData.studentEmail,
              aiScore: certData.aiScore,
              aiEvaluation: certData.aiEvaluation
            };
          }
        }
      } catch (dbError) {
        logger.warn(`Failed to fetch certificate details for token ${tokenId}:`, dbError.message);
      }
    }

    // Return only hash information for unauthorized access
    return credential;
  }

  // Verify certificate ownership
  async verifyCertificate(tokenId, expectedOwner) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const owner = await this.contract.ownerOf(tokenId);
      const isVerified = await this.contract.verifyCertificate(tokenId);

      return {
        isValid: isVerified && owner.toLowerCase() === expectedOwner.toLowerCase(),
        owner: owner,
        isVerified: isVerified
      };
    } catch (error) {
      logger.error(`Certificate verification error for token ${tokenId}:`, error);
      return {
        isValid: false,
        owner: null,
        isVerified: false,
        error: error.message
      };
    }
  }

  // Transfer certificate
  async transferCertificate(from, to, tokenId) {
    try {
      if (!this.contract || !this.signer) {
        throw new Error('Contract not initialized or no signer available');
      }

      const tx = await this.contract.transferFrom(from, to, tokenId);
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error(`Certificate transfer error for token ${tokenId}:`, error);
      throw new Error(`Failed to transfer certificate: ${error.message}`);
    }
  }

  // Get transaction status
  async getTransactionStatus(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        return { status: 'not_found' };
      }

      const receipt = await this.provider.getTransactionReceipt(txHash);

      return {
        status: receipt ? 'confirmed' : 'pending',
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString(),
        confirmations: receipt ? await this.provider.getBlockNumber() - receipt.blockNumber : 0
      };
    } catch (error) {
      logger.error(`Transaction status check error for ${txHash}:`, error);
      return { status: 'error', error: error.message };
    }
  }

  // Get gas price
  async getGasPrice() {
    try {
      const gasPrice = await this.provider.getFeeData();
      return {
        gasPrice: gasPrice.gasPrice.toString(),
        maxFeePerGas: gasPrice.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas?.toString()
      };
    } catch (error) {
      logger.error('Gas price retrieval error:', error);
      throw new Error('Failed to get gas price');
    }
  }

  // Get network info
  async getNetworkInfo() {
    try {
      const network = await this.provider.getNetwork();
      const blockNumber = await this.provider.getBlockNumber();

      return {
        chainId: network.chainId,
        name: network.name,
        blockNumber,
        contractAddress: this.contractAddress
      };
    } catch (error) {
      logger.error('Network info retrieval error:', error);
      throw new Error('Failed to get network info');
    }
  }
}

module.exports = new BlockchainService();
