# Solr Sync Stack

A complete Change Data Capture (CDC) pipeline that syncs MySQL database changes to Apache Solr in real-time using Maxwell, RabbitMQ, TypeScript consumer, and Go update service.

## Architecture

```
MySQL (binlog) → Maxwell → RabbitMQ → solr-sync (TS) → solr-updater (Go) → Solr
```

### Components

1. **MySQL 8.0** - Database with binlog enabled, seeded with 10,000 books and 10,000 electronics records
2. **Apache Solr 9.6** - Search engine with `books` and `electronics` collections using `sample_techproducts_configs`
3. **RabbitMQ 3.13** - Message broker with retry logic and dead-letter queues
4. **Maxwell 1.41.2** - CDC processor that captures MySQL binlog events and publishes to RabbitMQ
5. **solr-sync** - TypeScript/PM2 consumer (4 instances in cluster mode) that processes RabbitMQ messages
6. **solr-updater** - Go HTTP service that reads from MySQL and syncs to Solr

## Features

- **Automatic seeding**: 20,000 records (10k books + 10k electronics) on first startup
- **Real-time sync**: Changes to MySQL are captured and synced to Solr within seconds
- **High throughput**: PM2 cluster mode with 4 parallel instances (~48+ msg/s)
- **Horizontal scaling**: Support for multiple containers (remove container_name)
- **Retry mechanism**: Failed messages retry every 30 seconds up to 5 times
- **Dead letter queue**: Messages that fail after max retries go to DLQ for manual inspection
- **Health checks**: All services have proper health endpoints
- **Clean separation**: Config in `./conf`, data in `./data` (no Docker volumes)

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available
- Ports available: 3306, 5672, 8080, 8081, 8983, 15672

## Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp env.example .env

# Edit .env if you want to change passwords/ports
nano .env
```

### 2. Make Scripts Executable

```bash
chmod +x conf/mysql/initdb/02-users-and-grants.sh
chmod +x conf/solr/scripts/init-solr.sh
chmod +x conf/maxwell/config/entrypoint.sh
chmod +x scripts/fix-permissions.sh
```

### 3. Start the Stack

```bash
# Build and start all services
docker compose up --build

# Or run in background
docker compose up --build -d
```

### 4. Verify Services

**Check service health:**
```bash
docker compose ps
```

All services should show `healthy` or `running` status.

**Check logs:**
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f solr-sync
docker compose logs -f solr-updater
docker compose logs -f maxwell
```

### 5. Test the Pipeline

**Access Solr Admin UI:**
- URL: http://localhost:8983/solr
- Collections: `books`, `electronics`

**Access RabbitMQ Management:**
- URL: http://localhost:15672
- Username: `rabbitmq_user` (from .env)
- Password: `rabbitmq_pass` (from .env)

**Trigger a change:**
```bash
# Connect to MySQL
docker exec -it mysql mysql -uapp_user -papp_pass solr_sync

# Update a book record
UPDATE books SET price = 29.99, in_stock = 1 WHERE id = 73;

# Exit MySQL
exit
```

**Observe the sync:**
1. Maxwell captures the binlog event
2. RabbitMQ receives the message (check queue `solr.sync.v1`)
3. solr-sync consumer processes it
4. solr-updater updates the description and syncs to Solr
5. Check Solr: http://localhost:8983/solr/books/select?q=id:book-73

## Service Endpoints

| Service | Port | Endpoint | Purpose |
|---------|------|----------|---------|
| MySQL | 3306 | - | Database |
| Solr | 8983 | http://localhost:8983/solr | Admin UI |
| RabbitMQ | 5672 | - | AMQP |
| RabbitMQ Mgmt | 15672 | http://localhost:15672 | Management UI |
| solr-updater | 8081 | http://localhost:8081/health | Health check |
| solr-updater | 8081 | POST http://localhost:8081/books/{id} | Sync book |
| solr-updater | 8081 | POST http://localhost:8081/electronics/{id} | Sync electronic |

## Project Structure

The project uses a clean separation between configuration and data:

