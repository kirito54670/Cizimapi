import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Ortam değişkeni olarak ayarlanacak (Render'da)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
  res.send("✅ Gemini Image API is running!");
});

app.get("/generate-image", async (req, res) => {
  try {
    const prompt = req.query.prompt;
    if (!prompt) {
      return res.status(400).json({ error: "Missing 'prompt' query parameter" });
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

    const payload = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    const parts =
      (json?.candidates?.[0]?.content?.parts) || [];
    const imagePart = parts.find(
      (p) => p.inlineData?.data || p.inline_data?.data
    );

    if (!imagePart) {
      console.error("No image data returned:", JSON.stringify(json, null, 2));
      return res.status(500).json({ error: "No image data in response" });
    }

    const b64 =
      imagePart.inlineData?.data || imagePart.inline_data?.data;
    const imgBuffer = Buffer.from(b64, "base64");

    res.setHeader("Content-Type", "image/png");
    return res.send(imgBuffer);
  } catch (err) {
    console.error("Error generating image:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
