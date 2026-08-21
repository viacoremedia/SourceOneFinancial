const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function checkHighVisitAccounts() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({ relationshipDemand: 'high_tlc' }).lean();

  console.log(`Auditing all ${profiles.length} High TLC accounts for Over-Servicing / Low Yield / Underwriting Friction...\n`);

  const problematicTlc = [];

  for (const p of profiles) {
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const yieldPerVisit = visits > 0 ? Math.round(volume / visits) : 0;
    const approvalRate = p.pipelineStats?.approvalRatePct || 0;
    const lookToBook = p.pipelineStats?.lookToBookPct || 0;

    const reasons = [];

    // Reason 1: High visits (>= 15) with low yield (< $30K per visit)
    if (visits >= 15 && yieldPerVisit < 30000) {
      reasons.push(`High Visits (${visits} visits, $${(yieldPerVisit/1000).toFixed(1)}K yield/visit)`);
    }

    // Reason 2: Severe Underwriting Friction (>= 50 apps, < 20% approval rate or < 8% look to book)
    if (apps >= 50 && (approvalRate < 20 || lookToBook < 8)) {
      reasons.push(`Underwriting Friction (${apps} apps, ${approvalRate}% appr, ${lookToBook}% ltb)`);
    }

    // Reason 3: High visits with low total bookings (>= 10 visits with <= 5 bookings and < $300K vol)
    if (visits >= 10 && bookings <= 5 && volume < 300000) {
      reasons.push(`Low Conversion (${visits} visits, ${bookings} deals, $${(volume/1000).toFixed(0)}K vol)`);
    }

    // Reason 4: Zero bookings in last 12 months despite visits
    if (reasons.length > 0) {
      problematicTlc.push({
        id: p.clientDealerId,
        name: p.dealerName.slice(0, 26),
        rep: p.assignedRep || 'House',
        visits,
        apps,
        bookings,
        vol: '$' + (volume / 1000).toFixed(0) + 'K',
        yield: '$' + (yieldPerVisit / 1000).toFixed(1) + 'K',
        apprRate: approvalRate + '%',
        ltb: lookToBook + '%',
        lift: (p.postVisitBookedLiftPct || 0) + '%',
        reasons: reasons.join(' | ')
      });
    }
  }

  console.log(`Found ${problematicTlc.length} High TLC accounts with over-servicing / low yield / underwriting friction:\n`);
  console.table(problematicTlc);

  await mongoose.disconnect();
}
checkHighVisitAccounts().catch(e => { console.error(e); process.exit(1); });
