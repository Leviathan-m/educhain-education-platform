const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const enrollmentController = require('../controllers/enrollmentController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @swagger
 * /enrollments:
 *   post:
 *     summary: Enroll in a course
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Successfully enrolled
 *       400:
 *         description: Already enrolled or course full
 */
router.post('/', authenticate, [
  body('courseId').isMongoId()
], enrollmentController.enrollInCourse);

/**
 * @swagger
 * /enrollments:
 *   get:
 *     summary: Get user's enrollments
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [enrolled, in-progress, completed, dropped, expired]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Enrollments retrieved successfully
 */
router.get('/', authenticate, enrollmentController.getUserEnrollments);

/**
 * @swagger
 * /enrollments/{id}:
 *   get:
 *     summary: Get enrollment by ID
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Enrollment retrieved successfully
 *       404:
 *         description: Enrollment not found
 */
router.get('/:id', authenticate, [
  param('id').isMongoId()
], enrollmentController.getEnrollment);

/**
 * @swagger
 * /enrollments/{id}/progress:
 *   put:
 *     summary: Update enrollment progress
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - moduleId
 *             properties:
 *               moduleId:
 *                 type: string
 *               completed:
 *                 type: boolean
 *               timeSpent:
 *                 type: number
 *     responses:
 *       200:
 *         description: Progress updated successfully
 *       403:
 *         description: Access denied
 */
router.put('/:id/progress', authenticate, [
  param('id').isMongoId(),
  body('moduleId').isMongoId(),
  body('completed').optional().isBoolean(),
  body('timeSpent').optional().isInt({ min: 0 })
], enrollmentController.updateProgress);

/**
 * @swagger
 * /enrollments/{id}/evaluation:
 *   post:
 *     summary: Submit course evaluation/quiz
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: string
 *               timeSpent:
 *                 type: number
 *     responses:
 *       200:
 *         description: Evaluation submitted successfully
 *       400:
 *         description: Invalid submission or attempts exceeded
 */
router.post('/:id/evaluation', authenticate, [
  param('id').isMongoId(),
  body('answers').isArray(),
  body('timeSpent').optional().isInt({ min: 0 })
], enrollmentController.submitEvaluation);

/**
 * @swagger
 * /enrollments/course/{courseId}:
 *   get:
 *     summary: Get enrollments for a course (instructors/admins only)
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course enrollments retrieved
 *       403:
 *         description: Access denied
 */
router.get('/course/:courseId', authenticate, authorize('instructor', 'admin'), [
  param('courseId').isMongoId()
], enrollmentController.getCourseEnrollments);

/**
 * @swagger
 * /enrollments/{id}/withdraw:
 *   post:
 *     summary: Withdraw from course
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully withdrawn
 *       400:
 *         description: Cannot withdraw from completed course
 */
router.post('/:id/withdraw', authenticate, [
  param('id').isMongoId()
], enrollmentController.withdrawFromCourse);

module.exports = router;
