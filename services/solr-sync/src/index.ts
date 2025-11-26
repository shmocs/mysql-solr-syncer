import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import axios from 'axios';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { MaxwellEvent, SolrUpdaterResponse, isSupportedTable } from './types.js';

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

const config = loadConfig();

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let shuttingDown = false;

async function processMaxwellEvent(event: MaxwellEvent): Promise<void> {
  const { database, table, type, data } = event;

  // Filter only our database and supported tables
  if (database !== 'solr_sync') {
    logger.debug('Skipping event from different database', { database, table });
    return;
  }

  if (!isSupportedTable(table)) {
    logger.debug('Skipping unsupported table', { table });
    return;
  }

  // Only process insert/update events (delete would require different handling)
  if (type !== 'insert' && type !== 'update') {
    logger.debug('Skipping non-insert/update event', { type, table });
    return;
  }

  // Extract ID from data
  const id = data?.id as number | undefined;
  if (!id || typeof id !== 'number') {
    logger.warn('Event missing ID field', { table, type, data });
    return;
  }

  logger.info('Processing Maxwell event', { table, id, type });

  // Call solr-updater service
  const url = `${config.solrUpdater.baseUrl}/${table}/${id}`;
  
  try {
    const response = await axios.post<SolrUpdaterResponse>(url, {}, {
      timeout: config.solrUpdater.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info('Successfully synced to Solr', {
      table,
      id,
      status: response.status,
      data: response.data,
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const responseData: unknown = error.response?.data;
      logger.error('Failed to call solr-updater', {
        table,
        id,
        status: error.response?.status,
        data: responseData,
        message: error.message,
      });
    } else {
      logger.error('Unexpected error calling solr-updater', { table, id, error: formatError(error) });
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
    const event = JSON.parse(content) as MaxwellEvent;
    
    await processMaxwellEvent(event);
    
    // Successfully processed, acknowledge the message
    channel?.ack(msg);
    
  } catch (error: unknown) {
    const retryCount = getRetryCount(msg);
    
    logger.error('Error processing message', {
      error: formatError(error),
      retryCount,
      limit: config.retry.limit,
    });

    if (retryCount >= config.retry.limit) {
      // Max retries exceeded, send to dead letter queue
      logger.warn('Max retries exceeded, sending to DLQ', { retryCount });
      channel?.nack(msg, false, false);
    } else {
      // Republish to retry exchange
      logger.info('Republishing to retry exchange', { retryCount });
      
      if (channel) {
        channel.publish(
          config.retry.exchange,
          '',
          msg.content,
          {
            persistent: true,
            headers: msg.properties.headers,
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
      handleMessage(msg).catch((err: unknown) => {
        logger.error('Unhandled message handler error', { error: formatError(err) });
        channel?.nack(msg, false, false);
      });
    },
    { noAck: false }
  );

  logger.info('Waiting for messages...', { queue: config.rabbit.queue });
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

  connection.on('error', (err: unknown) => {
    logger.error('RabbitMQ connection error', { error: formatError(err) });
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
    logger.error('Failed to close AMQP channel', { error: formatError(err) });
  }

  try {
    if (connection) {
      await connection.close();
    }
  } catch (err) {
    logger.error('Failed to close AMQP connection', { error: formatError(err) });
  }

  process.exit(0);
}

async function start(): Promise<void> {
  logger.info('Starting solr-sync consumer', { config });
  
  await connect();
  await consume();
}

// Handle shutdown signals
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    logger.info('Received shutdown signal', { signal });
    shutdown().catch((err: unknown) => {
      logger.error('Shutdown error', { error: formatError(err) });
      process.exit(1);
    });
  });
});

// Start the application
start().catch((err: unknown) => {
  logger.error('Fatal error while starting consumer', { error: formatError(err) });
  process.exit(1);
});

