const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

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

const checkDatabaseInfo = async () => {
  try {
    console.log('🔍 DATABASE INVESTIGATION...\n');
    
    // Show connection details
    console.log('🔗 CONNECTION INFO:');
    console.log(`   URI: ${process.env.MONGO_URI || 'mongodb://localhost:27017/outing-app'}`);
    console.log(`   Database Name: ${mongoose.connection.db.databaseName}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port}`);
    
    const admin = mongoose.connection.db.admin();
    
    // List all databases
    console.log('\n📊 ALL DATABASES:');
    const databases = await admin.listDatabases();
    databases.databases.forEach(db => {
      console.log(`   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Check current database collections
    console.log(`\n📂 COLLECTIONS IN CURRENT DATABASE (${mongoose.connection.db.databaseName}):`);
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`   - ${col.name}: ${count} documents`);
      
      // If it's a collection with data, show a sample
      if (count > 0 && count < 10) {
        const sample = await mongoose.connection.db.collection(col.name).findOne();
        console.log(`     Sample keys: ${Object.keys(sample || {}).slice(0, 5).join(', ')}...`);
      }
    }
    
    // Check if there might be requests in other databases
    for (const database of databases.databases) {
      if (database.name !== mongoose.connection.db.databaseName && 
          !database.name.startsWith('admin') && 
          !database.name.startsWith('local') &&
          !database.name.startsWith('config')) {
        
        console.log(`\n🔍 CHECKING OTHER DATABASE: ${database.name}`);
        const otherDb = mongoose.connection.client.db(database.name);
        const otherCollections = await otherDb.listCollections().toArray();
        
        for (const col of otherCollections) {
          const count = await otherDb.collection(col.name).countDocuments();
          if (count > 0) {
            console.log(`   - ${col.name}: ${count} documents`);
            
            // Check if this might contain outing requests
            if (col.name.toLowerCase().includes('request') || col.name.toLowerCase().includes('outing')) {
              console.log(`     🎯 POTENTIAL OUTING REQUESTS FOUND!`);
              const sample = await otherDb.collection(col.name).findOne();
              if (sample) {
                console.log(`     Sample keys: ${Object.keys(sample).slice(0, 10).join(', ')}`);
                
                // Check if it looks like an outing request
                if (sample.purpose || sample.outingDate || sample.studentId || sample.qrCode) {
                  console.log(`     🚨 THIS LOOKS LIKE OUTING REQUESTS! Database: ${database.name}, Collection: ${col.name}`);
                }
              }
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Database investigation failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await checkDatabaseInfo();
    process.exit(0);
  } catch (error) {
    console.error('❌ Investigation script failed:', error);
    process.exit(1);
  }
};

// Run the investigation
if (require.main === module) {
  main();
}

module.exports = { checkDatabaseInfo };