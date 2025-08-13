const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import the Student model
const Student = require('../models/Student');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Outing-Application');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Function to convert year to semester
const convertYearToSemester = (year) => {
  if (!year) return 1;
  const yearStr = year.toString().toLowerCase();
  
  if (yearStr.includes('1st') || yearStr.includes('1')) return 1;
  if (yearStr.includes('2nd') || yearStr.includes('2')) return 3;
  if (yearStr.includes('3rd') || yearStr.includes('3')) return 5;
  if (yearStr.includes('4th') || yearStr.includes('4')) return 7;
  
  return 1; // Default to 1st semester
};

// Function to clean phone number
const cleanPhoneNumber = (phone) => {
  if (!phone || phone === '--' || phone === '...........' || phone === 'LONG ABSENT') {
    return '';
  }
  // Remove any non-digit characters and return
  return phone.toString().replace(/\D/g, '');
};

// Function to generate a default password (roll number)
const generateDefaultPassword = (rollNumber) => {
  return rollNumber || 'student123';
};

// Function to format floor number
const formatFloor = (floorNo) => {
  if (!floorNo) return '1st Floor';
  
  const floorNumber = parseInt(floorNo.toString()) || 1;
  switch (floorNumber) {
    case 1: return '1st Floor';
    case 2: return '2nd Floor';
    case 3: return '3rd Floor';
    case 4: return '4th Floor';
    default: return '1st Floor';
  }
};

// Main import function
const importStudentsFromCSV = async () => {
  try {
    await connectDB();
    
    const csvFilePath = path.join(__dirname, '../../Students-Details.csv');
    const students = [];
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log('Reading CSV file:', csvFilePath);
    
    // Check if file exists
    if (!fs.existsSync(csvFilePath)) {
      console.error('CSV file not found:', csvFilePath);
      process.exit(1);
    }

    // Read and parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            // Skip rows without essential data
            if (!row['NAME OF THE STUDENT'] || !row['ROLL NO']) {
              console.log('Skipping row due to missing name or roll number:', row);
              skippedCount++;
              return;
            }

            const student = {
              name: row['NAME OF THE STUDENT'].trim(),
              rollNumber: row['ROLL NO'].trim(),
              phoneNumber: cleanPhoneNumber(row['PHONE NO']),
              parentPhoneNumber: cleanPhoneNumber(row['Parents NUM']),
              hostelBlock: row['Block'] ? row['Block'].trim() : 'D-Block',
              floor: formatFloor(row['Floor No']),
              roomNumber: row['ROOM NO'] ? row['ROOM NO'].trim() : '',
              branch: row['BRANCH'] ? row['BRANCH'].trim() : 'Computer Science',
              semester: convertYearToSemester(row['YEAR']),
              password: generateDefaultPassword(row['ROLL NO']),
              role: 'student'
            };

            students.push(student);
          } catch (error) {
            console.error('Error processing row:', row, error);
            errorCount++;
          }
        })
        .on('end', () => {
          console.log(`CSV parsing completed. Found ${students.length} valid student records.`);
          resolve();
        })
        .on('error', reject);
    });

    console.log('Starting database import...');
    
    // Clear existing students collection to avoid conflicts
    console.log('Clearing existing students collection...');
    await Student.deleteMany({});
    console.log('Existing students cleared.');

    // Import students to database in batches
    const batchSize = 50;
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      
      try {
        // Insert batch of students
        const insertedStudents = await Student.insertMany(batch, { ordered: false });
        processedCount += insertedStudents.length;
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1}: ${insertedStudents.length} students`);
      } catch (error) {
        // Handle individual errors in batch
        for (const studentData of batch) {
          try {
            const newStudent = new Student(studentData);
            await newStudent.save();
            processedCount++;
            console.log(`Created student: ${studentData.name} (${studentData.rollNumber})`);
          } catch (individualError) {
            console.error(`Error importing student ${studentData.rollNumber}:`, individualError.message);
            errorCount++;
          }
        }
      }
    }

    console.log('\n=== Import Summary ===');
    console.log(`Total records processed: ${processedCount}`);
    console.log(`Records skipped: ${skippedCount}`);
    console.log(`Errors encountered: ${errorCount}`);
    console.log('Import completed successfully!');

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

// Run the import
if (require.main === module) {
  importStudentsFromCSV();
}

module.exports = importStudentsFromCSV;