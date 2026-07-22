#!/usr/bin/env python3
"""
Comprehensive analysis of the three OMNI data tables.
Outputs everything Josh needs to understand the scope of data received.
"""
import csv
import sys
import json
from collections import Counter, defaultdict
from datetime import datetime

csv.field_size_limit(sys.maxsize)

def parse_date(s):
    if not s or not s.strip():
        return None
    s = s.strip()
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

# ============================================================
# 1. DEALER INFORMATION TABLE
# ============================================================
print("=" * 70)
print("TABLE 1: DEALER INFORMATION")
print("=" * 70)

with open('Dealer information (july 20 2026) for VC.csv', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Total dealers: {len(rows)}")

# Active vs inactive
active = sum(1 for r in rows if r.get('ISACTIVE','').lower() == 'true')
inactive = sum(1 for r in rows if r.get('ISACTIVE','').lower() == 'false')
print(f"Active dealers: {active}")
print(f"Inactive dealers: {inactive}")

# States
states = Counter(r.get('DEALERSTATE','').strip() for r in rows if r.get('DEALERSTATE','').strip())
print(f"States covered: {len(states)}")
print(f"Top 15 states: {dict(states.most_common(15))}")

# Reps
reps = Counter(r.get('DEALERREPRESENTATIVE','').strip() for r in rows if r.get('DEALERREPRESENTATIVE','').strip())
print(f"Unique reps: {len(reps)}")
for rep, cnt in reps.most_common():
    print(f"  {rep}: {cnt} dealers")

# Dealer groups
groups = Counter(r.get('DEALERGROUP','').strip() for r in rows if r.get('DEALERGROUP','').strip())
print(f"Dealer groups: {len(groups)}")
if groups:
    print("Top 20 groups:")
    for g, cnt in groups.most_common(20):
        print(f"  {g}: {cnt} locations")

# Regions
regions = Counter(r.get('REGION','').strip() for r in rows if r.get('REGION','').strip())
print(f"Regions: {dict(regions)}")

# Collateral types
coll = Counter(r.get('COLLATERALTYPE','').strip() for r in rows if r.get('COLLATERALTYPE','').strip())
print(f"Collateral types: {dict(coll)}")

# Enrollment date range
enroll_dates = [parse_date(r.get('ENROLLMENTDATE','')) for r in rows]
enroll_dates = [d for d in enroll_dates if d]
if enroll_dates:
    print(f"Enrollment date range: {min(enroll_dates).strftime('%Y-%m-%d')} to {max(enroll_dates).strftime('%Y-%m-%d')}")

# Terminated dealers
terminated = sum(1 for r in rows if r.get('TERMINATIONDATE','').strip())
print(f"Terminated dealers: {terminated}")

print()

# ============================================================
# 2. SALES COMMUNICATION TABLE
# ============================================================
print("=" * 70)
print("TABLE 2: SALES COMMUNICATION (VISITS/CONTACTS)")
print("=" * 70)

with open('Sales communication for VC (July 20 2026).csv', 'r') as f:
    reader = csv.DictReader(f)
    comm_rows = list(reader)

print(f"Total communication records: {len(comm_rows)}")

# Date range
comm_dates = [parse_date(r.get('COMMUNICATIONEVENTDATETIME','')) for r in comm_rows]
comm_dates_valid = [d for d in comm_dates if d]
if comm_dates_valid:
    print(f"Date range: {min(comm_dates_valid).strftime('%Y-%m-%d')} to {max(comm_dates_valid).strftime('%Y-%m-%d')}")

# By month
monthly = Counter(d.strftime('%Y-%m') for d in comm_dates_valid)
print("Communications by month:")
for m in sorted(monthly.keys()):
    print(f"  {m}: {monthly[m]}")

# Reps
comm_reps_name = Counter(r.get('COMMUNICATIONUSERFULLNAME','').strip() for r in comm_rows if r.get('COMMUNICATIONUSERFULLNAME','').strip())
comm_reps_email = Counter(r.get('COMMUNICATIONUSEREMAIL','').strip() for r in comm_rows if r.get('COMMUNICATIONUSEREMAIL','').strip())
print(f"Unique rep names: {len(comm_reps_name)}")
for rep, cnt in comm_reps_name.most_common():
    print(f"  {rep}: {cnt} communications")

# Source system
sources = Counter(r.get('SOURCESYSTEM','').strip() for r in comm_rows if r.get('SOURCESYSTEM','').strip())
print(f"Source systems: {dict(sources)}")

# Communication results
results = Counter(r.get('COMMUNICATIONRESULT1','').strip() for r in comm_rows if r.get('COMMUNICATIONRESULT1','').strip())
print(f"Communication results ({len(results)} types):")
for res, cnt in results.most_common(20):
    print(f"  {res}: {cnt}")

# Feedback
feedback = Counter(r.get('COMMUNICATIONFEEDBACK1','').strip() for r in comm_rows if r.get('COMMUNICATIONFEEDBACK1','').strip())
print(f"Communication feedback ({len(feedback)} types):")
for fb, cnt in feedback.most_common(20):
    print(f"  {fb}: {cnt}")

# Relationship types
rel_types = Counter(r.get('RECIPIENTRELATIONSHIPTYPE','').strip() for r in comm_rows if r.get('RECIPIENTRELATIONSHIPTYPE','').strip())
print(f"Recipient relationship types: {dict(rel_types)}")

# Prospect vs active
prospects = sum(1 for r in comm_rows if r.get('ISPROSPECT','') in ('1','true','True'))
active_rel = sum(1 for r in comm_rows if r.get('ISACTIVERELATIONSHIP','') in ('1','true','True'))
inactive_rel = sum(1 for r in comm_rows if r.get('ISINACTIVERELATIONSHIP','') in ('1','true','True'))
print(f"Prospect communications: {prospects}")
print(f"Active relationship comms: {active_rel}")
print(f"Inactive relationship comms: {inactive_rel}")

# Unique dealers contacted
dealers_contacted = set()
for r in comm_rows:
    org = r.get('RECIPIENTORGANIZATIONNAME','').strip()
    if org:
        dealers_contacted.add(org)
print(f"Unique dealers/orgs contacted: {len(dealers_contacted)}")

print()

# ============================================================
# 3. MAIN APPLICATION TABLE (the big one — 62MB)
# ============================================================
print("=" * 70)
print("TABLE 3: MAIN APPLICATION DATA")
print("=" * 70)

# Process in streaming fashion to handle the large file
total = 0
statuses = Counter()
app_reps = Counter()
app_states = Counter()
app_groups = Counter()
app_cities = Counter()
lenders = Counter()
coll_types_app = Counter()
new_used = Counter()
class_types = Counter()
app_dates = []
approval_dates = []
booked_dates = []
dealer_names = set()
client_dealer_ids = set()
booked_amount_total = 0.0
booked_count = 0
approved_count = 0
declined_count = 0
has_amount = 0
amount_total = 0.0
yearly_apps = Counter()
monthly_apps = Counter()
yearly_booked = Counter()
yearly_booked_amt = defaultdict(float)
rep_booked = Counter()
rep_booked_amt = defaultdict(float)
state_booked = Counter()
state_booked_amt = defaultdict(float)

with open('Main information download  for VC (July 20 2026).csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        total += 1
        
        status = (row.get('Status','') or '').strip()
        statuses[status] += 1
        
        rep = (row.get('Dealerrepresentative','') or '').strip()
        if rep: app_reps[rep] += 1
        
        state = (row.get('Dealerstate','') or '').strip()
        if state: app_states[state] += 1
        
        group = (row.get('Dealergroup','') or '').strip()
        if group: app_groups[group] += 1
        
        lender = (row.get('Lender','') or '').strip()
        if lender: lenders[lender] += 1
        
        ct = (row.get('Collateraltype','') or '').strip()
        if ct: coll_types_app[ct] += 1
        
        nu = (row.get('Collateralnewused','') or '').strip()
        if nu: new_used[nu] += 1
        
        cls = (row.get('Class','') or '').strip()
        if cls: class_types[cls] += 1
        
        dname = (row.get('Dealername','') or '').strip()
        if dname: dealer_names.add(dname)
        
        cdid = (row.get('Clientdealerid','') or '').strip()
        if cdid: client_dealer_ids.add(cdid)
        
        # Dates
        app_d = parse_date(row.get('Applicationdate Date',''))
        if app_d:
            app_dates.append(app_d)
            yearly_apps[app_d.year] += 1
            monthly_apps[app_d.strftime('%Y-%m')] += 1
        
        appr_d = parse_date(row.get('Approvaldate Date',''))
        if appr_d:
            approval_dates.append(appr_d)
        
        bk_d = parse_date(row.get('Bookeddate Date',''))
        if bk_d:
            booked_dates.append(bk_d)
        
        # Financial
        amt_str = (row.get('Amountfinanced','') or '').strip().replace('$','').replace(',','')
        if amt_str:
            try:
                amt = float(amt_str)
                has_amount += 1
                amount_total += amt
            except:
                pass
        
        # Booked stats
        if status == 'Booked':
            booked_count += 1
            if app_d:
                yearly_booked[app_d.year] += 1
            if rep:
                rep_booked[rep] += 1
            if state:
                state_booked[state] += 1
            if amt_str:
                try:
                    bamt = float(amt_str)
                    booked_amount_total += bamt
                    if app_d:
                        yearly_booked_amt[app_d.year] += bamt
                    if rep:
                        rep_booked_amt[rep] += bamt
                    if state:
                        state_booked_amt[state] += bamt
                except:
                    pass
        
        if status in ('Approved', 'Conditional Approval', 'Auto Approval'):
            approved_count += 1
        if status in ('Decline', 'Auto Decline'):
            declined_count += 1
        
        if total % 50000 == 0:
            print(f"  ... processed {total} rows", flush=True)

print(f"Total applications: {total}")
print(f"Unique dealer names: {len(dealer_names)}")
print(f"Unique client dealer IDs: {len(client_dealer_ids)}")

# Date ranges
if app_dates:
    print(f"Application date range: {min(app_dates).strftime('%Y-%m-%d')} to {max(app_dates).strftime('%Y-%m-%d')}")
if approval_dates:
    print(f"Approval date range: {min(approval_dates).strftime('%Y-%m-%d')} to {max(approval_dates).strftime('%Y-%m-%d')}")
if booked_dates:
    print(f"Booked date range: {min(booked_dates).strftime('%Y-%m-%d')} to {max(booked_dates).strftime('%Y-%m-%d')}")

# Status breakdown
print(f"\nApplication statuses:")
for s, cnt in statuses.most_common():
    pct = (cnt/total*100) if total > 0 else 0
    print(f"  {s or '(empty)'}: {cnt:,} ({pct:.1f}%)")

# Yearly breakdown
print(f"\nApplications by year:")
for yr in sorted(yearly_apps.keys()):
    bk = yearly_booked.get(yr, 0)
    bk_amt = yearly_booked_amt.get(yr, 0)
    print(f"  {yr}: {yearly_apps[yr]:,} apps, {bk:,} booked (${bk_amt:,.0f})")

# 2025-2026 monthly breakdown
print(f"\nMonthly breakdown (2025-2026):")
for m in sorted(monthly_apps.keys()):
    if m >= '2025':
        print(f"  {m}: {monthly_apps[m]:,} apps")

# Financial summary
print(f"\nFinancial summary:")
print(f"  Applications with amount: {has_amount:,}")
print(f"  Total amount across all apps: ${amount_total:,.0f}")
print(f"  Booked deals: {booked_count:,}")
print(f"  Booked dollar total: ${booked_amount_total:,.0f}")
print(f"  Approved (not yet booked): {approved_count:,}")
print(f"  Declined: {declined_count:,}")
if booked_count > 0:
    print(f"  Average booked deal: ${booked_amount_total/booked_count:,.0f}")
if total > 0:
    print(f"  Look-to-book ratio: {booked_count/total*100:.1f}%")
if approved_count + booked_count > 0:
    print(f"  Approval-to-book ratio: {booked_count/(approved_count+booked_count)*100:.1f}%")

# Reps
print(f"\nReps in application data ({len(app_reps)} total):")
for rep, cnt in app_reps.most_common():
    bk = rep_booked.get(rep, 0)
    bk_amt = rep_booked_amt.get(rep, 0)
    print(f"  {rep}: {cnt:,} apps, {bk:,} booked (${bk_amt:,.0f})")

# States
print(f"\nStates ({len(app_states)}):")
for st, cnt in app_states.most_common(15):
    bk = state_booked.get(st, 0)
    bk_amt = state_booked_amt.get(st, 0)
    print(f"  {st}: {cnt:,} apps, {bk:,} booked (${bk_amt:,.0f})")

# Dealer groups with apps
print(f"\nDealer groups in app data ({len(app_groups)}):")
for g, cnt in app_groups.most_common(20):
    print(f"  {g}: {cnt:,} apps")

# Lenders
print(f"\nLenders ({len(lenders)}):")
for l, cnt in lenders.most_common(15):
    print(f"  {l}: {cnt:,}")

# Collateral & Class
print(f"\nCollateral types: {dict(coll_types_app)}")
print(f"New vs Used: {dict(new_used)}")
print(f"Class types: {dict(class_types)}")

# Cross-reference: how many dealers from Dealer Info have applications?
print(f"\n{'='*70}")
print("CROSS-TABLE ANALYSIS")
print(f"{'='*70}")
# Load dealer IDs from dealer info table
with open('Dealer information (july 20 2026) for VC.csv', 'r') as f:
    reader = csv.DictReader(f)
    info_dealer_ids = set()
    info_client_ids = set()
    for r in reader:
        did = (r.get('DEALERID','') or '').strip()
        cid = (r.get('CLIENTDEALERID','') or '').strip()
        if did: info_dealer_ids.add(did)
        if cid: info_client_ids.add(cid)

overlap = info_client_ids & client_dealer_ids
print(f"Dealer Info table has {len(info_client_ids)} unique client dealer IDs")
print(f"Application table has {len(client_dealer_ids)} unique client dealer IDs")
print(f"Overlap (dealers with both info + applications): {len(overlap)}")
print(f"Dealers in info but NO applications: {len(info_client_ids - client_dealer_ids)}")
print(f"Dealers with applications but NOT in info table: {len(client_dealer_ids - info_client_ids)}")

print("\nDone!")
