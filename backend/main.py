from pathlib import Path
import sys


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


from app.main import create_app


app = create_app()


if __name__ == "__main__":  # pragma: no cover - manual run helper
    # Running uvicorn would normally go here, but the local shim keeps the dependency light.
    print("Run with a WSGI/ASGI server to serve the app", file=sys.stderr)