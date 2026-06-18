"""
VIBRA PRO — Módulo de Audio Premium del Ecosistema UNIVERSO HBG
Reproductor con UI Tkinter oscuro mate + motor Pygame a 44100Hz.
Recibe órdenes asíncronas desde DJEngine vía SyncEngine.
"""

import os
import sys
import time
import threading
import queue
import json
import random
import tkinter as tk
from tkinter import filedialog, ttk, messagebox
from typing import Optional, List, Dict, Callable, Tuple
from pathlib import Path

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False
    print("[VibraPro] ADVERTENCIA: pygame no instalado. Audio desactivado. Instala con: pip install pygame")


# ---------------------------------------------------------------------------
# CONSTANTES DE TEMA OSCURO MATE
# ---------------------------------------------------------------------------

THEME = {
    "bg_primary":     "#121212",
    "bg_secondary":   "#1E1E1E",
    "bg_card":        "#242424",
    "bg_hover":       "#2A2A2A",
    "accent_primary": "#7C4DFF",
    "accent_party":   "#FF4081",
    "accent_focus":   "#00BCD4",
    "accent_creative":"#FF9800",
    "accent_chill":   "#4CAF50",
    "text_primary":   "#FFFFFF",
    "text_secondary": "#B0B0B0",
    "text_muted":     "#666666",
    "border":         "#2E2E2E",
    "progress_bg":    "#2E2E2E",
    "slider_trough":  "#2E2E2E",
}

MODE_COLORS = {
    "party":    THEME["accent_party"],
    "focus":    THEME["accent_focus"],
    "creative": THEME["accent_creative"],
    "chill":    THEME["accent_chill"],
    "normal":   THEME["accent_primary"],
}

SAMPLE_RATE = 44100
CHANNELS    = 2
BUFFER_SIZE = 2048


# ---------------------------------------------------------------------------
# AUDIO ENGINE — Capa de abstracción sobre Pygame
# ---------------------------------------------------------------------------

class AudioEngine:
    """Controla la reproducción de audio mediante Pygame a 44100Hz."""

    def __init__(self):
        self._initialized = False
        self._current_file: Optional[str] = None
        self._paused = False
        self._volume: float = 0.8
        self._position_start: float = 0.0
        self._lock = threading.Lock()
        self._on_track_end_callbacks: List[Callable] = []

        if PYGAME_AVAILABLE:
            self._init_pygame()

    def _init_pygame(self) -> bool:
        try:
            pygame.mixer.pre_init(SAMPLE_RATE, -16, CHANNELS, BUFFER_SIZE)
            pygame.mixer.init()
            pygame.mixer.set_num_channels(8)
            self._initialized = True
            print(f"[AudioEngine] Pygame mixer iniciado @ {SAMPLE_RATE}Hz, {CHANNELS}ch")
            return True
        except Exception as e:
            print(f"[AudioEngine] Error iniciando pygame: {e}")
            return False

    def load_and_play(self, filepath: str) -> bool:
        """Carga y reproduce un archivo de audio."""
        if not self._initialized:
            print("[AudioEngine] Motor no inicializado.")
            return False
        if not os.path.exists(filepath):
            print(f"[AudioEngine] Archivo no encontrado: {filepath}")
            return False

        with self._lock:
            try:
                pygame.mixer.music.stop()
                pygame.mixer.music.load(filepath)
                pygame.mixer.music.set_volume(self._volume)
                pygame.mixer.music.play()
                self._current_file = filepath
                self._paused = False
                self._position_start = time.time()
                print(f"[AudioEngine] Reproduciendo: {os.path.basename(filepath)}")
                return True
            except Exception as e:
                print(f"[AudioEngine] Error al reproducir: {e}")
                return False

    def pause(self) -> None:
        if self._initialized and not self._paused:
            with self._lock:
                pygame.mixer.music.pause()
                self._paused = True

    def resume(self) -> None:
        if self._initialized and self._paused:
            with self._lock:
                pygame.mixer.music.unpause()
                self._paused = False

    def stop(self) -> None:
        if self._initialized:
            with self._lock:
                pygame.mixer.music.stop()
                self._paused = False
                self._current_file = None

    def set_volume(self, volume: float) -> None:
        """Ajusta el volumen (0.0 — 1.0)."""
        volume = max(0.0, min(1.0, volume))
        self._volume = volume
        if self._initialized:
            pygame.mixer.music.set_volume(volume)

    def volume_up(self, step: float = 0.05) -> float:
        self.set_volume(self._volume + step)
        return self._volume

    def volume_down(self, step: float = 0.05) -> float:
        self.set_volume(self._volume - step)
        return self._volume

    def is_playing(self) -> bool:
        if not self._initialized:
            return False
        return pygame.mixer.music.get_busy() and not self._paused

    def is_paused(self) -> bool:
        return self._paused

    @property
    def current_file(self) -> Optional[str]:
        return self._current_file

    @property
    def volume(self) -> float:
        return self._volume

    def get_position_seconds(self) -> float:
        if not self._initialized or not self.is_playing():
            return 0.0
        return pygame.mixer.music.get_pos() / 1000.0

    def on_track_end(self, callback: Callable) -> None:
        self._on_track_end_callbacks.append(callback)

    def shutdown(self) -> None:
        if self._initialized:
            self.stop()
            pygame.mixer.quit()


