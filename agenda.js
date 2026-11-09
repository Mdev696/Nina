// @ts-ignore  (import direto da internet; o navegador resolve, o TypeScript não precisa dos tipos)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm";
// ====== PREENCHA AQUI (Supabase > Project Settings > API) ======
const SUPABASE_URL = "https://hpwnhczyvmvyznmnnlee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwd25oY3p5dm12eXpubW5ubGVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTYyODUsImV4cCI6MjA5NzQ3MjI4NX0.WRzXI2l_OovmQz40wvtog3_AUZNbfgGYO6kDVp1g1Fc"; // anon/public. NUNCA use a service_role aqui
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtData = (d) => d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const fmtHora = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_MS = 24 * 3600 * 1000;
if (SUPABASE_URL.startsWith("COLE_")) {
    $("telaLogin").classList.remove("hide");
    $("msg").className = "err";
    $("msg").textContent = "Falta colocar a URL e a anon key do Supabase no início do arquivo agenda.ts.";
    throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let intervalo;
function mostrar(logado) {
    $("telaLogin").classList.toggle("hide", logado);
    $("telaAgenda").classList.toggle("hide", !logado);
    clearInterval(intervalo);
    if (logado) {
        carregar();
        intervalo = window.setInterval(carregar, 60000);
    }
}
// ---------- login ----------
function msgLogin(texto, ok = false) {
    $("msg").className = ok ? "ok" : "err";
    $("msg").textContent = texto;
}
$("btnEntrar").addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithPassword({
        email: $("lEmail").value.trim(),
        password: $("lSenha").value,
    });
    if (error) {
        msgLogin(error.message.includes("Email not confirmed")
            ? "Confirme seu e-mail (veja a caixa de entrada) e tente de novo."
            : "E-mail ou senha incorretos.");
    }
});
$("btnCriar").addEventListener("click", async () => {
    const { data, error } = await supabase.auth.signUp({
        email: $("lEmail").value.trim(),
        password: $("lSenha").value,
    });
    if (error)
        return msgLogin(error.message);
    if (!data.session)
        msgLogin("Conta criada! Confirme o e-mail que enviamos e depois clique em Entrar.", true);
});
$("btnSair").addEventListener("click", () => supabase.auth.signOut());
supabase.auth.onAuthStateChange((_evento, sessao) => mostrar(!!sessao));
// ---------- agenda ----------
async function carregar() {
    const { data, error } = await supabase
        .from("compromissos")
        .select("*")
        .gte("data_hora", new Date().toISOString())
        .order("data_hora");
    if (error) {
        $("lista").innerHTML = `<div class="empty err">Erro ao carregar: ${esc(error.message)}</div>`;
        return;
    }
    render((data ?? []));
}
function render(eventos) {
    const agora = Date.now();
    const proximos = eventos.filter((e) => new Date(e.data_hora).getTime() - agora <= DIA_MS);
    $("avisos").innerHTML = proximos
        .map((e) => {
            const d = new Date(e.data_hora);
            return `<div class="card alert"><b>⏰ Em menos de 24h:</b> ${esc(e.titulo)} — ${fmtData(d)}, ${fmtHora(d)}</div>`;
        })
        .join("");
    if (!eventos.length) {
        $("lista").innerHTML = '<div class="empty">Nenhum compromisso futuro.</div>';
        return;
    }
    let html = "";
    let ultimoDia = "";
    for (const e of eventos) {
        const d = new Date(e.data_hora);
        const dia = fmtData(d);
        if (dia !== ultimoDia) {
            html += `<div class="day">${dia}</div>`;
            ultimoDia = dia;
        }
        const aviso = new Date(d.getTime() - DIA_MS);
        html += `<div class="card item"><div>
      <h3>${esc(e.titulo)}</h3>
      <div class="meta">🕐 ${fmtHora(d)}${e.obs ? " · " + esc(e.obs) : ""}</div>
      <div class="meta">🔔 Aviso em ${aviso.toLocaleDateString("pt-BR")} às ${fmtHora(aviso)}</div>
      ${e.canal_whatsapp ? '<span class="tag">WhatsApp</span>' : ""}${e.canal_email ? '<span class="tag">E-mail</span>' : ""}
      ${e.lembrete_enviado ? '<span class="tag sent">✓ aviso enviado</span>' : ""}
    </div><button class="ghost" data-id="${e.id}">Excluir</button></div>`;
    }
    $("lista").innerHTML = html;
}
$("add").addEventListener("click", async () => {
    const titulo = $("titulo").value.trim();
    const data = $("data").value;
    const hora = $("hora").value;
    const usaMail = $("cMail").checked;
    const usaWpp = $("cWpp").checked;
    const m = $("msg2");
    const erro = (t) => { m.className = "err"; m.textContent = t; };
    if (!titulo || !data || !hora)
        return erro("Preencha título, data e hora.");
    const { error } = await supabase.from("compromissos").insert({
        titulo,
        obs: $("obs").value.trim() || null,
        data_hora: new Date(`${data}T${hora}`).toISOString(),
        canal_email: usaMail,
        canal_whatsapp: usaWpp,
    });
    if (error)
        return erro("Erro ao salvar: " + error.message);
    $("titulo").value = "";
    $("obs").value = "";
    m.className = "ok";
    m.textContent = "Compromisso salvo!";
    setTimeout(() => (m.textContent = ""), 2500);
    carregar();
});
$("lista").addEventListener("click", async (ev) => {
    const botao = ev.target.closest("button[data-id]");
    if (!botao)
        return;
    await supabase.from("compromissos").delete().eq("id", botao.dataset.id);
    carregar();
});
let historico = [];
function bolha(texto, quem) {
    const d = document.createElement("div");
    d.className = `bolha ${quem}`;
    d.textContent = texto;
    $("chat").appendChild(d);
    $("chat").scrollTop = $("chat").scrollHeight;
}
async function enviarChat() {
    const campo = $("chatMsg");
    const botao = $("chatEnviar");
    const texto = campo.value.trim();
    if (!texto)
        return;
    campo.value = "";
    bolha(texto, "eu");
    botao.disabled = true;
    try {
        const { data, error } = await supabase.functions.invoke("nina-chat", {
            body: { mensagem: texto, historico },
        });
        if (error)
            throw error;
        const resposta = data?.resposta ?? "Não entendi, pode repetir?";
        bolha(resposta, "nina");
        const novas = [
            { role: "user", content: texto },
            { role: "assistant", content: resposta },
        ];
        historico = [...historico, ...novas].slice(-10);
        if (data?.mudou)
            carregar();
    }
    catch {
        bolha("Não consegui falar com a Nina agora. Tente de novo.", "nina");
    }
    finally {
        botao.disabled = false;
        campo.focus();
    }
}
$("chatEnviar").addEventListener("click", enviarChat);
$("chatMsg").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter")
        enviarChat();
});
// ---------- estado inicial ----------
const { data: { session } } = await supabase.auth.getSession();
mostrar(!!session);