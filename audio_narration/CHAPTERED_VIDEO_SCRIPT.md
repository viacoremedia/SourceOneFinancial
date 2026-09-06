# Source One Dealer Analytics — Master Chaptered Video Walkthrough Script

> **Guide Type**: Narrated Screen-Recording Video Walkthrough (~12–14 Minutes)  
> **Audience**: Sales Representatives, Territory Managers, Underwriters, and Executive Leadership  
> **Tone**: Clear, natural, instructional, and conversational. Explains what every feature is, what the data means, and how to use it day to day.  
> **Visual Assets**: Transition slides for all 12 chapters (`audio_narration/` and `docs/`)

---

## Chapter Navigation Overview

| # | Chapter Title | Topic Area |
|:---:|:---|:---|
| **1** | Introduction & The 3 Core Data Sources | Platform overview, Dealer ID linkage & unified intelligence |
| **2** | The Bug & Feature Reporter | Direct feedback hotline with automatic diagnostic capture |
| **3** | The Executive Network Performance Banner | 7 KPIs, trend deltas, Funded Booked (cash) vs. App Booked (cohort) |
| **4** | The Dealer Performance Table: Views, Filters & Smart Trends | Groups, Dealers, All Dealers, Rep/State/Portfolio/DRD filters, cohorts & trends |
| **5** | Table Columns, Field Metrics & Multi-Sort | Search, badges, recency heatmaps, Last Visit, Visit Lift, $ per Visit & multi-sort |
| **6** | The Dealer Profile Analytics Drawer | 4 tabs: DRD timeline, Historical MoM, Loan Detail Drawer (35 fields) & CRM logs |
| **7** | Historical Month-over-Month Ledger | Multi-year network ledger by rep, state, group, or store |
| **8** | Visit Impact & Reactivation Diagnostic Engine | Windshield ROI, reactivation windows (14/30/60d) & DRD demand allocation |
| **9** | Rep Scorecard & The Territory Heat Index | 0–100 health score (10 factors), Bayesian smoothing & state breakdown |
| **10** | Underwriter Performance Scorecard | Decision velocity, approval rates, Win Rate & internal vs. partner lender mix |
| **11** | Daily Digest: Activity Churn & Day-over-Day Monitor | Day-over-day status flow, network active rate & 28-day at-risk alerts |
| **12** | System Settings & Access Controls | User roles, permissions, and security governance |

---

## Chapter 1: Introduction & The 3 Core Data Sources

| 🎬 **CHAPTER 1 SLIDE** | **THE 3 CORE DATA SOURCES & CONNECTED INTELLIGENCE** |
|:---|:---|
| **What You'll Learn** | • The 3 foundational data sources: Dealerships, Loan Applications, and Field Visits<br>• How the unique **Dealer ID** effortlessly ties every deal and visit to the right rooftop<br>• How daily activity becomes actionable dealer intelligence |
| **Key Takeaway** | A unified lending intelligence platform linking sales activity to funded loan production. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the 3-into-1 workflow diagram (`data_sources_visual.jpg`).

![Source One Data Architecture](/home/joshg/viacore-v2/Source%20One/audio_narration/data_sources_visual.jpg)

### 🎙️ Spoken Script

> Welcome to the Source One Dealer Analytics Platform. In this walkthrough, we’re going to cover all the core features and workflows across the system so you feel completely comfortable using it day to day.
>
> To understand how the platform works, it helps to know the three data sources powering everything you see:
>
> First is **Dealership Information** — who the dealer is, their rooftop location, state, and assigned sales rep.
>
> Second is **Loan Applications** — every deal submitted, the underwriting decision, credit score, and funded close date.
>
> And third is **Field Visits and Communications** — the in-person visits, phone calls, and notes logged by reps in the field.
>
> What brings all of this together is one piece of glue: the **Dealer ID**, like TX400 or AZ260. Because every application and visit is tagged with that Dealer ID, the platform connects the dots automatically. It tracks how long it's been since a dealer submitted a deal, shows who is going quiet, and calculates **Visit Lift** so you can see if rep visits are actually driving new business.
>
> Let’s jump right into the features.

---

## Chapter 2: The Bug & Feature Reporter

