"""
HBG CORE — El Cerebro Central del Ecosistema UNIVERSO HBG
Contiene: MemoryEngine, MoodEngine, SyncEngine, DJEngine
"""

import json
import os
import time
import threading
import datetime
import hashlib
import queue
import random
from typing import Any, Callable, Dict, List, Optional


# ---------------------------------------------------------------------------
# MEMORY ENGINE — Persistencia de hábitos y contexto
# ---------------------------------------------------------------------------

class MemoryEngine:
    """Guarda, recupera y analiza los hábitos del usuario."""

    DEFAULT_PATH = os.path.expanduser("~/.hbg/memory.json")

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path or self.DEFAULT_PATH
        self._lock = threading.Lock()
        self._data: Dict[str, Any] = {}
        self._ensure_storage()
        self._load()

    def _ensure_storage(self) -> None:
        directory = os.path.dirname(self.storage_path)
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)

    def _load(self) -> None:
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, IOError):
                self._data = {}
        else:
            self._data = {}

    def _persist(self) -> None:
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    def record_habit(self, category: str, event: str, metadata: Optional[Dict] = None) -> str:
        """Registra un evento de hábito con timestamp. Retorna el ID del registro."""
        with self._lock:
            record_id = hashlib.md5(
                f"{category}{event}{time.time()}".encode()
            ).hexdigest()[:10]
            if category not in self._data:
                self._data[category] = []
            entry = {
                "id": record_id,
                "event": event,
                "timestamp": datetime.datetime.now().isoformat(),
                "metadata": metadata or {},
            }
            self._data[category].append(entry)
            self._persist()
            return record_id

    def get_habits(self, category: str, limit: int = 50) -> List[Dict]:
        """Recupera los últimos N hábitos de una categoría."""
        with self._lock:
            records = self._data.get(category, [])
            return records[-limit:]

    def get_all_categories(self) -> List[str]:
        """Lista todas las categorías almacenadas."""
        with self._lock:
            return list(self._data.keys())

    def analyze_frequency(self, category: str) -> Dict[str, int]:
        """Analiza la frecuencia de eventos por día en una categoría."""
        habits = self.get_habits(category, limit=500)
        freq: Dict[str, int] = {}
        for h in habits:
            day = h["timestamp"][:10]
            freq[day] = freq.get(day, 0) + 1
        return freq

    def delete_category(self, category: str) -> bool:
        """Elimina todos los registros de una categoría."""
        with self._lock:
            if category in self._data:
                del self._data[category]
                self._persist()
                return True
            return False

    def get_summary(self) -> Dict[str, int]:
        """Resumen de cuántos registros hay por categoría."""
        with self._lock:
            return {k: len(v) for k, v in self._data.items()}


# ---------------------------------------------------------------------------
# MOOD ENGINE — Gestión de estados de ánimo
# ---------------------------------------------------------------------------

MOOD_PROFILES = {
    "energized": {
        "bpm_range": (120, 160),
        "mode": "party",
        "color_theme": "neon",
        "suggested_playlist": ["electrónica", "reggaeton", "trap"],
    },
    "focused": {
        "bpm_range": (60, 90),
        "mode": "focus",
        "color_theme": "deep_blue",
        "suggested_playlist": ["lofi", "ambient", "jazz instrumental"],
    },
    "creative": {
        "bpm_range": (80, 110),
        "mode": "creative",
        "color_theme": "aurora",
        "suggested_playlist": ["indie", "alternativo", "soul"],
    },
    "relaxed": {
        "bpm_range": (50, 75),
        "mode": "chill",
        "color_theme": "sunset",
        "suggested_playlist": ["reggae", "acoustic", "bossa nova"],
    },
    "neutral": {
        "bpm_range": (90, 120),
        "mode": "normal",
        "color_theme": "white",
        "suggested_playlist": ["pop", "variado"],
    },
}


