export type NoteSource = 'api' | 'telegram' | 'manual' | 'notion' | 'gdrive' | 'web' | 'agent';
export type NoteStatus = 'inbox' | 'processed' | 'evergreen';

export interface NoteFrontmatter {
  id: string;
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  source?: NoteSource;
  status?: NoteStatus;
  links?: string[];
  notion_id?: string;
  gdrive_id?: string;
  source_url?: string;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  content: string;
  filePath: string;
}

export interface CreateNoteDto {
  title: string;
  content: string;
  tags?: string[];
  source?: NoteSource;
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
  status?: NoteStatus;
  links?: string[];
}

export interface SearchResult {
  note: Note;
  score: number;
  source: 'vector' | 'graph' | 'hybrid';
}
