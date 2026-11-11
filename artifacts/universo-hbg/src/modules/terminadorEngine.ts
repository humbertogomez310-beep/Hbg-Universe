import {
  LocalRulesProvider,
  createLocalModelProvider,
  createRemoteProvider,
  selectTerminadorProvider,
  type LocalModel,
  type RemoteProviderConfig,
  type TerminadorInterpretation,
  type TerminadorProvider,
} from "./terminadorProviders";

export interface TerminadorEngineOptions {
  providers?: TerminadorProvider[];
  preferredProviderId?: string;
  maxRequestsPerMinute?: number;
  maxReportedCostUnits?: number;
  now?: () => number;
}

export class TerminadorEngine {
  private readonly providers: TerminadorProvider[];
  private readonly maxRequestsPerMinute: number;
  private readonly maxReportedCostUnits: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, TerminadorInterpretation>();
  private readonly requestTimes: number[] = [];
  private reportedCostUnits = 0;
  private preferredProviderId?: string;

  constructor(options: TerminadorEngineOptions = {}) {
    this.providers = options.providers ?? [new LocalRulesProvider()];
    this.maxRequestsPerMinute = options.maxRequestsPerMinute ?? 60;
    this.maxReportedCostUnits = options.maxReportedCostUnits ?? 0;
    this.now = options.now ?? Date.now;
    this.preferredProviderId = options.preferredProviderId;
  }

  setPreferredProvider(providerId?: string): void {
    this.preferredProviderId = providerId;
  }

  getProviders(): Array<{ id: string; kind: string; available: boolean }> {
    return this.providers.map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      available: provider.isAvailable(),
    }));
  }

  async interpret(text: string): Promise<TerminadorInterpretation> {
    const cleanText = text.trim();
    if (!cleanText) throw new Error("La solicitud no puede estar vacía.");
    const cacheKey = cleanText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) return { ...cached, originalText: cleanText };

    const now = this.now();
    while (this.requestTimes.length && now - this.requestTimes[0] >= 60_000) {
      this.requestTimes.shift();
    }
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      throw new Error("Se alcanzó el límite local de solicitudes por minuto.");
    }

    const provider = selectTerminadorProvider(this.providers, this.preferredProviderId);
    if (provider.kind === "remote" && this.reportedCostUnits >= this.maxReportedCostUnits) {
      throw new Error("El presupuesto remoto configurado está agotado.");
    }
    const result = await provider.interpret(cleanText);
    this.requestTimes.push(now);
    this.cache.set(cacheKey, result);
    if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }

  recordProviderUsage(costUnits: number): void {
    if (!Number.isFinite(costUnits) || costUnits < 0) {
      throw new Error("El consumo informado por el proveedor no es válido.");
    }
    this.reportedCostUnits += costUnits;
  }

  getUsage(): { requestsInWindow: number; reportedCostUnits: number } {
    const now = this.now();
    while (this.requestTimes.length && now - this.requestTimes[0] >= 60_000) {
      this.requestTimes.shift();
    }
    return {
      requestsInWindow: this.requestTimes.length,
      reportedCostUnits: this.reportedCostUnits,
    };
  }
}

export function createDefaultTerminadorProviders(
  options: { localModel?: LocalModel; remote?: RemoteProviderConfig } = {},
): TerminadorProvider[] {
  return [
    new LocalRulesProvider(),
    createLocalModelProvider(options.localModel),
    createRemoteProvider(options.remote ?? {
      enabled: false,
      serverSide: false,
      credentialConfigured: false,
    }),
  ];
}
