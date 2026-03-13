# Workout Tracker

A personal workout tracking app that syncs automatically to Google Sheets. Built for fast, efficient logging during workouts with smart input parsing, real-time cloud backup, and progress tracking.

## Features

- 📊 **Real-time Google Sheets sync** - Every set automatically saved to your spreadsheet
- 🧠 **Smart weight input** - Natural language parsing for weights, bands, and bodyweight
- 💪 **Per-exercise memory** - Pre-fills last used weight between sets
- 🎯 **Smart workout suggestion** - Automatically recommends Workout A or B based on your history
- 📱 **Mobile-first design** - Optimized for quick logging on your phone
- 📈 **Progress tracking** - Built-in analysis with rep progression and volume charts
- 🏆 **Peak weight display** - Shows your all-time heaviest weight per exercise
- 🔄 **Reload from Sheet** - Sync your data from Google Sheets at any time
- 🔢 **Doubled weight support** - Handles two-dumbbell exercises with `*` notation
- ↶ **Undo** - Remove last logged set from both local storage and Google Sheets
- 🔻 **Deload tracking** - Mark deload sessions for filtered analysis
- 🔒 **Your data, your control** - Everything stored in your own Google Sheet

## Quick Start

### Prerequisites
- Google account
- Railway account (free tier)
- GitHub account (hosting via GitHub Pages)

### Setup (15-20 minutes)
Follow the detailed instructions in `SETUP_GUIDE.md`

## Current Workout Configuration

### Workout A
```
Goblet Squats
Band Pullaparts overhand
Band Pullaparts underhand
Kettlebell RDLs
Flat Bench Press*
Seated Leg Cable Extensions Left
Seated Leg Cable Extensions Right
Calf Raises
Lat Raise Front Side Superset*
Ab Isometrics
Face Pulls
Cable Fly
```

### Workout B
```
Decline Pushups
Hammer Pullovers
Swiss Ball T, W, & M
Shoulder Press
Curls
Band Pullaparts (Palms Up)
Band Pullaparts (Palms Down)
Lat Raise Front/Side Superset*
Tricep Pulldowns
Bottoms Up KB Holds*
Face Pulls
Ab Iso Work
```

## Smart Weight Input Guide

### Basic Input Examples

| You Type | It Logs As | Notes |
|----------|-----------|-------|
| `25` | 25 lbs | Defaults to lbs for plain numbers |
| `25 lbs` | 25 lbs | Explicit unit |
| `15 kg` | 15 kg | Explicit kilograms |
| `15 k` | 15 kg | Auto-completes kg |
| `BW` | Bodyweight | No weight tracked |
| *(leave blank)* | *See Smart Defaults* | Copies last set |
| `NA` | Not tracked | For exercises without weight |
| `red` | Red Band | Band resistance |
| `blue` | Blue Band | |
| `purple` | Purple Band | |
| `8 kg` | 8 kg | For KB Holds - app doubles for display |
| `2 x 25 lb` | 2×25 lbs | Doubled weight |
| `25 lb x 2` | 2×25 lbs | Also works! |

### Supported Band Colors
Red, Blue, Black, Green, Purple, Yellow, Orange

### Smart Defaults (Within a Session)

The app pre-fills the last used weight between sets:

```
Set 1: 10 reps, 30 kg     → Logs: 10 reps × 30 kg
Set 2: 10 reps, (blank)   → Logs: 10 reps × 30 kg  ✨ pre-filled
Set 3: 8 reps,  (blank)   → Logs: 8 reps × 30 kg   ✨ pre-filled
Set 4: 10 reps, 35        → Logs: 10 reps × 35 kg  ✨ remembers kg unit
```

**Important:** Always clear the pre-filled value before typing a new weight to avoid combining values.

## Exercise Types

### Regular Exercises
Standard reps + weight tracking. Most exercises.

### Timed Exercises (seconds only)
- Ab Isometrics
- Ab Iso Work