class MoodEngine:
    """Detecta, ajusta y emite el estado de ánimo actual."""

    def __init__(self, memory_engine: MemoryEngine):
        self._memory = memory_engine
        self._current_mood: str = "neutral"
        self._mood_history: List[Dict] = []
        self._subscribers: List[Callable[[str, Dict], None]] = []
        self._lock = threading.Lock()

    @property
    def current_mood(self) -> str:
        return self._current_mood

    def set_mood(self, mood: str, source: str = "manual") -> Dict:
        """Cambia el estado de ánimo y notifica a los suscriptores."""
        if mood not in MOOD_PROFILES:
            raise ValueError(f"Estado de ánimo desconocido: '{mood}'. Válidos: {list(MOOD_PROFILES.keys())}")

        with self._lock:
            self._current_mood = mood
            profile = MOOD_PROFILES[mood]
            record = {
                "mood": mood,
                "source": source,
                "timestamp": datetime.datetime.now().isoformat(),
                "profile": profile,
            }
            self._mood_history.append(record)
            self._memory.record_habit("mood_changes", mood, {"source": source})

        threading.Thread(
            target=self._notify_subscribers,
            args=(mood, profile),
            daemon=True
        ).start()

        return profile

    def get_profile(self, mood: Optional[str] = None) -> Dict:
        """Retorna el perfil completo del estado de ánimo actual o del indicado."""
        target = mood or self._current_mood
        return MOOD_PROFILES.get(target, MOOD_PROFILES["neutral"])

    def detect_mood_from_text(self, text: str) -> str:
        """Inferencia simple de estado de ánimo a partir de texto/comando de voz."""
        text_lower = text.lower()
        keyword_map = {
            "energized": ["fiesta", "party", "energía", "bailar", "activar", "pump"],
            "focused": ["trabajar", "concentrar", "estudiar", "focus", "productivo"],
            "creative": ["crear", "componer", "inspirar", "flow", "arte", "rimar"],
            "relaxed": ["relajar", "descansar", "chill", "tranquilo", "calma"],
        }
        for mood, keywords in keyword_map.items():
            if any(kw in text_lower for kw in keywords):
                return mood
        return "neutral"

    def subscribe(self, callback: Callable[[str, Dict], None]) -> None:
        """Suscribe un callback para recibir cambios de estado de ánimo."""
        with self._lock:
            self._subscribers.append(callback)

    def _notify_subscribers(self, mood: str, profile: Dict) -> None:
        for cb in self._subscribers:
            try:
                cb(mood, profile)
            except Exception as e:
                print(f"[MoodEngine] Error en suscriptor: {e}")

    def get_history(self, limit: int = 20) -> List[Dict]:
        """Retorna el historial de cambios de estado de ánimo."""
        with self._lock:
            return self._mood_history[-limit:]

    def auto_detect_and_set(self, text: str) -> Dict:
        """Detecta automáticamente el estado de ánimo desde texto y lo establece."""
        mood = self.detect_mood_from_text(text)
        return self.set_mood(mood, source="auto_detect")


# ---------------------------------------------------------------------------
# SYNC ENGINE — Bus de comunicación entre módulos
# ---------------------------------------------------------------------------

