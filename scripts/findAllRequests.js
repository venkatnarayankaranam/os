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

const findAllRequests = async () => {
  try {
    console.log('🔍 SEARCHING: Finding ALL requests in database regardless of status...\n');

    // Get ALL requests
    const allRequests = await OutingRequest.find({}).populate('studentId', 'name rollNumber email').sort({ createdAt: -1 });

    console.log(`📊 Total requests in database: ${allRequests.length}\n`);

    if (allRequests.length === 0) {
      console.log('❌ NO REQUESTS FOUND IN DATABASE!');
      console.log('This might mean:');
      console.log('1. Wrong database connection');
      console.log('2. Requests are in a different collection');
      console.log('3. Different database being used');
      
      // Check what collections exist
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('\n📂 Available collections:');
      collections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
      
      return;
    }

    // Analyze all requests
    const statusCounts = {};
    const levelCounts = {};
    
    console.log('🔍 ANALYZING ALL REQUESTS:\n');
    
    for (let i = 0; i < Math.min(allRequests.length, 10); i++) { // Show first 10 requests
      const request = allRequests[i];
      const reqData = request.toObject();
      
      // Count statuses and levels
      statusCounts[request.status] = (statusCounts[request.status] || 0) + 1;
      levelCounts[request.currentLevel] = (levelCounts[request.currentLevel] || 0) + 1;
      
      console.log(`${i + 1}. REQUEST DETAILS:`);
      console.log(`   ID: ${request._id}`);
      console.log(`   Student: ${request.studentId?.name || request.studentId || 'Unknown'} (${request.studentId?.rollNumber || 'No roll'})`);
      console.log(`   Date: ${request.outingDate?.toDateString()}`);
      console.log(`   Purpose: ${request.purpose}`);
      console.log(`   Status: ${request.status}`);
      console.log(`   Current Level: ${request.currentLevel}`);
      console.log(`   Category: ${request.category || 'normal'}`);
      console.log(`   Created: ${request.createdAt}`);
      
      // Check QR codes
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
      console.log(`   GATE ACTIVITIES: ${request.gateActivity?.length || 0}`);
      if (request.gateActivity?.length > 0) {
        request.gateActivity.forEach((activity, idx) => {
          console.log(`     ${idx + 1}. ${activity.type} at ${activity.scannedAt} (${activity.location || 'No location'})`);
        });
        
        const exitCount = request.gateActivity.filter(a => a.type === 'OUT').length;
        const entryCount = request.gateActivity.filter(a => a.type === 'IN').length;
        console.log(`     Summary: ${exitCount} exits, ${entryCount} entries`);
        
        // Check if this needs fixing
        const outgoingScanned = !!(reqData.qrCode?.outgoing?.isExpired && reqData.qrCode?.outgoing?.scannedAt);
        const incomingScanned = !!(reqData.qrCode?.incoming?.isExpired && reqData.qrCode?.incoming?.scannedAt);
        
        if (exitCount > 0 && entryCount > 0 && (!outgoingScanned || !incomingScanned)) {
          console.log(`     🔧 NEEDS FIXING: Has both exit/entry but QR codes not marked as scanned!`);
          
          // Fix it immediately
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
          }
          
          // Fix incoming QR
          if (!incomingScanned) {
            if (!request.qrCode.incoming) request.qrCode.incoming = {};
            
            request.qrCode.incoming.isExpired = true;
            request.qrCode.incoming.scannedAt = lastEntry.scannedAt;
            request.qrCode.incoming.scannedBy = lastEntry.scannedBy;
            request.qrCode.incoming.data = null;
            updated = true;
          }
          
          if (updated) {
            await request.save();
            console.log(`     ✅ FIXED AND SAVED!`);
          }
        }
      }
      
      console.log('   ' + '='.repeat(60));
    }
    
    console.log(`\n📈 REQUEST STATISTICS:`);
    console.log(`Status counts:`, statusCounts);
    console.log(`Level counts:`, levelCounts);
    
    // Show if there are more requests
    if (allRequests.length > 10) {
      console.log(`\n... and ${allRequests.length - 10} more requests`);
    }

  } catch (error) {
    console.error('❌ Search failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await findAllRequests();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
};

// Run the search
if (require.main === module) {
  main();
}

module.exports = { findAllRequests };