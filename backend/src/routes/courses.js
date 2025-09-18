const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const courseController = require('../controllers/courseController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: Get all courses with filtering and pagination
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
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
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [technical, business, soft-skills, compliance, leadership]
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 */
router.get('/', authenticate, courseController.getCourses);

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course retrieved successfully
 *       404:
 *         description: Course not found
 */
router.get('/:id', authenticate, [
  param('id').isMongoId()
], courseController.getCourse);

/**
 * @swagger
 * /courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               shortDescription:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [technical, business, soft-skills, compliance, leadership]
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *               modules:
 *                 type: array
 *                 items:
 *                   type: object
 *               evaluationCriteria:
 *                 type: object
 *               nftTemplate:
 *                 type: object
 *               duration:
 *                 type: number
 *               maxStudents:
 *                 type: number
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Course created successfully
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authenticate, authorize('instructor', 'admin'), [
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('description').trim().isLength({ min: 10 }),
  body('shortDescription').optional().trim().isLength({ max: 200 }),
  body('category').optional().isIn(['technical', 'business', 'soft-skills', 'compliance', 'leadership']),
  body('level').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('duration').optional().isInt({ min: 0 }),
  body('maxStudents').optional().isInt({ min: 0 }),
  body('tags').optional().isArray()
], courseController.createCourse);

/**
 * @swagger
 * /courses/{id}:
 *   put:
 *     summary: Update course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               shortDescription:
 *                 type: string
 *               category:
 *                 type: string
 *               level:
 *                 type: string
 *               modules:
 *                 type: array
 *               nftTemplate:
 *                 type: object
 *               duration:
 *                 type: number
 *               maxStudents:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               isPublished:
 *                 type: boolean
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.put('/:id', authenticate, [
  param('id').isMongoId(),
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ min: 10 }),
  body('shortDescription').optional().trim().isLength({ max: 200 }),
  body('category').optional().isIn(['technical', 'business', 'soft-skills', 'compliance', 'leadership']),
  body('level').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('duration').optional().isInt({ min: 0 }),
  body('maxStudents').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
  body('isPublished').optional().isBoolean(),
  body('tags').optional().isArray()
], courseController.updateCourse);

/**
 * @swagger
 * /courses/{id}:
 *   delete:
 *     summary: Delete course (soft delete)
 *     tags: [Courses]
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
 *         description: Course deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.delete('/:id', authenticate, [
  param('id').isMongoId()
], courseController.deleteCourse);

/**
 * @swagger
 * /courses/{id}/stats:
 *   get:
 *     summary: Get course statistics
 *     tags: [Courses]
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
 *         description: Course statistics retrieved
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.get('/:id/stats', authenticate, [
  param('id').isMongoId()
], courseController.getCourseStats);

/**
 * @swagger
 * /courses/instructor/{instructorId}:
 *   get:
 *     summary: Get courses by instructor
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instructorId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Instructor courses retrieved
 */
router.get('/instructor/:instructorId', authenticate, [
  param('instructorId').optional().isMongoId()
], courseController.getInstructorCourses);

module.exports = router;
