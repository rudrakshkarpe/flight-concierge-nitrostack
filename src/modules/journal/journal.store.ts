import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  JournalEntry,
  JournalIndex,
  JournalSource,
  JournalSourceType,
  SearchResult
} from './journal.types.js';

const DEFAULT_EXTENSIONS = ['.md', '.markdown', '.txt', '.json', '.html', '.htm'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.obsidian',
  '.trash',
  'node_modules',
  'dist',
  'build'
]);

export class JournalStore {
  private readonly dataDir: string;
  private readonly indexPath: string;

  constructor() {
    this.dataDir = process.env.JOURNAL_MEMORY_DATA_DIR
      ? path.resolve(process.env.JOURNAL_MEMORY_DATA_DIR)
      : path.join(process.cwd(), 'data');
    this.indexPath = path.join(this.dataDir, 'journal-index.json');
  }

  getIndexPath(): string {
    return this.indexPath;
  }

  async addSource(input: {
    id: string;
    label: string;
    type: JournalSourceType;
    path?: string;
    includeExtensions?: string[];
    defaultTags?: string[];
  }): Promise<JournalSource> {
    const index = await this.loadIndex();
    const now = new Date().toISOString();
    const id = this.normalizeId(input.id);
    const existing = index.sources.find((source) => source.id === id);
    const sourcePath = input.path ? path.resolve(input.path) : undefined;

    if (sourcePath) {
      const stat = await fs.stat(sourcePath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`Source path must be an existing directory: ${sourcePath}`);
      }
    }

    const source: JournalSource = {
      id,
      label: input.label.trim(),
      type: input.type,
      path: sourcePath,
      includeExtensions: this.normalizeExtensions(input.includeExtensions),
      defaultTags: this.normalizeTags(input.defaultTags),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    index.sources = existing
      ? index.sources.map((item) => item.id === id ? source : item)
      : [...index.sources, source];

    await this.saveIndex(index);
    return source;
  }

  async listSources(): Promise<JournalSource[]> {
    const index = await this.loadIndex();
    return index.sources;
  }

  async indexSources(options: { sourceIds?: string[]; rebuild?: boolean } = {}): Promise<{
    indexed: number;
    skipped: number;
    sourceCount: number;
    entryCount: number;
    indexPath: string;
  }> {
    const index = await this.loadIndex();
    const selectedIds = new Set(options.sourceIds?.map((id) => this.normalizeId(id)));
    const sources = selectedIds.size > 0
      ? index.sources.filter((source) => selectedIds.has(source.id))
      : index.sources;

    if (sources.length === 0) {
      throw new Error('No matching journal sources are registered.');
    }

    const selectedSourceIds = new Set(sources.map((source) => source.id));
    let nextEntries = options.rebuild
      ? index.entries.filter((entry) => !selectedSourceIds.has(entry.sourceId))
      : [...index.entries];
    const existingByFile = new Map(nextEntries
      .filter((entry) => entry.filePath)
      .map((entry) => [`${entry.sourceId}:${entry.filePath}`, entry]));

    let indexed = 0;
    let skipped = 0;

    for (const source of sources) {
      if (!source.path) {
        skipped += 1;
        continue;
      }

      const files = await this.walk(source.path, new Set(source.includeExtensions));
      for (const filePath of files) {
        const parsed = await this.parseFile(filePath, source);
        if (!parsed) {
          skipped += 1;
          continue;
        }

        const oldEntry = existingByFile.get(`${source.id}:${filePath}`);
        if (oldEntry && oldEntry.checksum === parsed.checksum) {
          skipped += 1;
          continue;
        }

        nextEntries = [
          ...nextEntries.filter((entry) => !(entry.sourceId === source.id && entry.filePath === filePath)),
          parsed
        ];
        indexed += 1;
      }
    }

    index.entries = nextEntries.sort((a, b) => this.sortableDate(b).localeCompare(this.sortableDate(a)));
    await this.saveIndex(index);

    return {
      indexed,
      skipped,
      sourceCount: sources.length,
      entryCount: index.entries.length,
      indexPath: this.indexPath
    };
  }

