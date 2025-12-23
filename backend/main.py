from app.main import create_app


app = create_app()


if __name__ == "__main__":  # pragma: no cover - manual run helper
    # Running uvicorn would normally go here, but the local shim keeps the dependency light.
    import sys

    print("Run with a WSGI/ASGI server to serve the app", file=sys.stderr)