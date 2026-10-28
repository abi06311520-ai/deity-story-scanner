# Divine Story Scanner

A Flask web app that identifies Hindu deities from a camera image and creates
spoken stories in several Indian languages.

## Run locally

From `deity-story-scanner-src`, install the dependencies and start the app:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Set `GEMINI_API_KEY` in your environment or in a local `.env` file before using
the scan and story-generation features. Never commit the API key.

## Deploy on Render

This repository includes a `render.yaml` blueprint. Create a new Blueprint
Instance in Render from the GitHub repository, then set `GEMINI_API_KEY` when
prompted. Render will install the Python requirements and start the Flask app
with Gunicorn. The public website URL is shown in the Render dashboard after
the first deploy completes.
