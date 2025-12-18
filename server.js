const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'change-this-secret-key-in-production';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true
}));
app.use('/uploads', express.static('uploads'));

// Database setup
const db = new sqlite3.Database('./music_player.db');

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )`);

  // Create default admin user
  db.get("SELECT * FROM users WHERE username = 'admin'", [], (err, row) => {
    if (!row) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
        ['admin', hashedPassword, 'admin']);
      console.log('✅ Default admin user created: admin/admin123');
    }
  });

  db.get("SELECT * FROM users WHERE username = 'user'", [], (err, row) => {
    if (!row) {
      const hashedPassword = bcrypt.hashSync('user123', 10);
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
        ['user', hashedPassword, 'user']);
    }
  });

  // Tracks table
  db.run(`CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    duration TEXT NOT NULL,
    filename TEXT NOT NULL,
    position INTEGER NOT NULL
  )`);

  // Schedules table
  db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    days TEXT NOT NULL,
    action TEXT NOT NULL
  )`);

  // Settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    silence_duration INTEGER DEFAULT 2,
    fade_enabled INTEGER DEFAULT 1,
    max_play_duration INTEGER DEFAULT 60
  )`);

  db.get("SELECT * FROM settings", [], (err, row) => {
    if (!row) {
      db.run("INSERT INTO settings (id, silence_duration, fade_enabled, max_play_duration) VALUES (1, 2, 1, 60)");
    }
  });
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|ogg|m4a|flac/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('audio/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Audio files only!');
    }
  }
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username, role: user.role });
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

app.get('/api/tracks', authenticateToken, (req, res) => {
  db.all("SELECT * FROM tracks ORDER BY position", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tracks/upload', authenticateToken, upload.array('files', 20), (req, res) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  db.get("SELECT MAX(position) as maxPos FROM tracks", [], (err, row) => {
    const startPos = (row.maxPos || 0) + 1;
    let completed = 0;
    
    files.forEach((file, index) => {
      const title = path.parse(file.originalname).name;
      db.run(
        "INSERT INTO tracks (title, artist, duration, filename, position) VALUES (?, ?, ?, ?, ?)",
        [title, 'Unknown Artist', '0:00', file.filename, startPos + index],
        (err) => {
          completed++;
          if (completed === files.length) {
            res.json({ message: `${files.length} file(s) uploaded successfully` });
          }
        }
      );
    });
  });
});

app.put('/api/tracks/:id', authenticateToken, (req, res) => {
  const { title, artist } = req.body;
  db.run(
    "UPDATE tracks SET title = ?, artist = ? WHERE id = ?",
    [title, artist, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Track updated' });
    }
  );
});

app.delete('/api/tracks/:id', authenticateToken, (req, res) => {
  db.get("SELECT filename FROM tracks WHERE id = ?", [req.params.id], (err, row) => {
    if (row) {
      const filePath = path.join(__dirname, 'uploads', row.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    db.run("DELETE FROM tracks WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Track deleted' });
    });
  });
});

app.post('/api/tracks/reorder', authenticateToken, (req, res) => {
  const { tracks } = req.body;
  
  db.serialize(() => {
    const stmt = db.prepare("UPDATE tracks SET position = ? WHERE id = ?");
    tracks.forEach((track, index) => {
      stmt.run(index, track.id);
    });
    stmt.finalize(() => {
      res.json({ message: 'Tracks reordered' });
    });
  });
});

app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  db.all("SELECT id, username, role FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  db.run(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, role],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, username, role });
    }
  );
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User deleted' });
  });
});

app.get('/api/schedules', authenticateToken, (req, res) => {
  db.all("SELECT * FROM schedules", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const schedules = rows.map(row => ({
      ...row,
      days: JSON.parse(row.days)
    }));
    res.json(schedules);
  });
});

app.post('/api/schedules', authenticateToken, (req, res) => {
  const { time, days, action } = req.body;
  db.run(
    "INSERT INTO schedules (time, days, action) VALUES (?, ?, ?)",
    [time, JSON.stringify(days), action],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, time, days, action });
    }
  );
});

app.delete('/api/schedules/:id', authenticateToken, (req, res) => {
  db.run("DELETE FROM schedules WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Schedule deleted' });
  });
});

app.get('/api/settings', authenticateToken, (req, res) => {
  db.get("SELECT * FROM settings WHERE id = 1", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { silence_duration: 2, fade_enabled: 1, max_play_duration: 60 });
  });
});

app.put('/api/settings', authenticateToken, (req, res) => {
  const { silence_duration, fade_enabled, max_play_duration } = req.body;
  db.run(
    "UPDATE settings SET silence_duration = ?, fade_enabled = ?, max_play_duration = ? WHERE id = 1",
    [silence_duration, fade_enabled ? 1 : 0, max_play_duration],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Settings updated' });
    }
  );
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 Music Player API running on port ${PORT}`);
  console.log(`📁 Upload folder: ${path.join(__dirname, 'uploads')}`);
  console.log(`🔐 Default login: admin/admin123`);
  console.log(`🌐 Access at: http://YOUR_SERVER_IP:${PORT}`);
});
