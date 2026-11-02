// Teste automático: simula Firebase, Gemini e WhatsApp (não usa internet nem chaves).
// Uso: npm run teste-auto
process.env.TZ = "America/Fortaleza";
const assert = require("assert");
const Module = require("module");
const crypto = require("crypto");

// ---------- simulações ----------
const pedidos = [];
let agendaFake = null;
const fakes = {
  "firebase/app": { initializeApp: () => ({}) },
  "firebase/firestore/lite": {
    getFirestore: () => ({}),
    doc: (_db, ...p) => p.join("/"),
    collection: (_db, ...p) => p.join("/"),
    getDoc: async () => ({ exists: () => !!agendaFake, data: () => agendaFake }),
    addDoc: async (path, data) => { pedidos.push({ path, data }); return { id: "p" + pedidos.length }; },
  },
  express: Object.assign(() => {
    const rotas = {};
    return { rotas, use() {}, get: (p, f) => (rotas["GET " + p] = f), post: (p, f) => (rotas["POST " + p] = f), listen() {} };
  }, { json: () => () => {} }),
};
const loadOriginal = Module._load;
Module._load = function (req, ...r) { return fakes[req] || loadOriginal.call(this, req, ...r); };

const agenda = require("./agenda");
const ia = require("./ia");

let ok = 0;
const t = (nome, fn) => Promise.resolve().then(fn).then(() => { ok++; console.log("✔ " + nome); });