class SyncEngine:
    """Bus de mensajería publish/subscribe para comunicación entre módulos."""

    def __init__(self):
        self._channels: Dict[str, List[Callable]] = {}
        self._message_queue: queue.Queue = queue.Queue()
        self._lock = threading.Lock()
        self._running = False
        self._dispatch_thread: Optional[threading.Thread] = None

    def start(self) -> None:
        """Inicia el loop de despacho de mensajes."""
        self._running = True
        self._dispatch_thread = threading.Thread(
            target=self._dispatch_loop,
            daemon=True,
            name="SyncEngine-Dispatcher"
        )
        self._dispatch_thread.start()
        print("[SyncEngine] Bus de mensajes iniciado.")

    def stop(self) -> None:
        """Detiene el loop de despacho."""
        self._running = False
        self._message_queue.put(None)  # señal de cierre
        if self._dispatch_thread:
            self._dispatch_thread.join(timeout=3)
        print("[SyncEngine] Bus de mensajes detenido.")

    def subscribe(self, channel: str, callback: Callable[[Dict], None]) -> None:
        """Suscribe un callback a un canal."""
        with self._lock:
            if channel not in self._channels:
                self._channels[channel] = []
            self._channels[channel].append(callback)

    def unsubscribe(self, channel: str, callback: Callable) -> bool:
        """Desuscribe un callback de un canal."""
        with self._lock:
            if channel in self._channels:
                try:
                    self._channels[channel].remove(callback)
                    return True
                except ValueError:
                    pass
        return False

    def publish(self, channel: str, payload: Dict) -> None:
        """Publica un mensaje en un canal de forma asíncrona."""
        message = {
            "channel": channel,
            "payload": payload,
            "timestamp": datetime.datetime.now().isoformat(),
        }
        self._message_queue.put(message)

    def publish_sync(self, channel: str, payload: Dict) -> None:
        """Publica un mensaje de forma síncrona (bloquea hasta despachar)."""
        message = {
            "channel": channel,
            "payload": payload,
            "timestamp": datetime.datetime.now().isoformat(),
        }
        self._dispatch_message(message)

    def _dispatch_loop(self) -> None:
        while self._running:
            try:
                message = self._message_queue.get(timeout=0.1)
                if message is None:
                    break
                self._dispatch_message(message)
            except queue.Empty:
                continue

    def _dispatch_message(self, message: Dict) -> None:
        channel = message["channel"]
        with self._lock:
            callbacks = list(self._channels.get(channel, []))
        for cb in callbacks:
            try:
                cb(message)
            except Exception as e:
                print(f"[SyncEngine] Error en canal '{channel}': {e}")

    def get_active_channels(self) -> List[str]:
        with self._lock:
            return list(self._channels.keys())


# ---------------------------------------------------------------------------
# DJ ENGINE — Orquestador de IA por comandos de voz
# ---------------------------------------------------------------------------

