# Eye Diagnosis Assistant — complete educational prototype

A Next.js + React frontend and Python + FastAPI backend, with an optional Claude vision integration. The UI is named **Eye Review Assistant** to reflect its actual capability: generating an unvalidated draft for a clinician to review. This is runnable source, not a clinically validated diagnostic device.

**Start here:** follow the instructions below. **To understand every layer:** read `BUILD_GUIDE.md` after running demo mode.

## Features included

- Upload one fundus, slit-lamp, or external eye image (JPEG, PNG, WebP).
- Select OD (right eye), OS (left eye), or OU (both eyes).
- Enter age, sex, visual acuity, optional IOP, symptoms, and clinical context.
- One-click symptom buttons and immediate warnings for selected warning symptoms.
- Structured image quality, observations, tentative concern/severity, differentials, follow-up, and limitations.
- Copy, download text, and print/save PDF using the browser print dialog.
- Clear demo/live labels, loading states, errors, responsive styling, and keyboard-accessible controls.
- Server-side data validation and image decoding; backend-only API secret.
- No application database or patient record history.

## Requirements

Install Node.js 22 LTS (or a newer compatible LTS), Python 3.11+, and VS Code. You need two terminal windows. Demo mode needs no Anthropic account. Live mode needs an Anthropic API key with billing/access and a vision-capable model ID available to that account. A ChatGPT subscription does not supply this API key.

Extract this ZIP, open the `eye-diagnosis-assistant` folder in VS Code, then choose Terminal → New Terminal. Run commands from that folder unless a step changes directory.

## 1. Start the Python backend

### Windows PowerShell

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Using the virtual environment's Python directly avoids PowerShell activation-policy problems. Leave this terminal running.

### macOS/Linux

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/health. Expected response:

```json
{"status":"ok","mode":"demo"}
```

Interactive endpoint documentation: http://127.0.0.1:8000/docs.

## 2. Start the frontend

Open a **second terminal**, starting from the extracted project folder:

```bash
cd frontend
npm ci
```

Copy the environment template:

Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

macOS/Linux:

```bash
cp .env.local.example .env.local
```

Then:

```bash
npm run dev
```

Open **http://localhost:3000**. Keep both terminals running. If the browser uses `127.0.0.1:3000` instead, switch to `localhost:3000` or change the backend's `FRONTEND_ORIGIN` and restart it.

## 3. Try demo mode

1. Choose a non-sensitive test image at least 64 pixels on both sides, no larger than 5 MiB or 20 megapixels.
2. Choose the corresponding image type and laterality.
3. Enter a fictional age and optional context.
4. Select symptoms if applicable to the fictional case.
5. Check the acknowledgment box.
6. Click **Generate review draft**.
7. Confirm the result says **DEMO**, contains no diagnosis, and explains that the image was not analyzed.
8. Try Copy report, Download text, and Print / PDF.

Demo mode validates and decodes the image but returns a fixed demonstration response. It is intentionally not fake medical analysis.

## 4. Enable real Claude requests

Stop the backend with Ctrl+C. Edit `backend/.env`:

```dotenv
DEMO_MODE=false
ANTHROPIC_API_KEY=your_actual_api_key
ANTHROPIC_MODEL=your_available_vision_model_id
FRONTEND_ORIGIN=http://localhost:3000
```

Replace both placeholder values; do not paste the placeholders literally. Consult your Anthropic console/model documentation for an available model ID. The code does not silently select or substitute models.

Restart the backend using the same uvicorn command. Refresh the frontend. The badge should say **live**. A request now sends the normalized image and entered context to Anthropic and can incur API charges. The backend validates the returned JSON; malformed, truncated, or refused output produces an error rather than a report.

**Never put the secret in `frontend/.env.local` or any `NEXT_PUBLIC_` variable.** Those values can be visible to the browser. `.gitignore` excludes secrets.

## 5. Run checks

From `backend`:

Windows:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

macOS/Linux:

```bash
.venv/bin/python -m pytest -q
```

From `frontend`:

```bash
npm run build
npm start
```

Stop the frontend development server first if both would use port 3000. `npm start` requires a completed build. Python dependency ranges are declared; the frontend lockfile records the installed dependency tree.

## Troubleshooting

| Issue | Fix |
|---|---|
| Backend offline / Failed to fetch | Start FastAPI; verify `/health`; check frontend API URL and backend CORS origin. |
| npm or Python not found | Install prerequisites, then restart VS Code. |
| Port 3000 already in use | Stop the other process, or deliberately change port and `FRONTEND_ORIGIN`. |
| Missing live configuration (503) | Set key and exact model ID in backend `.env`; restart backend. |
| Provider failed (502) | Check model availability, API key/billing, connection, or retry. Invalid model output also yields 502. Raw provider errors are not exposed. |
| Timeout (504) | Retry later; check provider connectivity. No result was saved. |
| Invalid image (422) | Use an actual static JPEG/PNG/WebP with supported dimensions, not a renamed document. |
| Upload too large (413) | Export a smaller de-identified image. |
| Clipboard blocked | Use Download text or browser clipboard permissions. |
| Report disappeared after editing | Intentional: changing inputs clears the old result so it cannot be mistaken for the new case. |
| Changed frontend environment variable | Restart `npm run dev`; rebuild if using production mode. |

## Scope and privacy

Use locally with synthetic or de-identified material. No user accounts, role controls, rate limiting, audit trail, encrypted record storage, clinical validation, or regulatory/compliance certification is implemented. Do not expose this server publicly or use it for real patient care as supplied.

FastAPI may spool multipart uploads to temporary storage while parsing them. The handler closes the upload and creates no permanent image record. Browser state lasts until navigation/reload; copied/downloaded/printed reports persist wherever you place them. Images are decoded and re-encoded without metadata, but **burned-in patient identifiers are not removed**. In live mode, provider retention policies also apply. De-identification must happen before upload; the checkbox is not an anonymizer.

The symptom banner is a small illustrative rule, not a complete triage system. A report cannot establish that an eye is healthy. Independent clinical evaluation remains necessary. Follow-up text is model-generated and must be reviewed.

See `BUILD_GUIDE.md` for implementation details, extension steps, and source documentation.
