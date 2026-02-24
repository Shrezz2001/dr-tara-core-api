import express from "express";
import axios from "axios";
import OpenAI from "openai";
import gTTS from "gtts";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

let productsCache = [];

/* =============================
   PRODUCT SYNC FROM WORDPRESS
============================= */
async function syncProducts() {
  try {
    let page = 1;
    let allProducts = [];

    while (true) {
      const response = await axios.get(
        `https://tshealthstore.com/wp-json/wp/v2/product?per_page=100&page=${page}`
      );

      if (!response.data.length) break;

      allProducts = allProducts.concat(response.data);
      page++;
    }

    productsCache = allProducts.map((p) => ({
      id: p.id,
      title: p.title.rendered,
      content: p.content.rendered.replace(/<[^>]*>?/gm, ""),
      link: p.link,
    }));

    console.log(`✅ Synced ${productsCache.length} products`);
  } catch (error) {
    console.error("Product sync failed:", error);
  }
}

syncProducts();

/* =============================
   TELEGRAM WEBHOOK
============================= */
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = message.text;

    /* =============================
       SIMPLE PRODUCT MATCH
    ============================= */
    let relevantProducts = [];

    if (productsCache.length > 0) {
      const lowerQuery = userText.toLowerCase();

      relevantProducts = productsCache.filter((p) =>
        lowerQuery.includes(p.title.toLowerCase())
      ).slice(0, 3);
    }

    /* =============================
       AI RESPONSE (Improved Tone)
    ============================= */
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are Dr Tara, a warm and confident medical assistant from TS Healthstore in Bengaluru. Speak clearly and naturally. Use short sentences. Avoid long paragraphs. Sound calm and caring. Keep replies under 50 words. Be practical and helpful.",
        },
        {
          role: "system",
          content: `Relevant products from website: ${JSON.stringify(relevantProducts)}`,
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });

    const reply = completion.choices[0].message.content;
    if (!reply) return res.sendStatus(200);

    /* =============================
       CONVERT TO VOICE
    ============================= */
    const filePath = "voice.mp3";
    const tts = new gTTS(reply, "en");

    await new Promise((resolve) => {
      tts.save(filePath, resolve);
    });

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("voice", fs.createReadStream(filePath));

    await axios.post(`${TELEGRAM_API}/sendVoice`, form, {
      headers: form.getHeaders(),
    });

    fs.unlinkSync(filePath);

    res.sendStatus(200);

  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(200);
  }
});

/* =============================
   HEALTH CHECK
============================= */
app.get("/", (req, res) => {
  res.send("Dr Tara Voice AI running with Website Knowledge.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});