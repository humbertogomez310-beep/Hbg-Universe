import { useState } from "react";
import { MODULES, type ModuleId } from "../core/hbgCore";

interface SidebarProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
}

// Public modules — Terminador is admin-only, hidden from users
const PUBLIC_MODULES: ModuleId[] = ["universo", "instinto", "vibra"];

export function Sidebar({ active, onSelect }: SidebarProps) {
  const [footerClicks, setFooterClicks] = useState(0);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const handleFooterClick = () => {
    const next = footerClicks + 1;
    setFooterClicks(next);
    if (next >= 5) {
      setAdminUnlocked(true);
      setFooterClicks(0);
    }
  };

  const visibleModules = adminUnlocked
    ? MODULES
    : MODULES.filter((m) => PUBLIC_MODULES.includes(m.id));

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

      <div className="hbg-sidebar-footer" onClick={handleFooterClick} style={{ cursor: "default", userSelect: "none" }}>
        <div className="hbg-version">HBG CORE v1.0.0</div>
        <div className="hbg-version" style={{ marginTop: 2 }}>
          {adminUnlocked ? "⚙ MODO ADMIN" : "SISTEMA ACTIVO"}
        </div>
      </div>
    </nav>
  );
}
