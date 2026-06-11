import { loadConfig, logger } from '@flash-socket-server/core';
import { indexAssets } from '@flash-socket-server/asset-indexer';
import { startHttpServer, stopHttpServer } from '@flash-socket-server/http-gateway';
import { startSocketServer, stopSocketServer } from '@flash-socket-server/sfs-emulator';
import { startPolicyServer, stopPolicyServer } from '@flash-socket-server/flash-policy';
import { 
  WebContainerAdapter, 
  ProjectorAdapter, 
  RuffleAdapter,
  RuffleLocalAdapter,
  RuntimeAdapter 
} from '@flash-socket-server/runtime-adapters';

async function main() {
  console.log('\x1b[35m==============================================================');
  console.log('       FLASH SOCKET PRESERVATION SERVER - MILESTONE 1         ');
  console.log('==============================================================\x1b[0m');

  // 1. Load and validate server configuration
  const config = loadConfig();
  
  // 2. Perform user-supplied assets status check
  indexAssets(config);

  logger.info('system', 'Starting clean preservation runtime servers...');

  try {
    // 3. Start Fastify HTTP Asset Gateway
    await startHttpServer(config);

    // 4. Start SFS-Compatible TCP Socket Server
    startSocketServer(config);

    // 5. Start Port 843 Flash Socket Policy Server
    startPolicyServer(config);

    // 6. Select and initialize the configured runtime adapter
    let adapter: RuntimeAdapter;
    
    switch (config.runtimeMode) {
      case 'projector':
        adapter = new ProjectorAdapter();
        break;
      case 'ruffle-local':
        adapter = new RuffleLocalAdapter();
        break;
      case 'ruffle':
        adapter = new RuffleAdapter();
        break;
      case 'web-container':
      default:
        adapter = new WebContainerAdapter();
        break;
    }

    logger.info('system', `Active adapter: "${adapter.name}" - ${adapter.description}`);
    await adapter.initialize(config);

    logger.success('system', 'Preservation server successfully bootstrapped and ready!');
    console.log('\x1b[36mPress Ctrl+C to terminate all active listeners safely.\x1b[0m\n');

    // 7. Setup clean graceful termination handlers
    const shutdown = async () => {
      console.log('\n');
      logger.warn('system', 'Termination signal detected. Initiating graceful shutdown...');
      
      await adapter.shutdown();
      stopSocketServer();
      stopPolicyServer();
      await stopHttpServer();
      
      logger.success('system', 'All servers terminated cleanly. Good bye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err: any) {
    logger.error('system', `Fatal error during preservation bootstrap: ${err.message}`, err);
    process.exit(1);
  }
}

main();
