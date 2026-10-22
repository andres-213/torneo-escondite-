"""Servidor del Torneo de Escondite en Parejas.

Sirve la web (carpeta public/) y guarda el torneo en un archivo JSON, así todos
los que abran el enlace ven los mismos puntos. Solo los administradores (máx. 3)
pueden modificar datos; el resto ve la tabla en vivo.
"""
import json
import os
import secrets
import tempfile
import threading
import time
import uuid

from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE, "data"))
DATA_FILE = os.path.join(DATA_DIR, "torneo.json")
SECRET_FILE = os.path.join(DATA_DIR, "secret.key")
MAX_ADMINS = 3
MAX_BODY = 1_000_000
EMPTY_STATE = {"groups": [], "clans": [], "rounds": [], "day1Closed": False, "sample": False}

os.makedirs(DATA_DIR, exist_ok=True)
lock = threading.Lock()


def _secret():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as f:
            f.write(secrets.token_hex(32))
    with open(SECRET_FILE) as f:
        return f.read().strip()


app = Flask(__name__, static_folder=os.path.join(BASE, "public"), static_url_path="")
app.secret_key = _secret()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.environ.get("HTTPS")),
    PERMANENT_SESSION_LIFETIME=60 * 60 * 12,
    MAX_CONTENT_LENGTH=MAX_BODY,
)


# ---------- almacenamiento ----------
def load():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            db = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        db = {}
    db.setdefault("rev", 0)
    db.setdefault("admins", [])
    db.setdefault("state", dict(EMPTY_STATE))
    return db


def store(db):
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def clean_state(s):
    """Valida y recorta el estado enviado por un admin. Devuelve None si es inválido."""
    if not isinstance(s, dict):
        return None
    out = {}
    for key in ("groups", "clans", "rounds"):
        v = s.get(key)
        if not isinstance(v, list) or len(v) > 2000 or not all(isinstance(i, dict) for i in v):
            return None
        out[key] = v
    out["day1Closed"] = bool(s.get("day1Closed"))
    out["sample"] = bool(s.get("sample"))
    return out


# ---------- sesión ----------
def current_admin(db):
    aid = session.get("admin")
    return next((a for a in db["admins"] if a["id"] == aid), None)


def payload(db):
    me = current_admin(db)
    return {
        "rev": db["rev"],
        "state": db["state"],
        "admins": [{"id": a["id"], "name": a["name"]} for a in db["admins"]] if me else [],
        "adminCount": len(db["admins"]),
        "maxAdmins": MAX_ADMINS,
        "me": {"id": me["id"], "name": me["name"]} if me else None,
    }


def err(msg, code=400):
    return jsonify(error=msg), code


def json_body():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


# antifuerza bruta: 8 intentos fallidos por IP cada 5 minutos
_fails = {}


def _blocked(ip):
    now = time.time()
    _fails[ip] = [t for t in _fails.get(ip, []) if now - t < 300]
    return len(_fails[ip]) >= 8


# ---------- API ----------
@app.get("/api/state")
def get_state():
    with lock:
        return jsonify(payload(load()))


@app.post("/api/login")
def login():
    d = json_body()
    name = str(d.get("user", "")).strip()[:30]
    pw = str(d.get("password", ""))
    if not name or not pw:
        return err("Faltan datos")
    ip = request.remote_addr or "?"
    with lock:
        db = load()
        if not db["admins"]:  # primer administrador
            if len(pw) < 4:
                return err("La contraseña debe tener al menos 4 caracteres")
            a = {"id": uuid.uuid4().hex[:8], "name": name, "hash": generate_password_hash(pw)}
            db["admins"].append(a)
            store(db)
        else:
            if _blocked(ip):
                return err("Demasiados intentos. Espera unos minutos.", 429)
            a = next((x for x in db["admins"] if x["name"].lower() == name.lower()), None)
            if not a or not check_password_hash(a["hash"], pw):
                _fails.setdefault(ip, []).append(time.time())
                return err("Usuario o contraseña incorrectos", 401)
        session.clear()
        session.permanent = True
        session["admin"] = a["id"]
        return jsonify(payload(db))


@app.post("/api/logout")
def logout():
    session.clear()
    with lock:
        return jsonify(payload(load()))


@app.put("/api/state")
def put_state():
    d = json_body()
    st = clean_state(d.get("state"))
    if st is None:
        return err("Datos inválidos")
    with lock:
        db = load()
        if not current_admin(db):
            return err("Solo un administrador puede hacer esto", 403)
        if d.get("rev") != db["rev"]:
            return jsonify(error="conflict", **payload(db)), 409
        db["state"] = st
        db["rev"] += 1
        store(db)
        return jsonify(payload(db))


@app.post("/api/admins")
def add_admin():
    d = json_body()
    name = str(d.get("name", "")).strip()[:30]
    pw = str(d.get("password", ""))
    with lock:
        db = load()
        if not current_admin(db):
            return err("Solo un administrador puede hacer esto", 403)
        if len(db["admins"]) >= MAX_ADMINS:
            return err(f"Máximo {MAX_ADMINS} administradores")
        if not name or len(pw) < 4:
            return err("Usuario requerido y contraseña de al menos 4 caracteres")
        if any(a["name"].lower() == name.lower() for a in db["admins"]):
            return err("Ya existe un administrador con ese nombre")
        db["admins"].append({"id": uuid.uuid4().hex[:8], "name": name, "hash": generate_password_hash(pw)})
        store(db)
        return jsonify(payload(db))


@app.delete("/api/admins/<aid>")
def del_admin(aid):
    with lock:
        db = load()
        me = current_admin(db)
        if not me:
            return err("Solo un administrador puede hacer esto", 403)
        if aid == me["id"]:
            return err("No puedes quitarte a ti mismo")
        if len(db["admins"]) < 2 or not any(a["id"] == aid for a in db["admins"]):
            return err("Administrador no encontrado")
        db["admins"] = [a for a in db["admins"] if a["id"] != aid]
        store(db)
        return jsonify(payload(db))


@app.get("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Torneo en http://localhost:{port}  (otros dispositivos de tu red: http://<IP-de-esta-PC>:{port})")
    app.run(host="0.0.0.0", port=port)
