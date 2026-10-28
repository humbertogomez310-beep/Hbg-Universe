import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { ShareEngine } from "./ShareEngine";

interface UniversoScreenProps {
  currentApp: ModuleId;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

const APP_STATUS: Record<ModuleId, { status: string; statusColor: string }> = {
  universo: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  instinto: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  vibra: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
  terminador: { status: "🟢 CONECTADO", statusColor: "var(--neon-green)" },
};

const AVAILABLE_APPS = [
  { name: "UNIVERSO HBG Móvil", desc: "Versión para iOS y Android", icon: "📱" },
  { name: "VIBRA Pro Desktop", desc: "Aplicación de escritorio nativo", icon: "🖥" },
  { name: "Clip web INSTINTO", desc: "Widget de notas rápidas", icon: "📎" },
];

export function UniversoScreen({ currentApp, appColor, mood, projectData }: UniversoScreenProps) {
  return (
    <div>
      <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.15)", borderRadius: 4 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.16em", color: "var(--text-muted)", marginBottom: 4 }}>PANTALLA OFICIAL</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", color: "var(--neon-cyan)" }}>UNIVERSO HBG</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Ecosistema modular · cada app conectada</div>
      </div>

      <div className="hbg-grid hbg-grid-2" style={{ gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Section 1: Installed */}
          <div className="hbg-card">
            <div className="section-title">// aplicaciones instaladas</div>
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
                    <span style={{ fontSize: 16, color: mod.color, filter: `drop-shadow(0 0 5px ${mod.color})` }}>{mod.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: isCurrent ? appColor : mod.color }}>
                        {mod.label}
                        {isCurrent && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginLeft: 8 }}>AQUÍ</span>}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{mod.description}</div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: status.statusColor }}>{status.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Available */}
          <div className="hbg-card">
            <div className="section-title">// aplicaciones disponibles</div>
            <div className="hbg-list" style={{ gap: 6 }}>
              {AVAILABLE_APPS.map((app) => (
                <div key={app.name} className="hbg-list-item">
                  <span style={{ fontSize: 18 }}>{app.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-secondary)" }}>{app.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{app.desc}</div>
                  </div>
                  <button className="hbg-btn hbg-btn-ghost" style={{ padding: "4px 10px", fontSize: 9 }}>INSTALAR</button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Connection status */}
          <div className="hbg-card">
            <div className="section-title">// estado de conexión</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Red Share Engine</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neon-green)" }}>🟢 ONLINE</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>HBG Core</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neon-green)" }}>🟢 CONECTADO</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Nube HBG</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>⚫ LOCAL</span>
              </div>
            </div>
          </div>

          {/* Section 4: Connect Core */}
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-purple)" } as React.CSSProperties}>
            <div className="section-title">// conectar con hbg core</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
              HBG Core es la IA central del ecosistema. Gestiona tu memoria, mood y recomendaciones.
            </div>
            <button className="hbg-btn hbg-btn-primary w-full" onClick={() => hbgCore.setModule("universo")}>
              ◈ ABRIR HBG CORE
            </button>
          </div>
        </div>

        {/* Right column: Share Engine */}
        <div>
          <div className="section-title">// share engine</div>
          <ShareEngine appName={MODULES.find(m => m.id === currentApp)?.label ?? currentApp} appColor={appColor} mood={mood} projectData={projectData} />
        </div>
      </div>
    </div>
  );
}