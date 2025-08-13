const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const GateActivity = require('./models/GateActivity');
const Student = require('./models/Student');
const User = require('./models/User');

async function createSampleGateData() {
  try {
    console.log('🚀 Creating sample gate activity data...');

    // Get some students
    const students = await Student.find().limit(10);
    if (students.length === 0) {
      console.log('❌ No students found in database');
      return;
    }

    // Get a security user
    const securityUser = await User.findOne({ role: 'security' });
    if (!securityUser) {
      console.log('❌ No security user found');
      return;
    }

    const sampleActivities = [];
    const now = new Date();

    // Create activities for the last 30 days
    for (let i = 0; i < 30; i++) {
      const activityDate = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      
      // Create 2-5 activities per day
      const activitiesPerDay = Math.floor(Math.random() * 4) + 2;
      
      for (let j = 0; j < activitiesPerDay; j++) {
        const student = students[Math.floor(Math.random() * students.length)];
        const isOut = Math.random() > 0.5;
        const isEmergency = Math.random() > 0.8;
        const isHomePermission = Math.random() > 0.6;
        
        // Random time during the day
        const randomHour = Math.floor(Math.random() * 12) + 8; // 8 AM to 8 PM
        const randomMinute = Math.floor(Math.random() * 60);
        const activityTime = new Date(activityDate);
        activityTime.setHours(randomHour, randomMinute, 0, 0);

        const activity = {
          studentId: student._id,
          type: isOut ? 'out' : 'in',
          scannedAt: activityTime,
          location: 'Main Gate',
          qrCode: `test-qr-${Date.now()}-${Math.random()}`,
          securityPersonnel: securityUser._id,
          isEmergency: isEmergency,
          createdBy: securityUser._id
        };

        // Randomly assign to outing or home permission
        if (isHomePermission) {
          // We'll leave outingRequestId null and homePermissionRequestId null for now
          // In a real scenario, these would be linked to actual requests
        }

        sampleActivities.push(activity);
      }
    }

    // Insert all activities
    const insertedActivities = await GateActivity.insertMany(sampleActivities);
    console.log(`✅ Created ${insertedActivities.length} sample gate activities`);

    // Show some statistics
    const stats = await GateActivity.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      {
        $unwind: '$student'
      },
      {
        $group: {
          _id: '$student.hostelBlock',
          count: { $sum: 1 },
          outCount: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, 1, 0] } },
          inCount: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, 1, 0] } },
          emergencyCount: { $sum: { $cond: ['$isEmergency', 1, 0] } }
        }
      }
    ]);

    console.log('\n📊 Gate Activity Statistics by Block:');
    stats.forEach(stat => {
      console.log(`${stat._id}: ${stat.count} total (${stat.outCount} out, ${stat.inCount} in, ${stat.emergencyCount} emergency)`);
    });

    console.log('\n🎉 Sample data creation completed!');
    console.log('You can now test the PDF generation with actual data.');

  } catch (error) {
    console.error('❌ Error creating sample data:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSampleGateData();