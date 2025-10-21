const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());

app.get("/generate-image", async (req, res) => {
  const { apikey, text } = req.query;

  if (!apikey) return res.status(400).json({ success: false, error: "API anahtarı (apikey) eksik!" });
  if (!text) return res.status(400).json({ success: false, error: "Çizim metni (text) eksik!" });

  try {
    // Gemini 2.5 Flash Image API isteği
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apikey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Generate me a image of " + text
            }]
          }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"]
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({
        success: false,
        error: `API Error: ${response.status} - ${errorText}`
      });
    }

    const data = await response.json();

    // inlineData'dan base64 görsel al
    const base64 = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData?.data;

    if (!base64) {
      return res.status(500).json({
        success: false,
        error: "Görsel oluşturulamadı.",
        debug: JSON.stringify(data)
      });
    }

    // Base64'ü buffer'a çevir ve PNG olarak gönder
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Gemini çizim API aktif: ${PORT}`));
