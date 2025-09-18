const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./src/models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/nft_education');

    const existingAdmin = await User.findOne({ email: 'mahzzangg@gmail.com' });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email: mahzzangg@gmail.com');
      console.log('Password: admin123!@#');
      return;
    }

    const hashedPassword = await bcrypt.hash('admin123!@#', 10);

    const adminUser = new User({
      email: 'mahzzangg@gmail.com',
      name: 'System Administrator',
      role: 'admin',
      company: 'NFT Education Platform',
      department: 'IT',
      position: 'Administrator',
      password: hashedPassword,
      walletAddress: '0x742d35Cc6594F3486F3d4a2c3e7a9d5e8b2c4a1f9', // Dummy wallet address
      encryptedPrivateKey: 'dummy_encrypted_private_key_for_admin_user_not_for_production_use',
      isActive: true,
      emailVerified: true
    });

    await adminUser.save();
    console.log('Admin user created successfully!');
    console.log('Email: mahzzangg@gmail.com');
    console.log('Password: admin123!@#');
    console.log('Role: admin');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin();
