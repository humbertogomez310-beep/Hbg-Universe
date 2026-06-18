"""
TERMINADOR IA — Módulo de Automatización del Ecosistema UNIVERSO HBG
Agente autónomo que optimiza procesos del sistema de archivos Linux y reporta métricas en caliente.
Recibe comandos de HBG CORE vía SyncEngine.
"""

import os
import sys
import time
import shutil
import json
import threading
import datetime
import subprocess
import hashlib
import re
import queue
import stat
import platform
from typing import Any, Callable, Dict, List, Optional, Tuple
from pathlib import Path
from collections import defaultdict


# ---------------------------------------------------------------------------
# CONSTANTES
# ---------------------------------------------------------------------------

TERMINADOR_DATA_DIR = os.path.expanduser("~/.hbg/terminador")
TEMP_PATTERNS = [
    "*.tmp", "*.temp", "*.cache", "*.bak", "*.swp", "*.log",
    "*.pyc", "__pycache__", ".DS_Store", "Thumbs.db", "*.orig",
]
CRITICAL_DIRS = {"/", "/bin", "/boot", "/etc", "/usr", "/lib", "/sbin", "/dev", "/proc", "/sys"}
MAX_LOG_LINES = 5000
IS_LINUX = platform.system() == "Linux"


# ---------------------------------------------------------------------------
# SYSTEM METRICS — Recolección de métricas del sistema
# ---------------------------------------------------------------------------

