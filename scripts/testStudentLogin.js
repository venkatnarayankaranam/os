const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
require('dotenv').config();

const testStudentLogin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');
    
    // Get a sample student
    const student = await Student.findOne({ rollNumber: '23B21A45B0' });
    if (!student) {
      console.log('Student not found');
      return;
    }
    
    console.log(`Testing login for: ${student.name} (${student.rollNumber})`);
    console.log(`Parent Phone: ${student.parentPhoneNumber}`);
    
    // Test if password matches roll number
    const isPasswordValid = await bcrypt.compare(student.rollNumber, student.password);
    console.log(`Password verification (using roll number): ${isPasswordValid ? 'SUCCESS' : 'FAILED'}`);
    
    if (!isPasswordValid) {
      console.log('Stored password hash:', student.password);
      console.log('Expected password:', student.rollNumber);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

testStudentLogin();