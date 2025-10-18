// index.js
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);
app.use('/images', express.static(IMAGES_DIR));

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

// Base64 çıkarıcı
function extractBase64FromGeminiResponse(obj) {
  try {
    const s = JSON.stringify(obj);
    const re = /"data"\s*:\s*"([^"]+)"/;
    const m = re.exec(s);
    if (m && m[1]) return m[1];
    const longBase64Re = /([A-Za-z0-9+/=]{200,})/;
    const mm = longBase64Re.exec(s);
    if (mm && mm[1]) return mm[1];
  } catch {}
  return null;
}

// Görsel indirip base64 çevirme
async function downloadImageAsBase64(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  const buffer = Buffer.from(resp.data, 'binary');
  const contentType = resp.headers['content-type'] || 'image/jpeg';
  return { base64: buffer.toString('base64'), mimeType: contentType };
}

// Ortak işlev
async function handleDraw(apiKey, prompt, reference, req, res) {
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  let payload = { contents: [{ parts: [{ text: prompt }] }] };

  if (reference) {
    try {
      const { base64, mimeType } = await downloadImageAsBase64(reference);
      payload.contents[0].parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
    } catch (e) {
      return res.status(400).json({ error: 'Failed to download reference image' });
    }
  }

  try {
    const geminiResp = await axios.post(GEMINI_ENDPOINT, payload, {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      timeout: 60000
    });

    const base64Data = extractBase64FromGeminiResponse(geminiResp.data);
    if (!base64Data) return res.status(502).json({ error: 'Gemini response invalid' });

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const filename = `gemini_${Date.now()}.png`;
    const filepath = path.join(IMAGES_DIR, filename);
    fs.writeFileSync(filepath, imageBuffer);

    const imageUrl = `${req.protocol}://${req.get('host')}/images/${filename}`;
    res.json({ image: imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error: ' + (err.message || err) });
  }
}

// POST endpoint (orijinal)
app.post('/api/gemini-draw', async (req, res) => {
  const { apiKey, prompt, reference } = req.body;
  await handleDraw(apiKey, prompt, reference, req, res);
});

// GET endpoint (BDFD $httpGet uyumlu)
app.get('/api/gemini-draw', async (req, res) => {
  const { apiKey, prompt, reference } = req.query;
  await handleDraw(apiKey, prompt, reference, req, res);
});

// Sağlık kontrol
app.get('/', (req, res) => {
  res.send('Gemini draw API running. Use POST or GET /api/gemini-draw');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
