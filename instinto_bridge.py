"""
INSTINTO BRIDGE — Módulo de Productividad y Creatividad del Ecosistema UNIVERSO HBG
Puente con la aplicación de notas INSTINTO: inserción de ideas, rimas y gestión creativa.
Recibe comandos de HBG CORE vía SyncEngine y responde al estado de ánimo musical.
"""

import os
import json
import time
import threading
import datetime
import re
import random
import hashlib
from typing import Any, Callable, Dict, List, Optional, Tuple
from pathlib import Path


# ---------------------------------------------------------------------------
# CONSTANTES Y CONFIGURACIÓN
# ---------------------------------------------------------------------------

INSTINTO_DATA_DIR = os.path.expanduser("~/.hbg/instinto")

RHYME_TEMPLATES = {
    "energized": [
        "{word} con fuego y pasión / el ritmo es mi canción",
        "Cuando escucho {word} siento el beat / la energía en cada pie",
        "{word} en el aire flota / la música nos agota / pero nunca nos derrota",
    ],
    "focused": [
        "{word} en la mente clara / la concentración no para",
        "Con {word} y determinación / construyo mi evolución",
        "{word} como ancla y norte / el trabajo es mi reporte",
    ],
    "creative": [
        "{word} nace del alma / en la tormenta hay calma",
        "La chispa de {word} / enciende lo que el tiempo olvidó",
        "{word} pintado en el lienzo / mi arte nunca es tenso",
    ],
    "relaxed": [
        "{word} como brisa suave / que el tiempo lento se abra",
        "En {word} encuentro paz / la vida fluye sin más",
        "{word} al ritmo del mar / dejarse llevar",
    ],
    "neutral": [
        "{word} en el viento va / buscando su lugar",
        "Con {word} en el corazón / la vida tiene razón",
        "{word} es el comienzo / del camino que pienso",
    ],
}

IDEA_STARTERS = {
    "energized": [
        "¿Qué pasaría si combinamos energía con tecnología?",
        "Idea: una experiencia inmersiva que fusione música y movimiento",
        "¿Podemos crear algo que genere adrenalina y propósito al mismo tiempo?",
        "Concepto: plataforma de productividad gamificada con ritmo",
    ],
    "focused": [
        "Sistema de trabajo en bloques de 25 minutos con recompensas sonoras",
        "Idea: mapa mental visual sincronizado con el estado de ánimo",
        "Protocolo de deep work con música procedural adaptativa",
        "Concepto: dashboard de métricas personales en tiempo real",
    ],
    "creative": [
        "¿Qué forma tomaría este concepto si fuera música?",
        "Idea: proyecto que mezcle géneros artísticos inesperados",
        "Experimento: crear sin reglas durante 10 minutos",
        "Concepto: arte generativo basado en patrones de hábitos",
    ],
    "relaxed": [
        "Reflexión: ¿qué aspectos de tu vida necesitan más fluidez?",
        "Idea: espacio digital minimalista para pensamiento profundo",
        "Concepto: diario de gratitud sincronizado con la música del día",
        "¿Qué proyecto puedes simplificar eliminando lo no esencial?",
    ],
    "neutral": [
        "Idea sin filtros: escribe lo primero que venga a la mente",
        "Concepto nuevo: combina dos cosas que no tienen relación aparente",
        "¿Qué problema cotidiano podrías resolver de forma creativa?",
        "Reflexión: ¿en qué estás creciendo esta semana?",
    ],
}


# ---------------------------------------------------------------------------
# NOTE STORE — Persistencia de notas
# ---------------------------------------------------------------------------

