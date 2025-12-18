# Music Player Web Application

A full-featured web-based music player with scheduling, user management, and automatic playback controls.

## Features

- 🎵 Music playback with playlist management
- 📅 Schedule playback by day and time
- ⏱️ Configurable silence periods between tracks
- 👥 User authentication and admin panel
- 🎚️ Adjustable max play duration with auto-pause
- 📁 Upload and manage music files
- 🎨 Beautiful gradient UI

## Tech Stack

- **Backend:** Node.js, Express, SQLite
- **Frontend:** React, Vite, Tailwind CSS
- **Authentication:** JWT with bcrypt

## Installation

### Prerequisites
- Node.js 20+
- Ubuntu/Linux Mint

### Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/music-player-app.git
cd music-player-app
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client
npm install
npm run build
cd ..
```

4. Start the server:
```bash
NODE_ENV=production node server.js
```

5. Access at: `http://localhost:3001`

### Default Credentials
- Username: `admin`
- Password: `admin123`

## Systemd Service (Auto-start on boot)

Create `/etc/systemd/system/music-player.service`:
```ini
[Unit]
Description=Music Player Web Application
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/music-player-app
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable music-player
sudo systemctl start music-player
```

## Configuration

- **Port:** Set `PORT` environment variable (default: 3001)
- **Secret Key:** Set `SECRET_KEY` environment variable for JWT
- **Upload Limit:** 50MB per file (configurable in server.js)

## Usage

1. **Upload Music:** Click "Manage Music" → "Upload Music"
2. **Create Schedule:** Click "Schedule" → Select time and days
3. **Adjust Settings:** Click "Settings" → Configure silence duration and max play time
4. **Manage Users:** (Admin only) Click "Admin" → Add/remove users

## License

MIT
