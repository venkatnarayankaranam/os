const mongoose = require('mongoose');
const OutingRequest = require('../models/OutingRequest');
const Student = require('../models/Student');
require('dotenv').config({ path: '../.env' });

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/outing-app');
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const debugAndFixStudent = async () => {
  try {
    console.log('🔍 DEBUG: Finding and fixing specific student issue...\n');

    // Find the student from the screenshot
    let student = await Student.findOne({ rollNumber: '226Q1A4509' });
    if (!student) {
      console.log('❌ Student 226Q1A4509 not found, searching for KANDUKURI KIRAN KUMAR...');
      student = await Student.findOne({ name: /KANDUKURI.*KIRAN.*KUMAR/i });
    }
    
    if (!student) {
      console.log('❌ Student not found. Let me list all students to find the right one...');
      const allStudents = await Student.find({}).select('name rollNumber').limit(10);
      console.log('Available students:');
      allStudents.forEach(s => {
        console.log(`  - ${s.name} (${s.rollNumber})`);
      });
      return;
    }

    console.log(`👤 Found student: ${student.name} (${student.rollNumber})\n`);

    // Get all requests for this student
    const allRequests = await OutingRequest.find({ studentId: student._id })
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${allRequests.length} requests for this student\n`);

    if (allRequests.length === 0) {
      console.log('No requests found for this student');
      return;
    }

    // Examine each request in detail
    for (let i = 0; i < allRequests.length; i++) {
      const request = allRequests[i];
      const reqData = request.toObject();
      
      console.log(`\n${i + 1}. REQUEST DETAILS:`);
      console.log(`   ID: ${request._id}`);
      console.log(`   Date: ${request.outingDate?.toDateString()}`);
      console.log(`   Purpose: ${request.purpose}`);
      console.log(`   Status: ${request.status}`);
      console.log(`   Current Level: ${request.currentLevel}`);
      console.log(`   Category: ${request.category || 'normal'}`);
      
      // Check QR code details
      console.log(`   QR CODE STATUS:`);
      if (reqData.qrCode?.outgoing) {
        console.log(`     OUTGOING: data=${!!reqData.qrCode.outgoing.data}, expired=${!!reqData.qrCode.outgoing.isExpired}, scannedAt=${reqData.qrCode.outgoing.scannedAt || 'null'}`);
      } else {
        console.log(`     OUTGOING: NOT FOUND`);
      }
      
      if (reqData.qrCode?.incoming) {
        console.log(`     INCOMING: data=${!!reqData.qrCode.incoming.data}, expired=${!!reqData.qrCode.incoming.isExpired}, scannedAt=${reqData.qrCode.incoming.scannedAt || 'null'}`);
      } else {
        console.log(`     INCOMING: NOT FOUND`);
      }
      
      // Check gate activities
      console.log(`   GATE ACTIVITIES (${request.gateActivity?.length || 0}):`);
      if (request.gateActivity && request.gateActivity.length > 0) {
        request.gateActivity.forEach((activity, idx) => {
          console.log(`     ${idx + 1}. Type: ${activity.type}, Time: ${activity.scannedAt}, Location: ${activity.location || 'N/A'}`);
        });
      } else {
        console.log(`     No gate activities found`);
      }
      
      // Apply current logic
      const isFullyApproved = request.status === 'approved' && request.currentLevel === 'completed';
      const outgoingScanned = reqData.qrCode?.outgoing?.isExpired && reqData.qrCode?.outgoing?.scannedAt;
      const incomingScanned = reqData.qrCode?.incoming?.isExpired && reqData.qrCode?.incoming?.scannedAt;
      const isEmergency = request.category === 'emergency';
      const isCompleted = isFullyApproved && (isEmergency ? outgoingScanned : (outgoingScanned && incomingScanned));
      
      console.log(`   COMPLETION ANALYSIS:`);
      console.log(`     Fully Approved: ${isFullyApproved}`);
      console.log(`     Outgoing Scanned: ${outgoingScanned}`);
      console.log(`     Incoming Scanned: ${incomingScanned}`);
      console.log(`     Is Emergency: ${isEmergency}`);
      console.log(`     Should Be Completed: ${isCompleted ? '✅ YES' : '❌ NO'}`);
      
      // If this should be completed but isn't, fix it
      if (!isCompleted && isFullyApproved && request.gateActivity?.length >= 2) {
        console.log(`\n   🔧 FIXING THIS REQUEST...`);
        
        const exitActivity = request.gateActivity.find(a => a.type === 'OUT');
        const entryActivity = request.gateActivity.find(a => a.type === 'IN');
        
        if (exitActivity && entryActivity) {
          let needsSaving = false;
          
          // Fix outgoing QR
          if (!reqData.qrCode?.outgoing?.isExpired || !reqData.qrCode?.outgoing?.scannedAt) {
            if (!request.qrCode) request.qrCode = {};
            if (!request.qrCode.outgoing) request.qrCode.outgoing = {};
            
            request.qrCode.outgoing.isExpired = true;
            request.qrCode.outgoing.scannedAt = exitActivity.scannedAt;
            request.qrCode.outgoing.scannedBy = exitActivity.scannedBy;
            request.qrCode.outgoing.data = null; // Clear data
            needsSaving = true;
            console.log(`     ✅ Fixed outgoing QR`);
          }
          
          // Fix incoming QR
          if (!reqData.qrCode?.incoming?.isExpired || !reqData.qrCode?.incoming?.scannedAt) {
            if (!request.qrCode) request.qrCode = {};
            if (!request.qrCode.incoming) request.qrCode.incoming = {};
            
            request.qrCode.incoming.isExpired = true;
            request.qrCode.incoming.scannedAt = entryActivity.scannedAt;
            request.qrCode.incoming.scannedBy = entryActivity.scannedBy;
            request.qrCode.incoming.data = null; // Clear data
            needsSaving = true;
            console.log(`     ✅ Fixed incoming QR`);
          }
          
          if (needsSaving) {
            await request.save();
            console.log(`     💾 Request saved with fixes!`);
          }
        }
      }
      
      console.log('   ' + '='.repeat(60));
    }
    
    console.log(`\n🎉 Analysis and fixes completed!`);
    console.log(`🔄 The student should now be able to create new requests.`);

  } catch (error) {
    console.error('❌ Debug and fix failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await debugAndFixStudent();
    process.exit(0);
  } catch (error) {
    console.error('❌ Debug script failed:', error);
    process.exit(1);
  }
};

// Run the debug
if (require.main === module) {
  main();
}

module.exports = { debugAndFixStudent };