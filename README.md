# Workout Tracker

A seamless workout tracking app that syncs automatically to Google Sheets. Built for fast, efficient logging with smart input parsing and real-time cloud backup.

## Features

- 📊 **Real-time Google Sheets sync** - Every set automatically saved to your spreadsheet
- 🧠 **Smart weight input** - Natural language parsing for weights, bands, and bodyweight
- 💪 **Per-exercise memory** - Remembers your weights/bands within each workout session
- 🎯 **Smart workout suggestion** - Automatically suggests which workout (A or B) is next based on your alternating pattern
- 📱 **Mobile-first design** - Optimized for quick logging on your phone
- 📈 **Progress tracking** - Built-in analysis with rep progression and volume charts
- 💬 **Claude AI chat** - Get encouragement and advice during workouts
- 👁️ **Visual progress indicators** - See completed exercises and current exercise at a glance
- 🔢 **Doubled weight support** - Track exercises using two dumbbells (e.g., 2x25 lb)
- 🔒 **Your data, your control** - Everything stored in your own Google Sheet

## Quick Start

### Prerequisites
- Google account
- Railway account (free tier)
- Netlify account (free tier)
- GitHub account
- Anthropic API account (for chat feature, optional)

### Setup (15-20 minutes)
1. Deploy backend to Railway
2. Deploy frontend to Netlify
3. Configure Google OAuth credentials
4. (Optional) Add Anthropic API key for chat

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
| `blue` | Blue Band | Fixed in v1.1! |
| `purple` | Purple Band | |
| `2x25` | 2x25 lbs | Doubled weight (for dumbbells) |
| `2x25 lb` | 2x25 lbs | Explicit doubled weight |
| `2 x 15 kg` | 2x15 kg | Spaces supported |

### Supported Band Colors
- Red, Blue, Black, Green, Purple

### Doubled Weight Exercises

Some exercises use two dumbbells/kettlebells and need special tracking:
- Flat Bench Press
- Incline Bench Press
- Shoulder Press
- Dumbbell Press

For these exercises, enter weights as `2x25` instead of `50` to preserve the detail that you're using two 25lb dumbbells.

**Example:**
```
Exercise: Flat Bench Press
Set 1: Reps: 10, Weight: 2x25        → Logs: 10 reps × 2x25 lbs
Set 2: Reps: 8,  Weight: 2x30        → Logs: 8 reps × 2x30 lbs
Set 3: Reps: 8,  Weight: (blank)     → Logs: 8 reps × 2x30 lbs  ✨ copies from Set 2
```

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
Set 4: Reps: 15, Weight: blue      → Logs: 15 reps (Blue Band)  ✨ switches band
```

#### Scenario 4: Mixed Units in Same Workout
```
Exercise: Goblet Squats
Set 1: 10 reps, 30 kg              → Logs: 10 reps × 30 kg

Exercise: Flat Bench Press (different exercise)
Set 1: 8 reps, 2x25                → Logs: 8 reps × 2x25 lbs  ✨ independent memory
```

**Key behavior:**
- Each exercise has separate memory
- Switching exercises doesn't affect other exercises

### Visual Feedback

#### Inline Preview (Ghosted Text)
As you type, gray text appears showing what will be added:
- Type `25` → see gray ` lbs` after it
- Type `25 k` → see gray `g` completing to `kg`
- Type `2x25` → see gray ` lbs` after it
- Colors and complete words show no ghost text

#### Smart Placeholder
After logging your first set, the weight field placeholder updates:
- After logging 30 lbs → placeholder shows `→ 30 lbs`
- After logging Red Band → placeholder shows `→ Red Band`
- After logging BW → placeholder shows `→ BW`
- After logging 2x25 lbs → placeholder shows `→ 2x25 lbs`

This confirms what will be used if you leave the field blank.

## Visual Progress Indicators (NEW in v1.1)

### Exercise States

**Current Exercise (Yellow Border):**
- The next exercise you need to complete (first one with <3 sets)
- Highlighted with orange/yellow left border
- Subtle background gradient
- Helps you quickly find where you left off

**Completed Exercises (Grayed Out):**
- Exercises where you've logged 3+ sets
- Automatically gray out but remain visible
- Shows you've finished that exercise
- Can still add more sets if needed

**Set Counter Badge:**
- Shows "X/3 sets" under each exercise name
- Green when in progress
- Gray when completed (3+ sets)
- Updates in real-time as you log

**Today's Sets Display:**
- Shows all sets logged today for each exercise
- Example: "Today: Set 1: 10 reps × 25 lbs | Set 2: 10 reps × 25 lbs"
- Updates immediately after logging
- Helps you track your progress through the workout

### Session Management

#### Smart Workout Suggestion (NEW in v1.2)

The app automatically suggests which workout (A or B) you should do next based on your alternating pattern.

**How it works:**
- Tracks your last completed workout (A or B)
- Suggests the opposite workout when you open the app
- Shows "🎯 Next" badge on the suggested workout
- Displays "Up next: Workout B" text above the buttons
- Auto-highlights the suggested workout with a green border

**Visual indicator:**
```
Last workout: Workout A (Yesterday)
💪 Up next: Workout B

