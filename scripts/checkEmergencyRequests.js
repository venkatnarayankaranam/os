const mongoose = require('mongoose');
const HomePermissionRequest = require('../models/HomePermissionRequest');

// Connect to database
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const connectDB = require('../config/db');

async function checkEmergencyRequests() {
  try {
    await connectDB();
    console.log('Connected to database');

    // Find all emergency requests
    const emergencyRequests = await HomePermissionRequest.find({ 
      category: 'emergency' 
    })
    .populate('studentId', 'name rollNumber')
    .sort({ createdAt: -1 });

    console.log(`Found ${emergencyRequests.length} emergency requests:`);
    
    emergencyRequests.forEach((req, index) => {
      console.log(`\n${index + 1}. Student: ${req.studentId?.name} (${req.studentId?.rollNumber})`);
      console.log(`   Category: ${req.category}`);
      console.log(`   Current Level: ${req.currentLevel}`);
      console.log(`   Status: ${req.status}`);
      console.log(`   Purpose: ${req.purpose}`);
      console.log(`   Created: ${req.createdAt}`);
      console.log(`   Request ID: ${req._id}`);
    });

    // Also check all recent requests to see the pattern
    console.log('\n--- All Recent Requests (last 10) ---');
    const allRecentRequests = await HomePermissionRequest.find({})
    .populate('studentId', 'name rollNumber')
    .sort({ createdAt: -1 })
    .limit(10);

    allRecentRequests.forEach((req, index) => {
      console.log(`${index + 1}. ${req.studentId?.name} - Category: ${req.category} - Level: ${req.currentLevel} - Status: ${req.status}`);
    });

    process.exit(0);

  } catch (error) {
    console.error('Error checking emergency requests:', error);
    process.exit(1);
  }
}

// Run the check
checkEmergencyRequests();