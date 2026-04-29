# Source One Intelligence Platform

## From Daily Operations to Strategic Advantage

---

**Prepared for:** Source One Financial Services  
**Prepared by:** ViacoreMedia Engineering  
**Document Version:** 1.1  
**Date:** April 27, 2026  
**Classification:** Confidential — Internal Use Only

---

## Executive Summary

ViacoreMedia has built a custom analytics and intelligence platform for Source One Financial's dealer network operations. This system ingests daily dealer performance data, processes it into structured intelligence, and surfaces insights that drive action — not just reporting.

**What exists today:** A fully operational prototype that automates daily data ingestion, tracks activity across 3,500+ dealer locations in 47 states, scores every sales rep on a composite performance index, detects churn patterns, and delivers automated daily intelligence reports via email.

**What comes next:** With the addition of Applications, Approvals, Booked counts, and Booked Amounts ($) (plus historical data), the platform unlocks a second tier of capabilities — predictive churn detection, revenue-at-risk quantification, origination pipeline forecasting, and intelligent visit routing — capabilities that move Source One from reactive reporting to proactive network management.

**The core differentiator:** Omni BI reports on what happened. The Source One Intelligence Platform tells you what's about to happen, what it's worth, and what to do about it.

---

## Table of Contents

1. [What We've Built — The Prototype Today](#1-what-weve-built--the-prototype-today)
2. [The Rep Scorecard — The Proven Differentiator](#2-the-rep-scorecard--the-proven-differentiator)
3. [Remaining Prototype Work — Incoming Data](#3-remaining-prototype-work--incoming-data)
4. [Top 10 Strategic Capabilities Beyond the Dashboard](#4-top-10-strategic-capabilities-beyond-the-dashboard)
5. [Beyond the Prototype — Long-Term Vision](#5-beyond-the-prototype--long-term-vision)
6. [Open Questions](#6-open-questions)
7. [Technical Architecture Summary](#7-technical-architecture-summary)

---

## 1. What We've Built — The Prototype Today

### The Problem Before This Platform

Source One's field operations team was managing a national dealer network of 3,500+ locations across 47 states using spreadsheet exports, Omni BI reports, and manual tracking. Key operational challenges:

- **No single view of the network.** Determining which dealers were active, declining, or returning required manual analysis across multiple data sources.
- **No rep comparison framework.** Evaluating sales rep performance was a subjective exercise — gut feel rather than data-driven assessment.
- **No early warning system.** By the time a dealer went inactive, the revenue was already lost. Problems were discovered days or weeks after they began.
- **Daily reports weren't actionable.** CSV exports from Omni BI were being generated daily, but the data sat in files rather than driving decisions.
- **Territory management lacked rigor.** Rep workload balancing and territory health were not measured systematically.

### What We Built and What Changed

The table below details each capability delivered in the prototype, what it replaced, and the direct operational value it provides.

| # | Capability | What It Replaced | Value Delivered |
|---|-----------|-----------------|-----------------| 
| 1 | **Automated Daily Data Pipeline** | Manual CSV downloads and spreadsheet copy-paste | Data flows into the system automatically every day. No manual import work. The platform is current the moment it's opened. |
| 2 | **Dealer Network Dashboard** | Scrolling through 3,500+ row spreadsheets | A single screen displays the entire dealer network with instant filtering by state, rep, or activity status. Any dealer can be found in seconds. |
| 3 | **Intelligent Dealer Grouping** | Manually knowing which locations belong to which brand | The system auto-detects multi-location brands (e.g., "Blue Compass RV Conroe" and "Blue Compass RV Dallas" are recognized as one group) and presents best/worst performance within each group. |
| 4 | **Live Activity Status Tracking** | Manually calculating "days since last application" per dealer | Every dealer has a real-time status badge — Active, 30-Day Inactive, 60-Day Inactive, Long Inactive — with the ability to switch between Application, Approval, and Booking as the basis for status derivation. *(Funnel-based status switching will be fully enabled once the incoming Applications, Approvals, and Booked data lands.)* |
| 5 | **Rolling Averages & Trend Detection** | No trend visibility existed | Network-level metrics displayed across 7-day and 30-day rolling windows with period-over-period delta indicators. At a glance, leadership can see whether the network is trending up or down. |
| 6 | **Rep Scorecard & Heat Index** | Nothing — this capability did not exist in Omni BI or any prior tool | A composite 0–100 performance score for every sales rep, computed from 8 weighted sub-metrics. Reps are classified as Strong, Average, Overburdened, or Underperforming. *Source One leadership explicitly confirmed this cannot be replicated in Omni BI.* |
| 7 | **Churn Velocity Tracking** | Not tracked at any level | Daily tracking of dealer gains vs. losses per rep and network-wide. Net churn velocity reveals whether the active dealer base is growing or contracting. |
| 8 | **Automated Daily Digest Email** | No alerting — issues discovered days or weeks after onset | After every data import, a comprehensive email report delivers: network health summary, new applications/approvals/bookings detected, at-risk dealer flags, and reactivation events. Issues surface the same day they begin. |
| 9 | **System Health Monitor** | No data pipeline monitoring | Automatic alerts when data anomalies occur: row count deviations, processing time spikes, data gaps, or parse errors. Severity-coded (Critical / Warning) with zero noise when everything is normal. |
| 10 | **Secure Access & Team Management** | No access control | Invite-only authentication with role-based access (Employee, Admin, Super Admin). Team members are invited via email, and access can be revoked at any time. |
| 11 | **Professional Theming** | N/A | Light and dark mode with automatic OS preference detection. Corporate-grade visual presentation. |
| 12 | **Budget Integration** | Separate budget spreadsheets maintained independently | Rep and state-level budget targets imported and displayed alongside live dealer metrics, enabling real-time budget-vs.-actual visibility. |

---

## 2. The Rep Scorecard — The Proven Differentiator

This is the feature Source One leadership called out as something they **cannot do in Omni BI**. It represents the clearest proof-of-concept for the value of a custom intelligence layer built on top of Source One's existing data.

### How It Works

The Heat Index is a composite performance score (0–100) for each sales rep. It is computed from 8 weighted sub-metrics, normalized relative to all reps in the network:

| Sub-Metric | Weight | What It Measures |
|-----------|--------|-----------------|
| Avg Days Since Last Application | 20% | How current are the rep's dealers? (Lower = better) |
| Active Dealer Ratio | 20% | What percentage of the rep's dealers are active? |
| Avg Days Since Last Communication | 15% | Is the rep staying in touch? |
| Avg Days Since Last Approval | 10% | Are applications converting to approvals? |
| Avg Days Since Last Booking | 10% | Are approvals converting to funded deals? |
| Visit Response Effectiveness | 10% | When the rep visits, do dealers reactivate? |
| Reactivation Rate | 10% | How often does the rep bring inactive dealers back? |
| Net Churn | 5% | Is the rep gaining or losing dealers overall? |

### Classification Outcomes

| Classification | Criteria | What It Means |
|---------------|----------|---------------|
| **Strong** | Heat Index ≥ 70 | Consistently high performance across metrics |
| **Average** | Heat Index 40–69 | Performing within normal range |
| **Overburdened** | >1.3× average dealer count AND Heat Index < 50 | Too many dealers, performance suffering — potential workload issue |
| **Underperforming** | ≤1.0× average dealer count AND Heat Index < 40 | Normal or light workload but below-average outcomes — may need coaching |

This framework turns rep evaluation from a subjective conversation into a data-driven assessment — and it's built entirely on data Source One already produces.

---

## 3. Remaining Prototype Work — Incoming Data

### New Data Fields Pending from Source One

| Data Field | Description | Analytical Value |
|-----------|-------------|-----------------|
| **Applications** | Count of loan applications submitted through each dealer | Volume indicator — is this dealer actively sending business? |
| **Approvals** | Count of applications approved | Quality indicator — are the applications fundable? |
| **Booked** | Count of deals closed and funded | Revenue indicator — are approvals converting to revenue? |
| **Booked Amounts ($)** | Dollar value of booked deals per dealer | The bottom line — how much origination revenue is each dealer generating? |
| **Historical Data** | All above fields with historical depth (months/years) | Enables trend analysis, year-over-year comparisons, and seasonality detection |

### What We'll Build With This Data

**Trend Analysis Engine:**
- Year-over-Year comparison (same month, prior year)
- Month-over-Month trajectory
- 30-day Moving Average (short-term trend, smooths daily noise)
- 60-day Moving Average (medium-term direction)
- 90-day Moving Average (long-term structural trend)

**Conversion Funnel per Dealer and per Rep:**
- Application → Approval Rate (quality of applications being submitted)
- Approval → Booked Rate (closing effectiveness)
- Full-funnel: Application → Booked (end-to-end conversion efficiency)
- Average deal size ($ per booked deal)

**The Integration Multiplier:**
Once Applications, Approvals, Booked counts, and dollar amounts land alongside the existing daily activity snapshots, the system gains cross-metric intelligence that neither dataset could provide alone. For example:
- Correlating declining application velocity with churn risk to identify dealers showing early warning signs before they go fully inactive
- Identifying dealers with strong application volume but weak closing rates — potential coaching or training opportunities for the rep
- Detecting seasonal patterns (spring/summer RV buying peaks) to set more accurate monthly expectations
- Quantifying the dollar impact of dealer inactivity by linking activity status to historical origination volume

---

## 4. Top 10 Strategic Capabilities Beyond the Dashboard

> These capabilities are what Omni BI cannot deliver. They represent the difference between a reporting tool and an intelligence platform. Each one is grounded in the data architecture already built plus the incoming funnel metrics.

### 1. Predictive Dealer Churn Engine

**What it enables:** Leadership identifies which dealers are likely to go inactive in 14, 30, or 60 days — before it happens — with explainable reasons for each prediction.

**Why this matters:** Omni BI shows which dealers are currently inactive. This platform identifies which active dealers are trending toward inactivity, giving reps a window to intervene before the relationship is lost — and provides explainable reasons for each prediction (e.g., *"declining application velocity combined with widening communication gaps"*), so the recommended action is immediately clear.

**How it works:** The daily snapshots collected since April 2026 create a time-series behavioral fingerprint for every dealer. Dealers who previously churned followed detectable patterns: widening days-since-application, declining approval counts, communication gaps. The engine matches current dealer behavior against these historical churn signatures and flags matches with confidence scores and human-readable contributing factors.

With the addition of funnel metrics, prediction accuracy improves further — a dealer whose applications are declining AND whose days-since-communication is widening is a stronger churn signal than either metric alone.

---

### 2. Intelligent Visit Routing (Badger Maps Integration)

**What it enables:** Automatically generates optimized daily or weekly visit routes for each sales rep, prioritized by which dealers need attention most — not just geographic proximity.

**Why this matters:** Omni BI has no routing capability. Badger Maps has routing but no intelligence about which dealers to visit. This platform combines both: the data identifies who needs a visit, and routing optimization determines the most efficient path to reach them.

**How it works:**
- Dealer addresses sourced from Badger Maps API (or manual import)
- Each dealer scored by urgency: days since last visit × churn risk probability × historical origination volume × conversion trend
- Route generated to maximize impact per mile driven
- Joseph (or the rep) reviews the recommended route and approves, modifies, or declines with one action
- Post-visit, the system tracks whether the visit led to reactivation or increased activity (the prototype already tracks `reactivatedAfterVisit`)

> **Fallback:** If Badger Maps API access is not immediately available, the urgency-scored dealer list can be exported as a prioritized CSV for import into whatever routing tool the team currently uses. Badger Maps supports CRM/API integrations and custom data sync, making a direct integration realistic once API access is confirmed.

---

### 3. Revenue-at-Risk Alerting

**What it enables:** When a dealer begins declining, the system quantifies the dollar value at stake based on that dealer's historical booking volume — transforming an activity alert into a financial signal.

**Why this matters:** Omni BI can identify inactive dealers. It cannot tell leadership that losing Dealer TX400 represents an estimated **$127,000**/month in origination revenue at risk. Attaching dollar amounts to churn signals changes the urgency of the response.

**Example output:** *"Dealer TX400 — Fun Town RV Conroe — is trending toward 30-day inactive status. This dealer averaged $127K/month in booked volume over the last 12 months. Estimated monthly revenue at risk: **$127,000**. Assigned rep: Bruce. Last communication: 18 days ago."*

---

### 4. Territory Health Scoring & Rebalancing Recommendations

**What it enables:** Evaluates entire territories as investment units — not just individual dealers — and surfaces structural risks like revenue concentration, coverage gaps, or workload imbalances.

**Why this matters:** Omni BI reports on individual dealer performance. It does not model territory-level health as a composite of dealer density, conversion rates, revenue concentration, churn velocity, and rep capacity.

**Example insights:**
- Revenue concentration risk: *"60% of Bruce's territory revenue comes from 3 dealers — high fragility if any one declines"*
- Coverage gaps: *"Rep has 200 assigned dealers but visit data shows contact with only 40 in the last 90 days"*
- Rebalancing recommendation: *"Reassigning AR dealers from Bruce to Mike would equalize workload (180 vs. 120 → 150 vs. 150) and improve average days-to-contact by 8 days"*

---

### 5. Origination Pipeline Forecasting

**What it enables:** Projects next month's booked volume and dollar amount per rep, per state, and network-wide — with confidence intervals and variance against budget.

**Why this matters:** This is critical for a lending operation. Omni BI shows what already happened. This platform models what is likely to happen by flowing current applications through historical conversion rates. RV/marine lending has strong seasonality (spring/summer peaks), and the historical data accumulated in this platform will capture those patterns to improve forecast accuracy over time.

**How it works:** Current month's applications × historical approval rate × historical booking rate × average deal size = projected revenue. Computed per dealer, rolled up to rep and territory level.

**Example output:** *"Based on current pace and historical conversion, we project **$4.2M** in booked volume this month vs. **$4.7M** budget — **89% on track**. At-risk shortfall concentrated in Bruce's territory (FL, TX). 3 dealers with high app volume but declining approval rates are the primary drag."*

---

### 6. Dealer Engagement Scoring

**What it enables:** Every dealer receives a composite engagement score — analogous to lead scoring in marketing — that provides a single-number answer to the question: "How healthy is our relationship with this dealer?"

**Why this matters:** Omni BI tracks individual metrics in isolation. The engagement score combines activity recency, application volume, approval quality, booking consistency, communication frequency, and visit responsiveness into one actionable number.

**Application:** Dealers are automatically tiered into Gold / Silver / Bronze based on engagement score. Tiering enables differentiated treatment — priority approval processing for Gold dealers, targeted outreach campaigns for declining Silver dealers, and automated win-back sequences for Bronze.

---

### 7. Automated Smart Alerts

**What it enables:** Evolves beyond the current daily digest into targeted, context-aware notifications that surface specific situations requiring action.

**Why this matters:** The daily digest provides a network summary. Smart Alerts provide specific, actionable signals that prevent the summary from becoming noise.

**Example alerts:**
- *"3 of your top-10 dealers by revenue have not submitted an application in 15+ days"*
- *"Dealer group Blue Compass RV has dropped from 18 active locations to 12 this month — network-wide contraction signal"*
- *"Rep Mike's territory is converting applications at 2× the network average this month — investigate what's working and consider replicating"*
- *"Dealer TX400 was visited last Tuesday and submitted 3 applications since — visit ROI confirmed"*

---

### 8. Visit ROI Quantification

**What it enables:** Measures the actual dollar return of every sales rep visit by tracking the causal chain: visit → dealer activity change → incremental revenue.

**Why this matters:** Field sales is expensive. Without measurement, it's impossible to know whether visits are generating returns. This capability creates a closed-loop system: Badger Maps tracks the visit, Source One Intelligence Platform tracks what happens next, and the combined data produces a per-visit dollar ROI.

**Example output:** *"Bruce's visit to TX400 on April 3 was followed by 3 applications and **$85K** in booked deals within 14 days. Estimated visit ROI: **$85,000**. Bruce's average visit ROI this quarter: **$47K** across 28 visits."*

The prototype already tracks `reactivatedAfterVisit` and `daysFromVisitToNextApp`. Adding booked amounts completes the revenue attribution chain.

---

### 9. A/B Territory Experiments

**What it enables:** Leadership can model and test territory changes before committing to them — using historical data to simulate outcomes.

**Why this matters:** Territory reassignments are high-stakes decisions. Moving 50 dealers from one rep to another affects relationships, coverage, and revenue. This capability enables simulation: "What would have happened last quarter if these dealers had been assigned to Mike instead of Bruce?" — using actual historical data to project the outcome.

**Frame:** Think of it as a sandbox mode for territory management. Leadership defines the change, the platform models the projected impact on key metrics (active dealer ratio, conversion rates, revenue), and presents a comparison before any real reassignment takes place.

---

### 10. Executive Intelligence Brief (Automated Monthly/Quarterly)

**What it enables:** Auto-generates a polished executive report that answers the five questions leadership asks every month:

| Question | How the Platform Answers It |
|----------|----------------------------|
| Are we growing or shrinking? | Net dealer activity trend + network churn velocity |
| Where's the money? | Revenue by territory, by dealer tier, with concentration risk flags |
| Who's performing? | Rep rankings with Heat Index context and trend direction |
| What's at risk? | Revenue-at-risk from declining dealers, quantified in dollars |
| What should we do? | Specific recommended actions based on the data |

**Why this matters:** Omni BI provides data. The Executive Intelligence Brief provides narrative with recommendations — the difference between information and intelligence. This is designed for the audience that does not log into dashboards but needs to make strategic decisions based on what the data says.

**Delivery options:** PDF report with embedded charts, or a dedicated read-only dashboard view. Format to be confirmed based on executive preference.

---

### Additional Capability Considerations

These capabilities are worth noting as natural extensions of the Top 10, achievable with the same data foundation:

**Conversion Optimization Insights:** "What-if" analysis at the dealer and territory level. Example: *"Improving approval rates by 10% at the 20 lowest-converting dealers in Bruce's territory would add an estimated $340K in monthly booked volume."* This turns analytics into a coaching tool.

**Portfolio Health Index:** A single network-wide executive KPI that aggregates active dealer ratio, conversion efficiency, revenue trend, churn velocity, and coverage quality into one number — with drill-down into contributing factors. Designed for board-level reporting.

---

## 5. Beyond the Prototype — Long-Term Vision

The prototype establishes the data architecture and intelligence layer. Once proven, the platform can evolve into a comprehensive dealer network management system. Potential long-term capabilities include:

| Capability | Description |
|-----------|-------------|
| **Machine Learning Models** | Train predictive models on larger historical datasets for higher-accuracy churn prediction, deal probability scoring, and anomaly detection |
| **Core Lending System Integration** | Direct API connections to Source One's loan origination systems for real-time pipeline visibility (eliminating CSV-based data transfer) |
| **Mobile Application for Reps** | Dedicated mobile app combining dealer intelligence, visit routing, and activity logging — replacing the need for separate tools |
| **Seasonal Demand Modeling** | Leverage multi-year historical data to predict spring/summer RV buying peaks, enabling proactive dealer activation campaigns ahead of high-demand periods |
| **Advanced Fraud & Risk Signals** | Early-detection signals for application quality decline, unusual patterns in approval-to-booking ratios, or geographic anomalies that may indicate risk |
| **Portfolio-Level Stress Testing** | Model network-wide revenue impact under scenarios such as "What if our top 50 dealers reduce volume by 20%?" |
| **Automated Dealer Onboarding Scoring** | Score prospective new dealers based on market characteristics, geographic coverage gaps, and historical performance of similar dealers in the same region |

> This section is intentionally high-level. Each item would be scoped, estimated, and prioritized as a separate engagement once the prototype phase is complete.

---

## 6. Open Questions

The following items require input from Source One before the next phase of development can be fully scoped:

1. **Historical data depth:** How far back will the Applications, Approvals, Booked, and Booked Amounts ($) data go? (6 months? 12 months? Multi-year?) This directly affects the quality of year-over-year comparisons and the accuracy of predictive models.

2. **Badger Maps access:** Does Source One currently have Badger Maps API access, or is usage limited to the mobile application? If API access is available, we can integrate routing intelligence directly. If not, we can begin with a CSV-based priority export as an interim approach.

3. **Executive report audience:** Who would receive the Executive Intelligence Brief? Joseph only? The executive team? A broader distribution list? This affects the tone, depth, and emphasis of the report content.

4. **Preferred report format:** For the Executive Intelligence Brief — is the preference a PDF document with embedded charts (email delivery), an interactive dashboard view (browser-based), or both?

5. **Compliance considerations:** Are there any fair lending regulations, internal compliance policies, or data governance requirements that should inform how predictive models or automated alerts are designed and presented?

---

## Next Steps

We recommend scheduling a review session with Joseph and the leadership team to walk through this document, confirm priorities for the incoming data integration, and align on which strategic capabilities to build first. Once Applications, Approvals, Booked counts, and Booked Amounts ($) are provided (along with historical data depth), we can begin the next phase of development immediately.

---

## 7. Technical Architecture Summary

For reference, the platform is built on the following architecture:

| Layer | Technology | Purpose |
|-------|-----------|---------| 
| Frontend | Vite + React (TypeScript) | Interactive dashboard and management interface |
| Backend | Node.js + Express (JavaScript) | API server, data processing, report generation |
| Database | MongoDB Atlas (cloud-hosted) | Dealer data, snapshots, rollups, configuration |
| Deployment | Vercel | Serverless hosting for both frontend and API |
| Data Ingestion | Webhook endpoint (POST /webhook) | Receives daily CSV files automatically |

**Data Pipeline:**
```
Daily CSV → POST /webhook → CSV Parser → Dealer Group Detector
                                        → Metrics Ingestion (idempotent)
                                        → DailyDealerSnapshot (MongoDB)
                                        → Monthly Rollup Aggregation
                                        → Automated Reports & Alerts
```

**Current Data Volume:**
- ~3,500+ dealer locations tracked
- 47 states covered
- Daily snapshots accumulating time-series history since April 2026
- 11 MongoDB collections supporting the analytics engine

> For full deployment instructions, see the companion document: **Source One — Self-Hosted Deployment Guide**

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | April 27, 2026 | ViacoreMedia Engineering | Initial prototype documentation and strategic capability specification |
| 1.1 | April 27, 2026 | ViacoreMedia Engineering | Added prediction explainability, Badger Maps API note, seasonality context for pipeline forecasting, forward-looking funnel status note, formatting polish |

---

*Confidential — Prepared by ViacoreMedia for Source One Financial Services*
