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

// Convert weight to kg for comparison
function convertToKg(weight, unit) {
  const LBS_TO_KG = 0.453592;
  const unitLower = (unit || '').toLowerCase();
  
  if (unitLower.includes('kg')) {
    return weight;
  } else if (unitLower.includes('lb')) {
    return weight * LBS_TO_KG;
  } else if (unitLower === 'bw' || unitLower === 'bodyweight' || unitLower === 'seconds') {
    return 0; // Not weight-based
  } else if (unitLower.includes('band') || unitLower.includes('red') || unitLower.includes('blue')) {
    return 0; // Resistance bands
  } else {
    // Default to lbs conversion
    return weight * LBS_TO_KG;
  }
}

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
      range: 'Workouts!A1:H1',
      valueInputOption: 'RAW',
      resource: {
        values: [['Date', 'Workout', 'Exercise', 'Reps', 'Weight', 'Unit', 'Deload', 'Deleted']]
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
      range: 'Workouts!A2:I'
    });
    
    const rows = response.data.values || [];
    const workouts = rows
      .map(row => ({
        date: row[0],
        workout: row[1],
        exercise: row[2],
        reps: parseInt(row[3]),
        weight: parseFloat(row[4]),
        unit: row[5] || 'lbs',
        weightKg: parseFloat(row[6]) || 0,
        deload: row[7] || '',
        deleted: row[8] || ''
      }))
      .filter(w => !w.deleted || w.deleted !== 'Yes'); // Filter out deleted entries
    
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
    const { date, workout, exercise, reps, weight, unit, deload } = req.body;
    
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    // Calculate weight in kg
    const weightKg = convertToKg(parseFloat(weight), unit || 'lbs');
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Workouts!A:I',
      valueInputOption: 'RAW',
      resource: {
        values: [[date, workout, exercise, reps, weight, unit || 'lbs', weightKg, deload || '', '']]
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding entry:', error);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// Mark entry as deleted (for undo functionality)
app.post('/sheets/:spreadsheetId/delete-row', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { date, workout, exercise, reps, weight, unit } = req.body;
    
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    // Load all data to find the matching row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Workouts!A2:I'
    });
    
    const rows = response.data.values || [];
    
    // Find the row that matches (search from bottom up to get most recent)
    let rowIndex = -1;
    console.log('Looking for row to delete:', { date, workout, exercise, reps, weight, unit });
    
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const matches = row[0] === date &&
          row[1] === workout &&
          row[2] === exercise &&
          parseInt(row[3]) === reps &&
          parseFloat(row[4]) === weight &&
          row[5] === unit;
      
      if (matches) {
        rowIndex = i + 2; // +2 because rows are 0-indexed and we start from row 2
        console.log('Found matching row at index:', rowIndex);
        break;
      }
    }
    
    if (rowIndex === -1) {
      console.error('No matching row found. Last few rows:', rows.slice(-3).map((r, i) => ({
        index: rows.length - 3 + i + 2,
        date: r[0],
        workout: r[1],
        exercise: r[2],
        reps: parseInt(r[3]),
        weight: parseFloat(r[4]),
        unit: r[5]
      })));
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    // Actually delete the row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // Assumes first sheet (Workouts)
              dimension: 'ROWS',
              startIndex: rowIndex - 1, // 0-indexed for API
              endIndex: rowIndex
            }
          }
        }]
      }
    });
    
    res.json({ success: true, message: 'Row deleted successfully' });
  } catch (error) {
    console.error('Error deleting row:', error);
    res.status(500).json({ error: 'Failed to delete row' });
  }
});

// Claude chat endpoint
app.post('/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'Anthropic API key not configured',
        message: 'Please add ANTHROPIC_API_KEY to Railway environment variables'
      });
    }
    
    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: messages,
        system: 'You are a helpful, encouraging fitness assistant. Provide brief, motivating responses. Keep answers concise and supportive.'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to get response from Claude',
        details: errorText
      });
    }
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
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

// Load workout config from Config tab
app.get('/sheets/:spreadsheetId/config', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Config!A2:B'
    });
    
    const rows = response.data.values || [];
    
    const workoutA = [];
    const workoutB = [];
    
    rows.forEach(row => {
      if (row && row.length >= 2) {
        if (row[0] === 'A') workoutA.push(row[1]);
        if (row[0] === 'B') workoutB.push(row[1]);
      }
    });
    
    res.json({ workoutA, workoutB });
  } catch (error) {
    console.error('Load config error:', error);
    // Config tab doesn't exist yet
    res.status(404).json({ error: 'Config not found' });
  }
});

// Initialize Config tab from recent workout data
app.post('/sheets/:spreadsheetId/config/initialize', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    // Read workout data
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Workouts!A2:C'
    });
    
    const rows = dataResponse.data.values || [];
    
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No workout data found to initialize from' });
    }
    
    // Find most recent A and B workouts
    const workoutsByType = { A: {}, B: {} };
    
    rows.forEach(row => {
      if (row && row.length >= 3) {
        const date = new Date(row[0]);
        const workout = row[1];
        const exercise = row[2];
        
        if ((workout === 'A' || workout === 'B') && !isNaN(date.getTime())) {
          const dateStr = date.toISOString();
          if (!workoutsByType[workout][dateStr]) {
            workoutsByType[workout][dateStr] = new Set();
          }
          workoutsByType[workout][dateStr].add(exercise);
        }
      }
    });
    
    // Get most recent date for each workout type
    const getLatestExercises = (workoutType) => {
      const dates = Object.keys(workoutsByType[workoutType]).sort().reverse();
      if (dates.length === 0) return [];
      return Array.from(workoutsByType[workoutType][dates[0]]);
    };
    
    const workoutA = getLatestExercises('A');
    const workoutB = getLatestExercises('B');
    
    if (workoutA.length === 0 && workoutB.length === 0) {
      return res.status(400).json({ error: 'No exercises found in recent workouts' });
    }
    
    // Create Config sheet
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Config'
              }
            }
          }]
        }
      });
    } catch (error) {
      // Sheet might already exist
      console.log('Config sheet may already exist:', error.message);
    }
    
    // Prepare and write config data
    const configData = [
      ['Workout', 'Exercise'],
      ...workoutA.map(ex => ['A', ex]),
      ...workoutB.map(ex => ['B', ex])
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Config!A1',
      valueInputOption: 'RAW',
      resource: {
        values: configData
      }
    });
    
    res.json({ 
      success: true,
      workoutA,
      workoutB
    });
  } catch (error) {
    console.error('Initialize config error:', error);
    res.status(500).json({ error: 'Failed to initialize config', details: error.message });
  }
});

// Update workout config
app.post('/sheets/:spreadsheetId/config', requireAuth, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { workoutA, workoutB } = req.body;
    
    if (!Array.isArray(workoutA) || !Array.isArray(workoutB)) {
      return res.status(400).json({ error: 'workoutA and workoutB must be arrays' });
    }
    
    const sheets = google.sheets({ version: 'v4', auth: req.googleAuth });
    
    const configData = [
      ['Workout', 'Exercise'],
      ...workoutA.map(ex => ['A', ex]),
      ...workoutB.map(ex => ['B', ex])
    ];
    
    // Clear existing data
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Config!A:B'
    });
    
    // Write new data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Config!A1',
      valueInputOption: 'RAW',
      resource: {
        values: configData
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Failed to update config', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
