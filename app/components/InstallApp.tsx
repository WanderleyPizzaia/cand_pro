"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

// Evento do Chrome/Android que permite disparar a instalação nativa.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Card de instalação na tela de login: mostra um "celular" com o ícone do app
// (pra pessoa associar que é pra instalar no celular) + botão de instalar.
// O botão fica SEMPRE visível, pra instalar quando quiser:
// - Se o navegador permite (Android/Chrome), dispara o prompt nativo.
// - Se não há prompt nativo disponível (iOS/Safari, ou já dispensado),
//   abre o passo a passo de instalação manual.
// Some apenas quando o app já está instalado (rodando em modo standalone).
export default function InstallApp() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [ehIOS, setEhIOS] = useState(false);
  const [mostrarPassos, setMostrarPassos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as any).standalone === true;
    if (standalone) {
      setInstalado(true);
      return;
    }

    const ua = window.navigator.userAgent || "";
    const iOS = /iphone|ipad|ipod/i.test(ua);
    // iPadOS recente se identifica como Mac com touch.
    const iPadOS =
      /Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1;
    setEhIOS(iOS || iPadOS);

    // O evento pode ter sido capturado pelo script do layout antes do React
    // montar (window.__bip). Aproveita ele se já existir.
    const jaCapturado = (window as any).__bip as BIPEvent | undefined;
    if (jaCapturado) setDeferred(jaCapturado);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__bip = e;
      setDeferred(e as BIPEvent);
    };
    // Disparado pelo script do layout quando ele captura o evento cedo.
    const onReady = () => {
      const ev = (window as any).__bip as BIPEvent | undefined;
      if (ev) setDeferred(ev);
    };
    const onInstalled = () => {
      setInstalado(true);
      setDeferred(null);
      (window as any).__bip = null;
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("bip-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("bip-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function instalar() {
    // Prompt nativo disponível (Android/Chrome): instala na hora.
    if (deferred) {
      await deferred.prompt();
      const escolha = await deferred.userChoice;
      if (escolha.outcome === "accepted") setInstalado(true);
      setDeferred(null);
      (window as any).__bip = null;
      return;
    }
    // Sem prompt nativo (iOS, ou já dispensado): mostra o passo a passo.
    setMostrarPassos((v) => !v);
  }

  // Já instalado: não precisa mostrar nada.
  if (instalado) return null;

  return (
    <div className="install-card">
      {/* Placeholder visual: um celular com o ícone do app na "tela inicial" */}
      <div className="install-phone" aria-hidden="true">
        <span className="install-phone-notch" />
        <img
          src="/icons/candpro.svg"
          alt=""
          width={52}
          height={52}
          className="install-phone-icon"
        />
      </div>

      <div className="install-info">
        <div className="install-title">
          <Icon name="smartphone" size={16} />
          Instale no seu celular
        </div>
        <p className="install-sub">
          Acesse em seu dispositivo Android ou iOS, instalando diretamente
          pelo Google.
        </p>

        {/* Botão sempre presente: instala quando quiser */}
        <button type="button" className="btn btn-install" onClick={instalar}>
          <Icon name={deferred ? "smartphone" : "share"} size={16} />
          Instalar app
        </button>

        {/* Passo a passo (aparece quando não há prompt nativo) */}
        {mostrarPassos &&
          (ehIOS ? (
            <ol className="install-ios-steps">
              <li>
                Toque em <strong>Compartilhar</strong> (
                <Icon name="share" size={13} />) na barra do Safari.
              </li>
              <li>
                Escolha <strong>“Adicionar à Tela de Início”</strong>.
              </li>
              <li>
                Confirme em <strong>Adicionar</strong>. Pronto!
              </li>
            </ol>
          ) : (
            <ol className="install-ios-steps">
              <li>
                Abra o menu <strong>⋮</strong> do Chrome (canto superior).
              </li>
              <li>
                Toque em <strong>“Instalar app”</strong> ou{" "}
                <strong>“Adicionar à tela inicial”</strong>.
              </li>
              <li>
                Confirme em <strong>Instalar</strong>. Pronto!
              </li>
            </ol>
          ))}
      </div>
    </div>
  );
}
