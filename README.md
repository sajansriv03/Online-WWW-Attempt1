# Wacky Wacky West (Online Multiplayer)

This version supports **2-4 players online** in a shared room link.

## Run locally

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:3000/#ROOMID`.

## How room links work

- A room ID is in the URL hash (example: `/#ABC123`).
- Share the full URL with other players.
- Reconnect works by storing a seat token in browser local storage.

## Host controls

- Host chooses max players: 2, 3, or 4.
- Host starts game once enough players joined.

## Deployment (simple)

Deploy this repo to **Render** as a Web Service:

- Build command: `npm run build`
- Start command: `npm start`

After deploy, just share your Render URL with a room hash appended, e.g.:

`https://your-app.onrender.com/#ABC123`
