from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import time

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
