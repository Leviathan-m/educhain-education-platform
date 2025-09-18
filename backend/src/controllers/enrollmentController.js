const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
// const aiService = require('../services/aiService'); // 임시 비활성화

// Mock AI service for testing
const aiService = {
  evaluateSubmission: async () => ({
    score: 85,
    max_score: 100,
    confidence: 0.8,
    feedback: ['좋은 답변입니다.', '개선할 부분이 있습니다.'],
    analysis: {}
  }),
  trackActivity: async () => ({ success: true }),
  getRealtimeDashboard: async () => ({
    current_score: 85,
    recent_activities: [],
    today_activities: {},
    recent_notifications: []
  })
};
const logger = require('../utils/logger');

// Enroll in a course
const enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user._id;

    // Check if course exists and is active
    const course = await Course.findById(courseId);
    if (!course || !course.isActive || !course.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or not available'
      });
    }

    // Check if user is already enrolled
    const existingEnrollment = await Enrollment.findOne({
      user: userId,
      course: courseId
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Already enrolled in this course'
      });
    }

    // Check course capacity
    if (course.maxStudents > 0) {
      const enrollmentCount = await Enrollment.countDocuments({ course: courseId });
      if (enrollmentCount >= course.maxStudents) {
        return res.status(400).json({
          success: false,
          message: 'Course is full'
        });
      }
    }

    // Create enrollment
    const enrollment = new Enrollment({
      user: userId,
      course: courseId,
      status: 'enrolled'
    });

    await enrollment.save();

    // Update course enrollment count
    await Course.findByIdAndUpdate(courseId, {
      $inc: { totalEnrollments: 1 }
    });

    // Populate enrollment data
    await enrollment.populate('course', 'title description instructor');
    await enrollment.populate('user', 'name email');

    res.status(201).json({
      success: true,
      message: 'Successfully enrolled in course',
      data: { enrollment }
    });
  } catch (error) {
    logger.error('Course enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll in course'
    });
  }
};

// Get user's enrollments
const getUserEnrollments = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { user: userId };
    if (status) filter.status = status;

    const enrollments = await Enrollment.find(filter)
      .populate('course', 'title description category level duration instructor')
      .populate('user', 'name email')
      .sort({ enrolledAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Enrollment.countDocuments(filter);

    res.json({
      success: true,
      data: {
        enrollments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalEnrollments: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Get user enrollments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve enrollments'
    });
  }
};

// Get single enrollment
const getEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const enrollment = await Enrollment.findById(id)
      .populate('course')
      .populate('user', 'name email');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    // Check if user has access to this enrollment
    if (enrollment.user._id.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { enrollment }
    });
  } catch (error) {
    logger.error('Get enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve enrollment'
    });
  }
};

// Update enrollment progress
const updateProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleId, completed, timeSpent } = req.body;
    const userId = req.user._id;

    const enrollment = await Enrollment.findById(id);

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    // Check if user owns this enrollment
    if (enrollment.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update module progress
    const moduleProgress = enrollment.progress.completedModules.find(
      m => m.moduleId.toString() === moduleId
    );

    if (moduleProgress) {
      if (completed && !moduleProgress.completed) {
        moduleProgress.completed = true;
        moduleProgress.completedAt = new Date();
      }
      if (timeSpent) {
        moduleProgress.timeSpent += timeSpent;
      }
      moduleProgress.lastAccessedAt = new Date();
    } else {
      enrollment.progress.completedModules.push({
        moduleId,
        completed: completed || false,
        completedAt: completed ? new Date() : undefined,
        timeSpent: timeSpent || 0,
        lastAccessedAt: new Date()
      });
    }

    // Recalculate overall progress
    const course = await Course.findById(enrollment.course);
    if (course && course.modules) {
      const completedCount = enrollment.progress.completedModules.filter(m => m.completed).length;
      enrollment.progress.overallProgress = Math.round((completedCount / course.modules.length) * 100);
    }

    // Update total time spent
    if (timeSpent) {
      enrollment.progress.timeSpent += timeSpent;
    }

    // Check if course is completed
    if (enrollment.progress.overallProgress === 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
    }

    await enrollment.save();

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: {
        enrollment: {
          id: enrollment._id,
          progress: enrollment.progress,
          status: enrollment.status,
          completedAt: enrollment.completedAt
        }
      }
    });
  } catch (error) {
    logger.error('Update progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update progress'
    });
  }
};

