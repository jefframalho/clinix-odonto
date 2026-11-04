// MENSALIDADE PELO ASAAS
// A clínica paga a assinatura do Clinix por Pix, boleto ou cartão (página de pagamento do Asaas).
// Quando o Asaas confirma o pagamento, este servidor libera a clínica e avança o vencimento 1 mês.
//
// Variáveis no Render:
//   ASAAS_API_KEY        sua chave do Asaas (a mesma da consulta Serasa)
//   ASAAS_URL            produção: https://api.asaas.com/v3 | testes: https://api-sandbox.asaas.com/v3
//   ASAAS_WEBHOOK_TOKEN  uma senha que você inventa e repete no Asaas (Integrações > Webhooks)
//   FIREBASE_SERVICE_ACCOUNT  (já existe)

const ORIGENS = (process.env.ORIGENS || "https://app.clinixodonto.com.br,https://clinix-odonto.web.app,https://clinix-odonto.firebaseapp.com,https://jefframalho.github.io,http://localhost:5000")
  .split(",").map(s => s.trim()).filter(Boolean);

let admin = null, db = null;
function iniciar() {
  if (db) return true;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return false;
  try {
    admin = require("firebase-admin");
    const nome = "mensalidade";
    const app = admin.apps.find(a => a && a.name === nome) ||
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, nome);
    db = app.firestore();
    return true;
  } catch (e) { console.error("Mensalidade: erro ao iniciar o Firebase", e.message); return false; }
}

const base = () => (process.env.ASAAS_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
async function asaas(metodo, caminho, corpo) {
  const r = await fetch(base() + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", access_token: process.env.ASAAS_API_KEY, "User-Agent": "ClinixOdonto/1.0" },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) {
    const msg = j && j.errors && j.errors[0] && j.errors[0].description;
    console.error("Mensalidade: Asaas", metodo, caminho, r.status, String(txt).slice(0, 400));
    throw Object.assign(new Error(msg || "Asaas respondeu " + r.status), { aviso: msg || "" });
  }
  return j;
}

const so = s => String(s || "").replace(/\D/g, "");
function docValido(d) {
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +d[12] && calc(13) === +d[13];
  }
  return false;
}
const toDate = v => v && v.toDate ? v.toDate() : new Date(v || Date.now());
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

module.exports = function (app) {
  app.use("/mensalidade", (req, res, next) => {
    const o = req.headers.origin;
    if (o && ORIGENS.includes(o)) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // A clínica pede o link de pagamento da mensalidade
  app.post("/mensalidade", async (req, res) => {
    const erro = (st, msg) => res.status(st).json({ erro: msg });
    if (!process.env.ASAAS_API_KEY || !iniciar()) return erro(503, "Pagamento pelo Asaas ainda não configurado.");
    let user;
    try { user = await admin.app("mensalidade").auth().verifyIdToken(String(req.headers.authorization || "").replace(/^Bearer /, "")); }
    catch { return erro(401, "Faça login de novo."); }
    const u = (await db.collection("usuarios").doc(user.uid).get()).data();
    if (!u || u.papel !== "dono" || !u.cid) return erro(403, "Só a responsável pela clínica pode pagar a mensalidade.");
    const ref = db.collection("clinicas").doc(u.cid);
    const c = (await ref.get()).data();
    if (!c) return erro(404, "Clínica não encontrada.");

    try {
      // cobrança em aberto já existente: devolve o mesmo link
      const ab = c.asaasCobranca;
      if (ab && ab.id) {
        const p = await asaas("GET", "/payments/" + ab.id).catch(() => null);
        if (p && ["PENDING", "OVERDUE"].includes(p.status) && +p.value === +c.valor) return res.json({ url: p.invoiceUrl, venc: p.dueDate });
      }
      // cliente no Asaas (uma vez por clínica)
      let cliente = c.asaasCliente;
      if (!cliente) {
        const doc = so(req.body && req.body.cpfCnpj);
        if (!docValido(doc)) return res.status(400).json({ erro: "Informe um CPF ou CNPJ válido do responsável.", pedirDoc: true });
        const novo = await asaas("POST", "/customers", {
          name: c.nome || "Clínica", cpfCnpj: doc, email: c.email || user.email || undefined,
          mobilePhone: so(c.telefone) || undefined, externalReference: u.cid, notificationDisabled: false
        });
        cliente = novo.id;
        await ref.update({ asaasCliente: cliente, cpfCnpj: doc });
      }
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const venc = new Date(Math.max(toDate(c.vencimento).getTime(), hoje.getTime()));
      const p = await asaas("POST", "/payments", {
        customer: cliente, billingType: "UNDEFINED",          // a clínica escolhe: Pix, boleto ou cartão
        value: +c.valor || 99, dueDate: ymd(venc),
        description: `Mensalidade Clinix Odonto - ${c.nome || ""}`.slice(0, 500),
        externalReference: u.cid
      });
      await ref.update({ asaasCobranca: { id: p.id, url: p.invoiceUrl, venc: p.dueDate, valor: p.value } });
      res.json({ url: p.invoiceUrl, venc: p.dueDate });
    } catch (e) {
      erro(502, "Não foi possível gerar a cobrança" + (e.aviso ? ": " + e.aviso : "."));
    }
  });

  // O Asaas avisa aqui quando um pagamento é confirmado
  app.post("/asaas/webhook", async (req, res) => {
    const tk = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!tk || req.get("asaas-access-token") !== tk) return res.sendStatus(401);
    res.sendStatus(200);
    try {
      const { event, payment: p } = req.body || {};
      if (!p || !["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) return;
      const cid = p.externalReference;
      if (!cid || !iniciar()) return;
      const ref = db.collection("clinicas").doc(cid);
      await db.runTransaction(async t => {
        const s = await t.get(ref); if (!s.exists) return;
        const c = s.data();
        if ((c.pagamentos || []).some(x => x.asaas === p.id)) return;   // já registrado
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const baseV = new Date(Math.max(toDate(c.vencimento).getTime(), hoje.getTime()));
        const forma = { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão" }[p.billingType] || "Asaas";
        const upd = {
          status: "ativo",
          vencimento: admin.firestore.Timestamp.fromDate(addMonths(baseV, 1)),
          pagamentos: [...(c.pagamentos || []), { data: ymd(new Date()), valor: +p.value || +c.valor || 0, forma, asaas: p.id }]
        };
        if (c.asaasCobranca && c.asaasCobranca.id === p.id) upd.asaasCobranca = admin.firestore.FieldValue.delete();
        t.update(ref, upd);
      });
      console.log("Mensalidade: pagamento confirmado", cid, p.id);
    } catch (e) { console.error("Mensalidade: erro no webhook", e.message); }
  });
};
