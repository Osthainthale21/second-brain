export type SyncSource = 'notion' | 'gdrive' | 'web';
export type SyncStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SyncJob {
  id: string;
  source: SyncSource;
  status: SyncStatus;
  startedAt: string;
  completedAt?: string;
  itemsSynced: number;
  errors: string[];
}

export interface NotionSyncConfig {
  pageId?: string;
  databaseId?: string;
  filter?: Record<string, unknown>;
  syncAll?: boolean;
}

export interface GDriveSyncConfig {
  fileId?: string;
  folderId?: string;
  query?: string;
  mimeTypes?: string[];
}

export interface WebScrapeConfig {
  url: string;
  selector?: string;
  summarize?: boolean;
  tags?: string[];
}

export interface SyncHistoryEntry {
  id: string;
  source: SyncSource;
  status: SyncStatus;
  startedAt: string;
  completedAt?: string;
  itemsSynced: number;
  noteIds: string[];
  errors: string[];
}
