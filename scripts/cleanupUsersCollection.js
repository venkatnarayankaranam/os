const mongoose = require('mongoose');
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

const cleanupUsersCollection = async () => {
  try {
    console.log('🧹 Cleaning up users collection...\n');
    
    // First, let's see what's in the users collection
    const totalUsers = await User.countDocuments({});
    const studentUsers = await User.countDocuments({ role: 'student' });
    const adminUsers = await User.countDocuments({ role: { $ne: 'student' } });
    
    console.log('📊 Current users collection status:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Student users: ${studentUsers}`);
    console.log(`   Admin/Staff users: ${adminUsers}`);
    
    // Get a sample of admin users to preserve
    const adminUsersSample = await User.find({ role: { $ne: 'student' } }).limit(5);
    console.log('\n👨‍💼 Admin/Staff users to preserve:');
    adminUsersSample.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    
    // Delete only student users from users collection
    console.log('\n🗑️ Removing student users from users collection...');
    const deleteResult = await User.deleteMany({ role: 'student' });
    console.log(`✅ Deleted ${deleteResult.deletedCount} student users`);
    
    // Verify cleanup
    const remainingUsers = await User.countDocuments({});
    const remainingStudents = await User.countDocuments({ role: 'student' });
    const remainingAdmins = await User.countDocuments({ role: { $ne: 'student' } });
    
    console.log('\n📊 After cleanup:');
    console.log(`   Total users: ${remainingUsers}`);
    console.log(`   Student users: ${remainingStudents}`);
    console.log(`   Admin/Staff users: ${remainingAdmins}`);
    
    if (remainingStudents === 0) {
      console.log('✅ Cleanup successful - no students left in users collection');
    } else {
      console.log('❌ Cleanup incomplete - still have students in users collection');
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await cleanupUsersCollection();
    
    console.log('\n🎉 Users collection cleanup completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Main process failed:', error);
    process.exit(1);
  }
};

// Run the cleanup
if (require.main === module) {
  main();
}

module.exports = { cleanupUsersCollection };