### Configuration (`./conf/`)
```
conf/
├── mysql/
│   ├── conf.d/my.cnf              # MySQL configuration (binlog settings)
│   └── initdb/                    # Init scripts
│       ├── 01-schema-and-seed.sql # Schema and data seeding
│       └── 02-users-and-grants.sh # User creation
├── solr/
│   └── scripts/
│       └── init-solr.sh           # Solr core initialization
├── rabbitmq/
│   └── definitions.json           # Queue/exchange definitions
└── maxwell/
    └── config/
        └── entrypoint.sh          # Maxwell configuration script
```

### Data (`./data/`)
```
data/
├── mysql/        # MySQL data directory (bind mount: /var/lib/mysql)
├── solr/         # Solr cores data (bind mount: /var/solr)
├── rabbitmq/     # RabbitMQ data (bind mount: /var/lib/rabbitmq)
└── maxwell/      # Maxwell position tracking (bind mount: /var/lib/maxwell)
```

### Helper Scripts (`./scripts/`)
```
scripts/
└── fix-permissions.sh  # Fix data directory permissions for containers
```

## RabbitMQ Queue Configuration

### Exchanges
- `db.changes` (topic) - Receives all Maxwell CDC events
- `solr.sync.retry` (fanout) - Retry exchange for failed messages
- `solr.sync.dlx` (fanout) - Dead letter exchange

### Queues
- `solr.sync.v1` - Main processing queue (TTL: 15min, DLX: solr.sync.dlx)
- `solr.sync.retry.30s` - Retry queue (TTL: 30s, republishes to main queue)
- `solr.sync.dead.v1` - Dead letter queue for permanently failed messages

### Bindings
- `db.changes` → `solr.sync.v1` (routing: `db.solr_sync.books.*`, `db.solr_sync.electronics.*`)
- `solr.sync.retry` → `solr.sync.retry.30s`
- `solr.sync.dlx` → `solr.sync.dead.v1`

## How It Works

### Normal Flow

1. **Database Change**: User updates a record in MySQL
   ```sql
   UPDATE books SET price = 19.99 WHERE id = 100;
   ```

2. **Maxwell Capture**: Maxwell reads the binlog event and publishes to RabbitMQ topic exchange `db.changes` with routing key `db.solr_sync.books.update`

3. **Queue Routing**: Message arrives in `solr.sync.v1` queue (matched by routing key)

4. **Consumer Processing**: `solr-sync` (TypeScript) - 4 parallel PM2 instances consume messages:
   - Validates it's from `solr_sync` database
   - Checks table is supported (`books` or `electronics`)
   - Extracts record ID
   - Calls `solr-updater` service

5. **Read & Sync**: `solr-updater` (Go):
   - Reads the current record from MySQL (read-only)
   - Formats document for Solr
   - Posts to Solr collection
   - Returns success response

6. **Acknowledgment**: Consumer ACKs the message to RabbitMQ

### Error & Retry Flow

1. **Failure Detected**: `solr-updater` is unreachable or returns error
2. **Retry Check**: Consumer checks x-death header for retry count
3. **Under Limit**: If retries < 5, republish to `solr.sync.retry` exchange
4. **Retry Queue**: Message sits in `solr.sync.retry.30s` for 30 seconds
5. **Republish**: After TTL expires, message returns to `solr.sync.v1`
6. **Max Retries**: If retries >= 5, NACK with requeue=false → DLX → `solr.sync.dead.v1`

## Testing the Stack

### Test 1: Insert New Record

```bash
docker exec -it mysql mysql -uapp_user -papp_pass solr_sync -e "
INSERT INTO books (id, title, author, genre, price, in_stock, isbn, description) 
VALUES (99999, 'Test Book', 'Test Author', 'fiction', 25.99, 1, 'ISBN9999999999', 'Test description');
"

# Check Solr
curl "http://localhost:8983/solr/books/select?q=id:book-99999"
```

### Test 2: Update Existing Record

```bash
docker exec -it mysql mysql -uapp_user -papp_pass solr_sync -e "
UPDATE electronics SET price = 199.99, in_stock = 0 WHERE id = 500;
"

# Check logs
docker compose logs -f solr-sync solr-updater

# Check Solr
curl "http://localhost:8983/solr/electronics/select?q=id:electronics-500"
```

### Test 3: Bulk Update

```bash
docker exec -it mysql mysql -uapp_user -papp_pass solr_sync -e "
UPDATE books SET price = price * 1.1 WHERE genre = 'sci-fi' LIMIT 10;
"

# Watch RabbitMQ queue depth
# http://localhost:15672 -> Queues -> solr.sync.v1
```

