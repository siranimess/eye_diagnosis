# How this project is made

This guide explains the implementation in a sensible build order. Start with `README.md` to install and run the complete source. You do not need to recreate the files manually.

## 1. Translate the screenshot into requirements

The reference describes a Next.js/React interface, FastAPI/Python server, Claude vision integration, patient context entry, and structured reports that can be copied or printed. The supplied code implements those features as a local educational prototype.

The screenshot's severity rating is an **unvalidated tentative concern category**, not a calibrated clinical score. Differential diagnoses are tentative possibilities with confirmation requirements. A generic vision model cannot establish clinical validity merely because its response is formatted like a medical report.

There is no training pipeline here: this is an application integrating an existing multimodal model. Demo mode deliberately returns no invented image findings.

## 2. Architecture and files

| File | Responsibility |
|---|---|
| `frontend/app/layout.jsx` | Root HTML, metadata, stylesheet import |
| `frontend/app/page.jsx` | Form, image preview, requests, report, copy/download/print |
| `frontend/app/globals.css` | Responsive layout, controls, print stylesheet |
| `frontend/package.json` | Dependencies and dev/build/start commands |
| `frontend/package-lock.json` | Exact resolved JavaScript dependency tree |
| `backend/main.py` | API routes, schemas, image validation and Claude integration |
| `backend/requirements.txt` | Python dependencies |
| `backend/tests/test_api.py` | Automated API boundary tests |
| Environment examples | Backend URL, demo/live mode, model and secret settings |

The sequence is: browser form → multipart POST → validated Python context → decoded image → demo response or Claude request → validated report → browser display/export.

The backend holds the API secret. The frontend never contacts Anthropic directly.

## 3. Start with the backend and health endpoint

Create the backend folder and requirements file, then install dependencies in a virtual environment. FastAPI defines HTTP routes; Uvicorn runs the server. Pydantic validates data, Pillow handles image pixels, HTTPX makes provider requests, python-multipart parses file uploads, python-dotenv loads `.env`, and pytest runs tests.

`app = FastAPI(...)` constructs the application. `@app.get('/health')` registers a route returning a status and actual mode. Test this route before the frontend so you can distinguish a stopped backend from a React issue.

CORS permits the configured browser origin. An origin includes scheme, hostname, and port. `http://localhost:3000` and `http://127.0.0.1:3000` differ. CORS is not authentication; non-browser clients are not prevented from sending requests by that configuration.

## 4. Define request and response schemas

The `Context` Pydantic class defines the accepted input. It requires age, laterality, image type, and acknowledgment. It bounds age and IOP, limits note lengths, and restricts dropdown values. Optional IOP is `None` when absent, so missing pressure is not misrepresented as zero.

`extra='forbid'` rejects unknown fields. The backend checks symptom values against its known list as well. A checkbox is not an anonymizer or a compliance mechanism; it communicates the expected data handling.

The `Report` model defines image quality, observations, tentative concern, differential possibilities, follow-up, and limitations. Each `Differential` contains a condition, reasoning, and confirmation needed. The server accepts only known quality/concern values and limits list sizes.

Schema validation verifies structure, not clinical truth. A perfectly valid JSON object can still contain an incorrect claim.

## 5. Receive the multipart request

`POST /analyze` takes `image: UploadFile` and `context: str`. The image is binary, while context is a JSON string in a normal multipart form field. `Context.model_validate_json(context)` turns that string into validated structured data.

The handler bounds context length and reads at most 5 MiB plus one byte of the upload, enabling oversized-file detection. The upload is closed in a `finally` block. Multipart parsing happens before the handler and can spool files to temporary storage; a public deployment would require gateway-level request limits too.

No database, permanent upload folder, or patient history is implemented.

## 6. Verify image bytes rather than trusting extensions

The browser's `accept` attribute is a convenience. It does not prove a file is an image. `normalize_image` uses Pillow to inspect and fully decode the actual bytes.

It rejects unsupported formats, animated files, tiny images, decompression bombs, and corrupted data. It supports static JPEG, PNG, and WebP. A 20-megapixel limit bounds image decoding.

It applies EXIF orientation, converts pixels to RGB, resizes within 1568 × 1568 preserving aspect ratio, and pastes onto a fresh canvas. Saving that canvas as JPEG removes copied EXIF and other metadata. **Visible text burned into pixels remains.** Users must de-identify the image before upload.

Resizing and compression can lose clinical detail. These are prototype transport choices, not validated medical image-processing steps.

## 7. Connect to Claude

`generate_report` reads `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` only on the server. A live request cannot proceed without both.

The function posts to `https://api.anthropic.com/v1/messages` with authentication and API-version headers. The payload includes a system prompt, a maximum output length, and a user message with two parts:

1. An image block containing base64-encoded JPEG data.
2. A text block containing validated patient context.

Base64 represents binary bytes as text so they fit inside JSON. It is not encryption; HTTPS secures transport.

The system prompt embeds `Report.model_json_schema()`. It asks the model to distinguish observed features from reported symptoms, avoid definitive diagnoses and prescriptions, and abstain when the image cannot support an assessment. It instructs the model to treat notes and text inside images as data, not commands. This is a mitigation, not a guarantee against prompt injection or medical errors.

The code uses ordinary JSON output and local validation, rather than a provider-specific constrained-output feature. It accepts only a normal completed response that parses against the full schema. It does not extract fragments, repair JSON, or show partial answers. Invalid, refused, or truncated results yield an error.

