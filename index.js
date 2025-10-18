// index.js
// Express API for Google Gemini 2.5 Flash Image model (text-to-image and image-to-image)
// Uses: express, axios, fs, path
// Node >= 14 recommended

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // JSON body parser
app.use(express.urlencoded({ extended: true }));

// Public folder to serve generated images
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

// Ensure directories exist
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);

// Serve static files (so returned URL will be accessible)
app.use('/images', express.static(IMAGES_DIR));

// Helper: build Gemini endpoint
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

// Helper: extract base64 image data from Gemini response
// The Gemini response format may vary; this tries to find the first "data": "BASE64..." occurrence
function extractBase64FromGeminiResponse(obj) {
  try {
    const s = JSON.stringify(obj);
    // Look for "data": "....." where inside may contain url-safe base64 chars
    const re = /"data"\s*:\s*"([^"]+)"/;
    const m = re.exec(s);
    if (m && m[1]) {
      return m[1];
    }
    // fallback: look for long base64-like substrings (very generous)
    const longBase64Re = /([A-Za-z0-9+/=]{200,})/;
    const mm = longBase64Re.exec(s);
    if (mm && mm[1]) return mm[1];
  } catch (e) {
    // ignore
  }
  return null;
}

// Helper: download an image and return its base64 string
async function downloadImageAsBase64(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  const buffer = Buffer.from(resp.data, 'binary');
  // Attempt to detect mime-type from headers (optional)
  const contentType = resp.headers['content-type'] || 'image/jpeg';
  const base64 = buffer.toString('base64');
  return { base64, mimeType: contentType };
}

// Main endpoint
app.post('/api/gemini-draw', async (req, res) => {
  try {
    // Accept params from JSON body. (If you prefer query params, can add support.)
    const { apiKey, prompt, reference } = req.body || {};

    // Validate required params
    if (!apiKey) {
      return res.status(400).json({ error: 'apiKey (Gemini API key) is required in request body.' });
    }
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (text instruction) is required in request body.' });
    }

    // Build request payload for Gemini
    let payload = {
      contents: [
        {
          parts: [
            { text: prompt }
            // If image inline data is needed, we'll push another part below
          ]
        }
      ]
    };

    // If reference is provided: download it and add inline_data part
    if (reference) {
      try {
        // Download image and convert to base64
        const { base64, mimeType } = await downloadImageAsBase64(reference);

        // Push inline_data part for image-to-image
        payload.contents[0].parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64
          }
        });
      } catch (downloadErr) {
        console.error('Reference image download failed:', downloadErr && downloadErr.message ? downloadErr.message : downloadErr);
        return res.status(400).json({ error: 'Failed to download reference image. Check the reference URL and CORS/availability.' });
      }
    }

    // Call Gemini
    const geminiResp = await axios.post(GEMINI_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      timeout: 60000 // 60s, adjust if needed
    });

    // Extract base64 image from Gemini response
    const base64Data = extractBase64FromGeminiResponse(geminiResp.data);
    if (!base64Data) {
      console.error('Failed to extract base64 from Gemini response. Full response:', JSON.stringify(geminiResp.data).slice(0, 2000));
      return res.status(502).json({ error: 'Gemini response did not contain image data (base64). Check API usage/quota.' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Create unique filename using timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `gemini_${timestamp}.png`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Save file
    fs.writeFileSync(filepath, imageBuffer);

    // Build public URL to the saved image
    // Use request host/protocol to build absolute URL so it's Render-friendly
    const protocol = req.protocol;
    const host = req.get('host'); // e.g. deneme-3.onrender.com:443 or deneme-3.onrender.com
    const imageUrl = `${protocol}://${host}/images/${filename}`;

    // Return JSON with image URL (compatible with BDFD $httpGet -> $httpResult[image])
    return res.json({ image: imageUrl });
  } catch (err) {
    console.error('Internal error in /api/gemini-draw:', err && err.stack ? err.stack : err);
    // Return generic error message
    return res.status(500).json({ error: 'Internal server error. ' + (err && err.message ? err.message : '') });
  }
});

// Simple GET root to show service is up (optional)
app.get('/', (req, res) => {
  res.send('Gemini draw API running. POST /api/gemini-draw with JSON { apiKey, prompt, reference? }');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}. Images served from /images`);
});
