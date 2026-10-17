import { MODULES, type ModuleId } from "../core/hbgCore";

interface SidebarProps {
  active: ModuleId;
  isOwner: boolean;
  onSelect: (id: ModuleId) => void;
}

export function Sidebar({ active, isOwner, onSelect }: SidebarProps) {
  const visibleModules = MODULES.filter(
    (module) => module.id !== "terminador" || isOwner,
  );

  return (
    <nav className="hbg-sidebar">
      <div className="hbg-sidebar-section">
        <div className="hbg-sidebar-label">// módulos</div>
        {visibleModules.map((mod) => (
          <button
            key={mod.id}
            className={`hbg-nav-item ${active === mod.id ? "active" : ""}`}
            style={{ "--item-color": mod.color } as React.CSSProperties}
            onClick={() => onSelect(mod.id)}
          >
            <span className="hbg-nav-icon">{mod.icon}</span>
            <div className="hbg-nav-info">
              <div className="hbg-nav-name">{mod.label}</div>
              <div className="hbg-nav-desc">{mod.description}</div>
            </div>
            {mod.id === "terminador" && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginLeft: "auto" }}>ADMIN</span>
            )}
          </button>
        ))}
      </div>

      <div className="hbg-sidebar-footer">
        <div className="hbg-version">HBG CORE v1.0.0</div>
        <div className="hbg-version" style={{ marginTop: 2 }}>
          SISTEMA ACTIVO
        </div>
      </div>
    </nav>
  );
}
