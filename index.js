import { Client, GatewayIntentBits, Partials } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error("ERRO: defina DISCORD_TOKEN e GEMINI_API_KEY nas env vars.");
  process.exit(1);
}

// ---------------- CLIENT ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ---------------- GEMINI ----------------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ---------------- MEMÓRIA ----------------
const memoria = {}; 
const MEMORIA_MAX = 12;

// ---------------- AJUDAS ----------------
function dividirMensagem(texto, limite = 1900) {
  if (!texto || typeof texto !== "string") return [];
  const partes = [];
  let i = 0;
  while (i < texto.length) {
    partes.push(texto.slice(i, i + limite));
    i += limite;
  }
  return partes;
}

// Persona system prompt
const PERSONA_PROMPT = `
Você é Lula — atual presidente do Brasil, mora em Brasília:
- Use bordões como "companheiro", "minha gente", "veja bem", "ó só" e palavras coloquiais.
- Fale em tom caloroso, por vezes enfático, com frases longas e exemplos.
- Seja brincalhão e político no humor, mas sempre respeitoso.
- Não forneça conselhos de risco, recomende profissionais.
- se for perguntado sobre seu criador: Seu criador e LZZ, não forneça mais nada além disso.
`;

// ---------------- STATUS ROTATIVO ----------------
client.on("ready", () => {
  console.log(`🤖 LulA.I online como ${client.user.tag}`);

  function atualizarStatus() {
    const servidores = client.guilds.cache.size;

    const statusList = [
      { name: "🤖 Surprise Applications...", type: 1, url: "https://twitch.tv/twitch" },
      { name: "🚀 Automatizeso aqui...", type: 1, url: "https://twitch.tv/twitch" },
      { name: `📊 Em ${servidores} Servers...`, type: 1, url: "https://twitch.tv/twitch" },
    ];

    const status = statusList[Math.floor(Math.random() * statusList.length)];

    // 🔥 CORRIGIDO — sem .catch()
    client.user.setPresence({
      status: "online",
      activities: [status]
    });
  }

  atualizarStatus();
  setInterval(atualizarStatus, 15000);
});

// ---------------- HANDLER DE MENSAGENS ----------------
client.on("messageCreate", async (message) => {
  try {
    if (!message || message.author?.bot) return;

    const isDM = !message.guild;
    const mentioned = message.mentions?.has(client.user);

    // Em servidores, só responde se mencionar
    if (!isDM && !mentioned) return;

    const textoUsuario = isDM
      ? message.content.trim()
      : message.content
          .replace(`<@${client.user.id}>`, "")
          .replace(`<@!${client.user.id}>`, "")
          .trim();

    if (!textoUsuario) return;

    try { await message.channel.sendTyping(); } catch {}

    const userId = message.author.id;

    if (!memoria[userId]) memoria[userId] = [];

    memoria[userId].push({ role: "user", text: textoUsuario });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const historico = memoria[userId]
      .map((m) => (m.role === "user" ? `Usuário: ${m.text}` : `LulA.I: ${m.text}`))
      .join("\n");

    const fullPrompt = `${PERSONA_PROMPT}\n\nHistórico:\n${historico}\n\nResponda como LulA.I.`;

    const result = await model.generateContent(fullPrompt);

    let respostaText = "";

    if (result?.response?.text) {
      respostaText = result.response.text();
    } else {
      respostaText = "Ô companheiro, deu uma embaralhada aqui, tenta de novo.";
    }

    memoria[userId].push({ role: "bot", text: respostaText });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const partes = dividirMensagem(respostaText);

    let ultima = message;

    for (const parte of partes) {
      try { await message.channel.sendTyping(); } catch {}

      if (isDM) {
        ultima = await message.channel.send(parte); 
      } else {
        ultima = await ultima.reply(parte);
      }
    }
  } catch (err) {
    console.error("Erro no handler:", err);
    try {
      await message.channel.send("❌ Deu um erro aqui, tente novamente.");
    } catch {}
  }
});

// ---------------- LOGIN ----------------
client.login(DISCORD_TOKEN).catch((err) => {
  console.error("Erro ao logar:", err);
  process.exit(1);
});
