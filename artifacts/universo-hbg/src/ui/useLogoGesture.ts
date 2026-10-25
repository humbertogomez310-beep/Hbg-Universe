import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// 5 toques seguidos (máx. 2 s entre toques) y luego mantener presionado 2 s.
// La presión debe EMPEZAR dentro de los 10 s siguientes al quinto toque.
const TAPS_REQUIRED = 5;
const MAX_GAP_MS = 2000;
const ARMED_WINDOW_MS = 10000;
const HOLD_MS = 2000;

interface GestureState {
  taps: number;
  lastTapAt: number;
  armedUntil: number;
  pointerId: number | null;
  pressedWhileArmed: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

export function useLogoGesture(onUnlock: () => void) {
  const state = useRef<GestureState>({
    taps: 0,
    lastTapAt: 0,
    armedUntil: 0,
    pointerId: null,
    pressedWhileArmed: false,
    holdTimer: null,
  });
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const clearHold = useCallback(() => {
    const current = state.current;
    if (current.holdTimer) {
      clearTimeout(current.holdTimer);
      current.holdTimer = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = state.current;
      if (current.pointerId !== null) return;
      current.pointerId = event.pointerId;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Algunos navegadores no permiten capturar el puntero: el gesto sigue funcionando.
      }
      const now = Date.now();
      current.pressedWhileArmed = current.armedUntil > now;
      if (current.pressedWhileArmed) {
        clearHold();
        current.holdTimer = setTimeout(() => {
          current.holdTimer = null;
          current.taps = 0;
          current.lastTapAt = 0;
          current.armedUntil = 0;
          current.pressedWhileArmed = false;
          onUnlockRef.current();
        }, HOLD_MS);
      }
    },
    [clearHold],
  );

  const finishPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, countAsTap: boolean) => {
      const current = state.current;
      if (current.pointerId !== event.pointerId) return;
      current.pointerId = null;
      clearHold();
      const wasArmedPress = current.pressedWhileArmed;
      current.pressedWhileArmed = false;
      if (!countAsTap || wasArmedPress) return;
      const now = Date.now();
      if (current.armedUntil > now) return;
      current.taps =
        current.taps > 0 && now - current.lastTapAt <= MAX_GAP_MS ? current.taps + 1 : 1;
      current.lastTapAt = now;
      if (current.taps >= TAPS_REQUIRED) {
        current.taps = 0;
        current.armedUntil = now + ARMED_WINDOW_MS;
      }
    },
    [clearHold],
  );

  const style: CSSProperties = {
    display: "inline-block",
    padding: "14px 10px",
    margin: "-14px -10px",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: "none",
    cursor: "default",
  };

  return {
    onPointerDown,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finishPress(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finishPress(event, false),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => finishPress(event, false),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    style,
  };
}