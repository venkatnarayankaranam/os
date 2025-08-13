require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');

console.log('🏢 MASTER HOSTEL SETUP SCRIPT');
console.log('===============================\n');

const executeScript = (scriptName) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`🚀 Executing: ${scriptName}`);
    console.log('─'.repeat(50));
    
    exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error executing ${scriptName}:`, error.message);
        reject(error);
        return;
      }
      
      if (stderr) {
        console.error(`⚠️  Warning from ${scriptName}:`, stderr);
      }
      
      console.log(stdout);
      console.log('─'.repeat(50));
      console.log(`✅ Completed: ${scriptName}\n`);
      resolve();
    });
  });
};

const runMasterSetup = async () => {
  try {
    console.log('📋 EXECUTION PLAN:');
    console.log('1. Create all hostel staff (Floor Incharges, Hostel Incharges, Wardens)');
    console.log('2. Validate student mapping fields');
    console.log('3. Setup and validate hostel hierarchy');
    console.log('4. Display final summary\n');

    console.log('⏳ Starting execution...\n');

    // Step 1: Create hostel staff
    await executeScript('createHostelStaff.js');

    // Step 2: Validate student mapping
    await executeScript('validateStudentMapping.js');

    // Step 3: Setup hostel hierarchy
    await executeScript('setupHostelHierarchy.js');

    console.log('🎉 MASTER SETUP COMPLETED SUCCESSFULLY!');
    console.log('=====================================\n');

    console.log('📝 WHAT WAS ACCOMPLISHED:');
    console.log('✅ Created Floor Incharges for D-Block (Men\'s Hostel) - 4 floors');
    console.log('✅ Created Hostel Incharge for D-Block');
    console.log('✅ Created Warden for D-Block');
    console.log('✅ Created Floor Incharges for E-Block (Women\'s Hostel) - 4 floors');
    console.log('✅ Created Hostel Incharge for E-Block');
    console.log('✅ Created Warden for E-Block');
    console.log('✅ Validated student mapping fields');
    console.log('✅ Verified hostel hierarchy structure\n');

    console.log('🔐 QUICK ACCESS CREDENTIALS:');
    console.log('─'.repeat(50));
    console.log('D-BLOCK (Men\'s Hostel):');
    console.log('Floor 1: floorincharge1.d@kietgroup.com / FloorIncharge@1');
    console.log('Floor 2: floorincharge2.d@kietgroup.com / FloorIncharge@2');
    console.log('Floor 3: floorincharge3.d@kietgroup.com / FloorIncharge@3');
    console.log('Floor 4: floorincharge4.d@kietgroup.com / FloorIncharge@4');
    console.log('Hostel: hostelincharge.d@kietgroup.com / HostelIncharge@d');
    console.log('Warden: warden.d@kietgroup.com / Warden@d\n');

    console.log('E-BLOCK (Women\'s Hostel):');
    console.log('Floor 1: floorincharge1.e@kietgroup.com / FloorIncharge@1');
    console.log('Floor 2: floorincharge2.e@kietgroup.com / FloorIncharge@2');
    console.log('Floor 3: floorincharge3.e@kietgroup.com / FloorIncharge@3');
    console.log('Floor 4: floorincharge4.e@kietgroup.com / FloorIncharge@4');
    console.log('Hostel: hostelincharge.e@kietgroup.com / HostelIncharge@e');
    console.log('Warden: warden.e@kietgroup.com / Warden@e\n');

    console.log('🔄 APPROVAL WORKFLOW:');
    console.log('Student Request → Floor Incharge (by floor & block) → Hostel Incharge (by block) → Warden (by block) → Approved\n');

    console.log('⚠️  NEXT STEPS:');
    console.log('1. Ensure all students have proper hostelBlock ("D-Block" or "E-Block")');
    console.log('2. Ensure all students have proper floor assignment');
    console.log('3. Update any existing outing workflow to use this hierarchy');
    console.log('4. Test the approval flow with sample requests\n');

    console.log('🔧 INDIVIDUAL SCRIPTS CAN BE RUN SEPARATELY:');
    console.log('- node scripts/createHostelStaff.js (Create/recreate staff)');
    console.log('- node scripts/validateStudentMapping.js (Check student fields)');
    console.log('- node scripts/setupHostelHierarchy.js (Validate hierarchy)\n');

  } catch (error) {
    console.error('❌ Master setup failed:', error.message);
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Ensure MongoDB is running');
    console.log('2. Check .env file has correct MONGODB_URI');
    console.log('3. Run individual scripts to identify specific issues');
    console.log('4. Check database connectivity');
    process.exit(1);
  }
};

runMasterSetup();