# ---------------------------------------------------------------------------
# PLAYLIST MANAGER
# ---------------------------------------------------------------------------

class PlaylistManager:
    """Gestiona la cola de reproducción con soporte shuffle/repeat."""

    def __init__(self):
        self._tracks: List[str] = []
        self._index: int = 0
        self._shuffle: bool = False
        self._repeat: bool = False
        self._shuffle_order: List[int] = []
        self._lock = threading.Lock()

    def load_folder(self, folder_path: str) -> int:
        """Carga todos los archivos de audio de una carpeta."""
        supported = {".mp3", ".ogg", ".wav", ".flac", ".m4a", ".opus"}
        files = [
            str(p) for p in Path(folder_path).rglob("*")
            if p.suffix.lower() in supported
        ]
        files.sort()
        with self._lock:
            self._tracks = files
            self._index = 0
            self._build_shuffle_order()
        return len(files)

    def add_track(self, filepath: str) -> None:
        with self._lock:
            self._tracks.append(filepath)
            self._build_shuffle_order()

    def remove_track(self, index: int) -> None:
        with self._lock:
            if 0 <= index < len(self._tracks):
                self._tracks.pop(index)
                self._index = min(self._index, len(self._tracks) - 1)
                self._build_shuffle_order()

    def current_track(self) -> Optional[str]:
        with self._lock:
            if not self._tracks:
                return None
            return self._tracks[self._index]

    def next_track(self) -> Optional[str]:
        with self._lock:
            if not self._tracks:
                return None
            if self._shuffle:
                pos = self._shuffle_order.index(self._index)
                pos = (pos + 1) % len(self._shuffle_order)
                self._index = self._shuffle_order[pos]
            else:
                self._index = (self._index + 1) % len(self._tracks)
            return self._tracks[self._index]

    def previous_track(self) -> Optional[str]:
        with self._lock:
            if not self._tracks:
                return None
            if self._shuffle:
                pos = self._shuffle_order.index(self._index)
                pos = (pos - 1) % len(self._shuffle_order)
                self._index = self._shuffle_order[pos]
            else:
                self._index = (self._index - 1) % len(self._tracks)
            return self._tracks[self._index]

    def set_index(self, index: int) -> Optional[str]:
        with self._lock:
            if 0 <= index < len(self._tracks):
                self._index = index
                return self._tracks[index]
            return None

    def toggle_shuffle(self) -> bool:
        with self._lock:
            self._shuffle = not self._shuffle
            if self._shuffle:
                self._build_shuffle_order()
            return self._shuffle

    def toggle_repeat(self) -> bool:
        with self._lock:
            self._repeat = not self._repeat
            return self._repeat

    def _build_shuffle_order(self) -> None:
        self._shuffle_order = list(range(len(self._tracks)))
        random.shuffle(self._shuffle_order)

    @property
    def tracks(self) -> List[str]:
        with self._lock:
            return list(self._tracks)

    @property
    def current_index(self) -> int:
        return self._index

    @property
    def shuffle_enabled(self) -> bool:
        return self._shuffle

    @property
    def repeat_enabled(self) -> bool:
        return self._repeat

    @property
    def track_count(self) -> int:
        with self._lock:
            return len(self._tracks)


# ---------------------------------------------------------------------------
# COMMAND RECEIVER — Recibe órdenes de HBG CORE vía SyncEngine
# ---------------------------------------------------------------------------

