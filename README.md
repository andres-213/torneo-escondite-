# Torneo de Escondite en Parejas

Una sola página (`index.html`, con CSS y JS dentro) para GitHub Pages. Los datos se guardan en Firebase Realtime Database, así todos ven la misma tabla (se actualiza sola cada 5 s). Solo quien tiene la clave de administrador puede editar.

## Publicar
1. Crea un proyecto en https://console.firebase.google.com → **Realtime Database** → Crear base de datos.
2. En la pestaña **Reglas** pon `{ "rules": { ".read": true, ".write": true } }` y publica.
3. Copia la URL de la base (`https://xxxx-default-rtdb.firebaseio.com`) y pégala en `DB_URL` dentro de `index.html`.
4. En GitHub: Settings → Pages → Branch `main` / `(root)` → Save.

## Seguridad
La clave de administrador se valida en el navegador y su hash vive en la base, con reglas abiertas. Sirve para evitar ediciones accidentales, no para frenar a alguien que sepa programar.

## Reglas de puntaje (index.html → scoreRound)
- Sobrevive la pareja +5 · Sobrevive 1 solo +2 (si es el único tripulante vivo de la ronda: +5)
- Kill +3 c/u · Kill a todos +20 y recompensa +10
- Skeld: pareja +10 · solo +5 · participó +1
