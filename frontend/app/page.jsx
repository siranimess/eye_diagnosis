'use client';
import { useEffect, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const symptoms = ['Blurred vision', 'Redness', 'Itching', 'Discharge', 'Light sensitivity', 'Eye pain', 'Sudden vision loss', 'New flashes', 'Sudden new floaters', 'Curtain or shadow'];
const redFlags = new Set(['Sudden vision loss', 'New flashes', 'Sudden new floaters', 'Curtain or shadow']);
const initial = { age: '', sex: 'Not provided', laterality: 'OD', image_type: 'Fundus', visual_acuity: '', iop: '', notes: '', symptoms: [], consent: false };
const labels = { age: 'Age', sex: 'Sex', laterality: 'Eye', image_type: 'Image type', visual_acuity: 'Visual acuity', iop: 'IOP (mmHg)', notes: 'Notes', symptoms: 'Reported symptoms' };
function reportText(data) {
  const r = data.report;
  return [data.disclaimer, `Mode: ${data.mode.toUpperCase()} | ${data.created_at}`, ...data.alerts,
    ...Object.entries(data.context).map(([k,v]) => `${labels[k] || k}: ${Array.isArray(v) ? v.join(', ') || 'None selected' : v ?? 'Not provided'}`),
    `Image quality: ${r.image_quality} — ${r.quality_reason}`, `Tentative concern: ${r.severity} — ${r.severity_reason}`,
    'OBSERVATIONS', ...r.observations, 'TENTATIVE DIFFERENTIALS',
    ...r.differentials.map(d => `${d.condition}: ${d.reasoning}\nConfirmation needed: ${d.confirmation_needed}`),
    'FOLLOW-UP FOR CLINICIAN REVIEW', ...r.follow_up, 'LIMITATIONS', ...r.limitations].join('\n\n');
}
export default function Home() {
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('Checking backend');
  useEffect(() => { fetch(`${API}/health`).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(v => setMode(v.mode)).catch(() => setMode('Backend offline')); }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function update(key, value) { setForm(f => ({ ...f, [key]: value })); setData(null); setNotice(''); }
  async function submit(e) {
    e.preventDefault(); setError(''); setNotice(''); setData(null);
    if (!file) { setError('Choose an image first.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be at most 5 MiB.'); return; }
    const payload = new FormData(); payload.append('image', file);
    payload.append('context', JSON.stringify({ ...form, age: Number(form.age), iop: form.iop === '' ? null : Number(form.iop), visual_acuity: form.visual_acuity.trim() || 'Not provided' }));
    setBusy(true);
    try {
      const response = await fetch(`${API}/analyze`, { method: 'POST', body: payload, signal: AbortSignal.timeout(75000) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Request failed. Check the form.');
      setData(result); setMode(result.mode);
    } catch (err) { setError(err.name === 'TimeoutError' ? 'Request timed out. Try again.' : err.message || 'Cannot reach backend.'); }
    finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(reportText(data)); setNotice('Report copied.'); } catch { setNotice('Clipboard unavailable. Use Download text instead.'); } }
  function download() { const url = URL.createObjectURL(new Blob([reportText(data)], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'eye-review-draft.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <main>
    <header><div><span className="eyebrow">VISION / REVIEW WORKSPACE</span><h1>Eye Review Assistant</h1><p>From an image to a structured draft for clinician review.</p></div><span className="badge">{mode}</span></header>
    <aside className="warning">Educational prototype • No clinical validation. Use only synthetic or de-identified data. This tool cannot diagnose or exclude eye disease.</aside>
    <div className="workspace"><form onSubmit={submit}>
      <fieldset disabled={busy}><section className="card"><h2>01 <span>Image & context</span></h2>
        <label>Eye image<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0] || null); setData(null); setError(''); }} /></label>
        <p className="hint">Static JPEG, PNG or WebP · 5 MiB maximum · one image per report</p>
        {preview && <img className="preview" src={preview} alt="Selected eye image for review" />}
        <div className="grid"><label>Image type<select value={form.image_type} onChange={e => update('image_type', e.target.value)}>{['Fundus','Slit-lamp','External'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Laterality<select value={form.laterality} onChange={e => update('laterality',e.target.value)}><option value="OD">OD — Right eye</option><option value="OS">OS — Left eye</option><option value="OU">OU — Both eyes</option></select></label>
        <label>Age<input required type="number" min="0" max="120" step="1" value={form.age} onChange={e => update('age',e.target.value)} /></label>
        <label>Sex<select value={form.sex} onChange={e => update('sex',e.target.value)}>{['Not provided','Female','Male','Other'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Visual acuity<input maxLength="100" placeholder="e.g. OD 20/40, OS 20/20" value={form.visual_acuity} onChange={e => update('visual_acuity',e.target.value)} /></label>
        <label>IOP (mmHg, optional)<input type="number" min="0" max="100" step="0.1" value={form.iop} onChange={e => update('iop',e.target.value)} /></label></div>
        <p className="hint">For OU, enter eye-specific measurements in notes; leave the single IOP field blank.</p>
      </section><section className="card"><h2>02 <span>Reported symptoms</span></h2><div className="chips">{symptoms.map(s => <button type="button" key={s} aria-pressed={form.symptoms.includes(s)} className={form.symptoms.includes(s) ? 'selected' : ''} onClick={() => update('symptoms', form.symptoms.includes(s) ? form.symptoms.filter(x => x !== s) : [...form.symptoms,s])}>{s}</button>)}</div>
        {form.symptoms.some(s => redFlags.has(s)) && <p role="alert" className="warning">These reported warning symptoms need immediate professional eye evaluation. Do not wait for an AI result. This is not a complete triage check.</p>}
        <label>Relevant history & duration<textarea rows="4" maxLength="1500" placeholder="Symptom duration, relevant history, and eye-specific context. No names or identifiers." value={form.notes} onChange={e => update('notes',e.target.value)} /></label>
        <label className="check"><input required type="checkbox" checked={form.consent} onChange={e => update('consent', e.target.checked)} />I am using synthetic or de-identified data. In live mode, the image and entered details are sent to Anthropic.</label>
        <button className="primary" type="submit">{busy ? 'Preparing review…' : 'Generate review draft →'}</button>
      </section></fieldset>{error && <p className="error" role="alert">{error}</p>}</form>
      <section className="card report" aria-live="polite"><div className="reportHeader"><h2>03 <span>Review draft</span></h2>{data && <span className="badge">{data.mode.toUpperCase()}</span>}</div>
        {!data ? <div className="empty"><span>◎</span><h3>{busy ? 'Review in progress' : 'Your report will appear here'}</h3><p>{busy ? 'The backend is validating the image and preparing the response.' : 'Add an image and patient context, then generate a draft.'}</p></div> : <>
          <p className="warning">{data.disclaimer}</p><p className="hint">{new Date(data.created_at).toLocaleString()}</p>
          {data.alerts.map(a => <p className="warning" key={a}>{a}</p>)}
          <h3>Submitted context</h3><dl>{Object.entries(data.context).map(([k,v]) => <div key={k}><dt>{labels[k] || k}</dt><dd>{Array.isArray(v) ? v.join(', ') || 'None selected' : v === null || v === '' ? 'Not provided' : v}</dd></div>)}</dl>
          <h3>Image quality: {data.report.image_quality}</h3><p>{data.report.quality_reason}</p>
          <h3>Tentative concern: {data.report.severity}</h3><p>{data.report.severity_reason}</p>
          <h3>Observations</h3>{data.report.observations.length ? <ul>{data.report.observations.map((v,i) => <li key={i}>{v}</li>)}</ul> : <p>No image findings established.</p>}
          <h3>Tentative differentials</h3>{data.report.differentials.length ? data.report.differentials.map((d,i) => <article key={i}><strong>{d.condition}</strong><p>{d.reasoning}</p><p><b>Confirmation needed:</b> {d.confirmation_needed}</p></article>) : <p>No differential established.</p>}
          <h3>Follow-up for clinician review</h3><ul>{data.report.follow_up.map((v,i) => <li key={i}>{v}</li>)}</ul>
          <h3>Limitations</h3><ul>{data.report.limitations.map((v,i) => <li key={i}>{v}</li>)}</ul>
          <div className="actions"><button onClick={copy}>Copy report</button><button onClick={download}>Download text</button><button onClick={() => window.print()}>Print / PDF</button></div><p role="status">{notice}</p>
        </>}
      </section>
    </div><footer>No application database. Uploaded files are processed transiently; live requests are subject to the provider's data policies.</footer>
  </main>;
}