class CommandReceiver:
    """
    Escucha mensajes del bus de SyncEngine y los traduce
    a acciones del reproductor. Compatible con threading.
    """

    def __init__(self, player_controller: "PlayerController"):
        self._player = player_controller
        self._action_map: Dict[str, Callable] = {
            "play":       self._handle_play,
            "stop":       self._handle_stop,
            "pause":      self._handle_pause,
            "next":       self._handle_next,
            "previous":   self._handle_previous,
            "volume_up":  self._handle_volume_up,
            "volume_down": self._handle_volume_down,
        }

    def on_vibra_command(self, message: Dict) -> None:
        """Callback para el canal 'vibra_pro.command'."""
        payload = message.get("payload", {})
        action = payload.get("action", "")
        handler = self._action_map.get(action)
        if handler:
            threading.Thread(target=handler, args=(payload,), daemon=True).start()
        else:
            print(f"[CommandReceiver] Acción desconocida: '{action}'")

    def on_mode_change(self, message: Dict) -> None:
        """Callback para el canal 'vibra_pro.mode_change'."""
        payload = message.get("payload", {})
        mode = payload.get("mode", "normal")
        threading.Thread(
            target=self._player.set_mode,
            args=(mode,),
            daemon=True
        ).start()

    def _handle_play(self, payload: Dict) -> None:
        self._player.play()

    def _handle_stop(self, payload: Dict) -> None:
        self._player.stop()

    def _handle_pause(self, payload: Dict) -> None:
        self._player.toggle_pause()

    def _handle_next(self, payload: Dict) -> None:
        self._player.next_track()

    def _handle_previous(self, payload: Dict) -> None:
        self._player.previous_track()

    def _handle_volume_up(self, payload: Dict) -> None:
        self._player.volume_up()

    def _handle_volume_down(self, payload: Dict) -> None:
        self._player.volume_down()


# ---------------------------------------------------------------------------
# PLAYER CONTROLLER — Lógica de control del reproductor
# ---------------------------------------------------------------------------

class PlayerController:
    """Orquesta AudioEngine + PlaylistManager y expone la API de control."""

    def __init__(self):
        self.audio = AudioEngine()
        self.playlist = PlaylistManager()
        self._current_mode: str = "normal"
        self._on_track_change_callbacks: List[Callable[[str, int], None]] = []
        self._on_mode_change_callbacks: List[Callable[[str], None]] = []
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitoring = False

    def start_monitor(self) -> None:
        """Inicia el hilo de monitoreo para avance automático de pista."""
        self._monitoring = True
        self._monitor_thread = threading.Thread(
            target=self._track_end_monitor,
            daemon=True,
            name="VibraPro-Monitor"
        )
        self._monitor_thread.start()

    def stop_monitor(self) -> None:
        self._monitoring = False

    def _track_end_monitor(self) -> None:
        """Detecta fin de pista y avanza a la siguiente."""
        was_playing = False
        while self._monitoring:
            is_playing = self.audio.is_playing()
            if was_playing and not is_playing and not self.audio.is_paused():
                if self.playlist.repeat_enabled:
                    self.play()
                else:
                    self.next_track()
            was_playing = is_playing
            time.sleep(0.5)

    def play(self, index: Optional[int] = None) -> bool:
        if index is not None:
            track = self.playlist.set_index(index)
        else:
            track = self.playlist.current_track()
        if not track:
            return False
        result = self.audio.load_and_play(track)
        if result:
            self._notify_track_change()
        return result

    def stop(self) -> None:
        self.audio.stop()

    def toggle_pause(self) -> bool:
        if self.audio.is_paused():
            self.audio.resume()
            return False
        else:
            self.audio.pause()
            return True

    def next_track(self) -> bool:
        track = self.playlist.next_track()
        if not track:
            return False
        result = self.audio.load_and_play(track)
        if result:
            self._notify_track_change()
        return result

    def previous_track(self) -> bool:
        track = self.playlist.previous_track()
        if not track:
            return False
        result = self.audio.load_and_play(track)
        if result:
            self._notify_track_change()
        return result

    def volume_up(self) -> float:
        return self.audio.volume_up()

    def volume_down(self) -> float:
        return self.audio.volume_down()

    def set_volume(self, value: float) -> None:
        self.audio.set_volume(value)

    def set_mode(self, mode: str) -> None:
        self._current_mode = mode
        for cb in self._on_mode_change_callbacks:
            try:
                cb(mode)
            except Exception as e:
                print(f"[PlayerController] Error en callback de modo: {e}")

    def load_folder(self, path: str) -> int:
        count = self.playlist.load_folder(path)
        if count > 0:
            self.play(0)
        return count

    def on_track_change(self, callback: Callable[[str, int], None]) -> None:
        self._on_track_change_callbacks.append(callback)

    def on_mode_change(self, callback: Callable[[str], None]) -> None:
        self._on_mode_change_callbacks.append(callback)

    def _notify_track_change(self) -> None:
        track = self.playlist.current_track() or ""
        index = self.playlist.current_index
        for cb in self._on_track_change_callbacks:
            try:
                cb(track, index)
            except Exception as e:
                print(f"[PlayerController] Error en callback: {e}")

    @property
    def current_mode(self) -> str:
        return self._current_mode

    def shutdown(self) -> None:
        self.stop_monitor()
        self.audio.shutdown()