| 🎬 **CHAPTER 2 SLIDE** | **INSTANT FEEDBACK & BUG / FEATURE REPORTER** |
|:---|:---|
| **What You'll Learn** | • How to access the 1-click feedback tool<br>• Automatic capture of screen route, active filters, and error logs<br>• Direct line to engineering for edge cases and requests |
| **Key Takeaway** | Zero-friction issue reporting directly from the screen you're on. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the feedback reporter slide (`ch02_feedback_reporter.jpg`).

![Instant Feedback & Bug Reporter](/home/joshg/viacore-v2/Source%20One/audio_narration/ch02_feedback_reporter.jpg)

### 🎥 Live Interface Recording
* Click the feedback button to display the modal capturing page route and diagnostic context.

### 🎙️ Spoken Script

> Before we get into the dashboard, there's an important tool to know about: the **Bug and Feature Reporter**.
>
> We built this so you have a direct line to our engineering team. If you ever spot an unexpected number, run into an edge case with a dealership, or have an idea that would make your job easier, click the reporter.
>
> You don’t have to take screenshots or explain your technical setup — it automatically captures the page you’re on, your active filters, and console diagnostic logs. Just type a quick note, hit submit, and our team will review it.

---

## Chapter 3: The Executive Network Performance Banner

| 🎬 **CHAPTER 3 SLIDE** | **THE EXECUTIVE NETWORK PERFORMANCE BANNER** |
|:---|:---|
| **What You'll Learn** | • The 7 top-level health indicators driving the entire dealer network<br>• The critical difference between **Funded Booked** (cash in bank) vs. **App Booked** (cohort origination)<br>• How all 7 cards dynamically recalculate for any rep, state, or date window |
| **Key Takeaway** | Fast executive health check on pipeline conversion and cash production. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the dual booked model comparison (`ch03_executive_banner.jpg`).

![Executive KPI Banner & Dual Booked Model](/home/joshg/viacore-v2/Source%20One/audio_narration/ch03_executive_banner.jpg)

### 🎥 Live Interface Recording
* Walk through the seven metric cards: Apps, Approvals, Funded Booked Volume, App Booked Volume, Look-to-Book, Approval-to-Book, and Average FICO.

### 🎙️ Spoken Script

> Next up is the **Executive Network Performance Banner**. This gives you a quick five-second pulse on how the network is doing for whatever date range and filters you have selected.
>
> Starting with the metrics:
>
> **Apps** shows total credit applications submitted, along with a percentage trend compared to your prior period.
>
> **Approvals** shows deals approved by underwriting.
>
> Then you have two different ways of looking at booked volume, and understanding the difference is key:
>
> **Funded Booked Volume** is our cash production. It counts loans that actually funded during this calendar period, no matter when the customer first applied.
>
> **App Booked Volume** is our cohort number. It looks strictly at applications submitted during this window and tracks what those specific deals ended up producing.
>
> Next is **Look-to-Book**, which divides booked deals by total applications to measure overall pipeline conversion.
>
> **Approval-to-Book** is your pure closing pull-through rate — it removes underwriting declines to show how well approved deals convert into funded loans.
>
> And **Average FICO** shows the average credit score across all submitted applications.
>
> Every single card here is dynamic: whenever you change your date range, pick a sales rep, or isolate a state, the entire banner updates right away.

---

## Chapter 4: The Dealer Performance Table — Views, Filters & Smart Trends

| 🎬 **CHAPTER 4 SLIDE** | **DEALER PERFORMANCE TABLE: VIEWS, FILTERS & SMART TRENDS** |
|:---|:---|
| **What You'll Learn** | • 3 Table modes: Groups (enterprise rollups), Independent Dealers, and All Dealers<br>• Filtering by Rep, State, Portfolio (All vs S-One House), and DRD demand<br>• Switching **Status By** (Application, Approval, or Booking recency) across 4 inactivity cohorts<br>• Context-aware smart trend comparisons (MTD, 30d, YTD) |
| **Key Takeaway** | Fast filtering: find active accounts, dormant stores, and growth opportunities in seconds. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the activity status cohorts slide (`ch04_activity_cohorts.jpg`).