  async captureEntry(input: {
    sourceId?: string;
    sourceType?: JournalSourceType;
    title: string;
    content: string;
    tags?: string[];
    createdAt?: string;
  }): Promise<JournalEntry> {
    const index = await this.loadIndex();
    const now = new Date().toISOString();
    const sourceId = this.normalizeId(input.sourceId ?? 'manual');
    const source = index.sources.find((item) => item.id === sourceId);

    if (!source) {
      index.sources.push({
        id: sourceId,
        label: sourceId === 'manual' ? 'Manual memory dumps' : sourceId,
        type: input.sourceType ?? 'other',
        includeExtensions: DEFAULT_EXTENSIONS,
        defaultTags: [],
        createdAt: now,
        updatedAt: now
      });
    }

    const content = this.normalizeWhitespace(input.content);
    const title = input.title.trim() || this.deriveTitle(content, 'Untitled memory dump');
    const checksum = this.hash(`${sourceId}:${title}:${content}:${input.createdAt ?? now}`);
    const entry: JournalEntry = {
      id: `manual-${checksum.slice(0, 16)}`,
      sourceId,
      sourceType: source?.type ?? input.sourceType ?? 'other',
      title,
      content,
      excerpt: this.toExcerpt(content),
      tags: this.normalizeTags([...(source?.defaultTags ?? []), ...(input.tags ?? [])]),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      indexedAt: now,
      checksum,
      wordCount: this.countWords(content)
    };

    index.entries = [
      ...index.entries.filter((item) => item.id !== entry.id),
      entry
    ].sort((a, b) => this.sortableDate(b).localeCompare(this.sortableDate(a)));

    await this.saveIndex(index);
    return entry;
  }

  async search(input: {
    query: string;
    sourceId?: string;
    tags?: string[];
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    const index = await this.loadIndex();
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const tags = this.normalizeTags(input.tags);
    const sourceId = input.sourceId ? this.normalizeId(input.sourceId) : undefined;
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);

    return index.entries
      .filter((entry) => !sourceId || entry.sourceId === sourceId)
      .filter((entry) => tags.length === 0 || tags.every((tag) => entry.tags.includes(tag)))
      .filter((entry) => this.inDateRange(entry, input.from, input.to))
      .map((entry) => ({ entry, score: this.scoreEntry(entry, terms) }))
      .filter((result) => terms.length === 0 || result.score > 0)
      .sort((a, b) => b.score - a.score || this.sortableDate(b.entry).localeCompare(this.sortableDate(a.entry)))
      .slice(0, limit)
      .map(({ entry, score }) => ({
        id: entry.id,
        sourceId: entry.sourceId,
        sourceType: entry.sourceType,
        title: entry.title,
        excerpt: this.highlightExcerpt(entry, terms),
        tags: entry.tags,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        filePath: entry.filePath,
        wordCount: entry.wordCount,
        score
      }));
  }

  async getEntry(id: string): Promise<JournalEntry | undefined> {
    const index = await this.loadIndex();
    return index.entries.find((entry) => entry.id === id);
  }

  async getStats(): Promise<{
    sourceCount: number;
    entryCount: number;
    tagCount: number;
    wordCount: number;
    indexPath: string;
    updatedAt: string;
  }> {
    const index = await this.loadIndex();
    const tags = new Set(index.entries.flatMap((entry) => entry.tags));

    return {
      sourceCount: index.sources.length,
      entryCount: index.entries.length,
      tagCount: tags.size,
      wordCount: index.entries.reduce((sum, entry) => sum + entry.wordCount, 0),
      indexPath: this.indexPath,
      updatedAt: index.updatedAt
    };
  }

