import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { JournalStore } from './journal.store.js';
import { JOURNAL_SOURCE_TYPES } from './journal.types.js';

const sourceTypeSchema = z.enum(JOURNAL_SOURCE_TYPES);

export class JournalTools {
  private readonly store = new JournalStore();

  @Tool({
    name: 'register_journal_source',
    description: 'Register or update a local exported journal source, such as an Obsidian vault, Notion export, Apple Notes export, or Google Keep Takeout folder.',
    inputSchema: z.object({
      id: z.string().describe('Stable lowercase source id, for example obsidian-personal or notion-journal'),
      label: z.string().describe('Human-readable source label'),
      type: sourceTypeSchema.describe('Where this source came from'),
      path: z.string().optional().describe('Absolute or relative local folder path to index'),
      includeExtensions: z.array(z.string()).optional().describe('File extensions to include. Defaults to md, markdown, txt, json, html, and htm.'),
      defaultTags: z.array(z.string()).optional().describe('Tags to apply to every entry from this source')
    })
  })
  async registerSource(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Registering journal source', { id: input.id, type: input.type });
    const source = await this.store.addSource(input);
    return {
      status: 'ok',
      source,
      next: 'Run index_journals to scan this source.'
    };
  }

  @Tool({
    name: 'list_journal_sources',
    description: 'List registered journal sources and local index metadata.',
    inputSchema: z.object({})
  })
  async listSources(_input: any, ctx: ExecutionContext) {
    ctx.logger.info('Listing journal sources');
    const [sources, stats] = await Promise.all([
      this.store.listSources(),
      this.store.getStats()
    ]);
    return { sources, stats };
  }

  @Tool({
    name: 'index_journals',
    description: 'Scan registered local journal folders and update the searchable memory index.',
    inputSchema: z.object({
      sourceIds: z.array(z.string()).optional().describe('Optional source ids to scan. Omit to scan all registered sources.'),
      rebuild: z.boolean().default(false).describe('Remove old entries for selected sources before indexing.')
    })
  })
  async indexJournals(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Indexing journal sources', {
      sourceIds: input.sourceIds,
      rebuild: input.rebuild
    });
    const result = await this.store.indexSources({
      sourceIds: input.sourceIds,
      rebuild: input.rebuild
    });
    return { status: 'ok', ...result };
  }

  @Tool({
    name: 'search_journals',
    description: 'Search indexed journal entries by keyword, source, tag, or date range.',
    inputSchema: z.object({
      query: z.string().describe('Keyword or phrase to search for. Use an empty string to list recent entries.'),
      sourceId: z.string().optional().describe('Restrict search to one registered source id'),
      tags: z.array(z.string()).optional().describe('Require all of these tags'),
      from: z.string().optional().describe('Earliest created date, parseable by JavaScript Date'),
      to: z.string().optional().describe('Latest created date, parseable by JavaScript Date'),
      limit: z.number().min(1).max(50).default(10).describe('Maximum number of results')
    })
  })
  async searchJournals(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Searching journals', {
      query: input.query,
      sourceId: input.sourceId,
      limit: input.limit
    });
    const results = await this.store.search(input);
    return {
      count: results.length,
      results
    };
  }

  @Tool({
    name: 'get_journal_entry',
    description: 'Fetch the full content for one indexed journal entry.',
    inputSchema: z.object({
      id: z.string().describe('Journal entry id returned by search_journals')
    })
  })
  async getJournalEntry(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Fetching journal entry', { id: input.id });
    const entry = await this.store.getEntry(input.id);
    if (!entry) {
      throw new Error(`Journal entry not found: ${input.id}`);
    }
    return entry;
  }

  @Tool({
    name: 'capture_memory_dump',
    description: 'Add a one-off memory dump directly to the local journal index without needing a source folder.',
    inputSchema: z.object({
      sourceId: z.string().default('manual').describe('Source bucket for this memory dump'),
      sourceType: sourceTypeSchema.default('other').describe('Where this dump came from'),
      title: z.string().describe('Short title for the memory dump'),
      content: z.string().describe('Journal text or memory dump content'),
      tags: z.array(z.string()).optional().describe('Tags for this memory dump'),
      createdAt: z.string().optional().describe('Optional original creation date')
    })
  })
  async captureMemoryDump(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Capturing memory dump', { sourceId: input.sourceId, title: input.title });
    const entry = await this.store.captureEntry(input);
    return {
      status: 'ok',
      entry
    };
  }
}
