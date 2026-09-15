# 💵 PriceVision AI - Backend & UI

Aplicación construida en **Node.js y Express** con una **interfaz web moderna y responsiva** que permite tomar fotos con la cámara o subir imágenes de productos/etiquetas de precios para realizar conversiones automáticas entre **Dólares (USD)** y **Bolívares (VES)** usando los modelos multimodales y económicos de **Google Gemini** (`gemini-2.5-flash`, `gemini-3.7-flash`, etc.).

---

## 🚀 Características Principales

- 📸 **Captura con Cámara en Vivo**: Usa la webcam o cámara del teléfono móvil (frontal / trasera con `facingMode: environment`) con disparo instantáneo y efecto flash.
- 📁 **Subida Drag & Drop y Portapapeles**: Arrastra imágenes o pégalas directamente con `Ctrl + V`.
- 🤖 **Visión por IA con Google Gemini**: Reconocimiento de texto, detección de precios en etiquetas y cálculo de conversión estructurado.
- ⚡ **Modelo Económico y Rápido**: Configurado por defecto con `gemini-2.5-flash` para mínimo costo por token y máxima velocidad.
- 🇻🇪 **Sincronización con Tasas del BCV**: Conexión con el servicio oficial de tasas o uso de tasa personalizada.
- 🎨 **Interfaz de Usuario de Alta Fidelidad**: Diseño moderno en tema oscuro con Glassmorphism, animaciones de escaneo láser y adaptabilidad móvil.

---

## 📦 Instalación y Ejecución

1. Entra en la carpeta `backend`:
   ```bash
   cd backend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. (Opcional) Configura tu clave de Gemini en el archivo `.env`:
   ```env
   PORT=5000
   GEMINI_API_KEY=tu_api_key_aqui
   DEFAULT_GEMINI_MODEL=gemini-2.5-flash
   BCV_API_URL=http://localhost:3003/api/v1/tipo-cambio
   ```
   > *Nota: También puedes ingresar la API Key directamente desde el botón de configuración (⚙️) en la interfaz web.*

4. Inicia el servidor:
   ```bash
   npm start
   ```

5. Abre en tu navegador:
   ```
   http://localhost:5000
   ```

---

## 📡 Endpoints de la API REST

- `GET /api/rates`: Devuelve la tasa de cambio actual del BCV.
- `GET /api/health`: Estado de salud del servidor y verificación de API key en `.env`.
- `POST /api/convert-image`: Procesa una imagen (multipart o base64) con Gemini y devuelve los precios detectados y convertidos en JSON.
