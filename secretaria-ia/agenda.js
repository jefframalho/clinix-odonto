// Lê a agenda pública da clínica (a mesma do agendamento online) e calcula os horários livres.
// Usa as mesmas regras do Clinix: turnos por dia da semana, duração, antecedência mínima e ocupados.
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, collection, addDoc } = require("firebase/firestore/lite");

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const br = s => { const d = parse(s); return DIAS[d.getDay()] + ", " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };

let db = null;
function banco() {
  if (db) return db;
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID || "clinix-odonto",
  });
  db = getFirestore(app);
  return db;
}

async function lerAgenda(token) {
  const s = await getDoc(doc(banco(), "agendas", token));
  return s.exists() ? s.data() : null;
}

async function criarPedido(token, pedido) {
  return addDoc(collection(banco(), "agendas", token, "pedidos"), pedido);
}

function slotsDia(cfg, dstr) {
  const spec = (cfg.dias || {})[parse(dstr).getDay()];
  if (!spec) return [];
  const dur = +cfg.dur || 30, out = [];
  String(spec).split(",").forEach(r => {
    const m = r.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return;
    let a = +m[1] * 60 + +m[2];
    const b = +m[3] * 60 + +m[4];
    while (a + dur <= b) { out.push(pad(Math.floor(a / 60)) + ":" + pad(a % 60)); a += dur; }
  });
  return out;
}

// Devolve os dias com horários livres: [{data, dia, horas:[...]}]
function horariosLivres(g, { aPartirDe, dentista, maxDiasComHorario = 5, agora = new Date() } = {}) {
  const minT = new Date(agora.getTime() + (+g.antec || 2) * 3600e3);
  const oc = new Set(g.ocupados || []);
  const profs = (g.profs || []).map(p => p.id);
  const ids = dentista && profs.includes(dentista) ? [dentista] : profs.length ? profs : [""];
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio = aPartirDe && /^\d{4}-\d{2}-\d{2}$/.test(aPartirDe) && parse(aPartirDe) > hoje ? parse(aPartirDe) : hoje;
  const limite = addDays(hoje, +g.maxDias || 21);
  const livre = (d, h) => {
    const dt = parse(d); dt.setHours(+h.slice(0, 2), +h.slice(3), 0, 0);
    if (dt < minT) return false;
    return ids.some(id => !oc.has(d + " " + h + " " + id));
  };
  const dias = [];
  for (let x = inicio; x <= limite && dias.length < maxDiasComHorario; x = addDays(x, 1)) {
    const d = iso(x);
    const horas = slotsDia(g, d).filter(h => livre(d, h));
    if (horas.length) dias.push({ data: d, dia: br(d), horas });
  }
  return dias;
}

function horarioEstaLivre(g, data, hora, dentista, agora = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "") || !/^\d{2}:\d{2}$/.test(hora || "")) return false;
  const dias = horariosLivres(g, { aPartirDe: data, dentista, maxDiasComHorario: 1, agora });
  return !!dias.length && dias[0].data === data && dias[0].horas.includes(hora);
}

module.exports = { lerAgenda, criarPedido, horariosLivres, horarioEstaLivre, slotsDia, iso, br, DIAS };
