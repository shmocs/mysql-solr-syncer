# Scaling the solr-sync Consumer

Current baseline: **~12 messages/second** with 1 instance

## ✅ Applied Optimizations

### 1. **PM2 Cluster Mode** (4x parallelization)
- Changed from `instances: 1` to `instances: 4`
- Changed `exec_mode` from `fork` to `cluster`
- **Expected throughput: ~48 msg/s** (4x improvement)
- File: `services/solr-sync/pm2.config.cjs`

### 2. **Increased RabbitMQ Prefetch** (5x buffer)
- Changed from `prefetch: 10` to `prefetch: 50`
- Allows each instance to fetch more messages at once
- Reduces network round trips
- Environment variable: `RABBITMQ_PREFETCH=50`

### 3. **Reduced HTTP Timeout** (faster failure recovery)
- Changed from `30000ms` to `10000ms`
- Faster error detection and retry
- Faster error detection and retry
- Environment variable: `SOLR_UPDATER_TIMEOUT=10000`

## 📊 Expected Performance

| Configuration | Instances | Prefetch | Expected Throughput |
|--------------|-----------|----------|-------------------|
| Original | 1 | 10 | ~12 msg/s |
| Current (PM2) | 4 | 50 | ~48-60 msg/s |
| + Horizontal Scale | 4 x 3 containers | 50 | ~144-180 msg/s |

## 🚀 Further Scaling Options

### Option A: Horizontal Scaling (Multiple Containers)

Scale to multiple containers using docker-compose:

```bash
# Scale to 3 containers (12 total PM2 instances)
docker-compose up -d --scale solr-sync=3

# Scale to 5 containers (20 total PM2 instances)
docker-compose up -d --scale solr-sync=5

# Check running instances
docker-compose ps solr-sync
```

**Note:** The `container_name` has been removed from docker-compose.yml to allow scaling.

### Option B: Adjust PM2 Instances

Edit `services/solr-sync/pm2.config.cjs`:

```javascript
instances: 8,  // Increase for more parallelization
```

**Recommended:** Match CPU cores (e.g., 4 cores = 4-8 instances)

### Option C: Optimize solr-updater

If solr-updater becomes the bottleneck:

1. **Add connection pooling** to MySQL
2. **Batch Solr updates** (update multiple docs at once)
3. **Scale solr-updater horizontally:**
   ```bash
   docker-compose up -d --scale solr-updater=3
   ```

## 🎛️ Configuration via Environment Variables

Create a `.env` file:

```bash
# Consumer tuning
RABBITMQ_PREFETCH=50           # Messages per consumer
SOLR_UPDATER_TIMEOUT=10000     # HTTP timeout (ms)
RETRY_LIMIT=5                  # Max retries before DLQ

# Performance monitoring
NODE_ENV=production
TZ=UTC
```

## 📈 Monitoring

Check consumer performance:

```bash
# View PM2 processes
docker exec solr-sync-solr-sync-1 pm2 list

# Monitor RabbitMQ queues
docker exec rabbitmq rabbitmqctl list_queues name messages messages_ready consumers

# Watch logs
docker-compose logs -f solr-sync

# Check throughput
docker-compose logs solr-sync | grep "Processing Maxwell event" | wc -l
```

## 🔧 Tuning Guidelines

### When to Increase Prefetch
- ✅ Fast processing (<100ms per message)
- ✅ Low memory usage
- ✅ Stable network connection
- ❌ Don't exceed: `prefetch × instances × containers < 1000`

### When to Add PM2 Instances
- ✅ CPU usage < 70%
- ✅ Messages waiting in queue
- ✅ I/O-bound operations (HTTP calls)
- ❌ Don't exceed CPU cores + 2

### When to Horizontal Scale (More Containers)
- ✅ All PM2 instances at high CPU
- ✅ Large message backlog
- ✅ Need fault tolerance
- ✅ Need to process >100 msg/s

## 🎯 Recommended Configuration

For **moderate load** (50-100 msg/s):
- 1 container
- 4-6 PM2 instances
- Prefetch: 50

For **high load** (100-500 msg/s):
- 3-5 containers
- 4 PM2 instances each
- Prefetch: 50-100

For **very high load** (>500 msg/s):
- 10+ containers
- 4 PM2 instances each
- Prefetch: 100
- Consider Kubernetes for orchestration

