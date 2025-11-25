import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import axios from 'axios';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { MaxwellEvent, isSupportedTable } from './types.js';

const config = loadConfig();

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let shuttingDown = false;

async function processMaxwellEvent(event: MaxwellEvent): Promise<void> {
  const { database, table, type, data } = event;

  // Filter only our database and supported tables
  if (database !== 'solr_sync') {
    logger.debug({ database, table }, 'Skipping event from different database');
    return;
  }

  if (!isSupportedTable(table)) {
    logger.debug({ table }, 'Skipping unsupported table');
    return;
  }

  // Only process insert/update events (delete would require different handling)
  if (type !== 'insert' && type !== 'update') {
    logger.debug({ type, table }, 'Skipping non-insert/update event');
    return;
  }

  // Extract ID from data
  const id = data?.id;
  if (!id) {
    logger.warn({ table, type, data }, 'Event missing ID field');
    return;
  }

  logger.info({ table, id, type }, 'Processing Maxwell event');

  // Call solr-updater service
  const url = `${config.solrUpdater.baseUrl}/${table}/${id}`;
  
  try {
    const response = await axios.post(url, {}, {
      timeout: config.solrUpdater.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info(
      { table, id, status: response.status, data: response.data },
      'Successfully synced to Solr'
    );
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error(
        {
          table,
          id,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        },
        'Failed to call solr-updater'
      );
    } else {
      logger.error({ table, id, error }, 'Unexpected error calling solr-updater');
    }
    throw error;
  }
}

function getRetryCount(msg: ConsumeMessage): number {
  const xDeath = msg.properties.headers?.['x-death'];
  if (Array.isArray(xDeath) && xDeath.length > 0) {
    const death = xDeath[0] as unknown as Record<string, unknown>;
    return (death.count as number) || 0;
  }
  return 0;
}

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  const content = msg.content.toString();
  
  try {
    const event: MaxwellEvent = JSON.parse(content);
    
    await processMaxwellEvent(event);
    
    // Successfully processed, acknowledge the message
    channel?.ack(msg);
    
  } catch (error) {
    const retryCount = getRetryCount(msg);
    
    logger.error(
      { error, retryCount, limit: config.retry.limit },
      'Error processing message'
    );

    if (retryCount >= config.retry.limit) {
      // Max retries exceeded, send to dead letter queue
      logger.warn({ retryCount }, 'Max retries exceeded, sending to DLQ');
      channel?.nack(msg, false, false);
    } else {
      // Republish to retry exchange
      logger.info({ retryCount }, 'Republishing to retry exchange');
      
      if (channel) {
        await channel.publish(
          config.retry.exchange,
          '',
          msg.content,
          {
            persistent: true,
            headers: msg.properties.headers
          }
        );
        channel.ack(msg);
      }
    }
  }
}

async function consume(): Promise<void> {
  if (!channel) {
    throw new Error('Channel not initialized');
  }

  await channel.consume(
    config.rabbit.queue,
    (msg) => {
      if (!msg) {
        return;
      }
      handleMessage(msg).catch((err) => {
        logger.error({ err }, 'Unhandled message handler error');
        channel?.nack(msg, false, false);
      });
    },
    { noAck: false }
  );

  logger.info({ queue: config.rabbit.queue }, 'Waiting for messages...');
}

async function connect(): Promise<void> {
  const conn = await amqp.connect({
    protocol: 'amqp',
    hostname: config.rabbit.host,
    port: config.rabbit.port,
    username: config.rabbit.user,
    password: config.rabbit.password,
    vhost: config.rabbit.vhost
  });

  connection = conn;

  connection.on('error', (err) => {
    logger.error({ err }, 'RabbitMQ connection error');
  });

  connection.on('close', () => {
    if (shuttingDown) {
      return;
    }
    logger.error('RabbitMQ connection closed unexpectedly, exiting');
    process.exit(1);
  });

  channel = await connection.createChannel();
  // Queue is pre-configured in RabbitMQ definitions.json with DLX settings
  // We only need to check it exists, not assert it with different args
  await channel.checkQueue(config.rabbit.queue);
  await channel.prefetch(config.rabbit.prefetch);
  
  logger.info('Connected to RabbitMQ');
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('Shutting down...');

  try {
    if (channel) {
      await channel.close();
    }
  } catch (err) {
    logger.error({ err }, 'Failed to close AMQP channel');
  }

  try {
    if (connection) {
      await connection.close();
    }
  } catch (err) {
    logger.error({ err }, 'Failed to close AMQP connection');
  }

  process.exit(0);
}

async function start(): Promise<void> {
  logger.info({ config }, 'Starting solr-sync consumer');
  
  await connect();
  await consume();
}

// Handle shutdown signals
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    logger.info({ signal }, 'Received shutdown signal');
    shutdown().catch((err) => {
      logger.error({ err }, 'Shutdown error');
      process.exit(1);
    });
  });
});

// Start the application
start().catch((err) => {
  logger.error({ err }, 'Fatal error while starting consumer');
  process.exit(1);
});

