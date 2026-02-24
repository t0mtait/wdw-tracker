# WDW Queue Tracker - Docker Deployment

This project is now configured for Docker Compose deployment on your home lab machine.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

## Deployment Instructions

### Quick Start

1. **Navigate to the project directory:**
   ```bash
   cd /home/tom/Repositories/wdw-Tracker
   ```

2. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

3. **Access the application:**
   - Open your browser and go to `http://localhost:3000`
   - Or access it from another machine: `http://<your-machine-ip>:3000`

### Managing the Container

**View logs:**
```bash
docker-compose logs -f
```

**Stop the container:**
```bash
docker-compose down
```

**Rebuild the image (after code changes):**
```bash
docker-compose up -d --build
```

**View container status:**
```bash
docker-compose ps
```

## Data Persistence

The `wait_times_history.json` file is automatically persisted:
- It's stored in the project directory on your host machine
- The Docker volume ensures data survives container restarts
- A `data/` directory is also available for future data storage needs

## Configuration

### Changing the Port

Edit `docker-compose.yml` and change the ports section:
```yaml
ports:
  - "8080:3000"  # Access on port 8080 instead
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### Resource Limits (Optional)

Uncomment the `limits` and `reservations` sections in `docker-compose.yml` to control CPU and memory usage:
```yaml
limits:
  cpus: '0.5'
  memory: 512M
```

## Troubleshooting

**Port already in use:**
```bash
# Find the process using port 3000
lsof -i :3000
# Or change the port in docker-compose.yml
```

**Container exits immediately:**
```bash
docker-compose logs wdw-Tracker
```

**Permission issues with wait_times_history.json:**
```bash
chmod 666 wait_times_history.json
```

## Running as a Service (Systemd)

To run WDW Tracker automatically on boot, create a systemd service file:

1. Create `/etc/systemd/system/wdw-Tracker.service`:
```ini
[Unit]
Description=WDW Queue Tracker
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=<your-username>
WorkingDirectory=/home/tom/Repositories/wdw-Tracker
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

2. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable wdw-Tracker
sudo systemctl start wdw-Tracker
```

3. Check status:
```bash
sudo systemctl status wdw-Tracker
```

## Environment Variables

The following environment variables are set by default:
- `NODE_ENV=production`
- `PORT=3000`

To add custom environment variables, edit `docker-compose.yml` and add them to the `environment` section.

## Performance Notes

- The application uses approximately 50-100MB of RAM
- Alpine Linux base image keeps the Docker image size under 200MB
- Container starts in under 5 seconds
- Health check runs every 30 seconds

## Updates

To update the application:
1. Pull the latest code: `git pull`
2. Rebuild: `docker-compose up -d --build`

## Support

For issues or improvements, check:
- Container logs: `docker-compose logs`
- Docker resource usage: `docker stats`