class SystemMetrics:
    """Recolecta métricas del sistema en tiempo real."""

    def __init__(self):
        self._lock = threading.Lock()
        self._history: List[Dict] = []
        self._max_history = 200

    def collect(self) -> Dict[str, Any]:
        """Recolecta todas las métricas disponibles y las retorna."""
        metrics = {
            "timestamp": datetime.datetime.now().isoformat(),
            "cpu": self._get_cpu_metrics(),
            "memory": self._get_memory_metrics(),
            "disk": self._get_disk_metrics(),
            "processes": self._get_process_metrics(),
            "uptime": self._get_uptime(),
            "load_average": self._get_load_average(),
            "network": self._get_network_metrics(),
        }
        with self._lock:
            self._history.append(metrics)
            if len(self._history) > self._max_history:
                self._history.pop(0)
        return metrics

    def _get_cpu_metrics(self) -> Dict[str, Any]:
        try:
            if IS_LINUX:
                with open("/proc/stat") as f:
                    line = f.readline()
                parts = line.split()
                total = sum(int(x) for x in parts[1:])
                idle = int(parts[4])
                usage_pct = round((1 - idle / total) * 100, 1) if total else 0.0
                core_count = os.cpu_count() or 1
                return {"usage_percent": usage_pct, "core_count": core_count}
            else:
                return {"usage_percent": 0.0, "core_count": os.cpu_count() or 1, "note": "non-linux"}
        except Exception as e:
            return {"error": str(e)}

    def _get_memory_metrics(self) -> Dict[str, Any]:
        try:
            if IS_LINUX:
                meminfo = {}
                with open("/proc/meminfo") as f:
                    for line in f:
                        parts = line.split()
                        if len(parts) >= 2:
                            key = parts[0].rstrip(":")
                            meminfo[key] = int(parts[1])
                total_kb = meminfo.get("MemTotal", 0)
                free_kb = meminfo.get("MemFree", 0)
                available_kb = meminfo.get("MemAvailable", 0)
                buffers_kb = meminfo.get("Buffers", 0)
                cached_kb = meminfo.get("Cached", 0)
                used_kb = total_kb - available_kb
                usage_pct = round((used_kb / total_kb) * 100, 1) if total_kb else 0.0
                return {
                    "total_mb": round(total_kb / 1024, 1),
                    "used_mb": round(used_kb / 1024, 1),
                    "free_mb": round(free_kb / 1024, 1),
                    "available_mb": round(available_kb / 1024, 1),
                    "buffers_mb": round(buffers_kb / 1024, 1),
                    "cached_mb": round(cached_kb / 1024, 1),
                    "usage_percent": usage_pct,
                }
            else:
                return {"note": "non-linux", "usage_percent": 0.0}
        except Exception as e:
            return {"error": str(e)}

    def _get_disk_metrics(self) -> List[Dict[str, Any]]:
        disks = []
        try:
            result = shutil.disk_usage("/")
            total_gb = round(result.total / 1e9, 2)
            used_gb = round(result.used / 1e9, 2)
            free_gb = round(result.free / 1e9, 2)
            pct = round((result.used / result.total) * 100, 1) if result.total else 0.0
            disks.append({
                "mount": "/",
                "total_gb": total_gb,
                "used_gb": used_gb,
                "free_gb": free_gb,
                "usage_percent": pct,
            })
            if IS_LINUX:
                try:
                    with open("/proc/mounts") as f:
                        for line in f:
                            parts = line.split()
                            if len(parts) >= 2:
                                mount = parts[1]
                                if mount != "/" and mount.startswith("/") and not mount.startswith("/proc") and not mount.startswith("/sys"):
                                    try:
                                        du = shutil.disk_usage(mount)
                                        pct_m = round((du.used / du.total) * 100, 1) if du.total else 0.0
                                        disks.append({
                                            "mount": mount,
                                            "total_gb": round(du.total / 1e9, 2),
                                            "used_gb": round(du.used / 1e9, 2),
                                            "free_gb": round(du.free / 1e9, 2),
                                            "usage_percent": pct_m,
                                        })
                                    except (PermissionError, OSError):
                                        pass
                except Exception:
                    pass
        except Exception as e:
            disks.append({"error": str(e)})
        return disks

    def _get_process_metrics(self) -> Dict[str, Any]:
        try:
            if IS_LINUX:
                proc_dir = Path("/proc")
                pids = [p.name for p in proc_dir.iterdir() if p.name.isdigit()]
                count = len(pids)
                python_procs = 0
                zombie_procs = 0
                for pid in pids[:200]:
                    status_file = proc_dir / pid / "status"
                    try:
                        with open(status_file) as f:
                            content = f.read()
                        if "python" in content.lower():
                            python_procs += 1
                        if "zombie" in content.lower() or "Z (zombie)" in content:
                            zombie_procs += 1
                    except (IOError, PermissionError):
                        pass
                return {"total": count, "python": python_procs, "zombie": zombie_procs}
            else:
                return {"total": 0, "note": "non-linux"}
        except Exception as e:
            return {"error": str(e)}

    def _get_uptime(self) -> Optional[str]:
        try:
            if IS_LINUX:
                with open("/proc/uptime") as f:
                    seconds = float(f.read().split()[0])
                hours = int(seconds // 3600)
                minutes = int((seconds % 3600) // 60)
                secs = int(seconds % 60)
                return f"{hours}h {minutes}m {secs}s"
            return None
        except Exception:
            return None

    def _get_load_average(self) -> Optional[Dict]:
        try:
            if IS_LINUX:
                with open("/proc/loadavg") as f:
                    parts = f.read().split()
                return {
                    "1min": float(parts[0]),
                    "5min": float(parts[1]),
                    "15min": float(parts[2]),
                }
            return None
        except Exception:
            return None

    def _get_network_metrics(self) -> Optional[Dict]:
        try:
            if IS_LINUX:
                with open("/proc/net/dev") as f:
                    lines = f.readlines()[2:]
                interfaces = {}
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 10:
                        iface = parts[0].strip(":")
                        interfaces[iface] = {
                            "rx_bytes": int(parts[1]),
                            "tx_bytes": int(parts[9]),
                        }
                return interfaces
            return None
        except Exception:
            return None

    def get_history(self, limit: int = 50) -> List[Dict]:
        with self._lock:
            return self._history[-limit:]

    def get_summary(self) -> Dict[str, Any]:
        """Resumen compacto de las últimas métricas."""
        with self._lock:
            if not self._history:
                return {"error": "Sin datos. Ejecuta collect() primero."}
            latest = self._history[-1]
        return {
            "timestamp": latest["timestamp"],
            "cpu_pct": latest.get("cpu", {}).get("usage_percent", "N/A"),
            "mem_pct": latest.get("memory", {}).get("usage_percent", "N/A"),
            "disk_pct": latest.get("disk", [{}])[0].get("usage_percent", "N/A") if latest.get("disk") else "N/A",
            "processes": latest.get("processes", {}).get("total", "N/A"),
            "uptime": latest.get("uptime", "N/A"),
            "load_1min": latest.get("load_average", {}).get("1min", "N/A") if latest.get("load_average") else "N/A",
        }


# ---------------------------------------------------------------------------
# FILE OPTIMIZER — Optimización de sistema de archivos
# ---------------------------------------------------------------------------

class FileOptimizer:
    """Analiza y optimiza el sistema de archivos de Linux."""

    def __init__(self):
        self._lock = threading.Lock()
        self._operation_log: List[Dict] = []

    def scan_temp_files(self, target_dir: str) -> List[Dict]:
        """Escanea archivos temporales en un directorio."""
        if target_dir in CRITICAL_DIRS:
            return [{"error": f"Directorio crítico protegido: {target_dir}"}]
        results = []
        target = Path(target_dir)
        if not target.exists():
            return [{"error": f"Directorio no encontrado: {target_dir}"}]

        for pattern in TEMP_PATTERNS:
            if pattern.startswith("*."):
                ext = pattern[1:]
                for p in target.rglob(f"*{ext}"):
                    try:
                        size = p.stat().st_size
                        results.append({
                            "path": str(p),
                            "type": "temp_file",
                            "pattern": pattern,
                            "size_bytes": size,
                            "size_human": self._human_size(size),
                            "modified": datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                        })
                    except (PermissionError, OSError):
                        pass
            elif pattern == "__pycache__":
                for p in target.rglob("__pycache__"):
                    if p.is_dir():
                        try:
                            size = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
                            results.append({
                                "path": str(p),
                                "type": "pycache_dir",
                                "pattern": pattern,
                                "size_bytes": size,
                                "size_human": self._human_size(size),
                                "modified": datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                            })
                        except (PermissionError, OSError):
                            pass
        return results

    def clean_temp_files(
        self, target_dir: str, dry_run: bool = True
    ) -> Dict[str, Any]:
        """Limpia archivos temporales. Si dry_run=True, solo simula."""
        if target_dir in CRITICAL_DIRS:
            return {"error": f"Directorio crítico protegido: {target_dir}", "deleted": 0}

        items = self.scan_temp_files(target_dir)
        result = {
            "dry_run": dry_run,
            "target_dir": target_dir,
            "items_found": len(items),
            "bytes_recovered": 0,
            "deleted": 0,
            "errors": [],
            "timestamp": datetime.datetime.now().isoformat(),
        }

        for item in items:
            if "error" in item:
                result["errors"].append(item["error"])
                continue
            path = Path(item["path"])
            size = item.get("size_bytes", 0)
            if not dry_run:
                try:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                    result["deleted"] += 1
                    result["bytes_recovered"] += size
                    self._log_operation("delete", str(path), size)
                except (PermissionError, OSError) as e:
                    result["errors"].append(f"{path}: {e}")
            else:
                result["bytes_recovered"] += size
                result["deleted"] += 1

        result["mb_recovered"] = round(result["bytes_recovered"] / 1e6, 2)
        return result

    def find_large_files(
        self, target_dir: str, min_size_mb: float = 100, limit: int = 20
    ) -> List[Dict]:
        """Encuentra archivos de gran tamaño."""
        target = Path(target_dir)
        if not target.exists():
            return [{"error": f"Directorio no encontrado: {target_dir}"}]

        min_bytes = int(min_size_mb * 1e6)
        large_files = []

        for p in target.rglob("*"):
            if p.is_file():
                try:
                    size = p.stat().st_size
                    if size >= min_bytes:
                        large_files.append({
                            "path": str(p),
                            "size_bytes": size,
                            "size_human": self._human_size(size),
                            "modified": datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                            "extension": p.suffix.lower(),
                        })
                except (PermissionError, OSError):
                    pass

        large_files.sort(key=lambda x: x["size_bytes"], reverse=True)
        return large_files[:limit]

    def find_duplicates(self, target_dir: str, limit: int = 50) -> List[Dict]:
        """Encuentra archivos duplicados por hash MD5."""
        target = Path(target_dir)
        if not target.exists():
            return [{"error": f"Directorio no encontrado: {target_dir}"}]

        hash_map: Dict[str, List[str]] = defaultdict(list)

        for p in target.rglob("*"):
            if p.is_file():
                try:
                    if p.stat().st_size == 0:
                        continue
                    file_hash = self._md5_file(p)
                    hash_map[file_hash].append(str(p))
                except (PermissionError, OSError, IOError):
                    pass

        duplicates = []
        for file_hash, paths in hash_map.items():
            if len(paths) > 1:
                total_size = sum(Path(p).stat().st_size for p in paths if Path(p).exists())
                duplicates.append({
                    "hash": file_hash,
                    "files": paths,
                    "count": len(paths),
                    "total_size_bytes": total_size,
                    "wasted_bytes": total_size - (total_size // len(paths)),
                    "size_human": self._human_size(total_size),
                })

        duplicates.sort(key=lambda x: x["wasted_bytes"], reverse=True)
        return duplicates[:limit]

    def analyze_directory(self, target_dir: str) -> Dict[str, Any]:
        """Análisis completo de un directorio."""
        target = Path(target_dir)
        if not target.exists():
            return {"error": f"Directorio no encontrado: {target_dir}"}

        total_files = 0
        total_dirs = 0
        total_size = 0
        extension_stats: Dict[str, Dict] = defaultdict(lambda: {"count": 0, "size": 0})
        oldest_file: Optional[Tuple[str, float]] = None
        newest_file: Optional[Tuple[str, float]] = None

        for p in target.rglob("*"):
            try:
                if p.is_dir():
                    total_dirs += 1
                elif p.is_file():
                    total_files += 1
                    size = p.stat().st_size
                    mtime = p.stat().st_mtime
                    total_size += size
                    ext = p.suffix.lower() or "(sin extensión)"
                    extension_stats[ext]["count"] += 1
                    extension_stats[ext]["size"] += size

                    if oldest_file is None or mtime < oldest_file[1]:
                        oldest_file = (str(p), mtime)
                    if newest_file is None or mtime > newest_file[1]:
                        newest_file = (str(p), mtime)
            except (PermissionError, OSError):
                pass

        top_extensions = sorted(
            [{"ext": k, **v} for k, v in extension_stats.items()],
            key=lambda x: x["size"],
            reverse=True
        )[:10]

        return {
            "target_dir": target_dir,
            "total_files": total_files,
            "total_dirs": total_dirs,
            "total_size_bytes": total_size,
            "total_size_human": self._human_size(total_size),
            "top_extensions": top_extensions,
            "oldest_file": {
                "path": oldest_file[0],
                "date": datetime.datetime.fromtimestamp(oldest_file[1]).isoformat(),
            } if oldest_file else None,
            "newest_file": {
                "path": newest_file[0],
                "date": datetime.datetime.fromtimestamp(newest_file[1]).isoformat(),
            } if newest_file else None,
            "analyzed_at": datetime.datetime.now().isoformat(),
        }

    def get_operation_log(self, limit: int = 50) -> List[Dict]:
        with self._lock:
            return self._operation_log[-limit:]

    def _log_operation(self, op_type: str, path: str, size: int = 0) -> None:
        with self._lock:
            self._operation_log.append({
                "type": op_type,
                "path": path,
                "size_bytes": size,
                "timestamp": datetime.datetime.now().isoformat(),
            })

    @staticmethod
    def _human_size(size_bytes: int) -> str:
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} PB"

    @staticmethod
    def _md5_file(path: Path, chunk_size: int = 65536) -> str:
        hasher = hashlib.md5()
        with open(path, "rb") as f:
            while chunk := f.read(chunk_size):
                hasher.update(chunk)
        return hasher.hexdigest()


# ---------------------------------------------------------------------------
# PROCESS MANAGER — Gestión de procesos del sistema
# ---------------------------------------------------------------------------

class ProcessManager:
    """Gestiona procesos del sistema Linux."""

    def __init__(self):
        self._safe_to_kill: List[str] = []

    def list_processes(self, sort_by: str = "pid", limit: int = 30) -> List[Dict]:
        """Lista procesos activos del sistema."""
        processes = []
        if not IS_LINUX:
            return [{"error": "Solo disponible en Linux"}]
        try:
            proc_dir = Path("/proc")
            for pid_dir in proc_dir.iterdir():
                if not pid_dir.name.isdigit():
                    continue
                pid = int(pid_dir.name)
                try:
                    cmdline_file = pid_dir / "cmdline"
                    status_file = pid_dir / "status"
                    with open(cmdline_file, "rb") as f:
                        cmdline = f.read().replace(b"\x00", b" ").decode(errors="replace").strip()
                    status_data = {}
                    with open(status_file) as f:
                        for line in f:
                            if ":" in line:
                                k, v = line.split(":", 1)
                                status_data[k.strip()] = v.strip()
                    mem_kb = 0
                    vm_rss = status_data.get("VmRSS", "0 kB")
                    mem_match = re.match(r"(\d+)", vm_rss)
                    if mem_match:
                        mem_kb = int(mem_match.group(1))
                    processes.append({
                        "pid": pid,
                        "name": status_data.get("Name", "unknown"),
                        "state": status_data.get("State", "?"),
                        "mem_kb": mem_kb,
                        "mem_mb": round(mem_kb / 1024, 1),
                        "cmdline": cmdline[:120],
                        "threads": int(status_data.get("Threads", "1")),
                        "uid": status_data.get("Uid", "?").split()[0] if status_data.get("Uid") else "?",
                    })
                except (PermissionError, IOError, FileNotFoundError):
                    pass
        except Exception as e:
            return [{"error": str(e)}]

        sort_key = "mem_kb" if sort_by == "memory" else "pid"
        processes.sort(key=lambda p: p.get(sort_key, 0), reverse=(sort_by == "memory"))
        return processes[:limit]

    def get_top_memory_consumers(self, limit: int = 10) -> List[Dict]:
        """Top N procesos por consumo de memoria."""
        return self.list_processes(sort_by="memory", limit=limit)

    def kill_process(self, pid: int, force: bool = False) -> Dict[str, Any]:
        """
        Envía señal SIGTERM (o SIGKILL si force=True) a un proceso.
        Protege el proceso actual y el PID 1.
        """
        if pid <= 1 or pid == os.getpid():
            return {"success": False, "error": f"Proceso PID {pid} protegido."}
        signal_num = 9 if force else 15
        try:
            os.kill(pid, signal_num)
            return {
                "success": True,
                "pid": pid,
                "signal": signal_num,
                "force": force,
                "timestamp": datetime.datetime.now().isoformat(),
            }
        except ProcessLookupError:
            return {"success": False, "error": f"Proceso PID {pid} no encontrado."}
        except PermissionError:
            return {"success": False, "error": f"Sin permisos para matar PID {pid}."}

    def run_command(
        self, cmd: List[str], timeout: int = 30, capture_output: bool = True
    ) -> Dict[str, Any]:
        """Ejecuta un comando del sistema de forma segura."""
        BLOCKED = {"rm", "mkfs", "dd", "format", "shutdown", "reboot", "init", "halt"}
        if any(c in BLOCKED for c in cmd):
            return {"success": False, "error": f"Comando bloqueado por seguridad: {cmd}"}
        try:
            result = subprocess.run(
                cmd,
                capture_output=capture_output,
                text=True,
                timeout=timeout,
            )
            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout[:4096] if capture_output else "",
                "stderr": result.stderr[:1024] if capture_output else "",
                "cmd": " ".join(cmd),
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"Timeout al ejecutar: {' '.join(cmd)}"}
        except FileNotFoundError:
            return {"success": False, "error": f"Comando no encontrado: {cmd[0]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# REPORT ENGINE — Generador de reportes de métricas
# ---------------------------------------------------------------------------

class ReportEngine:
    """Genera, formatea y almacena reportes de métricas del sistema."""

    def __init__(self, data_dir: str = TERMINADOR_DATA_DIR):
        self._dir = Path(data_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._reports: List[Dict] = []
        self._lock = threading.Lock()

    def generate_full_report(
        self,
        metrics: SystemMetrics,
        file_optimizer: FileOptimizer,
        process_manager: ProcessManager,
        target_dir: str = os.path.expanduser("~"),
    ) -> Dict[str, Any]:
        """Genera un reporte completo del sistema."""
        print("[ReportEngine] Generando reporte completo...")

        system_snap = metrics.collect()
        top_procs = process_manager.get_top_memory_consumers(limit=5)
        dir_analysis = file_optimizer.analyze_directory(target_dir)
        temp_scan = file_optimizer.scan_temp_files(target_dir)
        temp_summary = {
            "count": len([i for i in temp_scan if "error" not in i]),
            "total_mb": round(
                sum(i.get("size_bytes", 0) for i in temp_scan if "error" not in i) / 1e6, 2
            ),
        }

        report = {
            "report_id": hashlib.md5(str(time.time()).encode()).hexdigest()[:10],
            "generated_at": datetime.datetime.now().isoformat(),
            "target_dir": target_dir,
            "system": system_snap,
            "top_memory_processes": top_procs,
            "directory_analysis": dir_analysis,
            "temp_files": temp_summary,
            "health_score": self._calculate_health_score(system_snap),
            "alerts": self._generate_alerts(system_snap, temp_summary),
            "recommendations": self._generate_recommendations(system_snap, temp_summary, dir_analysis),
        }

        with self._lock:
            self._reports.append(report)

        report_path = self._dir / f"report_{report['report_id']}.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"[ReportEngine] Reporte guardado: {report_path}")
        return report

    def generate_quick_report(self, metrics: SystemMetrics) -> Dict[str, Any]:
        """Reporte rápido solo de métricas de sistema."""
        snap = metrics.collect()
        summary = metrics.get_summary()
        return {
            "type": "quick",
            "timestamp": snap["timestamp"],
            "summary": summary,
            "health_score": self._calculate_health_score(snap),
            "alerts": self._generate_alerts(snap, {}),
        }

    def _calculate_health_score(self, snap: Dict) -> int:
        """Calcula un score de salud del sistema de 0 a 100."""
        score = 100
        cpu_pct = snap.get("cpu", {}).get("usage_percent", 0)
        mem_pct = snap.get("memory", {}).get("usage_percent", 0)
        disk_list = snap.get("disk", [{}])
        disk_pct = disk_list[0].get("usage_percent", 0) if disk_list else 0

        if cpu_pct > 90: score -= 30
        elif cpu_pct > 70: score -= 15
        elif cpu_pct > 50: score -= 5

        if mem_pct > 90: score -= 30
        elif mem_pct > 75: score -= 15
        elif mem_pct > 60: score -= 5

        if disk_pct > 95: score -= 30
        elif disk_pct > 85: score -= 15
        elif disk_pct > 70: score -= 5

        zombie = snap.get("processes", {}).get("zombie", 0)
        if zombie > 5: score -= 10
        elif zombie > 0: score -= 3

        return max(0, score)

    def _generate_alerts(self, snap: Dict, temp_summary: Dict) -> List[str]:
        alerts = []
        cpu_pct = snap.get("cpu", {}).get("usage_percent", 0)
        mem_pct = snap.get("memory", {}).get("usage_percent", 0)
        disk_list = snap.get("disk", [{}])
        disk_pct = disk_list[0].get("usage_percent", 0) if disk_list else 0
        zombie = snap.get("processes", {}).get("zombie", 0)
        temp_mb = temp_summary.get("total_mb", 0)

        if cpu_pct > 90: alerts.append(f"🔴 CPU crítica: {cpu_pct}%")
        elif cpu_pct > 70: alerts.append(f"🟡 CPU alta: {cpu_pct}%")

        if mem_pct > 90: alerts.append(f"🔴 Memoria crítica: {mem_pct}%")
        elif mem_pct > 75: alerts.append(f"🟡 Memoria alta: {mem_pct}%")

        if disk_pct > 95: alerts.append(f"🔴 Disco crítico: {disk_pct}%")
        elif disk_pct > 85: alerts.append(f"🟡 Disco lleno: {disk_pct}%")

        if zombie > 0: alerts.append(f"⚠️ Procesos zombie detectados: {zombie}")
        if temp_mb > 500: alerts.append(f"🗑️ Archivos temporales acumulados: {temp_mb} MB")

        return alerts

    def _generate_recommendations(
        self, snap: Dict, temp_summary: Dict, dir_analysis: Dict
    ) -> List[str]:
        recs = []
        mem_pct = snap.get("memory", {}).get("usage_percent", 0)
        disk_pct = snap.get("disk", [{}])[0].get("usage_percent", 0) if snap.get("disk") else 0
        temp_mb = temp_summary.get("total_mb", 0)

        if mem_pct > 75:
            recs.append("Considera cerrar aplicaciones no esenciales o reiniciar servicios pesados.")
        if disk_pct > 80:
            recs.append("Ejecuta limpieza de archivos temporales para recuperar espacio en disco.")
        if temp_mb > 100:
            recs.append(f"Hay {temp_mb} MB en archivos temporales. Ejecuta clean_temp_files().")
        if not recs:
            recs.append("Sistema operando dentro de parámetros normales. Sin acción requerida.")

        return recs

    def get_recent_reports(self, limit: int = 10) -> List[Dict]:
        with self._lock:
            return self._reports[-limit:]

    def format_report_text(self, report: Dict) -> str:
        """Formatea un reporte como texto legible."""
        lines = [
            "=" * 60,
            f"  TERMINADOR IA — REPORTE DEL SISTEMA",
            f"  ID: {report.get('report_id', 'N/A')}",
            f"  Generado: {report.get('generated_at', 'N/A')}",
            "=" * 60,
        ]
        score = report.get("health_score", "N/A")
        lines.append(f"\n  HEALTH SCORE: {score}/100")

        alerts = report.get("alerts", [])
        if alerts:
            lines.append("\n  ALERTAS:")
            for a in alerts:
                lines.append(f"    {a}")
        else:
            lines.append("\n  ✅ Sin alertas. Sistema saludable.")

        summary = report.get("system", {})
        cpu_pct = summary.get("cpu", {}).get("usage_percent", "N/A")
        mem = summary.get("memory", {})
        lines.append(f"\n  CPU:     {cpu_pct}%")
        lines.append(f"  Memoria: {mem.get('usage_percent', 'N/A')}%  ({mem.get('used_mb', 'N/A')} MB / {mem.get('total_mb', 'N/A')} MB)")

        for d in summary.get("disk", []):
            lines.append(f"  Disco [{d.get('mount')}]: {d.get('usage_percent', 'N/A')}%  (Libre: {d.get('free_gb', 'N/A')} GB)")

        recs = report.get("recommendations", [])
        if recs:
            lines.append("\n  RECOMENDACIONES:")
            for r in recs:
                lines.append(f"    → {r}")

        lines.append("=" * 60)
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# TERMINADOR IA — Agente principal de automatización
# ---------------------------------------------------------------------------

class TerminadorIA:
    """
    Agente autónomo de automatización del ecosistema UNIVERSO HBG.
    Optimiza el sistema de archivos Linux y reporta métricas en tiempo real.
    Se integra con HBG CORE vía SyncEngine.
    """

    def __init__(
        self,
        sync_engine=None,
        data_dir: str = TERMINADOR_DATA_DIR,
        default_scan_dir: str = os.path.expanduser("~"),
    ):
        self._sync = sync_engine
        self._data_dir = data_dir
        self._default_scan_dir = default_scan_dir
        self._metrics = SystemMetrics()
        self._file_optimizer = FileOptimizer()
        self._process_manager = ProcessManager()
        self._report_engine = ReportEngine(data_dir=data_dir)
        self._active = False
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_interval: int = 60
        self._lock = threading.Lock()
        self._event_callbacks: List[Callable[[str, Dict], None]] = []

        if sync_engine is not None:
            self._connect_sync()

    def _connect_sync(self) -> None:
        self._sync.subscribe("terminador.command", self._on_command)
        print("[TerminadorIA] Conectado al SyncEngine de HBG CORE.")

    def _on_command(self, message: Dict) -> None:
        payload = message.get("payload", {})
        action = payload.get("action", "")
        threading.Thread(
            target=self._execute_command,
            args=(action, payload),
            daemon=True,
        ).start()

    def _execute_command(self, action: str, payload: Dict) -> None:
        action_map = {
            "optimize_system": lambda p: self.optimize(dry_run=p.get("dry_run", True)),
            "system_report": lambda p: self.quick_report(),
            "full_report": lambda p: self.full_report(target_dir=p.get("target_dir", self._default_scan_dir)),
            "scan_temps": lambda p: self.scan_temps(target_dir=p.get("target_dir", self._default_scan_dir)),
            "list_processes": lambda p: self.list_processes(),
            "find_large_files": lambda p: self.find_large_files(min_mb=p.get("min_mb", 100)),
        }
        handler = action_map.get(action)
        if handler:
            handler(payload)
        else:
            print(f"[TerminadorIA] Acción desconocida: '{action}'")

    def start(self, monitor_interval: int = 60) -> None:
        """Inicia el agente con monitoreo periódico."""
        self._active = True
        self._monitor_interval = monitor_interval
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True,
            name="TerminadorIA-Monitor",
        )
        self._monitor_thread.start()
        print(f"[TerminadorIA] Agente activo. Monitoreo cada {monitor_interval}s.")

    def stop(self) -> None:
        self._active = False
        print("[TerminadorIA] Agente detenido.")

    def _monitor_loop(self) -> None:
        """Loop de monitoreo periódico."""
        while self._active:
            try:
                snap = self._metrics.collect()
                summary = self._metrics.get_summary()
                alerts = self._report_engine._generate_alerts(snap, {})
                if alerts:
                    print("[TerminadorIA] Alertas detectadas:")
                    for alert in alerts:
                        print(f"  {alert}")
                    if self._sync:
                        self._sync.publish("terminador.alerts", {
                            "alerts": alerts,
                            "summary": summary,
                        })
                self._emit_event("metrics_collected", {"summary": summary})
            except Exception as e:
                print(f"[TerminadorIA] Error en monitor: {e}")

            elapsed = 0
            while elapsed < self._monitor_interval and self._active:
                time.sleep(1)
                elapsed += 1

    # ---------------------------------------------------------------------------
    # API PÚBLICA
    # ---------------------------------------------------------------------------

    def quick_report(self) -> Dict[str, Any]:
        """Reporte rápido de métricas del sistema."""
        report = self._report_engine.generate_quick_report(self._metrics)
        formatted = self._report_engine.format_report_text({
            "report_id": "quick",
            "generated_at": report["timestamp"],
            "health_score": report["health_score"],
            "alerts": report["alerts"],
            "system": self._metrics.get_history(limit=1)[0] if self._metrics.get_history(limit=1) else {},
            "recommendations": [],
        })
        print(formatted)
        self._emit_event("quick_report", report)
        if self._sync:
            self._sync.publish("terminador.report", report)
        return report

    def full_report(self, target_dir: Optional[str] = None) -> Dict[str, Any]:
        """Reporte completo con análisis de directorio."""
        target = target_dir or self._default_scan_dir
        report = self._report_engine.generate_full_report(
            metrics=self._metrics,
            file_optimizer=self._file_optimizer,
            process_manager=self._process_manager,
            target_dir=target,
        )
        formatted = self._report_engine.format_report_text(report)
        print(formatted)
        self._emit_event("full_report", report)
        if self._sync:
            self._sync.publish("terminador.full_report", {
                "report_id": report.get("report_id"),
                "health_score": report.get("health_score"),
                "alerts": report.get("alerts"),
            })
        return report

    def optimize(self, target_dir: Optional[str] = None, dry_run: bool = True) -> Dict[str, Any]:
        """
        Optimización del sistema.
        Si dry_run=True, solo muestra qué se eliminaría (sin borrar nada).
        """
        target = target_dir or self._default_scan_dir
        print(f"[TerminadorIA] {'SIMULACIÓN' if dry_run else 'OPTIMIZACIÓN REAL'} en: {target}")
        result = self._file_optimizer.clean_temp_files(target_dir=target, dry_run=dry_run)
        action_word = "recuperaría" if dry_run else "recuperó"
        print(
            f"[TerminadorIA] {result['items_found']} items encontrados. "
            f"Se {action_word} {result['mb_recovered']} MB. "
            f"Errores: {len(result['errors'])}."
        )
        self._emit_event("optimization_complete", result)
        if self._sync:
            self._sync.publish("terminador.optimization", result)
        return result

    def scan_temps(self, target_dir: Optional[str] = None) -> List[Dict]:
        """Escanea archivos temporales sin eliminar nada."""
        target = target_dir or self._default_scan_dir
        items = self._file_optimizer.scan_temp_files(target)
        total_mb = round(sum(i.get("size_bytes", 0) for i in items if "error" not in i) / 1e6, 2)
        print(f"[TerminadorIA] Escaneo completado: {len(items)} archivos temporales ({total_mb} MB) en {target}")
        return items

    def find_large_files(self, target_dir: Optional[str] = None, min_mb: float = 100) -> List[Dict]:
        """Encuentra archivos grandes."""
        target = target_dir or self._default_scan_dir
        files = self._file_optimizer.find_large_files(target_dir=target, min_size_mb=min_mb)
        print(f"[TerminadorIA] {len(files)} archivos > {min_mb}MB encontrados en {target}")
        for f in files[:5]:
            print(f"  {f['size_human']:>10}  {f['path']}")
        return files

    def find_duplicates(self, target_dir: Optional[str] = None) -> List[Dict]:
        """Encuentra archivos duplicados."""
        target = target_dir or self._default_scan_dir
        print(f"[TerminadorIA] Buscando duplicados en: {target} (puede tardar...)")
        dupes = self._file_optimizer.find_duplicates(target_dir=target)
        total_wasted = sum(d.get("wasted_bytes", 0) for d in dupes)
        print(f"[TerminadorIA] {len(dupes)} grupos de duplicados. Espacio desperdiciado: {self._file_optimizer._human_size(total_wasted)}")
        return dupes

    def list_processes(self, sort_by: str = "memory", limit: int = 15) -> List[Dict]:
        """Lista procesos activos del sistema."""
        procs = self._process_manager.list_processes(sort_by=sort_by, limit=limit)
        print(f"\n{'PID':>8} {'NOMBRE':<20} {'MEM MB':>8} {'ESTADO':>8} {'HILOS':>6}")
        print("-" * 58)
        for p in procs[:limit]:
            if "error" in p:
                print(f"  Error: {p['error']}")
                continue
            print(
                f"{p['pid']:>8} {p['name']:<20} {p['mem_mb']:>8.1f} "
                f"{p['state']:>8} {p['threads']:>6}"
            )
        return procs

    def run_command(self, cmd: List[str], timeout: int = 30) -> Dict[str, Any]:
        """Ejecuta un comando del sistema de forma segura."""
        result = self._process_manager.run_command(cmd=cmd, timeout=timeout)
        if result["success"]:
            print(f"[TerminadorIA] Comando exitoso:\n{result.get('stdout', '')[:500]}")
        else:
            print(f"[TerminadorIA] Error: {result.get('error', result.get('stderr', 'Error desconocido'))}")
        return result

    def get_metrics(self) -> Dict[str, Any]:
        """Retorna las métricas más recientes del sistema."""
        return self._metrics.collect()

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Resumen compacto de métricas."""
        self._metrics.collect()
        return self._metrics.get_summary()

    def subscribe_to_events(self, callback: Callable[[str, Dict], None]) -> None:
        self._event_callbacks.append(callback)

    def _emit_event(self, event_type: str, data: Dict) -> None:
        for cb in self._event_callbacks:
            try:
                cb(event_type, data)
            except Exception as e:
                print(f"[TerminadorIA] Error en callback: {e}")

    @property
    def metrics(self) -> SystemMetrics:
        return self._metrics

    @property
    def file_optimizer(self) -> FileOptimizer:
        return self._file_optimizer

    @property
    def process_manager(self) -> ProcessManager:
        return self._process_manager

    @property
    def report_engine(self) -> ReportEngine:
        return self._report_engine

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()


# ---------------------------------------------------------------------------
# EJECUCIÓN DIRECTA (demo)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  TERMINADOR IA — Módulo de Automatización UNIVERSO HBG")
    print("=" * 60)

    agent = TerminadorIA(sync_engine=None, default_scan_dir=os.path.expanduser("~"))

    print("\n--- Reporte rápido del sistema ---")
    agent.quick_report()

    print("\n--- Top 5 procesos por memoria ---")
    agent.list_processes(sort_by="memory", limit=5)

    print("\n--- Simulación de limpieza de temporales (dry_run=True) ---")
    result = agent.optimize(dry_run=True)
    print(f"Resultado: {json.dumps(result, indent=2, ensure_ascii=False)[:400]}")

    print("\n--- Métricas en tiempo real ---")
    summary = agent.get_metrics_summary()
    print(json.dumps(summary, indent=2, ensure_ascii=False))

    print("\n[TerminadorIA] Demo completada.")
