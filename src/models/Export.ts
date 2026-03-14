export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface ExportJob {
  id: string;
  format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  filePath?: string;
  error?: string;
}

export interface PdfExportOptions {
  noteIds: string[];
  merge?: boolean;
  title?: string;
  includeMetadata?: boolean;
}

export interface DocxExportOptions {
  noteIds: string[];
  title?: string;
  template?: string;
  includeTableOfContents?: boolean;
}

export interface XlsxExportOptions {
  noteIds?: string[];
  includeSheets: ('overview' | 'tags' | 'timeline' | 'graph')[];
  dateRange?: { from: string; to: string };
}

export interface PptxExportOptions {
  topic: string;
  noteIds?: string[];
  slideCount?: number;
  template?: string;
}

export interface ReportOptions {
  topic: string;
  format: ExportFormat;
  depth?: 'brief' | 'detailed' | 'comprehensive';
  noteIds?: string[];
  includeSourceLinks?: boolean;
}
