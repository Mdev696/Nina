import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { falar, calar, vozLigada, definirVoz, vozSuportada, microfoneSuportado, ouvir } from "./voz.js";

// ============ CONFIGURAÇÃO ============
// Mesmo projeto Supabase da agenda Nina (chave anon/public, pode ficar no front-end)
const SUPABASE_URL = "https://hpwnhczyvmvyznmnnlee.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd25oY3p5dm12eXpubW5ubGVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTYyODUsImV4cCI6MjA5NzQ3MjI4NX0.WRzXI2l_OovmQz40wvtog3_AUZNbfgGYO6kDVp1g1Fc";
// ======================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const chat = document.getElementById("chat");
const vazio = document.getElementById("vazio");
const form = document.getElementById("form");
const campo = document.getElementById("texto");
const btnEnviar = document.getElementById("btn-enviar");
const btnLimpar = document.getElementById("btn-limpar");
const status = document.getElementById("status");

let enviando = false;

// ---------- Interface ----------
function rolarParaFim() {
    chat.scrollTop = chat.scrollHeight;
}

function adicionarMensagem(role, texto, { erro = false } = {}) {
    vazio?.remove();
    const div = document.createElement("div");
    div.className = `msg ${role}${erro ? " erro" : ""}`;
    preencher(div, texto);
    chat.appendChild(div);
    rolarParaFim();
    return div;
}

// Mostra o texto e transforma links em links clicáveis (sem usar innerHTML)
function preencher(div, texto) {
    texto.split(/(https?:\/\/[^\s)]+)/g).forEach((p) => {
        if (/^https?:\/\//.test(p)) {
            const a = document.createElement("a");
            a.href = p;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = p;
            div.appendChild(a);
        } else {
            div.appendChild(document.createTextNode(p));
        }
    });
}

function mostrarDigitando() {
    vazio?.remove();
    const div = document.createElement("div");
    div.className = "msg assistant digitando";
    div.innerHTML = "<span></span><span></span><span></span>";
    chat.appendChild(div);
    rolarParaFim();
    return div;
}

function definirStatus(texto, online = false) {
    status.textContent = texto;
    status.classList.toggle("online", online);
}

function ajustarAlturaCampo() {
    campo.style.height = "auto";
    campo.style.height = Math.min(campo.scrollHeight, 140) + "px";
}

function bloquear(valor) {
    enviando = valor;
    btnEnviar.disabled = valor;
}

// ---------- Autenticação ----------
// Usa o mesmo login da agenda (index.html). Sem login, volta para lá.
async function garantirSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        location.href = "index.html";
        throw new Error("Faça login na agenda primeiro.");
    }
    return session;
}

// ---------- Histórico (guardado neste aparelho) ----------
const CHAVE = "nina:chat";
let historico = [];

function salvarHistorico() {
    historico = historico.slice(-30);
    try { localStorage.setItem(CHAVE, JSON.stringify(historico)); } catch { }
}

function carregarHistorico() {
    try { historico = JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { historico = []; }
    historico.forEach((m) => adicionarMensagem(m.role, m.content));
}

function limparConversa() {
    if (enviando) return;
    if (!confirm("Apagar toda a conversa?")) return;
    historico = [];
    salvarHistorico();
    chat.innerHTML = '<p class="vazio">Conversa apagada. Escreva uma nova mensagem.</p>';
}

// ---------- Envio ----------
async function enviar(texto) {
    adicionarMensagem("user", texto);
    const indicador = mostrarDigitando();
    bloquear(true);

    try {
        const { data, error } = await supabase.functions.invoke("nina-chat", {
            body: { mensagem: texto, historico: historico.slice(-10) },
        });

        if (error) throw error;
        if (!data?.resposta) throw new Error(data?.erro || "Resposta vazia da Nina");

        indicador.remove();
        adicionarMensagem("assistant", data.resposta);
        falarResposta(data.resposta);
        historico.push({ role: "user", content: texto }, { role: "assistant", content: data.resposta });
        salvarHistorico();
    } catch (err) {
        console.error(err);
        indicador.remove();
        adicionarMensagem("assistant", "Erro ao responder: " + (err.message || err), { erro: true });
    } finally {
        bloquear(false);
        campo.focus();
    }
}

// ---------- Eventos ----------
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto || enviando) return;

    campo.value = "";
    ajustarAlturaCampo();
    enviar(texto);
});

