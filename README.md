# PPL Workout Tracker

A personal Push/Pull/Legs workout log. Single user, no accounts, no backend —
everything is stored on your own device.

- **Calendar** — month grid with a coloured block per workout (Push red, Pull blue,
  Legs light yellow, Abs light green, Cardio light gray). Abs and cardio are their
  own workouts and get their own smaller blocks.
- **Workouts** — each one is a reusable list of exercises. Sets, reps and weight are
  entered when you log. Each exercise opens with last time's numbers as ghosts behind
  empty fields: tap **+** once to take them as-is, or type over them. Whatever you
  enter turns solid, so you can see what you've done today. Lock a finished exercise
  to freeze it.
- **Stats** — per-exercise progression, weekly volume, and training frequency against
  a weekly target.

Installable as a PWA: open the site on your phone, Share → Add to Home Screen.

## Running it

No build step and no dependencies. Serve the folder over HTTP:

```
python tools/serve.py 8643
```

Then open <http://localhost:8643>. (`tools/serve.py` sends no-cache headers so edits
show up immediately; any static server works.)

## Layout

```
index.html            app shell
styles.css            design tokens + components
manifest.webmanifest  PWA manifest
sw.js                 offline shell cache
js/
  app.js              router, boot, storage warnings
  storage.js          storage probe + adapter
  store.js            state, persistence, migrations, selectors
  calendar.js         month grid
  editor.js           logging screen
  templates.js        first-run setup + workout builder
  session.js          session detail
  stats.js            stats panels
  charts.js           hand-rolled SVG charts
  settings.js         settings, backup, restore
  ui.js               sheets, toasts, icons
  exercises.js        seeded exercise library
tools/
  serve.py            no-cache dev server
  make_icons.py       generates the PWA icons (stdlib only)
  build_single.py     inlines everything into dist/ as one file
```

## Data

State lives in one `localStorage` key. The app checks at startup whether storage is
actually durable and warns you if it isn't — inside a framed preview, browsers
partition and clear that storage, so a hosted copy is the one to rely on.

Export and import JSON backups from Settings. If saved data ever fails to load, the
app stops writing and offers to download the original rather than overwriting it.
