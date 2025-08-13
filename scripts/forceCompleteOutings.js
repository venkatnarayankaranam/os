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

const forceCompleteOutings = async () => {
  try {
    console.log('🚨 EMERGENCY FIX: Force completing outings for students who have returned...\n');

    // Find all approved requests with gate activities showing both EXIT and ENTRY
    const approvedRequests = await OutingRequest.find({
      status: 'approved',
      currentLevel: 'completed',
      'gateActivity.type': { $all: ['OUT', 'IN'] } // Must have both EXIT and ENTRY
    }).populate('studentId', 'name rollNumber');

    console.log(`🔍 Found ${approvedRequests.length} approved requests with both EXIT and ENTRY activity`);

    if (approvedRequests.length === 0) {
      console.log('ℹ️ No requests found that need completion');
      return;
    }

    let fixedCount = 0;
    
    for (const request of approvedRequests) {
      const studentName = request.studentId?.name || 'Unknown';
      const studentRoll = request.studentId?.rollNumber || 'Unknown';
      
      console.log(`\n👤 Processing: ${studentName} (${studentRoll})`);
      console.log(`📅 Request Date: ${request.outingDate?.toDateString()}`);
      console.log(`🎯 Purpose: ${request.purpose}`);
      
      // Check gate activities
      const exitActivity = request.gateActivity.find(a => a.type === 'OUT');
      const entryActivity = request.gateActivity.find(a => a.type === 'IN');
      
      console.log(`🚪 EXIT: ${exitActivity ? exitActivity.scannedAt : 'Not found'}`);
      console.log(`🚪 ENTRY: ${entryActivity ? entryActivity.scannedAt : 'Not found'}`);
      
      if (exitActivity && entryActivity) {
        // Force mark both QR codes as expired and scanned
        let updated = false;
        
        if (request.qrCode?.outgoing) {
          if (!request.qrCode.outgoing.isExpired || !request.qrCode.outgoing.scannedAt) {
            request.qrCode.outgoing.isExpired = true;
            request.qrCode.outgoing.scannedAt = exitActivity.scannedAt;
            request.qrCode.outgoing.scannedBy = exitActivity.scannedBy;
            updated = true;
            console.log('✅ Fixed outgoing QR status');
          }
        }
        
        if (request.qrCode?.incoming) {
          if (!request.qrCode.incoming.isExpired || !request.qrCode.incoming.scannedAt) {
            request.qrCode.incoming.isExpired = true;
            request.qrCode.incoming.scannedAt = entryActivity.scannedAt;
            request.qrCode.incoming.scannedBy = entryActivity.scannedBy;
            updated = true;
            console.log('✅ Fixed incoming QR status');
          }
        }
        
        // Clear any remaining QR data to ensure it's marked as completed
        if (request.qrCode?.outgoing?.data) {
          request.qrCode.outgoing.data = null;
          updated = true;
          console.log('✅ Cleared outgoing QR data');
        }
        
        if (request.qrCode?.incoming?.data) {
          request.qrCode.incoming.data = null;
          updated = true;
          console.log('✅ Cleared incoming QR data');
        }
        
        if (updated) {
          await request.save();
          fixedCount++;
          console.log('🎉 Request marked as completed!');
        } else {
          console.log('ℹ️ Request already properly marked');
        }
      }
    }
    
    console.log(`\n🎊 Fixed ${fixedCount} outing requests!`);
    console.log('🔄 Students should now be able to create new requests.');
    
    // Test the specific student from screenshots
    console.log('\n🔍 Checking specific student 226Q1A4509...');
    const specificStudent = await Student.findOne({ rollNumber: '226Q1A4509' });
    if (specificStudent) {
      const studentRequests = await OutingRequest.find({ studentId: specificStudent._id })
        .sort({ createdAt: -1 });
      
      console.log(`📊 Found ${studentRequests.length} requests for ${specificStudent.name}`);
      
      const isRequestCompleted = (request) => {
        const requestData = request.toObject();
        const isFullyApproved = request.status === 'approved' && request.currentLevel === 'completed';
        if (!isFullyApproved) return false;
        
        const outgoingScanned = requestData.qrCode?.outgoing?.isExpired && requestData.qrCode?.outgoing?.scannedAt;
        const incomingScanned = requestData.qrCode?.incoming?.isExpired && requestData.qrCode?.incoming?.scannedAt;
        const isEmergency = request.category === 'emergency';
        
        return isEmergency ? outgoingScanned : (outgoingScanned && incomingScanned);
      };
      
      const activeCount = studentRequests.filter(r => !isRequestCompleted(r)).length;
      const pastCount = studentRequests.filter(r => isRequestCompleted(r)).length;
      
      console.log(`🟢 Completed (Past): ${pastCount}`);
      console.log(`🟡 Active: ${activeCount}`);
      
      if (activeCount === 0) {
        console.log('🎉 SUCCESS! Student should now be able to create new requests!');
      } else {
        console.log('⚠️ Student still has active requests. Let me check them...');
        const activeRequests = studentRequests.filter(r => !isRequestCompleted(r));
        activeRequests.forEach((req, i) => {
          const reqData = req.toObject();
          console.log(`${i + 1}. Status: ${req.status}, Level: ${req.currentLevel}`);
          console.log(`   OUT: expired=${!!reqData.qrCode?.outgoing?.isExpired}, scanned=${!!reqData.qrCode?.outgoing?.scannedAt}`);
          console.log(`   IN: expired=${!!reqData.qrCode?.incoming?.isExpired}, scanned=${!!reqData.qrCode?.incoming?.scannedAt}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Emergency fix failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await forceCompleteOutings();
    console.log('\n🚀 Emergency fix completed! The student dashboard should now show correct status.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Emergency fix script failed:', error);
    process.exit(1);
  }
};

// Run the emergency fix
if (require.main === module) {
  main();
}

module.exports = { forceCompleteOutings };