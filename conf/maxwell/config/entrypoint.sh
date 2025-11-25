#!/bin/sh
set -eu

echo "Configuring Maxwell CDC processor..."

# Validate required environment variables
: "${MYSQL_HOST:?MYSQL_HOST is not set}"
: "${MYSQL_PORT:?MYSQL_PORT is not set}"
: "${MYSQL_MAXWELL_USER:?MYSQL_MAXWELL_USER is not set}"
: "${MYSQL_MAXWELL_PASSWORD:?MYSQL_MAXWELL_PASSWORD is not set}"
: "${RABBITMQ_HOST:?RABBITMQ_HOST is not set}"
: "${RABBITMQ_USER:?RABBITMQ_USER is not set}"
: "${RABBITMQ_PASSWORD:?RABBITMQ_PASSWORD is not set}"

# Generate Maxwell configuration
cat <<CONFIG >/tmp/maxwell.properties
# Producer
producer=rabbitmq

# MySQL connection
host=${MYSQL_HOST}
port=${MYSQL_PORT}
user=${MYSQL_MAXWELL_USER}
password=${MYSQL_MAXWELL_PASSWORD}
database=solr_sync

# Maxwell metadata
replica_server_id=2
client_id=maxwell_cdc
schema_database=maxwell
config_database=maxwell

# Bootstrap
bootstrapper=sync

# Output configuration
output_primary_keys=true
output_ddl=false

# RabbitMQ configuration
rabbitmq_exchange=${RABBITMQ_EXCHANGE:-db.changes}
rabbitmq_exchange_type=topic
rabbitmq_routing_key_template=db.%db%.%table%.%type%
rabbitmq_host=${RABBITMQ_HOST}
rabbitmq_port=${RABBITMQ_PORT:-5672}
rabbitmq_user=${RABBITMQ_USER}
rabbitmq_pass=${RABBITMQ_PASSWORD}
rabbitmq_virtual_host=${RABBITMQ_VHOST:-/}
rabbitmq_message_persistent=true
rabbitmq_declare_exchange=false

# Logging
log_level=INFO

# Filter configuration (capture only solr_sync database)
filter=include:solr_sync.*
CONFIG

echo "Maxwell configuration created"
cat /tmp/maxwell.properties

echo "Starting Maxwell..."
exec /app/bin/maxwell --config /tmp/maxwell.properties --log_level=debug


