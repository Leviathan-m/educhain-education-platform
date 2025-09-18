const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const certificateController = require('../controllers/certificateController');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');

/**
 * @swagger
 * /certificates/mint:
 *   post:
 *     summary: Mint NFT certificate for completed course
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enrollmentId
 *             properties:
 *               enrollmentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Certificate minted successfully
 *       400:
 *         description: Course not completed or certificate already exists
 */
router.post('/mint', authenticate, [
  body('enrollmentId').isMongoId()
], certificateController.mintCertificate);

/**
 * @swagger
 * /certificates/claim:
 *   post:
 *     summary: Claim NFT certificate using email token
 *     tags: [Certificates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Certificate claimed successfully
 *       404:
 *         description: Invalid claim token
 */
router.post('/claim', [
  body('token').isLength({ min: 1 })
], certificateController.claimCertificate);

/**
 * @swagger
 * /certificates:
 *   get:
 *     summary: Get user's certificates
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certificates retrieved successfully
 */
router.get('/', authenticate, certificateController.getUserCertificates);

/**
 * @swagger
 * /certificates/{tokenId}:
 *   get:
 *     summary: Get certificate by token ID
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate retrieved successfully
 *       404:
 *         description: Certificate not found
 */
router.get('/:tokenId', optionalAuth, [
  param('tokenId').isLength({ min: 1 })
], certificateController.getCertificate);

/**
 * @swagger
 * /certificates/{tokenId}/verify:
 *   get:
 *     summary: Verify certificate authenticity
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: ownerAddress
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate verification result
 */
router.get('/:tokenId/verify', [
  param('tokenId').isLength({ min: 1 }),
  query('ownerAddress').optional().isEthereumAddress()
], certificateController.verifyCertificate);

/**
 * @swagger
 * /certificates/stats:
 *   get:
 *     summary: Get certificate statistics (admins/instructors only)
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certificate statistics retrieved
 *       403:
 *         description: Access denied
 */
router.get('/stats/overview', authenticate, authorize('instructor', 'admin'), certificateController.getCertificateStats);

module.exports = router;
