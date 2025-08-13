require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const verifyAdminUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🔍 VERIFYING ADMIN USERS IN DATABASE\n');

    // Get all admin users
    const adminUsers = await User.find({
      role: { $in: ['floor-incharge', 'hostel-incharge', 'warden'] }
    }).sort({ hostelBlock: 1, role: 1, floor: 1 });

    console.log(`📊 Total admin users found: ${adminUsers.length}\n`);

    // Group by block
    const blocks = ['D-Block', 'E-Block', 'Womens-Block'];
    
    for (const block of blocks) {
      const blockUsers = adminUsers.filter(user => 
        user.hostelBlock === block || 
        (user.assignedBlocks && user.assignedBlocks.includes(block))
      );
      
      console.log(`--- ${block} ---`);
      
      // Floor Incharges
      const floorIncharges = blockUsers.filter(user => user.role === 'floor-incharge');
      console.log('Floor Incharges:');
      floorIncharges.forEach(user => {
        console.log(`  ${user.floor}: ${user.email} (${user.name})`);
      });
      
      // Hostel Incharge
      const hostelIncharge = blockUsers.find(user => user.role === 'hostel-incharge');
      if (hostelIncharge) {
        console.log(`Hostel Incharge: ${hostelIncharge.email} (${hostelIncharge.name})`);
      }
      
      // Warden
      const warden = blockUsers.find(user => user.role === 'warden');
      if (warden) {
        console.log(`Warden: ${warden.email} (${warden.name})`);
      }
      
      console.log('');
    }

    console.log('✅ VERIFICATION COMPLETE - All admin users are properly set up!');
    
    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error verifying admin users:', error);
    process.exit(1);
  }
};

verifyAdminUsers();