For an ungradable image, a deterministic backend rule clears observations and differentials and changes concern to indeterminate, even if the model returned inconsistent findings.

## 8. Handle timeouts and provider errors

HTTPX has a 60-second timeout. The frontend allows 75 seconds. A provider rate limit produces a retry-later message; timeouts return 504; other provider or report-validation failures return 502. Missing configuration returns 503.

Raw upstream errors are not exposed to the browser, reducing accidental sensitive-data disclosure. The code does not automatically retry paid model requests; the user can retry explicitly.

Demo mode is never used as a silent fallback for a failed live call. The response always includes its actual mode.

## 9. Build the React client page

The page starts with `'use client'` because it uses browser events and APIs. It stores these values with `useState`:

| State | Purpose |
|---|---|
| `form` | Entered context and symptom selections |
| `file` / `preview` | File object and local preview URL |
| `data` | Successful server response |
| `busy` | Lock inputs during a request |
| `error` / `notice` | Failure and export feedback |
| `mode` | Server-reported demo/live status |

Inputs are controlled: React state supplies their values and `onChange` updates state. The `update` function also clears the old report. Changing an image clears it too, preventing a report from being mistaken for analysis of newly edited data.

Symptom buttons use `aria-pressed` to expose selection state to assistive technology. The file preview uses `URL.createObjectURL`, which does not upload the image. Effect cleanup revokes old URLs to avoid accumulating browser resources.

A health-check effect loads the initial backend mode. Failure displays Backend offline. A successful analysis updates the mode from the actual response.

## 10. Submit the form

The submit handler prevents page reload and performs a basic file check. It creates `FormData`, appends the image, serializes context, then sends the POST request with `fetch`.

Do not manually set the multipart Content-Type header: the browser generates the correct boundary between fields. A manually supplied header commonly breaks upload parsing.

HTML number inputs still return strings. The handler converts age and pressure to numbers. Blank pressure becomes `null`; blank acuity becomes “Not provided.” The model is never asked to fabricate those measurements.

The entire form fieldset is disabled during the request, preventing edits while an old-context response is arriving. Errors clear the loading state and display a readable message.

## 11. Display and export the report

The report shows the server-returned context, timestamp, disclaimer, and demo/live label. It displays image quality, concern level, observations, differential possibilities, follow-up, and limitations. Empty findings are explicit rather than filled with invented content.

React renders model output as strings instead of inserting raw HTML. This avoids treating a model response as executable markup.

`reportText` formats the same response for export. Copy uses the browser clipboard API. Download uses a text Blob and a temporary download link. Printing uses `window.print()`; the browser can save to PDF. The print stylesheet hides the form and buttons, preserving the report's disclaimer and mode. There is no server-side PDF generator.

Exported files and clipboard content persist wherever the user puts them, even though the app itself has no database.

## 12. Add the responsive visual design

The outer workspace uses two CSS Grid columns. It switches to one at 850 pixels. The inner form grid becomes one column on particularly small screens. The design uses a muted green palette, clear section labels, amber limitation notices, and a distinct report card.

Focus outlines support keyboard navigation. System fonts avoid external font downloads. Print-specific CSS simplifies the page to the report.

## 13. Test boundaries before presentation

The included API tests cover valid demo output, disguised non-image uploads, oversized files, invalid context, missing acknowledgment, unknown symptoms, warning alerts independent of model output, missing live configuration, invalid mocked model output, and ungradable-response cleanup.

The tests stub provider requests and do not spend API credits. They remove proxy environment variables inside the test fixture so local mocks do not depend on the machine's proxy configuration. Application proxy behavior is unchanged.

Run pytest from the backend folder. Run `npm run build` from the frontend folder. Compilation confirms the app can be built; it does not prove clinical accuracy or replace a browser walkthrough.

For manual testing, use synthetic/de-identified material. Verify desktop and mobile layouts, switching images, clearing old reports, invalid files, copy/download, and print preview. Enable live mode only with your own key and an available model ID.

## 14. Describe it accurately in interviews

A truthful description is: “I built a Next.js and FastAPI prototype that accepts eye images and patient context, sends validated inputs to Claude's vision API, and formats a schema-validated draft for clinician review. I added an explicit demo mode, input validation, failure handling, and copy/print exports. It is not clinically validated.”

Do not claim you trained the model, measured diagnostic accuracy, deployed in a hospital, or improved patient outcomes unless you actually performed that work.

## 15. Extend it

Useful portfolio additions include multi-image support with explicit per-eye labels, authorized evaluation cases, and expert-reviewed output comparisons. A clinical product would require intended-use definition, representative clinical evaluation, access controls, audit logging, rate limits, secure retention/deletion controls, monitoring, privacy review, and applicable regulatory review. A disclaimer alone supplies none of these.

To begin version control, run from the project root:

```bash
git init
git add .
git status
git commit -m "Build eye review assistant prototype"
```

Review staged files before committing. Never commit credentials or patient images. Create an empty GitHub repository and use the actual remote URL GitHub provides.

## Reference documentation

- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Claude vision: https://platform.claude.com/docs/en/build-with-claude/vision
- FastAPI file uploads: https://fastapi.tiangolo.com/tutorial/request-files/
- Pydantic models: https://docs.pydantic.dev/latest/concepts/models/
- NEI retinal detachment: https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/retinal-detachment

The selected warning symptoms are an illustrative subset, not a complete triage system. Absence of those tags is not reassurance. Model availability changes; configure an ID available in your provider account rather than assuming a hard-coded model will remain available.
