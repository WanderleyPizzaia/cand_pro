// ============================================================
// Envio de UM disparo para UMA pessoa. Usado pelo disparo imediato
// (app/api/campanhas) e pelo agendado (lib/agendador.ts), para os dois
// mandarem e registrarem do mesmo jeito.
// ============================================================
import { execute, Agente, Pessoa, TemplateVar } from "@/lib/db";
import { normalizarNumero } from "@/lib/evolution";
import { enviarMensagemAgente, enviarTemplateMeta } from "@/lib/meta";

export function personalizar(msg: string, p: Pessoa): string {
  const primeiro = (p.nome || "").split(" ")[0];
  return msg
    .replace(/\{nome\}/gi, p.nome || "")
    .replace(/\{primeiro_nome\}/gi, primeiro)
    .replace(/\{cidade\}/gi, p.cidade || "");
}

// Valor de uma variável do template a partir da coluna mapeada de `pessoas`.
function valorCampo(campo: string | null, p: Pessoa): string {
  if (!campo) return "";
  if (campo === "primeiro_nome") return (p.nome || "").split(" ")[0];
  const v = (p as any)[campo];
  return v == null ? "" : String(v);
}

// Monta os parâmetros do CORPO do template na ordem de `pos` — um por {{n}}.
// É isto que conserta o erro (#131009): antes mandávamos SEMPRE 0 ou 1 variável,
// ignorando quantas o template realmente tem. Prioridade por variável:
//   1) campo mapeado em `pessoas`  2) mensagem livre (só se houver 1 variável
//   sem campo)  3) exemplo do template — nunca vazio (a Meta rejeita vazio).
export function montarVarsTemplate(vars: TemplateVar[], p: Pessoa, mensagem: string): string[] {
  const ord = [...vars].sort((a, b) => a.pos - b.pos);
  return ord.map((v) => {
    let val = valorCampo(v.campo, p).trim();
    if (!val && !v.campo && ord.length === 1 && mensagem.trim())
      val = personalizar(mensagem, p).trim();
    // Campo de NOME vazio (contato sem nome salvo): usa cumprimento neutro em
    // vez do exemplo do template (senão sairia "Olá Maria!" pra todo mundo).
    if (!val && (v.campo === "nome" || v.campo === "primeiro_nome")) val = "amigo(a)";
    if (!val) val = (v.exemplo || "").trim() || "-";
    return val;
  });
}

export type Disparo = {
  mensagem: string;
  template: string; // Meta: nome do template aprovado ("" no Evolution)
  idioma: string;
  tplVars: TemplateVar[] | null;
  campanhaId: number | null;
};

// Envia (Meta template ou Evolution texto) e registra no histórico da conversa.
// true = aceito pelo provedor.
export async function enviarParaPessoa(ag: Agente, p: Pessoa, d: Disparo): Promise<boolean> {
  const numero = normalizarNumero(p.whatsapp || "");
  if (!numero) return false;
  const texto = personalizar(d.mensagem, p);
  const r =
    ag.provedor === "meta"
      ? await enviarTemplateMeta(
          ag.meta_phone_id!,
          ag.meta_token!,
          numero,
          d.template,
          d.idioma,
          d.tplVars ? montarVarsTemplate(d.tplVars, p, d.mensagem) : d.mensagem ? [texto] : []
        )
      : await enviarMensagemAgente(ag, numero, texto);
  await execute(
    `INSERT INTO mensagens (agente_id, contato, contato_nome, direcao, texto, wa_id, origem, campanha_id)
     VALUES ($1,$2,$3,$4,$5,$6,'campanha',$7)`,
    [
      ag.id,
      numero,
      p.nome,
      r.ok ? "out" : "erro",
      r.ok ? texto || `[template ${d.template}]` : `Campanha falhou: ${r.erro}`,
      r.waId || null,
      d.campanhaId,
    ]
  );
  return r.ok;
}
