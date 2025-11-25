module.exports = {
  apps: [
    {
      name: 'solr-sync',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
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

