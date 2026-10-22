# Torneo de Escondite en Parejas

Una sola página (`index.html`, con CSS y JS dentro) para GitHub Pages. Los datos se guardan en Firebase Realtime Database, así todos ven la misma tabla (se actualiza sola cada 5 s). Hay un único administrador (usuario + clave) que se crea una sola vez; el resto ve la tabla y los cambios en tiempo real.

## Publicar
1. Crea un proyecto en https://console.firebase.google.com → **Realtime Database** → Crear base de datos.
2. En la pestaña **Reglas** pega esto y publica:
   ```
   { "rules": { ".read": true, "torneo": { ".write": true }, "admin": { ".write": "!data.exists()" } } }
   ```
   Así el administrador solo se puede crear una vez y nadie lo puede reemplazar.
3. Copia la URL de la base (`https://xxxx-default-rtdb.firebaseio.com`) y pégala en `DB_URL` dentro de `index.html`.
4. En GitHub: Settings → Pages → Branch `main` / `(root)` → Save.

## Seguridad
El usuario y la clave se validan en el navegador (la clave se guarda con hash PBKDF2). Las reglas impiden reemplazar al administrador, pero el torneo en sí es editable por quien conozca la URL de la base: sirve para evitar ediciones accidentales, no para frenar a alguien que sepa programar. Para reiniciar el administrador, borra el nodo `admin` en la consola de Firebase.

## Reglas de puntaje (index.html → scoreRound)
- Sobrevive la pareja +5 · Sobrevive 1 solo +2 (si es el único tripulante vivo de la ronda: +5)
- Kill +3 c/u · Kill a todos +20 y recompensa +10
- Skeld: pareja +10 · solo +5 · participó +1
