// Assessoria de Imprensa — conteúdo compartilhado entre UI e API. Módulo puro.
// Mapa de riscos (pautas de polêmica), comunicação orientada e protocolo de crise.
// Base genérica de preparação de assessoria (cenários hipotéticos + orientação),
// aplicável a qualquer gabinete. Não afirma fatos sobre pessoas reais.

export type Risco = "alto" | "medio" | "baixo";

export const RISCO_ROTULO: Record<Risco, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};

export type PautaRisco = {
  id: string;
  titulo: string;
  categoria: string;
  risco: Risco;
  gatilho: string; // o que costuma disparar a crise
  sinais: string[]; // como detectar cedo
  mensagemChave: string; // a frase central a sustentar
  dizer: string[]; // comunicação orientada: o que reforçar
  evitar: string[]; // o que não fazer/dizer
};

// ── Mapa de riscos: possíveis pautas de polêmica e problemas de campanha ──
export const PAUTAS_RISCO: PautaRisco[] = [
  {
    id: "fake-news",
    titulo: "Fake news / boato nas redes sobre o candidato",
    categoria: "Reputação digital",
    risco: "alto",
    gatilho: "Print, áudio ou montagem viralizando em grupos de WhatsApp e redes.",
    sinais: ["Pico de menções negativas", "Mesma frase copiada por vários perfis", "Mensagens repetidas chegando no gabinete"],
    mensagemChave: "Compromisso com a verdade: desmentir com fato, data e fonte, sem ampliar o boato.",
    dizer: [
      "Esclarecer com informação verificável (documento, data, link oficial).",
      "Registrar a desinformação (print + horário) para eventual medida legal.",
      "Responder uma vez, de forma firme e curta, e seguir a agenda positiva.",
    ],
    evitar: [
      "Repetir o boato no título do desmentido (dá alcance a ele).",
      "Entrar em bate-boca perfil a perfil.",
      "Ignorar quando o boato já saiu dos grupos e virou mídia.",
    ],
  },
  {
    id: "fora-de-contexto",
    titulo: "Declaração tirada de contexto",
    categoria: "Mídia / entrevista",
    risco: "alto",
    gatilho: "Corte de vídeo ou frase editada circulando sem o contexto completo.",
    sinais: ["Vídeo curto sem começo/fim", "Adversário compartilhando o corte", "Pedidos de posicionamento da imprensa"],
    mensagemChave: "O contexto completo mostra a real intenção. Divulgar o trecho inteiro.",
    dizer: [
      "Publicar o vídeo/áudio na íntegra com a fala completa.",
      "Reafirmar a posição em uma linha clara.",
      "Oferecer entrevista para explicar, se a pauta crescer.",
    ],
    evitar: ["Pedir desculpa por algo que não foi dito", "Deixar o corte ser a única versão disponível"],
  },
  {
    id: "associacao",
    titulo: "Associação indevida a aliado ou apoiador problemático",
    categoria: "Alianças",
    risco: "medio",
    gatilho: "Apoiador/aliado se envolve em polêmica e ligam a imagem ao candidato.",
    sinais: ["'Fulano é do time de X'", "Cobrança de posicionamento sobre terceiro"],
    mensagemChave: "Cada um responde pelos próprios atos; nossos compromissos são estes.",
    dizer: ["Separar com clareza a posição do candidato da do terceiro", "Reafirmar os próprios valores e a agenda"],
    evitar: ["Defender o indefensável por lealdade", "Generalizar ataque a todos os apoiadores"],
  },
  {
    id: "vida-pregressa",
    titulo: "Questionamento sobre vida pregressa / processos",
    categoria: "Reputação",
    risco: "alto",
    gatilho: "Reportagem ou adversário levanta processos, dívidas ou passado.",
    sinais: ["Pedido formal de imprensa", "Documentos circulando", "Perguntas repetidas nas redes"],
    mensagemChave: "Transparência total: apresentar os fatos e a situação jurídica real.",
    dizer: ["Responder com documento e situação atualizada", "Encaminhar ao jurídico antes de falar publicamente"],
    evitar: ["Negar sem checar", "Dar versão que o documento contradiga depois"],
  },
  {
    id: "prestacao-contas",
    titulo: "Uso de recursos / prestação de contas de campanha",
    categoria: "Compliance eleitoral",
    risco: "medio",
    gatilho: "Dúvida pública sobre gastos, doações ou uso de recurso público.",
    sinais: ["Cobrança de comprovação", "Comparação de gastos com adversários"],
    mensagemChave: "Cada centavo é declarado e auditável, conforme a lei eleitoral.",
    dizer: ["Mostrar que a prestação segue as regras do TSE", "Encaminhar dúvida técnica à contabilidade da campanha"],
    evitar: ["Improvisar números", "Tratar cobrança legítima como perseguição"],
  },
  {
    id: "promessa",
    titulo: "Promessa vista como não cumprida / mudança de posição",
    categoria: "Coerência",
    risco: "medio",
    gatilho: "Adversário confronta fala antiga com posição atual.",
    sinais: ["'Ele disse o contrário em ...'", "Montagem antes/depois"],
    mensagemChave: "Amadurecer é ouvir a população; o compromisso central permanece.",
    dizer: ["Explicar o que mudou e por quê, com honestidade", "Reforçar o que se manteve firme"],
    evitar: ["Negar que já disse algo registrado", "Atacar quem cobra coerência"],
  },
  {
    id: "fala-assessor",
    titulo: "Fala infeliz de assessor / equipe",
    categoria: "Equipe",
    risco: "medio",
    gatilho: "Membro da equipe posta algo ofensivo em nome próprio.",
    sinais: ["Print da conta do assessor viralizando"],
    mensagemChave: "A posição do gabinete é uma só; excessos individuais são corrigidos.",
    dizer: ["Posicionar-se rápido e retirar o conteúdo", "Reafirmar o padrão de respeito da equipe"],
    evitar: ["Demorar a responder", "Fingir que não é da equipe quando é"],
  },
  {
    id: "polarizador",
    titulo: "Tema polarizador forçado pelo adversário",
    categoria: "Pauta / armadilha",
    risco: "medio",
    gatilho: "Provocação para tirar o candidato da agenda dele.",
    sinais: ["Pergunta armadilha em debate", "Enquete provocativa"],
    mensagemChave: "Responder com respeito e voltar rápido ao que muda a vida das pessoas.",
    dizer: ["Dar posição serena e objetiva", "Retornar à agenda concreta (saúde, emprego, segurança)"],
    evitar: ["Cair na armadilha e passar o dia no tema do adversário", "Ofender quem pensa diferente"],
  },
  {
    id: "denuncia-publica",
    titulo: "Denúncia de eleitor mal conduzida virando caso",
    categoria: "Atendimento",
    risco: "baixo",
    gatilho: "Cidadão se sente ignorado e leva a queixa à imprensa/redes.",
    sinais: ["'Mandei e ninguém respondeu'", "Reclamação pública sobre o gabinete"],
    mensagemChave: "Toda demanda é ouvida; vamos dar retorno e resolver.",
    dizer: ["Assumir o contato, pedir desculpa pela demora e resolver", "Mostrar o canal oficial de pautas"],
    evitar: ["Discutir em público com o cidadão", "Prometer o que não pode cumprir"],
  },
  {
    id: "deepfake",
    titulo: "Deepfake / conteúdo de IA usado contra o candidato",
    categoria: "Reputação digital",
    risco: "alto",
    gatilho: "Vídeo/áudio falso feito por IA imitando o candidato.",
    sinais: ["Áudio 'do candidato' que ninguém gravou", "Vídeo com lábios/voz estranhos"],
    mensagemChave: "É falso e feito por IA; a lei eleitoral proíbe e vamos denunciar.",
    dizer: ["Desmentir com firmeza e apontar que é IA", "Acionar plataforma e Justiça Eleitoral (TSE 2026 proíbe)"],
    evitar: ["Redistribuir o falso 'para mostrar'", "Deixar sem resposta oficial"],
  },
  {
    id: "silencio",
    titulo: "Ausência / silêncio em pauta relevante",
    categoria: "Agenda",
    risco: "baixo",
    gatilho: "Fato importante acontece e o candidato não se posiciona.",
    sinais: ["'Cadê o posicionamento?'", "Concorrentes ocupando o espaço"],
    mensagemChave: "Posicionar-se com conteúdo, não com pressa.",
    dizer: ["Emitir nota curta e clara no tempo certo", "Transformar o tema em proposta"],
    evitar: ["Silêncio longo em pauta que exige resposta", "Nota genérica sem posição"],
  },
  {
    id: "lgpd",
    titulo: "Vazamento de dados / uso indevido de base (LGPD)",
    categoria: "Dados / jurídico",
    risco: "medio",
    gatilho: "Acusação de disparo sem consentimento ou vazamento de contatos.",
    sinais: ["'Como conseguiram meu número?'", "Reclamação de spam"],
    mensagemChave: "Tratamos dados com base legal e respeito à LGPD.",
    dizer: ["Explicar a base legal e o opt-out", "Corrigir e registrar qualquer falha"],
    evitar: ["Negar sem apurar", "Continuar disparo para quem pediu para sair"],
  },
];