### Timed + Weight Exercises
- Bottoms Up KB Holds* - Enter seconds in reps field, weight per KB in weight field
- Display: "45s @ 2×8 kg"

### Starred Exercises (Doubled Weight)
Mark with `*` for two-dumbbell/two-kettlebell exercises. Input per-hand weight, app doubles for total and display.

## Peak Weight Display

Every exercise shows your all-time heaviest weight:
```
Flat Bench Press*
Last: 10 reps × 50 lbs, 10 reps × 50 lbs
💪 Peak: 12 reps × 65 lbs (Jan 20)
```

Only shows for numeric weights (not bands or bodyweight). Great reference after deload periods.

## Deload Tracking

Check **"🔻 This is a deload session"** when starting a workout to flag all sets as deload. Auto-resets after finishing workout. Stored in Google Sheets column G for analysis filtering.

## Undo Feature

After logging a set, tap **↶ Undo Last Set** to:
- Remove from local history
- Mark as "Deleted" in Google Sheets column H (filtered out automatically)

Only the most recently logged set can be undone.

## Smart Workout Suggestion

Suggests alternating A/B based on your last completed workout:
```
[Workout A]  [Workout B 🎯 Next] ← highlighted
```

## Google Sheets Structure

| Column | Field | Notes |
|--------|-------|-------|
| A | Date | ISO format: `2026-01-29T12:28:32.530Z` |
| B | Workout | A or B |
| C | Exercise | |
| D | Reps | Or seconds for timed exercises |
| E | Weight | |
| F | Unit | lbs, kg, Red Band, BW, etc. |
| G | Deload | Yes or blank |
| H | Deleted | Yes or blank (used by Undo) |

## Data Management

### Multi-Device Usage
Spreadsheet ID is hardcoded as default - just sign in on any device and you're connected automatically.

### CSV Export
Settings → Export to CSV. Dates in ISO format matching Google Sheets for easy copy/paste.

### Reload from Sheet
Settings → Reload from Sheet replaces local data with Google Sheet data. Use if devices get out of sync.

## Claude/AI Summary Endpoint

A read-only endpoint that returns a plain-text summary of your complete workout data. Designed for fetching by Claude or any AI assistant to give it full context on your training history.

### Endpoints

**Health check** (no key required):
```
GET /summary/health
```
Returns whether credentials and configuration are ready. Use this first to verify setup.

**Summary** (key required):
```
GET /summary?key=YOUR_KEY
```

### Query Parameters

| Parameter | Options | Default | Description |
|---|---|---|---|
| `mode` | `full`, `recent`, `prs`, `exercise` | `full` | What to include |
| `months` | 1–120 | all-time | Limit data to last N months |
| `sessions` | 1–50 | 10 | Number of recent sessions to show |
| `since` | `YYYY-MM-DD` | none | Limit data after this date (wins over `months`) |
| `deload` | `exclude`, `only` | include all | Filter deload sessions |
| `name` | exercise name | none | Required for `mode=exercise` |

### Mode Reference

| Mode | Returns |
|---|---|
| `full` | Recent sessions + all PRs + exercise history + trends |
| `recent` | Last N sessions only |
| `prs` | All-time personal records per exercise |
| `exercise` | Deep dive on one exercise — full history, all sessions |

### Example URLs

```
# Full summary (all time)
/summary?key=KEY

# Last 3 months only
/summary?key=KEY&months=3

# Just PRs, excluding deload sessions
/summary?key=KEY&mode=prs&deload=exclude

# Cable Fly deep dive, last 6 months
/summary?key=KEY&mode=exercise&name=Cable+Fly&months=6

# Last 20 sessions
/summary?key=KEY&mode=recent&sessions=20

# Everything since January 1
/summary?key=KEY&since=2026-01-01
```

### Setup Requirements

Three Railway environment variables needed:
1. `SUMMARY_API_KEY` — your secret key
2. `SUMMARY_SPREADSHEET_ID` — your sheet ID
3. `GOOGLE_SERVICE_ACCOUNT_JSON` — Google Service Account JSON key (see `.env.example`)

