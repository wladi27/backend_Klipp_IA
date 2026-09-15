require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4002;
const BCV_API_URL = process.env.BCV_API_URL || 'http://localhost:3003/api/v1/tipo-cambio';
const DEFAULT_MODEL = process.env.DEFAULT_GEMINI_MODEL || 'gemini-3.5-flash-lite';

// Configuración de Multer (Almacenamiento en Memoria para procesamiento rápido)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB límite
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Cache local de tasa para evitar demoras
let cachedRate = {
  usd: 813.74,
  eur: 945.65,
  usdt: 956.80,
  date: new Date().toISOString().split('T')[0],
  source: 'Estimación inicial',
  lastFetched: 0
};

/**
 * Función auxiliar para obtener la tasa de cambio oficial más reciente
 */
async function fetchLatestExchangeRate() {
  const now = Date.now();
  // Cache de 5 minutos
  if (now - cachedRate.lastFetched < 5 * 60 * 1000 && cachedRate.usd) {
    return cachedRate;
  }

  try {
    const response = await axios.get(BCV_API_URL, { timeout: 3500 });
    if (response.data && response.data.success && response.data.prices) {
      cachedRate = {
        usd: Number(response.data.prices.usd_bs) || cachedRate.usd,
        eur: Number(response.data.prices.eur_bs) || cachedRate.eur,
        usdt: Number(response.data.prices.usdt_bs) || Number(response.data.prices.usd_bs * 1.175),
        date: response.data.date || new Date().toISOString().split('T')[0],
        source: response.data.source || 'Banco Central de Venezuela (BCV)',
        lastFetched: now
      };
      return cachedRate;
    }
  } catch (err) {
    console.warn('⚠️ No se pudo conectar a la API local de tasas:', err.message);
  }

  // Intento de respaldo secundario (Binance P2P directo)
  try {
    const binanceP2P = await axios.post(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
        asset: 'USDT',
        fiat: 'VES',
        merchantCheck: false,
        page: 1,
        rows: 5,
        tradeType: 'BUY'
      },
      { timeout: 3000 }
    );

    if (binanceP2P.data?.data?.length > 0) {
      const prices = binanceP2P.data.data.map(d => parseFloat(d.adv.price)).filter(p => !isNaN(p) && p > 0);
      if (prices.length > 0) {
        const usdtVal = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
        const usdVal = cachedRate.usd || 813.74;
        cachedRate = {
          usd: usdVal,
          eur: Math.round(usdVal * 1.16 * 100) / 100,
          usdt: usdtVal,
          date: new Date().toISOString().split('T')[0],
          source: 'BCV Oficial & Binance P2P',
          lastFetched: now
        };
        return cachedRate;
      }
    }
  } catch (backupErr) {
    // Continuar con la tasa en caché
  }

  return cachedRate;
}

/**
 * Función para llamar a Gemini con visión multimodal
 */
async function callGeminiVision({ apiKey, model, imageBase64, mimeType, exchangeRate, mode }) {
  const chosenModel = model || DEFAULT_MODEL;
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('No se ha configurado la Gemini API Key. Por favor proporciónala en la UI o en el archivo .env.');
  }

  const prompt = `
Eres un asistente experto en Visión Artificial (OCR) y análisis de precios comerciales en Venezuela.
Tu tarea es analizar la imagen provista (puede ser una foto de un producto, etiqueta de precio, factura, menú, vitrina, estante o carrito) y extraer todos los precios y productos visibles, convirtiéndolos entre Dólares (USD) y Bolívares (VES).

DATOS DE CONVERSIÓN:
- Tasa de cambio oficial de referencia: 1 USD = ${exchangeRate} VES.
- Modo de conversión solicitado: "${mode}" (Valores posibles: "AUTO", "USD_TO_VES", "VES_TO_USD").

INSTRUCCIONES CLAVE:
1. Detecta todos los productos, etiquetas o precios presentes en la imagen.
2. Identifica la moneda original de cada precio:
   - "USD": si tiene $, USD, Ref, $, $, verdes, dólares, o precios típicos expresados como referencia en divisa.
   - "VES": si tiene Bs, Bs.D, Bs.S, Bolívares, bolos o números de escala local en bolívares.
   - Si no tiene símbolo pero el contexto o el modo lo indica, infiere según la magnitud del número o el modo seleccionado.
3. Si el modo es "USD_TO_VES", asume que el precio base está en USD y conviértelo a VES multiplicando por ${exchangeRate}.
4. Si el modo es "VES_TO_USD", asume que el precio base está en VES y conviértelo a USD dividiendo entre ${exchangeRate}.
5. Si el modo es "AUTO", convierte de USD a VES si la etiqueta está en USD, o de VES a USD si está en VES.
6. Redondea los resultados a 2 decimales para USD y 2 decimales para VES.
7. Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta (sin formato Markdown, sin comillas triples \`\`\`json):

{
  "detected_currency": "USD" | "VES" | "MIXED" | "UNKNOWN",
  "exchange_rate_applied": ${exchangeRate},
  "conversion_mode": "${mode}",
  "products": [
    {
      "name": "Nombre o descripción del producto o ítem detectado",
      "original_price": 10.50,
      "original_currency": "USD",
      "converted_price": 572.25,
      "converted_currency": "VES",
      "formatted_original": "$ 10.50",
      "formatted_converted": "Bs. 572.25",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "tag_details": "Texto complementario o detalles de la etiqueta"
    }
  ],
  "total_original": 10.50,
  "total_converted": 572.25,
  "summary_notes": "Breve resumen en español de lo detectado",
  "raw_text_detected": "Texto relevante que se leyó en la imagen"
}
`;

  const modelsToTry = [chosenModel];
  if (!modelsToTry.includes('gemini-3.5-flash-lite')) modelsToTry.push('gemini-3.5-flash-lite');
  if (!modelsToTry.includes('gemini-flash-lite-latest')) modelsToTry.push('gemini-flash-lite-latest');
  if (!modelsToTry.includes('gemini-3.6-flash')) modelsToTry.push('gemini-3.6-flash');

  let lastError = null;

  for (const currentModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    try {
      console.log(`📡 Consultando modelo de Gemini: ${currentModel}...`);
      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 segundos de margen
      });

      const candidates = response.data?.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('Gemini no generó ninguna respuesta para la imagen.');
      }

      const textResponse = candidates[0].content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('La respuesta de Gemini está vacía.');
      }

      // Limpiar posibles delimitadores markdown
      let cleaned = textResponse.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/g, '').trim();
      }

      const parsedJson = JSON.parse(cleaned);
      parsedJson._modelUsed = currentModel;
      return parsedJson;

    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.warn(`⚠️ Intento con modelo ${currentModel} falló: ${errMsg}`);
      lastError = error;
      // Si el error es de clave inválida, no reintentamos otros modelos
      if (error.response?.data?.error?.code === 400 && errMsg.includes('API_KEY_INVALID')) {
        throw new Error(`Google Gemini Error: API Key no válida.`);
      }
    }
  }

  if (lastError?.response?.data?.error) {
    const gError = lastError.response.data.error;
    throw new Error(`Google Gemini Error (${gError.code || 'API'}): ${gError.message}`);
  }
  throw lastError || new Error('No se pudo procesar la imagen con ninguno de los modelos de Gemini.');
}

