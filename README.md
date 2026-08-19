# Voxel

Website and Discord support integration for Voxel.

## Structure

```text
.
├── assets/                 # Website branding
├── backend/                # Express API + Discord bot
├── .gitignore              # Blocks local secrets and dependencies
├── .nojekyll               # Serves the site directly on GitHub Pages
├── config.js               # Local/production support API endpoint
├── DEPLOY.md               # Deployment guide
├── index.html              # Website
└── render.yaml             # Render backend Blueprint
```

## Local development

Create `backend/.env` from `backend/.env.example`, then:

```bash
cd backend
npm install
npm start
```

Serve the repository root with Live Server on port `5500`.

## Deployment

Follow `DEPLOY.md`.

Never commit `backend/.env` or the Discord bot token.
