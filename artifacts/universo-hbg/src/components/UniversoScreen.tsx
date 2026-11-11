
import { useEffect, useState, type CSSProperties } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { ShareEngine } from "./ShareEngine";

interface UniversoScreenProps {
  currentApp: ModuleId;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __hbgDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __hbgInstallListenerReady?: boolean;
  }
}

// Captura el evento aunque la pantalla todavía no esté abierta.
if (typeof window !== "undefined" && !window.__hbgInstallListenerReady) {
  window.__hbgInstallListenerReady = true;

  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    window.__hbgDeferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("hbg-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    window.__hbgDeferredInstallPrompt = null;
    window.dispatchEvent(new Event("hbg-app-installed"));
  });
}

const APP_STATUS: Record<ModuleId, { status: string; statusColor: string }> = {
  universo: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  instinto: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  vibra: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  terminador: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
};

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function UniversoScreen({
  currentApp,
  appColor,
  mood,
  projectData,
}: UniversoScreenProps) {
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);

  const isIOS = detectIOS();

  useEffect(() => {
    const updateInstallAvailability = () => {
      setInstallAvailable(!!window.__hbgDeferredInstallPrompt);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallAvailable(false);
      setShowInstructions(false);
    };

    setInstalled(isStandalone());
    updateInstallAvailability();

    window.addEventListener("hbg-install-available", updateInstallAvailability);
    window.addEventListener("hbg-app-installed", handleInstalled);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("hbg-install-available", updateInstallAvailability);
      window.removeEventListener("hbg-app-installed", handleInstalled);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const installPrompt = window.__hbgDeferredInstallPrompt;

    if (installed) return;

    if (installPrompt) {
      try {
        setInstalling(true);

        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;

        window.__hbgDeferredInstallPrompt = null;
        setInstallAvailable(false);

        if (choice.outcome === "accepted") {
          setShowInstructions(false);
        }
      } catch (error) {
        console.error("Error al iniciar la instalación de UNIVERSO HBG:", error);
        setShowInstructions(true);
      } finally {
        setInstalling(false);
      }

      return;
    }

    setShowInstructions(true);
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 20,
          padding: "12px 16px",
          background: "rgba(0,229,255,0.04)",
          border: "1px solid rgba(0,229,255,0.15)",
          borderRadius: 4,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--text-muted)",
            marginBottom: 4,
          }}
        >
          PANTALLA OFICIAL
        </div>

        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--neon-cyan)",
          }}
        >
          UNIVERSO HBG
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 2,
          }}
        >
          Ecosistema modular · cada app conectada
        </div>
      </div>

      <div className="hbg-grid hbg-grid-2" style={{ gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Section 1: Modules */}
          <div className="hbg-card">
            <div className="section-title">// módulos de UNIVERSO HBG</div>

            <div className="hbg-list" style={{ gap: 6 }}>
              {MODULES.filter((mod) => mod.id !== "terminador").map((mod) => {
                const status = APP_STATUS[mod.id];
                const isCurrent = mod.id === currentApp;

                return (
                  <div
                    key={mod.id}
                    className="hbg-list-item"
                    style={{
                      cursor: !isCurrent ? "pointer" : "default",
                      borderColor: isCurrent ? appColor : undefined,
                      background: isCurrent ? `${appColor}06` : undefined,
                    }}
                    onClick={() => !isCurrent && hbgCore.setModule(mod.id)}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        color: mod.color,
                        filter: `drop-shadow(0 0 5px ${mod.color})`,
                      }}
                    >
                      {mod.icon}
                    </span>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: isCurrent ? appColor : mod.color,
                        }}
                      >
                        {mod.label}

                        {isCurrent && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              color: "var(--text-muted)",
                              marginLeft: 8,
                            }}
                          >
                            AQUÍ
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {mod.description}
                      </div>
                    </div>

                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: status.statusColor,
                      }}
                    >
                      {status.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Install UNIVERSO HBG */}
          <div className="hbg-card">
            <div className="section-title">// instalar UNIVERSO HBG</div>

            <div
              style={{
                textAlign: "center",
                padding: "18px 12px",
                border: "1px solid rgba(0,229,255,0.15)",
                borderRadius: 6,
                background: "rgba(0,229,255,0.035)",
              }}
            >
              <div style={{ fontSize: 38, marginBottom: 10 }}>◈</div>

              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--neon-cyan)",
                }}
              >
                UNIVERSO HBG
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  marginTop: 6,
                  marginBottom: 14,
                }}
              >
                Una sola aplicación · Móvil · PC · Tablet
              </div>

              <button
                className="hbg-btn hbg-btn-primary w-full"
                onClick={handleInstall}
                disabled={installing || installed}
                style={{ opacity: installed ? 0.7 : 1 }}
              >
                {installed
                  ? "✓ APLICACIÓN INSTALADA"
                  : installing
                    ? "PREPARANDO INSTALACIÓN..."
                    : installAvailable
                      ? "⬇ INSTALAR UNIVERSO HBG"
                      : "◈ CÓMO INSTALAR UNIVERSO HBG"}
              </button>

              {installed && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--neon-green)",
                    marginTop: 10,
                  }}
                >
                  UNIVERSO HBG ESTÁ INSTALADO EN ESTE DISPOSITIVO
                </div>
              )}

              {showInstructions && !installed && (
                <div
                  style={{
                    textAlign: "left",
                    marginTop: 14,
                    padding: 12,
                    border: "1px solid rgba(0,229,255,0.2)",
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      color: "var(--neon-cyan)",
                      marginBottom: 8,
                    }}
                  >
                    INSTRUCCIONES DE INSTALACIÓN
                  </div>

                  {isIOS ? (
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        lineHeight: 1.8,
                      }}
                    >
                      1. Abre UNIVERSO HBG en Safari.
                      <br />
                      2. Pulsa el botón Compartir.
                      <br />
                      3. Selecciona «Añadir a pantalla de inicio».
                      <br />
                      4. Confirma la instalación.
                    </div>
                  ) : (
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        lineHeight: 1.8,
                      }}
                    >
                      1. Abre UNIVERSO HBG en Chrome o Edge.
                      <br />
                      2. Abre el menú del navegador.
                      <br />
                      3. Busca «Instalar aplicación» o «Añadir a pantalla de inicio».
                      <br />
                      4. Confirma la instalación.
                    </div>
                  )}

                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      marginTop: 10,
                    }}
                  >
                    La opción de instalación aparecerá cuando la configuración PWA
                    del sitio esté publicada y el navegador la admita.
                  </div>

                  <button
                    className="hbg-btn hbg-btn-ghost"
                    style={{ marginTop: 10, fontSize: 9 }}
                    onClick={() => setShowInstructions(false)}
                  >
                    CERRAR
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Connection status */}
          <div className="hbg-card">
            <div className="section-title">// estado de conexión</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  Red Share Engine
                </span>

                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--neon-green)",
                  }}
                >
                  🟢 ONLINE
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  HBG Core
                </span>

                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--neon-green)",
                  }}
                >
                  🟢 CONECTADO
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  Nube HBG
                </span>

                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  ⚫ LOCAL
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Connect Core */}
          <div
            className="hbg-card hbg-card-accent"
            style={{ "--card-color": "var(--neon-purple)" } as CSSProperties}
          >
            <div className="section-title">// conectar con hbg core</div>

            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              HBG Core es la IA central del ecosistema. Gestiona tu memoria, mood y
              recomendaciones.
            </div>

            <button
              className="hbg-btn hbg-btn-primary w-full"
              onClick={() => hbgCore.setModule("universo")}
            >
              ◈ ABRIR HBG CORE
            </button>
          </div>
        </div>

        {/* Right column: Share Engine */}
        <div>
          <div className="section-title">// share engine</div>

          <ShareEngine
            appName={MODULES.find((m) => m.id === currentApp)?.label ?? currentApp}
            appColor={appColor}
            mood={mood}
            projectData={projectData}
          />
        </div>
      </div>
    </div>
  );
}
