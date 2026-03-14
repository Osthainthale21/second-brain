export type DesignType = 'knowledge-map' | 'infographic' | 'summary-card' | 'digest-card' | 'timeline';

export interface DesignJob {
  id: string;
  type: DesignType;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  designUrl?: string;
  thumbnailUrl?: string;
  canvaDesignId?: string;
  error?: string;
}

export interface KnowledgeMapOptions {
  centerNoteId?: string;
  depth?: number;
  maxNodes?: number;
  tags?: string[];
}

export interface InfographicOptions {
  topic: string;
  noteIds?: string[];
  style?: 'modern' | 'minimal' | 'colorful';
}

export interface SummaryCardOptions {
  noteId: string;
  style?: 'default' | 'social' | 'presentation';
}

export interface DigestCardOptions {
  date?: string;
  noteIds?: string[];
}

export interface TimelineOptions {
  dateRange?: { from: string; to: string };
  tags?: string[];
  maxEntries?: number;
}
