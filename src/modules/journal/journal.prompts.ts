import { PromptDecorator as Prompt, ExecutionContext } from '@nitrostack/core';

export class JournalPrompts {
  @Prompt({
    name: 'journal_memory_recall',
    description: 'Prompt for recalling patterns, memories, and themes from indexed journal entries.',
    arguments: [
      {
        name: 'topic',
        description: 'Memory theme, project, relationship, emotion, or time period to investigate',
        required: true
      }
    ]
  })
  async recall(args: any, ctx: ExecutionContext) {
    ctx.logger.info('Generating journal recall prompt', { topic: args.topic });
    const topic = args.topic;

    return [
      {
        role: 'user' as const,
        content: `Search my indexed journals for "${topic}". Start with search_journals, fetch the most relevant entries with get_journal_entry, then summarize recurring themes, concrete memories, unresolved questions, and dates or sources that seem important.`
      }
    ];
  }

  @Prompt({
    name: 'journal_source_setup',
    description: 'Prompt for registering note exports and vaults as journal-memory sources.',
    arguments: []
  })
  async setup(_args: any, ctx: ExecutionContext) {
    ctx.logger.info('Generating journal source setup prompt');

    return [
      {
        role: 'user' as const,
        content: 'Help me register my local journal sources. Use register_journal_source for each folder, then run index_journals with rebuild=true. Treat Obsidian vaults as markdown, Notion exports as notion, Apple Notes exports as apple_notes, and Google Keep Takeout folders as google_keep.'
      }
    ];
  }
}
