require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store OAuth clients per user session (in production, use Redis or database)
const userSessions = new Map();

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Workout Tracker API' });
});

// Generate auth URL
app.get('/auth/url', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ authUrl });
});

// Handle OAuth callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Generate a session ID
    const sessionId = Math.random().toString(36).substring(7);
    
    // Store tokens
    userSessions.set(sessionId, tokens);
    
    // Redirect back to app with session ID
    res.redirect(`${process.env.FRONTEND_URL}?session=${sessionId}`);
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
  }
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !userSessions.has(sessionId)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const tokens = userSessions.get(sessionId);
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  
  req.googleAuth = client;
  req.sessionId = sessionId;
  next();
};

// Create a new spreadsheet
app.post('/sheets/create', requireAuth, async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    const spreadsheet = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: 'Workout Tracker Data'
        },
        sheets: [{
          properties: {
            title: 'Workouts',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }]
      }
    });
    
    const spreadsheetId = spreadsheet.data.spreadsheetId;
    
    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Workouts!A1:E1',
      valueInputOption: 'RAW',
      resource: {
        values: [['Date', 'Workout', 'Exercise', 'Reps', 'Weight']]
      }
    });
    
    res.json({ 
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
    });
  } catch (error) {
    console.error('Error creating spreadsheet:', error);
    res.status(500).json({ error: 'Failed to create spreadsheet' });
  }
});

// Load data from spreadsheet
app.get('/sheets/:spreadsheetId/data', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Workouts!A2:E'
    });
    
    const rows = response.data.values || [];
    const workouts = rows.map(row => ({
      date: row[0],
      workout: row[1],
      exercise: row[2],
      reps: parseInt(row[3]),
      weight: parseFloat(row[4])
    }));
    
    res.json({ workouts });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// Add workout entry
app.post('/sheets/:spreadsheetId/entry', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { date, workout, exercise, reps, weight } = req.body;
    
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Workouts!A:E',
      valueInputOption: 'RAW',
      resource: {
        values: [[date, workout, exercise, reps, weight]]
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding entry:', error);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// Check session validity
app.get('/auth/check', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !userSessions.has(sessionId)) {
    return res.json({ authenticated: false });
  }
  
  res.json({ authenticated: true });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (sessionId) {
    userSessions.delete(sessionId);
  }
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
