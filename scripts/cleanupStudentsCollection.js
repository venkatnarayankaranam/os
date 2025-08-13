require('dotenv').config();
const mongoose = require('mongoose');

const cleanupStudentsCollection = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🧹 CLEANING UP STUDENTS COLLECTION\n');

    const db = mongoose.connection.db;
    const studentsCollection = db.collection('students');

    // Find any records that are not actually students
    console.log('🔍 SEARCHING FOR NON-STUDENT RECORDS...');
    
    const nonStudentRecords = await studentsCollection.find({
      $or: [
        { role: { $exists: true, $ne: 'student' } },
        { name: /floor incharge/i },
        { email: /floorincharge/i },
        { role: 'floor-incharge' },
        { role: 'hostel-incharge' },
        { role: 'warden' },
        { role: 'security' },
        { role: 'gate' }
      ]
    }).toArray();

    console.log(`Found ${nonStudentRecords.length} non-student records in students collection:`);
    
    if (nonStudentRecords.length > 0) {
      nonStudentRecords.forEach((record, index) => {
        console.log(`${index + 1}. Name: "${record.name}" | Email: "${record.email}" | Role: "${record.role}"`);
      });

      console.log('\n🗑️  REMOVING NON-STUDENT RECORDS...');
      
      const deleteResult = await studentsCollection.deleteMany({
        $or: [
          { role: { $exists: true, $ne: 'student' } },
          { name: /floor incharge/i },
          { email: /floorincharge/i },
          { role: 'floor-incharge' },
          { role: 'hostel-incharge' },
          { role: 'warden' },
          { role: 'security' },
          { role: 'gate' }
        ]
      });

      console.log(`✅ Removed ${deleteResult.deletedCount} non-student records`);
    } else {
      console.log('✅ No non-student records found');
    }

    // Also check for any records with missing critical student fields
    console.log('\n🔍 CHECKING FOR INCOMPLETE STUDENT RECORDS...');
    
    const incompleteRecords = await studentsCollection.find({
      $or: [
        { rollNumber: { $exists: false } },
        { rollNumber: null },
        { rollNumber: '' },
        { email: { $not: /@student\.com$/ } }, // Students should have @student.com emails
        { role: { $exists: true, $ne: 'student' } }
      ]
    }).toArray();

    if (incompleteRecords.length > 0) {
      console.log(`Found ${incompleteRecords.length} records that might not be students:`);
      incompleteRecords.forEach((record, index) => {
        console.log(`${index + 1}. Name: "${record.name}" | Email: "${record.email}" | Roll: "${record.rollNumber}" | Role: "${record.role}"`);
      });

      // Let's be more careful and only remove obvious non-students
      const obviousNonStudents = incompleteRecords.filter(record => 
        record.role && record.role !== 'student' || 
        record.name && record.name.toLowerCase().includes('incharge') ||
        record.email && record.email.includes('floorincharge')
      );

      if (obviousNonStudents.length > 0) {
        console.log(`\n🗑️  Removing ${obviousNonStudents.length} obvious non-student records...`);
        
        for (const record of obviousNonStudents) {
          await studentsCollection.deleteOne({ _id: record._id });
          console.log(`   Removed: ${record.name} (${record.email})`);
        }
      }
    }

    // Final validation
    console.log('\n📊 FINAL STUDENTS COLLECTION STATUS:');
    const totalStudents = await studentsCollection.countDocuments();
    const validStudents = await studentsCollection.countDocuments({
      role: 'student',
      rollNumber: { $exists: true, $ne: null, $ne: '' },
      email: { $regex: /@student\.com$/ }
    });

    console.log(`Total records: ${totalStudents}`);
    console.log(`Valid students: ${validStudents}`);
    console.log(`Percentage valid: ${((validStudents / totalStudents) * 100).toFixed(1)}%`);

    // Show current block distribution
    console.log('\n🏢 CURRENT BLOCK DISTRIBUTION:');
    const blockStats = await studentsCollection.aggregate([
      { $group: { _id: '$hostelBlock', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    blockStats.forEach(block => {
      console.log(`${block._id}: ${block.count} students`);
    });

    if (validStudents === totalStudents) {
      console.log('\n🎉 STUDENTS COLLECTION IS NOW CLEAN!');
      console.log('✅ All records are valid students');
      console.log('✅ No staff records in students collection');
      console.log('✅ Ready for proper operation');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error cleaning up students collection:', error);
    process.exit(1);
  }
};

cleanupStudentsCollection();