![Dealer Activity Status Cohorts](/home/joshg/viacore-v2/Source%20One/audio_narration/ch04_activity_cohorts.jpg)

### 🎥 Live Interface Recording
* Switch between table view tabs (Groups, Dealers, All Dealers). Walk through Rep, State, Portfolio, and DRD filters. Toggle status cohort chips, status-by modes, transition pills, and date presets.

### 🎙️ Spoken Script

> Now let's dive into the **Dealer Performance Table**.
>
> You have three primary views to work with:
>
> The **Dealer Groups** tab groups multi-location enterprise dealers together, showing consolidated totals across all their rooftops, with an arrow to expand and view each individual store.
>
> The **Independent Dealers** tab isolates single-point stores.
>
> And **All Dealers** gives you a flat directory of every rooftop nationwide.
>
> To narrow down your view, you can use the filter controls:
>
> The **Rep filter** lets you focus on any specific sales representative, or view all reps across the company.
>
> The **State filter** lets you isolate specific states or focus on a rep's assigned territory.
>
> The **Portfolio filter** lets you toggle between assigned field accounts and the S-One House portfolio.
>
> And the **Relationship DRD filter** lets you segment dealers by behavioral demand.
>
> Below that, you have the **Status Cohorts**, which group dealerships by activity:
>
> **Active** means they submitted business within the last thirty days.
>
> Then you have **30-day Inactive**, **60-day Inactive**, and **Long Inactive** for ninety or more days without activity. Clicking any cohort filters the table immediately.
>
> Right alongside those chips is the **Status By selector**. This is really useful because it lets you define dealer activity by Application recency, Approval recency, or Booking recency. If you want to see who hasn't funded a loan in sixty days, switch this to Booking, and the entire table and cohort counts adjust right away.
>
> You also have **Status Transitions**, which track day-over-day movement to show you who just activated or went dormant.
>
> The date engine is smart as well: Month-to-Date compares against this exact point last month or last year, and thirty-day windows compare against the prior thirty days.
>
> Here’s a quick practical workflow: select your name in the Rep filter, click the 30-day Inactive cohort, and sort by Funded Volume descending. In ten seconds, you have a prioritized call list of your historically best accounts that have recently gone quiet.

---

## Chapter 5: Table Columns, Field Metrics & Multi-Sort

| 🎬 **CHAPTER 5 SLIDE** | **TABLE COLUMNS, FIELD METRICS & MULTI-SORT** |
|:---|:---|
| **What You'll Learn** | • Fast search across names, location IDs, and cities<br>• Embedded badges: Assigned Rep, Activity Status, and DRD Segment<br>• Recency heatmaps (Days Since App, Approval, Booking)<br>• Field ROI: Last Visit, Visit Lift %, and $ per Visit<br>• Multi-column sorting with Shift+Click |
| **Key Takeaway** | A rich data grid showing operational recency and travel ROI on every single row. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the field travel metrics card (`ch05_field_metrics.jpg`).

![Field Travel & Operational DRD Metrics](/home/joshg/viacore-v2/Source%20One/audio_narration/ch05_field_metrics.jpg)

### 🎥 Live Interface Recording
* Type into the search box. Hover over badges in the Dealer cell. Pan across recency heatmaps and the three DRD columns. Demonstrate Shift+Click multi-column sorting.

### 🎙️ Spoken Script

> Looking inside the table itself, the **Search Box** lets you quickly find any dealer by name, location ID, or city.
>
> In each **Dealer cell**, you see the store name, location ID, and state, along with badges for the assigned Rep, live Activity Status, and DRD Segment.
>
> Next are the recency columns: **Days Since App**, **Days Since Approval**, and **Days Since Booking**. These are heatmapped from green to red, so you can immediately see which accounts are slipping.
>
> Then you have three columns powered directly by field data:
>
> **Last Visit** shows the date of the last rep visit and how many days have passed.
>
> **Visit Lift** measures the percentage surge in applications after an in-person visit compared to baseline.
>
> And **Dollar per Visit** shows the funded volume return on investment per rep visit.
>
> These sit alongside your core volume numbers: Apps, Approvals, App Booked, Funded Booked, Look-to-Book, Approval-to-Book, and Average FICO.
>
> To organize the data, you can use **Multi-Column Sorting**: click your primary column, like Funded Volume, then hold the Shift key and click a second column, like Average FICO. The table sorts by volume first and uses credit score to break ties.
>
> And if you're on the Dealer Groups tab, you can toggle whether you're sorting the parent groups or the individual locations inside each group.

