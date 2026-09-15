import { getConfig } from "@/lib/config";
import { getSessao } from "@/lib/auth";
import Icon from "../../components/Icon";
import AgendaConectar from "./AgendaConectar";

export const dynamic = "force-dynamic";

// Aceita um ID de calendário (constrói o embed) ou um link/URL completo.
function montarSrc(valor: string): string {
  const s = valor.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(
    s
  )}&ctz=America/Sao_Paulo&mode=AGENDA`;
}

export default async function AgendaPage() {
  const sessao = getSessao()!;
  const ehAdmin = sessao.perfil === "ADMIN";
  // Agenda POR CANDIDATO: candidato/equipe vê o calendário do seu candidato
  // (config GOOGLE_CALENDAR_<primeironome>); ADMIN e demais veem o global.
  const cand = (sessao.escopoCandidato ||
    (sessao.perfil === "CANDIDATO" ? sessao.nome : "")
  ).trim().split(" ")[0].toLowerCase();
  const especifico = cand ? await getConfig(`GOOGLE_CALENDAR_${cand}`) : "";
  const cal = especifico || (await getConfig("GOOGLE_CALENDAR_SRC"));
  // Trava em "Conectar conta Google" até a conta ser conectada (OAuth). Enquanto
  // não conectada, mostra a tela de conexão (Google + CAND PRO), mesmo que exista um
  // embed antigo configurado.
  const conectado = (await getConfig("GOOGLE_CONECTADO")) === "1";

  return (
    <>
      <h1 className="page-title">
        <Icon name="calendar" /> Agenda
      </h1>
      <p className="page-sub">
        Seus eventos, tarefas e e-mails no painel · com a tecnologia CAND PRO
      </p>

      {!conectado ? (
        <AgendaConectar />
      ) : cal ? (
        <div className="agenda-embed">
          <iframe
            src={montarSrc(cal)}
            title="Google Calendar"
            style={{ border: 0 }}
            width="100%"
            height="720"
            frameBorder={0}
            scrolling="no"
          />
        </div>
      ) : (
        <div className="form-card" style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>
            <Icon name="calendar" size={16} />Conectar o Google Calendar
          </h3>
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            A Agenda mostra o seu Google Calendar <b>em tempo real</b> (só
            leitura/espelhamento).{" "}
            {ehAdmin ? (
              <>
                Vá em <b>Configurações</b> e cole o <b>ID do calendário</b> (ou o
                link de incorporação).
              </>
            ) : (
              <>Peça ao administrador para configurar em Configurações.</>
            )}
          </p>
          <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13 }}>
            Como achar: no Google Calendar → <b>Configurações</b> → selecione o
            calendário → <b>Integrar calendário</b> → copie o <b>ID do calendário</b>.
            Para que toda a equipe veja, deixe o calendário <b>público</b> (ou
            compartilhe com as contas Google da equipe).
          </p>
        </div>
      )}
    </>
  );
}