// ── Comunicação orientada (linha geral do gabinete) ──
export const COMUNICACAO_ORIENTADA = {
  principios: [
    "Verdade sempre: nunca afirmar o que não pode ser comprovado.",
    "Uma voz só: quem fala pelo gabinete é o porta-voz definido.",
    "Rápido, mas certo: melhor uma nota curta e correta do que uma pressa errada.",
    "Foco na agenda: responder e voltar ao que muda a vida das pessoas.",
    "Respeito: nunca ofender eleitor, adversário ou jornalista.",
    "Registrar tudo: print, data e fonte de qualquer ataque.",
  ],
  tom: "Firme no conteúdo, sereno na forma. Linguagem simples, sem jargão, próxima do povo.",
  regraDeOuro:
    "Antes de qualquer resposta pública em polêmica: (1) checar o fato, (2) alinhar com o porta-voz, (3) usar a mensagem-chave, (4) voltar à agenda.",
  respostaJornalista:
    "Obrigado pelo contato. Vamos verificar e retornamos com a informação correta ainda hoje. O gabinete preza pela transparência.",
};

// ── Protocolo de gestão de crise (checklist da 1ª hora) ──
export const CHECKLIST_CRISE = [
  { id: "detectar", label: "Confirmar o fato: o que houve, onde saiu, quem está falando" },
  { id: "print", label: "Registrar tudo (print, link, data, horário)" },
  { id: "severidade", label: "Classificar a severidade e o alcance" },
  { id: "portavoz", label: "Definir o porta-voz único da crise" },
  { id: "juridico", label: "Acionar o jurídico se houver risco legal/eleitoral" },
  { id: "nota", label: "Redigir a nota de contenção (holding statement)" },
  { id: "equipe", label: "Alinhar a equipe: uma só versão, ninguém fala por fora" },
  { id: "monitorar", label: "Monitorar redes e imprensa a cada 30 min" },
  { id: "agenda", label: "Reforçar a agenda positiva e retomar o controle da pauta" },
];

