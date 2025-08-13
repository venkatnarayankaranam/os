const mongoose = require('mongoose');

const gateActivitySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  outingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutingRequest',
    required: false // Not all gate activities are linked to outing requests
  },
  homePermissionRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HomePermissionRequest',
    required: false
  },
  type: {
    type: String,
    enum: ['in', 'out'],
    required: true
  },
  scannedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  location: {
    type: String,
    default: 'Main Gate',
    required: true
  },
  qrCode: {
    type: String,
    required: false // The QR code that was scanned
  },
  securityPersonnel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Who processed the gate activity
  },
  isSuspicious: {
    type: Boolean,
    default: false
  },
  suspiciousComment: {
    type: String,
    required: false
  },
  securityComment: {
    type: String,
    required: false
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  // Additional metadata
  deviceInfo: {
    type: String,
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  },
  // For audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true // This adds createdAt and updatedAt automatically
});

// Indexes for better query performance
gateActivitySchema.index({ studentId: 1, scannedAt: -1 });
gateActivitySchema.index({ type: 1, scannedAt: -1 });
gateActivitySchema.index({ scannedAt: -1 });
gateActivitySchema.index({ isSuspicious: 1, scannedAt: -1 });
gateActivitySchema.index({ isEmergency: 1, scannedAt: -1 });

// Virtual for getting student's hostel block
gateActivitySchema.virtual('hostelBlock').get(function() {
  return this.studentId?.hostelBlock;
});

// Static method to get activities by date range
gateActivitySchema.statics.getActivitiesByDateRange = function(startDate, endDate, filters = {}) {
  const query = {
    scannedAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    ...filters
  };
  
  return this.find(query)
    .populate('studentId', 'name rollNumber hostelBlock floor roomNumber branch')
    .populate('outingRequestId', 'purpose isEmergency category')
    .populate('homePermissionRequestId', 'purpose category')
    .populate('securityPersonnel', 'name email')
    .sort({ scannedAt: -1 });
};

// Static method to get activities by gender
gateActivitySchema.statics.getActivitiesByGender = function(startDate, endDate, gender) {
  const pipeline = [
    {
      $match: {
        scannedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student'
      }
    },
    {
      $unwind: '$student'
    }
  ];

  // Add gender filter
  if (gender === 'female') {
    pipeline.push({
      $match: {
        'student.hostelBlock': 'Womens-Block'
      }
    });
  } else if (gender === 'male') {
    pipeline.push({
      $match: {
        'student.hostelBlock': { $in: ['D-Block', 'E-Block'] }
      }
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: 'outingrequests',
        localField: 'outingRequestId',
        foreignField: '_id',
        as: 'outingRequest'
      }
    },
    {
      $lookup: {
        from: 'homepermissionrequests',
        localField: 'homePermissionRequestId',
        foreignField: '_id',
        as: 'homePermissionRequest'
      }
    },
    {
      $sort: { scannedAt: -1 }
    }
  );

  return this.aggregate(pipeline);
};

// Instance method to mark as suspicious
gateActivitySchema.methods.markSuspicious = function(comment, userId) {
  this.isSuspicious = true;
  this.suspiciousComment = comment;
  this.updatedBy = userId;
  return this.save();
};

// Instance method to add security comment
gateActivitySchema.methods.addSecurityComment = function(comment, userId) {
  this.securityComment = comment;
  this.updatedBy = userId;
  return this.save();
};

module.exports = mongoose.model('GateActivity', gateActivitySchema);