  private async loadIndex(): Promise<JournalIndex> {
    await fs.mkdir(this.dataDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.indexPath, 'utf8');
      return JSON.parse(raw) as JournalIndex;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      const now = new Date().toISOString();
      return {
        version: 1,
        sources: [],
        entries: [],
        updatedAt: now
      };
    }
  }

  private async saveIndex(index: JournalIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  private async walk(root: string, extensions: Set<string>): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          files.push(...await this.walk(fullPath, extensions));
        }
        continue;
      }

      if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async parseFile(filePath: string, source: JournalSource): Promise<JournalEntry | undefined> {
    const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
    if (!raw.trim()) {
      return undefined;
    }

    const extension = path.extname(filePath).toLowerCase();
    const parsed = extension === '.json'
      ? this.parseJsonDump(raw, filePath)
      : extension === '.html' || extension === '.htm'
        ? this.parseHtmlDump(raw, filePath)
        : this.parseTextDump(raw, filePath);

    const content = this.normalizeWhitespace(parsed.content);
    if (!content) {
      return undefined;
    }

    const checksum = this.hash(`${source.id}:${filePath}:${content}`);
    const stat = await fs.stat(filePath);
    const tags = this.normalizeTags([...source.defaultTags, ...parsed.tags]);

    return {
      id: checksum.slice(0, 24),
      sourceId: source.id,
      sourceType: source.type,
      title: parsed.title,
      content,
      excerpt: this.toExcerpt(content),
      filePath,
      tags,
      createdAt: parsed.createdAt ?? stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      indexedAt: new Date().toISOString(),
      checksum,
      wordCount: this.countWords(content)
    };
  }

  private parseTextDump(raw: string, filePath: string): {
    title: string;
    content: string;
    tags: string[];
    createdAt?: string;
  } {
    const { frontmatter, body } = this.extractFrontmatter(raw);
    const title = frontmatter.title
      ?? this.deriveTitle(body, path.basename(filePath, path.extname(filePath)));
    const tags = this.parseTagValue(frontmatter.tags);

    return {
      title,
      content: body,
      tags,
      createdAt: frontmatter.date ?? frontmatter.created ?? frontmatter.createdAt
    };
  }

  private parseHtmlDump(raw: string, filePath: string): {
    title: string;
    content: string;
    tags: string[];
    createdAt?: string;
  } {
    const titleMatch = raw.match(/<title[^>]*>(.*?)<\/title>/is);
    const title = this.decodeHtml(titleMatch?.[1]?.trim() ?? path.basename(filePath, path.extname(filePath)));
    const content = this.decodeHtml(raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '));

    return { title, content, tags: [] };
  }

  private parseJsonDump(raw: string, filePath: string): {
    title: string;
    content: string;
    tags: string[];
    createdAt?: string;
  } {
    try {
      const value = JSON.parse(raw);
      const object = Array.isArray(value) ? value[0] : value;
      if (!object || typeof object !== 'object') {
        throw new Error('Unsupported JSON journal dump');
      }

      const record = object as Record<string, any>;
      const title = String(record.title ?? record.name ?? path.basename(filePath, '.json'));
      const content = String(record.textContent ?? record.content ?? record.body ?? record.note ?? raw);
      const labels = Array.isArray(record.labels)
        ? record.labels.map((item: any) => typeof item === 'string' ? item : item?.name).filter(Boolean)
        : [];
      const tags = this.normalizeTags([
        ...labels,
        ...this.parseTagValue(record.tags)
      ]);

      return {
        title,
        content,
        tags,
        createdAt: record.createdAt ?? record.created_at ?? record.createdTimestampUsec
      };
    } catch {
      return {
        title: path.basename(filePath, '.json'),
        content: raw,
        tags: []
      };
    }
  }

  private extractFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
    if (!raw.startsWith('---')) {
      return { frontmatter: {}, body: raw };
    }

    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: raw };
    }

    const frontmatter: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator === -1) {
        continue;
      }
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }

    return { frontmatter, body: match[2] };
  }

  private normalizeId(id: string): string {
    const normalized = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    if (!normalized) {
      throw new Error('Source id cannot be empty.');
    }
    return normalized;
  }

  private normalizeExtensions(extensions?: string[]): string[] {
    const normalized = (extensions?.length ? extensions : DEFAULT_EXTENSIONS)
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean)
      .map((extension) => extension.startsWith('.') ? extension : `.${extension}`);
    return [...new Set(normalized)];
  }

  private normalizeTags(tags?: string[]): string[] {
    return [...new Set((tags ?? [])
      .flatMap((tag) => String(tag).split(','))
      .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean))];
  }

  private parseTagValue(value: unknown): string[] {
    if (Array.isArray(value)) {
      return this.normalizeTags(value.map(String));
    }
    if (typeof value === 'string') {
      return this.normalizeTags(value.replace(/^\[|\]$/g, '').split(/[, ]+/));
    }
    return [];
  }

  private deriveTitle(content: string, fallback: string): string {
    const firstLine = content.split('\n').find((line) => line.trim());
    return (firstLine ?? fallback)
      .replace(/^#+\s*/, '')
      .trim()
      .slice(0, 120) || fallback;
  }

  private toExcerpt(content: string): string {
    return this.normalizeWhitespace(content).slice(0, 320);
  }

  private highlightExcerpt(entry: JournalEntry, terms: string[]): string {
    const content = this.normalizeWhitespace(entry.content);
    const firstTerm = terms.find((term) => content.toLowerCase().includes(term));
    if (!firstTerm) {
      return entry.excerpt;
    }

    const index = content.toLowerCase().indexOf(firstTerm);
    const start = Math.max(0, index - 120);
    return content.slice(start, start + 320);
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  private countWords(content: string): number {
    return content.split(/\s+/).filter(Boolean).length;
  }

  private scoreEntry(entry: JournalEntry, terms: string[]): number {
    if (terms.length === 0) {
      return 1;
    }

    const title = entry.title.toLowerCase();
    const content = entry.content.toLowerCase();
    const tags = entry.tags.join(' ').toLowerCase();

    return terms.reduce((score, term) => {
      let nextScore = score;
      if (title.includes(term)) {
        nextScore += 5;
      }
      if (tags.includes(term)) {
        nextScore += 3;
      }
      nextScore += content.split(term).length - 1;
      return nextScore;
    }, 0);
  }

  private inDateRange(entry: JournalEntry, from?: string, to?: string): boolean {
    const date = entry.createdAt ?? entry.updatedAt;
    if (!date) {
      return true;
    }

    const timestamp = Date.parse(date);
    if (Number.isNaN(timestamp)) {
      return true;
    }

    if (from && timestamp < Date.parse(from)) {
      return false;
    }
    if (to && timestamp > Date.parse(to)) {
      return false;
    }
    return true;
  }

  private sortableDate(entry: JournalEntry): string {
    return entry.createdAt ?? entry.updatedAt ?? entry.indexedAt;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}
