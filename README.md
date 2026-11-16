# OMC Downloader

Aplicación de escritorio con Electron para descargar audio con yt-dlp. La descarga conserva el mejor audio disponible en la fuente y evita convertirlo a MP3/FLAC por defecto.

## Plataformas

- YouTube y sus listas.
- Bandcamp, incluidas las páginas de álbumes.
- Spotify está desactivado; no se descarga audio desde ese servicio.

Puedes elegir una portada personalizada al crear una descarga o editar sus metadatos. Si el contenedor de audio no admite portadas incrustadas, la imagen se guarda junto al audio.

## Publicar y actualizar desde GitHub Releases

El publicador genera el instalador de Windows y los metadatos de actualización de `electron-updater`. Configura el repositorio y un token de GitHub con permisos para publicar releases antes de ejecutar:

```powershell
$env:GH_REPOSITORY = "propietario/repositorio"
$env:GH_TOKEN = "tu-token-de-github"
npm run release
```

Los instaladores deben publicarse como assets de la release. Las aplicaciones instaladas detectan y descargan automáticamente nuevas versiones; desde el pie de la ventana también se puede comprobar manualmente. Sin `GH_REPOSITORY`, los builds locales siguen funcionando, pero el actualizador de la aplicación queda desactivado.

## Desarrollo

```powershell
npm install
npm start
```
