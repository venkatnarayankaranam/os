const mongoose = require('mongoose');
const QRCode = require('qrcode');

const outingSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  outingDate: {
    type: Date,
    required: true
  },
  outingTime: {
    type: String,
    required: true
  },
  returnTime: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending_floor_incharge', 'pending_hostel_incharge', 'pending_warden', 'approved', 'denied'],
    default: 'pending_floor_incharge'
  },
  approvalStage: {
    type: Number,
    default: 1, // 1: Floor, 2: Hostel, 3: Warden
    min: 1,
    max: 3
  },
  approvals: {
    floorIncharge: {
      approved: { type: Boolean, default: false },
      approvedAt: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    hostelIncharge: {
      approved: { type: Boolean, default: false },
      approvedAt: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    warden: {
      approved: { type: Boolean, default: false },
      approvedAt: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },
  qrCode: {
    data: String,
    generatedAt: Date
  },
  tracking: {
    checkOut: {
      time: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    checkIn: {
      time: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add methods to handle approval flow
outingSchema.methods.updateApprovalStatus = function() {
  if (this.approvals.warden.approved) {
    this.status = 'approved';
    this.approvalStage = 3;
  } else if (this.approvals.hostelIncharge.approved) {
    this.status = 'pending_warden';
    this.approvalStage = 3;
  } else if (this.approvals.floorIncharge.approved) {
    this.status = 'pending_hostel_incharge';
    this.approvalStage = 2;
  } else {
    this.status = 'pending_floor_incharge';
    this.approvalStage = 1;
  }
  return this.status;
};

outingSchema.methods.generateQRCode = async function() {
  if (this.status !== 'approved' || !this.approvals.warden.approved) {
    throw new Error('Cannot generate QR code for unapproved request');
  }

  const qrData = {
    requestId: this._id,
    name: this.studentId.name,
    rollNumber: this.studentId.rollNumber,
    phoneNumber: this.studentId.phoneNumber,
    parentPhoneNumber: this.studentId.parentPhoneNumber,
    branch: this.studentId.branch,
    roomNumber: this.studentId.roomNumber,
    outingTime: this.outingTime,
    inTime: this.returnTime,
    status: this.status,
    approvedAt: this.approvals.warden.approvedAt
  };

  try {
    const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrData));
    this.qrCode = {
      data: qrCodeImage,
      generatedAt: new Date()
    };
    await this.save();
    return qrCodeImage;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw error;
  }
};

module.exports = mongoose.model('Outing', outingSchema);