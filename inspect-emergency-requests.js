const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const HomePermissionRequest = require('./models/HomePermissionRequest');
const Student = require('./models/Student');

async function inspectEmergencyRequests() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all emergency requests
    const emergencyRequests = await HomePermissionRequest.find({
      category: 'emergency'
    }).populate('studentId', 'name rollNumber');

    console.log('🚨 All emergency requests found:', emergencyRequests.length);

    if (emergencyRequests.length === 0) {
      console.log('No emergency requests found in the database');
      await mongoose.connection.close();
      return;
    }

    emergencyRequests.forEach((request, index) => {
      console.log(`\n--- Emergency Request ${index + 1} ---`);
      console.log('ID:', request._id);
      console.log('Student:', request.studentId?.name || 'Unknown');
      console.log('Roll No:', request.studentId?.rollNumber || 'Unknown');
      console.log('Category:', request.category);
      console.log('Status:', request.status);
      console.log('Current Level:', request.currentLevel);
      console.log('Home Town:', request.homeTownName);
      console.log('Going Date:', request.goingDate);
      console.log('Incoming Date:', request.incomingDate);
      console.log('Created At:', request.createdAt);
      console.log('Approval Flow:', request.approvalFlow.map(a => ({
        level: a.level,
        status: a.status,
        timestamp: a.timestamp,
        approvedBy: a.approvedBy
      })));
      console.log('Approval Flags:', {
        floorIncharge: request.approvalFlags?.floorIncharge?.isApproved || false,
        hostelIncharge: request.approvalFlags?.hostelIncharge?.isApproved || false,
        warden: request.approvalFlags?.warden?.isApproved || false
      });
    });

    // Also check for any pending requests that might be emergency but not categorized correctly
    const pendingRequests = await HomePermissionRequest.find({
      status: 'pending',
      purpose: { $regex: /emergency|urgent/i }
    }).populate('studentId', 'name rollNumber');

    console.log('\n🔍 Pending requests with "emergency" or "urgent" in purpose:', pendingRequests.length);
    
    pendingRequests.forEach((request, index) => {
      if (request.category !== 'emergency') {
        console.log(`\n--- Potential Emergency Request ${index + 1} ---`);
        console.log('ID:', request._id);
        console.log('Student:', request.studentId?.name || 'Unknown');
        console.log('Category:', request.category);
        console.log('Purpose:', request.purpose);
        console.log('Current Level:', request.currentLevel);
      }
    });

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');

  } catch (error) {
    console.error('Error inspecting emergency requests:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the inspection
inspectEmergencyRequests();