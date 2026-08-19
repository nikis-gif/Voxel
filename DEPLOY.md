# Voxel Deployment

## Architecture

- GitHub Pages hosts only the static website (`index.html`, `config.js`, `assets/`).
- Render hosts the Node.js API and the Discord bot.
- The Discord bot token exists only as a Render environment variable and in your local `backend/.env`.

## 1. Upload this project to GitHub

Create a repository and upload the contents of this folder to the repository root.

Never upload `backend/.env`. The repository `.gitignore` already blocks it.

Do not enable GitHub Pages yet. First deploy the backend so the website has a public API URL.

## 2. Deploy the backend on Render

Create a new Blueprint in Render and connect the GitHub repository. Render reads `render.yaml` automatically.

Provide these values when prompted:

- `DISCORD_BOT_TOKEN`: your bot token.
- `SUPPORT_OWNER_ID`: your Discord user ID.
- `ALLOWED_ORIGINS`: your future GitHub Pages origin, for example `https://YOUR_GITHUB_USERNAME.github.io`.

After deployment, Render gives the API a public HTTPS URL similar to:

`https://voxel-support-api.onrender.com`

Test:

`https://YOUR_RENDER_URL/health`

The response should contain `"ok": true` and `"discordReady": true`.

## 3. Connect the website to the deployed API

Open `config.js` and set:

```js
var productionSupportApiUrl = "https://YOUR_RENDER_URL/api/support";
```

Commit and push the change to GitHub.

## 4. Enable GitHub Pages

In the GitHub repository:

1. Settings
2. Pages
3. Build and deployment
4. Source: Deploy from a branch
5. Branch: `main`
6. Folder: `/ (root)`
7. Save

GitHub will publish the site at a URL similar to:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`

## 5. Production check

Open the public GitHub Pages URL and submit a support ticket with one image.

Expected flow:

`GitHub Pages -> Render API -> Discord bot -> owner DM`

## Important

Render's Free web service can spin down after inactivity. That is acceptable for testing, but it is not an always-on production bot. Use a paid always-on Render instance or another persistent hosting plan when Voxel needs continuous Discord availability.
