// const { create } = require('ipfs-http-client'); // 임시 비활성화
const logger = require('../utils/logger');

class IPFSService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  // Initialize IPFS client
  initializeClient() {
    // Mock IPFS client for testing - 실제 구현에서는 IPFS 연결
    this.client = null;
    logger.info('IPFS client initialized (mock mode for testing)');
  }

  // Upload JSON metadata to IPFS
  async uploadMetadata(metadata) {
    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      // Convert metadata to JSON string
      const metadataString = JSON.stringify(metadata, null, 2);

      // Add to IPFS
      const result = await this.client.add({
        content: metadataString
      });

      const ipfsHash = result.cid.toString();
      logger.info(`Metadata uploaded to IPFS: ${ipfsHash}`);

      return {
        hash: ipfsHash,
        url: `https://ipfs.io/ipfs/${ipfsHash}`,
        size: result.size
      };
    } catch (error) {
      logger.error('IPFS metadata upload error:', error);

      // Fallback: return a placeholder hash for development
      if (process.env.NODE_ENV === 'development') {
        const fallbackHash = `fallback_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        logger.warn(`Using fallback IPFS hash: ${fallbackHash}`);
        return {
          hash: fallbackHash,
          url: `https://example.com/metadata/${fallbackHash}`,
          size: metadataString ? metadataString.length : 0
        };
      }

      throw new Error(`Failed to upload metadata to IPFS: ${error.message}`);
    }
  }

  // Upload image to IPFS
  async uploadImage(imageBuffer, filename) {
    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      const result = await this.client.add({
        content: imageBuffer,
        path: filename
      });

      const ipfsHash = result.cid.toString();
      logger.info(`Image uploaded to IPFS: ${ipfsHash}`);

      return {
        hash: ipfsHash,
        url: `https://ipfs.io/ipfs/${ipfsHash}`,
        size: result.size
      };
    } catch (error) {
      logger.error('IPFS image upload error:', error);
      throw new Error(`Failed to upload image to IPFS: ${error.message}`);
    }
  }

  // Generate certificate metadata
  generateCertificateMetadata(certificateData) {
    const {
      tokenId,
      courseName,
      studentName,
      studentEmail,
      completionDate,
      aiScore,
      companyName,
      instructorName,
      courseDescription,
      imageUrl = 'https://example.com/default-certificate.png'
    } = certificateData;

    return {
      name: `${courseName} - Certificate of Completion`,
      description: `Official NFT certificate for completing ${courseName} course`,
      image: imageUrl,
      external_url: `${process.env.FRONTEND_URL}/certificates/${tokenId}`,
      attributes: [
        {
          trait_type: 'Course',
          value: courseName
        },
        {
          trait_type: 'Student',
          value: studentName
        },
        {
          trait_type: 'Student Email',
          value: studentEmail
        },
        {
          trait_type: 'Completion Date',
          value: completionDate.toISOString().split('T')[0]
        },
        {
          trait_type: 'AI Score',
          value: aiScore
        },
        {
          trait_type: 'Company',
          value: companyName
        },
        {
          trait_type: 'Instructor',
          value: instructorName
        },
        {
          trait_type: 'Certificate Type',
          value: 'NFT Certificate'
        }
      ],
      properties: {
        course: {
          name: courseName,
          description: courseDescription,
          instructor: instructorName
        },
        student: {
          name: studentName,
          email: studentEmail
        },
        completion: {
          date: completionDate.toISOString(),
          score: aiScore
        },
        issuer: {
          name: companyName,
          type: 'Educational Institution'
        }
      }
    };
  }

  // Get content from IPFS
  async getContent(ipfsHash) {
    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      const chunks = [];
      for await (const chunk of this.client.cat(ipfsHash)) {
        chunks.push(chunk);
      }

      const content = Buffer.concat(chunks);
      return content;
    } catch (error) {
      logger.error(`IPFS content retrieval error for ${ipfsHash}:`, error);
      throw new Error(`Failed to get content from IPFS: ${error.message}`);
    }
  }

  // Pin content to ensure persistence
  async pinContent(ipfsHash) {
    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      await this.client.pin.add(ipfsHash);
      logger.info(`Content pinned: ${ipfsHash}`);

      return true;
    } catch (error) {
      logger.error(`IPFS pinning error for ${ipfsHash}:`, error);
      // Don't throw error - pinning is not critical
      return false;
    }
  }

  // Generate NFT metadata and upload to IPFS
  async createCertificateNFT(certificateData) {
    try {
      // Generate metadata
      const metadata = this.generateCertificateMetadata(certificateData);

      // Upload to IPFS
      const uploadResult = await this.uploadMetadata(metadata);

      // Pin the content for persistence
      await this.pinContent(uploadResult.hash);

      return {
        ...uploadResult,
        metadata
      };
    } catch (error) {
      logger.error('Certificate NFT creation error:', error);
      throw error;
    }
  }

  // Check if IPFS service is available
  isAvailable() {
    return this.client !== null;
  }
}

module.exports = new IPFSService();
