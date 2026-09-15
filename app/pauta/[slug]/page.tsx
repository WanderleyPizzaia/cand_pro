import { queryOne, Usuario } from "@/lib/db";
import PautaPublica from "./PautaPublica";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

// Branding por gabinete (foto/numero/lema). Sem entrada = layout simples, centralizado.
const MARCA: Record<string, { foto: string; numero?: string; lema?: string; cargo?: string }> = {
  murilo: {
    foto: "/pauta-murilo.jpg",
    numero: "12789",
    cargo: "Deputado Estadual · SP",
    lema: "Diálogo para construir. Firmeza para defender. Direitos acima de favores.",
  },
};

export default async function PautaPage({ params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  const dono = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE (lower(email) = $1 OR lower(split_part(email,'@',1)) = $1) AND ativo = 1 LIMIT 1",
    [slug]
  );

  if (!dono) {
    return (
      <div className="form-publico-wrap">
        <div className="form-publico-card" style={{ textAlign: "center" }}>
          <div style={{ color: "var(--muted)", marginBottom: 8 }}>
            <Icon name="link" size={40} />
          </div>
          <h2 style={{ margin: "0 0 6px" }}>Link inválido</h2>
          <p style={{ color: "var(--muted)" }}>Este canal de pauta não existe ou foi desativado.</p>
        </div>
      </div>
    );
  }

  const marca = MARCA[slug];

  // Sem branding: layout simples de antes.
  if (!marca) {
    return (
      <div className="form-publico-wrap">
        <PautaPublica slug={slug} gabinete={dono.nome} />
      </div>
    );
  }

  // Com branding: hero de marca (foto + nome + numero + lema) ao lado do formulário.
  return (
    <div className="pp2">
      <aside className="pp2-brand" style={{ ["--pp-foto" as string]: `url(${marca.foto})` }}>
        <div className="pp2-brand-in">
          <div className="pp2-eyebrow">Fale com o gabinete</div>
          <h1 className="pp2-nome">{dono.nome}</h1>
          {marca.numero && (
            <div className="pp2-numero">
              <span>{marca.numero}</span>
              {marca.cargo && <small>{marca.cargo}</small>}
            </div>
          )}
          {marca.lema && <p className="pp2-lema">{marca.lema}</p>}
          <ul className="pp2-selos">
            <li><Icon name="lock" size={16} /> Seus dados protegidos (LGPD)</li>
            <li><Icon name="map-pin" size={16} /> Sua demanda entra no mapa da região</li>
            <li><Icon name="message" size={16} /> O gabinete te dá retorno</li>
          </ul>
        </div>
      </aside>
      <main className="pp2-form">
        <PautaPublica slug={slug} gabinete={dono.nome} />
      </main>
    </div>
  );
}
