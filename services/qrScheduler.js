const cron = require('node-cron');
const OutingRequest = require('../models/OutingRequest');

// Run every minute to check for incoming QR generation
const startQRScheduler = () => {
  console.log('🕐 QR Scheduler started - checking for incoming QR generation every minute');
  
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      // Find approved requests that need incoming QR generation
      // (30 minutes before return time and incoming QR not yet generated)
      const requests = await OutingRequest.find({
        status: 'approved',
        'qrCode.outgoing.isExpired': true, // Student has already exited
        'qrCode.incoming.data': { $exists: false }, // Incoming QR not yet generated
        outingDate: now.toISOString().split('T')[0] // Today's requests
      }).populate('studentId');

      for (const request of requests) {
        try {
          // Calculate when to generate incoming QR (30 minutes before return time)
          const dateStr = request.outingDate instanceof Date 
            ? request.outingDate.toISOString().split('T')[0] 
            : request.outingDate;
          const returnDateTime = new Date(dateStr + ' ' + request.returnTime);
          const generateAt = new Date(returnDateTime.getTime() - (30 * 60 * 1000)); // 30 minutes before
          
          // Check if it's time to generate the incoming QR
          if (now >= generateAt && now <= returnDateTime) {
            console.log(`🎫 Generating incoming QR for student: ${request.studentId.name} (${request.studentId.rollNumber})`);
            await request.generateIncomingQR();
            console.log(`✅ Incoming QR generated for request: ${request._id}`);
          }
        } catch (error) {
          console.error(`❌ Error generating incoming QR for request ${request._id}:`, error.message);
        }
      }
      
    } catch (error) {
      console.error('❌ QR Scheduler error:', error);
    }
  });
};

// Start midnight expiry scheduler
const startMidnightExpiryScheduler = () => {
  console.log('🌙 Midnight Expiry Scheduler started - runs daily at 11:59 PM');
  
  // Run every day at 11:59 PM (59 59 23 * * *)
  cron.schedule('59 59 23 * * *', async () => {
    try {
      console.log('🌙 Running midnight expiry job at 11:59 PM...');
      
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Expire all QR codes from today that haven't been scanned
      const result = await OutingRequest.updateMany(
        {
          outingDate: todayStr,
          $or: [
            { 'qrCode.outgoing.isExpired': false },
            { 'qrCode.incoming.isExpired': false }
          ]
        },
        {
          $set: {
            'qrCode.outgoing.isExpired': true,
            'qrCode.incoming.isExpired': true,
            'qrCode.outgoing.expiredAt': new Date(),
            'qrCode.incoming.expiredAt': new Date()
          }
        }
      );
      
      console.log(`✅ Expired ${result.modifiedCount} requests at midnight`);
      
      // Also clean up any pending requests that are older than today
      const cleanupResult = await OutingRequest.updateMany(
        {
          outingDate: { $lt: todayStr },
          status: 'pending'
        },
        {
          $set: {
            status: 'denied',
            'qrCode.outgoing.isExpired': true,
            'qrCode.incoming.isExpired': true,
            autoExpiredAt: new Date()
          }
        }
      );
      
      console.log(`🧹 Auto-denied ${cleanupResult.modifiedCount} old pending requests`);
      
    } catch (error) {
      console.error('❌ Midnight expiry scheduler error:', error);
    }
  });
};

// Manual function to generate incoming QRs for testing
const generateIncomingQRsNow = async () => {
  try {
    console.log('🎫 Manually generating incoming QRs for testing...');
    
    const requests = await OutingRequest.find({
      status: 'approved',
      'qrCode.outgoing.isExpired': true,
      'qrCode.incoming.data': { $exists: false }
    }).populate('studentId');

    for (const request of requests) {
      try {
        await request.generateIncomingQR();
        console.log(`✅ Incoming QR generated for: ${request.studentId.name}`);
      } catch (error) {
        console.error(`❌ Error generating incoming QR:`, error.message);
      }
    }
    
    console.log(`🎉 Generated incoming QRs for ${requests.length} requests`);
  } catch (error) {
    console.error('❌ Manual QR generation error:', error);
  }
};

module.exports = {
  startQRScheduler,
  startMidnightExpiryScheduler,
  generateIncomingQRsNow
};