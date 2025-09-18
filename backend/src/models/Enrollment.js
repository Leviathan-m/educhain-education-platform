const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  answers: [{
    questionId: String,
    answer: mongoose.Schema.Types.Mixed, // Can be string, array, etc.
    isCorrect: Boolean,
    points: Number
  }],
  score: {
    type: Number,
    min: 0,
    max: 100
  },
  feedback: {
    type: String
  },
  aiEvaluation: {
    score: Number,
    feedback: String,
    suggestions: [String],
    evaluatedAt: Date
  },
  status: {
    type: String,
    enum: ['pending', 'evaluated', 'passed', 'failed'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 1
  }
});

const progressSchema = new mongoose.Schema({
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  timeSpent: {
    type: Number, // in minutes
    default: 0
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  }
});

const enrollmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['enrolled', 'in-progress', 'completed', 'dropped', 'expired'],
    default: 'enrolled'
  },
  progress: {
    currentModule: {
      type: Number,
      default: 0
    },
    completedModules: [progressSchema],
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    timeSpent: {
      type: Number,
      default: 0 // total time in minutes
    }
  },
  evaluations: [evaluationSchema],
  finalEvaluation: {
    submittedAt: Date,
    score: Number,
    passed: Boolean,
    feedback: String,
    aiEvaluation: {
      score: Number,
      feedback: String,
      suggestions: [String],
      evaluatedAt: Date
    }
  },
  certificate: {
    tokenId: String,
    transactionHash: String,
    ipfsHash: String,
    mintedAt: Date,
    claimed: {
      type: Boolean,
      default: false
    },
    claimedAt: Date
  },
  completedAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  reminders: [{
    type: {
      type: String,
      enum: ['deadline', 'inactivity', 'completion']
    },
    sentAt: Date,
    message: String
  }]
}, {
  timestamps: true
});

// Compound indexes for efficient queries
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ status: 1, completedAt: 1 });

// Virtual for checking if enrollment is expired
enrollmentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Method to calculate overall progress
enrollmentSchema.methods.calculateProgress = function() {
  const course = this.course;
  if (!course || !course.modules || course.modules.length === 0) {
    return 0;
  }

  const completedCount = this.progress.completedModules.filter(m => m.completed).length;
  return Math.round((completedCount / course.modules.length) * 100);
};

// Method to check if user can take evaluation
enrollmentSchema.methods.canTakeEvaluation = function() {
  if (!this.finalEvaluation) return true;

  const course = this.course;
  const maxAttempts = course?.evaluationCriteria?.maxAttempts || 3;
  const currentAttempts = this.finalEvaluation.attempts || 1;

  return currentAttempts < maxAttempts;
};

module.exports = mongoose.model('Enrollment', enrollmentSchema);
