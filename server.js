// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// Schemas
const commentSchema = new mongoose.Schema({
  email: { type: String },
  text: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const imageSchema = new mongoose.Schema({
  title: String,
  description: String,
  filename: String,
  uploadedAt: { type: Date, default: Date.now },
  // store commenters as array of unique emails for easy checking
  commenters: [String],
  comments: [commentSchema]
});

const Image = mongoose.model('Image', imageSchema);

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

// ensure uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// serve static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// multer storage
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    // keep extension
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '5242880', 10) },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'), false);
    cb(null, true);
  }
});

// ----- API routes -----

// Get artworks metadata (public)
app.get('/api/artworks', async (req, res) => {
  try {
    const arts = await Image.find().sort({ uploadedAt: -1 }).lean();
    res.json({ success: true, artworks: arts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Public: get single artwork
app.get('/api/artwork/:id', async (req, res) => {
  try {
    const art = await Image.findById(req.params.id).lean();
    if (!art) return res.status(404).json({ success: false });
    res.json({ success: true, artwork: art });
  } catch (err) {
    res.status(400).json({ success: false });
  }
});

// Public: post comment (email + text). enforce unique-email limit per image.
app.post('/api/comment/:id', async (req, res) => {
  try {
    const { email, text } = req.body;
    if (!email || !text) return res.status(400).json({ success: false, message: 'Email and comment required' });

    const art = await Image.findById(req.params.id);
    if (!art) return res.status(404).json({ success: false, message: 'Not found' });

    // unique email set
    const uniqueEmails = new Set(art.commenters || []);
    if (!uniqueEmails.has(email) && uniqueEmails.size >= (parseInt(process.env.MAX_COMMENTERS_PER_IMAGE || '5', 10))) {
      return res.status(403).json({ success: false, message: 'Max unique commenters reached' });
    }

    // push comment
    art.comments.push({ email, text });
    if (!uniqueEmails.has(email)) art.commenters.push(email);
    await art.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ----- Admin auth -----

// login (admin page posts here)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// admin status
app.get('/api/admin/status', (req, res) => {
  res.json({ loggedIn: !!req.session.admin });
});

// middleware require admin
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

// Upload artwork (admin only). Enforce max images count
app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const count = await Image.countDocuments();
    const MAX = parseInt(process.env.MAX_IMAGES || '40', 10);
    if (count >= MAX) {
      // delete uploaded file to save space
      if (req.file && req.file.path) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'Max images reached' });
    }
    const { title, description } = req.body;
    const filename = req.file.filename;
    await Image.create({ title, description, filename, commenters: [], comments: [] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// delete artwork (admin only)
app.post('/api/delete/:id', requireAdmin, async (req, res) => {
  try {
    const art = await Image.findById(req.params.id);
    if (!art) return res.status(404).json({ success: false });
    // remove file
    const filePath = path.join(uploadsDir, art.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await Image.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// Serve the single-page files from /public (index, admin, dashboard are static)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Start
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
