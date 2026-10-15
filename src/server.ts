import { createApp } from './app';
import { env } from './core/config/env';
import { connectDB, disconnectDB } from './core/config/db';
import { logger } from './core/config/logger';

async function startServer() {
  try {
    await connectDB();
    const app = createApp();

    // Bind 0.0.0.0 so Railway's PORT injection + Docker port mapping work.
    const server = app.listen(env.PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        logger.info('Server closed');
        process.exit(0);
      });
      // Force exit after 10s if connections don't close.
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

void startServer();
