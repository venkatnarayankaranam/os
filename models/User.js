const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { 
    type: String, 
    required: function() {
      // Email is optional for students, required for others
      return this.role !== 'student';
    },
    unique: true,
    sparse: true // Allow null/undefined values to coexist
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['student', 'floor-incharge', 'hostel-incharge', 'warden', 'security', 'gate'],
    required: true
  },
  rollNumber: { 
    type: String, 
    unique: true, 
    sparse: true,
    required: function() {
      // Roll number is required for students
      return this.role === 'student';
    }
  },
  phoneNumber: { type: String },
  parentPhoneNumber: { type: String },
  hostelBlock: { 
    type: String, 
    required: function() {
      // Remove requirement for hostel-incharge as they manage all blocks
      return ['student', 'floor-incharge'].includes(this.role);
    },
    enum: ['A-Block', 'B-Block', 'C-Block', 'D-Block', 'E-Block', 'W-Block', 'Womens-Block'] 
  },
  floor: { 
    type: String, 
    required: function() {
      // Floor is not required for hostel-incharge
      return ['student', 'floor-incharge'].includes(this.role);
    },
    enum: ['1st Floor', '2nd Floor', '3rd Floor', '4th Floor'],
    set: v => {
      // Convert numeric values to proper floor format
      if (v === '1' || v === 1) return '1st Floor';
      if (v === '2' || v === 2) return '2nd Floor';
      if (v === '3' || v === 3) return '3rd Floor';
      if (v === '4' || v === 4) return '4th Floor';
      return v;
    }
  },
  roomNumber: { 
    type: String, 
    required: function() {
      // Room number is only required for students
      return this.role === 'student';
    }
  },
  branch: {
    type: String,
    required: function () { return this.role === 'student'; },
  },
  semester: {
    type: Number,
    required: function () { return this.role === 'student'; },
  },
  staffId: { type: String },
  assignedBlocks: [{
    type: String,
    required: function() {
      return this.role === 'hostel-incharge';
    }
  }],
  assignedFloor: [{
    type: String,
    required: function() {
      return this.role === 'floor-incharge';
    }
  }],
  createdAt: { type: Date, default: Date.now },
});

// Add a helper method to format floor number
userSchema.statics.formatFloor = function(floor) {
  const floorMap = {
    '1': '1st Floor',
    '2': '2nd Floor',
    '3': '3rd Floor',
    '4': '4th Floor'
  };
  return floorMap[floor] || floor;
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);