class DJEngine:
    """
    Orquestador central de IA que procesa comandos de voz,
    coordina los módulos y toma decisiones inteligentes.
    """

    COMMANDS = {
        "reproducir": "play",
        "play": "play",
        "parar": "stop",
        "stop": "stop",
        "pausar": "pause",
        "pause": "pause",
        "siguiente": "next",
        "next": "next",
        "anterior": "previous",
        "subir volumen": "volume_up",
        "bajar volumen": "volume_down",
        "modo fiesta": "mode_party",
        "modo enfoque": "mode_focus",
        "modo creativo": "mode_creative",
        "modo chill": "mode_relaxed",
        "guardar nota": "save_note",
        "nueva idea": "new_idea",
        "rimar": "rhyme",
        "optimizar": "optimize_system",
        "reportar": "system_report",
        "estado": "status",
    }

    def __init__(
        self,
        memory_engine: MemoryEngine,
        mood_engine: MoodEngine,
        sync_engine: SyncEngine,
    ):
        self._memory = memory_engine
        self._mood = mood_engine
        self._sync = sync_engine
        self._command_history: List[Dict] = []
        self._lock = threading.Lock()
        self._active = False
        self._command_queue: queue.Queue = queue.Queue()
        self._worker_thread: Optional[threading.Thread] = None

        self._mood.subscribe(self._on_mood_change)

    def start(self) -> None:
        """Activa el motor de procesamiento de comandos."""
        self._active = True
        self._worker_thread = threading.Thread(
            target=self._command_worker,
            daemon=True,
            name="DJEngine-Worker"
        )
        self._worker_thread.start()
        print("[DJEngine] Motor de IA activado y escuchando.")

    def stop(self) -> None:
        """Desactiva el motor."""
        self._active = False
        self._command_queue.put(None)
        if self._worker_thread:
            self._worker_thread.join(timeout=3)
        print("[DJEngine] Motor de IA detenido.")

    def process_voice_command(self, raw_text: str) -> Dict:
        """
        Entrada principal: recibe texto de voz, lo interpreta y encola la acción.
        Retorna un dict con el resultado inmediato del parsing.
        """
        raw_text = raw_text.strip()
        command_key = self._parse_command(raw_text)

        parsed = {
            "raw": raw_text,
            "command": command_key,
            "mood_detected": self._mood.detect_mood_from_text(raw_text),
            "timestamp": datetime.datetime.now().isoformat(),
        }

        with self._lock:
            self._command_history.append(parsed)
            self._memory.record_habit("voice_commands", command_key, {"raw": raw_text})

        self._command_queue.put(parsed)
        return parsed

    def _parse_command(self, text: str) -> str:
        """Mapea texto libre al comando interno más cercano."""
        text_lower = text.lower()
        for trigger, action in self.COMMANDS.items():
            if trigger in text_lower:
                return action
        return "unknown"

    def _command_worker(self) -> None:
        """Worker thread que ejecuta comandos de la cola."""
        while self._active:
            try:
                cmd = self._command_queue.get(timeout=0.2)
                if cmd is None:
                    break
                self._execute_command(cmd)
            except queue.Empty:
                continue

    def _execute_command(self, cmd: Dict) -> None:
        """Despacha el comando a los módulos correspondientes vía SyncEngine."""
        action = cmd.get("command", "unknown")
        mood = cmd.get("mood_detected", self._mood.current_mood)

        audio_actions = {"play", "stop", "pause", "next", "previous", "volume_up", "volume_down"}
        mode_actions = {"mode_party", "mode_focus", "mode_creative", "mode_relaxed"}
        note_actions = {"save_note", "new_idea", "rhyme"}
        system_actions = {"optimize_system", "system_report"}

        if action in audio_actions:
            self._sync.publish("vibra_pro.command", {
                "action": action,
                "mood": mood,
                "source": "dj_engine",
            })

        elif action in mode_actions:
            mood_map = {
                "mode_party": "energized",
                "mode_focus": "focused",
                "mode_creative": "creative",
                "mode_relaxed": "relaxed",
            }
            target_mood = mood_map[action]
            self._mood.set_mood(target_mood, source="dj_engine_voice")
            self._sync.publish("vibra_pro.mode_change", {
                "mode": MOOD_PROFILES[target_mood]["mode"],
                "mood": target_mood,
            })

        elif action in note_actions:
            self._sync.publish("instinto.command", {
                "action": action,
                "raw_text": cmd.get("raw", ""),
                "mood": mood,
                "source": "dj_engine",
            })

        elif action in system_actions:
            self._sync.publish("terminador.command", {
                "action": action,
                "source": "dj_engine",
            })

        elif action == "status":
            self._publish_status()

        else:
            print(f"[DJEngine] Comando no reconocido: '{cmd.get('raw', '')}' → acción: {action}")

    def _on_mood_change(self, mood: str, profile: Dict) -> None:
        """Reacciona a cambios de estado de ánimo emitidos por MoodEngine."""
        self._sync.publish("hbg_core.mood_changed", {
            "mood": mood,
            "profile": profile,
        })
        print(f"[DJEngine] Estado de ánimo actualizado: {mood} → modo {profile['mode']}")

    def _publish_status(self) -> None:
        status = {
            "current_mood": self._mood.current_mood,
            "mood_profile": self._mood.get_profile(),
            "commands_processed": len(self._command_history),
            "memory_summary": self._memory.get_summary(),
            "active_channels": self._sync.get_active_channels(),
            "timestamp": datetime.datetime.now().isoformat(),
        }
        self._sync.publish("hbg_core.status", status)
        print(f"[DJEngine] Estado del sistema:\n{json.dumps(status, indent=2, ensure_ascii=False)}")

    def get_command_history(self, limit: int = 30) -> List[Dict]:
        with self._lock:
            return self._command_history[-limit:]

    def suggest_action(self) -> str:
        """Sugerencia inteligente basada en el historial de hábitos."""
        mood = self._mood.current_mood
        profile = self._mood.get_profile()
        hour = datetime.datetime.now().hour

        if 6 <= hour < 12:
            suggestion = f"Buenos días. Mood: {mood}. Te sugiero activar modo {profile['mode']} y reproducir {random.choice(profile['suggested_playlist'])}."
        elif 12 <= hour < 18:
            suggestion = f"Tarde productiva. Mood: {mood}. Considera {random.choice(profile['suggested_playlist'])} para acompañar."
        elif 18 <= hour < 22:
            suggestion = f"Noche activa. Mood: {mood}. Ideal para {random.choice(profile['suggested_playlist'])}."
        else:
            suggestion = f"Hora de descansar. Mood: {mood}. Te recomiendo modo relajado."

        return suggestion


