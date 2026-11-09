// Voz da Nina: fala (speechSynthesis) e escuta (SpeechRecognition). Grátis, roda no navegador.
export const vozSuportada = "speechSynthesis" in window;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const microfoneSuportado = !!SR;

const FEM = /(maria|francisca|luciana|fernanda|vit[oó]ria|thalita|camila|helena|joana|google portugu[eê]s do brasil|female|feminin)/i;
const MASC = /(daniel|felipe|ant[oô]nio|ricardo|jorge|\bmale\b|masculin)/i;

export function vozLigada() {
    try { return localStorage.getItem("nina:voz") !== "off"; } catch { return true; }
}
export function definirVoz(ligada) {
    try { localStorage.setItem("nina:voz", ligada ? "on" : "off"); } catch { }
    if (!ligada) calar();
}
export function vozEscolhida() {
    try { return localStorage.getItem("nina:voz-nome") || ""; } catch { return ""; }
}
export function definirVozEscolhida(nome) {
    try { localStorage.setItem("nina:voz-nome", nome || ""); } catch { }
}
export function calar() {
    if (vozSuportada) speechSynthesis.cancel();
}
function vozesPt() {
    return speechSynthesis.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith("pt"));
}
const NATURAL = /(natural|neural|online|premium|enhanced|aprimorad|google portugu[eê]s)/i;
const ehFem = (v) => FEM.test(v.name) && !MASC.test(v.name);
const nota = (v) => (NATURAL.test(v.name) ? 10 : 0) + (ehFem(v) ? 5 : 0) - (MASC.test(v.name) ? 10 : 0) + (v.lang === "pt-BR" ? 3 : 0);

// Lista as vozes em português do aparelho: as melhores (naturais/femininas) primeiro
export function listarVozes() {
    if (!vozSuportada) return [];
    return vozesPt()
        .sort((a, b) => nota(b) - nota(a))
        .map((v) => ({ nome: v.name, lang: v.lang, fem: ehFem(v), natural: NATURAL.test(v.name) }));
}
// As vozes podem demorar a carregar: avisa quando estiverem prontas
export function aoCarregarVozes(cb) {
    if (!vozSuportada) return;
    cb();
    speechSynthesis.addEventListener("voiceschanged", cb);
}
function escolherVoz() {
    const vs = vozesPt();
    const salva = vozEscolhida();
    if (salva) { const v = vs.find((x) => x.name === salva); if (v) return v; }
    return [...vs].sort((a, b) => nota(b) - nota(a))[0];
}
// aoTerminar: chamado quando ela termina de falar (usado no modo conversa)
export function falar(texto, forcar = false, aoTerminar) {
    if (!vozSuportada || !texto || (!forcar && !vozLigada())) { aoTerminar?.(); return; }
    calar();
    const limpo = texto.replace(/\(Wikipédia:[^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").replace(/[•*_#`]/g, " ").replace(/\n+/g, ". ");
    const u = new SpeechSynthesisUtterance(limpo);
    u.lang = "pt-BR";
    const v = escolherVoz();
    if (v) u.voice = v;
    if (!vozEscolhida() && !(v && NATURAL.test(v.name))) u.pitch = 1.1;
    let fim = false;
    const terminar = () => { if (!fim) { fim = true; clearTimeout(seguranca); aoTerminar?.(); } };
    // Alguns navegadores não avisam o fim de falas longas: segurança
    const seguranca = setTimeout(terminar, 8000 + limpo.length * 90);
    u.onend = terminar;
    speechSynthesis.speak(u);
}
export function ouvir({ aoTexto, aoFim, aoErro }) {
    if (!SR) { aoErro?.("sem-suporte"); aoFim?.(); return null; }
    calar();
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => aoTexto?.(e.results[0][0].transcript);
    rec.onerror = (e) => aoErro?.(e.error);
    rec.onend = () => aoFim?.();
    try { rec.start(); } catch { aoFim?.(); }
    return rec;
}