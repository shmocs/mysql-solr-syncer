module.exports = {
  apps: [
    {
      name: 'solr-sync',
      script: './dist/index.js',
      instances: 4,  // Run 4 parallel instances (adjust based on CPU cores)
      exec_mode: 'cluster',  // Use cluster mode for parallel processing
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      merge_logs: true,
      time: true
    }
  ]
};