// Submit evaluation/quiz
const submitEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, timeSpent } = req.body;
    const userId = req.user._id;

    const enrollment = await Enrollment.findById(id).populate('course');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    // Check if user owns this enrollment
    if (enrollment.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if user can take evaluation
    if (!enrollment.canTakeEvaluation()) {
      return res.status(400).json({
        success: false,
        message: 'Maximum evaluation attempts exceeded'
      });
    }

    let aiEvaluation = null;
    let percentageScore = 0;
    let evaluationAnswers = [];
    let maxScore = enrollment.course.evaluationCriteria?.max_score || 100;

    // Try AI evaluation first
    try {
      logger.info(`Attempting AI evaluation for enrollment ${id}`);

      // Prepare submission text (combine all answers for essay-type evaluation)
      let submissionText = '';
      if (typeof answers === 'string') {
        // Single essay answer
        submissionText = answers;
      } else if (Array.isArray(answers)) {
        // Multiple choice or short answers - combine for analysis
        submissionText = answers.join(' ');
      }

      // Get AI evaluation
      aiEvaluation = await aiService.evaluateSubmission(
        submissionText,
        enrollment.course._id.toString(),
        enrollment.course.evaluationCriteria || {},
        'essay' // Default to essay evaluation
      );

      percentageScore = Math.round((aiEvaluation.score / aiEvaluation.maxScore) * 100);

      // Create evaluation answers based on AI analysis
      evaluationAnswers = [{
        questionId: 'ai_evaluation',
        answer: submissionText,
        isCorrect: percentageScore >= 70,
        points: aiEvaluation.score,
        aiAnalysis: aiEvaluation.analysis
      }];

      logger.info(`AI evaluation completed: ${percentageScore}%`);

    } catch (aiError) {
      logger.warn('AI evaluation failed, falling back to basic evaluation:', aiError.message);

      // Fallback to basic evaluation
      let totalScore = 0;
      let calculatedMaxScore = 0;

      if (enrollment.course.evaluationCriteria?.questions) {
        enrollment.course.evaluationCriteria.questions.forEach((question, index) => {
          const userAnswer = answers[index];
          const points = question.points || 1;

          calculatedMaxScore += points;

          if (userAnswer && userAnswer.toLowerCase() === question.correctAnswer?.toLowerCase()) {
            totalScore += points;
            evaluationAnswers.push({
              questionId: question._id || index,
              answer: userAnswer,
              isCorrect: true,
              points: points
            });
          } else {
            evaluationAnswers.push({
              questionId: question._id || index,
              answer: userAnswer,
              isCorrect: false,
              points: 0
            });
          }
        });
      }

      percentageScore = calculatedMaxScore > 0 ? Math.round((totalScore / calculatedMaxScore) * 100) : 0;
      maxScore = calculatedMaxScore || maxScore;
    }

    const passingScore = enrollment.course.evaluationCriteria?.passingScore || 70;
    const passed = percentageScore >= passingScore;

    // Create evaluation record
    const evaluation = {
      submittedAt: new Date(),
      answers: evaluationAnswers,
      score: percentageScore,
      status: passed ? 'passed' : 'failed',
      aiEvaluation: aiEvaluation ? {
        score: aiEvaluation.score,
        feedback: aiEvaluation.feedback,
        suggestions: aiEvaluation.aiEvaluation?.suggestions || [],
        evaluatedAt: aiEvaluation.aiEvaluation?.evaluatedAt,
        modelVersion: aiEvaluation.aiEvaluation?.modelVersion,
        confidence: aiEvaluation.confidence,
        analysis: aiEvaluation.aiEvaluation?.analysis || {}
      } : null
    };

    // Update enrollment
    enrollment.evaluations.push(evaluation);
    enrollment.finalEvaluation = {
      submittedAt: new Date(),
      score: percentageScore,
      passed,
      attempts: (enrollment.finalEvaluation?.attempts || 0) + 1,
      feedback: aiEvaluation?.feedback || [],
      aiEvaluation: aiEvaluation?.aiEvaluation || null
    };

    // If passed, mark course as completed
    if (passed && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
    }

    // Update time spent
    if (timeSpent) {
      enrollment.progress.timeSpent += timeSpent;
    }

    await enrollment.save();

    res.json({
      success: true,
      message: 'Evaluation submitted successfully',
      data: {
        evaluation: {
          score: percentageScore,
          passed,
          status: evaluation.status,
          attempts: enrollment.finalEvaluation.attempts,
          feedback: aiEvaluation?.feedback || [],
          aiEvaluation: aiEvaluation ? {
            confidence: aiEvaluation.confidence,
            modelVersion: aiEvaluation.aiEvaluation?.modelVersion,
            suggestions: aiEvaluation.aiEvaluation?.suggestions || []
          } : null
        },
        enrollment: {
          status: enrollment.status,
          completedAt: enrollment.completedAt
        }
      }
    });
  } catch (error) {
    logger.error('Submit evaluation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit evaluation'
    });
  }
};

// Get course enrollments (for instructors/admins)
const getCourseEnrollments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = req.user;

    // Check if user has access to course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const isInstructor = course.instructor.toString() === user._id.toString();
    const isAdmin = user.role === 'admin';

    if (!isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const enrollments = await Enrollment.find({ course: courseId })
      .populate('user', 'name email department')
      .sort({ enrolledAt: -1 });

    res.json({
      success: true,
      data: { enrollments }
    });
  } catch (error) {
    logger.error('Get course enrollments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve course enrollments'
    });
  }
};

// Withdraw from course
const withdrawFromCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const enrollment = await Enrollment.findById(id);

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    // Check if user owns this enrollment
    if (enrollment.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if withdrawal is allowed (not completed or after deadline)
    if (enrollment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw from completed course'
      });
    }

    enrollment.status = 'dropped';
    await enrollment.save();

    // Update course enrollment count
    await Course.findByIdAndUpdate(enrollment.course, {
      $inc: { totalEnrollments: -1 }
    });

    res.json({
      success: true,
      message: 'Successfully withdrawn from course'
    });
  } catch (error) {
    logger.error('Course withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to withdraw from course'
    });
  }
};

module.exports = {
  enrollInCourse,
  getUserEnrollments,
  getEnrollment,
  updateProgress,
  submitEvaluation,
  getCourseEnrollments,
  withdrawFromCourse
};