# ---------------------------------------------------------------------------
# VIBRA PRO UI — Interfaz Tkinter oscuro mate
# ---------------------------------------------------------------------------

class VibraProUI:
    """
    Interfaz gráfica premium de VIBRA PRO.
    Tema oscuro mate con soporte de modos: party, focus, creative, chill.
    """

    WINDOW_W = 480
    WINDOW_H = 680

    def __init__(self, player: PlayerController, sync_engine=None):
        self._player = player
        self._sync = sync_engine
        self._root: Optional[tk.Tk] = None
        self._current_accent = THEME["accent_primary"]
        self._update_queue: queue.Queue = queue.Queue()

        self._label_track: Optional[tk.Label] = None
        self._label_artist: Optional[tk.Label] = None
        self._label_time: Optional[tk.Label] = None
        self._label_mode: Optional[tk.Label] = None
        self._label_volume: Optional[tk.Label] = None
        self._progress_var: Optional[tk.DoubleVar] = None
        self._progress_bar: Optional[ttk.Progressbar] = None
        self._volume_slider: Optional[tk.Scale] = None
        self._listbox: Optional[tk.Listbox] = None
        self._btn_play: Optional[tk.Button] = None
        self._btn_shuffle: Optional[tk.Button] = None
        self._btn_repeat: Optional[tk.Button] = None
        self._canvas_visualizer: Optional[tk.Canvas] = None
        self._viz_bars: List = []

        self._player.on_track_change(self._on_track_change)
        self._player.on_mode_change(self._on_mode_change)

    def build(self) -> tk.Tk:
        """Construye y retorna la ventana principal."""
        self._root = tk.Tk()
        self._root.title("VIBRA PRO — UNIVERSO HBG")
        self._root.geometry(f"{self.WINDOW_W}x{self.WINDOW_H}")
        self._root.configure(bg=THEME["bg_primary"])
        self._root.resizable(False, False)

        self._configure_styles()
        self._build_header()
        self._build_now_playing()
        self._build_visualizer()
        self._build_progress()
        self._build_controls()
        self._build_volume()
        self._build_playlist_panel()
        self._build_mode_indicator()

        self._root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._root.after(100, self._ui_update_loop)
        self._root.after(150, self._animate_visualizer)
        return self._root

    def _configure_styles(self) -> None:
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(
            "Vibra.Horizontal.TProgressbar",
            background=self._current_accent,
            troughcolor=THEME["progress_bg"],
            bordercolor=THEME["bg_primary"],
            lightcolor=self._current_accent,
            darkcolor=self._current_accent,
        )

    def _build_header(self) -> None:
        header = tk.Frame(self._root, bg=THEME["bg_secondary"], height=50)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        tk.Label(
            header,
            text="◈ VIBRA PRO",
            font=("Helvetica", 16, "bold"),
            fg=self._current_accent,
            bg=THEME["bg_secondary"],
        ).pack(side=tk.LEFT, padx=16, pady=12)

        self._label_mode = tk.Label(
            header,
            text="● NORMAL",
            font=("Helvetica", 9, "bold"),
            fg=THEME["accent_primary"],
            bg=THEME["bg_secondary"],
        )
        self._label_mode.pack(side=tk.RIGHT, padx=16)

        btn_open = tk.Button(
            header,
            text="📁 ABRIR",
            font=("Helvetica", 9),
            fg=THEME["text_secondary"],
            bg=THEME["bg_card"],
            activebackground=THEME["bg_hover"],
            activeforeground=THEME["text_primary"],
            relief=tk.FLAT,
            cursor="hand2",
            command=self._open_folder,
        )
        btn_open.pack(side=tk.RIGHT, padx=8, pady=10)

    def _build_now_playing(self) -> None:
        card = tk.Frame(self._root, bg=THEME["bg_card"], pady=16)
        card.pack(fill=tk.X, padx=16, pady=(8, 0))

        self._label_artist = tk.Label(
            card,
            text="UNIVERSO HBG",
            font=("Helvetica", 10),
            fg=self._current_accent,
            bg=THEME["bg_card"],
        )
        self._label_artist.pack()

        self._label_track = tk.Label(
            card,
            text="Selecciona una carpeta de música",
            font=("Helvetica", 13, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["bg_card"],
            wraplength=430,
        )
        self._label_track.pack(pady=(4, 0))

    def _build_visualizer(self) -> None:
        self._canvas_visualizer = tk.Canvas(
            self._root,
            width=self.WINDOW_W - 32,
            height=60,
            bg=THEME["bg_secondary"],
            highlightthickness=0,
        )
        self._canvas_visualizer.pack(padx=16, pady=(8, 0))
        bar_count = 40
        bar_w = (self.WINDOW_W - 32) / bar_count
        for i in range(bar_count):
            x = i * bar_w + bar_w * 0.15
            bar = self._canvas_visualizer.create_rectangle(
                x, 60, x + bar_w * 0.7, 60,
                fill=self._current_accent,
                outline="",
            )
            self._viz_bars.append(bar)

    def _animate_visualizer(self) -> None:
        if not self._root:
            return
        is_playing = self._player.audio.is_playing()
        for bar in self._viz_bars:
            if is_playing:
                height = random.randint(4, 56)
            else:
                height = random.randint(1, 4)
            coords = self._canvas_visualizer.coords(bar)
            if coords:
                self._canvas_visualizer.coords(
                    bar, coords[0], 60 - height, coords[2], 60
                )
        self._root.after(80, self._animate_visualizer)

    def _build_progress(self) -> None:
        prog_frame = tk.Frame(self._root, bg=THEME["bg_primary"])
        prog_frame.pack(fill=tk.X, padx=16, pady=(8, 0))

        self._progress_var = tk.DoubleVar(value=0)
        self._progress_bar = ttk.Progressbar(
            prog_frame,
            style="Vibra.Horizontal.TProgressbar",
            variable=self._progress_var,
            maximum=100,
            length=self.WINDOW_W - 32,
        )
        self._progress_bar.pack(fill=tk.X)

        self._label_time = tk.Label(
            prog_frame,
            text="0:00",
            font=("Helvetica", 8),
            fg=THEME["text_muted"],
            bg=THEME["bg_primary"],
        )
        self._label_time.pack(anchor=tk.E)

    def _build_controls(self) -> None:
        ctrl = tk.Frame(self._root, bg=THEME["bg_primary"])
        ctrl.pack(pady=8)

        btn_cfg = dict(
            font=("Helvetica", 11),
            fg=THEME["text_secondary"],
            bg=THEME["bg_card"],
            activebackground=THEME["bg_hover"],
            activeforeground=THEME["text_primary"],
            relief=tk.FLAT,
            cursor="hand2",
            width=4,
            height=1,
            padx=6,
        )

        self._btn_shuffle = tk.Button(ctrl, text="⇌", **btn_cfg, command=self._toggle_shuffle)
        self._btn_shuffle.grid(row=0, column=0, padx=4)

        tk.Button(ctrl, text="⏮", **btn_cfg, command=self._prev).grid(row=0, column=1, padx=4)

        self._btn_play = tk.Button(
            ctrl,
            text="▶",
            font=("Helvetica", 16, "bold"),
            fg=THEME["bg_primary"],
            bg=self._current_accent,
            activebackground=self._current_accent,
            activeforeground=THEME["bg_primary"],
            relief=tk.FLAT,
            cursor="hand2",
            width=3,
            height=1,
            command=self._toggle_play,
        )
        self._btn_play.grid(row=0, column=2, padx=4)

        tk.Button(ctrl, text="⏭", **btn_cfg, command=self._next).grid(row=0, column=3, padx=4)

        self._btn_repeat = tk.Button(ctrl, text="↻", **btn_cfg, command=self._toggle_repeat)
        self._btn_repeat.grid(row=0, column=4, padx=4)

    def _build_volume(self) -> None:
        vol_frame = tk.Frame(self._root, bg=THEME["bg_primary"])
        vol_frame.pack(fill=tk.X, padx=24, pady=4)

        tk.Label(
            vol_frame,
            text="🔉",
            font=("Helvetica", 10),
            fg=THEME["text_muted"],
            bg=THEME["bg_primary"],
        ).pack(side=tk.LEFT)

        self._volume_slider = tk.Scale(
            vol_frame,
            from_=0,
            to=100,
            orient=tk.HORIZONTAL,
            bg=THEME["bg_primary"],
            fg=THEME["text_secondary"],
            troughcolor=THEME["slider_trough"],
            activebackground=self._current_accent,
            highlightthickness=0,
            relief=tk.FLAT,
            showvalue=False,
            command=self._on_volume_change,
        )
        self._volume_slider.set(80)
        self._volume_slider.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)

        tk.Label(
            vol_frame,
            text="🔊",
            font=("Helvetica", 10),
            fg=THEME["text_muted"],
            bg=THEME["bg_primary"],
        ).pack(side=tk.LEFT)

    def _build_playlist_panel(self) -> None:
        pl_frame = tk.Frame(self._root, bg=THEME["bg_secondary"])
        pl_frame.pack(fill=tk.BOTH, expand=True, padx=16, pady=(8, 4))

        tk.Label(
            pl_frame,
            text="LISTA DE REPRODUCCIÓN",
            font=("Helvetica", 8, "bold"),
            fg=THEME["text_muted"],
            bg=THEME["bg_secondary"],
        ).pack(anchor=tk.W, padx=8, pady=(6, 0))

        scrollbar = tk.Scrollbar(pl_frame, bg=THEME["bg_card"])
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self._listbox = tk.Listbox(
            pl_frame,
            bg=THEME["bg_secondary"],
            fg=THEME["text_secondary"],
            selectbackground=self._current_accent,
            selectforeground=THEME["text_primary"],
            relief=tk.FLAT,
            highlightthickness=0,
            font=("Helvetica", 9),
            yscrollcommand=scrollbar.set,
            activestyle="none",
            cursor="hand2",
        )
        self._listbox.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)
        scrollbar.config(command=self._listbox.yview)
        self._listbox.bind("<Double-Button-1>", self._on_listbox_double_click)

    def _build_mode_indicator(self) -> None:
        bar = tk.Frame(self._root, bg=THEME["bg_secondary"], height=28)
        bar.pack(fill=tk.X, side=tk.BOTTOM)
        bar.pack_propagate(False)

        tk.Label(
            bar,
            text="HBG CORE CONNECTED  |  44100Hz  |  UNIVERSO HBG v1.0",
            font=("Helvetica", 7),
            fg=THEME["text_muted"],
            bg=THEME["bg_secondary"],
        ).pack(pady=6)

    def _ui_update_loop(self) -> None:
        """Loop de actualización de UI ejecutado en el hilo principal de Tkinter."""
        try:
            while not self._update_queue.empty():
                fn = self._update_queue.get_nowait()
                fn()
        except queue.Empty:
            pass

        pos = self._player.audio.get_position_seconds()
        minutes = int(pos) // 60
        seconds = int(pos) % 60
        if self._label_time:
            self._label_time.config(text=f"{minutes}:{seconds:02d}")

        if self._progress_var:
            progress = min((pos / 300.0) * 100, 100) if pos > 0 else 0
            self._progress_var.set(progress)

        if self._btn_play:
            if self._player.audio.is_paused():
                self._btn_play.config(text="▶")
            elif self._player.audio.is_playing():
                self._btn_play.config(text="⏸")
            else:
                self._btn_play.config(text="▶")

        if self._root:
            self._root.after(200, self._ui_update_loop)

    def _queue_ui_update(self, fn: Callable) -> None:
        """Encola una actualización de UI segura para ejecutar en el hilo de Tk."""
        self._update_queue.put(fn)

    def _on_track_change(self, filepath: str, index: int) -> None:
        name = os.path.basename(filepath) if filepath else "Sin pista"
        name_no_ext = os.path.splitext(name)[0]

        def update():
            if self._label_track:
                self._label_track.config(text=name_no_ext[:55])
            if self._listbox and self._listbox.size() > 0:
                self._listbox.selection_clear(0, tk.END)
                self._listbox.selection_set(index)
                self._listbox.see(index)

        self._queue_ui_update(update)

    def _on_mode_change(self, mode: str) -> None:
        color = MODE_COLORS.get(mode, THEME["accent_primary"])
        self._current_accent = color

        def update():
            if self._label_mode:
                self._label_mode.config(text=f"● {mode.upper()}", fg=color)
            if self._btn_play:
                self._btn_play.config(bg=color, activebackground=color)
            if self._canvas_visualizer:
                for bar in self._viz_bars:
                    self._canvas_visualizer.itemconfig(bar, fill=color)

        self._queue_ui_update(update)

    def _open_folder(self) -> None:
        folder = filedialog.askdirectory(title="Selecciona carpeta de música")
        if folder:
            def load():
                count = self._player.load_folder(folder)
                self._refresh_playlist()
                print(f"[VibraPro] {count} pistas cargadas desde: {folder}")
            threading.Thread(target=load, daemon=True).start()

    def _refresh_playlist(self) -> None:
        tracks = self._player.playlist.tracks

        def update():
            if not self._listbox:
                return
            self._listbox.delete(0, tk.END)
            for t in tracks:
                name = os.path.splitext(os.path.basename(t))[0]
                self._listbox.insert(tk.END, f"  {name}")
            if tracks:
                self._listbox.selection_set(0)

        self._queue_ui_update(update)

    def _toggle_play(self) -> None:
        threading.Thread(target=self._player.toggle_pause, daemon=True).start()

    def _next(self) -> None:
        threading.Thread(target=self._player.next_track, daemon=True).start()

    def _prev(self) -> None:
        threading.Thread(target=self._player.previous_track, daemon=True).start()

    def _toggle_shuffle(self) -> None:
        enabled = self._player.playlist.toggle_shuffle()
        color = self._current_accent if enabled else THEME["text_muted"]
        if self._btn_shuffle:
            self._btn_shuffle.config(fg=color)

    def _toggle_repeat(self) -> None:
        enabled = self._player.playlist.toggle_repeat()
        color = self._current_accent if enabled else THEME["text_muted"]
        if self._btn_repeat:
            self._btn_repeat.config(fg=color)

    def _on_volume_change(self, value: str) -> None:
        vol = float(value) / 100.0
        threading.Thread(
            target=self._player.set_volume,
            args=(vol,),
            daemon=True
        ).start()

    def _on_listbox_double_click(self, event) -> None:
        if not self._listbox:
            return
        selection = self._listbox.curselection()
        if selection:
            index = selection[0]
            threading.Thread(
                target=self._player.play,
                args=(index,),
                daemon=True
            ).start()

    def _on_close(self) -> None:
        self._player.shutdown()
        if self._root:
            self._root.destroy()

    def run(self) -> None:
        """Inicia la aplicación."""
        root = self.build()
        root.mainloop()


