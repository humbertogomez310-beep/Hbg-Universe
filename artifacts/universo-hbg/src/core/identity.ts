import type { HBGCoreIdentity } from "./types";

const CORE_IDENTITY: HBGCoreIdentity = Object.freeze({
  id: "hbg-core",
  name: "HBG CORE",
  version: "1.0.0",
  protocolVersion: "1",
});

export function getHBGCoreIdentity(): HBGCoreIdentity {
  return { ...CORE_IDENTITY };
}