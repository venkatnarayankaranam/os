require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const cleanupHostelData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🧹 CLEANING UP HOSTEL DATA\n');

    // 1. Remove duplicate/old floor incharges
    console.log('🔍 Checking for duplicate floor incharges...');
    
    // Find the old generic floor incharge that might be duplicated
    const oldFloorIncharge = await User.findOne({ 
      email: 'floorincharge@kietgroup.com',
      role: 'floor-incharge' 
    });

    if (oldFloorIncharge) {
      await User.deleteOne({ _id: oldFloorIncharge._id });
      console.log('✅ Removed old generic floor incharge: floorincharge@kietgroup.com');
    } else {
      console.log('ℹ️  No duplicate floor incharge found');
    }

    // 2. Fix student with "Womens-Block" to "E-Block"
    console.log('\n🔍 Checking for students with incorrect block assignment...');
    
    const womensBlockStudents = await User.find({ 
      role: 'student',
      hostelBlock: 'Womens-Block' 
    });

    if (womensBlockStudents.length > 0) {
      console.log(`Found ${womensBlockStudents.length} student(s) with "Womens-Block"`);
      
      for (const student of womensBlockStudents) {
        await User.updateOne(
          { _id: student._id },
          { $set: { hostelBlock: 'E-Block' } }
        );
        console.log(`✅ Updated ${student.name} (${student.email}) from "Womens-Block" to "E-Block"`);
      }
    } else {
      console.log('ℹ️  No students with "Womens-Block" found');
    }

    // 3. Verify current state
    console.log('\n📊 CURRENT STATE AFTER CLEANUP:');
    
    const dBlockFloorIncharges = await User.find({ 
      role: 'floor-incharge',
      hostelBlock: 'D-Block' 
    });
    
    const eBlockFloorIncharges = await User.find({ 
      role: 'floor-incharge',
      hostelBlock: 'E-Block' 
    });

    console.log(`D-Block Floor Incharges: ${dBlockFloorIncharges.length}`);
    dBlockFloorIncharges.forEach(fi => {
      console.log(`  - ${fi.name} (${fi.floor}): ${fi.email}`);
    });

    console.log(`E-Block Floor Incharges: ${eBlockFloorIncharges.length}`);
    eBlockFloorIncharges.forEach(fi => {
      console.log(`  - ${fi.name} (${fi.floor}): ${fi.email}`);
    });

    // Check student distribution
    const dBlockStudents = await User.countDocuments({ role: 'student', hostelBlock: 'D-Block' });
    const eBlockStudents = await User.countDocuments({ role: 'student', hostelBlock: 'E-Block' });
    const unmappedStudents = await User.countDocuments({ 
      role: 'student', 
      $or: [
        { hostelBlock: { $exists: false } },
        { hostelBlock: null },
        { hostelBlock: { $nin: ['D-Block', 'E-Block'] } }
      ]
    });

    console.log('\n👥 STUDENT DISTRIBUTION:');
    console.log(`D-Block Students: ${dBlockStudents}`);
    console.log(`E-Block Students: ${eBlockStudents}`);
    console.log(`Unmapped Students: ${unmappedStudents}`);

    // Final validation
    const isValid = (
      dBlockFloorIncharges.length === 4 &&
      eBlockFloorIncharges.length === 4 &&
      unmappedStudents === 0
    );

    console.log(`\n🏁 CLEANUP STATUS: ${isValid ? '✅ SUCCESS' : '❌ NEEDS ATTENTION'}`);

    if (isValid) {
      console.log('🎉 All data is properly cleaned up and organized!');
    } else {
      console.log('⚠️  Some issues may still exist. Please check the data manually.');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupHostelData();