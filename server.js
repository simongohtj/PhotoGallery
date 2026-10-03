const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const exifr = require('exifr');
const crg = require('country-reverse-geocoding').country_reverse_geocoding();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const COUNTRY_CENTERS_FILE = path.join(__dirname, 'public', 'js', 'country-centers.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Country Centroid lookup helper
function getCountryCoordinates(countryName) {
  if (!countryName) return null;
  const centers = readJSON(COUNTRY_CENTERS_FILE, {});
  const query = countryName.toLowerCase().trim();
  if (centers[query]) return centers[query];
  for (const [key, val] of Object.entries(centers)) {
    if (key.includes(query) || query.includes(key)) {
      return val;
    }
  }
  return null;
}

// Nominatim OpenStreetMap fallback for coastal/island points
function nominatimLookup(lat, lng) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    https.get(url, { headers: { 'User-Agent': 'PhotoGalleryApp/1.0' } }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(b);
          if (data && data.address && data.address.country) {
            resolve({ country: data.address.country, countryCode: (data.address.country_code || '').toUpperCase() });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Extract GPS and Country from image file
async function extractLocationFromPhoto(filePath) {
  try {
    const gps = await exifr.gps(filePath);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      let geo = crg.get_country(gps.latitude, gps.longitude);
      let country = geo ? geo.name : '';
      let countryCode = geo ? geo.code : '';
      if (!country) {
        const nom = await nominatimLookup(gps.latitude, gps.longitude);
        if (nom) {
          country = nom.country;
          countryCode = nom.countryCode;
        }
      }
      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
        country: country || '',
        countryCode: countryCode || ''
      };
    }
  } catch (err) {}
  return { latitude: null, longitude: null, country: '', countryCode: '' };
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helpers to read/write JSON files safely
function readJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) || file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, GIF, BMP, AVIF) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per photo
});

// Configure audio upload storage
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const audioFilter = (req, file, cb) => {
  const allowedExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac', '.webm'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) || file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files (MP3, M4A, WAV, OGG, AAC) are allowed'));
  }
};

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Sync photos on disk with photos.json
function getSynchronizedPhotos() {
  let photos = readJSON(PHOTOS_FILE, []);
  let diskFiles = [];
  try {
    diskFiles = fs.readdirSync(UPLOADS_DIR);
  } catch (err) {
    console.error('Failed to read uploads dir:', err);
  }

  const diskFileSet = new Set(diskFiles);

  // Filter out photos that don't exist on disk AND deduplicate by filename
  const seenFilenames = new Set();
  const validPhotos = [];

  for (const p of photos) {
    if (p && p.filename && diskFileSet.has(p.filename) && !seenFilenames.has(p.filename)) {
      seenFilenames.add(p.filename);
      validPhotos.push(p);
    }
  }

  // Add any orphaned files found on disk that aren't registered yet
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];
  diskFiles.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (imageExts.includes(ext) && !seenFilenames.has(file)) {
      try {
        const stat = fs.statSync(path.join(UPLOADS_DIR, file));
        validPhotos.push({
          id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
          filename: file,
          originalName: file,
          uploadedAt: stat.birthtime || stat.mtime || new Date().toISOString(),
          size: stat.size
        });
        seenFilenames.add(file);
      } catch (e) {}
    }
  });

  writeJSON(PHOTOS_FILE, validPhotos);
  return validPhotos;
}

// ----------------- API Routes ----------------- //

// GET /api/config
app.get('/api/config', (req, res) => {
  const defaultConfig = {
    milestones: [
      {
        id: 'milestone-wedding',
        title: 'Wedding',
        date: '2022-07-15',
        emoji: '💍',
        type: 'anniversary',
        prefix: '',
        postfix: '',
        enabled: true
      },
      {
        id: 'milestone-daughter',
        title: 'Family',
        date: '2026-04-12',
        emoji: '👶',
        type: 'age',
        prefix: 'Our little one has been with us for',
        postfix: '',
        enabled: true
      }
    ],
    slideDuration: 7,
    kenBurnsEffect: true,
    musicUrl: '',
    musicVolume: 0.7,
    musicEnabled: false
  };

  const config = readJSON(CONFIG_FILE, defaultConfig);

  // Migration: If config doesn't have milestones array, build it from legacy fields
  if (!Array.isArray(config.milestones)) {
    const list = [];
    if (config.weddingDate) {
      list.push({
        id: 'milestone-wedding',
        title: config.weddingTitle || 'Wedding',
        date: config.weddingDate,
        emoji: '💍',
        type: 'anniversary',
        prefix: '',
        postfix: '',
        enabled: config.showAnniversary !== false
      });
    }
    if (config.daughterBirthDate) {
      list.push({
        id: 'milestone-daughter',
        title: 'Family',
        date: config.daughterBirthDate,
        emoji: '👶',
        type: 'age',
        prefix: config.daughterTitle ? `${config.daughterTitle} has been with us for` : 'Our little one has been with us for',
        postfix: '',
        enabled: config.showDaughterAge !== false
      });
    }
    config.milestones = list.length > 0 ? list : defaultConfig.milestones;
  }

  // Ensure 'elapsed' is migrated to 'age' and postfix is present
  if (Array.isArray(config.milestones)) {
    config.milestones = config.milestones.map(m => {
      const type = (m.type === 'elapsed') ? 'age' : (m.type || 'anniversary');
      return {
        ...m,
        type,
        prefix: m.prefix || '',
        postfix: m.postfix || ''
      };
    });
  }

  res.json({ ...defaultConfig, ...config });
});

