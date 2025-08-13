const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, sparse: true }, // Optional for students
  password: { type: String, required: true },
  rollNumber: { type: String, required: true, unique: true },
  phoneNumber: { type: String },
  parentPhoneNumber: { type: String },
  hostelBlock: { type: String, required: true },
  floor: { type: String, required: true },
  roomNumber: { type: String, required: true },
  branch: { type: String, default: 'Computer Science' },
  semester: { type: Number, default: 1 },
  role: { type: String, default: 'student' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  collection: 'students' // Explicitly use 'students' collection
});

// Helper method to format floor
studentSchema.statics.formatFloor = function(floor) {
  if (!floor) return '1st Floor';
  
  // Convert to standard format
  const cleanFloor = floor.toString().toLowerCase().replace(/[^0-9]/g, '');
  const floorNumber = parseInt(cleanFloor) || 1;
  
  switch (floorNumber) {
    case 1: return '1st Floor';
    case 2: return '2nd Floor';
    case 3: return '3rd Floor';
    case 4: return '4th Floor';
    default: return '1st Floor';
  }
};

// Hash password before saving (only for new documents or when password is modified)
studentSchema.pre('save', async function(next) {
  // Skip hashing if password is already hashed or not modified
  if (!this.isModified('password') || this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update timestamp before saving
studentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Student', studentSchema);