---

## Chapter 6: The Dealer Profile Analytics Drawer

| 🎬 **CHAPTER 6 SLIDE** | **THE DEALER PROFILE ANALYTICS DRAWER** |
|:---|:---|
| **What You'll Learn** | • 4 DRD segments: Strategic High TLC, Autonomous, Comfort Stop, Discovery Queue<br>• Cause & Effect timeline (visit pins vs. monthly volume bars)<br>• Historical MoM ledger (2025-present)<br>• 35-field Loan Detail Drawer & chronological CRM logs |
| **Key Takeaway** | Complete store profile: from behavioral diagnosis down to individual contract terms. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the 4 core tabs of the Dealer Profile Drawer (`ch06_analytics_drawer.jpg`).

![Dealer Profile Analytics Drawer 4 Core Tabs](/home/joshg/viacore-v2/Source%20One/audio_narration/ch06_analytics_drawer.jpg)

### 🎥 Live Interface Recording
* Click a dealer name to open the drawer. Tour the DRD diagnostic tab with the Cause & Effect timeline, then switch through Historical MoM, Application History (open a loan detail drawer), and Communication History.

### 🎙️ Spoken Script

> Clicking on any dealership name opens the **Dealer Analytics Drawer** for a complete look at that store.
>
> First is the **DRD Diagnostic Profile**, which classifies every dealer into one of four behavioral categories based on how they respond to rep visits:
>
> **Strategic High TLC** accounts generate strong volume, but only when a rep visits in person. When visits stop, their volume drops off, so the system flags them with Overdue alerts when it’s time to go back.
>
> **Autonomous** dealers are self-sufficient. They submit steady volume through the portal regardless of visits, meaning you can service them effectively by phone or email.
>
> **Comfort Stops** are accounts receiving frequent visits but producing low returns — under thirty-five thousand dollars per visit. This tells management to reallocate drive time.
>
> And **Discovery Queue** represents newer stores where the system is still collecting data.
>
> Right below that, the **Cause and Effect Timeline** overlays purple pins for rep visits directly against monthly application bars and funded volume lines, letting you visually confirm if visits trigger production.
>
> Managers can also click **Override** to adjust a dealer's classification with an audit note.
>
> The drawer has three other tabs:
>
> **Historical Month over Month** gives you a monthly financial ledger for this specific store from 2025 to present.
>
> **Application History** lets you review every loan application submitted. Clicking any deal opens the **Loan Detail Drawer**, showing over thirty-five fields including interest rates, loan terms, dealer reserve dollars, FICO Auto 8 scores, and underwriting turnaround times.
>
> And **Communication History** gives you a chronological CRM log of every visit, phone call, and field note.

---

## Chapter 7: Historical Month-over-Month Ledger

| 🎬 **CHAPTER 7 SLIDE** | **HISTORICAL MONTH-OVER-MONTH LEDGER** |
|:---|:---|
| **What You'll Learn** | • Dedicated multi-year financial ledger<br>• Performance tracking by rep, state, group, or store<br>• Spotting seasonal patterns and growth trajectories |
| **Key Takeaway** | Longitudinal tracking of submissions, approvals, conversions, and funded cash across years. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the Historical MoM multi-dimension ledger slide (`ch07_historical_mom.jpg`).

![Historical Month-over-Month Longitudinal Ledger](/home/joshg/viacore-v2/Source%20One/audio_narration/ch07_historical_mom.jpg)

### 🎥 Live Interface Recording
* Open the dedicated Historical MoM tool. Filter by a sales rep or dealer group, illustrating longitudinal submissions, conversions, and seasonal trends.

### 🎙️ Spoken Script

