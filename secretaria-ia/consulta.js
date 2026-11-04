// CONSULTA SPC / SERASA DO CLINIX ODONTO
// O sistema (navegador) nunca vê a chave do fornecedor: ele chama este servidor,
// que confere quem é o usuário, desconta 1 crédito da clínica e faz a consulta.
//
// Variáveis no Render:
//   FIREBASE_SERVICE_ACCOUNT  JSON da chave de serviço do Firebase (a mesma do backup)
//   CONSULTA_MODO             "teste" (dados simulados) ou "real"
//   CONSULTA_URL              endereço da API (padrão: APIBrasil https://gateway.apibrasil.io/api/v2/consulta/cpf/credits)
//   CONSULTA_TOKEN            Bearer token da APIBrasil (menu Credenciais)
//   CONSULTA_TIPO             qual consulta (padrão: spc-boa-vista; outra opção: spc-terceiros-pf)
//   CONSULTA_HOMOLOG          "true" = ambiente de testes da APIBrasil | "false" = produção
//   CONSULTA_DEVICE_TOKEN     opcional: alguns agregadores pedem um "DeviceToken"
//   CONSULTA_CAMPO_CPF        nome do campo do CPF no corpo da requisição (padrão: cpf)
//   ORIGENS                   sites que podem chamar (separados por vírgula)

const MODO = (process.env.CONSULTA_MODO || "teste").toLowerCase();
const ORIGENS = (process.env.ORIGENS || "https://app.clinixodonto.com.br,https://clinix-odonto.web.app,https://clinix-odonto.firebaseapp.com,https://jefframalho.github.io,http://localhost:5000")
  .split(",").map(s => s.trim()).filter(Boolean);

let admin = null, db = null;
function iniciarFirebase() {
  if (db) return true;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return false;
  try {
    admin = require("firebase-admin");
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, "consulta");
    db = admin.app("consulta").firestore();
    return true;
  } catch (e) { console.error("Consulta: erro ao iniciar o Firebase", e.message); return false; }
}

function cpfValido(c) {
  c = String(c || "").replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
const mascarar = c => c.slice(0, 3) + ".***.***-" + c.slice(9);

// ---------- dados simulados (modo teste) ----------
function simulado(cpf) {
  const n = parseInt(cpf.slice(-3), 10);
  const score = 200 + (n * 7) % 750;
  const restr = score < 450 ? [
    { tipo: "Dívida em atraso", credor: "LOJA EXEMPLO LTDA", valor: 389.9, data: "2025-08-14", fonte: "SPC" },
    { tipo: "Dívida em atraso", credor: "OPERADORA EXEMPLO", valor: 142.5, data: "2026-02-03", fonte: "Serasa" }
  ] : [];
  return { score, restricoes: restr, protestos: score < 300 ? 1 : 0, chequesSemFundo: 0, simulado: true };
}

// ---------- fornecedor real ----------
// Procura na resposta campos comuns (score, pendências, protestos). Quando você tiver
// um exemplo da resposta do fornecedor contratado, este trecho é ajustado para ele.
function buscar(obj, teste, achados = []) {
  if (!obj || typeof obj !== "object") return achados;
  for (const [k, v] of Object.entries(obj)) { if (teste(k, v)) achados.push(v); if (v && typeof v === "object") buscar(v, teste, achados); }
  return achados;
}
function normalizar(r) {
  const isNum = v => typeof v === "number" || /^\d+$/.test(String(v));
  const nums = buscar(r, (k, v) => /score/i.test(k) && isNum(v));
  if (!nums.length) buscar(r, (k, v) => /score/i.test(k) && v && typeof v === "object").forEach(o => nums.push(...buscar(o, (_k, v) => isNum(v))));
  const listas = buscar(r, (k, v) => /(pend|restri|negativ|debito|ocorr|spc|serasa)/i.test(k) && Array.isArray(v));
  const prot = buscar(r, (k, v) => /protest/i.test(k) && Array.isArray(v));
  const restricoes = listas.flat().filter(x => x && typeof x === "object").slice(0, 50).map(x => ({
    tipo: x.tipo || x.natureza || x.descricao || "Pendência",
    credor: x.credor || x.informante || x.empresa || x.razaoSocial || "",
    valor: +(x.valor || x.valorTotal || x.valorPendencia || 0) || 0,
    data: x.data || x.dataOcorrencia || x.dataInclusao || "",
    fonte: x.fonte || x.origem || ""
  }));
  return { score: nums.length ? +nums[0] : null, restricoes, protestos: prot.flat().length, chequesSemFundo: 0, simulado: false };
}
async function consultarBoaVista(cpf) {
  const { CONSULTA_URL = "https://gateway.apibrasil.io/api/v2/consulta/cpf/credits", CONSULTA_TOKEN, CONSULTA_DEVICE_TOKEN,
    CONSULTA_CAMPO_CPF = "cpf", CONSULTA_TIPO = "spc-boa-vista", CONSULTA_HOMOLOG = "false" } = process.env;
  if (!CONSULTA_TOKEN) throw new Error("Fornecedor não configurado");
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + CONSULTA_TOKEN };
  if (CONSULTA_DEVICE_TOKEN) headers.DeviceToken = CONSULTA_DEVICE_TOKEN;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(CONSULTA_URL, { method: "POST", headers, body: JSON.stringify({ tipo: CONSULTA_TIPO, [CONSULTA_CAMPO_CPF]: cpf, homolog: CONSULTA_HOMOLOG === "true" }), signal: ctl.signal });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = null; }
    const semCpf = t => String(t || "").split(cpf).join("***").slice(0, 600);
    if (!r.ok || !j || j.error === true) {
      console.error("Consulta: resposta do fornecedor", r.status, semCpf(txt));
      const msg = j && (j.message || j.mensagem || j.error_message);
      throw Object.assign(new Error("Fornecedor respondeu " + r.status), { aviso: typeof msg === "string" ? msg.slice(0, 160) : "" });
    }
    console.log("Consulta: ok, campos da resposta:", JSON.stringify(Object.keys(j)), semCpf(JSON.stringify(j)).slice(0, 400));
    return normalizar(j);
  } finally { clearTimeout(t); }
}

