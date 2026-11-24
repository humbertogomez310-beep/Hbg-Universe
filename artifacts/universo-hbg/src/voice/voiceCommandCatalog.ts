export interface VoiceCommandExample {
  label: string;
  phrases: string[];
}

export interface VoiceCommandGroup {
  id: "general" | "vibra" | "instinto";
  label: string;
  description: string;
  commands: VoiceCommandExample[];
}

/**
 * Reference catalog for commands currently classified by HBG LINGUA and
 * routed through existing HBG Core actions. Keep examples aligned with tests.
 */
export const VOICE_COMMAND_CATALOG: readonly VoiceCommandGroup[] = [
  {
    id: "general",
    label: "UNIVERSO",
    description: "Ayuda y navegación entre aplicaciones.",
    commands: [
      { label: "Abrir una aplicación", phrases: ["Abre UNIVERSO", "Abre VIBRA", "Abre INSTINTO"] },
      { label: "Pedir ayuda", phrases: ["Qué puedo hacer", "Qué puedes hacer en VIBRA", "Qué hace INSTINTO"] },
    ],
  },
  {
    id: "vibra",
    label: "VIBRA",
    description: "Control de música y reproducción.",
    commands: [
      { label: "Reproducir", phrases: ["Pon música", "Reproduce", "Pon al play"] },
      { label: "Pausar", phrases: ["Pausa", "Páusalo", "Pon pausa", "Ponlo en pausa", "Detén la música"] },
      { label: "Continuar", phrases: ["Continúa", "Sigue reproduciendo", "Reanúdalo", "Quita la pausa"] },
      { label: "Cambiar canción", phrases: ["Siguiente canción", "Canción anterior", "Qué canción está sonando"] },
      { label: "Controlar volumen", phrases: ["Sube el volumen", "Bájale un poquito", "Pon el volumen al 50%"] },
      { label: "DJ y ambiente", phrases: ["Activa Auto DJ", "Activa modo fiesta", "Activa modo fiesta PRO"] },
      { label: "Playlists", phrases: ["Crea playlist rock", "Reproduce mi playlist favoritos"] },
    ],
  },
  {
    id: "instinto",
    label: "INSTINTO",
    description: "Acceso e información de la aplicación.",
    commands: [
      { label: "Abrir INSTINTO", phrases: ["Abre INSTINTO", "Llévame a INSTINTO"] },
      { label: "Consultar funciones", phrases: ["Qué hace INSTINTO", "Qué puedo hacer en INSTINTO"] },
    ],
  },
] as const;
