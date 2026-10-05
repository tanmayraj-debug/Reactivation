# Put this online (no terminal needed)

You need three free accounts: GitHub, Render, and (already have) your API keys.

## Step 1: Put the code on GitHub
1. Go to github.com, sign up, click "New repository", name it `waba-platform`, keep it **Private**.
2. Click "uploading an existing file", drag in the CONTENTS of the unzipped
   waba-platform folder (not the zip itself), click "Commit changes".

## Step 2: Deploy on Render
1. Go to render.com, sign up with your GitHub account.
2. Click New > Blueprint, pick your `waba-platform` repository.
3. Render reads `render.yaml` and shows a form. Paste each key it asks for
   (TimesMobile, LeadSquared, Anthropic, your WhatsApp number, email settings).
   Leave PUBLIC_BASE_URL empty for now.
4. Click Apply. Wait about 5 minutes for the first build.

## Step 3: Tell it its own address
1. Render shows your address, like https://waba-campaign-platform.onrender.com
2. In Render > your service > Environment, set PUBLIC_BASE_URL to that address.
   Save (it restarts automatically).

## Step 4: Connect TimesMobile
In the TimesMobile panel (per their Webhook_configuration doc), set:
- MESSAGE webhook   -> <your address>/webhook/timesmobile/inbound
- STATUS webhook    -> <your address>/webhook/timesmobile/status
Template approval updates -> <your address>/webhook/timesmobile/template-status
Ask TimesMobile support to confirm which URL the template-status webhook uses.

## Step 5: Use it
Open your address in any browser, create the first login, done.
Share the address with your team and add their logins from inside the tool.

## Notes
- Cost: Render's "starter" plan is roughly $7/month plus about $0.25/month
  for the 1 GB disk. A persistent disk is required so your data survives restarts.
- Everyone gets logged out when the service restarts or redeploys (sessions are
  held in memory). That is only an inconvenience, no data is lost.
- Back up: Render > Disks lets you download snapshots of the database.