// ---------- Serasa (SOA WebServices · CredNet) ----------
// Variáveis: SERASA_EMAIL, SERASA_SENHA, SERASA_URL
//   homologação: https://homologacao.soawebservices.com.br/api/v2/Serasa/Consultas/CredNet
async function consultarSerasa(cpf) {
  const { SERASA_EMAIL, SERASA_SENHA, SERASA_URL = "https://homologacao.soawebservices.com.br/api/v2/Serasa/Consultas/CredNet" } = process.env;
  if (!SERASA_EMAIL || !SERASA_SENHA) throw new Error("Serasa não configurada");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(SERASA_URL, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credenciais: { email: SERASA_EMAIL, senha: SERASA_SENHA }, documento: cpf, uf: null, adicionais: [] }), signal: ctl.signal });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = null; }
    const semCpf = x => String(x || "").split(cpf).join("***");
    const falhou = !r.ok || !j || j.status === false || j.Status === false || (j.mensagem && /erro|inv[aá]lid|saldo/i.test(j.mensagem) && !j.sinteseCadastral);
    if (falhou) {
      console.error("Consulta Serasa: resposta", r.status, semCpf(txt).slice(0, 800));
      const msg = j && (j.mensagem || j.message || j.Mensagem);
      throw Object.assign(new Error("Serasa respondeu " + r.status), { aviso: typeof msg === "string" ? msg.slice(0, 160) : "" });
    }
    console.log("Consulta Serasa: ok, campos:", JSON.stringify(Object.keys(j)), semCpf(JSON.stringify(j)).slice(0, 600));
    return normalizar(j);
  } finally { clearTimeout(t); }
}

// ---------- Serasa pelo Asaas ----------
// Variáveis: ASAAS_API_KEY, ASAAS_URL (sandbox: https://api-sandbox.asaas.com/v3 | produção: https://api.asaas.com/v3)
//            ASAAS_UF (opcional: estado da consulta, ex.: CE)
// O Asaas devolve o relatório em PDF (não traz score separado). O PDF vai para a tela
// da clínica e uma cópia chega no e-mail da sua conta Asaas.
async function consultarSerasaAsaas(cpf) {
  const { ASAAS_API_KEY, ASAAS_URL = "https://api-sandbox.asaas.com/v3", ASAAS_UF } = process.env;
  if (!ASAAS_API_KEY) throw new Error("Asaas não configurado");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const corpo = { cpfCnpj: cpf }; if (ASAAS_UF) corpo.state = ASAAS_UF;
    const r = await fetch(ASAAS_URL.replace(/\/$/, "") + "/creditBureauReport", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY, "User-Agent": "ClinixOdonto/1.0" },
      body: JSON.stringify(corpo)
    });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok || !j || !j.id) {
      console.error("Consulta Serasa (Asaas): resposta", r.status, String(txt || "").split(cpf).join("***").slice(0, 600));
      const msg = j && j.errors && j.errors[0] && j.errors[0].description;
      throw Object.assign(new Error("Asaas respondeu " + r.status), { aviso: typeof msg === "string" ? msg.slice(0, 160) : "" });
    }
    console.log("Consulta Serasa (Asaas): ok", j.id, JSON.stringify(Object.keys(j)));
    return { score: null, restricoes: [], protestos: 0, chequesSemFundo: 0, simulado: false,
      soPdf: true, relatorioId: j.id, pdf: j.reportFile || null };
  } finally { clearTimeout(t); }
}