### Test 4: Verify Retry Mechanism

```bash
# Stop solr-updater
docker compose stop solr-updater

# Trigger update
docker exec -it mysql mysql -uapp_user -papp_pass solr_sync -e "
UPDATE books SET price = 99.99 WHERE id = 1;
"

# Check retry queue in RabbitMQ UI
# Message should appear in solr.sync.retry.30s

# Restart solr-updater
docker compose start solr-updater

# Message should be processed after retry
```

## Monitoring

### RabbitMQ Metrics
- **Queue depth**: Monitor `solr.sync.v1` for backlog
- **Consumer count**: Should show 1 active consumer
- **Message rate**: In/Out rates on queue overview
- **Dead letters**: Check `solr.sync.dead.v1` for persistent failures

### Service Logs
```bash
# Real-time logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific service
docker compose logs -f maxwell
docker compose logs -f solr-sync
docker compose logs -f solr-updater
```

### Database Queries
```sql
-- Check record counts
SELECT COUNT(*) FROM books;
SELECT COUNT(*) FROM electronics;

-- Recent updates
SELECT id, title, description, updated_at 
FROM books 
ORDER BY updated_at DESC 
LIMIT 10;

-- Find records updated by solr-updater
SELECT id, title, description 
FROM books 
WHERE description LIKE '%solr-updater%' 
LIMIT 10;
```

### Solr Queries
```bash
# Count documents
curl "http://localhost:8983/solr/books/select?q=*:*&rows=0"

# Recent updates
curl "http://localhost:8983/solr/books/select?q=*:*&sort=updated_at_dt%20desc&rows=10"

# Search updated descriptions
curl "http://localhost:8983/solr/books/select?q=description:solr-updater&rows=10"
```

## Troubleshooting

### MySQL Connection Issues
```bash
# Check MySQL is ready
docker compose logs mysql | grep "ready for connections"

# Test connection
docker exec -it mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD} -e "SELECT 1"
```

### Maxwell Not Capturing Events
```bash
# Check Maxwell logs
docker compose logs maxwell

# Verify Maxwell user permissions
docker exec -it mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD} -e "
SHOW GRANTS FOR 'maxwell'@'%';
"

# Check binlog is enabled
docker exec -it mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD} -e "
SHOW VARIABLES LIKE 'log_bin';
SHOW VARIABLES LIKE 'binlog_format';
"
```

### RabbitMQ Issues
```bash
# Check RabbitMQ status
docker exec rabbitmq rabbitmq-diagnostics status

# List queues
docker exec rabbitmq rabbitmqctl list_queues name messages consumers

# Check bindings
docker exec rabbitmq rabbitmqctl list_bindings
```

### Consumer Not Processing
```bash
# Check consumer logs
docker compose logs solr-sync

# Check if consumer is connected to RabbitMQ
docker exec rabbitmq rabbitmqctl list_consumers

# Restart consumer
docker compose restart solr-sync
```

### Solr Update Failures
```bash
# Check solr-updater logs
docker compose logs solr-updater

# Test solr-updater directly
curl -X POST http://localhost:8081/books/1

# Check Solr logs
docker compose logs solr
```

## Stopping and Cleanup

### Stop Services
```bash
# Stop all services (keeps data)
docker-compose down

# Stop and remove all data
docker-compose down -v
rm -rf data/mysql data/solr data/rabbitmq data/maxwell
```

### Restart Fresh
```bash
# Complete cleanup and restart
docker-compose down -v
rm -rf data/mysql data/solr data/rabbitmq data/maxwell

# Fix permissions and restart
./scripts/fix-permissions.sh
docker-compose up --build
```

## Configuration

### Environment Variables

See `env.example` for all available configuration options. Key variables:

**Database:**
- `MYSQL_ROOT_PASSWORD` - MySQL root password
- `MYSQL_APP_USER` / `MYSQL_APP_PASSWORD` - Application database user
- `MYSQL_MAXWELL_USER` / `MYSQL_MAXWELL_PASSWORD` - Maxwell CDC user
- `MYSQL_DATABASE` - Database name (default: solr_sync)