# ---------------------------------------------------------------------------
# HBG CORE — Punto de entrada y gestor del ecosistema
# ---------------------------------------------------------------------------

class HBGCore:
    """
    Cerebro central del ecosistema UNIVERSO HBG.
    Instancia y coordina todos los motores internos.
    """

    def __init__(self, memory_path: Optional[str] = None):
        print("=" * 60)
        print("  UNIVERSO HBG — Iniciando HBG CORE")
        print("=" * 60)

        self.memory = MemoryEngine(storage_path=memory_path)
        self.mood = MoodEngine(memory_engine=self.memory)
        self.sync = SyncEngine()
        self.dj = DJEngine(
            memory_engine=self.memory,
            mood_engine=self.mood,
            sync_engine=self.sync,
        )

        self._initialized = False

    def start(self) -> None:
        """Arranca todos los motores."""
        self.sync.start()
        self.dj.start()
        self._initialized = True
        self.memory.record_habit("system", "core_started")
        print("[HBGCore] Todos los motores activos. Sistema listo.")

    def stop(self) -> None:
        """Detiene todos los motores de forma limpia."""
        self.dj.stop()
        self.sync.stop()
        self.memory.record_habit("system", "core_stopped")
        print("[HBGCore] Sistema detenido correctamente.")

    def send_voice_command(self, text: str) -> Dict:
        """Interfaz principal para enviar comandos de voz al DJEngine."""
        if not self._initialized:
            raise RuntimeError("HBGCore no ha sido iniciado. Llama a start() primero.")
        return self.dj.process_voice_command(text)

    def set_mood(self, mood: str) -> Dict:
        """Cambia el estado de ánimo directamente."""
        return self.mood.set_mood(mood, source="hbg_core_api")

    def subscribe_to_channel(self, channel: str, callback: Callable) -> None:
        """Permite a módulos externos suscribirse al bus de mensajes."""
        self.sync.subscribe(channel, callback)

    def get_status(self) -> Dict:
        """Retorna el estado completo del sistema."""
        return {
            "mood": self.mood.current_mood,
            "mood_profile": self.mood.get_profile(),
            "memory_summary": self.memory.get_summary(),
            "active_channels": self.sync.get_active_channels(),
            "suggestion": self.dj.suggest_action(),
        }

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()


# ---------------------------------------------------------------------------
# EJECUCIÓN DIRECTA (demo)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    with HBGCore() as core:
        print("\n--- Enviando comandos de prueba ---\n")

        core.send_voice_command("modo fiesta, necesito energía para bailar")
        time.sleep(0.3)

        core.send_voice_command("reproducir música")
        time.sleep(0.3)

        core.send_voice_command("guardar nota: tengo una nueva idea para la canción")
        time.sleep(0.3)

        core.send_voice_command("optimizar sistema")
        time.sleep(0.3)

        core.send_voice_command("estado")
        time.sleep(0.5)

        print("\n--- Estado final del sistema ---")
        status = core.get_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))

        print("\n--- Historial de comandos ---")
        for cmd in core.dj.get_command_history():
            print(f"  [{cmd['timestamp']}] '{cmd['raw']}' → {cmd['command']}")

        print("\n[HBGCore] Demo completada. Cerrando sistema...")
        time.sleep(1)
