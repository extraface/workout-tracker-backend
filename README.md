# Workout Tracker

A seamless workout tracking app that syncs automatically to Google Sheets. Built for fast, efficient logging with smart input parsing and real-time cloud backup.

## Features

- 📊 **Real-time Google Sheets sync** - Every set automatically saved to your spreadsheet
- 🧠 **Smart weight input** - Natural language parsing for weights, bands, and bodyweight
- 💪 **Per-exercise memory** - Remembers your weights/bands within each workout session
- 📱 **Mobile-first design** - Optimized for quick logging on your phone
- 📈 **Progress tracking** - Built-in analysis with rep progression and volume charts
- 🔒 **Your data, your control** - Everything stored in your own Google Sheet

## Quick Start

### Prerequisites
- Google account
- Railway account (free tier)
- Netlify account (free tier)
- GitHub account

### Setup (15-20 minutes)
Follow the detailed instructions in `SETUP_GUIDE.md`

## Smart Weight Input Guide

The weight input understands natural language and makes intelligent assumptions to speed up your workflow.

### Basic Input Examples

| You Type | It Logs As | Notes |
|----------|-----------|-------|
| `25` | 25 lbs | Defaults to lbs for plain numbers |
| `25 lbs` | 25 lbs | Explicit unit |
| `25 lb` | 25 lbs | Normalizes lb → lbs |
| `15 kg` | 15 kg | Explicit kilograms |
| `15 k` | 15 kg | Auto-completes kg |
| `BW` | Bodyweight | No weight tracked |
| `bodyweight` | Bodyweight | Also works |
| *(leave blank)* | *See Smart Defaults* | Context-dependent |
| `NA` | Not tracked | For exercises where weight doesn't apply |
| `n/a` | Not tracked | Also works |
| `red` | Red Band | Band resistance |
| `red band` | Red Band | Also works |
| `blue` | Blue Band | |
| `purple` | Purple Band | |

### Supported Band Colors
- Red, Blue, Black, Green, Purple, Yellow, Orange

### Smart Defaults (Within a Session)

The app remembers your choices within each exercise during a workout session:

#### Scenario 1: Weighted Exercise
```
Exercise: Goblet Squats
Set 1: Reps: 10, Weight: 30 kg     → Logs: 10 reps × 30 kg
Set 2: Reps: 10, Weight: (blank)   → Logs: 10 reps × 30 kg  ✨ copies from Set 1
Set 3: Reps: 8,  Weight: (blank)   → Logs: 8 reps × 30 kg   ✨ copies from Set 1
Set 4: Reps: 10, Weight: 35        → Logs: 10 reps × 35 kg  ✨ remembers kg unit
```

**Key behaviors:**
- Blank weight = copy previous set's weight
- Plain number = use remembered unit (kg in this case)
- New value = override and update memory

#### Scenario 2: Bodyweight Exercise
```
Exercise: Pull-ups
Set 1: Reps: 5,  Weight: (blank)   → Logs: 5 reps (BW)
Set 2: Reps: 4,  Weight: (blank)   → Logs: 4 reps (BW)  ✨ copies from Set 1
Set 3: Reps: 3,  Weight: (blank)   → Logs: 3 reps (BW)  ✨ copies from Set 1
```

**Key behavior:**
- First set blank = defaults to bodyweight
- Subsequent blanks = copy bodyweight

#### Scenario 3: Band Exercise
```
Exercise: Band Pullaparts
Set 1: Reps: 15, Weight: red       → Logs: 15 reps (Red Band)
Set 2: Reps: 15, Weight: (blank)   → Logs: 15 reps (Red Band)  ✨ copies from Set 1
Set 3: Reps: 12, Weight: (blank)   → Logs: 12 reps (Red Band)  ✨ copies from Set 1
Set 4: Reps: 15, Weight: purple    → Logs: 15 reps (Purple Band)  ✨ switches band
```

#### Scenario 4: Mixed Units in Same Workout
```
Exercise: Goblet Squats
Set 1: 10 reps, 30 kg              → Logs: 10 reps × 30 kg

Exercise: Flat Bench Press (different exercise)
Set 1: 8 reps, 135                 → Logs: 8 reps × 135 lbs  ✨ independent memory
```

