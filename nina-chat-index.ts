// deno-lint-ignore-file no-explicit-any
// Edge Function (Deno): chat da Nina — versão GRATUITA, sem IA externa.
// Entende frases simples em português: "marca dentista quinta às 15h", "o que tenho amanhã?"
import { createClient } from "npm:@supabase/supabase-js@2";

// ==== PARSER INICIO
type Dia = { y: number; m: number; d: number };

const TZ = "America/Sao_Paulo";
const pad = (n: number) => String(n).padStart(2, "0");

// minúsculas e sem acento, mantendo o MESMO tamanho do texto original
function semAcento(s: string): string {
    return Array.from(s.normalize("NFC"))
        .map((c) => (c.length === 1 ? (c.normalize("NFD").replace(/[\u0300-\u036f]/g, "")[0] ?? c) : c))
        .join("")
        .toLowerCase();
}

function hojeBR(agora = new Date()): Dia & { dow: number } {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(agora).split("-").map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function somar(b: Dia, n: number): Dia {
    const t = new Date(Date.UTC(b.y, b.m - 1, b.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const dataValida = (x: Dia) => {
    const t = new Date(Date.UTC(x.y, x.m - 1, x.d));
    return t.getUTCFullYear() === x.y && t.getUTCMonth() === x.m - 1 && t.getUTCDate() === x.d;
};

const antes = (a: Dia, b: Dia) => a.y * 10000 + a.m * 100 + a.d < b.y * 10000 + b.m * 100 + b.d;

function limparTitulo(t: string): string {
    let s = t.replace(/\s+/g, " ").trim();
    s = s.replace(
        /^(?:por favor[, ]*)?(?:me\s+)?(?:marcar|marca|agendar|agenda|anotar|anota|criar|cria|colocar|coloca|adicionar|adiciona|lembrar|lembra|registrar|registra)(?:-me)?\s*(?:de\s+|que\s+|um\s+|uma\s+|o\s+|a\s+)*(?:compromisso\s*(?:de\s+|com\s+)?)?(?:na\s+(?:minha\s+)?agenda\s*)?/i,
        "",
    );
    s = s.replace(/\s+(?:na|em)\s+(?:minha\s+)?agenda\b/i, "");
    for (let i = 0; i < 6; i++) {
        const antesS = s;
        s = s.replace(/^(?:para|pra|pro|no|na|em|as|às|ao|à|de|do|da|o|a|um|uma|e)\s+/i, "")
            .replace(/\s+(?:para|pra|pro|no|na|em|as|às|ao|à|de|do|da|e|ate|até)$/i, "")
            .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "");
        if (s === antesS) break;
    }
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

interface Achado { dia?: Dia; hora?: string; titulo: string; temComando: boolean }

function interpretar(texto: string, agora = new Date()): Achado {
    const orig = texto.normalize("NFC");
    const n = semAcento(orig);
    const hoje = hojeBR(agora);
    const cortes: [number, number][] = [];
    let dia: Dia | undefined;
    let hora: string | undefined;
    let m: RegExpExecArray | null;
    const pega = (re: RegExp) => {
        const r = re.exec(n);
        if (r) cortes.push([r.index, r.index + r[0].length]);
        return r;
    };

    // ----- data -----
    if ((m = pega(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
        let y = m[3] ? Number(m[3]) : hoje.y;
        if (y < 100) y += 2000;
        dia = { y, m: Number(m[2]), d: Number(m[1]) };
        if (!m[3] && dataValida(dia) && antes(dia, hoje)) dia.y += 1;
    } else if (pega(/\bdepois de amanha\b/)) dia = somar(hoje, 2);
    else if (pega(/\bamanha\b/)) dia = somar(hoje, 1);
    else if (pega(/\bhoje\b/)) dia = { y: hoje.y, m: hoje.m, d: hoje.d };
    else if ((m = pega(/\bdia (\d{1,2})\b(?!\/)/))) {
        const d = Number(m[1]);
        let mes = hoje.m, ano = hoje.y;
        if (d < hoje.d) { mes++; if (mes > 12) { mes = 1; ano++; } }
        dia = { y: ano, m: mes, d };
    } else if ((m = pega(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[- ]feira)?\b(?: que vem)?/))) {
        const alvo = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"].indexOf(m[1]);
        let delta = (alvo - hoje.dow + 7) % 7;
        if (delta === 0) delta = 7;
        dia = somar(hoje, delta);
    }

    // ----- hora -----
    let h: number | undefined, min = 0;
    if ((m = pega(/\b(?:as )?(\d{1,2}):(\d{2})\b/))) { h = Number(m[1]); min = Number(m[2]); }
    else if ((m = pega(/\b(?:as )?(\d{1,2})\s*(?:h|hs|horas?)(?:\s*(\d{2}))?(?![a-z])/))) { h = Number(m[1]); min = m[2] ? Number(m[2]) : 0; }
    else if ((m = pega(/\bas (\d{1,2})(?![\d:\/])/))) { h = Number(m[1]); }
    else if (pega(/\bmeio[- ]dia\b/)) { h = 12; }

    if (h !== undefined) {
        const per = /\b(?:da |de |pela |a )?(manha|tarde|noite)\b/.exec(n);
        if (per) {
            cortes.push([per.index, per.index + per[0].length]);
            if ((per[1] === "tarde" || per[1] === "noite") && h < 12) h += 12;
        }
        if (h <= 23 && min <= 59) hora = `${pad(h)}:${pad(min)}`;
    }

    // ----- título: o que sobra depois de tirar data e hora -----
    let sobra = "";
    let pos = 0;
    for (const [a, b] of cortes.sort((x, y) => x[0] - y[0])) {
        if (a >= pos) { sobra += orig.slice(pos, a) + " "; pos = b; }
    }
    sobra += orig.slice(pos);

    const temComando = /^\s*(?:por favor[, ]*)?(?:me\s+)?(?:marca|marcar|agenda|agendar|anota|anotar|cria|criar|coloca|colocar|adiciona|adicionar|lembra|lembrar|registra|registrar)\b/.test(n);
    return { dia, hora, titulo: limparTitulo(sobra), temComando };
}

function ehListagem(texto: string): boolean {
    const n = semAcento(texto);
    return /\b(o que (eu )?tenho|o que tem|que compromissos?|meus compromissos|minha agenda|quais (sao )?(os )?compromissos|tenho (algo|compromisso)|proximos compromissos|listar|ver (a )?agenda|mostra(r)? (a )?agenda|agenda d[eo] (hoje|amanha|semana))\b/.test(n) &&
        !/\b\d{1,2}\s*(h|:)/.test(n) && !/\b(anotei|anotad\w*|notas?|sobre|guardad\w*|sei)\b/.test(n);
}

function periodoListagem(texto: string, agora = new Date()) {
    const n = semAcento(texto);
    const hoje = hojeBR(agora);
    const dia0 = (d: Dia) => new Date(`${d.y}-${pad(d.m)}-${pad(d.d)}T00:00:00-03:00`);
    const fimDia = (d: Dia) => new Date(dia0(somar(d, 1)).getTime() - 1000);
    if (/\bamanha\b/.test(n)) { const a = somar(hoje, 1); return { ini: dia0(a), fim: fimDia(a), rotulo: "amanhã" }; }
    if (/\bhoje\b/.test(n)) return { ini: agora, fim: fimDia(hoje), rotulo: "hoje" };
    if (/\bmes\b/.test(n)) return { ini: agora, fim: new Date(agora.getTime() + 30 * 864e5), rotulo: "nos próximos 30 dias" };
    return { ini: agora, fim: new Date(agora.getTime() + 7 * 864e5), rotulo: "nos próximos 7 dias" };
}

const PERGUNTA = /^(Para qual dia|Que horas|Qual é o compromisso)/;

function juntarPendentes(hist: { role: string; content: string }[], atual: string): string {
    const partes = [atual];
    for (let i = hist.length - 1; i >= 1; i--) {
        if (hist[i].role === "assistant" && PERGUNTA.test(hist[i].content) && hist[i - 1].role === "user") {
            partes.unshift(hist[i - 1].content);
            i--;
        } else break;
    }
    return partes.join(" ");
}
// ----- notas -----
const CATS: Record<string, string> = {
    eu: "Sobre mim", familia: "Família", pais: "Meus pais", trabalho: "Trabalho e mercado", outros: "Outros",
};
const SINONIMOS: Record<string, string> = {
    eu: "eu mim pessoal", familia: "familia familiar parentes irmao irma", pais: "pais pai mae",
    trabalho: "trabalho emprego mercado carreira profissao vaga", outros: "",
};
const STOP = new Set(("de da do das dos que qual quais quem quando onde como quanto sobre meu minha meus minhas eu mim anotei " +
    "anotado anotada anotou sei tenho fala diz conta uma uns umas para com por pra pro foi era sao ser tem ter tinha esta estao " +
    "isso essa esse algo tudo favor nos nas aos ele ela").split(" "));

function tokens(t: string): string[] {
    return semAcento(t).split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !STOP.has(x));
}
function casa(a: string, b: string): boolean {
    if (a === b) return true;
    const [c, l] = a.length <= b.length ? [a, b] : [b, a];
    if (c.length >= 3 && l.startsWith(c) && l.length - c.length <= 3) return true;
    return a.length >= 6 && b.length >= 6 && a.slice(0, 5) === b.slice(0, 5);
}
function buscarNotas(pergunta: string, notas: { categoria: string; texto: string }[]) {
    const q = [...new Set(tokens(pergunta))];
    if (!q.length) return [];
    const minimo = Math.max(1, Math.floor(q.length / 2));
    return notas
        .map((n) => {
            const nt = tokens(n.texto + " " + (SINONIMOS[n.categoria] ?? ""));
            return { ...n, score: q.filter((t) => nt.some((x) => casa(t, x))).length };
        })
        .filter((n) => n.score >= minimo)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}
function adivinharCategoria(t: string): string {
    const n = semAcento(t);
    if (/\b(pai|mae|pais|padrasto|madrasta)\b/.test(n)) return "pais";
    if (/\b(familia|irmao|irma|filho|filha|esposa|marido|primo|prima|tio|tia|avo|avos|sogro|sogra|sobrinho|sobrinha)\b/.test(n)) return "familia";
    if (/\b(trabalho|emprego|vaga|salario|empresa|carreira|mercado|curriculo|entrevista|chefe)\b/.test(n)) return "trabalho";
    if (/\b(eu|meu|minha|meus|minhas)\b/.test(n)) return "eu";
    return "outros";
}
const pareceSensivel = (t: string) =>
    /\bsenha\b/i.test(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t) || /\b(?:\d{4}[ -]?){3}\d{4}\b/.test(t);
const SENSIVEL = "Por segurança, não guardo senhas, cartões nem CPF. Tire esse dado e tente de novo.";
// ==== PARSER FIM

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
        timeZone: TZ, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
    });

const AJUDA =
    "Não entendi. Tente assim:\n• marca dentista quinta às 15h\n• reunião dia 20 às 9h30\n• me lembra de ligar pro João amanhã às 10h\n• o que tenho amanhã?";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ erro: "Faça login." }, 401);

    // Cliente que age COMO o usuário logado (as regras de segurança do banco valem)
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
    });
    const { data: u, error: eu } = await supabase.auth.getUser();
    if (eu || !u?.user) return json({ erro: "Sessão inválida." }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }
    const mensagem = String(body?.mensagem ?? "").trim().slice(0, 500);
    if (!mensagem) return json({ erro: "Mensagem vazia." }, 400);

    const historico: { role: string; content: string }[] = (Array.isArray(body?.historico) ? body.historico : [])
        .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
        .slice(-10);

    // ----- listar -----
    if (ehListagem(mensagem)) {
        const { ini, fim, rotulo } = periodoListagem(mensagem);
        const { data, error } = await supabase.from("compromissos").select("titulo,data_hora")
            .gte("data_hora", ini.toISOString()).lte("data_hora", fim.toISOString()).order("data_hora");
        if (error) return json({ resposta: `Erro ao listar: ${error.message}` });
        if (!data?.length) return json({ resposta: `Você não tem compromissos ${rotulo}.` });
        return json({ resposta: `Seus compromissos ${rotulo}:\n` + data.map((c: any) => `• ${c.titulo}: ${fmt(c.data_hora)}`).join("\n") });
    }

    const r = interpretar(juntarPendentes(historico, mensagem));
    const nn = semAcento(mensagem);

    // ----- guardar nota ("anota que ...") -----
    const mNota = /^\s*(?:por favor[, ]*)?(?:me\s+)?(?:anotar|anota|guardar|guarda|salvar|salva|memorizar|memoriza|registrar|registra)\b\s*(?:que\b)?\s*[:,-]?\s*(\S[\s\S]*)$/.exec(nn);
    if (mNota && !(r.dia && r.hora)) {
        const conteudo = mensagem.slice(nn.length - mNota[1].length).trim();
        if (pareceSensivel(conteudo)) return json({ resposta: SENSIVEL });
        const cat = adivinharCategoria(conteudo);
        const { error } = await supabase.from("notas").insert({ texto: conteudo.slice(0, 2000), categoria: cat });
        if (error) return json({ resposta: `Não consegui anotar: ${error.message} (você rodou o notas.sql?)` });
        return json({ resposta: `Anotado em "${CATS[cat]}": ${conteudo}` });
    }

    // ----- perguntar às notas -----
    const respondendoPergunta = PERGUNTA.test(historico[historico.length - 1]?.content ?? "");
    if (!r.temComando && !(r.dia && r.hora) && !respondendoPergunta) {
        const { data, error } = await supabase.from("notas").select("categoria,texto")
            .order("criado_em", { ascending: false }).limit(1000);
        if (error) return json({ resposta: `Erro ao consultar as notas: ${error.message}` });
        const achadas = buscarNotas(mensagem, data ?? []);
        if (achadas.length) {
            return json({ resposta: achadas.length === 1 ? achadas[0].texto : achadas.map((x) => `• ${x.texto}`).join("\n") });
        }
        if (/\?\s*$/.test(mensagem) || /^(qual|quais|quem|quando|onde|como|quanto|o que|me (fala|diz|conta))/.test(nn)) {
            return json({ resposta: "Não tenho nada anotado sobre isso." });
        }
    }

    // ----- criar compromisso -----
    if (!r.temComando && !r.dia && !r.hora) return json({ resposta: AJUDA });
    if (!r.titulo) return json({ resposta: "Qual é o compromisso?" });
    if (!r.dia) return json({ resposta: `Para qual dia é "${r.titulo}"?` });
    if (!dataValida(r.dia)) return json({ resposta: "Essa data não existe. Pode me dizer de novo?" });
    if (!r.hora) return json({ resposta: `Que horas é "${r.titulo}"?` });

    // Brasil não tem horário de verão desde 2019: Brasília = UTC-3
    const dt = new Date(`${r.dia.y}-${pad(r.dia.m)}-${pad(r.dia.d)}T${r.hora}:00-03:00`);
    if (isNaN(dt.getTime())) return json({ resposta: "Não consegui entender a data e a hora. Pode repetir?" });
    if (dt.getTime() <= Date.now()) return json({ resposta: "Essa data e hora já passaram. Qual é a certa?" });

    const { error } = await supabase.from("compromissos").insert({
        titulo: r.titulo.slice(0, 120),
        data_hora: dt.toISOString(),
        canal_email: true,
        canal_whatsapp: true,
    });
    if (error) return json({ resposta: `Não consegui salvar: ${error.message}` });

    const emBreve = dt.getTime() - Date.now() < 24 * 3600 * 1000;
    return json({
        resposta: `Pronto! ${r.titulo}, ${fmt(dt.toISOString())}.\n` +
            (emBreve ? "Como é em menos de 24h, o aviso sai nos próximos minutos." : "Te aviso 1 dia antes por WhatsApp e e-mail."),
        mudou: true,
    });
});