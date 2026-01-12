import time
import os
import sys
from typing import Any, Dict


def _get_ram_status() -> Dict[str, Any]:
    """Return system RAM usage stats.

    On Linux, reads /proc/meminfo and uses MemAvailable for a realistic 'used' metric.
    If unavailable, tries psutil when installed.
    """
    try:
        if sys.platform.startswith("linux") and os.path.exists("/proc/meminfo"):
            meminfo: Dict[str, int] = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.split(":", 1)
                    if len(parts) != 2:
                        continue
                    key = parts[0].strip()
                    rest = parts[1].strip()
                    # Expected format: "123456 kB"
                    tokens = rest.split()
                    if not tokens:
                        continue
                    try:
                        value = int(tokens[0])
                    except Exception:
                        continue
                    unit = tokens[1] if len(tokens) > 1 else "kB"
                    if unit == "kB":
                        meminfo[key] = value * 1024
                    else:
                        # Unknown unit, keep raw
                        meminfo[key] = value

            total = int(meminfo.get("MemTotal", 0))
            available = int(meminfo.get("MemAvailable", 0))
            if total <= 0:
                return {"ram_available": False, "ram_reason": "MemTotal missing"}

            used = max(0, total - available) if available > 0 else int(meminfo.get("MemFree", 0))
            percent = float(used) / float(total) * 100.0 if total > 0 else 0.0
            return {
                "ram_available": True,
                "ram_total_bytes": int(total),
                "ram_used_bytes": int(used),
                "ram_percent": float(percent),
            }

        # Fallback: psutil if present
        try:
            import psutil  # type: ignore

            vm = psutil.virtual_memory()
            total = int(vm.total)
            used = int(vm.used)
            percent = float(vm.percent)
            return {
                "ram_available": True,
                "ram_total_bytes": int(total),
                "ram_used_bytes": int(used),
                "ram_percent": float(percent),
            }
        except Exception as e:
            return {"ram_available": False, "ram_reason": f"psutil unavailable: {type(e).__name__}: {e}"}
    except Exception as e:
        return {"ram_available": False, "ram_reason": f"exception: {type(e).__name__}: {e}"}


def _get_vram_status() -> Dict[str, Any]:
    """Return VRAM usage stats.

    Uses torch.cuda when available. If CUDA is not available, returns available=False.
    """
    base = _get_ram_status()
    try:
        import torch

        if not torch.cuda.is_available():
            return {
                "available": False,
                "reason": "torch.cuda.is_available() is false",
                **base,
            }

        device_index = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(device_index)
        total = int(props.total_memory)

        # Use mem_get_info when available: returns (free, total)
        used = None
        try:
            free, total2 = torch.cuda.mem_get_info(device_index)
            total = int(total2)
            used = int(total - free)
        except Exception:
            # Fallback to memory stats (allocated/reserved) if mem_get_info not supported
            allocated = int(torch.cuda.memory_allocated(device_index))
            reserved = int(torch.cuda.memory_reserved(device_index))
            used = max(allocated, reserved)

        percent = float(used) / float(total) * 100.0 if total > 0 else 0.0

        return {
            "available": True,
            "device_index": int(device_index),
            "device_name": str(props.name),
            "total_bytes": int(total),
            "used_bytes": int(used),
            "percent": float(percent),
            "timestamp": time.time(),
            **base,
        }
    except Exception as e:
        return {
            "available": False,
            "reason": f"exception: {type(e).__name__}: {e}",
            **base,
        }


def _register_api_route() -> None:
    """Register HTTP API route under /vram_watcher/status."""
    try:
        from server import PromptServer

        from aiohttp import web

        app = PromptServer.instance.app

        async def vram_watcher_status(request):
            return web.json_response(_get_vram_status())

        # Avoid duplicate-route errors on reload
        try:
            app.router.add_get("/vram_watcher/status", vram_watcher_status)
        except Exception:
            pass

    except Exception:
        # If ComfyUI server modules are not available during import, ignore.
        # ComfyUI will import this file in its own environment.
        return


_register_api_route()


class VRAMWatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "run"
    CATEGORY = "utils"

    def run(self):
        # UI-only node: no outputs
        return ()


NODE_CLASS_MAPPINGS = {
    "VRAMWatcher": VRAMWatcher,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VRAMWatcher": "VRAM Watcher (Bar)",
}

# ComfyUI will load everything under this folder as web extensions
WEB_DIRECTORY = "./web"