// POST /api/config
app.post('/api/config', (req, res) => {
  const currentConfig = readJSON(CONFIG_FILE, {});
  const {
    milestones,
    slideDuration,
    kenBurnsEffect,
    musicUrl,
    musicVolume,
    musicEnabled
  } = req.body;

  const updatedConfig = {
    ...currentConfig,
    milestones: Array.isArray(milestones) ? milestones : (currentConfig.milestones || []),
    slideDuration: slideDuration !== undefined ? Math.max(2, Math.min(60, Number(slideDuration))) : (currentConfig.slideDuration || 6),
    kenBurnsEffect: kenBurnsEffect !== undefined ? Boolean(kenBurnsEffect) : (currentConfig.kenBurnsEffect !== false),
    musicUrl: musicUrl !== undefined ? String(musicUrl).trim() : (currentConfig.musicUrl || ''),
    musicVolume: musicVolume !== undefined ? Math.max(0, Math.min(1, Number(musicVolume))) : (currentConfig.musicVolume ?? 0.7),
    musicEnabled: musicEnabled !== undefined ? Boolean(musicEnabled) : Boolean(currentConfig.musicEnabled)
  };

  if (writeJSON(CONFIG_FILE, updatedConfig)) {
    res.json({ success: true, message: 'Settings saved successfully', config: updatedConfig });
  } else {
    res.status(500).json({ success: false, message: 'Failed to write settings to disk' });
  }
});

// POST /api/music/upload
app.post('/api/music/upload', uploadAudio.single('music'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No audio file uploaded' });
  }

  const musicUrl = `/audio/${req.file.filename}`;
  const config = readJSON(CONFIG_FILE, {});
  config.musicUrl = musicUrl;
  config.musicEnabled = true;
  writeJSON(CONFIG_FILE, config);

  res.json({
    success: true,
    message: 'Music uploaded successfully',
    musicUrl,
    filename: req.file.originalname
  });
});

// DELETE /api/music
app.delete('/api/music', (req, res) => {
  const config = readJSON(CONFIG_FILE, {});
  const oldUrl = config.musicUrl || '';

  if (oldUrl.startsWith('/audio/')) {
    const filename = path.basename(oldUrl);
    const filePath = path.join(AUDIO_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Failed to delete audio file:', e);
    }
  }

  config.musicUrl = '';
  config.musicEnabled = false;
  writeJSON(CONFIG_FILE, config);

  res.json({ success: true, message: 'Background music removed' });
});

// GET /api/photos
app.get('/api/photos', (req, res) => {
  const photos = getSynchronizedPhotos();
  res.json(photos);
});

// POST /api/photos/upload
app.post('/api/photos/upload', upload.array('photos', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No photos were uploaded' });
  }

  let photos = readJSON(PHOTOS_FILE, []);
  const existingFilenames = new Set(photos.map(p => p.filename));
  const addedPhotos = [];

  for (const file of req.files) {
    if (!existingFilenames.has(file.filename)) {
      const filePath = path.join(UPLOADS_DIR, file.filename);
      const loc = await extractLocationFromPhoto(filePath);

      const photoEntry = {
        id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        filename: file.filename,
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        latitude: loc.latitude,
        longitude: loc.longitude,
        country: loc.country,
        countryCode: loc.countryCode
      };
      photos.unshift(photoEntry); // Add to beginning of collection
      addedPhotos.push(photoEntry);
      existingFilenames.add(file.filename);
    }
  }

  writeJSON(PHOTOS_FILE, photos);
  getSynchronizedPhotos(); // Clean and verify

  res.json({
    success: true,
    message: `Successfully uploaded ${addedPhotos.length} photo${addedPhotos.length > 1 ? 's' : ''}`,
    photos: addedPhotos
  });
});

// PATCH /api/photos/:id/location
app.patch('/api/photos/:id/location', (req, res) => {
  const photoId = req.params.id;
  const { country } = req.body;
  const photos = getSynchronizedPhotos();
  const photo = photos.find(p => p.id === photoId || p.filename === photoId);
  if (!photo) {
    return res.status(404).json({ success: false, message: 'Photo not found' });
  }

  const trimmedCountry = (country || '').trim();
  photo.country = trimmedCountry;

  if (trimmedCountry) {
    const center = getCountryCoordinates(trimmedCountry);
    if (center) {
      if (!photo.latitude || !photo.longitude) {
        photo.latitude = center.lat;
        photo.longitude = center.lng;
      }
      photo.countryCode = center.id;
      if (!photo.country) photo.country = center.name;
    }
  } else {
    photo.latitude = null;
    photo.longitude = null;
    photo.countryCode = '';
  }

  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true, message: 'Location updated', photo });
});