### Notes
- Responses are cached for 60 seconds per unique parameter combination
- Rate limited to 30 requests per IP per minute
- First request after Railway inactivity may take 10–20 seconds (cold start) — hit `/summary/health` first to warm it up
- Returns plain text, optimized for AI consumption

---



### Metrics (per exercise)
- Total Volume (last session vs previous, % change)
- Max Reps (single set PR, date and weight)
- Personal Record (max weight, date)
- Total Workouts and Sets

### Charts
- Rep Progression (bar chart, last 8 workouts)
- Volume Over Time (grid, last 10 workouts)

### Exercise Grouping
Automatically strips parentheticals and asterisks for analysis:
- `Face Pulls (10 lb)` and `Face Pulls (20 lb)` → analyzed as `Face Pulls`
- `Flat Bench Press*` → shown as `Flat Bench Press`

## Known Issues & Future Enhancements

### 🐛 Open Bugs
1. **Doubled-weight display formatting in summary** — exercises like Swiss Ball TWM show `8×6 2×3 lbs` instead of clean formatting. Cosmetic only, data is correct.
2. **Ab Isometrics shows "reps" instead of "seconds"** — label issue in summary endpoint only.
3. **Deload checkbox not persisting across page reloads** — if the app refreshes mid-workout, the deload flag resets. Fix: save checkbox state to localStorage.

### 🔮 Future Enhancements
1. **Trend calculation should account for weight changes** — currently compares avg reps only. A rep drop due to a weight increase should not read as "declining".
2. **Case-insensitive exercise name deduplication** — "KB floor Press" and "KB Floor Press" are tracked separately. Need normalization on data entry or a merge tool.
3. **Band resistance tracking** — add resistance values per band color to enable volume calculation for band exercises. Values need to be user-configured (different brands/thicknesses).
4. **Pre-deload weight hints** — after a deload session, show "Pre-deload: 10 reps × 60 lbs (Jan 15)" alongside the regular Last: display to help return to prior weights.
5. **Coros running data integration** — add running data from Coros watch to the summary endpoint via third-party MCP.

---

## For Claude Instances — How to Use This App's Data

If you are a Claude instance talking to Dave about his training, fetch his complete workout history using this endpoint before responding to any training-related question.

### Step 1 — Warm up (if app has been idle)
```
GET https://workout-tracker-backend-production-c138.up.railway.app/summary/health
```
If `"status": "ready"`, proceed. Railway can take 10–20 seconds to wake from inactivity.

### Step 2 — Fetch the data you need

**Default (full picture):**
```
https://workout-tracker-backend-production-c138.up.railway.app/summary?key=56d4a180adc1b9c9646ca897886d9dfb852b71128de36897e876a2dd53e91d03
```

**Tailor to the question:**

| Dave asks... | URL to fetch |
|---|---|
| "How have I been doing lately?" | `&mode=recent&sessions=5` |
| "What are my current PRs?" | `&mode=prs` |
| "How is my Cable Fly progressing?" | `&mode=exercise&name=Cable+Fly` |
| "How was my training this month?" | `&mode=full&months=1` |
| "Ignore deload sessions" | `&deload=exclude` |
| Full picture for program planning | `&mode=full` (default) |

### Key things to know about Dave's training
- Alternating **Workout A** and **Workout B**, 2–4x per week
- Exercises marked `*` use **doubled weights** — weight shown is total load (two dumbbells/kettlebells)
- **Band exercises** (Blue Band) have no numeric weight — excluded from PRs
- **Timed exercises** (Ab Isometrics, Bottoms Up KB Holds) use seconds in the reps field
- **Deload sessions** are flagged — use `&deload=exclude` for true performance trends
- Data goes back to **January 8, 2026**

### Known data quirks to interpret correctly
- "KB floor Press" and "KB Floor Press" are the same exercise (capitalization bug — being fixed)
- A trend showing "declining" on an exercise **may mean a weight increase**, not regression — always check recent session weights before drawing conclusions
- Band Pullaparts have two variants: **(Palms Up)** and **(Palms Down)** — tracked separately, correctly

