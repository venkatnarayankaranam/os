require('dotenv').config();
const mongoose = require('mongoose');
const OutingRequest = require('../models/OutingRequest');
const User = require('../models/User');

const regenerateQRs = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-db');
    console.log('🔗 Connected to MongoDB');

    // Find all approved requests with outdated QR structure
    const requests = await OutingRequest.find({
      status: 'approved',
      currentLevel: 'completed',
      'qrCode.outgoing.data': { $exists: true }
    }).populate('studentId');

    console.log(`\n📊 Found ${requests.length} approved requests to update`);

    for (const request of requests) {
      console.log(`\n🔄 Updating request: ${request._id}`);
      console.log(`   Student: ${request.studentId.name} (${request.studentId.rollNumber})`);
      
      try {
        // Clear existing QR codes
        request.qrCode = {
          outgoing: {},
          incoming: {}
        };
        
        // Regenerate with proper structure
        await request.generateOutgoingQR();
        console.log(`   ✅ Outgoing QR regenerated with ID: ${request.qrCode.outgoing.qrId}`);
        
        await request.generateIncomingQR();
        console.log(`   ✅ Incoming QR regenerated with ID: ${request.qrCode.incoming.qrId}`);
        
        console.log(`   ⏰ Outgoing valid until: ${request.qrCode.outgoing.validUntil}`);
        console.log(`   ⏰ Incoming valid until: ${request.qrCode.incoming.validUntil}`);
        
      } catch (error) {
        console.log(`   ❌ Failed to regenerate QRs: ${error.message}`);
      }
    }

    console.log('\n✅ QR regeneration completed!');
    console.log('🎯 Now refresh the student dashboard to see the updated QR codes');

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

regenerateQRs();