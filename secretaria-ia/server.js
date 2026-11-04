// SECRETÁRIA IA DO CLINIX ODONTO
// Recebe as mensagens do WhatsApp (API oficial da Meta), responde com o Gemini
// e cria os pedidos de agendamento na agenda online da clínica.
process.env.TZ = process.env.TZ || "America/Fortaleza";

const crypto = require("crypto");
const express = require("express");
const agenda = require("./agenda");
const { responder } = require("./ia");

const {
  WHATSAPP_TOKEN,          // token de acesso do app da Meta
  WHATSAPP_VERIFY_TOKEN,   // uma senha que você inventa e repete na Meta
  WHATSAPP_APP_SECRET,     // "Chave secreta do app" (confere se a mensagem veio mesmo da Meta)
  GRAPH_VERSION = "v23.0",
  PORT = 3000,
} = process.env;

// Qual número de WhatsApp é de qual clínica:
// CLINICAS={"ID_DO_NUMERO_NA_META":"CODIGO_DA_AGENDA_NO_CLINIX"}
let CLINICAS = {};
try { CLINICAS = JSON.parse(process.env.CLINICAS || "{}"); }
catch { console.error("CLINICAS está com formato errado. Exemplo: {\"1234567890\":\"abc123\"}"); }

const conversas = new Map();  // conversa de cada paciente (fica na memória do servidor)
const vistas = new Map();     // ids de mensagens já tratadas (a Meta às vezes reenvia)
const filas = new Map();      // responde uma mensagem por vez para cada paciente

setInterval(() => {
  const agora = Date.now();
  for (const [k, c] of conversas) if (agora - c.ultima > 6 * 3600e3) conversas.delete(k);
  for (const [k, t] of vistas) if (agora - t > 3600e3) vistas.delete(k);
}, 10 * 60e3).unref();

const app = express();
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.raw = buf; } }));

// Consulta SPC/Serasa (créditos da clínica)
require("./consulta")(app);

// Mensalidade das clínicas pelo Asaas (Pix, boleto ou cartão)
require("./mensalidade")(app);

app.get("/", (_req, res) => res.send("Secretária IA do Clinix Odonto: no ar ✅"));

// A Meta chama isto uma vez para confirmar o endereço
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === WHATSAPP_VERIFY_TOKEN)
    return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

function assinaturaOk(req) {
  if (!WHATSAPP_APP_SECRET) return true;
  const sig = req.get("x-hub-signature-256") || "";
  const esperado = "sha256=" + crypto.createHmac("sha256", WHATSAPP_APP_SECRET).update(req.raw || "").digest("hex");
  return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
}

app.post("/webhook", (req, res) => {
  if (!assinaturaOk(req)) return res.sendStatus(401);
  res.sendStatus(200); // responde logo para a Meta não reenviar
  for (const entry of req.body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const numeroId = v.metadata && v.metadata.phone_number_id;
      const nomes = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        if (vistas.has(m.id)) continue;
        vistas.set(m.id, Date.now());
        const chave = numeroId + ":" + m.from;
        const anterior = filas.get(chave) || Promise.resolve();
        const atual = anterior
          .then(() => tratar(numeroId, m, nomes[m.from]))
          .catch(e => console.error("Erro ao tratar mensagem", e));
        filas.set(chave, atual);
        atual.finally(() => { if (filas.get(chave) === atual) filas.delete(chave); });
      }
    }
  }
});

async function enviar(numeroId, para, texto) {
  for (let i = 0; i < texto.length; i += 3800) {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${numeroId}/messages`, {
      method: "POST",
      headers: { Authorization: "Bearer " + WHATSAPP_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(i, i + 3800) } }),
    });
    if (!r.ok) console.error("WhatsApp recusou o envio:", r.status, await r.text());
  }
}

async function tratar(numeroId, m, nomePerfil) {
  const token = CLINICAS[numeroId];
  if (!token) return console.warn("Número sem clínica em CLINICAS:", numeroId);

  const g = await agenda.lerAgenda(token);
  if (!g || !g.ativo || !g.ia) {
    const tel = g && g.telefone ? ` Fale com a recepção: ${g.telefone}` : "";
    return enviar(numeroId, m.from, `Olá! No momento o atendimento automático está desligado.${tel}`);
  }

  if (m.type !== "text") {
    return enviar(numeroId, m.from, "Por enquanto eu só consigo ler mensagens escritas. Pode me mandar por texto? 🙂");
  }

  const chave = numeroId + ":" + m.from;
  let conv = conversas.get(chave);
  if (!conv) { conv = { hist: [], ultima: 0, msgsHora: [] }; conversas.set(chave, conv); }
  conv.ultima = Date.now();
  conv.msgsHora = conv.msgsHora.filter(t => Date.now() - t < 3600e3);
  if (conv.msgsHora.length >= 40) return; // limite contra abuso e gasto alto
  conv.msgsHora.push(Date.now());

  let texto;
  try {
    texto = await responder(conv, m.text.body || "", { agenda: g, token, fone: m.from, nomePerfil, conv });
  } catch (e) {
    console.error("Erro da IA", e);
    texto = "Desculpe, estou com uma instabilidade agora." + (g.telefone ? ` Se preferir, fale com a recepção: ${g.telefone}` : " Tente de novo em alguns minutos.");
  }
  await enviar(numeroId, m.from, texto);
}

if (require.main === module) {
  app.listen(PORT, () => console.log("Secretária IA ouvindo na porta " + PORT + " · clínicas: " + Object.keys(CLINICAS).length));
}
module.exports = { app };
