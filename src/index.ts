import { buildApp } from './app';
import { getConfig, getSanitizedConfig } from './config';
import { PostgresAuditRepository } from './audit';

async function main(): Promise<void> {
  const config = getConfig();

  // Initialize Postgres Audit Repository
  const auditRepo = new PostgresAuditRepository(config.DATABASE_URL);

  // Attempt database schema initialization (non-blocking for startup resilience)
  try {
    await auditRepo.initialize();
  } catch (err) {
    // If Postgres is not yet reachable during container startup, log warning
    console.warn('[AgentGuard DB Warning] Could not connect to PostgreSQL on startup:', (err as Error).message);
    console.warn('[AgentGuard DB Warning] Gateway will start; database connectivity checked via /health/ready');
  }

  const app = buildApp({ config, auditRepo });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received termination signal, shutting down AgentGuard...');
    try {
      await app.close();
      await auditRepo.close();
      app.log.info('AgentGuard server stopped cleanly.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    app.log.info(
      {
        address,
        port: config.PORT,
        env: config.NODE_ENV,
        config: getSanitizedConfig(config),
      },
      '🛡️  AgentGuard Security Gateway initialized successfully'
    );
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start AgentGuard server');
    process.exit(1);
  }
}

// Only invoke main when directly executed
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}