# ---------------------------------------------------------------------------
# VIBRA PRO APP — Clase de integración completa
# ---------------------------------------------------------------------------

class VibraProApp:
    """
    Clase de integración principal para VIBRA PRO.
    Conecta el PlayerController con la UI y el SyncEngine de HBG CORE.
    """

    def __init__(self, sync_engine=None):
        self.player = PlayerController()
        self.ui = VibraProUI(player=self.player, sync_engine=sync_engine)
        self._receiver: Optional[CommandReceiver] = None

        if sync_engine is not None:
            self._connect_sync(sync_engine)

    def _connect_sync(self, sync_engine) -> None:
        self._receiver = CommandReceiver(player_controller=self.player)
        sync_engine.subscribe("vibra_pro.command", self._receiver.on_vibra_command)
        sync_engine.subscribe("vibra_pro.mode_change", self._receiver.on_mode_change)
        print("[VibraProApp] Conectado al SyncEngine de HBG CORE.")

    def run(self) -> None:
        """Inicia el reproductor completo (bloqueante — usar en hilo principal)."""
        self.player.start_monitor()
        try:
            self.ui.run()
        finally:
            self.player.shutdown()


# ---------------------------------------------------------------------------
# EJECUCIÓN DIRECTA (demo standalone)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  VIBRA PRO — Reproductor de Audio del Ecosistema HBG")
    print("=" * 60)
    app = VibraProApp(sync_engine=None)
    app.run()
