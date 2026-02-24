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

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = message.text;

    /* =============================
       FAST + LOCATION LOCKED
    ============================= */
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 80,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are Dr Tara from TS Healthstore & Surgicals in Bengaluru, India. Never mention any other city or country. Speak clearly. Use short natural sentences. Reply under 25 words.",
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
       QUICK TTS
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
    console.error("Error:", error.message);
    res.sendStatus(200);
  }
});

app.get("/", (req, res) => {
  res.send("Dr Tara Fast Mode Running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});