// Fontes disponíveis e quantos créditos cada uma gasta
// (Serasa usa o Asaas quando ASAAS_API_KEY estiver no Render; senão, a SOA WebServices)
const FONTES = {
  boavista: { nome: "Boa Vista (SCPC)", creditos: +process.env.CREDITOS_BOAVISTA || 1, fn: consultarBoaVista },
  serasa:   { nome: "Serasa",           creditos: +process.env.CREDITOS_SERASA || 3,
              fn: cpf => process.env.ASAAS_API_KEY ? consultarSerasaAsaas(cpf) : consultarSerasa(cpf) }
};
async function consultarFornecedor(cpf, fonte) {
  if (MODO !== "real") return simulado(cpf);
  return FONTES[fonte].fn(cpf);
}

// ---------- rota ----------
const ultimas = new Map(); // limite simples: 1 consulta a cada 10 s por usuário
// Trava: se o fornecedor falhar 2 vezes seguidas, pausa as consultas por 30 min
// (o fornecedor pode cobrar mesmo quando dá erro).
const falhas = {}, pausado = {};
module.exports = function (app) {
  app.use("/consulta-cpf", (req, res, next) => {
    const o = req.headers.origin;
    if (o && ORIGENS.includes(o)) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.post("/consulta-cpf", async (req, res) => {
    const erro = (st, msg) => res.status(st).json({ erro: msg });
    if (!iniciarFirebase()) return erro(503, "Consulta ainda não configurada no servidor.");
    const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
    let user;
    try { user = await admin.app("consulta").auth().verifyIdToken(tok); } catch { return erro(401, "Faça login de novo."); }

    const { cpf: cpfIn, pid, autorizado, fonte: fonteIn } = req.body || {};
    const fonte = FONTES[fonteIn] ? fonteIn : "boavista", F = FONTES[fonte];
    const cpf = String(cpfIn || "").replace(/\D/g, "");
    if (!cpfValido(cpf)) return erro(400, "CPF inválido.");
    if (autorizado !== true) return erro(400, "Confirme que o paciente autorizou a consulta.");
    if (Date.now() < (pausado[fonte] || 0)) return erro(503, "O serviço de consulta está instável e foi pausado por alguns minutos. Tente mais tarde; nenhum crédito foi usado.");
    const agora = Date.now();
    if (agora - (ultimas.get(user.uid) || 0) < 10000) return erro(429, "Aguarde alguns segundos entre as consultas.");
    ultimas.set(user.uid, agora);

    const uSnap = await db.collection("usuarios").doc(user.uid).get();
    const u = uSnap.exists ? uSnap.data() : null;
    if (!u || u.papel !== "dono") return erro(403, "Só a responsável pela clínica pode fazer consultas.");
    const ref = db.collection("clinicas").doc(u.cid);

    // desconta 1 crédito (de forma segura, mesmo com duas consultas ao mesmo tempo)
    let restantes;
    try {
      restantes = await db.runTransaction(async t => {
        const c = await t.get(ref); const d = c.data() || {};
        if (d.status === "bloqueado") throw Object.assign(new Error("Clínica bloqueada."), { st: 403 });
        const saldo = +d.creditosConsulta || 0;
        if (saldo < F.creditos) throw Object.assign(new Error(`Créditos insuficientes: a consulta ${F.nome} usa ${F.creditos} crédito(s).`), { st: 402 });
        t.update(ref, { creditosConsulta: saldo - F.creditos });
        return saldo - F.creditos;
      });
    } catch (e) { return erro(e.st || 500, e.st ? e.message : "Não foi possível descontar o crédito."); }

    let resultado;
    try { resultado = await consultarFornecedor(cpf, fonte); falhas[fonte] = 0; }
    catch (e) {
      console.error("Consulta: falha no fornecedor", e.message);
      falhas[fonte] = (falhas[fonte] || 0) + 1;
      if (falhas[fonte] >= 2) { pausado[fonte] = Date.now() + 30 * 60e3; falhas[fonte] = 0; console.error("Consulta: " + F.nome + " PAUSADA por 30 minutos após falhas seguidas"); }
      await ref.update({ creditosConsulta: admin.firestore.FieldValue.increment(F.creditos) }).catch(() => {});
      return erro(502, "A consulta não foi concluída" + (e.aviso ? " (" + e.aviso + ")" : "") + ". O crédito foi devolvido.");
    }

    const resumo = {
      data: new Date().toISOString(), cpf: mascarar(cpf), pid: String(pid || ""), quem: user.email || user.uid,
      score: resultado.score, qtdRestricoes: resultado.restricoes.length,
      valorRestricoes: resultado.restricoes.reduce((s, r) => s + (+r.valor || 0), 0),
      protestos: resultado.protestos, simulado: resultado.simulado, fonte: F.nome, creditos: F.creditos,
      soPdf: !!resultado.soPdf, relatorioId: resultado.relatorioId || ""
    };
    await ref.collection("consultas").add(resumo).catch(e => console.error("Consulta: erro ao registrar", e.message));
    res.json({ ...resultado, fonte: F.nome, creditosRestantes: restantes, data: resumo.data });
  });
};