[Workout A]  [Workout B 🎯 Next] ← highlighted
```

**Perfect for alternating schedules:**
- Works great if you strictly alternate A/B
- Handles rest days automatically (only tracks actual workouts)
- Ignores non-logged activities (runs, gyrotonic, etc.)
- Updates after you click "Finish Workout"

**Easy override:**
- Just click the other workout button if the suggestion is wrong
- No extra steps required
- Selection persists if you close and reopen the app

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
- Visual states (all exercises reset to active)

**What it keeps:**
- All logged data (synced to Google Sheets)
- Your workout configuration
- Historical "Last workout" data

## Claude AI Chat Feature (NEW in v1.1)

### What It Does
Get encouragement, ask form questions, or chat about your workout while you train!

### How to Use
1. Click the **Chat** tab
2. Type your message (e.g., "Give me some encouragement!" or "How do I improve my bench press form?")
3. Hit Send
4. Claude responds with helpful, concise advice

### Setup Required
To enable the chat feature, you need to:
1. Get an Anthropic API key from https://console.anthropic.com/settings/keys
2. Add it as an environment variable in Railway: `ANTHROPIC_API_KEY`
3. Redeploy your backend

**Cost:** Very affordable for personal use (~$0.50-$1/month for typical usage)

### Chat Examples
- "Give me some motivation!"
- "What's proper squat form?"
- "Should I increase weight or reps?"
- "How do I prevent shoulder pain during bench press?"

The chat is configured to give brief, encouraging responses perfect for quick reference during workouts.

## Workout Configuration

### Customizing Exercises
1. Go to **Settings** tab
2. Edit **Workout A Exercises** or **Workout B Exercises**
3. One exercise per line
4. Click **Save Configuration**

### Adding Doubled Weight Exercises
To add an exercise that uses doubled weights (like dumbbells):
1. Add it to your workout configuration normally
2. Edit the `DOUBLED_WEIGHT_EXERCISES` array in index.html (line ~983)
3. Redeploy

### Default Workouts

**Workout A** (9 exercises):
- Goblet Squats
- Band Pullaparts
- Kettlebell RDLs
- Flat Bench Press *(supports doubled weight)*
- Front & Side Shoulder Raises
- Incline or Cable Fly
- Calf Raises
- Pull-ups
- Ab Isometrics

**Workout B** (12 exercises):
- Incline/Decline Pushups or Pull-ups
- Hammer Pullovers
- Swiss Ball T, W, & M
- Shoulder Press (Purple Band) *(supports doubled weight)*
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
- **Unit**: lbs, kg, BW, Red Band, 2x25 lbs, etc.

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
   - Note: Doubled weights (2x25 lbs) use single dumbbell weight for volume calculations

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

1. **First set**: Enter full information (e.g., `30 kg` or `2x25`)
2. **Subsequent sets**: Just enter reps, leave weight blank
3. **Watch the visual cues**: Yellow border shows current exercise, gray shows completed
4. **Check the counter**: "2/3 sets" badge shows your progress
5. **Finish workout**: Click "Finish Workout" when done to reset everything

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

**Doubled Weight Dumbbells:**
```
Set 1: 10 reps, 2x25
Set 2: 10 reps, [blank] ← auto-fills 2x25 lbs
Set 3: 8 reps, 2x30     ← switches to 30lb dumbbells
```

### For Mixed Workouts

Each exercise has independent memory, so you can do:
- Weighted squats (kg)
- Bodyweight pull-ups (BW)
- Band exercises (red/blue/etc)
- Dumbbell exercises (2x25 lb)
- All in the same workout with no confusion

### For Supersets or Circuits

Log each exercise separately as you complete it. The app shows:
- Today's logged sets under each exercise
- Visual highlighting of current exercise
- Set counter showing progress

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

### "Last Workout" Shows Wrong Date
- Fixed in v1.1! Update to latest version
- If still having issues, clear browser cache and reload

### Lost Local Data
- Don't worry! Everything is in Google Sheets
- Just refresh the page to reload from Sheets
- Export CSV regularly as backup

### Chat Not Working
1. Check that `ANTHROPIC_API_KEY` is set in Railway environment variables
2. Verify you have credits in your Anthropic account (console.anthropic.com)
3. Check Railway logs for error messages
4. Ensure backend is deployed and running

### Visual States Not Updating
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Ensure you're using the latest version of index.html

## Technical Details

### Architecture
- **Frontend**: Single-page HTML/CSS/JS application
- **Backend**: Node.js/Express server on Railway
- **Database**: Google Sheets via Google Sheets API v4
- **Auth**: OAuth 2.0 with Google Identity Services
- **AI**: Anthropic Claude API via backend proxy

### URLs (Configuration)
- Frontend: `https://dcworkouts.netlify.app`
- Backend: `https://workout-tracker-backend-production-c138.up.railway.app`

