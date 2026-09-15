const nodemailer = require('nodemailer');
require('dotenv').config({ path: '/home/joshg/viacore-v2/Source One/server/.env' });

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.PASSWORD || process.env.SMTP_PASS,
  },
});

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14.5px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0 20px 0; font-size: 13.5px; }
  th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
  th { background-color: #f1f5f9; font-weight: 700; color: #0f172a; }
  .callout { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #0f172a; }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14.5px; max-width: 860px; margin: 0 auto; padding: 20px;">

  <p>Hi Lawrence, Craig, and the Triad Leadership Team,</p>

  <p>Following our architectural discussions, we have consolidated our evaluation into two distinct deployment pathways for Triad. Because <strong>ECN Capital owns both Source One Financial and Triad</strong>, our overarching objective is to build a <strong>unified, multi-tenant platform</strong>. This approach enables both companies to share feature innovations seamlessly, eliminates duplicate engineering, and establishes a scalable foundation to onboard future ECN Capital portfolio companies.</p>

  <p>We have analyzed Triad’s sales activity and visit reporting model (including sample JotForm field data spanning January 2025 through September 2026), and we have mapped out the exact ingestion architecture for field operations. To deliver the complete operational intelligence platform, we now present the strategic decision on database architecture:</p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

  <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 12px;">Executive Decision Matrix: Path A (Fast-Track Mongo) vs. Path B (Enterprise SQL Server)</h3>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13.5px;">
    <thead>
      <tr style="background-color: #f1f5f9; text-align: left;">
        <th style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 700; width: 18%;">Dimension</th>
        <th style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 700; width: 41%;">Path A: Azure MongoDB (Cosmos DB)</th>
        <th style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 700; width: 41%; color: #0369a1; background-color: #f0f9ff;">Path B: Native Azure SQL Managed Instance <em>(Recommended)</em></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 600;">Go-Live / Pilot</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px;"><strong>2–3 Weeks</strong> to live pilot (from data receipt)</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><strong>7–9 Weeks</strong> to full production (from data receipt)</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 600;">Engineering Scope</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px;"><strong>Low refactoring.</strong> Reuses 100% of ViaCore’s proven analytics engine; adapts schemas to Triad’s data fields and adds multi-tenant tagging (<code>tenantId: 'triad'</code>).</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><strong>High refactoring.</strong> Converts 20 Mongoose schemas to ~35–40 relational tables; rewrites 37 complex aggregation pipelines into parameterized SQL / Knex.js.</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 600;">Triad Team Maintenance</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px;">Maintained by ViaCore. Triad IT manages VMs and VNet, but Triad DBAs do not manage the document layer directly.</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><strong>Maintained collaboratively with Triad DBAs.</strong> Triad’s internal team has 100% visibility, can write direct T-SQL views, and troubleshoot natively.</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 600;">EDW Integration (Kat)</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px;">Kat’s team pushes data via Azure Data Factory, REST API endpoints, or scheduled JSON batch ingestion.</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><strong>Native SQL-to-SQL.</strong> Kat’s team pushes via standard T-SQL staging tables, Stored Procedures, SSIS, or MERGE views.</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; font-weight: 600;">Strategic ECN Value</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px;">Rapid pilot validation for Triad before committing to an enterprise database overhaul.</td>
        <td style="border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><strong>Enterprise Gold Standard.</strong> Unified relational schema standardized across both Source One and Triad.</td>
      </tr>
    </tbody>
  </table>

  <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <strong style="color: #15803d;">ViaCore Recommendation:</strong><br />
    If immediate time-to-market is the primary objective, <strong>Path A</strong> gets a live, interactive pilot in front of leadership in <strong>under 3 weeks</strong>. However, if long-term IT governance, internal Triad DBA maintainability, and native SQL-to-SQL EDW ingestion are paramount, <strong>Path B is the superior enterprise foundation</strong> and will be applied across both Triad and Source One under ECN.
  </div>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />

  <h2 style="color: #0f172a; font-size: 18px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Technical Responses to Craig’s Action Items</h2>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 20px; margin-bottom: 8px;">1. SQL Server Scope &amp; Refactoring Impact</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"Confirm that the DB in scope can be SQL Server (MI) — does this represent major refactoring for your devs?"</p>
  <ul>
    <li><strong>The Reality:</strong> <strong>Yes, this is the single largest technical workstream.</strong> It is completely achievable, but represents an ~8-week engineering investment.</li>
    <li><strong>Frontend Isolation (0% Impact):</strong> The React frontend communicates strictly via REST API endpoints. All 118 client-side files remain untouched.</li>
    <li><strong>Backend Modernization:</strong>
      <ul>
        <li><strong>20 Mongoose Models &rarr; ~35–40 Relational Tables:</strong> Nested arrays (dealer contacts, Badger CRM sync logs, tags, override histories) decompose into clean relational tables with foreign keys.</li>
        <li><strong>37 MongoDB Aggregation Pipelines &rarr; Parameterized T-SQL:</strong> Rolling averages, relationship health scores, underwriter performance metrics, and MoM cohorts will be converted to SQL <code>JOIN</code>, <code>GROUP BY</code>, and Window functions.</li>
        <li><strong>Recommended Query Layer:</strong> We will use <strong>Knex.js</strong> with the native <code>mssql</code> driver. This avoids ORM opacity, giving Triad’s DBAs clean, human-readable SQL and inspectable migration scripts.</li>
      </ul>
    </li>
  </ul>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">2. EDW Integration Pipeline &amp; Delivery Timeline (Kat’s Team)</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"Re: database in TRIAD’s ViaCore system — how Kat can PUSH data to your database."</p>
  <p>With Path B (SQL-to-SQL), integration follows standard enterprise ETL patterns:</p>
  <ol>
    <li>Kat’s team pushes daily batch records to a dedicated staging schema (<code>stg.*</code>) via Azure Data Factory, SSIS, or linked stored procedures.</li>
    <li>An automated T-SQL stored procedure performs a <code>MERGE</code> into production tables (<code>dbo.*</code>).</li>
    <li>ViaCore’s Node.js API processes the updates and refreshes daily snapshots.</li>
  </ol>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
    <strong style="color: #92400e; font-size: 14px;">⏱️ Timeline Prerequisite &mdash; Delivery Begins Upon Receipt of Data:</strong><br />
    <span style="color: #78350f;">Please note that the implementation timeline (<strong>2–3 weeks for Path A pilot</strong>, or <strong>7–9 weeks for full Path B production</strong>) <strong>officially begins once ViaCore receives all required core data feeds</strong> from Kat’s team. Finalizing database schemas, building staging table merge routines, mapping counterparties, and calibrating analytics all require the active source datasets in hand.</span>
  </div>

  <p style="margin-bottom: 6px;"><strong>Core Data Feeds &amp; Requirements:</strong></p>
  <ul>
    <li><strong>1. Counterparty Master Feed (Required to Start):</strong>
      <p style="margin: 4px 0 8px 0; color: #334155;">A master export/feed of all Triad retailers, dealers, and brokers: unique Counterparty ID, legal name, DBA, address, city, state, active status, assigned BDM/sales rep, and market region. <em>(What Triad calls its counterparties).</em></p>
    </li>
    <li><strong>2. Loan Applications &amp; Pipeline Feed (Required to Start):</strong>
      <p style="margin: 4px 0 8px 0; color: #334155;">The loan origination feed from Encompass / Solifi: Application ID, submission date, approval date, funding/booked date, loan amount, dealer/broker ID, underwriter name, and status milestones.</p>
    </li>
    <li><strong>3. Sales Communications &amp; Visit Activity (JotForm):</strong>
      <p style="margin: 4px 0 8px 0; color: #334155;">We have already inspected the sample JotForm export columns and engineered the exact ingestion mapping into our communication and follow-up engines (detailed in Section 6 below).</p>
    </li>
  </ul>

  <p><strong>Next Step for Kat’s Team:</strong> Please share sample CSV exports or data dictionaries containing column headers for feeds #1 and #2. As soon as these are provided, the implementation timeline begins immediately.</p>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">3. Security, In-Tenant Data Custody &amp; SOC 2 Status</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"As part of our vendor onboarding, we will require SOC2, security attestations, etc. — do you have these at the ready?"</p>
  <ul>
    <li><strong>100% In-Tenant Data Custody:</strong> ViaCore’s entire stack will reside directly inside <strong>Triad’s Azure subscription and private VNet</strong>. Zero Triad customer PII, loan applications, or sales notes ever leave your cloud perimeter. The deployment automatically inherits Triad’s existing Azure SOC 1/2/3, ISO 27001, and FedRAMP compliance baselines.</li>
    <li><strong>SOC 2 Status &amp; Audit Roadmap:</strong> ViaCore does not currently hold a standalone SOC 2 Type II report (which requires a 6–12 month external auditor observation window). We are prepared to engage an audit automation partner (Vanta/Drata) to achieve a <strong>SOC 2 Type I report within ~3 months</strong>.</li>
    <li><strong>Immediate Vendor Deliverables:</strong>
      <ul>
        <li>Complete Triad’s Vendor Risk Assessment Questionnaire immediately.</li>
        <li>Provide documented architecture specifications (RBAC, TLS 1.3 in transit, AES-256 encryption at rest, environment isolation).</li>
        <li>Provide automated third-party vulnerability and dependency scans (Snyk / Dependabot).</li>
        <li>Supply an auditor engagement commitment letter once initiated.</li>
      </ul>
    </li>
    <li><em>Ask for Triad:</em> Please confirm if your vendor management team approves this in-tenant deployment model alongside an interim Type I roadmap to clear initial onboarding.</li>
  </ul>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">4. Azure Hosting &amp; Decommissioning Vercel</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"We are in Azure, we need to understand how VERCEL works for us — we use DevOps &amp; Terraform."</p>
  <p><strong>Vercel is being completely decommissioned.</strong> There will be zero third-party cloud hosting:</p>
  <ul>
    <li><strong>Terraform (IaC):</strong> ViaCore will provide modular <code>.tf</code> scripts defining VNets, subnets, Network Security Groups (NSGs), VM compute, and private database endpoints for Triad’s DevOps team to inspect and apply.</li>
    <li><strong>Azure DevOps Pipelines:</strong> We will deliver <code>azure-pipelines.yml</code> definitions for automated build, testing, static bundle compilation, database migrations, and zero-downtime deployment.</li>
  </ul>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">5. Target Azure Infrastructure Sizing &amp; Monthly Estimates</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"If traditional VMs, approximate compute and storage sizing for cost estimates."</p>
  <p style="font-size: 13px; color: #64748b; margin-top: 0;"><em>Pricing reflects standard retail Pay-As-You-Go list rates (all Microsoft OS and SQL licenses included; zero hybrid benefit or reserved instance discounts assumed).</em></p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13.5px;">
    <thead>
      <tr style="background-color: #f1f5f9; text-align: left;">
        <th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 700;">Component</th>
        <th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 700;">Sizing &amp; Configuration</th>
        <th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 700;">Monthly (Retail)</th>
        <th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 700;">Purpose</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-weight: 600;">VM 1 (Node.js API)</td>
        <td>Standard_D4s_v5 Windows<br /><span style="color:#64748b; font-size:12px;">4 vCPU, 16 GB RAM, 128 GB OS + 64 GB Data Disk</span></td>
        <td style="font-weight: 600;">~$292</td>
        <td>Express backend, CSV batch ingestion, report caching, PDF generation.</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">VM 2 (Frontend Server)</td>
        <td>Standard_D4s_v5 Windows<br /><span style="color:#64748b; font-size:12px;">4 vCPU, 16 GB RAM, 128 GB SSD</span></td>
        <td style="font-weight: 600;">~$292</td>
        <td>Nginx/IIS serving compiled static assets (dist/) and compute headroom.</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Azure SQL Managed Instance</td>
        <td>General Purpose, 4 vCores, 128 GB Storage<br /><span style="color:#64748b; font-size:12px;">License Included</span></td>
        <td style="font-weight: 600;">~$746</td>
        <td>Fully managed PaaS SQL Server; full T-SQL parity and native tooling for Kat's EDW.</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Networking &amp; Telemetry</td>
        <td>Dedicated Subnet, Private Endpoints, App Insights</td>
        <td style="font-weight: 600;">~$15</td>
        <td>Internal VNet traffic routing, private DB access, and system telemetry.</td>
      </tr>
      <tr style="background-color: #f8fafc; font-weight: 700;">
        <td colspan="2" style="text-transform: uppercase;">Total Estimated Infrastructure</td>
        <td style="color: #0f172a; font-size: 14px;">~$1,345 / mo</td>
        <td style="font-weight: normal; color: #64748b; font-size: 12.5px;">All compute, storage, and licenses included.</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-bottom: 4px;"><strong>Cost Reduction Levers:</strong></p>
  <ul>
    <li><strong>Linux VMs (Save ~$268/mo):</strong> Deploying Ubuntu 22.04 LTS on compute VMs eliminates Windows OS licensing fees, bringing total spend to <strong>~$1,077/mo</strong>.</li>
    <li><strong>Azure Static Web Apps (Save ~$280+/mo):</strong> Replacing VM 2 with Azure Static Web Apps (~$9/mo) brings total spend to <strong>~$1,050/mo</strong> (or <strong>~$780/mo</strong> with a Linux API VM).</li>
    <li><strong>Existing Capacity ($0 DB Cost):</strong> If Triad has available vCore capacity on an existing SQL MI cluster, monthly spend drops to compute only (<strong>~$585/mo</strong> Windows, <strong>~$317/mo</strong> Linux).</li>
  </ul>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">6. JotForm Ingestion: How We Ingest &amp; Operationalize This Data</h3>
  <p style="color: #475569; font-style: italic; margin-top: 0;">"How does ViaCore ingest and consume Triad’s JotForm field visit activity into the system?"</p>
  <p>We have analyzed the sample JotForm field reporting schema. Here is exactly how our automated pipeline ingests, normalizes, and activates every column across the platform:</p>
  <ul>
    <li><strong>BDM Attribution &amp; Visit Timeline:</strong> <code>Submission Date</code>, <code>BDM Name</code>, <code>BDM Email</code>, <code>Date of Visit</code>, and <code>Type of visit/activity?</code> (In Person vs. Virtual/Phone) map directly into the rep activity timeline and coverage heatmaps.</li>
    <li><strong>Counterparty Resolution:</strong> <code>Company Name</code> and <code>Company Address</code> are matched against the Counterparty Master Table to link visits to the correct rooftop. Contact information (<code>Who did you speak with?</code>, <code>Email</code>) dynamically updates the location’s key personnel profile.</li>
    <li><strong>Sentiment &amp; Relationship Health:</strong> <code>Summary of visit:</code>, <code>Triad products Cross-sold</code> (Floor Plan, Repos, Used Homes, Land Plus, Insurance), and <code>Issues or complaints reported?</code> (e.g. communication delays, underwriter turnaround, rate competition against 21st/CSL) feed directly into our NLP sentiment engine and dealer health scoring.</li>
    <li><strong>Pipeline &amp; Funding Intelligence:</strong> <code>Estimated fundings for current month</code> and <code>Pipeline update (active Triad files count)</code> provide real-time field-level forecasting before formal loan files hit Solifi/Encompass.</li>
    <li><strong>Actionable Follow-Ups:</strong> <code>Follow Up Date</code> and <code>Follow Up Notes</code> automatically populate our interactive Follow-Up Drawer, setting reminders and overdue alerts for the BDM team.</li>
    <li><strong>Marketing &amp; Swag Fulfillment:</strong> <code>Marketing Materials Needed</code>, <code>Swag Requested</code>, <code>Marketing Request Notes</code>, <code>Date Package Sent</code>, and <code>Tracking Number</code> are tracked to provide full operational visibility into collateral fulfillment.</li>
  </ul>
  <p><strong>Ingestion Mechanism:</strong> For historical backfill, we execute a batch ingestion script. Going forward, Triad can either configure a direct JotForm webhook / scheduled export to Azure Blob Storage, or push these logs directly through Kat's EDW pipeline as Triad transitions its field reporting.</p>

  <h3 style="color: #0f172a; font-size: 15px; margin-top: 24px; margin-bottom: 8px;">7. ViaCore Technical Team Points of Contact</h3>
  <ul>
    <li><strong>Joshua Goold</strong> (<code>joshua@viacoremedia.com</code>) &mdash; Technical Lead, Architecture &amp; Full-Stack Systems</li>
    <li><strong>Harman Mann</strong> (<code>harman@viacoremedia.com</code>) &mdash; Data Engineering &amp; System Integration</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

  <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 10px;">Suggested Next Steps for Our Working Session</h3>
  <ol>
    <li><strong>Executive Decision:</strong> Confirm whether Lawrence and the team prefer <strong>Path A (Rapid Mongo pilot in ~3 weeks)</strong> or <strong>Path B (Full Enterprise SQL migration in ~8 weeks)</strong>.</li>
    <li><strong>Data Delivery from Kat’s Team (Timeline Kickoff):</strong> Schedule a 30-minute working session with Kat to review column headers for Triad’s counterparties and loan feeds, and provide sample data to officially commence the build timeline.</li>
    <li><strong>Vendor Clearance:</strong> Submit Triad’s Vendor Risk Assessment Questionnaire for ViaCore’s immediate execution.</li>
    <li><strong>DevOps Access:</strong> Coordinate contributor access to Triad’s Azure DevOps project for Terraform and pipeline configuration.</li>
  </ol>

  <p style="margin-top: 24px;">Looking forward to our discussion and aligning on the path forward.</p>

  <p style="margin-bottom: 0;">
    Best regards,<br />
    <strong>ViaCore Media Engineering</strong>
  </p>
</body>
</html>
`;

async function main() {
  console.log('Sending corrected email from', process.env.SMTP_USER, 'to joshua@viacoremedia.com ...');
  const info = await transporter.sendMail({
    from: `"ViaCore Media Engineering" <${process.env.SMTP_USER}>`,
    to: 'joshua@viacoremedia.com',
    subject: 'ViaCore → Triad Azure Architecture: Executive Decision Framework & Technical Specifications',
    html: htmlContent,
  });
  console.log('Message sent successfully! Message ID:', info.messageId);
}

main().catch(err => {
  console.error('Error sending email:', err);
  process.exit(1);
});
