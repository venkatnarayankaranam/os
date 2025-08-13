const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../.env' });

// Import Student model
const Student = require('../models/Student');

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

const debugAuth = async () => {
  try {
    console.log('🔍 Debugging Student Authentication\n');
    
    // Get a sample student
    const student = await Student.findOne({});
    if (!student) {
      console.log('❌ No students found in database');
      return;
    }
    
    console.log('👤 Testing with student:', {
      name: student.name,
      rollNumber: student.rollNumber,
      passwordStartsWith: student.password.substring(0, 10) + '...'
    });
    
    const rollNumber = student.rollNumber;
    const password = rollNumber; // Password should be same as roll number
    
    console.log(`\n🔐 Attempting login with:`)
    console.log(`   Username: "${rollNumber}"`);
    console.log(`   Password: "${password}"`);
    console.log(`   Stored password hash: "${student.password.substring(0, 20)}..."`);
    
    // Test bcrypt comparison
    const isMatch = await bcrypt.compare(password, student.password);
    console.log(`   Password comparison result: ${isMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
    
    // Test if the stored password is already hashed
    const isAlreadyHashed = student.password.startsWith('$2a$') || student.password.startsWith('$2b$');
    console.log(`   Password is hashed: ${isAlreadyHashed ? '✅ YES' : '❌ NO'}`);
    
    if (!isMatch) {
      console.log('\n🚨 Password mismatch detected! Testing various scenarios:');
      
      // Test direct comparison (if somehow not hashed)
      const directMatch = password === student.password;
      console.log(`   Direct string match: ${directMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
      
      // Test against variations
      const testCases = [
        student.rollNumber,
        student.rollNumber.toLowerCase(),
        student.rollNumber.toUpperCase(),
        'default123'
      ];
      
      for (const testCase of testCases) {
        const testResult = await bcrypt.compare(testCase, student.password);
        console.log(`   Testing "${testCase}": ${testResult ? '✅ MATCH' : '❌ NO MATCH'}`);
      }
    }
    
    console.log('\n📊 Database Status:');
    const totalStudents = await Student.countDocuments({});
    console.log(`   Total students in collection: ${totalStudents}`);
    
    // Check a few more students to see if it's a widespread issue
    const moreStudents = await Student.find({}).limit(3);
    console.log('\n🔍 Testing additional students:');
    for (const s of moreStudents) {
      const testMatch = await bcrypt.compare(s.rollNumber, s.password);
      console.log(`   ${s.rollNumber}: ${testMatch ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await debugAuth();
    
    console.log('\n✅ Debug completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Main process failed:', error);
    process.exit(1);
  }
};

// Run the debug
if (require.main === module) {
  main();
}

module.exports = { debugAuth };