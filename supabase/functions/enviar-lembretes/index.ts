// Edge Function (Deno) que envia os lembretes 1 dia antes do compromisso.
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = "America/Sao_Paulo";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // já disponível automaticamente na função
);

interface Compromisso {
  id: string;
  titulo: string;
  obs: string | null;
  data_hora: string;
  email: string | null;
  telefone: string | null;
  canal_email: boolean;
  canal_whatsapp: boolean;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function quando(iso: string) {
  const d = new Date(iso);
  return {
    data: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ }),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  };
}

async function enviarEmail(c: Compromisso) {
  const { data, hora } = quando(c.data_hora);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM"),
      to: [Deno.env.get("NOTIFY_EMAIL")],
      subject: `⏰ Amanhã: ${c.titulo}`,
      html: `<h2>⏰ Nina: lembrete de compromisso</h2>
             <p><b>${esc(c.titulo)}</b></p>
             <p>${data}, às ${hora}</p>
             ${c.obs ? `<p>${esc(c.obs)}</p>` : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function enviarWhatsApp(c: Compromisso) {
  const { data, hora } = quando(c.data_hora);
  // NOTIFY_PHONE pode ter vários números separados por vírgula: 5521999999999,5521988888888
  const numeros = (Deno.env.get("NOTIFY_PHONE") ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
  if (!numeros.length) throw new Error("NOTIFY_PHONE está vazio");

  const erros: string[] = [];
  for (const numero of numeros) {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${Deno.env.get("WHATSAPP_PHONE_ID")}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("WHATSAPP_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "template",
          template: {
            name: Deno.env.get("WHATSAPP_TEMPLATE") ?? "lembrete_compromisso",
            language: { code: "pt_BR" },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: c.titulo },
                { type: "text", text: data },
                { type: "text", text: hora },
              ],
            }],
          },
        }),
      },
    );
    if (!res.ok) erros.push(`${numero}: WhatsApp ${res.status}: ${await res.text()}`);
  }

  // Só considera falha se NENHUM número recebeu
  if (erros.length === numeros.length) throw new Error(erros.join(" | "));
  if (erros.length) console.error("Falha parcial no WhatsApp:", erros.join(" | "));
}

Deno.serve(async (req) => {
  // Só o agendador (pg_cron) conhece este segredo
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Não autorizado", { status: 401 });
  }

  const agora = new Date();
  const limite = new Date(agora.getTime() + 24 * 3600 * 1000);

  const { data: pendentes, error } = await supabase
    .from("compromissos")
    .select("id")
    .eq("lembrete_enviado", false)
    .gt("data_hora", agora.toISOString())
    .lte("data_hora", limite.toISOString());

  if (error) return new Response(error.message, { status: 500 });

  let enviados = 0, falhas = 0;

  for (const { id } of pendentes ?? []) {
    // "Reserva" o compromisso para evitar envio duplicado se duas execuções se cruzarem
    const { data: c } = await supabase
      .from("compromissos")
      .update({ lembrete_enviado: true })
      .eq("id", id)
      .eq("lembrete_enviado", false)
      .select("*")
      .maybeSingle<Compromisso>();
    if (!c) continue;

    const erros: string[] = [];
    let ok = false;

    if (c.canal_email) {
      try { await enviarEmail(c); ok = true; } catch (e) { erros.push(`email: ${(e as Error).message}`); }
    }
    if (c.canal_whatsapp) {
      try { await enviarWhatsApp(c); ok = true; } catch (e) { erros.push(`whatsapp: ${(e as Error).message}`); }
    }

    // Se nenhum canal funcionou, libera para tentar de novo no próximo ciclo
    await supabase
      .from("compromissos")
      .update({
        lembrete_enviado: ok,
        ultimo_erro: erros.length ? erros.join(" | ").slice(0, 500) : null,
      })
      .eq("id", id);

    ok ? enviados++ : falhas++;
  }

  return Response.json({ enviados, falhas });
});