# Torneo de Escondite en Parejas

Servidor en Python (Flask) + web en HTML/CSS/JS. Todos los que abran el enlace ven la misma tabla en vivo (se actualiza sola cada 5 s); solo los administradores pueden editar.

## Estructura
- `server.py` — servidor y API: guarda el torneo en `data/torneo.json`, login de administradores (contraseñas con hash, sesión por cookie), máximo 3 admins.
- `public/` — la web (`index.html`, `css/styles.css`, `js/app.js` con el cálculo de puntos).

## Ejecutar en tu PC
```
pip install -r requirements.txt
python server.py
```
Abre http://localhost:5000. Desde otros dispositivos de tu misma red: `http://<IP-de-tu-PC>:5000`.
La primera vez, pulsa **Crear administrador**: ese será el primer admin y desde ahí puedes agregar hasta 2 más.

## Tener un enlace público para mandar
- **Hosting (recomendado):** subir esta carpeta a PythonAnywhere (gratis, conserva los archivos), Render o Railway. Comando de inicio: `gunicorn server:app` (ya está el `Procfile`). Variables opcionales: `SECRET_KEY` (texto largo aleatorio), `HTTPS=1` si el sitio usa https, `DATA_DIR` (carpeta con disco persistente donde guardar `torneo.json`).
  En hosts con disco temporal (p. ej. plan gratis de Render) los datos se pierden al reiniciar: usa un disco persistente.
- **Temporal desde tu PC:** con el servidor corriendo, `cloudflared tunnel --url http://localhost:5000` te da un enlace https público mientras tu PC siga encendida.

## Reglas de puntaje (public/js/app.js → scoreRound)
- Sobrevive la pareja +5 · Sobrevive 1 solo +2 (si es el único tripulante vivo de la ronda: +5)
- Kill +3 c/u · Kill a todos +20 y recompensa +10
- Skeld: pareja +10 · solo +5 · participó +1
