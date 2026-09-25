import os
import re
import shlex
import signal
import subprocess
import sys
import threading
import time
from collections import deque

import yaml

'''
Generate and run flowgraphs, one at a time (like GRC).

generate() runs grcc on a .grc file, which writes the Python script next to it.
FlowgraphRunner starts that script as a child process and collects its output
(stdout and stderr) so the frontend can poll it.
'''

GRCC = "grcc"
MAX_LINES = 5000  # output lines kept in memory
DEFAULT_RUN_COMMAND = "{python} -u {filename}"


class RunError(Exception):
    pass


def generate(grc_path):
    """Run grcc on a .grc file. Returns (script_path, grcc_output)."""
    out_dir = os.path.dirname(grc_path)
    try:
        result = subprocess.run([GRCC, "-o", out_dir, grc_path],
                                capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise RunError("grcc not found: is GNU Radio installed on the server?")
    except subprocess.TimeoutExpired:
        raise RunError("grcc timed out")

    output = (result.stdout + result.stderr).strip()
    # grcc prints ">>> Generating: <path>"; hier blocks go elsewhere than out_dir
    match = re.search(r">>> Generating: (.+)", output)
    if result.returncode != 0 or not match:
        raise RunError(f"grcc failed:\n{output}")
    return match.group(1).strip(), output


def _run_command(grc_path, script_path):
    """Command line from the flowgraph's run_command option, as GRC does."""
    try:
        with open(grc_path) as f:
            options = (yaml.safe_load(f).get("options") or {}).get("parameters") or {}
    except (OSError, yaml.YAMLError, AttributeError):
        options = {}
    template = options.get("run_command") or DEFAULT_RUN_COMMAND
    return [part.format(python=sys.executable, filename=script_path) for part in shlex.split(template)]


class FlowgraphRunner:
    def __init__(self):
        self._lock = threading.Lock()
        self._proc = None
        self._lines = deque(maxlen=MAX_LINES)
        self._next = 0  # sequence number of the next output line
        self.state = "idle"  # idle | running | exited | killed
        self._stopping = False
        self.returncode = None
        self.path = None  # .grc path (relative to the flowgraph root) being run

    def _append(self, text):
        with self._lock:
            self._lines.append((self._next, text))
            self._next += 1

    def start(self, grc_path, rel_path):
        """Generate and start a flowgraph. Returns the grcc output."""
        with self._lock:
            if self.state == "running":
                raise RunError(f"{self.path} is already running")

        script, grcc_output = generate(grc_path)
        cmd = _run_command(grc_path, script)

        with self._lock:
            if self.state == "running":
                raise RunError(f"{self.path} is already running")
            self._lines.clear()
            self._stopping = False
            self.path = rel_path
            self.returncode = None
            try:
                # stdin stays open so "Press Enter to quit" flowgraphs keep running;
                # new session so stop() can signal the whole process group
                self._proc = subprocess.Popen(
                    cmd, cwd=os.path.dirname(script),
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1, start_new_session=True,
                )
            except OSError as e:
                self.state = "exited"
                raise RunError(f"Failed to start {' '.join(cmd)}: {e}")
            self.state = "running"

        self._append(f">>> Executing: {' '.join(shlex.quote(c) for c in cmd)}")
        threading.Thread(target=self._pump, args=(self._proc,), daemon=True).start()
        return grcc_output

    def _pump(self, proc):
        for line in proc.stdout:
            self._append(line.rstrip("\n"))
        code = proc.wait()
        # Record the last line before changing state, so pollers that stop
        # when the run ends have seen all output
        with self._lock:
            self._lines.append((self._next, f">>> Done (return code {code})"))
            self._next += 1
            if self._proc is proc:
                self.returncode = code
                self.state = "killed" if self._stopping else "exited"

    def stop(self, timeout=3):
        """Stop the running flowgraph: SIGTERM, then SIGKILL after timeout."""
        with self._lock:
            proc = self._proc
            if self.state != "running" or proc is None or self._stopping:
                return False
            self._stopping = True
        try:
            proc.stdin.close()
            os.killpg(proc.pid, signal.SIGTERM)
            deadline = time.time() + timeout
            while proc.poll() is None and time.time() < deadline:
                time.sleep(0.05)
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, OSError):
            pass
        return True

    def status(self, since=0):
        with self._lock:
            lines = [text for n, text in self._lines if n >= since]
            return {
                "state": self.state,
                "returncode": self.returncode,
                "path": self.path,
                "lines": lines,
                "next": self._next,
            }
