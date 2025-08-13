const mongoose = require('mongoose');

const disciplinaryActionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdByRole: {
    type: String,
  },
  source: {
    type: String,
    enum: ['manual', 'gate'],
    default: 'manual'
  },
  category: {
    type: String,
    enum: ['discipline', 'security'],
    default: 'discipline'
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  gateContext: {
    outingRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutingRequest' },
    gateActivityId: { type: mongoose.Schema.Types.ObjectId },
    comment: String,
    location: String,
    scannedAt: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
}, {
  collection: 'disciplinaryactions'
});

disciplinaryActionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('DisciplinaryAction', disciplinaryActionSchema);


