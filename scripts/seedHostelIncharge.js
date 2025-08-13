require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const seedHostelIncharge = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-db');

    // Create hostel incharge
    const hostelIncharge = new User({
      name: 'Hostel Incharge',
      email: 'hostelincharge@kietgroup.com',
      password: await bcrypt.hash('password123', 10),
      role: 'hostel-incharge',
      // No hostelBlock as they manage all blocks
      assignedBlocks: ['A-Block', 'B-Block', 'C-Block', 'D-Block', 'E-Block'], // All blocks
      phoneNumber: '9876543210',
      staffId: 'HI001', // Adding staff ID
      isActive: true,
      // Removed floor and roomNumber as they're not needed for hostel incharge
    });

    await hostelIncharge.save();
    console.log('Hostel Incharge created successfully');
    console.log('Details:', {
      email: hostelIncharge.email,
      role: hostelIncharge.role,
      assignedBlocks: hostelIncharge.assignedBlocks,
      staffId: hostelIncharge.staffId
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedHostelIncharge();
