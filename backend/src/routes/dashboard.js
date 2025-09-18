const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Company = require('../models/Company');

/**
 * @swagger
 * /dashboard/analytics:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved
 */
router.get('/analytics', authenticate, authorize('admin', 'instructor'), async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    // If instructor, only show their courses
    if (user.role === 'instructor') {
      filter.instructor = user._id;
    }

    // Basic statistics
    const totalCourses = await Course.countDocuments(filter);
    const activeCourses = await Course.countDocuments({ ...filter, isActive: true });
    const totalEnrollments = await Enrollment.countDocuments(
      user.role === 'instructor'
        ? { course: { $in: await Course.find(filter).distinct('_id') } }
        : {}
    );
    const completedEnrollments = await Enrollment.countDocuments({
      ...(user.role === 'instructor'
        ? { course: { $in: await Course.find(filter).distinct('_id') } }
        : {}
      ),
      status: 'completed'
    });
    const totalCertificates = await Enrollment.countDocuments({
      ...(user.role === 'instructor'
        ? { course: { $in: await Course.find(filter).distinct('_id') } }
        : {}
      ),
      'certificate.tokenId': { $exists: true }
    });

    // Recent enrollments
    const recentEnrollments = await Enrollment.find(
      user.role === 'instructor'
        ? { course: { $in: await Course.find(filter).distinct('_id') } }
        : {}
    )
    .populate('user', 'name email')
    .populate('course', 'title')
    .sort({ enrolledAt: -1 })
    .limit(10)
    .select('enrolledAt status course user');

    // Course performance
    const coursePerformance = await Enrollment.aggregate([
      {
        $match: user.role === 'instructor'
          ? { course: { $in: await Course.find(filter).distinct('_id') } }
          : {}
      },
      {
        $group: {
          _id: '$course',
          totalEnrollments: { $sum: 1 },
          completedEnrollments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          averageScore: { $avg: '$finalEvaluation.score' }
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'course'
        }
      },
      {
        $unwind: '$course'
      },
      {
        $project: {
          courseTitle: '$course.title',
          totalEnrollments: 1,
          completedEnrollments: 1,
          completionRate: {
            $multiply: [
              { $divide: ['$completedEnrollments', '$totalEnrollments'] },
              100
            ]
          },
          averageScore: { $round: ['$averageScore', 1] }
        }
      },
      { $sort: { totalEnrollments: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalCourses,
          activeCourses,
          totalEnrollments,
          completedEnrollments,
          totalCertificates,
          completionRate: totalEnrollments > 0
            ? Math.round((completedEnrollments / totalEnrollments) * 100)
            : 0
        },
        recentEnrollments: recentEnrollments.map(enrollment => ({
          id: enrollment._id,
          studentName: enrollment.user.name,
          studentEmail: enrollment.user.email,
          courseTitle: enrollment.course.title,
          enrolledAt: enrollment.enrolledAt,
          status: enrollment.status
        })),
        coursePerformance
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard analytics'
    });
  }
});

module.exports = router;