// POST /api/photos/batch-location
app.post('/api/photos/batch-location', (req, res) => {
  const { photoIds, country } = req.body;
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json({ success: false, message: 'photoIds array is required' });
  }

  const photos = getSynchronizedPhotos();
  const idSet = new Set(photoIds);
  const trimmedCountry = (country || '').trim();
  const center = getCountryCoordinates(trimmedCountry);
  let updatedCount = 0;

  photos.forEach(photo => {
    if (idSet.has(photo.id) || idSet.has(photo.filename)) {
      photo.country = trimmedCountry;
      if (trimmedCountry && center) {
        photo.latitude = center.lat;
        photo.longitude = center.lng;
        photo.countryCode = center.id;
      } else if (!trimmedCountry) {
        photo.latitude = null;
        photo.longitude = null;
        photo.countryCode = '';
      }
      updatedCount++;
    }
  });

  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true, message: `Updated location for ${updatedCount} photo${updatedCount !== 1 ? 's' : ''}`, photos });
});

// PATCH /api/photos/:id/focal-point
app.patch('/api/photos/:id/focal-point', (req, res) => {
  const photoId = req.params.id;
  const { x, y } = req.body;
  const photos = getSynchronizedPhotos();
  const photo = photos.find(p => p.id === photoId || p.filename === photoId);
  if (!photo) {
    return res.status(404).json({ success: false, message: 'Photo not found' });
  }

  if (x === undefined || y === undefined || x === null || y === null) {
    delete photo.focalPoint;
  } else {
    const fx = Math.max(0, Math.min(100, Math.round(Number(x) * 10) / 10));
    const fy = Math.max(0, Math.min(100, Math.round(Number(y) * 10) / 10));
    photo.focalPoint = { x: fx, y: fy };
  }

  writeJSON(PHOTOS_FILE, photos);
  res.json({ success: true, message: 'Focal point updated', photo });
});

// DELETE /api/photos/:id
app.delete('/api/photos/:id', (req, res) => {
  const photoId = req.params.id;
  let photos = getSynchronizedPhotos();
  const photoIndex = photos.findIndex(p => p.id === photoId || p.filename === photoId);

  if (photoIndex === -1) {
    return res.status(404).json({ success: false, message: 'Photo not found' });
  }

  const [removed] = photos.splice(photoIndex, 1);
  writeJSON(PHOTOS_FILE, photos);

  // Delete actual file from disk
  const filePath = path.join(UPLOADS_DIR, removed.filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to delete file from disk:', err);
  }

  res.json({ success: true, message: 'Photo deleted successfully', photo: removed });
});

// POST /api/photos/delete-batch
app.post('/api/photos/delete-batch', (req, res) => {
  const { photoIds } = req.body;
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json({ success: false, message: 'photoIds array is required' });
  }

  let photos = getSynchronizedPhotos();
  const idsToDelete = new Set(photoIds);
  const deletedPhotos = [];

  photos = photos.filter(photo => {
    if (idsToDelete.has(photo.id) || idsToDelete.has(photo.filename)) {
      deletedPhotos.push(photo);
      const filePath = path.join(UPLOADS_DIR, photo.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Failed to delete file from disk:', err);
      }
      return false;
    }
    return true;
  });

  writeJSON(PHOTOS_FILE, photos);

  res.json({
    success: true,
    message: `Successfully deleted ${deletedPhotos.length} photo${deletedPhotos.length !== 1 ? 's' : ''}`,
    deletedCount: deletedPhotos.length,
    photos
  });
});

// POST /api/photos/reorder
app.post('/api/photos/reorder', (req, res) => {
  const { photoIds } = req.body;
  if (!Array.isArray(photoIds)) {
    return res.status(400).json({ success: false, message: 'photoIds must be an array' });
  }

  const currentPhotos = getSynchronizedPhotos();
  const photoMap = new Map(currentPhotos.map(p => [p.id, p]));

  const reordered = [];
  for (const id of photoIds) {
    if (photoMap.has(id)) {
      reordered.push(photoMap.get(id));
      photoMap.delete(id);
    }
  }
  // Append any that weren't included in photoIds
  for (const remaining of photoMap.values()) {
    reordered.push(remaining);
  }

  writeJSON(PHOTOS_FILE, reordered);
  res.json({ success: true, photos: reordered });
});

// Page Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback to slideshow for other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`✨ Photo Gallery Slideshow is running at:`);
  console.log(`👉 Main Slideshow:  http://localhost:${PORT}/`);
  console.log(`👉 Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log('--------------------------------------------------');
});
