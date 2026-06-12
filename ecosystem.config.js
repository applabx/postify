// PM2 process config for production deployment
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    // ─── Main Next.js app ──────────────────────────────────────────────────
    {
      name: 'postify',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/postify',
      instances: 1,          // Increase to 2+ on bigger droplets
      exec_mode: 'fork',     // Use 'cluster' if instances > 1
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Auto-restart on crash with exponential backoff
      restart_delay: 5000,
      max_restarts: 10,
      // Log files
      out_file: '/var/log/postify/out.log',
      error_file: '/var/log/postify/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
