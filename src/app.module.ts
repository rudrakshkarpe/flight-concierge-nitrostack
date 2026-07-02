import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { JournalModule } from './modules/journal/journal.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'journal-memory-mcp',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    JournalModule
  ],
  providers: [
    SystemHealthCheck,
  ]
})
export class AppModule {}
