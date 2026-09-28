# Subdominio del portal público

El portal de reservas público se publica en `https://reservar.foodieia.com.ar/r/<slug-del-restaurante>`.
El workspace de Foodie no se expone desde ese host: Nginx solo deja pasar la ruta de reservas y los recursos estáticos que Next.js necesita.

## Variable de entorno del frontend

En el `.env` de producción del frontend, agregar:

```dotenv
NEXT_PUBLIC_PUBLIC_BOOKING_ORIGIN=https://reservar.foodieia.com.ar
```

La variable se incorpora durante `npm run build`; por eso hay que desplegar o reconstruir el frontend después de agregarla. Sin ella, en desarrollo el enlace conserva la URL actual con `/reservar/<slug>`.

## Nginx en el VPS

Crear `/etc/nginx/sites-available/reservar.foodieia.com.ar` con este contenido. El frontend de Foodie usa el puerto local `3003` según `ecosystem.config.js`.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name reservar.foodieia.com.ar;

    # La URL pública /r/<slug> se resuelve internamente como /reservar/<slug>.
    location ~ ^/r/([a-z0-9-]+)/?$ {
        rewrite ^/r/([a-z0-9-]+)/?$ /reservar/$1 last;
    }

    # También conserva compatibilidad con enlaces /reservar/<slug> ya compartidos.
    location ^~ /reservar/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Recursos requeridos para renderizar la página pública.
    location ^~ /_next/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /favicon.ico { proxy_pass http://127.0.0.1:3003; }
    location = /icon.png { proxy_pass http://127.0.0.1:3003; }
    location = /apple-icon.png { proxy_pass http://127.0.0.1:3003; }

    # No publicar el resto de la aplicación en este dominio.
    location / { return 404; }
}
```

Habilitar y validar antes de recargar:

```bash
sudo ln -s /etc/nginx/sites-available/reservar.foodieia.com.ar /etc/nginx/sites-enabled/reservar.foodieia.com.ar
sudo nginx -t
sudo systemctl reload nginx
```

Cuando `dig +short reservar.foodieia.com.ar` devuelva la IP pública del VPS, emitir el certificado:

```bash
sudo certbot --nginx -d reservar.foodieia.com.ar
sudo nginx -t
sudo systemctl reload nginx
```

## Verificación posterior

```bash
curl -I https://reservar.foodieia.com.ar/r/<slug-del-restaurante>
curl -I https://reservar.foodieia.com.ar/panel
```

La primera llamada debe devolver `200`; la segunda, `404`.
