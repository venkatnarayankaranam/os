require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createWarden = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-db');
    console.log('Connected to MongoDB');

    // Check if warden already exists
    const existingWarden = await User.findOne({ role: 'warden' });
    if (existingWarden) {
      console.log('Warden already exists:', existingWarden.email);
      mongoose.connection.close();
      return;
    }

    // Create warden
    const warden = new User({
      name: 'Warden',
      email: 'warden@kietgroup.com',
      password: await bcrypt.hash('Warden@2026', 10),
      role: 'warden',
      phoneNumber: '9876543210',
      staffId: 'W001',
      isActive: true
    });

    await warden.save();
    console.log('Warden created successfully');
    console.log('Login details:');
    console.log('Email: warden@kietgroup.com');
    console.log('Password: Warden@2026');

    mongoose.connection.close();
  } catch (error) {
    console.error('Error creating warden:', error);
    process.exit(1);
  }
};

createWarden();