#!/bin/sh
# Fix data directory permissions for containers
# This script uses Docker to set the correct ownership without requiring sudo

set -e

echo "Fixing data directory permissions..."

# Solr runs as user 8983:8983
docker run --rm -v "$(pwd)/data/solr:/var/solr" alpine chown -R 8983:8983 /var/solr
echo "✓ Fixed data/solr (8983:8983)"

# RabbitMQ runs as user 999:999
docker run --rm -v "$(pwd)/data/rabbitmq:/var/lib/rabbitmq" alpine chown -R 999:999 /var/lib/rabbitmq
echo "✓ Fixed data/rabbitmq (999:999)"

# Maxwell runs as user 1000:1000
docker run --rm -v "$(pwd)/data/maxwell:/var/lib/maxwell" alpine chown -R 1000:1000 /var/lib/maxwell
echo "✓ Fixed data/maxwell (1000:1000)"

echo ""
echo "All permissions fixed successfully!"

