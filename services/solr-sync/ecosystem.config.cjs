module.exports = {
  apps: [{
    // Application Configuration
    name: 'solr-sync',
    script: './dist/index.js',
    cwd: '/app',
    
    // Clustering Configuration
    instances: 4,  // Run 4 parallel instances (adjust based on CPU cores)
    exec_mode: 'cluster',  // Use cluster mode for parallel processing
    
    // Environment
    env: {
      NODE_ENV: 'production'
    },
    
    // Logging Configuration (proper files for pm2 logs to work)
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_file: './logs/combined.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Log Rotation
    max_size: '10M',
    max_files: 5,
    compress: false,
    
    // Performance & Restart
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 10,
    autorestart: true,
    watch: false,
    
    // Process Management
    kill_timeout: 5000,
    wait_ready: false,
    listen_timeout: 3000
  }]
};

