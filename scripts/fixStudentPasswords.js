const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
require('dotenv').config();

const fixStudentPasswords = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');
    
    // Find all students with unhashed passwords
    const students = await Student.find({
      password: { $not: { $regex: /^\$2[ab]\$/ } } // Not starting with bcrypt hash pattern
    });
    
    console.log(`Found ${students.length} students with unhashed passwords`);
    
    let processed = 0;
    for (const student of students) {
      try {
        // Hash the password (which should be the roll number)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(student.password, salt);
        
        // Update the student with hashed password
        await Student.findByIdAndUpdate(student._id, { 
          password: hashedPassword,
          updatedAt: new Date()
        });
        
        processed++;
        if (processed % 50 === 0) {
          console.log(`Processed ${processed} students...`);
        }
      } catch (error) {
        console.error(`Error processing student ${student.rollNumber}:`, error.message);
      }
    }
    
    console.log(`\nCompleted! Processed ${processed} student passwords.`);
    
    // Test a sample login
    const testStudent = await Student.findOne({ rollNumber: '23B21A45B0' });
    if (testStudent) {
      const isValid = await bcrypt.compare('23B21A45B0', testStudent.password);
      console.log(`Test login for ${testStudent.rollNumber}: ${isValid ? 'SUCCESS' : 'FAILED'}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

fixStudentPasswords();