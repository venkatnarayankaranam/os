require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createSecurity = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-db');
    console.log('Connected to MongoDB');

    // Check if security user already exists
    const existingSecurity = await User.findOne({ role: 'security' });
    if (existingSecurity) {
      console.log('Security user already exists:', existingSecurity.email);
      mongoose.connection.close();
      return;
    }

    // Create security user
    const security = new User({
      name: 'Security Guard',
      email: 'security@kietgroup.com',
      password: await bcrypt.hash('Security@2026', 10),
      role: 'security',
      phoneNumber: '9876543210',
      staffId: 'SEC001',
      isActive: true
    });

    await security.save();
    console.log('Security user created successfully');
    console.log('Login details:');
    console.log('Email: security@kietgroup.com');
    console.log('Password: Security@2026');

    mongoose.connection.close();
  } catch (error) {
    console.error('Error creating security user:', error);
    process.exit(1);
  }
};

createSecurity();