import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "CAND PRO · Campanha & Gestão Política",
  description:
    "Plataforma completa para estratégia e gestão política. Da estratégia à técnica.",
};

const N = (v: any) => Number(v || 0).toLocaleString("pt-BR");

export default async function CandProPage() {
  const eleitores =
    (await queryOne<{ c: number }>("SELECT COUNT(*) c FROM pessoas"))?.c ?? 0;
  const mensagens =
    (await queryOne<{ c: number }>("SELECT COUNT(*) c FROM mensagens"))?.c ?? 0;
  const cidadesN =
    (await queryOne<{ c: number }>(
      "SELECT COUNT(DISTINCT cidade) c FROM pessoas WHERE cidade<>''"
    ))?.c ?? 0;
  const candidatos = await query<{ cand: string; c: number }>(
    `SELECT split_part(a.candidato,' ',1) cand, COUNT(p.id) c
       FROM pessoas p JOIN agentes a ON a.id=p.agente_id
      GROUP BY 1 HAVING COUNT(p.id)>0 ORDER BY c DESC LIMIT 6`
  );
  const cresc = await query<{ d: string; c: number }>(
    `SELECT to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date,'DD/MM') d, COUNT(*) c
       FROM pessoas WHERE criado_em > now()-interval '14 days'
      GROUP BY (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
      ORDER BY (criado_em AT TIME ZONE 'America/Sao_Paulo')::date`
  );
  const cidades = await query<{ cidade: string; c: number }>(
    `SELECT cidade, COUNT(*) c FROM pessoas WHERE cidade<>''
      GROUP BY 1 ORDER BY c DESC LIMIT 8`
  );

  // ----- geometria dos gráficos -----
  const CORES = ["#ed1c24", "#2f74d6", "#fbba00", "#0b9247", "#bfbfbf", "#808080"];
  const totalCand = candidatos.reduce((a, b) => a + Number(b.c), 0) || 1;
  // Donut
  let acc = 0;
  const R = 52, C = 2 * Math.PI * R;
  const fatias = candidatos.map((x, i) => {
    const frac = Number(x.c) / totalCand;
    const seg = { cor: CORES[i % CORES.length], dash: frac * C, offset: -acc * C, cand: x.cand, c: Number(x.c), pct: Math.round(frac * 100) };
    acc += frac;
    return seg;
  });
  // Área (crescimento)
  const serie = cresc.map((x) => Number(x.c));
  const maxC = Math.max(1, ...serie);
  const W = 640, H = 180, pad = 8;
  const pts = serie.map((v, i) => {
    const x = pad + (i * (W - pad * 2)) / Math.max(1, serie.length - 1);
    const y = H - pad - (v / maxC) * (H - pad * 2);
    return [x, y];
  });
  const linha = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length
    ? `M${pts[0][0].toFixed(1)},${(H - pad).toFixed(1)} L` + linha.replace(/ /g, " L") + ` L${pts[pts.length - 1][0].toFixed(1)},${(H - pad).toFixed(1)} Z`
    : "";
  const maxCid = Math.max(1, ...cidades.map((c) => Number(c.c)));
  const maxCandBar = Math.max(1, ...candidatos.map((c) => Number(c.c)));

  const SETORES = [
    ["Atendimento IA", "Agentes respondem eleitores 24/7 no WhatsApp, com voz e humanização."],
    ["Captação de eleitores", "Coleta e organização de contatos por candidato, com etiqueta e base viva."],
    ["CRM eleitoral", "Cadastro geolocalizado, cidades, lideranças e histórico de cada contato."],
    ["Disparos com cadência", "Campanhas com cota diária, rastreabilidade e envio anti-bloqueio."],
    ["Agenda & compromissos", "Eventos, visitas e agenda integrada da campanha."],
    ["Conteúdo & comunicação", "Mensagens, templates e comunicação eloquente e determinística."],
    ["Dados & BI", "Métricas em tempo real, gráficos e relatórios em um só painel."],
    ["Gestão da operação", "Atribuição de responsáveis, equipe e organização completa."],
  ];

  return (
    <div className="cp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Faixa institucional */}
      <div className="cp-strip" />
      <header className="cp-top">
        <div className="cp-wrap cp-top-in">
          <div className="cp-brand">
            <span className="cp-brand-mark">CAND<span> PRO</span></span>
            <span className="cp-brand-sub">Campanha &amp; Gestão Política</span>
          </div>
          <nav className="cp-nav">
            <a href="#plataforma">Plataforma</a>
            <a href="#numeros">Números</a>
            <a href="#setores">Setores</a>
            <a href="/login" className="cp-btn">Entrar</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="cp-hero">
        <div className="cp-wrap cp-hero-in">
          <div className="cp-tag">Plataforma institucional · São Paulo</div>
          <h1>Da <span>estratégia</span> à <span>técnica</span>.<br />A campanha inteira em um só lugar.</h1>
          <p className="cp-lead">
            CAND PRO é a plataforma completa de campanha e gestão política: tecnologia,
            sistemas de mensagem, interação e inteligência artificial para potencializar
            campanhas que têm propósito.
          </p>
          <div className="cp-hero-cta">
            <a href="/login" className="cp-btn cp-btn-lg">Acessar o painel</a>
            <a href="#numeros" className="cp-btn cp-btn-ghost cp-btn-lg">Ver números reais</a>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section id="numeros" className="cp-wrap cp-kpis">
        <div className="cp-kpi cp-in" style={{ animationDelay: "0ms" }}><span className="cp-kpi-v" suppressHydrationWarning data-count={eleitores}>0</span><span className="cp-kpi-l">Eleitores na base</span></div>
        <div className="cp-kpi cp-in" style={{ animationDelay: "80ms" }}><span className="cp-kpi-v" suppressHydrationWarning data-count={mensagens}>0</span><span className="cp-kpi-l">Mensagens trocadas</span></div>
        <div className="cp-kpi cp-in" style={{ animationDelay: "160ms" }}><span className="cp-kpi-v" suppressHydrationWarning data-count={cidadesN}>0</span><span className="cp-kpi-l">Cidades alcançadas</span></div>
        <div className="cp-kpi cp-in" style={{ animationDelay: "240ms" }}><span className="cp-kpi-v" suppressHydrationWarning data-count={candidatos.length || 5}>0</span><span className="cp-kpi-l">Candidatos ativos</span></div>
      </section>

      {/* Painel Power BI */}
      <section className="cp-wrap cp-grid">
        <div className="cp-card cp-card-wide">
          <div className="cp-card-h">Captação de eleitores · últimos 14 dias</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="cp-area" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cpg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2f74d6" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#2f74d6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#cpg)" />}
            {linha && <polyline points={linha} fill="none" stroke="#2f74d6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#2f74d6" />)}
          </svg>
          <div className="cp-area-x">{cresc.map((x, i) => <span key={i}>{x.d}</span>)}</div>
        </div>

        <div className="cp-card">
          <div className="cp-card-h">Distribuição por candidato</div>
          <div className="cp-donut-wrap">
            <svg viewBox="0 0 140 140" className="cp-donut">
              <circle cx="70" cy="70" r={R} fill="none" stroke="#20242e" strokeWidth="16" />
              {fatias.map((f, i) => (
                <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={f.cor} strokeWidth="16"
                  strokeDasharray={`${f.dash} ${C - f.dash}`} strokeDashoffset={f.offset}
                  transform="rotate(-90 70 70)" strokeLinecap="butt" />
              ))}
              <text x="70" y="66" textAnchor="middle" className="cp-donut-n" suppressHydrationWarning data-count={totalCand}>0</text>
              <text x="70" y="82" textAnchor="middle" className="cp-donut-s">eleitores</text>
            </svg>
            <ul className="cp-legend">
              {fatias.map((f, i) => (
                <li key={i}><span style={{ background: f.cor }} /> {f.cand} <b>{f.pct}%</b></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="cp-card">
          <div className="cp-card-h">Eleitores por candidato</div>
          <div className="cp-bars">
            {candidatos.map((c, i) => (
              <div className="cp-bar-row" key={i}>
                <span className="cp-bar-lbl">{c.cand}</span>
                <span className="cp-bar-track"><span className="cp-bar-fill cp-grow" style={{ width: `${(Number(c.c) / maxCandBar) * 100}%`, background: CORES[i % CORES.length] }} /></span>
                <span className="cp-bar-v" suppressHydrationWarning data-count={c.c}>0</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cp-card cp-card-wide">
          <div className="cp-card-h">Top cidades</div>
          <div className="cp-bars">
            {cidades.map((c, i) => (
              <div className="cp-bar-row" key={i}>
                <span className="cp-bar-lbl cp-bar-lbl-w">{c.cidade}</span>
                <span className="cp-bar-track"><span className="cp-bar-fill cp-grow" style={{ width: `${(Number(c.c) / maxCid) * 100}%` }} /></span>
                <span className="cp-bar-v" suppressHydrationWarning data-count={c.c}>0</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Setores */}
      <section id="setores" className="cp-setores">
        <div className="cp-wrap">
          <h2>8 setores, uma operação só</h2>
          <p className="cp-sub">Automatizamos a campanha inteira, do atendimento à gestão, com a eficiência de uma empresa.</p>
          <div className="cp-setores-grid">
            {SETORES.map(([t, d], i) => (
              <div className="cp-setor" key={i}>
                <span className="cp-setor-n">{String(i + 1).padStart(2, "0")}</span>
                <b>{t}</b>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="cp-foot">
        <div className="cp-wrap cp-foot-in">
          <span className="cp-brand-mark">CAND<span> PRO</span> <em style={{ fontStyle: "normal", color: "var(--muted)", fontWeight: 600, fontSize: 11 }}>· SÃO PAULO, SÃO TODOS</em></span>
          <span>© 2026 · CAND PRO · Campanha e Gestão Política · São Paulo · Todos os direitos reservados</span>
        </div>
      </footer>

      {/* Contador 0 → total a cada carregamento (F5/entrar). Respeita reduce-motion. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fmt = function(n){ return Math.round(n).toLocaleString('pt-BR'); };
  function anima(el){
    var alvo = parseFloat(el.getAttribute('data-count')) || 0;
    if (reduz || alvo <= 0){ el.textContent = fmt(alvo); return; }
    var dur = 1200, ini = null;
    function passo(t){
      if(!ini) ini = t;
      var p = Math.min(1, (t-ini)/dur);
      var e = 1 - Math.pow(1-p, 3);
      el.textContent = fmt(alvo*e);
      if(p<1) requestAnimationFrame(passo); else el.textContent = fmt(alvo);
    }
    requestAnimationFrame(passo);
  }
  function run(){ var els = document.querySelectorAll('[data-count]'); for(var i=0;i<els.length;i++) anima(els[i]); }
  if(document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run);
})();`,
        }}
      />
    </div>
  );
}

const CSS = `
.cp-root{--navy:#0a0a0c;--blue:#2f74d6;--blue-off:#034ea2;--red:#ed1c24;--yellow:#fbba00;--spgreen:#0b9247;--gold:#fbba00;--bg:#050506;--panel:#121215;--panel2:#1a1a1f;--ink:#f4f5f7;--muted:#9aa0ac;--border:#26262c;--track:#212127;
  background:var(--bg);color:var(--ink);font-family:Verdana,Geneva,system-ui,-apple-system,sans-serif;min-height:100vh;}
.cp-root *{box-sizing:border-box;}
.cp-wrap{max-width:1120px;margin:0 auto;padding:0 20px;}
.cp-strip{height:6px;background:linear-gradient(90deg,var(--red) 0 25%,var(--yellow) 25% 50%,var(--spgreen) 50% 75%,var(--blue-off) 75% 100%);}
.cp-top{background:var(--navy);position:sticky;top:0;z-index:20;}
.cp-top-in{display:flex;align-items:center;justify-content:space-between;height:64px;}
.cp-brand{display:flex;flex-direction:column;line-height:1.05;}
.cp-brand-mark{font-weight:900;letter-spacing:.5px;color:#fff;font-size:20px;}
.cp-brand-mark span{color:var(--gold);}
.cp-brand-sub{font-size:10.5px;color:#9db8d8;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;}
.cp-nav{display:flex;align-items:center;gap:22px;}
.cp-nav a{color:#c8daf0;text-decoration:none;font-size:14px;font-weight:600;}
.cp-nav a:hover{color:#fff;}
.cp-btn{background:var(--red);color:#fff;padding:9px 16px;border-radius:9px;font-weight:800;font-size:13.5px;text-decoration:none;display:inline-block;transition:transform .15s,filter .15s;}
.cp-btn:hover{transform:translateY(-1px);filter:brightness(1.05);}
.cp-btn-ghost{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.35);}
.cp-btn-lg{padding:13px 24px;font-size:15px;}
.cp-hero{background:radial-gradient(1200px 420px at 72% -12%,#1a1c24,#000);color:#fff;padding:64px 0 88px;border-bottom:1px solid var(--border);}
.cp-tag{display:inline-block;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#dbe8f7;padding:6px 14px;border-radius:999px;font-size:12.5px;font-weight:700;letter-spacing:.3px;}
.cp-hero h1{font-size:clamp(30px,5vw,52px);line-height:1.06;font-weight:900;margin:18px 0 0;letter-spacing:-.5px;}
.cp-hero h1 span{color:var(--gold);}
.cp-lead{color:#c3d6ec;max-width:640px;font-size:clamp(15px,2vw,18px);line-height:1.55;margin:18px 0 0;}
.cp-hero-cta{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap;}
.cp-hero-by{margin-top:22px;color:#9db8d8;font-size:13px;}
.cp-hero-by b{color:#fff;}
.cp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:-52px;position:relative;z-index:5;}
.cp-kpi{background:var(--panel);border:1px solid var(--border);border-top:2px solid var(--red);border-radius:14px;padding:20px 18px;box-shadow:0 12px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:4px;}
.cp-kpi-v{font-size:clamp(24px,3.4vw,34px);font-weight:900;color:#fff;font-variant-numeric:tabular-nums;}
.cp-kpi-l{font-size:12.5px;color:var(--muted);font-weight:600;}
.cp-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:22px;}
.cp-card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:18px;box-shadow:0 6px 18px rgba(8,36,63,.05);}
.cp-card-wide{grid-column:1/-1;}
.cp-card-h{font-weight:800;color:var(--ink);font-size:14.5px;margin-bottom:14px;}
.cp-area{width:100%;height:180px;display:block;}
.cp-area-x{display:flex;justify-content:space-between;color:var(--muted);font-size:10.5px;margin-top:6px;flex-wrap:wrap;gap:4px;}
.cp-donut-wrap{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.cp-donut{width:140px;height:140px;flex-shrink:0;}
.cp-donut-n{font-size:20px;font-weight:900;fill:var(--ink);}
.cp-donut-s{font-size:9px;fill:var(--muted);}
.cp-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:13.5px;}
.cp-legend li{display:flex;align-items:center;gap:8px;color:var(--ink);}
.cp-legend span{width:11px;height:11px;border-radius:3px;display:inline-block;}
.cp-legend b{margin-left:auto;color:var(--ink);}
.cp-bars{display:flex;flex-direction:column;gap:11px;}
.cp-bar-row{display:flex;align-items:center;gap:10px;}
.cp-bar-lbl{width:64px;font-size:13px;font-weight:700;color:var(--ink);flex-shrink:0;}
.cp-bar-lbl-w{width:150px;}
.cp-bar-track{flex:1;height:12px;background:var(--track);border-radius:8px;overflow:hidden;}
.cp-bar-fill{display:block;height:100%;background:var(--blue);border-radius:8px;}
.cp-bar-v{width:56px;text-align:right;font-weight:800;color:var(--ink);font-size:13px;font-variant-numeric:tabular-nums;}
.cp-setores{background:var(--navy);color:#fff;margin-top:40px;padding:56px 0;}
.cp-setores h2{font-size:clamp(24px,3.5vw,34px);font-weight:900;margin:0;}
.cp-setores .cp-sub{color:#9db8d8;margin:8px 0 26px;font-size:15px;}
.cp-setores-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.cp-setor{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:18px;}
.cp-setor-n{color:var(--gold);font-weight:900;font-size:13px;}
.cp-setor b{display:block;margin:8px 0 6px;font-size:15px;}
.cp-setor p{color:#a9c1de;font-size:12.5px;line-height:1.5;margin:0;}
.cp-foot{background:#061a2e;color:#8fabce;}
.cp-foot-in{display:flex;align-items:center;justify-content:space-between;height:70px;font-size:12.5px;flex-wrap:wrap;gap:8px;}
.cp-foot .cp-brand-mark{font-size:16px;}
@media(max-width:820px){
  .cp-kpis{grid-template-columns:repeat(2,1fr);}
  .cp-grid{grid-template-columns:1fr;}
  .cp-setores-grid{grid-template-columns:repeat(2,1fr);}
  .cp-nav a:not(.cp-btn){display:none;}
}
@media(max-width:480px){
  .cp-setores-grid{grid-template-columns:1fr;}
  .cp-bar-lbl-w{width:100px;}
}

/* ===== Organismo vivo: entrada em cascata, hover e barras crescendo ===== */
@keyframes cpIn{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
@keyframes cpBar{from{transform:scaleX(0);}to{transform:scaleX(1);}}
@media(prefers-reduced-motion:no-preference){
  .cp-kpi,.cp-card,.cp-setor{animation:cpIn .55s cubic-bezier(.2,.7,.2,1) both;}
  .cp-in{animation:cpIn .55s cubic-bezier(.2,.7,.2,1) both;}
  .cp-card:nth-child(2){animation-delay:.08s;}
  .cp-card:nth-child(3){animation-delay:.16s;}
  .cp-setor:nth-child(2){animation-delay:.05s;}
  .cp-setor:nth-child(3){animation-delay:.1s;}
  .cp-setor:nth-child(4){animation-delay:.15s;}
  .cp-setor:nth-child(5){animation-delay:.2s;}
  .cp-setor:nth-child(6){animation-delay:.25s;}
  .cp-setor:nth-child(7){animation-delay:.3s;}
  .cp-setor:nth-child(8){animation-delay:.35s;}
  .cp-grow{transform-origin:left center;animation:cpBar 1s cubic-bezier(.2,.7,.2,1) both;}
}
/* Hover: widgets reagem ao mouse (elevam, brilham) */
.cp-kpi{transition:transform .18s ease,box-shadow .18s ease,border-top-color .18s ease;will-change:transform;}
.cp-kpi:hover{transform:translateY(-5px);border-top-color:var(--yellow);box-shadow:0 22px 46px rgba(0,0,0,.55);}
.cp-card{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;}
.cp-card:hover{transform:translateY(-4px);border-color:var(--blue);box-shadow:0 18px 42px rgba(0,0,0,.18);}
.cp-setor{transition:transform .18s ease,background .18s ease,border-color .18s ease;}
.cp-setor:hover{transform:translateY(-5px);background:rgba(255,255,255,.09);border-color:var(--gold);}
.cp-bar-fill{transition:filter .2s ease;}
.cp-bar-row:hover .cp-bar-fill{filter:brightness(1.18) saturate(1.1);}
.cp-btn{transition:transform .15s ease,filter .15s ease,box-shadow .15s ease;}
.cp-btn:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 10px 24px rgba(237,28,36,.4);}
.cp-legend li{transition:color .15s ease;}
`;
