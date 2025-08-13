const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: '../.env' });

// Import User model
const User = require('../models/User');

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

const verifyEndToEndLogin = async () => {
  try {
    console.log('🔍 End-to-End Student Login Verification\n');
    
    // Get 3 random students for testing
    const randomStudents = await User.aggregate([
      { $match: { role: 'student' } },
      { $sample: { size: 3 } }
    ]);
    
    console.log(`📝 Testing login for ${randomStudents.length} random students:\n`);
    
    const serverUrl = 'http://localhost:5000'; // Adjust if server is on different port
    
    for (let i = 0; i < randomStudents.length; i++) {
      const student = randomStudents[i];
      console.log(`🧪 Test ${i + 1}: ${student.name} (${student.rollNumber})`);
      
      try {
        // Test login API call
        const loginResponse = await axios.post(`${serverUrl}/auth/login`, {
          email: student.rollNumber, // Using rollNumber as email field
          password: student.rollNumber
        });
        
        if (loginResponse.data.success) {
          console.log(`   ✅ Login successful`);
          console.log(`   🔑 Token received: ${loginResponse.data.token ? 'Yes' : 'No'}`);
          console.log(`   👤 User data:`, {
            name: loginResponse.data.user.name,
            rollNumber: loginResponse.data.user.rollNumber,
            role: loginResponse.data.user.role,
            hostelBlock: loginResponse.data.user.hostelBlock,
            floor: loginResponse.data.user.floor,
            roomNumber: loginResponse.data.user.roomNumber
          });
          
          // Test token verification
          try {
            const verifyResponse = await axios.get(`${serverUrl}/auth/verify`, {
              headers: {
                'Authorization': `Bearer ${loginResponse.data.token}`
              }
            });
            
            if (verifyResponse.data.success) {
              console.log(`   ✅ Token verification successful`);
            } else {
              console.log(`   ❌ Token verification failed`);
            }
          } catch (verifyError) {
            console.log(`   ❌ Token verification error:`, verifyError.message);
          }
          
        } else {
          console.log(`   ❌ Login failed:`, loginResponse.data.message);
        }
      } catch (loginError) {
        if (loginError.response) {
          console.log(`   ❌ Login API error:`, loginError.response.data.message);
        } else {
          console.log(`   ❌ Network error:`, loginError.message);
        }
      }
      
      console.log(''); // Empty line for readability
    }
    
    // Test invalid login
    console.log('🚫 Testing invalid login credentials:');
    try {
      const invalidResponse = await axios.post(`${serverUrl}/auth/login`, {
        email: 'INVALID123',
        password: 'WRONGPASS'
      });
      console.log('   ❌ Invalid login should have failed but succeeded');
    } catch (invalidError) {
      if (invalidError.response && invalidError.response.status === 400) {
        console.log('   ✅ Invalid login correctly rejected');
      } else {
        console.log('   ⚠️  Unexpected error for invalid login:', invalidError.message);
      }
    }
    
    console.log('\n🎉 End-to-end verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await verifyEndToEndLogin();
    
    console.log('\n✅ All end-to-end tests completed!');
    console.log('\n🌐 System is ready for use:');
    console.log('   - Server: http://localhost:5000');
    console.log('   - Client: http://localhost:5174');
    console.log('   - Students can login with roll number as username and password');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Main process failed:', error);
    process.exit(1);
  }
};

// Run the verification
if (require.main === module) {
  main();
}

module.exports = { verifyEndToEndLogin };