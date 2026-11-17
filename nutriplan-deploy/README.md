# Nutriplan en tu teléfono

## 1. Subir a GitHub
1. Crea un repositorio nuevo (puede ser privado).
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio: `index.html`, `sw.js`, `manifest.webmanifest`, los iconos, `vercel.json` y la carpeta `api/`.

## 2. Publicar en Vercel
1. En vercel.com → **Add New → Project** → importa el repositorio.
2. Framework: **Other**. No hace falta comando de build ni carpeta de salida.
3. En **Settings → Environment Variables** añade:
   - `ANTHROPIC_API_KEY` = tu clave de console.anthropic.com (necesaria para el escáner y "Estimar con IA").
   - `APP_PASSWORD` = una contraseña cualquiera (recomendado: evita que otros usen tu clave si encuentran la URL). La app la pide una sola vez.
4. **Deploy**. Si añades las variables después, vuelve a desplegar.

## 3. Instalar en el iPhone
1. Abre la URL de Vercel en **Safari** (no en Chrome ni dentro de otra app).
2. Compartir → **Añadir a pantalla de inicio**.
3. Abre siempre Nutriplan desde ese icono: así iOS no borra tus datos por inactividad y se ve a pantalla completa.

En Android: Chrome → menú → **Instalar app**.

## Tus datos
- Todo se guarda solo en tu teléfono (perfil, diario, entrenos, fotos). No hay servidor de datos.
- Los datos de la vista previa de diseño **no** se copian solos: en Perfil → Exportar respaldo y luego Importar en el teléfono. El respaldo no incluye las fotos de progreso.
- Si borras los datos de Safari o desinstalas el icono, se pierden. Exporta un respaldo de vez en cuando.

## Actualizar
Sube el nuevo `index.html` al repositorio; Vercel lo publica solo y la app se actualiza al volver a abrirla con conexión.