**Key behavior:**
- Each exercise has separate memory
- Switching exercises doesn't affect other exercises

### Visual Feedback

#### Inline Preview (Ghosted Text)
As you type, gray text appears showing what will be added:
- Type `25` → see gray ` lbs` after it
- Type `25 k` → see gray `g` completing to `kg`
- Colors and complete words show no ghost text

#### Smart Placeholder
After logging your first set, the weight field placeholder updates:
- After logging 30 lbs → placeholder shows `→ 30 lbs`
- After logging Red Band → placeholder shows `→ Red Band`
- After logging BW → placeholder shows `→ BW`

This confirms what will be used if you leave the field blank.

### Session Management

#### Finish Workout Button
- Appears at the bottom of your exercise list
- Shows summary: exercises logged and total sets
- **Clears all smart memory** for a fresh start next time
- Resets the interface to workout selection

**When to use:**
- After completing your workout
- Before starting a different workout type
- When you want to reset all exercise memory

**What it clears:**
- Per-exercise unit memory (lbs/kg/bands)
- Previous set defaults
- Session context

**What it keeps:**
- All logged data (synced to Google Sheets)
- Your workout configuration
- Historical "Last workout" data

## Workout Configuration

### Customizing Exercises
1. Go to **Settings** tab
2. Edit **Workout A Exercises** or **Workout B Exercises**
3. One exercise per line
4. Click **Save Configuration**

### Default Workouts

**Workout A** (9 exercises):
- Goblet Squats
- Band Pullaparts
- Kettlebell RDLs
- Flat Bench Press
- Front & Side Shoulder Raises
- Incline or Cable Fly
- Calf Raises
- Pull-ups
- Ab Isometrics

**Workout B** (12 exercises):
- Incline/Decline Pushups or Pull-ups
- Hammer Pullovers
- Swiss Ball T, W, & M
- Shoulder Press (Purple Band)
- Curls (18 lb DBs)
- Band Pullaparts (Palms Up)
- Band Pullaparts (Palms Down)
- Lat Raise Front/Side Superset (10 lb DBs)
- Tricep Extensions (12 lb DB)
- Bottoms Up KB Holds (8 kg)
- Face Pulls (20 lb Band)
- Ab Iso Work

## Data Management

### Where Your Data Lives

1. **Google Sheets (Primary)**
   - Real-time sync after each set
   - Accessible from any device
   - Can be exported, analyzed, shared
   - View at: Settings → Open Sheet

2. **Browser localStorage (Backup)**
   - Local cache for offline access
   - Faster loading
   - Automatically syncs to Sheets when online

### Data Format

Your Google Sheet has these columns:
- **Date**: ISO timestamp of when set was logged
- **Workout**: A or B
- **Exercise**: Exercise name
- **Reps**: Number of repetitions
- **Weight**: Numeric weight value (0 for BW/bands)
- **Unit**: lbs, kg, BW, Red Band, etc.

### Export Options

**CSV Export:**
1. Go to **Settings** tab
2. Click **Export to CSV**
3. Downloads a file: `workout-log-YYYY-MM-DD.csv`
4. Can be opened in Excel, Google Sheets, or any spreadsheet app

**Direct Google Sheets Access:**
- Click "Open Sheet" in Settings
- Full spreadsheet with all data
- Sort, filter, create charts
- Add formulas for custom analysis

### Multi-Device Usage

**Using on multiple devices:**
1. Both devices must authenticate with the same Google account
2. Data syncs through Google Sheets
3. Each device maintains a local cache

**Best practices:**
- Wait for "Synced" status before switching devices
- Refresh browser if you don't see recent data
- If offline, data saves locally and syncs when back online

## Analysis Features

### Available Metrics (per exercise)

1. **Total Volume (Last Workout)**
   - Sum of reps × weight for your last session
   - Shows % change from previous workout

2. **Max Reps (Single Set)**
   - Your highest rep count ever
   - Shows date and weight used

3. **Personal Record (Weight)**
   - Your maximum weight lifted
   - Shows date achieved

4. **Total Workouts**
   - Number of times you've done this exercise
   - Total sets logged

### Charts

**Rep Progression**
- Bar chart showing max reps per workout
- Last 8 workouts
- Highlights your progress toward higher reps