(async () => {
  // ---------- 1. horários ----------
  const seg = "2026-11-09", ter = "2026-11-10";
  const base = { ativo: true, ia: true, clinica: "Clínica Teste", telefone: "(88) 9 9999-0000", dur: 30, antec: 2, maxDias: 21,
    dias: { 1: "08:00-12:00, 14:00-15:00", 2: "08:00-09:00" }, procs: ["Avaliação", "Limpeza (profilaxia)"],
    profs: [{ id: "d1", nome: "Dra. Ana" }], ocupados: [seg + " 08:00 d1"], info: "Avaliação custa R$ 50." };
  const agora = new Date(2026, 10, 9, 7, 0); // segunda 07:00

  await t("turnos viram horários de 30 em 30 min", () => {
    assert.deepStrictEqual(agenda.slotsDia(base, seg), ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"]);
    assert.deepStrictEqual(agenda.slotsDia(base, "2026-11-08"), []); // domingo
  });
  await t("respeita antecedência e horário ocupado", () => {
    const d = agenda.horariosLivres(base, { agora });
    assert.strictEqual(d[0].data, seg);
    assert.ok(!d[0].horas.includes("08:00"), "08:00 ocupado e dentro das 2h");
    assert.ok(!d[0].horas.includes("08:30"), "08:30 está a menos de 2h");
    assert.strictEqual(d[0].horas[0], "09:00");
    assert.strictEqual(d[1].data, ter);
  });
  await t("com 2 dentistas, horário só fica ocupado se os dois estiverem ocupados", () => {
    const g2 = { ...base, profs: [{ id: "d1", nome: "A" }, { id: "d2", nome: "B" }], ocupados: [ter + " 08:00 d1"] };
    assert.ok(agenda.horarioEstaLivre(g2, ter, "08:00", "", agora));
    assert.ok(!agenda.horarioEstaLivre(g2, ter, "08:00", "d1", agora));
    assert.ok(agenda.horarioEstaLivre(g2, ter, "08:00", "d2", agora));
    assert.ok(!agenda.horarioEstaLivre(g2, ter, "07:00", "", agora));
    assert.ok(!agenda.horarioEstaLivre(g2, "lixo", "08:00", "", agora));
  });

  // ---------- 2. conversa com IA simulada ----------
  // Agenda aberta todos os dias para os testes não dependerem da data de hoje
  const todoDia = { ...base, dias: { 0: "00:00-23:30", 1: "00:00-23:30", 2: "00:00-23:30", 3: "00:00-23:30", 4: "00:00-23:30", 5: "00:00-23:30", 6: "00:00-23:30" }, ocupados: [] };
  const amanha = agenda.iso(new Date(Date.now() + 86400e3));
  const roteiro = [];
  const iaFake = async (hist, sistema) => {
    assert.ok(sistema.includes("Clínica Teste") && sistema.includes("R$ 50"), "instruções levam dados da clínica");
    const passo = roteiro.shift();
    if (passo.call) return { content: { role: "model", parts: [{ functionCall: passo.call }] }, calls: [passo.call], text: "" };
    return { content: { role: "model", parts: [{ text: passo.text }] }, calls: [], text: passo.text };
  };
  const conv = { hist: [] };
  const ctx = { agenda: todoDia, token: "tok123", fone: "5588999990000", nomePerfil: "Maria", conv };

  await t("IA consulta horários livres e responde", async () => {
    roteiro.push({ call: { name: "ver_horarios_livres", args: {} } }, { text: "Tenho amanhã às 10:00. Serve?" });
    const r = await ia.responder(conv, "Oi, quero marcar uma avaliação", ctx, iaFake);
    assert.strictEqual(r, "Tenho amanhã às 10:00. Serve?");
    const resp = conv.hist.find(c => c.parts.some(p => p.functionResponse)).parts[0].functionResponse.response;
    assert.ok(resp.dias.length > 0 && resp.dias[0].horas.length > 0);
  });
  await t("pede nome completo antes de agendar", async () => {
    roteiro.push({ call: { name: "pedir_agendamento", args: { nome: "Maria", data: amanha, hora: "10:00" } } }, { text: "Qual seu nome completo?" });
    await ia.responder(conv, "Serve sim", ctx, iaFake);
    assert.strictEqual(pedidos.length, 0);
  });
  await t("cria o pedido no formato que as regras do Firestore aceitam", async () => {
    roteiro.push({ call: { name: "pedir_agendamento", args: { nome: "Maria da Silva", data: amanha, hora: "10:00", procedimento: "Avaliação", observacao: "dente sensível" } } }, { text: "Pedido enviado! A clínica confirma pelo WhatsApp." });
    await ia.responder(conv, "Maria da Silva", ctx, iaFake);
    assert.strictEqual(pedidos.length, 1);
    const { path, data } = pedidos[0];
    assert.strictEqual(path, "agendas/tok123/pedidos");
    const permitidas = ["nome", "fone", "data", "hora", "proc", "prof", "obs", "criado"];
    assert.ok(Object.keys(data).every(k => permitidas.includes(k)), "só campos permitidos");
    assert.ok(typeof data.obs === "string" && data.obs.length <= 200 && data.nome.length <= 100 && data.fone.length <= 20);
    assert.strictEqual(data.data, amanha); assert.strictEqual(data.hora, "10:00");
  });
  await t("recusa horário fora da agenda", async () => {
    roteiro.push({ call: { name: "pedir_agendamento", args: { nome: "Maria da Silva", data: amanha, hora: "10:15" } } }, { text: "Esse horário não existe." });
    await ia.responder(conv, "E 10:15?", ctx, iaFake);
    assert.strictEqual(pedidos.length, 1);
  });
  await t("chamar atendente cria aviso para a recepção (sem data) só uma vez", async () => {
    roteiro.push({ call: { name: "chamar_atendente", args: { motivo: "Dor forte" } } }, { text: "Já avisei a recepção." });
    await ia.responder(conv, "Estou com muita dor", ctx, iaFake);
    roteiro.push({ call: { name: "chamar_atendente", args: { motivo: "Dor forte" } } }, { text: "Já avisei." });
    await ia.responder(conv, "Ainda dói", ctx, iaFake);
    const avisos = pedidos.filter(p => p.data.proc === "Falar com a recepção");
    assert.strictEqual(avisos.length, 1);
    assert.strictEqual(avisos[0].data.data, ""); assert.strictEqual(avisos[0].data.nome, "Maria");
  });

  // ---------- 3. servidor (webhook do WhatsApp) ----------
  process.env.WHATSAPP_VERIFY_TOKEN = "senha";
  process.env.WHATSAPP_APP_SECRET = "segredo";
  process.env.WHATSAPP_TOKEN = "tk";
  process.env.CLINICAS = JSON.stringify({ "999": "tok123" });
  const chamadasIA = [];
  ia.responder = async (c, texto) => { chamadasIA.push(texto); return "Resposta da secretária"; };
  const enviados = [];
  global.fetch = async (url, op) => { enviados.push({ url, body: JSON.parse(op.body) }); return { ok: true, text: async () => "" }; };
  const { app } = require("./server");
  const resFake = () => { const r = { code: 0, body: null }; r.status = c => ((r.code = c), r); r.send = b => ((r.body = b), r); r.sendStatus = c => ((r.code = c), r); return r; };
  const esperar = () => new Promise(r => setTimeout(r, 30));
  const post = (body, assinar = true) => {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = "sha256=" + crypto.createHmac("sha256", assinar ? "segredo" : "errado").update(raw).digest("hex");
    const res = resFake();
    app.rotas["POST /webhook"]({ body, raw, get: () => sig }, res);
    return res;
  };
  const msg = (id, extra) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "999" }, contacts: [{ wa_id: "5588", profile: { name: "Maria" } }], messages: [{ id, from: "5588", type: "text", text: { body: "Oi" }, ...extra }] } }] }] });

  await t("Meta confirma o webhook com a senha certa", () => {
    const r = resFake(); app.rotas["GET /webhook"]({ query: { "hub.mode": "subscribe", "hub.verify_token": "senha", "hub.challenge": "42" } }, r);
    assert.strictEqual(r.body, "42");
    const r2 = resFake(); app.rotas["GET /webhook"]({ query: { "hub.mode": "subscribe", "hub.verify_token": "x" } }, r2);
    assert.strictEqual(r2.code, 403);
  });
  await t("mensagem com assinatura falsa é rejeitada", async () => {
    agendaFake = todoDia;
    assert.strictEqual(post(msg("m0"), false).code, 401);
    await esperar(); assert.strictEqual(enviados.length, 0);
  });
  await t("mensagem de texto é respondida (e repetição da Meta é ignorada)", async () => {
    assert.strictEqual(post(msg("m1")).code, 200);
    post(msg("m1"));
    await esperar();
    assert.strictEqual(chamadasIA.length, 1);
    assert.strictEqual(enviados.length, 1);
    assert.ok(enviados[0].url.endsWith("/999/messages"));
    assert.deepStrictEqual(enviados[0].body.text, { body: "Resposta da secretária" });
    assert.strictEqual(enviados[0].body.to, "5588");
  });
  await t("áudio recebe aviso para mandar por texto", async () => {
    post(msg("m2", { type: "audio", text: undefined }));
    await esperar();
    assert.ok(enviados[1].body.text.body.includes("mensagens escritas"));
    assert.strictEqual(chamadasIA.length, 1);
  });
  await t("secretária desligada não chama a IA", async () => {
    agendaFake = { ...todoDia, ia: false };
    post(msg("m3"));
    await esperar();
    assert.ok(enviados[2].body.text.body.includes("desligado") && enviados[2].body.text.body.includes("9999-0000"));
    assert.strictEqual(chamadasIA.length, 1);
  });

  console.log(`\nTudo certo: ${ok} testes passaram.`);
  process.exit(0);
})().catch(e => { console.error("\n✘ FALHOU:", e.message); process.exit(1); });