> The **Historical Month-over-Month** tool in the main navigation gives you that same ledger view across the entire company.
>
> You can slice the data by sales rep, state, dealer group, or individual store to review performance across multiple years.
>
> It tracks submissions, approvals, cohort originations, funded cash, and Look-to-Book conversion side by side.
>
> This is the fastest way to spot seasonal trends, evaluate territory health over time, and see exactly when a market or account started growing or slowing down.

---

## Chapter 8: Visit Impact & Reactivation Diagnostic Engine

| 🎬 **CHAPTER 8 SLIDE** | **VISIT IMPACT & REACTIVATION DIAGNOSTIC ENGINE** |
|:---|:---|
| **What You'll Learn** | • Measuring field travel ROI on inactive accounts<br>• Conversion windows: 14, 30, or 60 days<br>• Relationship Demand & Allocation: redirecting drive time to High TLC accounts |
| **Key Takeaway** | Proving how much funded cash sales visits actually create. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the DRD behavioral quadrants slide (`ch08_drd_quadrants.jpg`).

![DRD Behavioral Demand Quadrants](/home/joshg/viacore-v2/Source%20One/audio_narration/ch08_drd_quadrants.jpg)

### 🎥 Live Interface Recording
* Open Visit Impact. Toggle timeframes and conversion windows (14, 30, 60 days). Drill into a rep's visit log and a reactivated dealer drawer. Switch to Relationship Demand & Allocation.

### 🎙️ Spoken Script

> Now let's look at the **Visit Impact** module. This tool helps you measure the actual return on investment of windshield time by seeing whether rep visits to inactive dealers bring them back to life.
>
> On the **Visit Reactivation** tab, choose an evaluation window — like Year-to-Date or the last sixty days — and pick a conversion window of fourteen, thirty, or sixty days.
>
> The engine looks at every visit made to a dealer that was inactive at the time, and checks whether that store submitted an app and funded a deal within your window.
>
> It shows you how many inactive dealers were visited, how many reactivated, the average days it took, and total reactivated volume produced. You can click any rep to see their store-by-store visit log, or click a dealer to see their volume lift timeline.
>
> The **Relationship Demand and Allocation** tab connects this to our DRD segments, showing where reps are spending drive time versus where funded volume actually comes from — so you can keep reps focused on High TLC stores instead of over-visiting Comfort Stops.

---

## Chapter 9: Rep Scorecard & The Territory Heat Index

| 🎬 **CHAPTER 9 SLIDE** | **REP SCORECARD & THE TERRITORY HEAT INDEX** |
|:---|:---|
| **What You'll Learn** | • 0–100 health score balancing 10 operational factors<br>• **Bayesian Smoothing** protecting reps in smaller territories<br>• State-by-state performance drill-down |
| **Key Takeaway** | A balanced leaderboard rewarding consistent account management and conversion. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the Territory Heat Index 0–100 gauge (`ch09_heat_index.jpg`).

![Territory Heat Index & 10 Operational Factors](/home/joshg/viacore-v2/Source%20One/audio_narration/ch09_heat_index.jpg)

### 🎥 Live Interface Recording
* Open the Rep Scorecard. Hover over a Heat Index score to show the 10-factor formula breakdown. Expand a rep's row state by state.

### 🎙️ Spoken Script

> Next is the **Rep Scorecard**.
>
> Instead of judging sales reps strictly on raw volume, the platform calculates the **Territory Heat Index** — a balanced zero-to-one-hundred health score based on ten key operational metrics:
>
> Application recency, active dealer ratio, contact frequency, approval and booking recency, reactivation rate, net churn, Look-to-Book and Approval-to-Book closing percentages, and applications per active store.
>
> You can hover over any rep's Heat Index score to see the exact formula and factor breakdown.
>
> To keep things fair across different territories, the system uses **Bayesian Smoothing**: if a rep manages a newer territory or has a small deal sample in a given month, their conversion ratios are gently blended with network averages so a single deal doesn't skew their score.
>
> You can also click any rep's row to expand their performance state by state.

---

## Chapter 10: Underwriter Performance Scorecard

| 🎬 **CHAPTER 10 SLIDE** | **UNDERWRITER PERFORMANCE SCORECARD** |
|:---|:---|
| **What You'll Learn** | • Turnaround speed in hours<br>• Approvals, declines, and pull-through **Win Rate** %<br>• Lender distribution: internal Source One programs vs. partner lenders |
| **Key Takeaway** | Full visibility into credit decision velocity and loan placement. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the Underwriter Scorecard turnaround & placement slide (`ch10_underwriter_scorecard.jpg`).