// Enter envia; Shift+Enter quebra linha
campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
    }
});

campo.addEventListener("input", ajustarAlturaCampo);
btnLimpar.addEventListener("click", limparConversa);

// ---------- Voz e modo conversa ----------
const btnVoz = document.getElementById("btn-voz");
const btnMic = document.getElementById("btn-mic");
const btnConversa = document.getElementById("btn-conversa");

let conversa = false; // modo conversa: ouve → responde → fala → ouve de novo
let rec = null;
let vazios = 0;

function atualizarBtnVoz() {
    btnVoz.textContent = vozLigada() ? "🔊" : "🔇";
    btnVoz.title = vozLigada() ? "Voz ligada" : "Voz desligada";
}

function falarResposta(texto) {
    if (conversa) falar(texto, true, () => { if (conversa) setTimeout(escutar, 400); });
    else falar(texto);
}

function escutar() {
    if (rec || enviando) return;
    btnMic.classList.add("ouvindo");
    let ouviu = false;
    rec = ouvir({
        aoTexto: (t) => { ouviu = true; vazios = 0; campo.value = t; ajustarAlturaCampo(); form.requestSubmit(); },
        aoFim: () => {
            btnMic.classList.remove("ouvindo");
            rec = null;
            if (conversa && !ouviu && !enviando) {
                vazios++;
                if (vazios >= 2) definirConversa(false); // ninguém falou: encerra
                else setTimeout(escutar, 300);
            }
        },
        aoErro: () => { },
    });
}

function definirConversa(ligada) {
    conversa = ligada;
    vazios = 0;
    btnConversa.classList.toggle("ativo", ligada);
    definirStatus(ligada ? "conversando…" : "online", true);
    if (ligada) {
        if (!vozLigada()) { definirVoz(true); atualizarBtnVoz(); }
        escutar();
    } else {
        if (rec) rec.stop();
        calar();
    }
}

if (!vozSuportada) {
    btnVoz.hidden = true;
} else {
    atualizarBtnVoz();
    btnVoz.addEventListener("click", () => { definirVoz(!vozLigada()); atualizarBtnVoz(); });
}

if (!microfoneSuportado) {
    btnMic.hidden = true;
    btnConversa.hidden = true;
} else {
    btnMic.addEventListener("click", () => { if (rec) rec.stop(); else escutar(); });
    btnConversa.addEventListener("click", () => definirConversa(!conversa));
}

// ---------- Saudação ao abrir (uma vez por dia) ----------
async function saudar() {
    const hoje = new Date().toLocaleDateString("pt-BR");
    try { if (localStorage.getItem("nina:saudou") === hoje) return; } catch { }
    try {
        const { data } = await supabase.functions.invoke("nina-chat", { body: { abertura: true } });
        if (!data?.resposta) return;
        adicionarMensagem("assistant", data.resposta);
        historico.push({ role: "assistant", content: data.resposta });
        salvarHistorico();
        try { localStorage.setItem("nina:saudou", hoje); } catch { }
        // navegadores só deixam falar depois de um toque do usuário
        document.addEventListener("pointerdown", () => falar(data.resposta), { once: true });
    } catch { }
}

// ---------- Início ----------
(async function iniciar() {
    try {
        await garantirSessao();
        await carregarHistorico();
        await saudar();
        definirStatus("online", true);
    } catch (err) {
        console.error(err);
        definirStatus("sem conexão");
        adicionarMensagem("assistant", "Falha ao conectar: " + (err.message || err), { erro: true });
    }
})();