import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query, Agente, quotaEfetiva, disparosUsadosHoje } from "@/lib/db";
import { statusConfig } from "@/lib/config";
import Icon from "../../components/Icon";
import DisparosCliente from "./DisparosCliente";
import { agentesDaSessao } from "@/lib/escopo";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  const sessao = getSessao()!;
  if (!["ADMIN", "COORDENACAO", "CANDIDATO"].includes(sessao.perfil)) redirect("/");

  // Isolamento: coordenação vinculada só dispara pelos números do seu candidato.
  const escAgentes = await agentesDaSessao(sessao);
  const bound = escAgentes !== null;
  const inIds = bound ? (escAgentes!.length ? escAgentes! : [-1]).join(",") : "";
  const filtroAg = bound ? `AND id IN (${inIds})` : "";
  const filtroPes = bound ? `AND agente_id IN (${inIds})` : "";

  const agentesRaw = await query<Agente>(
    `SELECT * FROM agentes WHERE 1=1 ${filtroAg} ORDER BY id`
  );
  const agentes = await Promise.all(
    agentesRaw.map(async (a) => ({
      id: a.id,
      candidato: a.candidato,
      telefone: a.telefone,
      provedor: a.provedor,
      pronto:
        a.provedor === "meta"
          ? !!(a.meta_phone_id && a.meta_token)
          : !!a.instancia,
      quota: quotaEfetiva(a),
      disparosHoje: await disparosUsadosHoje(a.id),
    }))
  );
  const cidades = (
    await query<{ cidade: string }>(
      `SELECT DISTINCT cidade FROM pessoas WHERE cidade IS NOT NULL AND cidade <> '' ${filtroPes} ORDER BY cidade`
    )
  ).map((c) => c.cidade);
  const categorias = (
    await query<{ categoria: string }>(
      `SELECT DISTINCT categoria FROM pessoas WHERE categoria IS NOT NULL AND categoria <> '' ${filtroPes} ORDER BY categoria`
    )
  ).map((c) => c.categoria);
  const st = await statusConfig();

  return (
    <>
      <h1 className="page-title">
        <Icon name="megaphone" /> Disparos
      </h1>
      <p className="page-sub">
        Planeje, agende e monitore os disparos por candidato — quantidade, grupo de
        contatos e quantos responderam, com rastreabilidade.
      </p>

      {!(st.evolutionUrl && st.evolutionApiKey) && (
        <div className="msg err" style={{ marginBottom: 16 }}>
          Evolution não configurada — configure em <b>Configurações</b> antes de disparar.
        </div>
      )}

      <DisparosCliente agentes={agentes} cidades={cidades} categorias={categorias} />
    </>
  );
}
