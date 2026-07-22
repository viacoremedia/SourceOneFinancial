#!/usr/bin/env python3
"""Fast analysis of the 62MB application CSV - writes results to a file."""
import csv, sys, os
from collections import Counter, defaultdict

csv.field_size_limit(sys.maxsize)
OUT = open('analysis_results.txt', 'w')
def p(s=""): OUT.write(s + "\n"); OUT.flush()

p("=" * 70)
p("TABLE 3: MAIN APPLICATION DATA")
p("=" * 70)

total = 0
statuses = Counter()
reps = Counter()
states = Counter()
groups = Counter()
lenders = Counter()
coll_types = Counter()
new_used = Counter()
class_types = Counter()
dealer_ids = set()
dealer_names = set()
yearly = Counter()
monthly = Counter()
yearly_booked = Counter()
yearly_booked_amt = defaultdict(float)
rep_apps = Counter()
rep_booked = Counter()
rep_booked_amt = defaultdict(float)
booked_count = 0
booked_total = 0.0
approved_count = 0
min_date = "9999"
max_date = "0000"

with open('Main information download  for VC (July 20 2026).csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        total += 1
        status = (row.get('Status','') or '').strip()
        if status: statuses[status] += 1
        
        rep = (row.get('Dealerrepresentative','') or '').strip()
        if rep: 
            reps[rep] += 1
            rep_apps[rep] += 1
        
        state = (row.get('Dealerstate','') or '').strip()
        if state: states[state] += 1
        
        group = (row.get('Dealergroup','') or '').strip()
        if group: groups[group] += 1
        
        lender = (row.get('Lender','') or '').strip()
        if lender: lenders[lender] += 1
        
        ct = (row.get('Collateraltype','') or '').strip()
        if ct: coll_types[ct] += 1
        
        nu = (row.get('Collateralnewused','') or '').strip()
        if nu: new_used[nu] += 1
        
        cls = (row.get('Class','') or '').strip()
        if cls: class_types[cls] += 1
        
        cdid = (row.get('Clientdealerid','') or '').strip()
        if cdid: dealer_ids.add(cdid)
        
        dname = (row.get('Dealername','') or '').strip()
        if dname: dealer_names.add(dname)
        
        ad = (row.get('Applicationdate Date','') or '').strip()[:7]  # YYYY-MM
        if ad and len(ad) == 7:
            yr = ad[:4]
            yearly[yr] += 1
            monthly[ad] += 1
            if ad < min_date: min_date = ad
            if ad > max_date: max_date = ad
        
        if status == 'Booked':
            booked_count += 1
            if ad: yearly_booked[ad[:4]] += 1
            if rep: rep_booked[rep] += 1
            amt = (row.get('Amountfinanced','') or '').strip()
            if amt:
                try:
                    a = float(amt)
                    booked_total += a
                    if ad: yearly_booked_amt[ad[:4]] += a
                    if rep: rep_booked_amt[rep] += a
                except: pass
        
        if status in ('Approved','Conditional Approval','Auto Approval'):
            approved_count += 1
        
        if total % 50000 == 0:
            p(f"  ... {total} rows processed")

p(f"Total applications: {total:,}")
p(f"Unique dealer names: {len(dealer_names):,}")
p(f"Unique client dealer IDs: {len(dealer_ids):,}")
p(f"Date range: {min_date} to {max_date}")
p()

p("--- Status Breakdown ---")
for s, cnt in statuses.most_common():
    pct = cnt/total*100 if total else 0
    p(f"  {s}: {cnt:,} ({pct:.1f}%)")

p()
p("--- Applications by Year ---")
for yr in sorted(yearly.keys()):
    bk = yearly_booked.get(yr, 0)
    bk_amt = yearly_booked_amt.get(yr, 0)
    p(f"  {yr}: {yearly[yr]:,} apps | {bk:,} booked | ${bk_amt:,.0f}")

p()
p("--- Monthly (2025-2026) ---")
for m in sorted(monthly.keys()):
    if m >= '2025':
        p(f"  {m}: {monthly[m]:,}")

p()
p("--- Financial Summary ---")
p(f"  Booked deals: {booked_count:,}")
p(f"  Booked $ total: ${booked_total:,.0f}")
p(f"  Approved (not booked): {approved_count:,}")
if booked_count: p(f"  Avg booked deal: ${booked_total/booked_count:,.0f}")
if total: p(f"  Look-to-book: {booked_count/total*100:.1f}%")
if approved_count+booked_count: p(f"  Approval-to-book: {booked_count/(approved_count+booked_count)*100:.1f}%")

p()
p(f"--- Reps ({len(reps)}) ---")
for rep, cnt in reps.most_common():
    bk = rep_booked.get(rep, 0)
    bk_amt = rep_booked_amt.get(rep, 0)
    p(f"  {rep}: {cnt:,} apps | {bk:,} booked | ${bk_amt:,.0f}")

p()
p(f"--- States ({len(states)}) top 20 ---")
for st, cnt in states.most_common(20):
    p(f"  {st}: {cnt:,}")

p()
p(f"--- Dealer Groups ({len(groups)}) top 25 ---")
for g, cnt in groups.most_common(25):
    p(f"  {g}: {cnt:,}")

p()
p(f"--- Lenders ({len(lenders)}) top 15 ---")
for l, cnt in lenders.most_common(15):
    p(f"  {l}: {cnt:,}")

p()
p(f"--- Collateral Types ---")
for c, cnt in coll_types.most_common(): p(f"  {c}: {cnt:,}")
p(f"--- New/Used ---")
for n, cnt in new_used.most_common(): p(f"  {n}: {cnt:,}")
p(f"--- Class ---")
for c, cnt in class_types.most_common(): p(f"  {c}: {cnt:,}")

OUT.close()
print("DONE - results in analysis_results.txt")
