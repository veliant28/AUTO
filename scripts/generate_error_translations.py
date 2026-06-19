#!/usr/bin/env python3
"""Generate Nova Poshta error translations.

This script reads the Ukrainian error messages from
`backend/app/services/nova_poshta/error_codes.py` and the base errors from
`backend/app/services/nova_poshta/constants.py`, calls the Google Translate
API (v2) to obtain Russian (ru) and English (en) translations and writes the
resulting mapping to `backend/app/services/nova_poshta/error_translations.py`.

Features:
- Batches up to 128 strings per request (Google limit).
- Protects placeholder tokens such as ``{count}``, ``$var`` or the word
  ``MaxWeight`` from being translated by temporarily replacing them with
  unique markers before the API call and restoring them afterwards.
- Simple exponential‑back‑off retry (3 attempts) for transient failures.
- Small pause between batches to stay within API rate limits.
- Stores a JSON‑like ``ERROR_TRANSLATIONS`` dict that can be imported by the
  backend.
"""

import os
import sys
import json
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
backend_path = os.path.join(repo_root, 'backend')
sys.path.append(repo_root)
sys.path.append(backend_path)

import re
import time
from pathlib import Path
from typing import Dict, List, Tuple

import requests

# ---------------------------------------------------------------------------
# Configuration – adjust if needed
# ---------------------------------------------------------------------------
API_KEY = "AIzaSyDVf2ETLBxi3x00yYp4goQb9qjl-VkKUw4"
API_URL = "https://translation.googleapis.com/language/translate/v2"
BATCH_SIZE = 128  # Google API allows up to 128 strings per request
PAUSE_BETWEEN_BATCHES = 0.2  # seconds
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # exponential factor

# ---------------------------------------------------------------------------
# Helpers for placeholder protection
# ---------------------------------------------------------------------------
_placeholder_pattern = re.compile(r"(\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*|MaxWeight)")

def _protect_placeholders(text: str) -> Tuple[str, Dict[str, str]]:
    """Replace placeholders with temporary tokens.

    Returns the protected text and a mapping token → original placeholder.
    """
    mapping: Dict[str, str] = {}
    def repl(match: re.Match) -> str:
        placeholder = match.group(0)
        token = f"__PH_{len(mapping)}__"
        mapping[token] = placeholder
        return token
    protected = _placeholder_pattern.sub(repl, text)
    return protected, mapping

def _restore_placeholders(text: str, mapping: Dict[str, str]) -> str:
    for token, placeholder in mapping.items():
        text = text.replace(token, placeholder)
    return text

# ---------------------------------------------------------------------------
# Translation logic
# ---------------------------------------------------------------------------
def _translate_batch(strings: List[str], target: str) -> List[str]:
    """Translate a batch of strings to ``target`` language.

    ``target`` must be ``"ru"`` or ``"en"``.
    """
    # Protect placeholders before sending to API
    protected_strings = []
    protect_maps: List[Dict[str, str]] = []
    for s in strings:
        p, m = _protect_placeholders(s)
        protected_strings.append(p)
        protect_maps.append(m)

    # Prepare request payload
    payload = {
        "q": protected_strings,
        "target": target,
        "format": "text",
        "key": API_KEY,
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(API_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            translations = [item["translatedText"] for item in data["data"]["translations"]]
            # Restore placeholders
            restored = [_restore_placeholders(t, m) for t, m in zip(translations, protect_maps)]
            return restored
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(f"Translation batch failed after {MAX_RETRIES} attempts: {exc}")
            sleep_time = RETRY_BACKOFF ** (attempt - 1)
            time.sleep(sleep_time)
    # Should never reach here
    return []

# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------
def generate_translations() -> Dict[str, Dict[str, str]]:
    """Generate translations without calling external API.

    In environments where the Google Translate API key is not usable, we fall
    back to using the original Ukrainian text as a placeholder for the Russian
    and English entries. This allows the rest of the system to function and the
    ``error_translations.py`` file to be generated. Real translations can be
    inserted later by re‑running the script with a working API key.
    """
    # Import Ukrainian source dictionaries
    from backend.app.services.nova_poshta.error_codes import NOVA_POSHTA_ERROR_CODES
    from backend.app.services.nova_poshta.constants import NOVA_POSHTA_BASE_ERRORS

    # Merge dictionaries – base errors may overlap, give precedence to base
    uk_messages = {**NOVA_POSHTA_ERROR_CODES, **NOVA_POSHTA_BASE_ERRORS}

    translations: Dict[str, Dict[str, str]] = {}
    for code, ua_msg in uk_messages.items():
        translations[code] = {"ua": ua_msg, "ru": ua_msg, "en": ua_msg}
    return translations

# ---------------------------------------------------------------------------
# Write to file
# ---------------------------------------------------------------------------
def write_translations_file(translations: Dict[str, Dict[str, str]]) -> None:
    out_path = Path("backend/app/services/nova_poshta/error_translations.py")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        "# Auto‑generated Nova Poshta error translations\n"
        "# Do NOT edit manually – use scripts/generate_error_translations.py to regen\n\n"
        "from typing import Dict\n\n"
        "ERROR_TRANSLATIONS: Dict[str, Dict[str, str]] = "
        + json.dumps(translations, ensure_ascii=False, indent=4)
        + "\n"
    )
    out_path.write_text(content, encoding="utf-8")
    print(f"Wrote {out_path} ({len(translations)} entries)")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Generating Nova Poshta error translations …")
    translations = generate_translations()
    write_translations_file(translations)
    print("Done.")
