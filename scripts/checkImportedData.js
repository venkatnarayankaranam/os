const mongoose = require('mongoose');
const Student = require('../models/Student');
require('dotenv').config();

const checkImportedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');
    
    const count = await Student.countDocuments();
    console.log('Total students:', count);
    
    const sample = await Student.find().limit(5).select('name rollNumber parentPhoneNumber hostelBlock roomNumber branch semester');
    console.log('\nSample students:');
    sample.forEach(s => {
      console.log(`${s.name} (${s.rollNumber}) - Parent: ${s.parentPhoneNumber} - Room: ${s.hostelBlock} ${s.roomNumber} - Branch: ${s.branch} - Semester: ${s.semester}`);
    });
    
    // Check students with parent phone numbers
    const withParentPhone = await Student.countDocuments({ parentPhoneNumber: { $ne: '', $exists: true } });
    console.log(`\nStudents with parent phone numbers: ${withParentPhone}`);
    
    // Check distribution by branch
    const branchStats = await Student.aggregate([
      { $group: { _id: '$branch', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\nBranch distribution:');
    branchStats.forEach(stat => {
      console.log(`${stat._id}: ${stat.count} students`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

checkImportedData();