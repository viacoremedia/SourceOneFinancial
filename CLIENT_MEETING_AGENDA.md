# Source One Data Audit & Client Meeting Q&A

**Date:** July 29, 2026  
**Purpose:** Data Clarifications & Methodological Sign-Off for Platform Build  

---

## SECTION 1: SALES REPRESENTATIVE ROSTER & ALIAS MAPPING

### Background Finding
In our database analysis across 244,147 application records, 3,851 dealer locations, and 8,632 communication logs, sales representatives appear under different handle names and email addresses depending on the source system (OMNI Deal Table vs OMNI CRM Communications).

### Known Rep Handle Variations
- "gcoulombe" in deals / "Genevieve Coulombe" in CRM -> Genevieve Coulombe
- "tderouin" in CRM -> Tony DeRouin
- "edominguez" in deals / "Ericka Dominguez" in CRM -> Ericka Dominguez
- "bsweere" in CRM -> Bruce Sweere
- "jharrington1" in deals / "Janet Harrington" in CRM -> Janet Harrington
- "jsmith" in deals / "Jeff Smith" in CRM -> Jeff Smith
- "jweller" in deals -> Jeff Weller
- "wstoutimore" in deals / "Ward Stoutimore" in CRM -> Ward Stoutimore
- "pcarter" in deals / "Paul Carter" / "Pam Carter" in CRM -> Paul / Pam Carter
- "mschultz1" in deals / "Mandy Schultz" in CRM -> Mandi Schultz
- "S1House" -> House / Corporate Portfolio Account
- "defi admin" -> Automated System Account
- "deactivated+wbushmire" -> Inactive Sales Rep
- "nishant.shah@goodviewcapital.com" -> Parent Company / External Account

### Questions for Client Meeting:
1. **Master Roster Confirmation:** Can you provide the official list of active sales representatives, their exact full names, job titles, and assigned territories/states?
2. **Handle Verification:** Can you confirm all handle mappings between OMNI Deal Table handles (`gcoulombe`, `edominguez`, `tderouin`, `jharrington1`, `jsmith`, `pcarter`, `wstoutimore`) and CRM full names?
3. **Corporate Accounts:** Should deals under "S1House" and "defi admin" be excluded from individual Rep Scorecards and reported only under corporate totals?

---

## SECTION 2: IN-HOUSE DEALS VS. THIRD-PARTY LENDER CLASSIFICATION

### Background Finding
Out of 244,147 total applications in the system:
- 167,486 deals (68.6%) list "Source One" or "Source One Financial Services" as the Lender.
- 76,661 deals (31.4%) list third-party credit unions/banks as the Lender (Connexus Credit Union: 37,501, Ideal Credit Union: 15,472, C&F Finance: 5,410, Valley National Bank: 4,077, BMO Harris: 2,863, Medallion Bank: 1,441).

### Questions for Client Meeting:
1. **Definition of "In-House" Deals:** Are "In-House" deals defined strictly as deals where Source One is the listed lender (where Source One holds the paper), or does "In-House" refer to any deal originated by a Source One sales rep regardless of funding credit union?
2. **Financed Volume Metrics:** When reporting total Booked Dollar Volume ($), do we include third-party credit union deals (e.g. Connexus / Ideal), or only Source One funded contracts?

---

## SECTION 3: COMMUNICATIONS TABLE NULL TYPES & INFERENCE RULES

### Background Finding
Out of 8,632 total communication records in Andrew's CRM table:
- 8,214 records (95.2%) have a NULL Communication Type (the field is blank).
- However, 95.1% of records contain valid Result/Outcome notes (e.g. "Met with existing contact": 4,338, "Spoke with Sales Manager": 1,093, "Not able to speak to anyone": 1,102, "Follow up on approvals/stips": 986, "Met with new contact": 532).

### Questions for Client Meeting:
1. **Inference Rules for Blank Communication Types:** Can we classify blank records based on their Result notes as follows?
   - "Met with existing contact" / "Met with new contact" / "Training completed" / "Sign up completed" -> Classified as In-Person Visit / Meeting (4,931 logs).
   - "Spoke with Sales Manager" / "Follow up on approvals/stips" / "Returned phone call" / "Not able to speak to anyone" -> Classified as Phone Call (3,281 logs).
2. **Data Refresh Frequency:** What will be the recurring delivery schedule for CRM communication updates going forward?

---

## SECTION 4: APPLICATION STATUS TAXONOMY & CONVERSION METRICS

### Background Finding
The system contains 19 distinct application status values:
- Booked: 48,072
- Decline: 74,728
- Auto Decline: 46,511
- Conditional Approval: 27,960
- Approved: 22,032
- Auto Approval: 16,797
- Cancelled: 3,212
- Pending: 2,050
- Verifications Incomplete: 87
- Contract Received: 34
- Returned: 23
- System Error: 22
- Credit Bureau Error: 19
- Ready to Book: 18
- Draft Received: 4
- Recommend Approve: 10
- Recommend Decline: 1
- Not Received: 1
- Null: 177

### Questions for Client Meeting:
1. **Total Approvals Formula:** Is Total Approvals defined as Approved + Conditional Approval + Auto Approval + Recommend Approve (66,799 total approvals)?
2. **Total Declines Formula:** Is Total Declines defined as Decline + Auto Decline + Recommend Decline (121,240 total declines)?
3. **Look-to-Book % Formula:** Which formula does management prefer?
   - Option A: Booked Deals / Total Applications
   - Option B: Booked Deals / Approved Deals
4. **Approval-to-Book % Formula:** Booked Deals / Total Approvals

---

## SECTION 5: DEALER LOCATION MASTER TABLE & STATE PREFIX GAPS

### Background Finding
Out of 3,851 total dealer locations:
- 3,136 locations (81.4%) are Independent Dealers (do not belong to a multi-location group).
- 715 locations (18.6%) belong to 84 multi-location Dealer Groups (e.g. Blue Compass RV, Fun Town RV, General RV Center).
- 1,357 locations (35.2%) currently have a blank state prefix in the location master table.

### Questions for Client Meeting:
1. **State Backfill Strategy:** Can we backfill the 1,357 missing dealer state prefixes using the state extracted from dealer application zip codes or CRM address tables?
2. **Dealer Group Assignment:** When new dealer locations are ingested, is brand name matching (e.g. extracting "Fun Town RV" from "FUN TOWN RV CONROE") the approved method for assigning locations to Dealer Groups?
