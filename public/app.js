/**
 * ==========================================================================
 * PRICEVISION AI - FRONTEND CONTROLLER (Node + Express + Gemini)
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // ========================================================================
  // ESTADO GLOBAL DE LA APLICACIÓN
  // ========================================================================
  const state = {
    officialRate: 54.50,
    activeRate: 54.50,
    conversionMode: 'AUTO', // 'AUTO' | 'USD_TO_VES' | 'VES_TO_USD'
    geminiApiKey: localStorage.getItem('pricevision_gemini_key') || '',
    geminiModel: localStorage.getItem('pricevision_gemini_model') || 'gemini-3.5-flash-lite',
    cameraStream: null,
    facingMode: 'environment', // 'environment' (trasera) o 'user' (frontal)
    currentImageBase64: null,
    currentImageMimeType: 'image/jpeg',
    serverHealth: null,
    lastAnalysisResult: null
  };

  // ========================================================================
  // ELEMENTOS DEL DOM
  // ========================================================================
  // Header & Rate
  const tickerRateVal = document.getElementById('tickerRateVal');
  const btnRefreshRate = document.getElementById('btnRefreshRate');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const headerKeyDot = document.getElementById('headerKeyDot');
  const modelBadge = document.getElementById('modelBadge');
  const badgeModelName = document.getElementById('badgeModelName');

  // Controls Bar
  const modeSelector = document.getElementById('modeSelector');
  const inputCustomRate = document.getElementById('inputCustomRate');
  const btnSyncOfficialRate = document.getElementById('btnSyncOfficialRate');

  // Tabs & Views
  const tabCamera = document.getElementById('tabCamera');
  const tabUpload = document.getElementById('tabUpload');
  const viewCamera = document.getElementById('viewCamera');
  const viewUpload = document.getElementById('viewUpload');

  // Camera
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraCanvas = document.getElementById('cameraCanvas');
  const cameraFlash = document.getElementById('cameraFlash');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const btnStartCamera = document.getElementById('btnStartCamera');
  const btnCapturePhoto = document.getElementById('btnCapturePhoto');
  const btnSwitchCamera = document.getElementById('btnSwitchCamera');
  const btnStopCamera = document.getElementById('btnStopCamera');

  // Upload & Drag-Drop
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  // Preview
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');
  const scanLaser = document.getElementById('scanLaser');
  const btnClearPreview = document.getElementById('btnClearPreview');
  const btnProcessPreview = document.getElementById('btnProcessPreview');

  // Results
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const loadingStatusText = document.getElementById('loadingStatusText');
  const resultsRendered = document.getElementById('resultsRendered');
  const resultsActions = document.getElementById('resultsActions');
  const sumTotalOriginal = document.getElementById('sumTotalOriginal');
  const sumTotalConverted = document.getElementById('sumTotalConverted');
  const resRateApplied = document.getElementById('resRateApplied');
  const resModeApplied = document.getElementById('resModeApplied');
  const detectedItemsCount = document.getElementById('detectedItemsCount');
  const productsList = document.getElementById('productsList');
  const analysisNotesText = document.getElementById('analysisNotesText');
  const rawTextBox = document.getElementById('rawTextBox');
  const btnCopyResults = document.getElementById('btnCopyResults');

  // Modal Settings
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const inputApiKey = document.getElementById('inputApiKey');
  const selectGeminiModel = document.getElementById('selectGeminiModel');
  const btnToggleApiKey = document.getElementById('btnToggleApiKey');
  const serverStatusBadge = document.getElementById('serverStatusBadge');
  const serverKeyStatus = document.getElementById('serverKeyStatus');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // Quick Samples Buttons
  const sampleButtons = document.querySelectorAll('.sample-btn');

  // ========================================================================
  // INICIALIZACIÓN
  // ========================================================================
  function init() {
    // Configurar inputs de settings iniciales
    inputApiKey.value = state.geminiApiKey;
    selectGeminiModel.value = state.geminiModel;
    badgeModelName.textContent = state.geminiModel;
    updateKeyStatusIndicator();

    // Consultar tasas y salud del backend
    fetchExchangeRates();
    checkServerHealth();

    // Registrar Event Listeners
    setupEventListeners();
  }

  // ========================================================================
  // NOTIFICACIONES TOAST
  // ========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ========================================================================
  // GESTIÓN DE TASAS Y BACKEND HEALTH
  // ========================================================================
  async function fetchExchangeRates() {
    try {
      tickerRateVal.textContent = '...';
      const res = await fetch('/api/rates');
      const data = await res.json();

      if (data.success && data.rate) {
        state.officialRate = Number(data.rate);
        state.activeRate = Number(data.rate);
        tickerRateVal.textContent = state.officialRate.toFixed(2);
        inputCustomRate.value = state.officialRate.toFixed(2);
      } else {
        tickerRateVal.textContent = state.officialRate.toFixed(2);
        inputCustomRate.value = state.officialRate.toFixed(2);
      }
    } catch (err) {
      console.warn('No se pudo conectar al endpoint de tasas:', err);
      tickerRateVal.textContent = state.officialRate.toFixed(2);
      inputCustomRate.value = state.officialRate.toFixed(2);
    }
  }

  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      state.serverHealth = data;

      if (data.status === 'online') {
        serverStatusBadge.textContent = 'En línea';
        serverStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        serverStatusBadge.style.color = '#34d399';

        if (data.hasServerApiKey) {
          serverKeyStatus.textContent = 'Configurada en .env';
          serverKeyStatus.style.color = '#34d399';
        } else {
          serverKeyStatus.textContent = 'No configurada (Requiere clave en UI)';
          serverKeyStatus.style.color = '#f59e0b';
        }
      }
      updateKeyStatusIndicator();
    } catch (err) {
      serverStatusBadge.textContent = 'Desconectado';
      serverStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      serverStatusBadge.style.color = '#f87171';
    }
  }

  function updateKeyStatusIndicator() {
    const hasKey = Boolean(state.geminiApiKey || (state.serverHealth && state.serverHealth.hasServerApiKey));
    if (hasKey) {
      headerKeyDot.classList.add('active');
      headerKeyDot.title = 'Gemini API Key activa';
    } else {
      headerKeyDot.classList.remove('active');
      headerKeyDot.title = 'Falta configurar Gemini API Key';
    }
  }

  // ========================================================================
  // CONTROL DE CÁMARA WEB
  // ========================================================================
  async function startCamera() {
    try {
      if (state.cameraStream) {
        stopCamera();
      }

      const constraints = {
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.cameraStream = stream;
      cameraVideo.srcObject = stream;
      await cameraVideo.play();

      cameraPlaceholder.style.display = 'none';
      btnCapturePhoto.disabled = false;
      showToast('Cámara iniciada correctamente', 'success');
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      showToast(`No se pudo acceder a la cámara: ${err.message}`, 'error');
      cameraPlaceholder.style.display = 'flex';
      btnCapturePhoto.disabled = true;
    }
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
      cameraVideo.srcObject = null;
    }
    cameraPlaceholder.style.display = 'flex';
    btnCapturePhoto.disabled = true;
  }

  function switchCamera() {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    if (state.cameraStream) {
      startCamera();
    }
  }

  function capturePhoto() {
    if (!state.cameraStream || !cameraVideo.videoWidth) {
      showToast('Enciende la cámara antes de capturar', 'error');
      return;
    }

    // Animación de flash
    cameraFlash.classList.add('flash-active');
    setTimeout(() => cameraFlash.classList.remove('flash-active'), 150);

    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;

    cameraCanvas.width = videoWidth;
    cameraCanvas.height = videoHeight;

    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, videoWidth, videoHeight);

    const base64Data = cameraCanvas.toDataURL('image/jpeg', 0.92);
    setPreviewImage(base64Data, 'image/jpeg');

    // Detener la cámara temporalmente para ahorrar batería y recursos
    stopCamera();
    showToast('Foto capturada con éxito', 'success');
  }

  // ========================================================================
  // GESTIÓN DE VISTA PREVIA, ARCHIVOS Y OPTIMIZACIÓN
  // ========================================================================
  function optimizeImage(dataUrlOrFile, maxWidth = 1400, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar manteniendo proporción si es muy grande
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl: optimizedDataUrl, mimeType: 'image/jpeg', width, height });
      };

      if (typeof dataUrlOrFile === 'string') {
        img.src = dataUrlOrFile;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(dataUrlOrFile);
      }
    });
  }

  async function setPreviewImage(dataUrl, mimeType = 'image/jpeg') {
    // Optimizar imagen para envío ultra rápido a Gemini
    const optimized = await optimizeImage(dataUrl, 1400, 0.85);
    state.currentImageBase64 = optimized.dataUrl;
    state.currentImageMimeType = optimized.mimeType;
    previewImage.src = optimized.dataUrl;
    previewContainer.style.display = 'flex';
    viewCamera.style.display = 'none';
    viewUpload.style.display = 'none';
  }

  function clearPreview() {
    state.currentImageBase64 = null;
    previewImage.src = '';
    previewContainer.style.display = 'none';

    // Volver a la pestaña activa
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    if (activeTab === 'camera') {
      viewCamera.style.display = 'flex';
      viewUpload.style.display = 'none';
    } else {
      viewCamera.style.display = 'none';
      viewUpload.style.display = 'flex';
    }
  }

  async function handleFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido', 'error');
      return;
    }

    showToast(`Optimizando "${file.name}" para análisis...`, 'info');
    const optimized = await optimizeImage(file, 1400, 0.85);
    setPreviewImage(optimized.dataUrl, optimized.mimeType);
    showToast('Imagen lista para escanear', 'success');
  }

  // ========================================================================
  // GENERADOR DE ETIQUETAS DE MUESTRA (DEMO CANVAS)
  // ========================================================================
  function generateSampleImage(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');

    // Fondo estilo etiqueta de supermercado
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Marco
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px sans-serif';

    if (type === 'groceries') {
      ctx.fillText('SUPERMERCADO CENTRAL', 50, 70);
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.fillText('CREMA DE AVELLANAS NUTELLA 750G', 50, 130);

      // Código de barras simulado
      ctx.fillStyle = '#0f172a';
      for (let i = 0; i < 40; i++) {
        const w = (i % 3 === 0) ? 6 : (i % 2 === 0 ? 3 : 2);
        ctx.fillRect(50 + (i * 12), 170, w, 60);
      }

      // Precio Grande en Dólares
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 90px monospace';
      ctx.fillText('$ 12.50', 50, 340);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('PRECIO EN DIVISA (REF)', 50, 390);

      ctx.font = '18px sans-serif';
      ctx.fillText('Pagadero en Bolívares a la tasa oficial del día', 50, 440);
    } else if (type === 'shoes') {
      ctx.fillText('BOUTIQUE SPORT SHOES', 50, 70);
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.fillText('ZAPATILLAS RUNNING ULTRA BOOST V2', 50, 130);

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 90px monospace';
      ctx.fillText('REF 45.00', 50, 320);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Talla: 42 EUR / 9 US - Color: Negro/Verde', 50, 380);
      ctx.fillText('Garantía de 30 días con factura', 50, 430);
    } else if (type === 'supermarket') {
      ctx.fillText('HIPERMERCADO NACIONAL', 50, 70);
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.fillText('HARINA DE MAÍZ PRECOCIDA PAN 1KG', 50, 130);

      // Precio en Bolívares
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 85px monospace';
      ctx.fillText('Bs. 850.00', 50, 320);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('PRECIO MÁXIMO AL PÚBLICO (PMP)', 50, 380);
      ctx.fillText('IVA Exento / Incluido', 50, 430);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setPreviewImage(dataUrl, 'image/jpeg');
    showToast('Etiqueta de ejemplo cargada', 'info');
  }

  // ========================================================================
  // PROCESAMIENTO CON GOOGLE GEMINI
  // ========================================================================
  async function processImageWithGemini() {
    if (!state.currentImageBase64) {
      showToast('Debes tomar una foto o cargar una imagen primero', 'error');
      return;
    }

    // Verificar si hay API key
    const hasKey = Boolean(state.geminiApiKey || (state.serverHealth && state.serverHealth.hasServerApiKey));
    if (!hasKey) {
      showToast('Por favor ingresa tu Gemini API Key en la configuración ⚙️', 'error');
      settingsModal.style.display = 'flex';
      return;
    }

    // Obtener tasa a aplicar
    const customRate = parseFloat(inputCustomRate.value);
    if (!customRate || isNaN(customRate) || customRate <= 0) {
      state.activeRate = state.officialRate;
      inputCustomRate.value = state.officialRate.toFixed(2);
    } else {
      state.activeRate = customRate;
    }

    // Iniciar UI de Carga
    setScanningState(true);

    try {
      loadingStatusText.textContent = 'Enviando imagen a Google Gemini...';

      const payload = {
        imageBase64: state.currentImageBase64,
        mimeType: state.currentImageMimeType,
        apiKey: state.geminiApiKey || undefined,
        model: state.geminiModel,
        mode: state.conversionMode,
        exchangeRate: state.activeRate
      };

      setTimeout(() => {
        if (loadingState.style.display !== 'none') {
          loadingStatusText.textContent = 'Gemini está reconociendo productos y precios...';
        }
      }, 1500);

      const response = await fetch('/api/convert-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error procesando la imagen con Gemini');
      }

      state.lastAnalysisResult = data.data;
      renderAnalysisResults(data.data, data.modelUsed, data.rateUsed);
      showToast('¡Precios detectados y convertidos con éxito!', 'success');

    } catch (err) {
      console.error('Error en procesamiento Gemini:', err);
      showToast(err.message, 'error');
      setScanningState(false, true); // Regresar al estado anterior
    } finally {
      scanLaser.classList.remove('scanning');
    }
  }

  function setScanningState(isLoading, isError = false) {
    if (isLoading) {
      emptyState.style.display = 'none';
      resultsRendered.style.display = 'none';
      resultsActions.style.display = 'none';
      loadingState.style.display = 'flex';
      scanLaser.classList.add('scanning');
      btnProcessPreview.disabled = true;
    } else {
      loadingState.style.display = 'none';
      btnProcessPreview.disabled = false;
      scanLaser.classList.remove('scanning');

      if (isError) {
        if (state.lastAnalysisResult) {
          resultsRendered.style.display = 'flex';
          resultsActions.style.display = 'flex';
        } else {
          emptyState.style.display = 'flex';
        }
      }
    }
  }

  // ========================================================================
  // RENDERIZADO DE RESULTADOS
  // ========================================================================
  function renderAnalysisResults(result, modelUsed, rateUsed) {
    setScanningState(false);
    emptyState.style.display = 'none';
    loadingState.style.display = 'none';
    resultsRendered.style.display = 'flex';
    resultsActions.style.display = 'flex';

    // 1. Totales
    const totalOrig = result.total_original || 0;
    const totalConv = result.total_converted || 0;
    const detectedCurrency = result.detected_currency || 'USD';

    sumTotalOriginal.textContent = formatMoney(totalOrig, detectedCurrency);
    sumTotalConverted.textContent = formatMoney(totalConv, detectedCurrency === 'USD' ? 'VES' : 'USD');

    // 2. Metadatos
    resRateApplied.textContent = (rateUsed || state.activeRate).toFixed(2);
    resModeApplied.textContent = result.conversion_mode || state.conversionMode;

    // 3. Lista de productos
    const products = result.products || [];
    detectedItemsCount.textContent = products.length;
    productsList.innerHTML = '';

    if (products.length === 0) {
      productsList.innerHTML = `
        <div class="product-card">
          <div class="product-info">
            <span class="product-title">No se identificaron precios específicos</span>
            <span class="product-tag">Intenta enfocar más de cerca la etiqueta</span>
          </div>
        </div>
      `;
    } else {
      products.forEach((prod, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const name = prod.name || `Producto #${index + 1}`;
        const tag = prod.tag_details ? prod.tag_details : `Confianza: ${prod.confidence || 'MEDIA'}`;
        const origFormatted = prod.formatted_original || formatMoney(prod.original_price, prod.original_currency || 'USD');
        const convFormatted = prod.formatted_converted || formatMoney(prod.converted_price, prod.converted_currency || 'VES');

        card.innerHTML = `
          <div class="product-info">
            <span class="product-title">${escapeHtml(name)}</span>
            <span class="product-tag">${escapeHtml(tag)}</span>
          </div>
          <div class="product-price-box">
            <span class="price-original-pill">${escapeHtml(origFormatted)}</span>
            <span class="price-converted-pill">${escapeHtml(convFormatted)}</span>
          </div>
        `;
        productsList.appendChild(card);
      });
    }

    // 4. Notas y texto crudo
    analysisNotesText.textContent = result.summary_notes || 'Análisis completado satisfactoriamente.';
    rawTextBox.textContent = result.raw_text_detected || 'Sin texto adicional detectado.';
  }

  function formatMoney(amount, currency) {
    const num = Number(amount) || 0;
    if (currency === 'VES' || currency === 'Bs') {
      return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ========================================================================
  // COPIAR AL PORTAPAPELES
  // ========================================================================
  function copyResultsToClipboard() {
    if (!state.lastAnalysisResult) return;

    const res = state.lastAnalysisResult;
    let text = `🛍️ *Resumen de Precios - PriceVision AI*\n`;
    text += `📅 Fecha: ${new Date().toLocaleDateString()}\n`;
    text += `💵 Tasa Aplicada: 1 USD = ${state.activeRate.toFixed(2)} VES\n\n`;

    if (res.products && res.products.length > 0) {
      res.products.forEach((p, idx) => {
        text += `${idx + 1}. ${p.name}: ${p.formatted_original} ➔ *${p.formatted_converted}*\n`;
      });
      text += `\n📊 *Total:* ${sumTotalOriginal.textContent} ➔ *${sumTotalConverted.textContent}*`;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast('Resumen copiado al portapapeles', 'success');
    }).catch(() => {
      showToast('No se pudo copiar automáticamente', 'error');
    });
  }

  // ========================================================================
  // EVENT LISTENERS
  // ========================================================================
  function setupEventListeners() {
    // Tasa en vivo
    btnRefreshRate.addEventListener('click', () => {
      btnRefreshRate.style.transform = 'rotate(360deg)';
      btnRefreshRate.style.transition = 'transform 0.5s';
      fetchExchangeRates().then(() => {
        setTimeout(() => {
          btnRefreshRate.style.transform = 'none';
          btnRefreshRate.style.transition = 'none';
        }, 500);
      });
    });

    btnSyncOfficialRate.addEventListener('click', () => {
      state.activeRate = state.officialRate;
      inputCustomRate.value = state.officialRate.toFixed(2);
      showToast('Tasa sincronizada con el BCV Oficial', 'info');
    });

    inputCustomRate.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (val && val > 0) {
        state.activeRate = val;
      }
    });

    // Selector de modo de conversión
    modeSelector.querySelectorAll('.mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        modeSelector.querySelectorAll('.mode-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.conversionMode = btn.dataset.mode;
      });
    });

    // Pestañas (Cámara vs Subida)
    tabCamera.addEventListener('click', () => {
      tabCamera.classList.add('active');
      tabUpload.classList.remove('active');
      if (previewContainer.style.display === 'none') {
        viewCamera.style.display = 'flex';
        viewUpload.style.display = 'none';
      }
    });

    tabUpload.addEventListener('click', () => {
      tabUpload.classList.add('active');
      tabCamera.classList.remove('active');
      if (previewContainer.style.display === 'none') {
        viewCamera.style.display = 'none';
        viewUpload.style.display = 'flex';
      }
      stopCamera();
    });

    // Botones de cámara
    btnStartCamera.addEventListener('click', startCamera);
    btnCapturePhoto.addEventListener('click', capturePhoto);
    btnSwitchCamera.addEventListener('click', switchCamera);
    btnStopCamera.addEventListener('click', stopCamera);

    // Dropzone & File Input
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0]);
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    // Soporte para pegar imágenes del portapapeles (Ctrl + V)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            handleFileSelected(file);
            showToast('Imagen pegada desde el portapapeles', 'info');
            break;
          }
        }
      }
    });

    // Vista previa
    btnClearPreview.addEventListener('click', clearPreview);
    btnProcessPreview.addEventListener('click', processImageWithGemini);

    // Ejemplos de muestra
    sampleButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        generateSampleImage(btn.dataset.sample);
      });
    });

    // Acciones de resultados
    btnCopyResults.addEventListener('click', copyResultsToClipboard);

    // Modal de Configuración
    btnOpenSettings.addEventListener('click', () => {
      inputApiKey.value = state.geminiApiKey;
      selectGeminiModel.value = state.geminiModel;
      checkServerHealth();
      settingsModal.style.display = 'flex';
    });

    btnCloseSettings.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    btnCancelSettings.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    btnSaveSettings.addEventListener('click', () => {
      const key = inputApiKey.value.trim();
      const model = selectGeminiModel.value;

      state.geminiApiKey = key;
      state.geminiModel = model;

      localStorage.setItem('pricevision_gemini_key', key);
      localStorage.setItem('pricevision_gemini_model', model);

      badgeModelName.textContent = model;
      updateKeyStatusIndicator();
      settingsModal.style.display = 'none';
      showToast('Configuración guardada exitosamente', 'success');
    });

    btnToggleApiKey.addEventListener('click', () => {
      if (inputApiKey.type === 'password') {
        inputApiKey.type = 'text';
        btnToggleApiKey.textContent = '🔒';
      } else {
        inputApiKey.type = 'password';
        btnToggleApiKey.textContent = '👁️';
      }
    });

    // Cerrar modal al hacer clic en el fondo
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });
  }

  // Arrancar
  init();
});
