const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const User = require('../models/User');

async function testUsers() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('email name role').lean();
  console.log('Registered Users:', users);
  await mongoose.disconnect();
}
testUsers().catch(e => { console.error(e); process.exit(1); });