class NoteStore:
    """Almacén de notas con categorías, etiquetas y búsqueda."""

    def __init__(self, data_dir: str = INSTINTO_DATA_DIR):
        self._dir = Path(data_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._notes_file = self._dir / "notes.json"
        self._lock = threading.Lock()
        self._notes: List[Dict] = []
        self._load()

    def _load(self) -> None:
        if self._notes_file.exists():
            try:
                with open(self._notes_file, "r", encoding="utf-8") as f:
                    self._notes = json.load(f)
            except (json.JSONDecodeError, IOError):
                self._notes = []
        else:
            self._notes = []

    def _persist(self) -> None:
        with open(self._notes_file, "w", encoding="utf-8") as f:
            json.dump(self._notes, f, indent=2, ensure_ascii=False)

    def add_note(
        self,
        content: str,
        category: str = "general",
        tags: Optional[List[str]] = None,
        mood: str = "neutral",
        source: str = "manual",
    ) -> str:
        note_id = hashlib.md5(f"{content}{time.time()}".encode()).hexdigest()[:12]
        note = {
            "id": note_id,
            "content": content,
            "category": category,
            "tags": tags or [],
            "mood": mood,
            "source": source,
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "pinned": False,
            "archived": False,
        }
        with self._lock:
            self._notes.append(note)
            self._persist()
        return note_id

    def get_note(self, note_id: str) -> Optional[Dict]:
        with self._lock:
            for note in self._notes:
                if note["id"] == note_id:
                    return dict(note)
        return None

    def update_note(self, note_id: str, content: str) -> bool:
        with self._lock:
            for note in self._notes:
                if note["id"] == note_id:
                    note["content"] = content
                    note["updated_at"] = datetime.datetime.now().isoformat()
                    self._persist()
                    return True
        return False

    def delete_note(self, note_id: str) -> bool:
        with self._lock:
            original_len = len(self._notes)
            self._notes = [n for n in self._notes if n["id"] != note_id]
            if len(self._notes) < original_len:
                self._persist()
                return True
        return False

    def pin_note(self, note_id: str, pinned: bool = True) -> bool:
        with self._lock:
            for note in self._notes:
                if note["id"] == note_id:
                    note["pinned"] = pinned
                    self._persist()
                    return True
        return False

    def archive_note(self, note_id: str) -> bool:
        with self._lock:
            for note in self._notes:
                if note["id"] == note_id:
                    note["archived"] = True
                    self._persist()
                    return True
        return False

    def search(
        self,
        query: str = "",
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        mood: Optional[str] = None,
        include_archived: bool = False,
    ) -> List[Dict]:
        with self._lock:
            results = []
            for note in self._notes:
                if not include_archived and note.get("archived"):
                    continue
                if category and note.get("category") != category:
                    continue
                if mood and note.get("mood") != mood:
                    continue
                if tags and not any(t in note.get("tags", []) for t in tags):
                    continue
                if query and query.lower() not in note.get("content", "").lower():
                    continue
                results.append(dict(note))
            results.sort(key=lambda n: (not n.get("pinned"), n.get("created_at", "")), reverse=True)
            return results

    def get_by_category(self, category: str) -> List[Dict]:
        return self.search(category=category)

    def get_recent(self, limit: int = 10) -> List[Dict]:
        with self._lock:
            visible = [n for n in self._notes if not n.get("archived")]
            return sorted(visible, key=lambda n: n.get("created_at", ""), reverse=True)[:limit]

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._notes)
            archived = sum(1 for n in self._notes if n.get("archived"))
            pinned = sum(1 for n in self._notes if n.get("pinned"))
            by_cat: Dict[str, int] = {}
            by_mood: Dict[str, int] = {}
            for note in self._notes:
                cat = note.get("category", "general")
                md = note.get("mood", "neutral")
                by_cat[cat] = by_cat.get(cat, 0) + 1
                by_mood[md] = by_mood.get(md, 0) + 1
            return {
                "total": total,
                "archived": archived,
                "pinned": pinned,
                "active": total - archived,
                "by_category": by_cat,
                "by_mood": by_mood,
            }


# ---------------------------------------------------------------------------
# RHYME ENGINE — Generador de rimas por estado de ánimo
# ---------------------------------------------------------------------------

