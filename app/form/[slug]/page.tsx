import { queryOne, Usuario } from "@/lib/db";
import FormPublico from "./FormPublico";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

export default async function FormPage({ params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  // Aceita o email completo OU só a parte antes do @ (slug limpo, ex.: /form/joao),
  // evitando o problema de rotas de página com sufixo ".app".
  const lider = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE (lower(email) = $1 OR lower(split_part(email,'@',1)) = $1) AND ativo = 1 LIMIT 1",
    [slug]
  );

  return (
    <div className="form-publico-wrap">
      {lider ? (
        <FormPublico slug={slug} liderNome={lider.nome} />
      ) : (
        <div className="form-publico-card" style={{ textAlign: "center" }}>
          <div style={{ color: "var(--muted)", marginBottom: 8 }}>
            <Icon name="link" size={40} />
          </div>
          <h2 style={{ margin: "0 0 6px" }}>Link inválido</h2>
          <p style={{ color: "var(--muted)" }}>
            Este link de cadastro não existe ou foi desativado.
          </p>
        </div>
      )}
    </div>
  );
}
