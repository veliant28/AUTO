#!/usr/bin/env python3
"""Generate Nova Poshta error translations using LibreTranslate.

LibreTranslate (https://libretranslate.com) offers a free public API without a key.
We batch up to 100 strings per request (the public endpoint accepts a list).
If the service is unavailable, the script falls back to copying the Ukrainian text
for the ``ru`` and ``en`` fields (so the backend still works).
"""

import os
import sys
import json
import time
import re
from pathlib import Path
from typing import Dict, List, Tuple

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
LIBRE_URL = "https://libretranslate.com/translate"
BATCH_SIZE = 100
PAUSE_BETWEEN_BATCHES = 0.5  # seconds
MAX_RETRIES = 3
RETRY_BACKOFF = 2

# ---------------------------------------------------------------------------
# Placeholder handling – protect tokens like {count}, $var, MaxWeight
# ---------------------------------------------------------------------------
_placeholder_pattern = re.compile(r"(\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*|MaxWeight)")

def protect(text: str) -> Tuple[str, Dict[str, str]]:
    mapping: Dict[str, str] = {}
    def repl(m: re.Match) -> str:
        token = f"__PH_{len(mapping)}__"
        mapping[token] = m.group(0)
        return token
    return _placeholder_pattern.sub(repl, text), mapping

def restore(text: str, mapping: Dict[str, str]) -> str:
    for token, orig in mapping.items():
        text = text.replace(token, orig)
    return text

# ---------------------------------------------------------------------------
# Translation via LibreTranslate
# ---------------------------------------------------------------------------
def translate_batch(strings: List[str], target: str) -> List[str]:
    # Protect placeholders
    protected = []
    maps = []
    for s in strings:
        p, m = protect(s)
        protected.append(p)
        maps.append(m)
    payload = {
        "q": protected,
        "source": "uk",
        "target": target,
        "format": "text",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(LIBRE_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            # LibreTranslate returns a list of dicts with "translatedText"
            translated = [item["translatedText"] for item in data]
            # Restore placeholders
            return [restore(t, m) for t, m in zip(translated, maps)]
        except Exception as e:
            if attempt == MAX_RETRIES:
                raise RuntimeError(f"LibreTranslate failed after {MAX_RETRIES} attempts: {e}")
            time.sleep(RETRY_BACKOFF ** (attempt - 1))
    return []

# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------
def generate() -> Dict[str, Dict[str, str]]:
    # Add repo root to sys.path so imports work
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    backend_path = os.path.join(repo_root, 'backend')
    sys.path.append(repo_root)
    sys.path.append(backend_path)
    from backend.app.services.nova_poshta.error_codes import NOVA_POSHTA_ERROR_CODES
    from backend.app.services.nova_poshta.constants import NOVA_POSHTA_BASE_ERRORS

    uk_messages = {**NOVA_POSHTA_ERROR_CODES, **NOVA_POSHTA_BASE_ERRORS}
    codes = list(uk_messages.keys())
    uk_texts = [uk_messages[c] for c in codes]

    ru_texts: List[str] = []
    en_texts: List[str] = []
    for i in range(0, len(uk_texts), BATCH_SIZE):
        batch = uk_texts[i:i + BATCH_SIZE]
        try:
            ru_batch = translate_batch(batch, "ru")
            en_batch = translate_batch(batch, "en")
        except RuntimeError as e:
            # Fallback – copy Ukrainian text
            ru_batch = batch
            en_batch = batch
            print("Fallback to Ukrainian for this batch because:", e)
        ru_texts.extend(ru_batch)
        en_texts.extend(en_batch)
        time.sleep(PAUSE_BETWEEN_BATCHES)

    translations: Dict[str, Dict[str, str]] = {}
    for code, ua, ru, en in zip(codes, uk_texts, ru_texts, en_texts):
        translations[code] = {"ua": ua, "ru": ru, "en": en}
    return translations

# ---------------------------------------------------------------------------
# Write out the file
# ---------------------------------------------------------------------------
def write(translations: Dict[str, Dict[str, str]]) -> None:
    out_path = Path('backend/app/services/nova_poshta/error_translations.py')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        "# Auto‑generated Nova Poshta error translations (LibreTranslate)\n"
        "# If you need real translations, replace the placeholders or run the script with a proper API.\n\n"
        "from typing import Dict\n\n"
        "ERROR_TRANSLATIONS: Dict[str, Dict[str, str]] = "
        + json.dumps(translations, ensure_ascii=False, indent=4)
        + "\n"
    )
    out_path.write_text(content, encoding="utf-8")
    print(f"Wrote {out_path} ({len(translations)} entries)")

if __name__ == "__main__":
    print("Generating translations via LibreTranslate …")
    trans = generate()
    write(trans)
    print("Done.")
