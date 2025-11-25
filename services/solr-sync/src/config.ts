export interface Config {
  rabbit: {
    host: string;
    port: number;
    user: string;
    password: string;
    vhost: string;
    queue: string;
    prefetch: number;
  };
  solrUpdater: {
    baseUrl: string;
    timeout: number;
  };
  retry: {
    limit: number;
    exchange: string;
  };
}

export function loadConfig(): Config {
  return {
    rabbit: {
      host: getEnv('RABBITMQ_HOST', 'localhost'),
      port: getEnvInt('RABBITMQ_PORT', 5672),
      user: getEnv('RABBITMQ_USER', 'guest'),
      password: getEnv('RABBITMQ_PASSWORD', 'guest'),
      vhost: getEnv('RABBITMQ_VHOST', '/'),
      queue: getEnv('RABBITMQ_QUEUE', 'solr.sync.v1'),
      prefetch: getEnvInt('RABBITMQ_PREFETCH', 10)
    },
    solrUpdater: {
      baseUrl: getEnv('SOLR_UPDATER_BASE_URL', 'http://localhost:8080'),
      timeout: getEnvInt('SOLR_UPDATER_TIMEOUT', 30000)
    },
    retry: {
      limit: getEnvInt('RETRY_LIMIT', 5),
      exchange: getEnv('RABBITMQ_RETRY_EXCHANGE', 'solr.sync.retry')
    }
  };
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

