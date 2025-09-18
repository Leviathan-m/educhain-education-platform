const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  content: {
    type: String, // Could be HTML, markdown, or JSON
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  resources: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['video', 'document', 'link', 'quiz']
    }
  }]
});

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  category: {
    type: String,
    enum: ['technical', 'business', 'soft-skills', 'compliance', 'leadership'],
    default: 'technical'
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  modules: [moduleSchema],
  evaluationCriteria: {
    passingScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1
    },
    timeLimit: {
      type: Number, // in minutes, 0 = unlimited
      default: 0
    },
    questions: [{
      question: String,
      type: {
        type: String,
        enum: ['multiple-choice', 'true-false', 'short-answer', 'essay']
      },
      options: [String], // for multiple choice
      correctAnswer: String,
      points: {
        type: Number,
        default: 1
      }
    }]
  },
  nftTemplate: {
    name: String,
    description: String,
    image: String, // IPFS hash or URL
    attributes: [{
      trait_type: String,
      value: String
    }]
  },
  duration: {
    type: Number, // total duration in hours
    default: 0
  },
  maxStudents: {
    type: Number,
    default: 0 // 0 = unlimited
  },
  enrollmentDeadline: {
    type: Date
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  tags: [String],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  totalEnrollments: {
    type: Number,
    default: 0
  },
  completionRate: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for search
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ category: 1, level: 1, isActive: 1 });

module.exports = mongoose.model('Course', courseSchema);
