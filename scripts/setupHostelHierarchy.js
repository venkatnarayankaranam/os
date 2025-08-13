require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const setupHostelHierarchy = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🏢 HOSTEL HIERARCHY SETUP AND VALIDATION\n');

    // Get all hostel staff
    const floorIncharges = await User.find({ role: 'floor-incharge' });
    const hostelIncharges = await User.find({ role: 'hostel-incharge' });
    const wardens = await User.find({ role: 'warden' });
    const students = await User.find({ role: 'student' });

    console.log('📊 STAFF SUMMARY:');
    console.log(`Floor Incharges: ${floorIncharges.length}`);
    console.log(`Hostel Incharges: ${hostelIncharges.length}`);
    console.log(`Wardens: ${wardens.length}`);
    console.log(`Students: ${students.length}\n`);

    // Group staff by block
    const dBlockStaff = {
      floorIncharges: floorIncharges.filter(fi => fi.hostelBlock === 'D-Block'),
      hostelIncharge: hostelIncharges.find(hi => hi.assignedBlocks && hi.assignedBlocks.includes('D-Block')),
      warden: wardens.find(w => w.email.includes('.d@'))
    };

    const eBlockStaff = {
      floorIncharges: floorIncharges.filter(fi => fi.hostelBlock === 'E-Block'),
      hostelIncharge: hostelIncharges.find(hi => hi.assignedBlocks && hi.assignedBlocks.includes('E-Block')),
      warden: wardens.find(w => w.email.includes('.e@'))
    };

    console.log('🏢 D-BLOCK (Men\'s Hostel) STAFF:');
    console.log(`Floor Incharges: ${dBlockStaff.floorIncharges.length}`);
    dBlockStaff.floorIncharges.forEach(fi => {
      console.log(`  - ${fi.name} (${fi.floor}): ${fi.email}`);
    });
    console.log(`Hostel Incharge: ${dBlockStaff.hostelIncharge ? dBlockStaff.hostelIncharge.email : 'NOT FOUND'}`);
    console.log(`Warden: ${dBlockStaff.warden ? dBlockStaff.warden.email : 'NOT FOUND'}\n`);

    console.log('🏢 E-BLOCK (Women\'s Hostel) STAFF:');
    console.log(`Floor Incharges: ${eBlockStaff.floorIncharges.length}`);
    eBlockStaff.floorIncharges.forEach(fi => {
      console.log(`  - ${fi.name} (${fi.floor}): ${fi.email}`);
    });
    console.log(`Hostel Incharge: ${eBlockStaff.hostelIncharge ? eBlockStaff.hostelIncharge.email : 'NOT FOUND'}`);
    console.log(`Warden: ${eBlockStaff.warden ? eBlockStaff.warden.email : 'NOT FOUND'}\n`);

    // Analyze student distribution
    const dBlockStudents = students.filter(s => s.hostelBlock === 'D-Block');
    const eBlockStudents = students.filter(s => s.hostelBlock === 'E-Block');
    const unmappedStudents = students.filter(s => !s.hostelBlock || !['D-Block', 'E-Block'].includes(s.hostelBlock));

    console.log('👥 STUDENT DISTRIBUTION:');
    console.log(`D-Block Students: ${dBlockStudents.length}`);
    console.log(`E-Block Students: ${eBlockStudents.length}`);
    console.log(`Unmapped Students: ${unmappedStudents.length}\n`);

    if (unmappedStudents.length > 0) {
      console.log('⚠️  UNMAPPED STUDENTS (Need Block Assignment):');
      unmappedStudents.slice(0, 5).forEach(s => {
        console.log(`  - ${s.name} (${s.email}) - Block: ${s.hostelBlock || 'MISSING'}`);
      });
      if (unmappedStudents.length > 5) {
        console.log(`  ... and ${unmappedStudents.length - 5} more`);
      }
      console.log();
    }

    // Create workflow mapping function
    const getApprovalChain = (studentBlock, studentFloor) => {
      let chain = [];
      
      if (studentBlock === 'D-Block') {
        const floorIncharge = dBlockStaff.floorIncharges.find(fi => fi.floor === studentFloor);
        if (floorIncharge) chain.push({ role: 'Floor Incharge', name: floorIncharge.name, email: floorIncharge.email });
        if (dBlockStaff.hostelIncharge) chain.push({ role: 'Hostel Incharge', name: dBlockStaff.hostelIncharge.name, email: dBlockStaff.hostelIncharge.email });
        if (dBlockStaff.warden) chain.push({ role: 'Warden', name: dBlockStaff.warden.name, email: dBlockStaff.warden.email });
      } else if (studentBlock === 'E-Block') {
        const floorIncharge = eBlockStaff.floorIncharges.find(fi => fi.floor === studentFloor);
        if (floorIncharge) chain.push({ role: 'Floor Incharge', name: floorIncharge.name, email: floorIncharge.email });
        if (eBlockStaff.hostelIncharge) chain.push({ role: 'Hostel Incharge', name: eBlockStaff.hostelIncharge.name, email: eBlockStaff.hostelIncharge.email });
        if (eBlockStaff.warden) chain.push({ role: 'Warden', name: eBlockStaff.warden.name, email: eBlockStaff.warden.email });
      }
      
      return chain;
    };

    // Test approval chain for sample students
    console.log('🔄 SAMPLE APPROVAL CHAINS:\n');
    
    const sampleDStudent = dBlockStudents.find(s => s.floor);
    if (sampleDStudent) {
      console.log(`D-Block Student: ${sampleDStudent.name} (${sampleDStudent.floor})`);
      const dChain = getApprovalChain(sampleDStudent.hostelBlock, sampleDStudent.floor);
      dChain.forEach((approver, index) => {
        console.log(`  ${index + 1}. ${approver.role}: ${approver.name} (${approver.email})`);
      });
      console.log();
    }

    const sampleEStudent = eBlockStudents.find(s => s.floor);
    if (sampleEStudent) {
      console.log(`E-Block Student: ${sampleEStudent.name} (${sampleEStudent.floor})`);
      const eChain = getApprovalChain(sampleEStudent.hostelBlock, sampleEStudent.floor);
      eChain.forEach((approver, index) => {
        console.log(`  ${index + 1}. ${approver.role}: ${approver.name} (${approver.email})`);
      });
      console.log();
    }

    // Validation checks
    console.log('✅ HIERARCHY VALIDATION:');
    let validationPassed = true;

    // Check D-Block completeness
    if (dBlockStaff.floorIncharges.length !== 4) {
      console.log(`❌ D-Block missing floor incharges (${dBlockStaff.floorIncharges.length}/4)`);
      validationPassed = false;
    } else {
      console.log('✅ D-Block has all 4 floor incharges');
    }

    if (!dBlockStaff.hostelIncharge) {
      console.log('❌ D-Block missing hostel incharge');
      validationPassed = false;
    } else {
      console.log('✅ D-Block has hostel incharge');
    }

    if (!dBlockStaff.warden) {
      console.log('❌ D-Block missing warden');
      validationPassed = false;
    } else {
      console.log('✅ D-Block has warden');
    }

    // Check E-Block completeness
    if (eBlockStaff.floorIncharges.length !== 4) {
      console.log(`❌ E-Block missing floor incharges (${eBlockStaff.floorIncharges.length}/4)`);
      validationPassed = false;
    } else {
      console.log('✅ E-Block has all 4 floor incharges');
    }

    if (!eBlockStaff.hostelIncharge) {
      console.log('❌ E-Block missing hostel incharge');
      validationPassed = false;
    } else {
      console.log('✅ E-Block has hostel incharge');
    }

    if (!eBlockStaff.warden) {
      console.log('❌ E-Block missing warden');
      validationPassed = false;
    } else {
      console.log('✅ E-Block has warden');
    }

    console.log(`\n🏁 OVERALL STATUS: ${validationPassed ? '✅ HIERARCHY COMPLETE' : '❌ HIERARCHY INCOMPLETE'}`);

    if (!validationPassed) {
      console.log('\n🔧 ACTION REQUIRED:');
      console.log('Run the createHostelStaff.js script to create missing staff members');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error setting up hostel hierarchy:', error);
    process.exit(1);
  }
};

setupHostelHierarchy();