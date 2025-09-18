const Course = require('../models/Course');
const User = require('../models/User');
const Company = require('../models/Company');
const Enrollment = require('../models/Enrollment');
const logger = require('../utils/logger');

// Get all courses with filtering and pagination
const getCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      level,
      instructor,
      company,
      isActive = true,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { isActive };

    if (category) filter.category = category;
    if (level) filter.level = level;
    if (instructor) filter.instructor = instructor;
    if (company) filter.company = company;

    // Add search functionality
    if (search) {
      filter.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const courses = await Course.find(filter)
      .populate('instructor', 'name email')
      .populate('company', 'name')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-evaluationCriteria.questions.correctAnswer'); // Don't expose correct answers

    // Get total count for pagination
    const total = await Course.countDocuments(filter);

    res.json({
      success: true,
      data: {
        courses,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalCourses: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve courses'
    });
  }
};

// Get single course by ID
const getCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findById(id)
      .populate('instructor', 'name email department')
      .populate('company', 'name domain')
      .populate('prerequisites', 'title level');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user has access to this course
    if (req.user && req.user.role !== 'admin') {
      // Allow access if user is instructor of the course or belongs to the company
      const hasAccess = course.instructor._id.toString() === req.user._id.toString() ||
                       course.company._id.toString() === req.user.company.toString();

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Get enrollment info if user is authenticated
    let enrollment = null;
    if (req.user) {
      enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: id
      }).select('status progress.overallProgress completedAt certificate');
    }

    res.json({
      success: true,
      data: {
        course,
        enrollment
      }
    });
  } catch (error) {
    logger.error('Get course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve course'
    });
  }
};

// Create new course
const createCourse = async (req, res) => {
  try {
    const courseData = req.body;
    const instructor = req.user;

    // Validate instructor permissions
    if (instructor.role !== 'instructor' && instructor.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only instructors and admins can create courses'
      });
    }

    // Set instructor and company
    courseData.instructor = instructor._id;
    courseData.company = instructor.company;

    // Validate evaluation criteria
    if (courseData.evaluationCriteria) {
      const { passingScore, maxAttempts } = courseData.evaluationCriteria;

      if (passingScore < 0 || passingScore > 100) {
        return res.status(400).json({
          success: false,
          message: 'Passing score must be between 0 and 100'
        });
      }

      if (maxAttempts < 1) {
        return res.status(400).json({
          success: false,
          message: 'Maximum attempts must be at least 1'
        });
      }
    }

    const course = new Course(courseData);
    await course.save();

    // Populate instructor and company info
    await course.populate('instructor', 'name email');
    await course.populate('company', 'name');

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: { course }
    });
  } catch (error) {
    logger.error('Create course error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create course'
    });
  }
};

// Update course
const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const user = req.user;

    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check permissions
    const isInstructor = course.instructor.toString() === user._id.toString();
    const isAdmin = user.role === 'admin';

    if (!isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Prevent certain fields from being updated if course has enrollments
    const enrollmentCount = await Enrollment.countDocuments({ course: id });
    if (enrollmentCount > 0) {
      const restrictedFields = ['evaluationCriteria', 'prerequisites'];
      restrictedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          delete updateData[field];
        }
      });
    }

    // Update course
    Object.assign(course, updateData);
    await course.save();

    // Populate updated course
    await course.populate('instructor', 'name email');
    await course.populate('company', 'name');

    res.json({
      success: true,
      message: 'Course updated successfully',
      data: { course }
    });
  } catch (error) {
    logger.error('Update course error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update course'
    });
  }
};

// Delete course
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check permissions
    const isInstructor = course.instructor.toString() === user._id.toString();
    const isAdmin = user.role === 'admin';

    if (!isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if course has active enrollments
    const activeEnrollments = await Enrollment.countDocuments({
      course: id,
      status: { $in: ['enrolled', 'in-progress'] }
    });

    if (activeEnrollments > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete course with active enrollments'
      });
    }

    // Soft delete by setting isActive to false
    course.isActive = false;
    await course.save();

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    logger.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete course'
    });
  }
};

// Get course statistics
const getCourseStats = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' &&
        course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get enrollment statistics
    const enrollments = await Enrollment.find({ course: id });

    const stats = {
      totalEnrollments: enrollments.length,
      activeEnrollments: enrollments.filter(e => e.status === 'in-progress').length,
      completedEnrollments: enrollments.filter(e => e.status === 'completed').length,
      averageProgress: enrollments.length > 0
        ? enrollments.reduce((sum, e) => sum + (e.progress?.overallProgress || 0), 0) / enrollments.length
        : 0,
      averageCompletionTime: enrollments
        .filter(e => e.completedAt)
        .reduce((sum, e) => {
          const timeSpent = e.progress?.timeSpent || 0;
          return sum + timeSpent;
        }, 0) / enrollments.filter(e => e.completedAt).length || 0,
      certificatesIssued: enrollments.filter(e => e.certificate?.tokenId).length
    };

    res.json({
      success: true,
      data: {
        course: {
          id: course._id,
          title: course.title,
          category: course.category,
          level: course.level
        },
        stats
      }
    });
  } catch (error) {
    logger.error('Get course stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course statistics'
    });
  }
};

// Get courses by instructor
const getInstructorCourses = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.user._id;

    const courses = await Course.find({
      instructor: instructorId,
      isActive: true
    })
    .populate('company', 'name')
    .sort({ createdAt: -1 });

    // Add enrollment count for each course
    const coursesWithStats = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({ course: course._id });
        const completionCount = await Enrollment.countDocuments({
          course: course._id,
          status: 'completed'
        });

        return {
          ...course.toObject(),
          enrollmentCount,
          completionCount,
          completionRate: enrollmentCount > 0 ? (completionCount / enrollmentCount) * 100 : 0
        };
      })
    );

    res.json({
      success: true,
      data: { courses: coursesWithStats }
    });
  } catch (error) {
    logger.error('Get instructor courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve instructor courses'
    });
  }
};

module.exports = {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseStats,
  getInstructorCourses
};