class RhymeEngine:
    """Genera rimas y versos adaptados al estado de ánimo actual."""

    def __init__(self):
        self._custom_templates: Dict[str, List[str]] = {}

    def generate_rhyme(self, seed_word: str = "", mood: str = "neutral") -> str:
        """Genera una rima basada en la palabra semilla y el estado de ánimo."""
        if not seed_word:
            seed_word = self._random_seed_word(mood)

        templates = RHYME_TEMPLATES.get(mood, RHYME_TEMPLATES["neutral"])
        custom = self._custom_templates.get(mood, [])
        all_templates = templates + custom
        template = random.choice(all_templates)
        return template.format(word=seed_word)

    def generate_verse(self, topic: str, mood: str = "neutral", lines: int = 4) -> str:
        """Genera un verso completo de N líneas sobre un tema."""
        words = self._extract_keywords(topic)
        verse_lines = []
        for i in range(lines):
            word = words[i % len(words)] if words else topic
            line = self.generate_rhyme(seed_word=word, mood=mood)
            verse_lines.append(line)
        return "\n".join(verse_lines)

    def generate_hook(self, mood: str = "neutral") -> str:
        """Genera un gancho lírico corto según el estado de ánimo."""
        hooks = {
            "energized": [
                "El fuego no se apaga, se renueva",
                "Move the crowd, mueve la ciudad",
                "Sin parar, sin parar, el ritmo va",
            ],
            "focused": [
                "La mente clara, el camino abierto",
                "Deep work, deep soul, deep flow",
                "Un paso a la vez, el éxito es certero",
            ],
            "creative": [
                "Del caos nace la obra maestra",
                "Crea sin miedo, arde sin quema",
                "La imaginación es la única regla",
            ],
            "relaxed": [
                "Fluye, fluye, todo pasa",
                "La paz es el ritmo que abraza",
                "Sin prisa, sin pausa, sin peso",
            ],
            "neutral": [
                "Cada momento es el comienzo",
                "La historia se escribe hoy",
                "En el simple está lo eterno",
            ],
        }
        return random.choice(hooks.get(mood, hooks["neutral"]))

    def add_custom_template(self, mood: str, template: str) -> None:
        """Agrega un template personalizado de rima."""
        if mood not in self._custom_templates:
            self._custom_templates[mood] = []
        self._custom_templates[mood].append(template)

    def _extract_keywords(self, text: str) -> List[str]:
        words = re.findall(r'\b[a-záéíóúñü]{4,}\b', text.lower())
        stopwords = {"para", "como", "esto", "esos", "esta", "todo", "cada", "pero", "más"}
        filtered = [w for w in words if w not in stopwords]
        return filtered if filtered else [text.split()[0]] if text else ["alma"]

    def _random_seed_word(self, mood: str) -> str:
        seed_map = {
            "energized": ["fuego", "ritmo", "poder", "beat", "baile"],
            "focused":   ["mente", "meta", "trabajo", "código", "visión"],
            "creative":  ["arte", "sueño", "color", "idea", "alma"],
            "relaxed":   ["paz", "brisa", "calma", "silencio", "mar"],
            "neutral":   ["tiempo", "vida", "momento", "ser", "hoy"],
        }
        return random.choice(seed_map.get(mood, seed_map["neutral"]))


# ---------------------------------------------------------------------------
# IDEA GENERATOR — Generador de ideas según estado de ánimo
# ---------------------------------------------------------------------------