**Message Broker:**
- `RABBITMQ_USER` / `RABBITMQ_PASSWORD` - RabbitMQ credentials
- `RABBITMQ_VHOST` - Virtual host (default: /)
- `RABBITMQ_QUEUE` - Queue name (default: solr.sync.v1)
- `RABBITMQ_PREFETCH` - Messages per consumer (default: 50)

**Consumer:**
- `RETRY_LIMIT` - Maximum retry attempts (default: 5)
- `SOLR_UPDATER_TIMEOUT` - HTTP timeout in ms (default: 10000)
- `SOLR_UPDATER_BASE_URL` - solr-updater URL

### MySQL Configuration

Edit `conf/mysql/conf.d/my.cnf` for MySQL tuning. Current settings:
- Binary logging enabled (ROW format)
- GTID mode ON
- 512MB InnoDB buffer pool
- 250 max connections

### RabbitMQ Configuration

Edit `conf/rabbitmq/definitions.json` for queue/exchange changes. Current setup:
- Topic exchange for flexible routing
- 30-second retry delay
- Persistent messages
- Dead letter queues

### Consumer Scaling

Edit `services/solr-sync/pm2.config.cjs` for PM2 tuning:
```javascript
instances: 4,      // Number of parallel instances
exec_mode: 'cluster'  // Cluster mode for load balancing
```

For horizontal scaling (multiple containers):
```bash
docker-compose up -d --scale solr-sync=3  # 3 containers × 4 instances = 12 workers
```

See [SCALING.md](SCALING.md) for detailed performance tuning guide.

## Development

### Rebuild Services

```bash
# Rebuild specific service
docker compose up --build solr-sync

# Rebuild all
docker compose up --build
```

### Add New Tables

1. Add table to `conf/mysql/initdb/01-schema-and-seed.sql`
2. Update `services/solr-sync/src/types.ts` SUPPORTED_TABLES array
3. Add endpoint in `services/solr-updater/internal/api/handler.go`
4. Add Solr core in `conf/solr/scripts/init-solr.sh`
5. Add RabbitMQ binding in `conf/rabbitmq/definitions.json`
6. Rebuild and restart

## Performance & Scaling

### Current Performance

- **Baseline**: ~12 msg/s (single instance)
- **Current**: ~48-60 msg/s (4 PM2 instances in cluster mode)
- **Prefetch**: 50 messages per instance
- **Timeout**: 10s for fast failure recovery

### Scale Vertically (More PM2 Instances)

Edit `services/solr-sync/pm2.config.cjs`:
```javascript
instances: 8,  // Increase for more parallelization (match CPU cores)
```

### Scale Horizontally (More Containers)

```bash
# Scale to 3 containers (12 total PM2 instances)
docker-compose up -d --scale solr-sync=3

# Expected throughput: ~144-180 msg/s
```

### Optimize RabbitMQ

Set via environment variables:
```bash
RABBITMQ_PREFETCH=100      # Increase message buffer
SOLR_UPDATER_TIMEOUT=5000  # Reduce timeout for faster failures
```

### Fix Data Permissions

If you encounter permission errors:
```bash
./scripts/fix-permissions.sh
```

**See [SCALING.md](SCALING.md) for comprehensive performance tuning guide.**

## Additional Documentation

- **[SCALING.md](SCALING.md)** - Comprehensive scaling and performance tuning guide
- **[env.example](.env.example)** - All available environment variables

## Key Features

### Real-Time CDC Pipeline
MySQL changes are captured via binlog and synced to Solr within seconds, with automatic retry and dead-letter queue handling.

### High Performance
- PM2 cluster mode with 4 parallel instances
- Configurable prefetch and timeout
- Support for horizontal scaling to 100+ containers
- Throughput: 48-180+ msg/s depending on configuration

### Production Ready
- Health checks on all services
- Persistent data with bind mounts
- Comprehensive logging
- Automatic retry with exponential backoff
- Dead letter queue for failed messages

### Developer Friendly
- Simple Docker Compose setup
- No manual schema creation
- Automatic data seeding
- Hot reload in development
- Clear separation of config and data

## License

MIT

## Support

For issues and questions:
1. Check logs: `docker-compose logs -f`
2. Verify health: `docker-compose ps`
3. Review RabbitMQ UI: http://localhost:15672
4. Check Solr admin: http://localhost:8983/solr
5. See scaling guide: [SCALING.md](SCALING.md)

