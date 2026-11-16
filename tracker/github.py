"""Minimal, dependency-free GitHub REST client with retries and rate-limit handling."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

API = "https://api.github.com"
USER_AGENT = "ps5-emutrack (+https://github.com/its-zain-dev/ps5-emutrack)"


class GitHubError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"HTTP {status}: {message}")
        self.status = status


@dataclass
class GitHub:
    token: str | None = None
    timeout: float = 20.0
    retries: int = 3

    @classmethod
    def from_env(cls) -> "GitHub":
        return cls(token=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or None)

    def request(self, method: str, path: str, body: Any = None) -> Any:
        url = path if path.startswith("https://") else f"{API}{path}"
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        last: Exception | None = None
        for attempt in range(self.retries):
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as exc:
                msg = exc.read().decode("utf-8", "replace")[:300]
                rate_limited = exc.code == 429 or (
                    exc.code == 403 and exc.headers.get("X-RateLimit-Remaining") == "0"
                )
                if rate_limited or exc.code >= 500:
                    last = GitHubError(exc.code, msg)
                    wait = _retry_wait(exc.headers, attempt)
                    if wait is None:
                        break
                    time.sleep(wait)
                    continue
                raise GitHubError(exc.code, msg) from None
            except (urllib.error.URLError, TimeoutError) as exc:
                last = exc
                time.sleep(2**attempt)
        raise last or GitHubError(0, "request failed")

    def get(self, path: str) -> Any:
        return self.request("GET", path)


def _retry_wait(headers: Any, attempt: int) -> float | None:
    """Seconds to wait before retrying; None if the wait would be unreasonably long."""
    retry_after = headers.get("Retry-After")
    if retry_after and retry_after.isdigit():
        wait = float(retry_after)
    elif headers.get("X-RateLimit-Reset", "").isdigit():
        wait = max(0.0, float(headers["X-RateLimit-Reset"]) - time.time()) + 1
    else:
        wait = float(2**attempt)
    return wait if wait <= 60 else None
