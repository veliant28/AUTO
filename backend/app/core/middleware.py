from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import time

# Supported locales: Ukrainian, Russian, English
SUPPORTED_LOCALES = ("ua", "ru", "en")
DEFAULT_LOCALE = "ru"

# Map Accept-Language values to our locales
_LOCALE_ALIASES = {
    "uk": "ua",
    "uk-ua": "ua",
    "ua": "ua",
    "ru": "ru",
    "ru-ru": "ru",
    "en": "en",
    "en-us": "en",
    "en-gb": "en",
}


def parse_accept_language(header: str) -> str:
    """Parse Accept-Language header and return our internal locale code.

    Accept-Language example: "ru,en-US;q=0.9,en;q=0.8,uk;q=0.7"
    Picks the highest-quality language we support, falling back to DEFAULT_LOCALE.
    """
    if not header:
        return DEFAULT_LOCALE

    # Parse "lang;q=value" pairs
    candidates = []
    for part in header.split(","):
        part = part.strip()
        if not part:
            continue
        if ";q=" in part:
            lang, q = part.split(";q=", 1)
            try:
                quality = float(q)
            except ValueError:
                quality = 1.0
        else:
            lang, quality = part, 1.0
        candidates.append((lang.lower().strip(), quality))

    # Sort by quality descending, stable on insertion order for ties
    candidates.sort(key=lambda c: c[1], reverse=True)

    for lang, _ in candidates:
        # Direct match
        if lang in SUPPORTED_LOCALES:
            return lang
        # Alias match (uk → ua)
        if lang in _LOCALE_ALIASES:
            return _LOCALE_ALIASES[lang]

    return DEFAULT_LOCALE


class LocaleMiddleware(BaseHTTPMiddleware):
    """Extract locale from Accept-Language header and store on request.state."""

    async def dispatch(self, request: Request, call_next):
        accept_lang = request.headers.get("accept-language", "")
        request.state.locale = parse_accept_language(accept_lang)
        return await call_next(request)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000

        if request.url.path not in ['/health', '/favicon.ico']:
            print(f"{request.method} {request.url.path} - {response.status_code} ({process_time:.2f}ms)")

        return response

def setup_cors(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3080"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