---

## Troubleshooting

### "Sync Error" Status
1. Check internet connection
2. Sign out and back in (Settings → Sign Out)

### Data Out of Sync
Settings → Reload from Sheet

### Spreadsheet Not Connecting
1. Settings → Connect to Existing Sheet
2. Paste: `1mvQLF5tHtR_ivU_aKfyIX54irHlGZCvdlxqJAt8KHh0`
3. Click Connect

### Weird Analysis Results
May be phantom sets from old undo bug. Add "Yes" to column H for those rows in Google Sheets.

## Technical Details

### Architecture
- **Frontend**: Single-page HTML/CSS/JS (`index.html`) on GitHub Pages
- **Backend**: Node.js/Express (`server.js`) on Railway
- **Database**: Google Sheets API v4
- **Auth**: OAuth 2.0

### URLs
- **Frontend:** `https://extraface.github.io/workout-tracker-backend/`
- **Backend:** `https://workout-tracker-backend-production-c138.up.railway.app`
- **Repository:** `https://github.com/extraface/workout-tracker-backend`

### Cost
- GitHub Pages: Free, unlimited deploys
- Railway: ~$1/month (within $5/month free credit)
- **Total: $0/month**

### Making Changes
- Frontend: Edit `index.html`, push to GitHub → auto-deploys
- Backend: Edit `server.js`, push to GitHub → Railway auto-deploys
- Workouts: Edit in app Settings (no code needed)

## Files

- `index.html` - Frontend application
- `server.js` - Backend API server
- `package.json` - Node.js dependencies
- `SETUP_GUIDE.md` - Deployment instructions
- `WORKOUT_TRACKER_UPDATES_2026-02-13.md` - Session notes Feb 13 2026
- `README.md` - This file

## Version History

**v2.17** (March 2026) - Add Weight(kg) column for cross-unit weight comparison

**v2.16** (March 2026) - Undo now permanently deletes rows instead of marking as deleted

**v2.15** (March 2026) - Reload from Sheet now also reloads workout configuration from Config tab

**v2.14** (February 2026) - Fix logout to preserve hardcoded spreadsheet ID

**v2.13** (February 2026) - Workout config now stored in Google Sheets Config tab, auto-initialized from recent workouts

**v2.12** (February 2026) - Fixed logout to preserve hardcoded spreadsheet ID

**v2.11** (February 2026) - Fixed peak weight logic to show max reps at max weight, added auto-select on focus to prevent concatenation

**v2.10** (February 2026) - Hardcoded spreadsheet ID as default

**v2.9** (February 2026) - Updated exercise defaults, pre-fill weight inputs to prevent concatenation bug

**v2.8** (February 2026) - Added peak weight display per exercise

**v2.7** (February 2026) - Fixed undo to mark entries as deleted in Google Sheets, added Deload/Deleted columns

**v2.6** (February 2026) - Fixed Connect to Existing Sheet error handling

**v2.5** (February 2026) - Added "Connect to Existing Sheet" in Settings

**v2.4** (February 2026) - CSV export uses ISO date format

**v2.3** (February 2026) - Fixed CSV date format column splitting

**v2.2** (February 2026) - KB Holds weight+time input, band color display fix, deload checkbox

**v1.8** (January 2026) - Fixed doubled weight storage and display

**v1.7** (January 2026) - Analysis shows only logged exercises, fixed band color in History

**v1.5** (January 2026) - Reload from Sheet, smart workout suggestion, enhanced weight parsing

**v1.0** - Initial release: Google Sheets sync, smart weight input, analysis charts

## License

Personal project - use as you wish!

## Credits

Built with Google Sheets API, Railway, GitHub Pages, Express.js, Google OAuth 2.0

---

**Current Version:** v2.10
**Last Updated:** February 2026
**Deployed at:** https://extraface.github.io/workout-tracker-backend/
