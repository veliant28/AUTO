from deep_translator import GoogleTranslator
from typing import Optional


_translator_ua: Optional[GoogleTranslator] = None
_translator_en: Optional[GoogleTranslator] = None


def _get_translator(target: str) -> GoogleTranslator:
    global _translator_ua, _translator_en
    if target == "uk":
        if _translator_ua is None:
            _translator_ua = GoogleTranslator(source="ru", target="uk")
        return _translator_ua
    if target == "en":
        if _translator_en is None:
            _translator_en = GoogleTranslator(source="ru", target="en")
        return _translator_en
    raise ValueError(f"Unsupported target: {target}")


def translate(text: str, target: str) -> Optional[str]:
    try:
        t = _get_translator(target)
        return t.translate(text)
    except Exception:
        return None
