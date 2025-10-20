const express = require("express");
const fetch = require("node-fetch");
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dab = "drawapi";
const collector = "images";

MongoClient.connect(uri, { useUnifiedTopology: true })
  .then(client => {
    const db = client.db(dab);
    const images = db.collection(collector);
    console.log("MongoDB Bağlantısı Başarılı!");

    app.post("/draw", (req, res) => {
      const { apikey, text, reference_image_base64 } = req.body;

      if (!apikey) return res.json({ success: false, error: "Api Key Eksik!" });
      if (!text) return res.json({ success: false, error: "Metin Gir!" });

      const body = { prompt: { text } };
      if (reference_image_base64)
        body.referenceImage = { imageData: reference_image_base64 };

      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateImage?key=${apikey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
        .then(response => response.json())
        .then(data => {
          const base64 = data?.generatedImages?.[0]?.imageData;

          if (!base64) {
            return res.json({
              success: false,
              error: data.error?.message || "Görsel Oluşturulamadı!",
            });
          }

          const key = crypto.randomBytes(12).toString("hex");

          images
            .insertOne({
              key,
              prompt: text,
              image_base64: base64,
              createdAt: new Date(),
            })
            .then(() => {
              res.json({
                success: true,
                prompt: text,
                key,
                url: `${req.protocol}://${req.get("host")}/image/${key}`,
              });
            })
            .catch(err => res.json({ success: false, error: err.message }));
        })
        .catch(err => res.json({ success: false, error: err.message }));
    });

    app.get("/image/:key", (req, res) => {
      const key = req.params.key;
      if (!key) return res.status(400).send("Anahtar Gerekli!");

      images
        .findOne({ key })
        .then(doc => {
          if (!doc) return res.status(404).send("Görsel Bulunamadı!");
          const buffer = Buffer.from(doc.image_base64, "base64");
          res.setHeader("Content-Type", "image/png");
          res.send(buffer);
        })
        .catch(err => res.status(500).send(err.message));
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`Gemini Çizim & Görsel Sunucu Aktif: ${PORT}`)
    );
  })
  .catch(err => console.error("MongoDB Bağlantısı Başarısız:", err));