### API Endpoints
- `GET /auth/url` - Generate OAuth URL
- `GET /auth/callback` - Handle OAuth callback
- `GET /auth/check` - Verify session
- `POST /auth/logout` - End session
- `POST /sheets/create` - Create new spreadsheet
- `GET /sheets/:id/data` - Load workout data
- `POST /sheets/:id/entry` - Add workout entry
- `POST /chat` - Send message to Claude AI

### Storage Limits
- Google Sheets: 5 million cells per spreadsheet (effectively unlimited for workout data)
- Browser localStorage: 5-10MB per domain (thousands of workouts)
- No row limits or entry limits

### Privacy & Security
- Your Google credentials never touch the frontend
- OAuth tokens stored securely on Railway backend
- Anthropic API key never exposed to frontend
- Only you can access your workout data
- App is in "Testing" mode - only approved testers can use it

## Files in This Repository

- `index.html` - Frontend application
- `server.js` - Backend API server
- `package.json` - Node.js dependencies
- `README.md` - This file
- `DEPLOYMENT_GUIDE.md` - Deployment instructions

## Version History

**v1.2** (January 2026)
- Added smart workout suggestion feature (automatically suggests A or B based on alternating pattern)
- Added visual "🎯 Next" badge on suggested workout
- Added "Up next" text display showing which workout is recommended
- Improved workout selection UI with suggestion highlighting
- Recalculates suggestion after finishing workout

**v1.1** (January 2026)
- Added visual progress indicators (grayed out completed exercises, highlighted current exercise)
- Added set counter badges showing X/3 sets
- Added real-time "today's sets" display under each exercise
- Added Claude AI chat feature via backend integration
- Added doubled weight support (2x25 format) for dumbbell exercises
- Fixed blue band recognition bug
- Fixed timezone bug in "last workout" display
- Improved smart weight input with better previews

**v1.0** (Initial release)
- Basic logging with Google Sheets sync
- Smart weight input parsing
- Per-exercise unit memory
- Session management with Finish Workout
- Analysis charts and metrics
- Multi-device support

## Support & Feedback

### Reporting Issues
Since this is a personal project, there's no formal issue tracker. Common issues and solutions are documented in the Troubleshooting section above.

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
- Anthropic Claude API

---

**Current Version:** v1.2  
**Last Updated:** January 2026  
**Deployed at:** https://dcworkouts.netlify.app
