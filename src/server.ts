import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { vaultService } from './services/vault.service';
import { embeddingService } from './services/embedding.service';
import { graphService } from './services/graph.service';
import { whisperService } from './services/whisper.service';
import { telegramService } from './services/telegram.service';
import { agentScheduler } from './agents/scheduler';

async function bootstrap(): Promise<void> {
  // 1. Initialize vault
  await vaultService.init();

  // 2. Initialize ChromaDB (graceful if unavailable)
  await embeddingService.init();

  // 3. Initialize Neo4j Knowledge Graph (graceful if unavailable)
  await graphService.init();

  // 4. Initialize Whisper voice-to-text (graceful if unavailable)
  await whisperService.init();

  // 5. Wire auto-sync: vault changes → ChromaDB + Neo4j
  vaultService.onChange(async (note) => {
    if (embeddingService.isAvailable()) {
      await embeddingService.upsertNote(note);
    }
    if (graphService.isAvailable()) {
      await graphService.upsertNote(note);
    }
  });

  vaultService.onDelete(async (noteId) => {
    if (embeddingService.isAvailable()) {
      await embeddingService.deleteNote(noteId);
    }
    if (graphService.isAvailable()) {
      await graphService.deleteNote(noteId);
    }
  });

  const syncTargets = [
    embeddingService.isAvailable() ? 'ChromaDB' : null,
    graphService.isAvailable() ? 'Neo4j' : null,
  ].filter(Boolean);

  if (syncTargets.length > 0) {
    logger.info(`Auto-sync: Vault → ${syncTargets.join(' + ')} enabled`);
  }

  // 6. Start Express server
  const server = app.listen(config.port, () => {
    logger.info(`Second Brain API running on port ${config.port} [${config.nodeEnv}]`);
    logger.info(`Vault path: ${config.vaultPath}`);
  });

  // 7. Start Telegram bot (graceful if unavailable)
  await telegramService.init();

  // 8. Start autonomous agents scheduler
  agentScheduler.init();

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Rejection', reason);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    agentScheduler.stop();
    telegramService.stop();
    graphService.close().finally(() => {
      server.close(() => process.exit(0));
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