**Volume Over Time**
- Grid showing total volume per workout
- Last 10 workouts
- Color intensity shows relative volume
- Highest volume workout highlighted

## Tips & Best Practices

### For Fastest Logging

1. **First set**: Enter full information (e.g., `30 kg`)
2. **Subsequent sets**: Just enter reps, leave weight blank
3. **Finish workout**: Click "Finish Workout" when done

### For Different Rep Schemes

**Progressive Sets (increasing weight):**
```
Set 1: 10 reps, 100 lbs
Set 2: 8 reps, 110      ← just type new weight
Set 3: 6 reps, 120      ← just type new weight
```

**Drop Sets (decreasing weight):**
```
Set 1: 6 reps, 200 lbs
Set 2: 8 reps, 180      ← just type new weight
Set 3: 10 reps, 160     ← just type new weight
```

**Same Weight (most common):**
```
Set 1: 10 reps, 135 lbs
Set 2: 10 reps, [blank] ← auto-fills 135 lbs
Set 3: 8 reps, [blank]  ← auto-fills 135 lbs
```

### For Mixed Workouts

Each exercise has independent memory, so you can do:
- Weighted squats (kg)
- Bodyweight pull-ups (BW)
- Band exercises (red/blue/etc)
- All in the same workout with no confusion

### For Supersets or Circuits

Log each exercise separately as you complete it. The app shows today's logged sets under each exercise so you can track where you are.

## Troubleshooting

### Data Not Syncing
1. Check for "Synced" status in header (green dot)
2. Check internet connection
3. Check Railway backend is running: visit your Railway URL
4. Check browser console for errors (right-click → Inspect → Console)

### Can't Sign In
1. Verify you're added as a test user in Google Cloud Console
2. Check OAuth redirect URIs match your actual URLs
3. Try clearing browser cache
4. Check Railway environment variables are set correctly

### Wrong Weight/Unit Logged
1. Check the placeholder text before logging (shows what will be used)
2. Override by typing the correct value
3. Click "Finish Workout" to reset memory if needed

### Lost Local Data
- Don't worry! Everything is in Google Sheets
- Just refresh the page to reload from Sheets
- Export CSV regularly as backup

## Technical Details

### Architecture
- **Frontend**: Single-page HTML/CSS/JS application
- **Backend**: Node.js/Express server on Railway
- **Database**: Google Sheets via Google Sheets API v4
- **Auth**: OAuth 2.0 with Google Identity Services

### URLs (Configuration)
- Frontend: `https://dcworkouts.netlify.app`
- Backend: `https://workout-tracker-backend-production-c138.up.railway.app`

### Storage Limits
- Google Sheets: 5 million cells per spreadsheet (effectively unlimited for workout data)
- Browser localStorage: 5-10MB per domain (thousands of workouts)
- No row limits or entry limits

### Privacy & Security
- Your Google credentials never touch the frontend
- OAuth tokens stored securely on Railway backend
- Only you can access your workout data
- App is in "Testing" mode - only approved testers can use it

## Files in This Repository

- `index.html` - Frontend application
- `server.js` - Backend API server
- `package.json` - Node.js dependencies
- `SETUP_GUIDE.md` - Detailed deployment instructions
- `README.md` - This file

## Support & Feedback

### Reporting Issues
Since this is a personal project, there's no formal issue tracker. But common issues and solutions:

**Performance Issues:**
- Clear browser cache
- Check if too many browser tabs open
- Ensure stable internet connection

**Feature Requests:**
- Document desired behavior
- Consider if it fits the "fast logging" philosophy
- Test if workarounds exist with current features

### Making Changes
Both frontend and backend are easily modifiable:
- Frontend: Update `index.html` and redeploy to Netlify
- Backend: Update `server.js`, push to GitHub, Railway auto-deploys
- Workouts: Edit directly in app Settings (no code changes needed)

## License

Personal project - use as you wish!

## Credits

Built with:
- Google Sheets API
- Railway (hosting)
- Netlify (hosting)
- Express.js
- Google OAuth 2.0

## Version History

**v1.0** - Initial release
- Basic logging with Google Sheets sync
- Smart weight input parsing
- Per-exercise unit memory
- Session management with Finish Workout
- Analysis charts and metrics
- Multi-device support
