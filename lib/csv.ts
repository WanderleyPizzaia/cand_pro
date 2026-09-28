// ============================================================
// Leitura de CSV para a importação de contatos. Sem banco: roda no navegador
// (que lê o arquivo e manda em partes) e no servidor.
// ============================================================

// Texto do arquivo como veio do Excel/Google: UTF-8 (com ou sem BOM), UTF-16
// ("Texto Unicode") ou Windows-1252, que é o "CSV" padrão do Excel em
// português. Lido como UTF-8, o 1252 vira "Jo�o": aí decodifica de novo.
export function decodificarArquivo(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  const utf8 = new TextDecoder("utf-8").decode(b);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

// Delimitador pela 1ª linha: ";" (Excel em português) ou ",".
export function detectarDelimitador(texto: string): ";" | "," {
  const primeira = texto.split(/\r?\n/, 1)[0] || "";
  return (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
}

// Um campo entre aspas legítimo (observação com quebra de linha) tem poucas
// linhas. Passou disto, é uma aspa que abriu e nunca fechou engolindo o resto
// do arquivo.
const LIMITE_QUEBRAS = 20;

// Uma passada do leitor. `literais` = posições de aspas tratadas como texto.
// Devolve as linhas ou, se achar um campo entre aspas que engoliu linhas
// demais, a posição da aspa que o abriu.
function passada(
  texto: string,
  delim: string,
  literais: Set<number>
): { linhas: string[][]; fuga: number | null } {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  let campoComecou = false;
  let abertura = -1;
  let quebras = 0;
  const fechaLinha = () => {
    linha.push(campo);
    linhas.push(linha);
    linha = [];
    campo = "";
    campoComecou = false;
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
          if (quebras >= LIMITE_QUEBRAS) return { linhas, fuga: abertura };
        }
      } else {
        if (ch === "\n") quebras++;
        campo += ch;
      }
      continue;
    }
    if (ch === '"' && !campoComecou && !literais.has(i)) {
      entreAspas = true;
      campoComecou = true;
      abertura = i;
      quebras = 0;
    } else if (ch === delim) {
      linha.push(campo);
      campo = "";
      campoComecou = false;
    } else if (ch === "\n") {
      fechaLinha();
    } else if (ch === "\r") {
      // "\r" sozinho (arquivo antigo de Mac) também quebra a linha.
      if (texto[i + 1] !== "\n") fechaLinha();
    } else {
      campo += ch;
      campoComecou = true;
    }
  }
  // Terminou o arquivo com aspa aberta que atravessou linhas: mesma fuga.
  if (entreAspas && quebras > 0) return { linhas, fuga: abertura };
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return { linhas: linhas.filter((l) => l.some((c) => c.trim())), fuga: null };
}

// Leitor de CSV (RFC 4180, tolerante), com as correções que a planilha real
// precisa:
//  - aspa no meio do texto (ANTONIO "TONHO) é literal;
//  - aspa que abre um campo e não fecha ("ZEZINHO) vira texto comum, em vez
//    de engolir o resto do arquivo; `aspasSoltas` diz em que linhas estavam;
//  - remove NUL (U+0000), que o Postgres recusa.
export function lerCSV(texto: string, delim: string): { linhas: string[][]; aspasSoltas: number[] } {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  texto = texto.replace(/\u0000/g, "");
  const literais = new Set<number>();
  const aspasSoltas: number[] = [];
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const r = passada(texto, delim, literais);
    if (r.fuga === null) return { linhas: r.linhas, aspasSoltas };
    literais.add(r.fuga);
    aspasSoltas.push(texto.slice(0, r.fuga).split(/\r\n|\n|\r/).length);
  }
  // Arquivo com aspas soltas demais: lê cada linha sozinha (aspa nunca atravessa linha).
  const porLinha = texto
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim())
    .map((l) => passada(l, delim, new Set()).linhas[0] || []);
  return { linhas: porLinha, aspasSoltas };
}

export function parseCSV(texto: string, delim: string): string[][] {
  return lerCSV(texto, delim).linhas;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Cabeçalhos aceitos -> campo interno.
const ALIAS: Record<string, string> = {
  nome: "nome",
  categoria: "categoria",
  grupo: "categoria",
  funcao: "funcao",
  partido: "partido",
  cidade: "cidade",
  municipio: "cidade",
  bairro: "bairro",
  whatsapp: "whatsapp",
  whats: "whatsapp",
  telefone: "whatsapp",
  celular: "whatsapp",
  email: "email",
  "e-mail": "email",
  instagram: "instagram",
  insta: "instagram",
  observacao: "observacao",
  obs: "observacao",
};

export function mapearCabecalho(cabecalho: string[]): string[] {
  return cabecalho.map((h) => ALIAS[normalizar(h)] ?? "");
}
