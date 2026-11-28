import { Router, type IRouter } from "express";
import { requirePermission } from "../lib/hbgAuth";
import {
  coreAIStatus,
  CoreChatError,
  generateCoreReply,
  parseCoreChatMessages,
  parseCoreSongRequest,
  buildCoreSongPrompt,
  SONGWRITER_INSTRUCTIONS,
} from "../lib/coreChat";

const router: IRouter = Router();
const requestsByUser = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = 20;

function allowRequest(userId: string, now = Date.now()): boolean {
  const recent = (requestsByUser.get(userId) ?? []).filter((timestamp) => timestamp > now - 60_000);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    requestsByUser.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestsByUser.set(userId, recent);
  if (requestsByUser.size > 1_000) {
    const oldestKey = requestsByUser.keys().next().value;
    if (oldestKey) requestsByUser.delete(oldestKey);
  }
  return true;
}

router.get("/core/status", requirePermission("core.action.execute"), (_req, res) => {
  res.json({ success: true, ...coreAIStatus() });
});

router.post("/core/songwriter", requirePermission("core.action.execute"), async (req, res) => {
  const body: unknown = req.body;
  const userId = req.hbgAuth!.user.id;
  if (!allowRequest(userId)) {
    res.status(429).json({
      success: false,
      error: "Alcanzaste el límite temporal de generación con IA.",
      code: "RATE_LIMITED",
    });
    return;
  }

  try {
    const request = parseCoreSongRequest(body);
    const reply = await generateCoreReply(
      [{ role: "user", content: buildCoreSongPrompt(request) }],
      { additionalInstructions: SONGWRITER_INSTRUCTIONS, maxOutputTokens: 2_400 },
    );
    res.json({ success: true, ...reply, provider: "openai", task: "songwriter" });
  } catch (error) {
    if (error instanceof CoreChatError) {
      res.status(error.status).json({ success: false, error: error.message, code: error.code });
      return;
    }
    req.log.error({ err: error }, "INSTINTO songwriter generation failed");
    res.status(502).json({
      success: false,
      error: "No se pudo generar la canción.",
      code: "SONGWRITER_PROVIDER_ERROR",
    });
  }
});

router.post("/core/chat", requirePermission("core.action.execute"), async (req, res) => {
  const body: unknown = req.body;
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "messages")
  ) {
    res.status(400).json({
      success: false,
      error: "La solicitud de conversación no tiene un formato válido.",
      code: "INVALID_REQUEST",
    });
    return;
  }

  const userId = req.hbgAuth!.user.id;
  if (!allowRequest(userId)) {
    res.status(429).json({
      success: false,
      error: "Alcanzaste el límite temporal de conversaciones con IA.",
      code: "RATE_LIMITED",
    });
    return;
  }

  try {
    const messages = parseCoreChatMessages((body as Record<string, unknown>).messages);
    const reply = await generateCoreReply(messages);
    res.json({ success: true, ...reply, provider: "openai" });
  } catch (error) {
    if (error instanceof CoreChatError) {
      res.status(error.status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
      return;
    }
    req.log.error({ err: error }, "HBG Core remote chat failed");
    res.status(502).json({
      success: false,
      error: "No se pudo completar la conversación con IA.",
      code: "AI_PROVIDER_ERROR",
    });
  }
});

export default router;
