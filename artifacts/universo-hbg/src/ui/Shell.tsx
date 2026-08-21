import { useState, useEffect, type ReactNode } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";
import { Sidebar } from "./Sidebar";
import { UniversoModule } from "../modules/universo";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="hbg-clock">
      {time.toLocaleTimeString("es-ES", { hour12: false })}
    </span>
  );
}

function ModulePanel({ module }: { module: ModuleId }) {
  const [key, setKey] = useState(0);
  const [displayModule, setDisplayModule] = useState(module);

  useEffect(() => {
    setKey((k) => k + 1);
    setDisplayModule(module);
  }, [module]);

  const panels: Record<ModuleId, ReactNode> = {
    universo: <UniversoModule />,
    instinto: <InstintoModule />,
    vibra: <VibraModule />,
    terminador: <TerminadorModule />,
  };

  return (
    <div key={key} className="module-enter">
      {panels[displayModule]}
    </div>
  );
}

export function Shell() {
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    hbgCore.init();
    return hbgCore.getModule();
  });

  useEffect(() => {
    const unsub = hbgCore.subscribe((mod) => setActiveModule(mod));
    return unsub;
  }, []);

  const config = hbgCore.getModuleConfig(activeModule);

  return (
    <>
      <div className="hbg-scanlines" />
      <div className="hbg-shell">
        {/* Top bar */}
        <header className="hbg-topbar">
          <span className="hbg-logo">UNIVERSO HBG</span>
          <div className="hbg-topbar-divider" />
          <span className="hbg-topbar-module">
            {config.icon} {config.label}
          </span>
          <div className="hbg-topbar-status">
            <div className="hbg-status-dot" />
            <Clock />
          </div>
        </header>

        {/* Sidebar */}
        <Sidebar active={activeModule} onSelect={(id) => hbgCore.setModule(id)} />

        {/* Main */}
        <main className="hbg-main">
          <div className="hbg-panel">
            <ModulePanel module={activeModule} />
          </div>
        </main>
      </div>
    </>
  );
}
