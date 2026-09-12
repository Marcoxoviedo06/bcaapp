# BCA Tourism API

Backend inicial para **Barrancabermeja City App**, basado en el prototipo compartido. No requiere dependencias externas: usa Node.js y una base de datos JSON local para facilitar el arranque.

## Ejecutar con Docker

1. Instala Docker Desktop y asegúrate de que esté iniciado.
2. Copia `.env.example` a `.env`.
3. En `.env`, reemplaza `JWT_SECRET` por una clave larga, aleatoria y privada. No uses la clave de ejemplo en producción.
4. Desde esta carpeta ejecuta:

   ```bash
   docker compose up --build -d
   ```

La API queda disponible en `http://localhost:3000` y puedes verificarla en `http://localhost:3000/health`.

Los datos se conservan en el volumen de Docker `api-data`, incluso si el contenedor se recrea. Para detenerla usa `docker compose down`. Para borrar también los datos, usa `docker compose down -v`.

Si el puerto 3000 está ocupado, agrega `PORT=3001` en `.env` y usa `http://localhost:3001`.

El archivo `Dockerfile` permite construirla también sin Compose:

```bash
docker build -t barrancabermeja-api .
docker run --rm -p 3000:3000 --env-file .env -v bca_api_data:/app/data barrancabermeja-api
```

> La API también entrega el prototipo web incluido en `/`; los endpoints de la API permanecen en las rutas descritas abajo.

Como ejecutar:

1. Instala Node.js 20 o posterior desde https://nodejs.org/.
2. Abre una terminal dentro de esta carpeta.
3. Ejecuta `npm start`. En Windows PowerShell, si aparece un mensaje sobre scripts bloqueados, ejecuta `npm.cmd start`.

La aplicación y la API quedarán disponibles en `http://localhost:3000`.

No se necesitan instalaciones adicionales: el proyecto usa únicamente módulos incluidos en Node.js. 

El archivo `.env` es opcional, si se desea, se puede copiar desde `.env.example` y cambiar `JWT_SECRET`.

Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Estado del servicio |
| POST | `/auth/register` | Crear cuenta (`name`, `email`, `password`) |
| POST | `/auth/login` | Iniciar sesión (`email`, `password`) |
| GET / POST | `/users` | Consultar el perfil autenticado o crear un usuario |
| GET / PUT / DELETE | `/users/:id` | Consultar, actualizar o eliminar el propio usuario |
| GET / POST | `/products` | Consultar o crear productos y servicios |
| GET / PUT / DELETE | `/products/:id` | Consultar, actualizar o eliminar un producto/servicio |
| GET | `/categories` | Categorías del menú |
| GET | `/places?q=&category=` | Listado y búsqueda de lugares |
| GET | `/places/:id` | Ficha de un lugar |
| POST | `/places/:id/reviews` | Crear reseña autenticada |
| GET | `/me/favorites` | Favoritos del usuario |
| POST / DELETE | `/me/favorites/:placeId` | Agregar o retirar favorito |

Las rutas privadas usan el encabezado `Authorization: Bearer <token>`.

## CRUD y autenticación

`POST /auth/register` y `POST /users` crean una cuenta; ambos reciben `name`, `email` y `password` (mínimo 8 caracteres) y devuelven un token. `POST /auth/login` valida las credenciales y devuelve un token que habilita las operaciones privadas.

Para modificar o eliminar un usuario se debe autenticar el mismo usuario. Los productos y servicios admiten `name`, `description`, `price`, `type` (`product` o `service`), `imageUrl` y `categoryId`; cualquiera puede consultarlos, mientras que crear, editar y eliminar requiere autenticación y solo puede hacerlo su creador.

Conexión con el frontend

Configura la URL base como `http://localhost:3000`. Por ejemplo, para las tarjetas de restaurantes:

js
const response = await fetch('http://localhost:3000/places?category=restaurants');
const { data: places } = await response.json();
