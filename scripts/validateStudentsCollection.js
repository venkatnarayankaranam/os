require('dotenv').config();
const mongoose = require('mongoose');

const validateStudentsCollection = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outing-system');
    console.log('Connected to MongoDB');

    console.log('🔍 VALIDATING STUDENTS COLLECTION FOR HOSTEL HIERARCHY\n');

    const db = mongoose.connection.db;
    const studentsCollection = db.collection('students');

    const totalStudents = await studentsCollection.countDocuments();
    console.log(`👥 Total students in collection: ${totalStudents}`);

    // Check required fields for hierarchy mapping
    console.log('\n📋 REQUIRED FIELDS ANALYSIS:');
    
    const fieldChecks = [
      { field: 'name', required: true },
      { field: 'email', required: true },
      { field: 'rollNumber', required: true },
      { field: 'hostelBlock', required: true },
      { field: 'floor', required: true },
      { field: 'roomNumber', required: true },
      { field: 'phoneNumber', required: false },
      { field: 'semester', required: false }
    ];

    for (const check of fieldChecks) {
      const validCount = await studentsCollection.countDocuments({
        [check.field]: { $exists: true, $ne: null, $ne: '' }
      });
      const percentage = ((validCount / totalStudents) * 100).toFixed(1);
      const status = check.required && validCount < totalStudents ? '❌' : '✅';
      console.log(`${status} ${check.field}: ${validCount}/${totalStudents} (${percentage}%)`);
    }

    // Detailed block analysis
    console.log('\n🏢 BLOCK DISTRIBUTION ANALYSIS:');
    const blockStats = await studentsCollection.aggregate([
      { $group: { _id: '$hostelBlock', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    blockStats.forEach(block => {
      console.log(`${block._id}: ${block.count} students`);
    });

    // Floor distribution by block
    console.log('\n🏠 FLOOR DISTRIBUTION BY BLOCK:');
    const floorStats = await studentsCollection.aggregate([
      { 
        $match: { 
          hostelBlock: { $in: ['D-Block', 'E-Block'] },
          floor: { $exists: true, $ne: null, $ne: '' }
        }
      },
      { $group: { _id: { block: '$hostelBlock', floor: '$floor' }, count: { $sum: 1 } } },
      { $sort: { '_id.block': 1, '_id.floor': 1 } }
    ]).toArray();

    let currentBlock = '';
    floorStats.forEach(item => {
      if (item._id.block !== currentBlock) {
        currentBlock = item._id.block;
        console.log(`\n${currentBlock}:`);
      }
      console.log(`  ${item._id.floor}: ${item.count} students`);
    });

    // Check for students that would be mapped to our created staff
    console.log('\n🔗 HIERARCHY MAPPING VALIDATION:');
    
    const dBlockStudents = await studentsCollection.countDocuments({ hostelBlock: 'D-Block' });
    const eBlockStudents = await studentsCollection.countDocuments({ hostelBlock: 'E-Block' });
    const unmappedStudents = await studentsCollection.countDocuments({ 
      hostelBlock: { $nin: ['D-Block', 'E-Block'] }
    });

    console.log(`D-Block students: ${dBlockStudents}`);
    console.log(`E-Block students: ${eBlockStudents}`);
    console.log(`Unmapped students: ${unmappedStudents}`);

    if (unmappedStudents > 0) {
      console.log('\n⚠️  UNMAPPED STUDENT BLOCKS:');
      const unmappedBlocks = await studentsCollection.aggregate([
        { $match: { hostelBlock: { $nin: ['D-Block', 'E-Block'] } } },
        { $group: { _id: '$hostelBlock', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();

      unmappedBlocks.forEach(block => {
        console.log(`"${block._id}": ${block.count} students`);
      });
    }

    // Sample approval workflow mapping
    console.log('\n🔄 SAMPLE APPROVAL WORKFLOW MAPPINGS:');
    
    // Get sample students from each block and floor
    const sampleMappings = await studentsCollection.aggregate([
      { $match: { hostelBlock: { $in: ['D-Block', 'E-Block'] } } },
      { $group: { 
          _id: { block: '$hostelBlock', floor: '$floor' }, 
          sample: { $first: '$$ROOT' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.block': 1, '_id.floor': 1 } },
      { $limit: 10 }
    ]).toArray();

    sampleMappings.forEach(mapping => {
      const student = mapping.sample;
      const block = mapping._id.block;
      const floor = mapping._id.floor;
      
      console.log(`\n${student.name} (${student.rollNumber}) - ${block}, ${floor}:`);
      
      // Determine floor incharge email
      const floorNum = floor?.charAt(0); // Get first character (1, 2, 3, 4)
      const blockCode = block === 'D-Block' ? 'd' : 'e';
      const floorInchargeEmail = `floorincharge${floorNum}.${blockCode}@kietgroup.com`;
      const hostelInchargeEmail = `hostelincharge.${blockCode}@kietgroup.com`;
      const wardenEmail = `warden.${blockCode}@kietgroup.com`;
      
      console.log(`  1. Floor Incharge: ${floorInchargeEmail}`);
      console.log(`  2. Hostel Incharge: ${hostelInchargeEmail}`);
      console.log(`  3. Warden: ${wardenEmail}`);
      console.log(`  (${mapping.count} students with same block/floor)`);
    });

    // Final validation summary
    console.log('\n📊 VALIDATION SUMMARY:');
    
    const validStudents = await studentsCollection.countDocuments({
      name: { $exists: true, $ne: null, $ne: '' },
      email: { $exists: true, $ne: null, $ne: '' },
      rollNumber: { $exists: true, $ne: null, $ne: '' },
      hostelBlock: { $in: ['D-Block', 'E-Block'] },
      floor: { $exists: true, $ne: null, $ne: '' },
      roomNumber: { $exists: true, $ne: null, $ne: '' }
    });

    const validationPercentage = ((validStudents / totalStudents) * 100).toFixed(1);
    
    console.log(`✅ Students ready for hierarchy: ${validStudents}/${totalStudents} (${validationPercentage}%)`);
    
    if (validStudents === totalStudents) {
      console.log('🎉 ALL STUDENTS ARE PROPERLY MAPPED FOR HOSTEL HIERARCHY!');
    } else {
      console.log(`⚠️  ${totalStudents - validStudents} students need attention before full deployment`);
    }

    console.log('\n🔧 NEXT STEPS:');
    if (unmappedStudents > 0) {
      console.log('1. Run standardizeStudentBlocks.js to fix block naming');
    }
    console.log('2. Implement approval workflow using students collection');
    console.log('3. Update outing request logic to use proper student hierarchy');
    console.log('4. Test approval flow with sample requests');

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error validating students collection:', error);
    process.exit(1);
  }
};

validateStudentsCollection();