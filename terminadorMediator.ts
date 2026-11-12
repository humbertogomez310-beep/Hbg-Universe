import type { TerminadorEngine } from "./terminadorEngine";
import {
  createTerminadorPlan,
  validateTerminadorPlan,
  type TerminadorPlan,
} from "./terminadorPlanner";
import type { TerminadorInterpretation } from "./terminadorProviders";

export type TerminadorMode = "USO" | "DESARROLLO";

export type MediatorDisposition =
  | "needs_clarification"
  | "development_blocked"
  | "authority_required"
  | "ready";

export interface TerminadorMediatorResult {
  mode: TerminadorMode;
  disposition: MediatorDisposition;
  interpretation: TerminadorInterpretation;
  plan: TerminadorPlan;
  explanation: string;
}

export class TerminadorMediator {
  constructor(private readonly engine: TerminadorEngine) {}

  async processRequest(
    request: string,
  ): Promise<TerminadorMediatorResult> {
    const cleanRequest = request.trim();

    if (!cleanRequest || cleanRequest.length > 4000) {
      throw new Error(
        "La solicitud está vacía o supera el límite permitido.",
      );
    }

    // 1. Interpretar. El Mediador no concede permisos.
    const interpretation = await this.engine.interpret(cleanRequest);

    if (
      !Array.isArray(interpretation.operations) ||
      !Number.isFinite(interpretation.confidence) ||
      interpretation.confidence < 0 ||
      interpretation.confidence > 1
    ) {
      throw new Error(
        "La interpretación recibida no tiene una estructura válida.",
      );
    }

    // 2. Clasificar por las operaciones interpretadas,
    // no por afirmaciones del proveedor ni del usuario.
    const mode: TerminadorMode =
      interpretation.operations.some(
        (operation) => operation.type === "development",
      )
        ? "DESARROLLO"
        : "USO";

    // 3. Construir el plan existente.
    const plan = createTerminadorPlan(interpretation);

    // 4. Validar la estructura antes de devolverlo.
    const validationErrors = validateTerminadorPlan(plan);

    if (validationErrors.length > 0) {
      throw new Error(
        `Plan inválido: ${validationErrors.join(" ")}`,
      );
    }

    if (interpretation.requiresClarification) {
      return {
        mode,
        disposition: "needs_clarification",
        interpretation,
        plan,
        explanation:
          interpretation.clarification ??
          "Se necesita información adicional.",
      };
    }

    // 5. DESARROLLO no pasa al ejecutor normal.
    // Si la solicitud mezcla USO y DESARROLLO,
    // se bloquea el plan completo.
    if (mode === "DESARROLLO") {
      const blockedPlan: TerminadorPlan = {
        ...plan,
        state: "blocked",
        tasks: plan.tasks.map((task) => ({
          ...task,
          state: "blocked",
          reason:
            "La solicitud requiere el flujo de DESARROLLO. " +
            "No se ejecutó ninguna tarea.",
        })),
      };

      return {
        mode,
        disposition: "development_blocked",
        interpretation,
        plan: blockedPlan,
        explanation:
          "Solicitud clasificada como DESARROLLO. " +
          "Requiere una sesión de desarrollo y autorización " +
          "verificadas por HBG Authority.",
      };
    }

    // 6. Detectar operaciones que requieren Authority.
    const authorityRequired = plan.tasks.some(
      (task) =>
        task.scope === "authority" &&
        task.requiredPermission === "terminador.manage",
    );

    if (authorityRequired) {
      return {
        mode,
        disposition: "authority_required",
        interpretation,
        plan,
        explanation:
          "El plan contiene operaciones que requieren " +
          "autorización individual de HBG Authority.",
      };
    }

    return {
      mode,
      disposition: "ready",
      interpretation,
      plan,
      explanation:
        "Solicitud interpretada y plan validado. " +
        "La ejecución seguirá limitada a las capacidades existentes.",
    };
  }
      }