![Underwriter Scorecard & Lender Distribution](/home/joshg/viacore-v2/Source%20One/audio_narration/ch10_underwriter_scorecard.jpg)

### 🎥 Live Interface Recording
* Open the Underwriters view. Highlight turnaround hours, approval/decline percentages, win rates, and the interactive Lender Distribution bars.

### 🎙️ Spoken Script

> Clicking over to Underwriters opens the **Underwriter Performance Scorecard**.
>
> This gives leadership clear visibility into credit decision speed and deal placement across the underwriting team:
>
> It tracks applications reviewed, approvals, declines, and **Win Rate** — the percentage of approved applications that convert into funded deals.
>
> You also see average decision turnaround speed in hours, average applicant credit scores, and total funded volume.
>
> In the **Lender Distribution** column, colored bars show the exact portfolio split between internal Source One financing programs and external partner lenders.
>
> You can click any underwriter to filter the system directly to their complete application pipeline.

---

## Chapter 11: Daily Digest: Activity Churn & Day-over-Day Monitor

| 🎬 **CHAPTER 11 SLIDE** | **DAILY DIGEST: ACTIVITY CHURN & DAY-OVER-DAY MONITOR** |
|:---|:---|
| **What You'll Learn** | • Nightly snapshot comparisons (yesterday vs. today)<br>• Flow arrows for activating vs. dormant stores<br>• At-risk early-warning alerts for stores at 28–29 days inactive |
| **Key Takeaway** | Proactive account retention: catch quiet accounts before they go dark. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the Daily Digest status churn & early-warning radar (`ch11_daily_digest.jpg`).

![Daily Digest Status Flow & At-Risk Radar](/home/joshg/viacore-v2/Source%20One/audio_narration/ch11_daily_digest.jpg)

### 🎥 Live Interface Recording
* Open Daily Digest. Show date controls, Network Active Rate gauge, cohort cards with inflow/outflow arrows, the Status Changes Table, and the At-Risk Dealers Table.

### 🎙️ Spoken Script

> Every night when data is ingested, the system compares yesterday’s snapshot against today’s to track every change across the network. You can monitor this in the **Daily Digest**.
>
> Use the date controls to look at today or any historical date.
>
> The summary cards show live dealer counts for each cohort along with flow arrows: green arrows for stores activating into that status, and red arrows for stores slipping out.
>
> The **Network Active Rate** gauge tracks the percentage of our overall dealer network currently active.
>
> Below that, the **Status Changes Table** lists every dealership that changed cohorts today.
>
> And the **At-Risk Dealers Table** flags stores sitting at twenty-eight or twenty-nine days of inactivity. This gives reps an actionable early-warning list to call today before accounts officially go dark.

---

## Chapter 12: System Settings & Access Controls

| 🎬 **CHAPTER 12 SLIDE** | **SYSTEM SETTINGS & ACCESS CONTROLS** |
|:---|:---|
| **What You'll Learn** | • User role assignments (Reps, Underwriters, Leadership)<br>• Role-tailored views and access controls<br>• Data security and governance |
| **Key Takeaway** | Clean permissions and secure access management across all teams. |

### 🖼️ Visual Presentation
* **Transition Slide**: Display the System Settings & Role Governance slide (`ch12_settings_access.jpg`).

![System Settings & Role-Based Governance](/home/joshg/viacore-v2/Source%20One/audio_narration/ch12_settings_access.jpg)

### 🎥 Live Interface Recording
* Tour user role assignments and account settings.

### 🎙️ Spoken Script

> Finally, **Settings** gives administrators control over user accounts, permissions, and role assignments.
>
> It ensures sales reps, underwriters, and leadership have access tailored to their responsibilities while keeping proprietary data secure.
>
> And that wraps up the walkthrough. By bringing together loan applications, territory mapping, and field visit logs around the Dealer ID, this system gives you the clarity you need to manage your accounts effectively. Thanks for watching, and enjoy using the platform!
