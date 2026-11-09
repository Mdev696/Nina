// @ts-ignore
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm";
// @ts-ignore
import { ouvir, microfoneSuportado, listarVozes, aoCarregarVozes, vozEscolhida, definirVozEscolhida, falar } from "./voz.js";
const SUPABASE_URL = "https://hpwnhczyvmvyznmnnlee.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd25oY3p5dm12eXpubW5ubGVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTYyODUsImV4cCI6MjA5NzQ3MjI4NX0.WRzXI2l_OovmQz40wvtog3_AUZNbfgGYO6kDVp1g1Fc";
const CATS = {
    eu: "Sobre mim", familia: "Família", pais: "Meus pais", trabalho: "Trabalho e mercado", outros: "Outros",
};
const SAUDACAO_PADRAO = "{saudacao}, {nome}! Está tudo bem com você?";
const NAO_SEI_PADRAO = "Ainda não sei responder isso. Você pode me contar no painel 🧠.";
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const val = (id) => $(id).value.trim();
const sensivel = (t) => /\bsenha\b/i.test(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t) || /\b(?:\d{4}[ -]?){3}\d{4}\b/.test(t);
const SENSIVEL = "Por segurança, não guardo senhas, cartões nem CPF. Tire esse dado e tente de novo.";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let notas = [];
let ensinos = [];
let filtro = "todas";
function aviso(id, texto, ok = false) {
    $(id).className = ok ? "ok" : "err";
    $(id).textContent = texto;
    if (ok)
        setTimeout(() => ($(id).textContent = ""), 2500);
}
// ---------- perfil ----------
async function carregarPerfil() {
    const { data } = await supabase.from("perfil").select("nome,saudacao,nao_sei").maybeSingle();
    $("nome").value = data?.nome ?? "";
    $("saudacao").value = data?.saudacao ?? SAUDACAO_PADRAO;
    $("naosei").value = data?.nao_sei ?? NAO_SEI_PADRAO;
}
async function salvarPerfil(campos, msg) {
    const { error } = await supabase.from("perfil").upsert({ ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
    if (error)
        return aviso(msg, "Erro: " + error.message + " (você rodou o ensinar.sql?)");
    aviso(msg, "Salvo!", true);
}
$("salvarPerfil").addEventListener("click", () => salvarPerfil({ nome: val("nome") || null }, "msgPerfil"));
$("salvarAv").addEventListener("click", () => salvarPerfil({ saudacao: val("saudacao") || null, nao_sei: val("naosei") || null }, "msgAv"));
// ---------- conhecimento ----------
async function carregarNotas() {
    const { data, error } = await supabase.from("notas").select("*").order("criado_em", { ascending: false });
    if (error) {
        $("listaNotas").innerHTML = `<div class="empty err">Erro: ${esc(error.message)} (você rodou o notas.sql?)</div>`;
        return;
    }
    notas = (data ?? []);
    renderNotas();
}
function renderNotas() {
    const q = val("busca").toLowerCase();
    $("filtros").innerHTML = ["todas", ...Object.keys(CATS)]
        .map((c) => `<button class="chip${c === filtro ? " on" : ""}" data-c="${c}" type="button">${c === "todas" ? "Todas" : CATS[c]}</button>`)
        .join("");
    const itens = notas.filter((n) => (filtro === "todas" || n.categoria === filtro) && (!q || n.texto.toLowerCase().includes(q)));
    $("listaNotas").innerHTML = itens.length
        ? itens.map((n) => `<div class="card item"><div>
        <span class="tag">${esc(CATS[n.categoria] ?? n.categoria)}</span>
        <div class="txt">${esc(n.texto)}</div>
        <div class="meta">${new Date(n.criado_em).toLocaleDateString("pt-BR")}</div>
      </div><div class="acoes"><button class="ghost" data-ed="${n.id}">Editar</button><button class="ghost" data-del="${n.id}">Excluir</button></div></div>`).join("")
        : '<div class="empty">A Nina ainda não sabe nada sobre você. Conte acima!</div>';
}
$("add").addEventListener("click", async () => {
    const texto = val("txt");
    if (!texto)
        return aviso("msg", "Escreva o que a Nina deve saber.");
    if (sensivel(texto))
        return aviso("msg", SENSIVEL);
    const { error } = await supabase.from("notas").insert({ texto: texto.slice(0, 2000), categoria: $("cat").value });
    if (error)
        return aviso("msg", "Erro: " + error.message);
    $("txt").value = "";
    aviso("msg", "Salvo! A Nina já sabe.", true);
    carregarNotas();
});
$("cat").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("busca").addEventListener("input", renderNotas);
$("filtros").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-c]");
    if (b) {
        filtro = b.dataset.c;
        renderNotas();
    }
});
$("listaNotas").addEventListener("click", async (ev) => {
    const alvo = ev.target;
    const del = alvo.closest("button[data-del]");
    const ed = alvo.closest("button[data-ed]");
    if (del && confirm("Excluir esta informação?")) {
        await supabase.from("notas").delete().eq("id", del.dataset.del);
        carregarNotas();
    }
    else if (ed) {
        const novo = prompt("Editar:", notas.find((n) => n.id === ed.dataset.ed)?.texto ?? "")?.trim();
        if (!novo)
            return;
        if (sensivel(novo))
            return alert(SENSIVEL);
        await supabase.from("notas").update({ texto: novo, atualizado_em: new Date().toISOString() }).eq("id", ed.dataset.ed);
        carregarNotas();
    }
});
// ---------- respostas fixas (avançado) ----------
async function carregarEnsinos() {
    const { data } = await supabase.from("ensinos").select("*").order("criado_em", { ascending: false });
    ensinos = (data ?? []);
    $("listaEnsinos").innerHTML = ensinos.map((e) => `<div class="meta">• "${esc(e.gatilhos.replace(/\n/g, " | "))}" → ${esc(e.resposta.replace(/\n/g, " | "))} <button class="ghost" data-delens="${e.id}">x</button></div>`).join("");
}
$("ensinar").addEventListener("click", async () => {
    if (!val("gat") || !val("res"))
        return aviso("msgEns", "Preencha os dois campos.");
    const { error } = await supabase.from("ensinos").insert({ gatilhos: val("gat"), resposta: val("res") });
    if (error)
        return aviso("msgEns", "Erro: " + error.message);
    $("gat").value = "";
    $("res").value = "";
    aviso("msgEns", "Aprendi!", true);
    carregarEnsinos();
});
$("listaEnsinos").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-delens]");
    if (b) {
        await supabase.from("ensinos").delete().eq("id", b.dataset.delens);
        carregarEnsinos();
    }
});
// ---------- ditado ----------
$("mic").addEventListener("click", () => {
    if (!microfoneSuportado)
        return aviso("msg", "Seu navegador não suporta ditado. Use o Chrome.");
    const b = $("mic");
    b.textContent = "🎙️ Ouvindo...";
    const volta = () => { b.textContent = "🎤 Ditar"; };
    ouvir({
        aoTexto: (t) => { const c = $("txt"); c.value = (c.value ? c.value + " " : "") + t; },
        aoFim: volta,
        aoErro: volta,
    });
});
// ---------- voz ----------
function montarVozes() {
    const vozes = listarVozes();
    const atual = vozEscolhida();
    $("voz").innerHTML = '<option value="">Automática (a melhor do aparelho)</option>' +
        vozes.map((v) => `<option value="${esc(v.nome)}"${v.nome === atual ? " selected" : ""}>${esc(v.nome)} (${v.lang})${v.fem ? " ♀" : ""}${v.natural ? " ★" : ""}</option>`).join("");
    $("vozInfo").textContent = vozes.length
        ? "★ = voz natural, ♀ = parece feminina. As melhores aparecem primeiro."
        : "Nenhuma voz em português encontrada neste aparelho/navegador.";
}
aoCarregarVozes(montarVozes);
$("voz").addEventListener("change", () => definirVozEscolhida($("voz").value));
$("testarVoz").addEventListener("click", () => falar("Oi! Eu sou a Nina. Está tudo bem com você?", true));
// ---------- início ----------
const { data: { session } } = await supabase.auth.getSession();
if (!session)
    location.href = "index.html";
else {
    carregarPerfil();
    carregarNotas();
    carregarEnsinos();
}