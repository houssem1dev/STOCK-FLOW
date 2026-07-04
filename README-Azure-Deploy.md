Azure automatic deploy (one-step)

This repository includes a GitHub Actions workflow that builds and deploys the .NET backend to Azure App Service automatically on push to `main`.

What you need to do (one-time):

1. Create an Azure Web App (App Service) that supports your .NET runtime. Note the **App name** (it must be unique).

2. In the Azure Portal, go to your Web App -> Get publish profile -> Download. Open the downloaded `.PublishSettings` file and copy its full XML content.

3. In your GitHub repo, create two secrets:
   - `AZURE_WEBAPP_PUBLISH_PROFILE` -> paste the full content of the publish profile file.
   - `AZURE_APP_NAME` -> the App Service name (the value shown in Azure).

4. Push to `main` and the workflow will run automatically and deploy your app.

After deployment

- Your backend will be available at `https://<your-app-name>.azurewebsites.net`.
- Update the frontend (Vercel) to set `window.API_BASE = 'https://<your-app-name>.azurewebsites.net'` before loading `stock-dashboard.js`.

CORS

- Make sure to allow your Vercel domain in the Web App CORS settings or add it via Azure CLI:

```bash
az webapp cors add --resource-group <rg> --name <app-name> --allowed-origins https://<your-vercel-domain>
```

Security

- Store your database connection string in the Web App Configuration (Connection strings) — do not hardcode it in code.

If you want, I can also add a small script in `stock-dashboard.html` that reads `window.API_BASE` from an environment-injected value; or I can attempt to automate the Vercel environment variable update if you provide a Vercel token (not recommended to share publicly).