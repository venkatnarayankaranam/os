require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createCorrectHostelStaff = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🏢 CREATING CORRECT HOSTEL STAFF STRUCTURE\n');
    console.log('📋 STRUCTURE:');
    console.log('• D-Block: Boys Hostel');
    console.log('• E-Block: Boys Hostel');
    console.log('• W-Block: Women\'s Hostel\n');

    // First, remove any incorrect E-Block staff created for women
    console.log('🧹 CLEANING UP INCORRECT STAFF...');
    await User.deleteMany({ 
      email: { $regex: /\.e@kietgroup\.com$/ },
      role: { $in: ['floor-incharge', 'hostel-incharge', 'warden'] }
    });
    console.log('✅ Removed old E-Block staff (that were meant for women)\n');

    const allUsers = [];

    // D-Block Staff (Boys) - Keep existing
    console.log('🏢 D-BLOCK (BOYS HOSTEL) STAFF:');
    
    // Floor Incharges for D Block
    const dBlockFloorIncharges = [
      {
        name: "Floor Incharge 1st Floor - D Block",
        email: "floorincharge1.d@kietgroup.com",
        password: "FloorIncharge@1",
        role: "floor-incharge",
        hostelBlock: "D-Block",
        floor: "1st Floor",
        roomNumber: "D-FI-101",
        phoneNumber: "9876543211",
        staffId: "FI-D-001",
        assignedFloor: ["1st Floor"]
      },
      {
        name: "Floor Incharge 2nd Floor - D Block", 
        email: "floorincharge2.d@kietgroup.com",
        password: "FloorIncharge@2",
        role: "floor-incharge",
        hostelBlock: "D-Block",
        floor: "2nd Floor",
        roomNumber: "D-FI-201",
        phoneNumber: "9876543212",
        staffId: "FI-D-002",
        assignedFloor: ["2nd Floor"]
      },
      {
        name: "Floor Incharge 3rd Floor - D Block",
        email: "floorincharge3.d@kietgroup.com", 
        password: "FloorIncharge@3",
        role: "floor-incharge",
        hostelBlock: "D-Block",
        floor: "3rd Floor",
        roomNumber: "D-FI-301",
        phoneNumber: "9876543213",
        staffId: "FI-D-003",
        assignedFloor: ["3rd Floor"]
      },
      {
        name: "Floor Incharge 4th Floor - D Block",
        email: "floorincharge4.d@kietgroup.com",
        password: "FloorIncharge@4", 
        role: "floor-incharge",
        hostelBlock: "D-Block",
        floor: "4th Floor",
        roomNumber: "D-FI-401",
        phoneNumber: "9876543214",
        staffId: "FI-D-004",
        assignedFloor: ["4th Floor"]
      }
    ];

    // E-Block Staff (Boys) - Create new
    console.log('🏢 E-BLOCK (BOYS HOSTEL) STAFF:');
    
    const eBlockFloorIncharges = [
      {
        name: "Floor Incharge 1st Floor - E Block",
        email: "floorincharge1.e@kietgroup.com",
        password: "FloorIncharge@1",
        role: "floor-incharge", 
        hostelBlock: "E-Block",
        floor: "1st Floor",
        roomNumber: "E-FI-101",
        phoneNumber: "9876543221",
        staffId: "FI-E-001",
        assignedFloor: ["1st Floor"]
      },
      {
        name: "Floor Incharge 2nd Floor - E Block",
        email: "floorincharge2.e@kietgroup.com",
        password: "FloorIncharge@2",
        role: "floor-incharge",
        hostelBlock: "E-Block", 
        floor: "2nd Floor",
        roomNumber: "E-FI-201",
        phoneNumber: "9876543222",
        staffId: "FI-E-002",
        assignedFloor: ["2nd Floor"]
      },
      {
        name: "Floor Incharge 3rd Floor - E Block",
        email: "floorincharge3.e@kietgroup.com",
        password: "FloorIncharge@3",
        role: "floor-incharge",
        hostelBlock: "E-Block",
        floor: "3rd Floor", 
        roomNumber: "E-FI-301",
        phoneNumber: "9876543223",
        staffId: "FI-E-003",
        assignedFloor: ["3rd Floor"]
      },
      {
        name: "Floor Incharge 4th Floor - E Block",
        email: "floorincharge4.e@kietgroup.com",
        password: "FloorIncharge@4",
        role: "floor-incharge",
        hostelBlock: "E-Block",
        floor: "4th Floor",
        roomNumber: "E-FI-401", 
        phoneNumber: "9876543224",
        staffId: "FI-E-004",
        assignedFloor: ["4th Floor"]
      }
    ];

    // W-Block Staff (Women) - Create new  
    console.log('🏢 W-BLOCK (WOMEN\'S HOSTEL) STAFF:');
    
    const wBlockFloorIncharges = [
      {
        name: "Floor Incharge 1st Floor - W Block",
        email: "floorincharge1.w@kietgroup.com",
        password: "FloorIncharge@1",
        role: "floor-incharge",
        hostelBlock: "W-Block",
        floor: "1st Floor",
        roomNumber: "W-FI-101",
        phoneNumber: "9876543231", 
        staffId: "FI-W-001",
        assignedFloor: ["1st Floor"]
      },
      {
        name: "Floor Incharge 2nd Floor - W Block",
        email: "floorincharge2.w@kietgroup.com",
        password: "FloorIncharge@2",
        role: "floor-incharge",
        hostelBlock: "W-Block",
        floor: "2nd Floor",
        roomNumber: "W-FI-201",
        phoneNumber: "9876543232",
        staffId: "FI-W-002", 
        assignedFloor: ["2nd Floor"]
      },
      {
        name: "Floor Incharge 3rd Floor - W Block",
        email: "floorincharge3.w@kietgroup.com",
        password: "FloorIncharge@3",
        role: "floor-incharge",
        hostelBlock: "W-Block",
        floor: "3rd Floor",
        roomNumber: "W-FI-301",
        phoneNumber: "9876543233",
        staffId: "FI-W-003",
        assignedFloor: ["3rd Floor"]
      },
      {
        name: "Floor Incharge 4th Floor - W Block",
        email: "floorincharge4.w@kietgroup.com", 
        password: "FloorIncharge@4",
        role: "floor-incharge",
        hostelBlock: "W-Block",
        floor: "4th Floor",
        roomNumber: "W-FI-401",
        phoneNumber: "9876543234",
        staffId: "FI-W-004",
        assignedFloor: ["4th Floor"]
      }
    ];

    // Hostel Incharges
    const hostelIncharges = [
      {
        name: "Hostel Incharge - D Block",
        email: "hostelincharge.d@kietgroup.com",
        password: "HostelIncharge@d",
        role: "hostel-incharge",
        hostelBlock: "D-Block",
        roomNumber: "D-HI-OFFICE",
        phoneNumber: "9876543101",
        staffId: "HI-D-001",
        assignedBlocks: ["D-Block"]
      },
      {
        name: "Hostel Incharge - E Block",
        email: "hostelincharge.e@kietgroup.com", 
        password: "HostelIncharge@e",
        role: "hostel-incharge",
        hostelBlock: "E-Block",
        roomNumber: "E-HI-OFFICE",
        phoneNumber: "9876543102",
        staffId: "HI-E-001",
        assignedBlocks: ["E-Block"]
      },
      {
        name: "Hostel Incharge - W Block",
        email: "hostelincharge.w@kietgroup.com",
        password: "HostelIncharge@w",
        role: "hostel-incharge",
        hostelBlock: "W-Block",
        roomNumber: "W-HI-OFFICE",
        phoneNumber: "9876543103",
        staffId: "HI-W-001",
        assignedBlocks: ["W-Block"]
      }
    ];

    // Wardens
    const wardens = [
      {
        name: "Warden - D Block",
        email: "warden.d@kietgroup.com",
        password: "Warden@d",
        role: "warden",
        hostelBlock: "D-Block",
        roomNumber: "D-WARDEN-OFFICE",
        phoneNumber: "9876543001",
        staffId: "W-D-001",
        assignedBlocks: ["D-Block"]
      },
      {
        name: "Warden - E Block", 
        email: "warden.e@kietgroup.com",
        password: "Warden@e",
        role: "warden",
        hostelBlock: "E-Block",
        roomNumber: "E-WARDEN-OFFICE",
        phoneNumber: "9876543002",
        staffId: "W-E-001",
        assignedBlocks: ["E-Block"]
      },
      {
        name: "Warden - W Block",
        email: "warden.w@kietgroup.com",
        password: "Warden@w",
        role: "warden",
        hostelBlock: "W-Block",
        roomNumber: "W-WARDEN-OFFICE",
        phoneNumber: "9876543003",
        staffId: "W-W-001",
        assignedBlocks: ["W-Block"]
      }
    ];

    // Combine all users
    allUsers.push(...dBlockFloorIncharges, ...eBlockFloorIncharges, ...wBlockFloorIncharges, ...hostelIncharges, ...wardens);

    console.log('\n🔐 CREATING USER ACCOUNTS...');
    let created = 0;
    let skipped = 0;

    for (const userData of allUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        
        if (existingUser) {
          console.log(`⚠️  User already exists: ${userData.email}`);
          skipped++;
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        userData.password = hashedPassword;

        // Create user
        const newUser = new User(userData);
        await newUser.save();
        
        console.log(`✅ Created: ${userData.name} (${userData.email})`);
        created++;
      } catch (error) {
        console.error(`❌ Error creating user ${userData.email}:`, error.message);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`✅ Created: ${created} users`);
    console.log(`⚠️  Skipped: ${skipped} users (already exist)`);
    console.log(`📧 Total users processed: ${allUsers.length}`);

    console.log('\n🔐 LOGIN CREDENTIALS SUMMARY:\n');

    console.log('--- D BLOCK (Boys Hostel) ---');
    console.log('Floor Incharges:');
    console.log('1st Floor: floorincharge1.d@kietgroup.com / FloorIncharge@1');
    console.log('2nd Floor: floorincharge2.d@kietgroup.com / FloorIncharge@2');
    console.log('3rd Floor: floorincharge3.d@kietgroup.com / FloorIncharge@3');
    console.log('4th Floor: floorincharge4.d@kietgroup.com / FloorIncharge@4');
    console.log('Hostel Incharge: hostelincharge.d@kietgroup.com / HostelIncharge@d');
    console.log('Warden: warden.d@kietgroup.com / Warden@d');

    console.log('\n--- E BLOCK (Boys Hostel) ---');
    console.log('Floor Incharges:');
    console.log('1st Floor: floorincharge1.e@kietgroup.com / FloorIncharge@1');
    console.log('2nd Floor: floorincharge2.e@kietgroup.com / FloorIncharge@2');
    console.log('3rd Floor: floorincharge3.e@kietgroup.com / FloorIncharge@3');
    console.log('4th Floor: floorincharge4.e@kietgroup.com / FloorIncharge@4');
    console.log('Hostel Incharge: hostelincharge.e@kietgroup.com / HostelIncharge@e');
    console.log('Warden: warden.e@kietgroup.com / Warden@e');

    console.log('\n--- W BLOCK (Women\'s Hostel) ---');
    console.log('Floor Incharges:');
    console.log('1st Floor: floorincharge1.w@kietgroup.com / FloorIncharge@1');
    console.log('2nd Floor: floorincharge2.w@kietgroup.com / FloorIncharge@2');
    console.log('3rd Floor: floorincharge3.w@kietgroup.com / FloorIncharge@3');
    console.log('4th Floor: floorincharge4.w@kietgroup.com / FloorIncharge@4');
    console.log('Hostel Incharge: hostelincharge.w@kietgroup.com / HostelIncharge@w');
    console.log('Warden: warden.w@kietgroup.com / Warden@w');

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error creating hostel staff:', error);
    process.exit(1);
  }
};

createCorrectHostelStaff();