"""VEYORA backend entry point.

    python wsgi.py                       # local dev server on :5000
    VEYORA_DEMO_MODE=1 python wsgi.py    # also enable demo-login shortcuts
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
