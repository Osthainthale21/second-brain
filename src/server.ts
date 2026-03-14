import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`Second Brain API running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`Vault path: ${config.vaultPath}`);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection', reason);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});
