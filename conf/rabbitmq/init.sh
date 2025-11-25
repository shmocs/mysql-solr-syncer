#!/bin/bash
set -e

# Wait for RabbitMQ to be ready
echo "Waiting for RabbitMQ to be ready..."
until rabbitmqctl status > /dev/null 2>&1; do
  echo "RabbitMQ is not ready yet, waiting..."
  sleep 2
done

echo "RabbitMQ is ready!"

# Ensure user exists (definitions.json doesn't create users)
echo "Checking/creating user..."
if ! rabbitmqctl list_users | grep -q "${RABBITMQ_DEFAULT_USER}"; then
  echo "Creating user ${RABBITMQ_DEFAULT_USER}..."
  rabbitmqctl add_user "${RABBITMQ_DEFAULT_USER}" "${RABBITMQ_DEFAULT_PASS}"
  rabbitmqctl set_user_tags "${RABBITMQ_DEFAULT_USER}" administrator
  rabbitmqctl set_permissions -p "${RABBITMQ_DEFAULT_VHOST}" "${RABBITMQ_DEFAULT_USER}" ".*" ".*" ".*"
  echo "✓ User created and permissions set!"
else
  echo "✓ User already exists!"
fi

# Check if definitions file exists
if [ ! -f /etc/rabbitmq/definitions.json ]; then
  echo "ERROR: definitions.json not found!"
  exit 1
fi

# Load definitions via management API
echo "Loading definitions..."
max_attempts=10
attempt=0

while [ $attempt -lt $max_attempts ]; do
  attempt=$((attempt + 1))
  echo "Attempt $attempt of $max_attempts..."
  
  # Try to load definitions
  if wget --quiet \
       --method=POST \
       --header="Content-Type: application/json" \
       --body-file=/etc/rabbitmq/definitions.json \
       --user="${RABBITMQ_DEFAULT_USER}" \
       --password="${RABBITMQ_DEFAULT_PASS}" \
       --output-document=- \
       http://localhost:15672/api/definitions 2>&1; then
    echo "✓ Definitions loaded successfully!"
    break
  else
    if [ $attempt -eq $max_attempts ]; then
      echo "ERROR: Failed to load definitions after $max_attempts attempts"
      exit 1
    fi
    echo "Failed to load definitions, retrying in 3 seconds..."
    sleep 3
  fi
done

# Verify the db.changes exchange exists
echo "Verifying db.changes exchange..."
if rabbitmqctl list_exchanges | grep -q "db.changes"; then
  echo "✓ db.changes exchange exists!"
else
  echo "ERROR: db.changes exchange not found!"
  exit 1
fi

echo "RabbitMQ initialization complete!"