// ==========================================
// ENDPOINTS DE LA API
// ==========================================

// 1. Obtener tasas de cambio actuales
app.get('/api/rates', async (req, res) => {
  try {
    const rates = await fetchLatestExchangeRate();
    return res.json({
      success: true,
      rate: rates.usd,
      rates: rates
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Error al consultar tasas de cambio',
      message: err.message
    });
  }
});

// 2. Health check & Configuración pública
app.get('/api/health', (req, res) => {
  const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  res.json({
    status: 'online',
    defaultModel: DEFAULT_MODEL,
    hasServerApiKey: hasEnvKey,
    timestamp: new Date().toISOString()
  });
});

// 3. Procesamiento y conversión de imagen con Gemini
app.post('/api/convert-image', upload.single('image'), async (req, res) => {
  try {
    let imageBase64 = '';
    let mimeType = 'image/jpeg';

    // 1. Verificar si viene por multipart/form-data (archivo)
    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    }
    // 2. O si viene por base64 en JSON body (por ejemplo de la cámara web)
    else if (req.body.imageBase64) {
      let rawBase64 = req.body.imageBase64;
      if (rawBase64.includes(';base64,')) {
        const parts = rawBase64.split(';base64,');
        mimeType = parts[0].replace('data:', '');
        imageBase64 = parts[1];
      } else {
        imageBase64 = rawBase64;
        mimeType = req.body.mimeType || 'image/jpeg';
      }
    }

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'No se recibió ninguna imagen. Sube un archivo o envía imageBase64.'
      });
    }

    // Parámetros adicionales
    const apiKey = req.headers['x-gemini-api-key'] || req.body.apiKey || process.env.GEMINI_API_KEY;
    const model = req.body.model || DEFAULT_MODEL;
    const mode = req.body.mode || 'AUTO'; // AUTO, USD_TO_VES, VES_TO_USD

    // Tasa de cambio: personalizada por el usuario o la oficial del BCV
    let exchangeRate = parseFloat(req.body.exchangeRate);
    if (!exchangeRate || isNaN(exchangeRate) || exchangeRate <= 0) {
      const currentRates = await fetchLatestExchangeRate();
      exchangeRate = currentRates.usd;
    }

    console.log(`🔍 Procesando imagen con Gemini [Modelo: ${model}, Tasa: ${exchangeRate}, Modo: ${mode}]...`);

    const result = await callGeminiVision({
      apiKey,
      model,
      imageBase64,
      mimeType,
      exchangeRate,
      mode
    });

    return res.json({
      success: true,
      data: result,
      modelUsed: model,
      rateUsed: exchangeRate
    });

  } catch (error) {
    console.error('❌ Error en /api/convert-image:', error.message);
    return res.status(500).json({
      success: false,
      error: 'GeminiProcessingError',
      message: error.message || 'Error procesando la imagen con Gemini'
    });
  }
});

// Rutas de fallback para UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Exportar app para entornos Serverless (Vercel)
module.exports = app;

// Iniciar servidor local
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🌟 PRICEVISION AI - CONVERSOR DE PRECIOS CON GEMINI');
    console.log('='.repeat(60));
    console.log(`🚀 Servidor y UI disponibles en: http://localhost:${PORT}`);
    console.log(`🤖 Modelo por defecto:           ${DEFAULT_MODEL}`);
    console.log(`🔗 API Tasas BCV:                ${BCV_API_URL}`);
    console.log('='.repeat(60));
  });
}
