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
// Modelo recomendado; troque se sua conta tiver acesso a outro.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ---------------- MEMÓRIA ----------------
const memoria = {}; // { userId: [ { role: 'user'|'bot', text }, ... ] }
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

// Persona system prompt (não afirma ser a pessoa real; usa LulA.I como personagem)
const PERSONA_PROMPT = `
Você é Lula — atual presidente do Brasil, mora em Brasília:
- Use bordões como "companheiro", "minha gente", "veja bem", "ó só" e palavras coloquiais.
- Fale em tom caloroso, por vezes enfático, com frases longas e explicações cheias de exemplos e historinhas.
- Seja brincalhão e político no humor, mas sempre respeitoso.
- Sempre deixe claro se o usuário pedir confirmação de identidade: diga que você é "LulA.I, uma imitação/charada humorística" — NÃO AFIRME ser a pessoa real.
- Não forneça conselhos médicos/jurídicos de alto risco; nestes casos, recomende um profissional.
- Seja útil e responda a perguntas concretas com passos claros quando solicitado.

Formato de entrada: o prompt final que você receberá incluirá este bloco de persona seguido do histórico da conversa e da pergunta mais recente. Produza respostas no mesmo português coloquial.
`;

// ---------------- STATUS ROTATIVO ----------------
client.on("ready", () => {
  console.log(`🤖 LulA.I online como ${client.user.tag}`);

  function atualizarStatus() {
    const servidores = client.guilds.cache.size;
    const statusList = [
      { name: "🤖 Surprise Applications", type: 1, url: "https://twitch.tv/twitch" }, // STREAMING
      { name: "🚀 Automatizeso aqui!...", type: 3 }, // WATCHING
      { name: `📊 Em ${servidores} Servers...`, type: 3 }, // WATCHING
    ];
    const status = statusList[Math.floor(Math.random() * statusList.length)];
    client.user.setPresence({ status: "online", activities: [status] }).catch(() => {});
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

    // Server: responde apenas se mencionado
    if (!isDM && !mentioned) return;

    // prepara texto limpo (removendo menções)
    const textoUsuario = isDM
      ? message.content.trim()
      : message.content
          .replace(`<@${client.user.id}>`, "")
          .replace(`<@!${client.user.id}>`, "")
          .trim();

    if (!textoUsuario) return;

    // typing indicator
    try { await message.channel.sendTyping(); } catch (e) {}

    const userId = message.author.id;

    // garante memória do usuário
    if (!memoria[userId]) memoria[userId] = [];

    // salva pergunta do usuário
    memoria[userId].push({ role: "user", text: textoUsuario });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    // monta prompt: persona + histórico (transformado em formato legível)
    const historico = memoria[userId]
      .map((m) => (m.role === "user" ? `Usuário: ${m.text}` : `LulA.I: ${m.text}`))
      .join("\n");

    const fullPrompt = `${PERSONA_PROMPT}\n\nHistórico da conversa:\n${historico}\n\nRespond a partir do personagem LulA.I (responda em português coloquial). Responda à última pergunta do usuário de forma clara e no estilo do personagem.`;

    // chama Gemini
    const result = await model.generateContent(fullPrompt);

    // extrair texto de forma robusta
    let respostaText = "";
    if (result?.response) {
      if (typeof result.response.text === "function") {
        respostaText = result.response.text();
      } else if (typeof result.response.text === "string") {
        respostaText = result.response.text;
      } else if (typeof result.response === "string") {
        respostaText = result.response;
      } else {
        respostaText = JSON.stringify(result.response);
      }
    } else {
      respostaText = JSON.stringify(result);
    }

    if (!respostaText) respostaText = "Ô meu amigo, desculpe — não consegui pensar direito agora.";

    // salvar resposta na memória (sem prefixo "Bot")
    memoria[userId].push({ role: "bot", text: respostaText });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    // dividir e enviar respostas encadeadas
    const partes = dividirMensagem(respostaText, 1900);
    let ultima = message;

    for (const parte of partes) {
      try { await message.channel.sendTyping(); } catch (e) {}

      if (isDM) {
        ultima = await message.channel.send(parte); // envia limpo em DM
      } else {
        ultima = await ultima.reply(parte); // reply encadeado no servidor
      }
    }
  } catch (err) {
    console.error("Erro no handler:", err);
    try {
      // tenta enviar mensagem de erro apropriada (DM ou canal)
      if (message && message.channel) {
        await message.channel.send("❌ Ocorreu um erro ao processar sua mensagem. Tente novamente em alguns segundos.");
      }
    } catch (e) {}
  }
});

// ---------------- LOGIN ----------------
client.login(DISCORD_TOKEN).catch((err) => {
  console.error("Erro ao logar no Discord:", err);
  process.exit(1);
});
