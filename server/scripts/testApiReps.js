Promise.all([
  fetch('http://localhost:3000/api/analytics/historical/mom?rep=Bruce').then(r => r.json()),
  fetch('http://localhost:3000/api/analytics/historical/mom?rep=George').then(r => r.json()),
  fetch('http://localhost:3000/api/analytics/historical/mom?rep=Jeff').then(r => r.json()),
  fetch('http://localhost:3000/api/analytics/historical/mom?rep=Pam%2FWard').then(r => r.json())
]).then(([bruce, george, jeff, pam]) => {
  console.log('--- REP API RESULTS ---');
  console.log('Bruce (edominguez) Jul 2026 Apps:', bruce.months?.[bruce.months.length - 1]?.stats?.apps, 'Active Dealers:', bruce.months?.[bruce.months.length - 1]?.cohorts?.active);
  console.log('George (gott) Jul 2026 Apps:', george.months?.[george.months.length - 1]?.stats?.apps, 'Active Dealers:', george.months?.[george.months.length - 1]?.cohorts?.active);
  console.log('Jeff (jweller) Jul 2026 Apps:', jeff.months?.[jeff.months.length - 1]?.stats?.apps, 'Active Dealers:', jeff.months?.[jeff.months.length - 1]?.cohorts?.active);
  console.log('Pam/Ward (wstoutimore) Jul 2026 Apps:', pam.months?.[pam.months.length - 1]?.stats?.apps, 'Active Dealers:', pam.months?.[pam.months.length - 1]?.cohorts?.active);
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
