import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Gestão de usuários (login e senha) agora vive dentro de Configurações.
export default function UsuariosPage() {
  redirect("/configuracoes");
}