export const SEVERIDADES = [
  { v: "baixa", r: "Baixa — ruído localizado" },
  { v: "media", r: "Média — crescendo nas redes" },
  { v: "alta", r: "Alta — imprensa + viralização" },
];

// Modelo de nota de contenção (holding statement) para preencher rápido.
export function modeloNota(gabinete: string, severidade: string): string {
  const abertura =
    severidade === "alta"
      ? "O gabinete se manifesta com transparência sobre as informações que circulam."
      : "O gabinete esclarece o seguinte sobre o assunto que circula nas redes.";
  return [
    `NOTA OFICIAL — ${gabinete}`,
    "",
    abertura,
    "",
    "1. [Descreva o fato de forma objetiva e verdadeira]",
    "2. [Apresente a informação correta, com data/fonte]",
    "3. [Reafirme o compromisso e a mensagem-chave]",
    "",
    "Seguimos à disposição da imprensa e da população.",
  ].join("\n");
}

export type EstadoCrise = {
  ativa: boolean;
  severidade: string;
  titulo: string;
  nota: string;
  portaVoz: string;
  feitos: string[]; // ids do checklist marcados
  iniciadaEm: string | null;
  atualizadoEm: string | null;
};

export const CRISE_VAZIA: EstadoCrise = {
  ativa: false,
  severidade: "media",
  titulo: "",
  nota: "",
  portaVoz: "",
  feitos: [],
  iniciadaEm: null,
  atualizadoEm: null,
};
