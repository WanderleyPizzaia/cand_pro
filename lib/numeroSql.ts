// ============================================================
// O mesmo celular brasileiro aparece escrito de jeitos diferentes: a conversa
// vem do WhatsApp/Meta com 55 (e às vezes sem o 9 depois do DDD), e a
// planilha importada costuma vir sem o 55. Comparar só os dígitos exatos fazia
// o Atendimento não achar o contato (sem nome, foto e etiquetas) e a etiqueta
// e a captura da IA criarem um contato duplicado.
//
// `variantesSql(expr)`: array SQL com as formas do número em `expr` (só
// dígitos): com/sem 55 e com/sem o 9. Usado com o índice de dígitos do
// whatsapp: `<dígitos do whatsapp> = ANY(variantesSql(...))`.
// ============================================================
export const variantesSql = (expr: string) => `(CASE
    WHEN ${expr} ~ '^55[0-9]{2}9[0-9]{8}$' THEN ARRAY[${expr}, substr(${expr}, 3),
      '55' || substr(${expr}, 3, 2) || substr(${expr}, 6), substr(${expr}, 3, 2) || substr(${expr}, 6)]
    WHEN ${expr} ~ '^55[0-9]{2}[6-9][0-9]{7}$' THEN ARRAY[${expr}, substr(${expr}, 3),
      '55' || substr(${expr}, 3, 2) || '9' || substr(${expr}, 5), substr(${expr}, 3, 2) || '9' || substr(${expr}, 5)]
    WHEN ${expr} ~ '^55[0-9]{10,11}$' THEN ARRAY[${expr}, substr(${expr}, 3)]
    ELSE ARRAY[${expr}]
  END)`;

// Dígitos do whatsapp do contato (mesma expressão do índice idx_pessoas_whatsapp_digitos).
export const DIGITOS_WHATSAPP = "regexp_replace(COALESCE(whatsapp,''),'\\D','','g')";
