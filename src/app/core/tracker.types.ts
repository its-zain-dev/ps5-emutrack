export type CompatibilityStatus =
  | 'In-Game'
  | 'Boots to Menu'
  | 'Pending Release'
  | 'Not Supported Yet';

export type EmulatorId = string;

export type CoreMatrixEmulatorId = 'kytyps5' | 'sharpemu' | 'prosperity' | 'anyps5';

export type EmulatorCategory =
  | 'All'
  | 'PS5 Native / HLE'
  | 'Translation & Re-Linking'
  | 'Low-Level / Kernel'
  | 'Mobile & Cross-Console'
  | 'PS4 & Hybrid Compat';

export type DataSourceKind = 'github-live' | 'local-cache' | 'static-fallback' | 'community-approved';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  sizeBytes: number;
}

export interface EmulatorReleaseInfo {
  tagName: string;
  releaseTitle: string;
  publishedAt: string;
  formattedDate: string;
  releaseUrl: string;
  directAssetUrl: string | null;
  directAssetName: string | null;
  bodyNotes: string;
  source: DataSourceKind;
  assets: ReleaseAsset[];
}

export interface EmulatorProject {
  id: EmulatorId;
  name: string;
  category: Exclude<EmulatorCategory, 'All'>;
  activityLabel: string;
  isMostActive: boolean;
  languages: string[];
  graphicsBackends: string[];
  platforms: string[];
  architectureSummary: string;
  statusSummary: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  releasesPageUrl: string;
  docsUrl?: string;
  apiLatestReleaseUrl: string | null;
  supportedGames?: string[];
  stars?: number;
  lastAutoScannedAt?: string;
  autoApproved?: boolean;
  fallbackRelease: EmulatorReleaseInfo;
}

export interface GameCompatibilityEntry {
  id: string;
  title: string;
  shortNote: string;
  featured: boolean;
  releaseTargetIso?: string;
  lastVerifiedDate: string;
  statuses: Record<CoreMatrixEmulatorId, CompatibilityStatus>;
  performanceNote: string;
  searchAliases?: string[];
  verifiedEmulators?: string[];
}

export interface EmulatorSubmissionInput {
  name: string;
  repoUrl: string;
  description: string;
  releaseOrDocsUrl: string;
  language?: string;
  graphicsBackend?: string;
  platforms?: string;
  category?: Exclude<EmulatorCategory, 'All'>;
}

export interface EmulatorSubmission extends EmulatorSubmissionInput {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  moderatorNote?: string;
  autoApprovedProject?: EmulatorProject;
}

export interface SubmissionValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof EmulatorSubmissionInput, string>>;
}

export interface SubmissionGitHubArtifacts {
  issueUrl: string;
  prJsonSnippet: string;
  markdownRow: string;
}

export interface AutomationSyncResult {
  generatedAt: string;
  scannedEmulators: number;
  updatedReleases: number;
  discoveredGameMentions: number;
  gtaStatus: CompatibilityStatus;
  summary: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface CountdownBreakdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isReleased: boolean;
  label: string;
}

export interface ChangelogLine {
  kind: 'heading' | 'bullet' | 'paragraph';
  text: string;
}

export interface TrackerDataPayload {
  generatedAt: string;
  repoUrl: string;
  lastCompatibilityScan?: string;
  emulators: Record<string, EmulatorReleaseInfo>;
  emulatorSupportedGames?: Record<string, string[]>;
  customEmulators?: EmulatorProject[];
  games?: GameCompatibilityEntry[];
}