class IdeaGenerator:
    """Genera ideas creativas y sugerencias según el contexto y estado de ánimo."""

    def __init__(self):
        self._idea_log: List[Dict] = []
        self._lock = threading.Lock()

    def generate_idea(self, context: str = "", mood: str = "neutral") -> str:
        """Genera una idea basada en el contexto y estado de ánimo."""
        starters = IDEA_STARTERS.get(mood, IDEA_STARTERS["neutral"])
        base_idea = random.choice(starters)

        if context:
            keywords = self._extract_keywords(context)
            if keywords:
                enriched = f"{base_idea} — aplicado a: {', '.join(keywords[:3])}"
                idea = enriched
            else:
                idea = base_idea
        else:
            idea = base_idea

        with self._lock:
            self._idea_log.append({
                "idea": idea,
                "mood": mood,
                "context": context,
                "timestamp": datetime.datetime.now().isoformat(),
            })

        return idea

    def generate_burst(self, context: str = "", mood: str = "neutral", count: int = 5) -> List[str]:
        """Genera una ráfaga de ideas rápidas."""
        ideas = []
        starters = IDEA_STARTERS.get(mood, IDEA_STARTERS["neutral"])
        pool = starters * (count // len(starters) + 1)
        selected = random.sample(pool, min(count, len(pool)))
        for starter in selected:
            ideas.append(starter)
        return ideas

    def get_prompt(self, mood: str = "neutral") -> str:
        """Retorna un prompt de escritura creativa según el estado de ánimo."""
        prompts = {
            "energized": "Escribe sobre la última vez que te sentiste imparable.",
            "focused": "Describe tu sistema ideal de trabajo en 3 reglas.",
            "creative": "Mezcla dos ideas totalmente opuestas en un concepto nuevo.",
            "relaxed": "¿Qué simplicidad te ha dado más valor en la vida?",
            "neutral": "¿Qué quieres recordar de este momento dentro de un año?",
        }
        return prompts.get(mood, prompts["neutral"])

    def get_recent_ideas(self, limit: int = 10) -> List[Dict]:
        with self._lock:
            return self._idea_log[-limit:]

    def _extract_keywords(self, text: str) -> List[str]:
        words = re.findall(r'\b[a-záéíóúñü]{4,}\b', text.lower())
        stopwords = {"para", "como", "esto", "esos", "esta", "todo", "cada", "pero", "más", "desde"}
        return [w for w in words if w not in stopwords][:5]


# ---------------------------------------------------------------------------
# INSTINTO BRIDGE — Puente de integración con HBG CORE
# ---------------------------------------------------------------------------

class InstintoBridge:
    """
    Módulo de productividad creativa del ecosistema UNIVERSO HBG.
    Gestiona notas, genera ideas y rimas según el estado de ánimo.
    Se integra con HBG CORE vía SyncEngine.
    """

    def __init__(self, sync_engine=None, data_dir: str = INSTINTO_DATA_DIR):
        self._sync = sync_engine
        self._store = NoteStore(data_dir=data_dir)
        self._rhyme = RhymeEngine()
        self._ideas = IdeaGenerator()
        self._current_mood: str = "neutral"
        self._active = False
        self._lock = threading.Lock()
        self._event_callbacks: List[Callable[[str, Dict], None]] = []

        if sync_engine is not None:
            self._connect_sync()

    def _connect_sync(self) -> None:
        self._sync.subscribe("instinto.command", self._on_instinto_command)
        self._sync.subscribe("hbg_core.mood_changed", self._on_mood_changed)
        print("[InstintoBridge] Conectado al SyncEngine de HBG CORE.")

    def start(self) -> None:
        self._active = True
        print("[InstintoBridge] Módulo de productividad activo.")

    def stop(self) -> None:
        self._active = False
        print("[InstintoBridge] Módulo detenido.")

    def _on_instinto_command(self, message: Dict) -> None:
        """Recibe comandos del DJEngine vía SyncEngine."""
        payload = message.get("payload", {})
        action = payload.get("action", "")
        raw_text = payload.get("raw_text", "")
        mood = payload.get("mood", self._current_mood)

        threading.Thread(
            target=self._execute_command,
            args=(action, raw_text, mood),
            daemon=True,
        ).start()

    def _on_mood_changed(self, message: Dict) -> None:
        """Actualiza el estado de ánimo cuando HBG CORE lo notifica."""
        payload = message.get("payload", {})
        new_mood = payload.get("mood", "neutral")
        with self._lock:
            self._current_mood = new_mood
        print(f"[InstintoBridge] Estado de ánimo actualizado: {new_mood}")
        self._auto_inject_mood_content(new_mood)

    def _execute_command(self, action: str, raw_text: str, mood: str) -> None:
        """Ejecuta la acción correspondiente."""
        action_map = {
            "save_note": self._cmd_save_note,
            "new_idea": self._cmd_new_idea,
            "rhyme": self._cmd_rhyme,
        }
        handler = action_map.get(action)
        if handler:
            handler(raw_text, mood)
        else:
            print(f"[InstintoBridge] Acción no reconocida: '{action}'")

    def _cmd_save_note(self, raw_text: str, mood: str) -> None:
        """Guarda una nota desde un comando de voz."""
        content = self._clean_command_text(raw_text, ["guardar nota", "nota"])
        if not content:
            content = f"Nota de voz — {datetime.datetime.now().strftime('%H:%M')}"
        note_id = self._store.add_note(
            content=content,
            category="voz",
            tags=["voz", mood],
            mood=mood,
            source="dj_engine_voice",
        )
        note = self._store.get_note(note_id)
        print(f"[InstintoBridge] Nota guardada [{note_id}]: {content[:60]}")
        self._emit_event("note_saved", {"note": note})
        if self._sync:
            self._sync.publish("instinto.note_saved", {"note_id": note_id, "content": content[:60]})

    def _cmd_new_idea(self, raw_text: str, mood: str) -> None:
        """Genera y guarda una nueva idea."""
        context = self._clean_command_text(raw_text, ["nueva idea", "idea"])
        idea_text = self._ideas.generate_idea(context=context, mood=mood)
        note_id = self._store.add_note(
            content=idea_text,
            category="ideas",
            tags=["auto_generated", mood, "idea"],
            mood=mood,
            source="idea_generator",
        )
        print(f"[InstintoBridge] Idea generada [{note_id}]: {idea_text}")
        self._emit_event("idea_generated", {"idea": idea_text, "note_id": note_id})
        if self._sync:
            self._sync.publish("instinto.idea_generated", {"idea": idea_text, "note_id": note_id})

    def _cmd_rhyme(self, raw_text: str, mood: str) -> None:
        """Genera una rima y la guarda como nota."""
        context = self._clean_command_text(raw_text, ["rimar", "rima"])
        keywords = re.findall(r'\b[a-záéíóúñü]{4,}\b', context.lower()) if context else []
        seed = keywords[0] if keywords else ""
        rhyme_text = self._rhyme.generate_rhyme(seed_word=seed, mood=mood)
        hook = self._rhyme.generate_hook(mood=mood)
        full_content = f"{rhyme_text}\n— {hook}"
        note_id = self._store.add_note(
            content=full_content,
            category="rimas",
            tags=["rima", mood, "auto_generated"],
            mood=mood,
            source="rhyme_engine",
        )
        print(f"[InstintoBridge] Rima generada [{note_id}]:\n{full_content}")
        self._emit_event("rhyme_generated", {"rhyme": full_content, "note_id": note_id})
        if self._sync:
            self._sync.publish("instinto.rhyme_generated", {"rhyme": full_content, "note_id": note_id})

    def _auto_inject_mood_content(self, mood: str) -> None:
        """Inyecta automáticamente contenido creativo cuando cambia el mood."""
        idea = self._ideas.generate_idea(mood=mood)
        prompt = self._ideas.get_prompt(mood=mood)
        hook = self._rhyme.generate_hook(mood=mood)
        self._store.add_note(
            content=f"[AUTO-MOOD: {mood.upper()}]\n{idea}\n\nPrompt: {prompt}\nHook: {hook}",
            category="auto_mood",
            tags=["auto", mood, "mood_injection"],
            mood=mood,
            source="mood_auto_inject",
        )
        print(f"[InstintoBridge] Contenido de mood '{mood}' inyectado automáticamente.")

    # ---------------------------------------------------------------------------
    # API PÚBLICA
    # ---------------------------------------------------------------------------

    def save_note(
        self,
        content: str,
        category: str = "general",
        tags: Optional[List[str]] = None,
        mood: Optional[str] = None,
    ) -> str:
        """API pública para guardar una nota directamente."""
        effective_mood = mood or self._current_mood
        return self._store.add_note(
            content=content,
            category=category,
            tags=tags or [],
            mood=effective_mood,
            source="api",
        )

    def get_notes(
        self,
        query: str = "",
        category: Optional[str] = None,
        mood: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict]:
        """Busca y retorna notas filtradas."""
        results = self._store.search(query=query, category=category, mood=mood)
        return results[:limit]

    def generate_idea(self, context: str = "", mood: Optional[str] = None) -> str:
        """Genera una idea y la guarda automáticamente."""
        effective_mood = mood or self._current_mood
        return self._ideas.generate_idea(context=context, mood=effective_mood)

    def generate_verse(self, topic: str = "", mood: Optional[str] = None, lines: int = 4) -> str:
        """Genera un verso completo sobre un tema."""
        effective_mood = mood or self._current_mood
        verse = self._rhyme.generate_verse(topic=topic, mood=effective_mood, lines=lines)
        self._store.add_note(
            content=verse,
            category="versos",
            tags=["verso", effective_mood],
            mood=effective_mood,
            source="api_verse",
        )
        return verse

    def get_daily_prompt(self) -> str:
        """Retorna el prompt de escritura del día según el estado de ánimo."""
        return self._ideas.get_prompt(self._current_mood)

    def get_idea_burst(self, count: int = 5) -> List[str]:
        """Genera una ráfaga de ideas."""
        return self._ideas.generate_burst(mood=self._current_mood, count=count)

    def get_stats(self) -> Dict[str, Any]:
        """Estadísticas del módulo."""
        return {
            "notes": self._store.get_stats(),
            "ideas_generated": len(self._ideas.get_recent_ideas(limit=9999)),
            "current_mood": self._current_mood,
            "daily_prompt": self.get_daily_prompt(),
        }

    def export_notes(self, export_path: str, category: Optional[str] = None) -> int:
        """Exporta notas a un archivo JSON."""
        notes = self._store.search(category=category, include_archived=True)
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump(notes, f, indent=2, ensure_ascii=False)
        print(f"[InstintoBridge] {len(notes)} notas exportadas a: {export_path}")
        return len(notes)

    def import_notes(self, import_path: str) -> int:
        """Importa notas desde un archivo JSON."""
        if not os.path.exists(import_path):
            print(f"[InstintoBridge] Archivo no encontrado: {import_path}")
            return 0
        with open(import_path, "r", encoding="utf-8") as f:
            notes = json.load(f)
        count = 0
        for note in notes:
            if isinstance(note, dict) and "content" in note:
                self._store.add_note(
                    content=note["content"],
                    category=note.get("category", "imported"),
                    tags=note.get("tags", []) + ["imported"],
                    mood=note.get("mood", "neutral"),
                    source="import",
                )
                count += 1
        print(f"[InstintoBridge] {count} notas importadas.")
        return count

    def subscribe_to_events(self, callback: Callable[[str, Dict], None]) -> None:
        """Suscribe a eventos del módulo (note_saved, idea_generated, rhyme_generated)."""
        self._event_callbacks.append(callback)

    def _emit_event(self, event_type: str, data: Dict) -> None:
        for cb in self._event_callbacks:
            try:
                cb(event_type, data)
            except Exception as e:
                print(f"[InstintoBridge] Error en callback de evento: {e}")

    def set_mood(self, mood: str) -> None:
        """Cambia el estado de ánimo del módulo directamente."""
        with self._lock:
            self._current_mood = mood

    @property
    def note_store(self) -> NoteStore:
        return self._store

    @property
    def rhyme_engine(self) -> RhymeEngine:
        return self._rhyme

    @property
    def idea_generator(self) -> IdeaGenerator:
        return self._ideas

    # ---------------------------------------------------------------------------
    # UTILIDADES PRIVADAS
    # ---------------------------------------------------------------------------

    def _clean_command_text(self, text: str, remove_phrases: List[str]) -> str:
        """Limpia el texto del comando eliminando frases de activación."""
        result = text.lower()
        for phrase in remove_phrases:
            result = result.replace(phrase.lower(), "")
        result = re.sub(r'\s+', ' ', result).strip()
        result = result.lstrip(":,-. ")
        return result.capitalize()

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()


# ---------------------------------------------------------------------------
# EJECUCIÓN DIRECTA (demo standalone)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  INSTINTO BRIDGE — Módulo de Productividad UNIVERSO HBG")
    print("=" * 60)

    bridge = InstintoBridge(sync_engine=None)
    bridge.start()

    print("\n--- Cambiando mood a 'creative' ---")
    bridge.set_mood("creative")

    print("\n--- Guardando notas ---")
    note_id = bridge.save_note(
        content="El ritmo es la base de la productividad creativa",
        category="reflexiones",
        tags=["productividad", "música"],
    )
    print(f"Nota guardada con ID: {note_id}")

    print("\n--- Generando idea ---")
    idea = bridge.generate_idea(context="música y productividad")
    print(f"Idea: {idea}")

    print("\n--- Generando verso ---")
    verse = bridge.generate_verse(topic="ritmo y creación", lines=4)
    print(f"Verso:\n{verse}")

    print("\n--- Prompt del día ---")
    print(bridge.get_daily_prompt())

    print("\n--- Ráfaga de ideas ---")
    for i, idea in enumerate(bridge.get_idea_burst(count=3), 1):
        print(f"  {i}. {idea}")

    print("\n--- Estadísticas ---")
    stats = bridge.get_stats()
    print(json.dumps(stats, indent=2, ensure_ascii=False))

    print("\n--- Notas recientes ---")
    for note in bridge.get_notes(limit=3):
        print(f"  [{note['id']}] [{note['category']}] {note['content'][:60]}...")

    bridge.stop()
