const https = require('https');
const apiKey = 'fb0874e8859697594ab751f04cf263453310d3e1';

async function fetchCustomers(page = 1) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'badgerapis.badgermapping.com',
      path: '/api/2/customers/?page=' + page,
      method: 'GET',
      headers: {
        'Authorization': 'Token ' + apiKey,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: e.message, raw: data.slice(0, 200) });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const list = await fetchCustomers(1);
  console.log('Fetched customers count on page 1:', Array.isArray(list) ? list.length : 'Not array');
  
  if (!Array.isArray(list)) {
    console.log('Response:', list);
    return;
  }

  // Count non-empty occurrences of all fields across the entire page
  const fieldCounts = {};
  for (const c of list) {
    for (const [k, v] of Object.entries(c)) {
      if (v !== null && v !== '' && v !== undefined) {
        fieldCounts[k] = (fieldCounts[k] || 0) + 1;
      }
    }
  }

  console.log('\n=== FIELD OCCURRENCE COUNTS (Page 1 - ' + list.length + ' accounts) ===');
  for (const [k, count] of Object.entries(fieldCounts)) {
    console.log(k.padEnd(20) + ': ' + count);
  }

  console.log('\n=== SAMPLE CUSTOMERS (5 samples) ===');
  for (let i = 0; i < Math.min(5, list.length); i++) {
    const c = list[i];
    console.log('\n--- Customer ' + (i + 1) + ': ' + (c.full_name || c.last_name) + ' ---');
    console.log('ID:', c.id, '| Customer ID:', c.customer_id, '| Phone:', c.phone_number, '| Email:', c.email);
    console.log('Address:', c.original_address);
    console.log('Account Owner:', c.account_owner);
    console.log('Non-empty custom fields:');
    for (const [k, v] of Object.entries(c)) {
      if (v !== null && v !== '' && (k.startsWith('custom_') || k === 'notes')) {
        console.log('  ' + k + ' -> ' + JSON.stringify(v));
      }
    }
  }
}

run().catch(console.error);
