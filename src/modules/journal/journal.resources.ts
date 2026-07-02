import { ResourceDecorator as Resource, ExecutionContext } from '@nitrostack/core';
import { JournalStore } from './journal.store.js';

export class JournalResources {
  private readonly store = new JournalStore();

  @Resource({
    uri: 'journal-memory://stats',
    name: 'Journal Memory Index Stats',
    description: 'Current local journal-memory index statistics.',
    mimeType: 'application/json'
  })
  async getStats(uri: string, ctx: ExecutionContext) {
    ctx.logger.info('Fetching journal memory stats');
    const stats = await this.store.getStats();

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(stats, null, 2)
      }]
    };
  }

  @Resource({
    uri: 'journal-memory://sources',
    name: 'Journal Memory Sources',
    description: 'Registered journal source configuration.',
    mimeType: 'application/json'
  })
  async getSources(uri: string, ctx: ExecutionContext) {
    ctx.logger.info('Fetching journal memory sources');
    const sources = await this.store.listSources();

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ sources }, null, 2)
      }]
    };
  }
}
