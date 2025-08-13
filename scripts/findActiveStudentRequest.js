const mongoose = require('mongoose');
const OutingRequest = require('../models/OutingRequest');
const Student = require('../models/Student');
const User = require('../models/User');
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

const findAndFixActiveRequests = async () => {
  try {
    console.log('🔍 URGENT FIX: Finding ALL active requests and fixing completion status...\n');

    // First, find the student in Users collection
    let targetUser = await User.findOne({ rollNumber: '226Q1A4509' });
    if (!targetUser) {
      console.log('Searching for user by name pattern...');
      targetUser = await User.findOne({ name: /KANDUKURI.*KIRAN.*KUMAR/i });
    }
    
    if (targetUser) {
      console.log(`👤 Found user: ${targetUser.name} (${targetUser.rollNumber}) - ID: ${targetUser._id}`);
    }

    // Get ALL active outing requests to see what we're dealing with
    const allActiveRequests = await OutingRequest.find({
      status: 'approved',
      currentLevel: 'completed'
    }).populate('studentId', 'name rollNumber email');

    console.log(`📊 Found ${allActiveRequests.length} approved/completed requests in database\n`);

    let fixedCount = 0;
    
    for (let i = 0; i < allActiveRequests.length; i++) {
      const request = allActiveRequests[i];
      const reqData = request.toObject();
      
      console.log(`\n${i + 1}. REQUEST ANALYSIS:`);
      console.log(`   ID: ${request._id}`);
      console.log(`   Student: ${request.studentId?.name || 'Unknown'} (${request.studentId?.rollNumber || 'Unknown'})`);
      console.log(`   Date: ${request.outingDate?.toDateString()}`);
      console.log(`   Purpose: ${request.purpose}`);
      console.log(`   Status: ${request.status} / ${request.currentLevel}`);
      
      // Check QR codes
      const outgoingScanned = !!(reqData.qrCode?.outgoing?.isExpired && reqData.qrCode?.outgoing?.scannedAt);
      const incomingScanned = !!(reqData.qrCode?.incoming?.isExpired && reqData.qrCode?.incoming?.scannedAt);
      
      console.log(`   QR Status - OUT: ${outgoingScanned ? '✅ Scanned' : '❌ Not scanned'}, IN: ${incomingScanned ? '✅ Scanned' : '❌ Not scanned'}`);
      console.log(`   Gate Activities: ${request.gateActivity?.length || 0}`);
      
      if (request.gateActivity?.length > 0) {
        const exitCount = request.gateActivity.filter(a => a.type === 'OUT').length;
        const entryCount = request.gateActivity.filter(a => a.type === 'IN').length;
        console.log(`     EXIT activities: ${exitCount}, ENTRY activities: ${entryCount}`);
        
        // If has both EXIT and ENTRY activities but QR codes aren't marked as scanned
        if (exitCount > 0 && entryCount > 0 && (!outgoingScanned || !incomingScanned)) {
          console.log(`   🔧 FIXING: Student has returned but QR status is incorrect`);
          
          const lastExit = request.gateActivity.filter(a => a.type === 'OUT').pop();
          const lastEntry = request.gateActivity.filter(a => a.type === 'IN').pop();
          
          let updated = false;
          
          // Fix outgoing QR
          if (!outgoingScanned) {
            if (!request.qrCode) request.qrCode = {};
            if (!request.qrCode.outgoing) request.qrCode.outgoing = {};
            
            request.qrCode.outgoing.isExpired = true;
            request.qrCode.outgoing.scannedAt = lastExit.scannedAt;
            request.qrCode.outgoing.scannedBy = lastExit.scannedBy;
            request.qrCode.outgoing.data = null;
            updated = true;
            console.log(`     ✅ Fixed outgoing QR - marked as scanned at ${lastExit.scannedAt}`);
          }
          
          // Fix incoming QR
          if (!incomingScanned) {
            if (!request.qrCode.incoming) request.qrCode.incoming = {};
            
            request.qrCode.incoming.isExpired = true;
            request.qrCode.incoming.scannedAt = lastEntry.scannedAt;
            request.qrCode.incoming.scannedBy = lastEntry.scannedBy;
            request.qrCode.incoming.data = null;
            updated = true;
            console.log(`     ✅ Fixed incoming QR - marked as scanned at ${lastEntry.scannedAt}`);
          }
          
          if (updated) {
            await request.save();
            fixedCount++;
            console.log(`     💾 Request ${request._id} has been fixed and saved!`);
            
            // Check if this is our target student
            if (request.studentId?.rollNumber === '226Q1A4509') {
              console.log(`     🎯 THIS IS THE TARGET STUDENT'S REQUEST - FIXED!`);
            }
          }
        } else if (exitCount > 0 && entryCount > 0) {
          console.log(`   ✅ Already properly marked as completed`);
        } else {
          console.log(`   ⏳ Still waiting for student to return (only ${exitCount} exits, ${entryCount} entries)`);
        }
      }
      
      console.log('   ' + '-'.repeat(50));
    }
    
    console.log(`\n🎊 URGENT FIX SUMMARY:`);
    console.log(`✅ Fixed ${fixedCount} requests that should have been marked as completed`);
    console.log(`📊 Analyzed ${allActiveRequests.length} total requests`);
    
    if (fixedCount > 0) {
      console.log(`\n🚀 SUCCESS! Students should now be able to create new requests!`);
      console.log(`🔄 The "Outing in Progress" blocking should be resolved.`);
    } else {
      console.log(`\n⚠️ No requests needed fixing. The issue might be elsewhere.`);
      
      // Let's check if there are any requests with active QR codes that shouldn't have them
      const requestsWithActiveQR = await OutingRequest.find({
        status: 'approved',
        currentLevel: 'completed',
        $or: [
          { 'qrCode.outgoing.data': { $ne: null } },
          { 'qrCode.incoming.data': { $ne: null } }
        ]
      }).populate('studentId', 'name rollNumber');
      
      console.log(`\n🔍 Found ${requestsWithActiveQR.length} requests with active QR data that might need clearing...`);
      
      for (const req of requestsWithActiveQR) {
        console.log(`   - ${req.studentId?.name} (${req.studentId?.rollNumber}): ${req.purpose}`);
        
        // If this request has gate activities showing completion, clear the QR data
        const hasExit = req.gateActivity?.some(a => a.type === 'OUT');
        const hasEntry = req.gateActivity?.some(a => a.type === 'IN');
        
        if (hasExit && hasEntry) {
          let cleared = false;
          if (req.qrCode?.outgoing?.data) {
            req.qrCode.outgoing.data = null;
            cleared = true;
          }
          if (req.qrCode?.incoming?.data) {
            req.qrCode.incoming.data = null;
            cleared = true;
          }
          
          if (cleared) {
            await req.save();
            console.log(`     🧹 Cleared QR data for completed request`);
            fixedCount++;
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Urgent fix failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await findAndFixActiveRequests();
    console.log('\n🎉 URGENT FIX COMPLETED!');
    console.log('🔄 All students who have returned should now be able to create new requests.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Urgent fix script failed:', error);
    process.exit(1);
  }
};

// Run the urgent fix
if (require.main === module) {
  main();
}

module.exports = { findAndFixActiveRequests };