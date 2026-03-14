export interface NoteFrontmatter {
  id: string;
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  source?: 'api' | 'telegram' | 'manual';
  status?: 'inbox' | 'processed' | 'evergreen';
  links?: string[];
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
  source?: 'api' | 'telegram' | 'manual';
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
  status?: 'inbox' | 'processed' | 'evergreen';
}

export interface SearchResult {
  note: Note;
  score: number;
  source: 'vector' | 'graph' | 'hybrid';
}
