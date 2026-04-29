/**
 * @viacoremedia/bug-reporter
 * 
 * Shared types for the Bug Reporter package.
 */

export interface BugReporterUser {
  name?: string;
  email?: string;
  role?: string;
  id?: string;
}

export interface BugReporterConfig {
  /** Unique name for this system (e.g. "Map", "Precision ERP") */
  systemName: string;
  /** API URL for the bug reporter backend. Defaults to production. */
  apiUrl?: string;
  /** Optional user context to attach to reports */
  user?: BugReporterUser | null;
  /** Contact email for auto-registration. Defaults to joshua@viacoremedia.com */
  contact?: string;
}

export type Severity = 'Critical' | 'Urgent' | 'Not Urgent';
export type ReportType = 'bug' | 'feature';
