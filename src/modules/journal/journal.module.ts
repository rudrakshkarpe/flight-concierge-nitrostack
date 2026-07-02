import { Module } from '@nitrostack/core';
import { JournalPrompts } from './journal.prompts.js';
import { JournalResources } from './journal.resources.js';
import { JournalTools } from './journal.tools.js';

@Module({
  name: 'journal-memory',
  description: 'Local journal memory index for personal note exports and memory dumps',
  controllers: [JournalTools, JournalResources, JournalPrompts]
})
export class JournalModule {}
