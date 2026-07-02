export const JOURNAL_SOURCE_TYPES = [
  'notion',
  'obsidian',
  'apple_notes',
  'google_keep',
  'markdown',
  'text',
  'other'
] as const;

export type JournalSourceType = typeof JOURNAL_SOURCE_TYPES[number];

export interface JournalSource {
  id: string;
  label: string;
  type: JournalSourceType;
  path?: string;
  includeExtensions: string[];
  defaultTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  sourceId: string;
  sourceType: JournalSourceType;
  title: string;
  content: string;
  excerpt: string;
  filePath?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  indexedAt: string;
  checksum: string;
  wordCount: number;
}

export interface JournalIndex {
  version: number;
  sources: JournalSource[];
  entries: JournalEntry[];
  updatedAt: string;
}

export interface SearchResult {
  id: string;
  sourceId: string;
  sourceType: JournalSourceType;
  title: string;
  excerpt: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  filePath?: string;
  wordCount: number;
  score: number;
}
