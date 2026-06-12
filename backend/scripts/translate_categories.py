"""Batch-translate all PartCategory names via Google Translate.

Usage:
    python scripts/translate_categories.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.db import SessionLocal
from app.models.parts import PartCategory
from deep_translator import GoogleTranslator


def batch_translate(texts: list[str], source: str, target: str) -> list[str | None]:
    if not texts:
        return []
    try:
        t = GoogleTranslator(source=source, target=target)
        return t.translate_batch(texts)
    except Exception as e:
        print(f"  Batch translation failed ({source}→{target}): {e}")
        # Fall back to individual translation
        results = []
        t = GoogleTranslator(source=source, target=target)
        for txt in texts:
            try:
                results.append(t.translate(txt))
            except Exception:
                results.append(None)
        return results


def main():
    db = SessionLocal()
    try:
        cats_ua = db.query(PartCategory).filter(
            PartCategory.name_ua.is_(None), PartCategory.name.isnot(None)
        ).all()
        cats_en = db.query(PartCategory).filter(
            PartCategory.name_en.is_(None), PartCategory.name.isnot(None)
        ).all()

        if not cats_ua and not cats_en:
            print("All categories already translated.")
            return

        all_cats = {c.id: c for c in cats_ua + cats_en}

        ua_texts = [c.name for c in cats_ua]
        en_texts = [c.name for c in cats_en]

        ua_results: list[str | None] = []
        en_results: list[str | None] = []

        if ua_texts:
            print(f"Translating {len(ua_texts)} names to Ukrainian...")
            ua_results = batch_translate(ua_texts, "ru", "uk")
            print(f"  Got {sum(1 for r in ua_results if r)}/{len(ua_texts)} translations")

        if en_texts:
            print(f"Translating {len(en_texts)} names to English...")
            en_results = batch_translate(en_texts, "ru", "en")
            print(f"  Got {sum(1 for r in en_results if r)}/{len(en_texts)} translations")

        # Apply translations
        for cat in cats_ua:
            idx = cats_ua.index(cat)
            if idx < len(ua_results) and ua_results[idx]:
                cat.name_ua = ua_results[idx]

        for cat in cats_en:
            idx = cats_en.index(cat)
            if idx < len(en_results) and en_results[idx]:
                cat.name_en = en_results[idx]

        db.commit()
        print(f"Done! Updated {len(cats_ua)} UA names, {len(cats_en)} EN names.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
