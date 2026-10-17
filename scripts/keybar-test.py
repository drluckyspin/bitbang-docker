"""Phone key bar check, run inside the workspace container by smoke-test.bash.

Attaches a real tmux client through a pty, on a private tmux socket, and taps every column of the key bar row with
the SGR mouse sequences xterm.js sends. Passes when the taps produce every expected key and page through the
scrollback, and fails with a description otherwise.
"""

import fcntl
import os
import pty
import struct
import subprocess
import sys
import termios
import time

COLS, ROWS = 48, 20
SOCKET = "keybar-test"
EXPECTED = {"Esc": "^[", "Ctrl-C": "^C", "Tab": "^I", "Shift-Tab": "^[[Z", "Up": "^[[A", "Down": "^[[B"}


def tmux(*args):
    return subprocess.run(["tmux", "-L", SOCKET, *args], capture_output=True, text=True).stdout


def main():
    tmux("new-session", "-d", "-s", "t", "-x", str(COLS), "-y", str(ROWS),
         "bash -c 'seq 1 300; stty raw -echo; cat -vT'")
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execvp("tmux", ["tmux", "-L", SOCKET, "attach", "-t", "t"])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    os.set_blocking(fd, False)

    def drain(seconds):
        end = time.time() + seconds
        while time.time() < end:
            try:
                os.read(fd, 65536)
            except OSError:
                pass
            time.sleep(0.02)

    def tap(x):
        os.write(fd, f"\x1b[<0;{x};{ROWS}M".encode())
        drain(0.03)
        os.write(fd, f"\x1b[<0;{x};{ROWS}m".encode())
        drain(0.15)

    def last_line():
        lines = tmux("capture-pane", "-p", "-t", "t").rstrip("\n").splitlines()
        return lines[-1] if lines else ""

    def lines_scrolled_back():
        """0 on the live screen, otherwise how far copy mode has scrolled back."""
        in_mode, _, position = tmux("display", "-p", "-t", "t", "#{pane_in_mode}:#{scroll_position}").strip().partition(":")
        return int(position or 0) if in_mode == "1" else 0

    drain(1.0)
    sent, page_up_col = set(), None
    for x in range(1, COLS + 1):
        tmux("send-keys", "-t", "t", "-H", "0d", "0a")
        drain(0.05)
        tap(x)
        sent.add(last_line().strip())
        if lines_scrolled_back() and page_up_col is None:
            page_up_col = x
        tmux("send-keys", "-t", "t", "-X", "cancel")
        drain(0.05)

    problems = [f"{name} key not sent" for name, seq in EXPECTED.items() if seq not in sent]
    if page_up_col is None:
        problems.append("PgUp did not open the scrollback")
    else:
        tap(page_up_col)
        tap(page_up_col)
        page_down_col = None
        for x in range(page_up_col + 1, COLS + 1):
            before = lines_scrolled_back()
            tap(x)
            if lines_scrolled_back() < before:
                page_down_col = x
                break
        if page_down_col is None:
            problems.append("PgDn did not scroll toward the live screen")
        else:
            for _ in range(10):
                if not lines_scrolled_back():
                    break
                tap(page_down_col)
            if lines_scrolled_back():
                problems.append("PgDn did not return to the live screen")

    tmux("kill-server")
    if problems:
        print("; ".join(problems))
        sys.exit(1)
    print("all keys and scrolling work")


if __name__ == "__main__":
    main()
