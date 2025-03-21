// Elementos da DOM
const cameraElement = document.getElementById('camera');
const canvasElement = document.getElementById('canvas');
const startCameraButton = document.getElementById('startCamera');
const stopCameraButton = document.getElementById('stopCamera');
const captureImageButton = document.getElementById('captureImage');
const resultElement = document.getElementById('resultContainer');
const loadingElement = document.getElementById('loading');
const tipsToggleElement = document.querySelector('.tips-toggle');
const captureListElement = document.querySelector('.capture-tips');

// Configuração e integração da OpenAI API
let openaiApiKey = '';
let openaiModel = 'gpt-4-vision-preview';
let useAI = false;
const storageKeyName = 'openai_api_config';

// Elementos DOM para configuração da OpenAI
const apiConfigButton = document.getElementById('apiConfigButton');
const apiConfigModal = document.getElementById('apiConfigModal');
const closeModalButton = document.getElementById('closeModal');
const apiForm = document.getElementById('apiForm');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
const apiStatusIndicator = document.getElementById('apiStatusIndicator');
const aiToggle = document.getElementById('aiToggle');

// Referências aos elementos da interface
const videoContainer = document.getElementById('video-container');
const capturedContainer = document.getElementById('captured-container');
const capturedImageElement = document.getElementById('captured-image');
const resultTextarea = document.getElementById('resultText');

// Função para verificar se estamos no GitHub Pages
function isGitHubPages() {
    return window.location.hostname.includes('github.io');
}

// Inicialização de document.onload
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar a UI com animações
    initializeUI();
    
    // Inicializar elementos da UI
    initializeCamera();
    registerEventListeners();
    
    // Inicializar configuração da API
    initializeApiConfig();
    
    // Controle do tooltip de informações da IA
    setupTooltip();
    
    // Verificar se estamos no GitHub Pages e mostrar mensagem apropriada
    if (isGitHubPages()) {
        console.log('Executando em GitHub Pages - CORS pode ser um problema para chamadas diretas à API OpenAI');
        const securityNote = document.querySelector('.security-note p');
        if (securityNote) {
            securityNote.innerHTML += '<br><strong>Nota:</strong> Em GitHub Pages, algumas restrições de segurança podem afetar as chamadas à API. Se encontrar problemas, considere usar nossa versão hospedada.';
        }
    }

    // Configura o toggle para as dicas de captura
    if (tipsToggleElement && captureListElement) {
        // Por padrão, as dicas ficam fechadas em dispositivos móveis
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            captureListElement.style.display = 'none';
        }

        tipsToggleElement.addEventListener('click', () => {
            const isVisible = captureListElement.style.display !== 'none';
            captureListElement.style.display = isVisible ? 'none' : 'block';
            
            // Adiciona ou remove uma classe para mudar o ícone (opcional)
            tipsToggleElement.querySelector('i').className = isVisible 
                ? 'fas fa-lightbulb' 
                : 'fas fa-lightbulb-on';
        });
    }
});

// Variáveis globais
let stream = null;
let currentFacingMode = 'environment'; // 'environment' para câmera traseira, 'user' para frontal
let opencv_ready = false;

// Evento para iniciar a câmera
startCameraButton.addEventListener('click', async () => {
    try {
        // Solicita permissão para acessar a câmera traseira (se disponível)
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // Usa câmera traseira se disponível
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        // Atribui o stream à tag de vídeo
        cameraElement.srcObject = stream;
        
        // Habilita o botão de captura quando a câmera estiver pronta
        cameraElement.onloadedmetadata = () => {
            startCameraButton.disabled = true;
            stopCameraButton.disabled = false;
            captureImageButton.disabled = false;
            
            // Adiciona a classe para mostrar que a câmera está ativa
            document.querySelector('.camera-container').classList.add('camera-active');
        };
    } catch (error) {
        console.error('Erro ao acessar a câmera:', error);
        alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
});

// Função para interromper a câmera
function stopCamera() {
    if (stream) {
        // Parar todas as trilhas de mídia do stream
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        
        // Resetar a interface
        if (cameraElement) {
            cameraElement.srcObject = null;
        }
        
        // Habilitar o botão de iniciar câmera e desabilitar os outros
        const startCameraButton = document.getElementById('startCameraBtn');
        const captureImageButton = document.getElementById('captureBtn');
        const closeCameraButton = document.getElementById('closeCameraBtn');
        
        if (startCameraButton) startCameraButton.disabled = false;
        if (captureImageButton) captureImageButton.disabled = true;
        if (closeCameraButton) closeCameraButton.disabled = true;
        
        showMessage('Câmera fechada com sucesso', 'info');
    }
}

// Evento para interromper a câmera
stopCameraButton.addEventListener('click', stopCamera);

// Interrompe a câmera quando o usuário sai da página
window.addEventListener('beforeunload', stopCamera);

// Evento para capturar a imagem
captureImageButton.addEventListener('click', async () => {
    if (!stream) return;
    
    // Configura o canvas para o mesmo tamanho do vídeo
    const width = cameraElement.videoWidth;
    const height = cameraElement.videoHeight;
    canvasElement.width = width;
    canvasElement.height = height;
    
    // Captura o frame atual do vídeo para o canvas
    const context = canvasElement.getContext('2d');
    context.drawImage(cameraElement, 0, 0, width, height);
    
    // Obtém a imagem do canvas como URL de dados
    const imageDataUrl = canvasElement.toDataURL('image/png');
    
    // Verifica a qualidade da imagem antes de processar
    if (opencv_ready) {
        const qualityCheck = checkImageQuality(canvasElement);
        
        if (qualityCheck.hasIssues) {
            const shouldContinue = await showQualityWarning(qualityCheck);
            if (!shouldContinue) {
                return; // Usuário optou por não continuar com a imagem de baixa qualidade
            }
        }
    }
    
    // Processa a imagem capturada
    processImage(imageDataUrl);
});

// Função para verificar a qualidade da imagem
function checkImageQuality(canvas) {
    const result = {
        hasIssues: false,
        issues: [],
        details: {}
    };
    
    // Verificar dimensões mínimas
    if (canvas.width < 640 || canvas.height < 480) {
        result.hasIssues = true;
        result.issues.push('size');
        result.details.size = `Imagem muito pequena (${canvas.width}x${canvas.height}). Recomendado pelo menos 640x480.`;
    }
    
    try {
        // Verificar escuridão da imagem (média de valores de pixel)
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let sum = 0;
        let pixelCount = 0;
        
        // Calcular a média de brilho (usando apenas uma amostra de pixels para performance)
        const sampleStep = 10; // Verificar a cada 10 pixels para performance
        for (let i = 0; i < data.length; i += sampleStep * 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Fórmula ponderada para brilho percebido
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            sum += brightness;
            pixelCount++;
        }
        
        const averageBrightness = sum / pixelCount;
        result.details.brightness = averageBrightness;
        
        // Se a imagem for muito escura
        if (averageBrightness < 50) {
            result.hasIssues = true;
            result.issues.push('dark');
            result.details.darkMessage = `Imagem muito escura (brilho: ${Math.round(averageBrightness)}). Tente melhorar a iluminação.`;
        }
        
        // Verificar desfoque/falta de nitidez usando detecção de bordas
        // Uma imagem borrada terá poucas transições fortes entre pixels
        
        // Não podemos usar a detecção de bordas completa sem o OpenCV carregado
        // Vamos fazer uma verificação simplificada de contraste local
        let edgeStrength = 0;
        let edgeSamples = 0;
        
        for (let y = 5; y < canvas.height - 5; y += 10) {
            for (let x = 5; x < canvas.width - 5; x += 10) {
                const idx = (y * canvas.width + x) * 4;
                const idxRight = (y * canvas.width + (x + 5)) * 4;
                const idxBottom = ((y + 5) * canvas.width + x) * 4;
                
                // Calcular diferenças horizontais e verticais
                const diffH = Math.abs(data[idx] - data[idxRight]) + 
                            Math.abs(data[idx + 1] - data[idxRight + 1]) + 
                            Math.abs(data[idx + 2] - data[idxRight + 2]);
                            
                const diffV = Math.abs(data[idx] - data[idxBottom]) + 
                            Math.abs(data[idx + 1] - data[idxBottom + 1]) + 
                            Math.abs(data[idx + 2] - data[idxBottom + 2]);
                
                edgeStrength += (diffH + diffV) / 6; // Média dos 6 valores de diferença
                edgeSamples++;
            }
        }
        
        const avgEdgeStrength = edgeStrength / edgeSamples;
        result.details.edgeStrength = avgEdgeStrength;
        
        // Se o valor médio de borda for muito baixo, a imagem provavelmente está borrada
        if (avgEdgeStrength < 15) {
            result.hasIssues = true;
            result.issues.push('blurry');
            result.details.blurryMessage = `Imagem parece desfocada (nitidez: ${Math.round(avgEdgeStrength)}). Tente manter a câmera estável.`;
        }
        
    } catch (error) {
        console.error('Erro ao verificar qualidade da imagem:', error);
    }
    
    return result;
}

// Função para mostrar alerta de qualidade com opção de continuar
function showQualityWarning(qualityResult) {
    return new Promise(resolve => {
        window.qualityWarningResolver = resolve;
        
        const qualityAlert = document.getElementById('qualityAlert');
        const alertTitle = document.getElementById('qualityAlertTitle');
        const alertMessage = document.getElementById('qualityAlertMessage');
        
        // Definir título e mensagem com base nos problemas detectados
        if (qualityResult.issues.includes('dark')) {
            alertTitle.textContent = 'Imagem Muito Escura';
            alertMessage.textContent = qualityResult.details.darkMessage;
        } else if (qualityResult.issues.includes('blurry')) {
            alertTitle.textContent = 'Imagem Desfocada';
            alertMessage.textContent = qualityResult.details.blurryMessage;
        } else if (qualityResult.issues.includes('size')) {
            alertTitle.textContent = 'Tamanho da Imagem Inadequado';
            alertMessage.textContent = qualityResult.details.size;
        } else {
            alertTitle.textContent = 'Problema na Qualidade da Imagem';
            alertMessage.textContent = 'A imagem capturada pode não ser adequada para processamento. Tente capturar novamente com melhor iluminação e foco.';
        }
        
        // Exibir o alerta com animação
        qualityAlert.classList.add('show');
    });
}

// Função para mostrar overlay de carregamento
function showLoadingOverlay(message = 'Processando...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    if (loadingText) {
        loadingText.textContent = message;
    }
    
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        
        // Adicionar animação de fade-in
        setTimeout(() => {
            loadingOverlay.style.opacity = '1';
        }, 10);
    }
}

// Função para esconder overlay de carregamento
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        
        // Remover após a animação de fade-out
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300);
    }
}

// Função para processar a imagem e extrair o texto
async function processImage(imageDataUrl) {
    // Exibe o indicador de carregamento
    loadingElement.style.display = 'flex';
    resultElement.innerHTML = '';

    try {
        if (opencv_ready) {
            // Pré-processamento da imagem usando OpenCV.js
            const processedImageDataUrl = preprocessImage(imageDataUrl);
            
            // Configurações avançadas para o Tesseract.js
            const tesseractConfig = {
                lang: 'por',
                // Configura o mecanismo para priorizar texto de documentos
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ0123456789.,-:;/()[]{}\'"`!@#$%^&*_+=|\\<>?~ ',
                tessedit_pageseg_mode: '6', // Modo de segmentação assumindo um único bloco uniforme de texto
                preserve_interword_spaces: '1',
                tessedit_ocr_engine_mode: '3', // Usar o modo LSTM apenas
                tessjs_create_hocr: '0',
                tessjs_create_tsv: '0',
                // Parâmetros para melhorar o reconhecimento de caracteres em documentos
                textord_heavy_nr: '1',
                textord_min_linesize: '2.5',
                logger: message => console.log('Tesseract:', message)
            };
            
            // Executa OCR com Tesseract.js
            const result = await Tesseract.recognize(
                processedImageDataUrl,
                tesseractConfig
            );

            // Extrai e processa o texto reconhecido
            const extractedText = result.data.text;
            console.log('Texto Extraído:', extractedText);
            
            const documentInfo = parseDocumentInfo(extractedText);
            
            // Exibe os resultados
            displayResults(documentInfo);
        } else {
            // Se OpenCV não estiver pronto, usa apenas Tesseract com configurações básicas
            const result = await Tesseract.recognize(
                imageDataUrl,
                {
                    lang: 'por',
                    tessedit_ocr_engine_mode: '3',
                    logger: message => console.log('Tesseract (Modo Básico):', message)
                }
            );
            
            // Extrai e processa o texto reconhecido
            const extractedText = result.data.text;
            console.log('Texto Extraído (Modo Básico):', extractedText);
            
            const documentInfo = parseDocumentInfo(extractedText);
            
            // Exibe os resultados
            displayResults(documentInfo);
        }
    } catch (error) {
        console.error('Erro ao processar imagem:', error);
        resultElement.innerHTML = '<p class="error">Erro ao processar o documento. Tente novamente com melhor iluminação.</p>';
    } finally {
        // Esconde o indicador de carregamento
        loadingElement.style.display = 'none';
    }
}

// Função para pré-processar a imagem usando OpenCV
function preprocessImage(imageDataUrl) {
    try {
        // Carrega a imagem para uma matriz OpenCV
        let img = cv.imread(canvasElement);
        
        // Converte para escala de cinza
        let gray = new cv.Mat();
        cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
        
        // Redimensiona a imagem para melhorar o processamento
        const maxWidth = 1600; // Aumenta a largura máxima para processamento
        if (img.cols > maxWidth) {
            const scaleFactor = maxWidth / img.cols;
            const newSize = new cv.Size(maxWidth, Math.round(img.rows * scaleFactor));
            cv.resize(gray, gray, newSize, 0, 0, cv.INTER_AREA);
        }
        
        // Aplica normalização de histograma para melhorar o contraste
        let equalized = new cv.Mat();
        cv.equalizeHist(gray, equalized);
        
        // Aplica desfoque bilateral para reduzir ruído preservando bordas
        let denoised = new cv.Mat();
        cv.bilateralFilter(equalized, denoised, 9, 75, 75, cv.BORDER_DEFAULT);
        
        // Aplica filtro adaptativo para binarização - melhora a detecção de texto
        let binary = new cv.Mat();
        cv.adaptiveThreshold(denoised, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 8);
        
        // Operações morfológicas para limpar a imagem
        let kernel = cv.Mat.ones(2, 2, cv.CV_8U);
        let cleaned = new cv.Mat();
        
        // Aplicando operação de fechamento (Closing) para preencher pequenas lacunas em caracteres
        let morphClose = new cv.Mat();
        cv.morphologyEx(binary, morphClose, cv.MORPH_CLOSE, kernel);
        
        // Tenta detectar automaticamente a orientação do documento e corrigir
        // Detecta linhas longas que podem indicar a orientação do documento
        let edges = new cv.Mat();
        cv.Canny(morphClose, edges, 50, 150, 3, false);
        
        // Aplica transformações para melhorar consistência
        let result = morphClose.clone();

        // Melhora o contraste para a detecção de texto
        for (let i = 0; i < 3; i++) {
            cv.GaussianBlur(result, result, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
            cv.addWeighted(morphClose, 1.5, result, -0.5, 0, result);
        }
        
        // Usa o resultado para visualização e OCR
        cv.imshow(canvasElement, result);
        
        // Libera a memória dos objetos Mat
        img.delete();
        gray.delete();
        equalized.delete();
        denoised.delete();
        binary.delete();
        kernel.delete();
        edges.delete();
        morphClose.delete();
        
        // Retorna a imagem processada como URL de dados
        return canvasElement.toDataURL('image/png');
    } catch (error) {
        console.error('Erro ao pré-processar imagem com OpenCV:', error);
        return imageDataUrl; // Retorna a imagem original em caso de erro
    }
}

// Função para analisar o texto extraído e identificar informações de documento
function parseDocumentInfo(text) {
    const info = {
        type: 'Desconhecido',
        name: '',
        cpf: '',
        rg: '',
        birthDate: '',
        driverLicense: '',
        expirationDate: '',
        category: '',
        nationality: '',
        naturalness: '',
        issueDate: '',
        issuer: '',
        fatherName: '',
        motherName: '',
        address: '',
        formattedText: text.replace(/\n/g, '<br>')
    };
    
    // Normaliza o texto para facilitar a busca
    const normalizedText = text.normalize('NFD')
                               .replace(/[\u0300-\u036f]/g, '')
                               .toLowerCase()
                               .replace(/[^\w\s\.\-\/]/g, ' ') // Substitui caracteres especiais por espaços
                               .replace(/\s+/g, ' ');          // Remove múltiplos espaços

    // ----- Detecção de tipo de documento -----
    const cnhKeywords = [
        'carteira nacional', 'habilitacao', 'cnh', 'permissao para dirigir', 
        'motorista', 'acc', 'registro nacional', 'renach', 'primeira habilitacao'
    ];
    
    const rgKeywords = [
        'identidade', 'rg', 'cedula', 'registro geral', 'carteira de identidade',
        'ssp', 'secretaria', 'seguranca publica'
    ];
    
    // Verifica o tipo de documento usando um sistema de pontuação
    let cnhScore = 0;
    let rgScore = 0;
    
    cnhKeywords.forEach(keyword => {
        if (normalizedText.includes(keyword)) cnhScore += 2;
    });
    
    rgKeywords.forEach(keyword => {
        if (normalizedText.includes(keyword)) rgScore += 2;
    });
    
    // Detecção de padrões típicos de cada documento
    if (/cat[^a-z]+[abcde]/i.test(normalizedText)) cnhScore += 3;
    if (/renach/i.test(normalizedText)) cnhScore += 3;
    if (/ssp/i.test(normalizedText)) rgScore += 3;
    
    // Determina o tipo de documento
    if (cnhScore > rgScore && cnhScore > 2) {
        info.type = 'CNH';
    } else if (rgScore > cnhScore && rgScore > 2) {
        info.type = 'RG';
    }
    
    // ----- Extração de CPF -----
    // Padrão: 000.000.000-00 ou 00000000000
    const cpfPatterns = [
        /(\d{3}\.\d{3}\.\d{3}-\d{2})/g,        // 000.000.000-00
        /(\d{3}[\s\.]\d{3}[\s\.]\d{3}[\s\-]\d{2})/g, // Com possíveis espaços
        /cpf\D*(\d{3}[\s\.]*\d{3}[\s\.]*\d{3}[\s\-]*\d{2})/ig, // Com prefixo "CPF"
        /\b(\d{11})\b/g                        // 00000000000 (como fallback)
    ];
    
    for (let pattern of cpfPatterns) {
        const match = text.match(pattern);
        if (match) {
            // Formata o CPF para o padrão 000.000.000-00
            let cpf = match[0].replace(/[^\d]/g, '');
            if (cpf.length === 11) {
                info.cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                break;
            }
        }
    }
    
    // ----- Extração de RG -----
    // Diversos formatos possíveis: 00.000.000-0, 0.000.000, etc.
    const rgPatterns = [
        /(\d{1,2}\.\d{3}\.\d{3}[-\.\/]?[\dxX])/g,
        /rg\D*(\d{1,2}[\s\.]*\d{3}[\s\.]*\d{3}[\s\-\.\/]*[\dxX]?)/ig,
        /identidade\D*(\d{1,2}[\s\.]*\d{3}[\s\.]*\d{3}[\s\-\.\/]*[\dxX]?)/ig,
        /registro\s*geral\D*(\d{1,2}[\s\.]*\d{3}[\s\.]*\d{3}[\s\-\.\/]*[\dxX]?)/ig
    ];
    
    for (let pattern of rgPatterns) {
        const match = text.match(pattern);
        if (match) {
            info.rg = match[0].replace(/[^\d\.xX\-]/g, '')
                          .replace(/^(rg|identidade|registro\s*geral)/i, '').trim();
            break;
        }
    }
    
    // ----- Extração de Datas -----
    // Padrões de data: DD/MM/AAAA ou DD.MM.AAAA ou DD MM AAAA
    const extractDates = text.match(/\b(\d{2}[\s\.\/]\d{2}[\s\.\/]\d{4})\b/g) || [];
    const cleanDates = extractDates.map(date => date.replace(/[^\d]/g, '')
                                     .replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3'));
    
    // Busca específica por data de nascimento
    const birthDateKeywords = [
        'nascimento', 'nasc', 'data de nasc', 'data nasc', 'nascido', 'nascida', 'dt nasc'
    ];
    
    let foundBirthDate = false;
    for (let keyword of birthDateKeywords) {
        const index = normalizedText.indexOf(keyword);
        if (index !== -1) {
            // Procura por uma data próxima da keyword
            const nearText = normalizedText.substring(index, index + 50);
            const nearDate = nearText.match(/\d{2}[\s\.\/]\d{2}[\s\.\/]\d{4}/);
            if (nearDate) {
                info.birthDate = nearDate[0].replace(/[^\d]/g, '')
                                 .replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
                foundBirthDate = true;
                break;
            }
        }
    }
    
    // Se não encontrou data específica, usa a primeira
    if (!foundBirthDate && cleanDates.length > 0) {
        info.birthDate = cleanDates[0];
    }
    
    // ----- Extração de dados específicos de CNH -----
    if (info.type === 'CNH') {
        // Extração de categoria
        const catPatterns = [
            /cat[\.\s]*:?\s*([abcdeABCDE]+)/i,
            /categoria[\.\s]*:?\s*([abcdeABCDE]+)/i,
            /acc[\.\s]*/i
        ];
        
        for (let pattern of catPatterns) {
            const match = normalizedText.match(pattern);
            if (match && match[1]) {
                info.category = match[1].toUpperCase();
                break;
            } else if (pattern.toString().includes('acc') && normalizedText.match(pattern)) {
                info.category = 'ACC';
                break;
            }
        }
        
        // Extração do número da CNH/registro
        const licensePatterns = [
            /registro[\.\s:]*n?o?\.?\s*(\d[\d\s\.]*\d)/i,
            /cnh[\.\s:]*n?o?\.?\s*(\d[\d\s\.]*\d)/i,
            /habilitacao[\.\s:]*n?o?\.?\s*(\d[\d\s\.]*\d)/i,
            /n?o?\.?\s*registro[\.\s:]*(\d[\d\s\.]*\d)/i,
            /renach[\.\s:]*n?o?\.?\s*(\d[\d\s\.]*\d)/i
        ];
        
        for (let pattern of licensePatterns) {
            const match = normalizedText.match(pattern);
            if (match && match[1]) {
                info.driverLicense = match[1].replace(/[^\d]/g, '');
                break;
            }
        }
        
        // Extração da validade
        const validityKeywords = ['validade', 'valid', 'val'];
        for (let keyword of validityKeywords) {
            const index = normalizedText.indexOf(keyword);
            if (index !== -1) {
                const nearText = normalizedText.substring(index, index + 40);
                const nearDate = nearText.match(/\d{2}[\s\.\/]\d{2}[\s\.\/]\d{4}/);
                if (nearDate) {
                    info.expirationDate = nearDate[0].replace(/[^\d]/g, '')
                                     .replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
                    break;
                }
            }
        }
    }
    
    // ----- Extração de dados específicos de RG -----
    if (info.type === 'RG') {
        // Extração de órgão emissor
        const issuerPatterns = [
            /ssp\/?([a-zA-Z]{2})/i,
            /([a-zA-Z]{2,5})[\/-]?([a-zA-Z]{2})/i,
            /orgao\s*emissor\s*[:\.]?\s*([a-zA-Z\/\-]{2,10})/i,
            /expedidor\s*[:\.]?\s*([a-zA-Z\/\-]{2,10})/i
        ];
        
        for (let pattern of issuerPatterns) {
            const match = normalizedText.match(pattern);
            if (match) {
                if (match[2]) {
                    info.issuer = (match[1] + "/" + match[2]).toUpperCase();
                } else if (match[1]) {
                    info.issuer = match[1].toUpperCase();
                }
                break;
            }
        }
        
        // Extração da data de emissão/expedição
        const issueKeywords = ['expedicao', 'emissao', 'expedida', 'emitida', 'data doc', 'data de emissao'];
        for (let keyword of issueKeywords) {
            const index = normalizedText.indexOf(keyword);
            if (index !== -1) {
                const nearText = normalizedText.substring(index, index + 40);
                const nearDate = nearText.match(/\d{2}[\s\.\/]\d{2}[\s\.\/]\d{4}/);
                if (nearDate) {
                    info.issueDate = nearDate[0].replace(/[^\d]/g, '')
                                 .replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
                    break;
                }
            }
        }
    }
    
    // ----- Extração do nome -----
    // O nome geralmente está próximo da palavra "nome"
    const nameKeywords = ['nome', 'nome completo', 'assinatura'];
    let foundName = false;
    
    for (let keyword of nameKeywords) {
        const index = normalizedText.indexOf(keyword);
        if (index !== -1) {
            // Pega até 80 caracteres depois da keyword para capturar nomes longos
            const afterKeyword = normalizedText.substring(index + keyword.length, index + keyword.length + 80);
            // Remove possíveis caracteres de separação como : ou -
            const cleanName = afterKeyword.replace(/^[\s:;\-\.\|]+/, '').trim();
            // Pega apenas a primeira linha como nome
            const firstLine = cleanName.split(/[\n\r]/)[0].trim();
            
            if (firstLine && firstLine.length > 3 && firstLine.split(' ').length >= 2) {
                info.name = formatName(firstLine);
                foundName = true;
                break;
            }
        }
    }
    
    // Se não encontrou o nome pelos marcadores, tenta identificar padrões de nome
    if (!foundName) {
        // Busca por linhas que pareçam nomes (contendo espaços e sem muitos números/símbolos)
        const lines = text.split(/[\n\r]+/);
        for (let line of lines) {
            const clean = line.trim();
            if (clean.length > 8 && 
                clean.split(' ').length >= 2 && 
                clean.split(' ').length < 8 &&
                /^[A-Za-zÀ-ÿ\s]+$/.test(clean) && 
                !/^(rg|cpf|cnh|data|endereco|filiacao)/i.test(clean)) {
                
                info.name = formatName(clean);
                break;
            }
        }
    }
    
    // ----- Extração de nacionalidade -----
    const nationalityPatterns = [
        /nacionalidade\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s]{4,30}?)(?=\s*\n|\s*[,;])/i,
        /\b(brasileiro|brasileira|brasil)\b/i
    ];
    
    for (let pattern of nationalityPatterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[1] && match[1].length < 30) {
                info.nationality = formatName(match[1]);
            } else if (match[0].match(/brasileiro/i)) {
                info.nationality = match[0].toLowerCase().includes('brasileira') ? 'Brasileira' : 'Brasileiro';
            }
            break;
        }
    }
    
    // ----- Extração de naturalidade -----
    const naturalPatterns = [
        /naturalidade\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s\/\-]{4,40}?)(?=\s*\n|\s*[,;])/i,
        /natural\s*d[eao]\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s\/\-]{4,40}?)(?=\s*\n|\s*[,;])/i
    ];
    
    for (let pattern of naturalPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length < 40) {
            info.naturalness = formatName(match[1]);
            break;
        }
    }
    
    // ----- Extração de filiação -----
    // Busca pelo nome do pai
    const fatherPatterns = [
        /pai\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s]{5,60}?)(?=\s*\n|\s*[,;])/i,
        /filiacao\s*[:\.\-]?\s*pai\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s]{5,60}?)(?=\s*\n|\s*[,;])/i
    ];
    
    for (let pattern of fatherPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 5) {
            info.fatherName = formatName(match[1]);
            break;
        }
    }
    
    // Busca pelo nome da mãe
    const motherPatterns = [
        /mae\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s]{5,60}?)(?=\s*\n|\s*[,;])/i,
        /filiacao\s*[:\.\-]?\s*mae\s*[:\.\-]?\s*([a-zA-ZÀ-ÿ\s]{5,60}?)(?=\s*\n|\s*[,;])/i
    ];
    
    for (let pattern of motherPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 5) {
            info.motherName = formatName(match[1]);
            break;
        }
    }
    
    // ----- Extração de endereço -----
    const addressPatterns = [
        /endereco\s*[:\.\-]?\s*([a-zA-Z0-9À-ÿ\s,\.\-]{10,100}?)(?=\s*\n|\s*[,;])/i,
        /residencia\s*[:\.\-]?\s*([a-zA-Z0-9À-ÿ\s,\.\-]{10,100}?)(?=\s*\n|\s*[,;])/i
    ];
    
    for (let pattern of addressPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 10) {
            info.address = formatName(match[1]);
            break;
        }
    }
    
    return info;
}

// Função auxiliar para formatar nomes (primeira letra maiúscula de cada palavra)
function formatName(name) {
    if (!name) return '';
    return name.trim()
        .split(' ')
        .map(word => {
            if (word.length > 2) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            } else {
                return word.toLowerCase();
            }
        })
        .join(' ');
}

// Função para exibir os resultados extraídos
function displayResults(info) {
    let html = '';
    
    if (info.type !== 'Desconhecido') {
        html += `<p class="result-item" style="--i:0"><strong>Tipo de Documento:</strong> ${info.type}</p>`;
    }
    
    if (info.name) {
        html += `<p class="result-item" style="--i:1"><strong>Nome:</strong> ${info.name}</p>`;
    }
    
    if (info.cpf) {
        html += `<p class="result-item" style="--i:2"><strong>CPF:</strong> ${info.cpf}</p>`;
    }
    
    if (info.rg) {
        html += `<p class="result-item" style="--i:3"><strong>RG:</strong> ${info.rg}</p>`;
    }
    
    if (info.birthDate) {
        html += `<p class="result-item" style="--i:4"><strong>Data de Nascimento:</strong> ${info.birthDate}</p>`;
    }
    
    if (info.nationality) {
        html += `<p class="result-item" style="--i:5"><strong>Nacionalidade:</strong> ${info.nationality}</p>`;
    }
    
    if (info.naturalness) {
        html += `<p class="result-item" style="--i:6"><strong>Naturalidade:</strong> ${info.naturalness}</p>`;
    }
    
    if (info.fatherName) {
        html += `<p class="result-item" style="--i:7"><strong>Nome do Pai:</strong> ${info.fatherName}</p>`;
    }
    
    if (info.motherName) {
        html += `<p class="result-item" style="--i:8"><strong>Nome da Mãe:</strong> ${info.motherName}</p>`;
    }
    
    if (info.address) {
        html += `<p class="result-item" style="--i:9"><strong>Endereço:</strong> ${info.address}</p>`;
    }
    
    // Campos específicos do RG
    if (info.type === 'RG') {
        if (info.issuer) {
            html += `<p class="result-item" style="--i:10"><strong>Órgão Emissor:</strong> ${info.issuer}</p>`;
        }
        
        if (info.issueDate) {
            html += `<p class="result-item" style="--i:11"><strong>Data de Emissão:</strong> ${info.issueDate}</p>`;
        }
    }
    
    // Campos específicos da CNH
    if (info.type === 'CNH') {
        if (info.driverLicense) {
            html += `<p class="result-item" style="--i:10"><strong>Registro da CNH:</strong> ${info.driverLicense}</p>`;
        }
        
        if (info.category) {
            html += `<p class="result-item" style="--i:11"><strong>Categoria:</strong> ${info.category}</p>`;
        }
        
        if (info.expirationDate) {
            html += `<p class="result-item" style="--i:12"><strong>Validade:</strong> ${info.expirationDate}</p>`;
        }
    }
    
    if (html === '') {
        html = `<p class="no-results">Não foi possível identificar informações do documento. Tente novamente com melhor iluminação.</p>
                <p class="raw-text-label"><strong>Texto extraído:</strong></p>
                <div class="extracted-text">${info.formattedText}</div>`;
    } else {
        // Adiciona o texto bruto extraído ao final para debug e verificação
        html += `<p class="toggle-raw-text result-item" style="--i:15"><a href="#" onclick="toggleRawText(event)"><i class="fas fa-code"></i> Mostrar/Ocultar Texto Extraído</a></p>
                <div class="extracted-text" style="display: none;">${info.formattedText}</div>`;
    }
    
    // Define o HTML com efeito de fade in
    resultElement.style.opacity = '0';
    resultElement.innerHTML = html;
    
    // Anima a entrada dos resultados
    setTimeout(() => {
        resultElement.style.opacity = '1';
        // Adiciona classe para ativar as animações
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.add('animate-in');
        });
    }, 50);
}

// Função para alternar a exibição do texto bruto extraído
function toggleRawText(event) {
    event.preventDefault();
    const extractedTextElement = document.querySelector('.extracted-text');
    if (extractedTextElement) {
        extractedTextElement.style.display = extractedTextElement.style.display === 'none' ? 'block' : 'none';
    }
}

// Função chamada quando OpenCV.js é carregado
function onOpenCvReady() {
    console.log('OpenCV.js carregado com sucesso');
    opencv_ready = true;
}

// Função chamada quando há erro ao carregar OpenCV.js
function onOpenCvError() {
    console.error('Falha ao carregar OpenCV.js');
    alert('Algumas funcionalidades de processamento de imagem podem não estar disponíveis.');
}

// Inicializar configuração da API
function initializeApiConfig() {
    // Carregar configuração salva, se existir
    const savedConfig = localStorage.getItem(storageKeyName);
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            openaiApiKey = config.key || '';
            openaiModel = config.model || 'gpt-4-vision-preview';
            
            // Atualizar interface
            if (openaiApiKey) {
                apiStatusIndicator.classList.add('active');
                document.getElementById('apiStatus').textContent = 'Configurado';
                apiKeyInput.value = '••••••••••••••••••••••••••';
            }
            
            // Definir o modelo selecionado
            document.getElementById('modelSelect').value = openaiModel;
            
            // Definir opção de armazenamento
            if (config.storage === 'session') {
                document.getElementById('storeSession').checked = true;
            } else {
                document.getElementById('storeLocal').checked = true;
            }
            
            // Configurar o uso de IA
            useAI = config.useAI === true;
            aiToggle.checked = useAI;
        } catch (error) {
            console.error('Erro ao carregar configuração da API:', error);
        }
    }
    
    // Configurar eventos
    apiConfigButton.addEventListener('click', () => {
        apiConfigModal.classList.add('show');
        setTimeout(() => {
            document.querySelector('.modal-content').style.opacity = '1';
            document.querySelector('.modal-content').style.transform = 'translateY(0)';
        }, 50);
    });
    
    closeModalButton.addEventListener('click', () => {
        document.querySelector('.modal-content').style.opacity = '0';
        document.querySelector('.modal-content').style.transform = 'translateY(20px)';
        setTimeout(() => {
            apiConfigModal.classList.remove('show');
        }, 300);
    });
    
    toggleKeyVisibility.addEventListener('click', toggleApiKeyVisibility);
    
    apiForm.addEventListener('submit', saveApiConfig);
    
    aiToggle.addEventListener('change', function() {
        useAI = this.checked;
        
        // Salvar a alteração na configuração
        const savedConfig = localStorage.getItem(storageKeyName);
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                config.useAI = useAI;
                
                // Armazenar a configuração atualizada
                const storageType = config.storage || 'local';
                if (storageType === 'session') {
                    sessionStorage.setItem(storageKeyName, JSON.stringify(config));
                } else {
                    localStorage.setItem(storageKeyName, JSON.stringify(config));
                }
            } catch (error) {
                console.error('Erro ao atualizar configuração de uso de IA:', error);
            }
        }
    });
}

// Alternar visibilidade da chave API
function toggleApiKeyVisibility() {
    const icon = toggleKeyVisibility.querySelector('i');
    
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        apiKeyInput.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Salvar configuração da API
function saveApiConfig(event) {
    event.preventDefault();
    
    // Obter valores do formulário
    const key = apiKeyInput.value;
    const model = document.getElementById('modelSelect').value;
    const storageType = document.querySelector('input[name="storage"]:checked').value;
    
    // Validar chave API (versão simples)
    if (key && !key.startsWith('sk-') && !key.includes('••••')) {
        alert('A chave API parece inválida. Chaves API da OpenAI geralmente começam com "sk-"');
        return;
    }
    
    // Criar objeto de configuração
    const config = {
        key: key.includes('••••') ? openaiApiKey : key, // Manter a chave existente se o campo não foi alterado
        model,
        storage: storageType,
        useAI
    };
    
    // Armazenar configuração
    if (storageType === 'session') {
        sessionStorage.setItem(storageKeyName, JSON.stringify(config));
    } else {
        localStorage.setItem(storageKeyName, JSON.stringify(config));
    }
    
    // Atualizar variáveis globais
    openaiApiKey = config.key;
    openaiModel = config.model;
    
    // Atualizar interface
    apiStatusIndicator.classList.add('active');
    document.getElementById('apiStatus').textContent = 'Configurado';
    
    // Fechar o modal
    closeModalButton.click();
    
    showMessage('Configuração da API salva com sucesso!', 'success');
}

// Função para extrair dados de documentos usando o OpenAI API
async function extractDataWithAI(imageDataUrl) {
    if (!openaiApiKey || !useAI) {
        return null;
    }
    
    try {
        showLoadingOverlay('Analisando documento com IA...');
        
        // Se estamos no GitHub Pages, alertar sobre possíveis problemas de CORS
        if (isGitHubPages()) {
            console.warn('Chamando OpenAI API a partir do GitHub Pages - podem ocorrer problemas de CORS');
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: openaiModel,
                messages: [
                    {
                        role: 'system',
                        content: 'Você é um assistente especializado em extrair informações de documentos brasileiros como RG, CPF, CNH, contas de luz, água e telefone. Forneça dados em formato JSON estruturado.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extraia todas as informações relevantes deste documento. Inclua nome completo, números de identificação (RG, CPF, CNH), datas importantes, endereço, e quaisquer outros dados estruturados visíveis. Forneça os dados em formato JSON com campos claramente identificados. Use nomes de campos em português. Para documentos de contas, inclua valores, datas de vencimento e códigos de barras se visíveis.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageDataUrl
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1500
            })
        });
        
        hideLoadingOverlay();
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Erro na API da OpenAI:', errorData);
            
            // Mensagem específica para erros de CORS no GitHub Pages
            if (isGitHubPages() && (errorData.error?.code === 'cors_error' || response.status === 0)) {
                showMessage('Erro de CORS ao tentar acessar a API da OpenAI no GitHub Pages. Considere usar a aplicação localmente.', 'error');
            } else {
                showMessage(`Erro na análise com IA: ${errorData.error?.message || 'Verifique sua chave API'}`, 'error');
            }
            return null;
        }
        
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            try {
                // Tentar extrair o JSON da resposta
                const contentText = data.choices[0].message.content;
                const jsonMatch = contentText.match(/```json\s*([\s\S]*?)\s*```/) || 
                                contentText.match(/{[\s\S]*}/);
                
                if (jsonMatch) {
                    const jsonText = jsonMatch[0].replace(/```json|```/g, '').trim();
                    const extractedData = JSON.parse(jsonText);
                    return extractedData;
                } else {
                    console.warn('Não foi possível encontrar JSON na resposta:', contentText);
                    return null;
                }
            } catch (parseError) {
                console.error('Erro ao processar resposta da IA:', parseError);
                return null;
            }
        }
        
        return null;
    } catch (error) {
        hideLoadingOverlay();
        console.error('Erro ao comunicar com a API da OpenAI:', error);
        
        // Mensagem específica para erros no GitHub Pages
        if (isGitHubPages() && error.message.includes('Failed to fetch')) {
            showMessage('Erro ao conectar com a API da OpenAI no GitHub Pages. Isto pode ser devido a restrições de CORS. Considere usar a aplicação localmente.', 'error');
        } else {
            showMessage('Erro ao conectar com a API da OpenAI. Verifique sua conexão e configurações.', 'error');
        }
        return null;
    }
}

// Função para combinar resultados da IA com OCR convencional
async function processDocumentData(imageDataUrl) {
    // Primeiro, tenta extrair com OCR convencional
    const ocrResult = await runOCR(imageDataUrl);
    
    // Se a opção de IA estiver ativada e tivermos uma chave API
    if (useAI && openaiApiKey) {
        try {
            // Extrair com IA
            const aiResult = await extractDataWithAI(imageDataUrl);
            
            if (aiResult) {
                // Mostrar na interface que estamos usando resultado de IA
                showMessage('Dados extraídos com inteligência artificial', 'info');
                
                // Formatar para exibição
                return formatExtractedData(aiResult);
            }
        } catch (error) {
            console.error('Erro ao processar com IA, usando OCR convencional:', error);
        }
    }
    
    // Se a IA não estiver disponível ou falhar, use o resultado do OCR
    return formatOCRResults(ocrResult);
}

// Função auxiliar para formatar dados extraídos para exibição
function formatExtractedData(data) {
    let formattedText = '';
    
    // Formatar os dados de maneira legível
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object') {
            formattedText += `${key.toUpperCase()}:\n`;
            for (const [subKey, subValue] of Object.entries(value)) {
                if (subValue) {
                    formattedText += `  ${subKey}: ${subValue}\n`;
                }
            }
        } else if (value) {
            formattedText += `${key}: ${value}\n`;
        }
    }
    
    return formattedText;
}

// Inicializar elementos da câmera
function initializeCamera() {
    // Verificar se os elementos existem antes de tentar acessá-los
    const startCameraButton = document.getElementById('startCameraBtn');
    const captureImageButton = document.getElementById('captureBtn');
    const closeCameraButton = document.getElementById('closeCameraBtn');
    const recaptureButton = document.getElementById('recaptureBtn');
    const processButton = document.getElementById('processBtn');
    
    if (startCameraButton && captureImageButton && closeCameraButton) {
        startCameraButton.addEventListener('click', async function() {
            await startCamera();
            captureImageButton.disabled = false;
            closeCameraButton.disabled = false;
            this.disabled = true;
        });
        
        captureImageButton.addEventListener('click', captureImage);
        closeCameraButton.addEventListener('click', stopCamera);
    }
    
    if (recaptureButton) {
        recaptureButton.addEventListener('click', () => {
            videoContainer.style.display = 'block';
            capturedContainer.style.display = 'none';
        });
    }
    
    if (processButton) {
        processButton.addEventListener('click', async function() {
            const imageDataUrl = capturedImageElement.src;
            if (!imageDataUrl) {
                showMessage('Nenhuma imagem capturada. Capture uma imagem primeiro.', 'error');
                return;
            }
            
            showLoadingOverlay('Extraindo texto do documento...');
            
            try {
                // Usar função atualizada com suporte a IA
                const extractedText = await processDocumentData(imageDataUrl);
                resultTextarea.value = extractedText;
                hideLoadingOverlay();
                
                // Rolar até o resultado
                document.querySelector('.result-container').scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
                
                showMessage('Texto extraído com sucesso!', 'success');
            } catch (error) {
                hideLoadingOverlay();
                console.error('Erro ao processar documento:', error);
                showMessage('Erro ao extrair texto. Por favor, tente novamente.', 'error');
            }
        });
    }
}

// Registrar outros event listeners
function registerEventListeners() {
    // Event listener para o botão de copiar
    const copyButton = document.getElementById('copyBtn');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const resultTextarea = document.getElementById('resultText');
            if (!resultTextarea.value) {
                showMessage('Não há texto para copiar', 'error');
                return;
            }
            
            resultTextarea.select();
            document.execCommand('copy');
            
            // Animação de feedback visual
            copyButton.classList.add('active');
            setTimeout(() => {
                copyButton.classList.remove('active');
            }, 300);
            
            showMessage('Texto copiado para a área de transferência!', 'success');
        });
    }
    
    // Event listener para o botão de download
    const downloadButton = document.getElementById('downloadBtn');
    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            const resultTextarea = document.getElementById('resultText');
            const text = resultTextarea.value;
            if (!text) {
                showMessage('Não há texto para baixar', 'warning');
                return;
            }
            
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'documento_extraido.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showMessage('Documento baixado com sucesso!', 'success');
        });
    }
    
    // Correção do evento do modal
    const closeModalButton = document.getElementById('closeModal');
    if (document.getElementById('closeModal2')) {
        document.getElementById('closeModal2').addEventListener('click', () => {
            closeModalButton.click();
        });
    }
    
    // Event listeners para o alerta de qualidade
    if (document.getElementById('tryAgainBtn')) {
        document.getElementById('tryAgainBtn').addEventListener('click', () => {
            document.getElementById('qualityAlert').classList.remove('show');
        });
    }
    
    if (document.getElementById('continueBtn')) {
        document.getElementById('continueBtn').addEventListener('click', () => {
            document.getElementById('qualityAlert').classList.remove('show');
            // Resolver a Promise no showQualityWarning
            if (window.qualityWarningResolver) {
                window.qualityWarningResolver(true);
                window.qualityWarningResolver = null;
            }
        });
    }
    
    // Adicionar responsividade para redimensionamento da janela
    window.addEventListener('resize', function() {
        const tipsToggle = document.querySelector('.tips-toggle');
        const captureTips = document.querySelector('.capture-tips');
        
        if (tipsToggle && captureTips) {
            // Ocultar dicas em dispositivos móveis por padrão
            if (window.innerWidth <= 768) {
                captureTips.classList.remove('show');
                tipsToggle.classList.remove('active');
            }
        }
    });
}

// Função para capturar imagem e processar o documento
async function captureImage() {
    try {
        // Se não houver stream de câmera ativo, mostrar mensagem
        if (!stream) {
            showMessage('Inicie a câmera antes de capturar uma imagem', 'warning');
            return;
        }

        // Criar um canvas com as mesmas dimensões do vídeo visível
        const video = cameraElement;
        const canvas = document.createElement('canvas');
        
        // Usar as dimensões reais do vídeo para evitar distorções e zoom indesejado
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // Configurar o canvas com as mesmas proporções do vídeo
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        
        const ctx = canvas.getContext('2d');
        
        // Desenhar a imagem exatamente como está sendo mostrada (sem zoom)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Obter dados da imagem
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        
        // Exibir a imagem capturada
        if (capturedImageElement) {
            capturedImageElement.src = imageDataUrl;
            capturedImageElement.style.display = 'block';
            capturedImageElement.style.width = '100%';
            capturedImageElement.style.height = 'auto';
            capturedImageElement.style.objectFit = 'contain';
        }
        
        // Alternar exibição dos containers
        if (videoContainer) videoContainer.style.display = 'none';
        if (capturedContainer) capturedContainer.style.display = 'block';
        
        // Adicionar feedback sonoro de captura
        const captureSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHiNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY3MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM///////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAYAAAAAAAAAAbBqxrpJAAAAAAD/+7DEAAAKmKl78MTgYVEVLvssNIIAIgAAAAMsAA5QA4ADlADgABABDpAAAAAAAAAA4A/P/zOADgAwgA5QBIAAAAAAAAAA4B8AJ4JkA+SAIBwLx5IBwHAAeAOA4eA+D4Hx9/egAIeEIHfC97736CgAcwf//9/////cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////////////////////////////////////////////////////////////77cMQCgAACUAAAAAAAAAJuAAAAAAAAiYR8X/E/8RonoRPCeE8CIVwIhXAiFcJ4TwIhPCfE/8QBf/////+gQU7ug9YO4DIJAJoCqgDwQA0AzAEIATgGYAMgBOAFoAWgAwAC0AWgBOANwAMgAAAAAAAAA//sMQAAAiZm3jGmHgB8zPvmGGPAAXgBaAMQAnAC8ALQAMAAWAJ///ygMNDDg8PDw4ODMzVVVqqqszMzMzDw8PDg4PDw8Pf/////////////6qqq1VVVVmZmZOCgoQEBAYODg4ODg4EBAQEBAQP/7EsTnAFuY0wDz1gAGyhvfaPZAAAAAQEDg4OCpUEAAgICBAQICAgaVqgYGBhUVNVVVVVVVgYGCAgQECAgICAgV//////////////////////////////////////////////////////////////////////////////////////////////////////////////sQxOMAgAABpAAAACAAADSAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7EmRDgIAAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxP+AAAAE/wAAACAAACXgAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxP+AAAAEsAAAAAAAAJYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////////////////////////////////////////////////////////////////////wAA/+MYwAAAAP/7EsT6AAT0AcGphFAAiJU4UzQzghPP/////////////77/////4IgCBECAoiiKYyKG9zmXlEBQFAUZi4uZmZguLi4mImIiJhnExPP////////////44ICAoiIigbGxnIbGciIiJrGxs3G9vb2c5znOc53////////////////////////////////////////////////////////////////////+5/nOc5z//f///////////zOc5znOc5zn+c5znOc5znO7/////////////5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znOc5znA==');
        captureSound.play();
        
        // Verificar a qualidade da imagem
        if (checkImageQuality) {
            // Verifica a qualidade da imagem antes de processar
            const qualityCheck = checkImageQuality(canvas);
            
            if (qualityCheck.hasIssues) {
                const shouldContinue = await showQualityWarning(qualityCheck);
                if (!shouldContinue) {
                    // O usuário optou por tentar novamente
                    if (videoContainer) videoContainer.style.display = 'block';
                    if (capturedContainer) capturedContainer.style.display = 'none';
                    return;
                }
            }
        }
        
        // Processar a imagem capturada
        showLoadingOverlay('Analisando documento...');
        try {
            const documentData = await processDocumentData(imageDataUrl);
            resultTextarea.value = documentData;
        } catch (error) {
            console.error('Erro ao processar documento:', error);
            showMessage('Erro ao processar documento. Por favor, tente novamente.', 'error');
        } finally {
            hideLoadingOverlay();
        }
        
        // Interromper a câmera após processamento
        stopCamera();
        
    } catch (error) {
        console.error('Erro ao capturar imagem:', error);
        showMessage('Erro ao capturar imagem', 'error');
    }
}

// Função para mostrar mensagem ao usuário com animação melhorada
function showMessage(message, type = 'info') {
    // Criar elemento de mensagem se não existir
    let messageContainer = document.getElementById('message-container');
    
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'message-container';
        document.body.appendChild(messageContainer);
    }
    
    // Criar a mensagem
    const messageBox = document.createElement('div');
    messageBox.className = `message ${type}`;
    
    // Ícone baseado no tipo
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    messageBox.innerHTML = `
        <div class="message-content">
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        </div>
        <div class="message-close">
            <i class="fas fa-times"></i>
        </div>
    `;
    
    // Adicionar a mensagem ao container
    messageContainer.appendChild(messageBox);
    
    // Adicionar evento para fechar ao clicar no X
    messageBox.querySelector('.message-close').addEventListener('click', () => {
        messageBox.style.opacity = '0';
        messageBox.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            messageContainer.removeChild(messageBox);
        }, 300);
    });
    
    // Animar a entrada da mensagem
    setTimeout(() => {
        messageBox.classList.add('show');
    }, 10);
    
    // Remover a mensagem após um intervalo
    const timeout = setTimeout(() => {
        messageBox.classList.remove('show');
        
        setTimeout(() => {
            if (messageContainer.contains(messageBox)) {
                messageContainer.removeChild(messageBox);
            }
        }, 300);
    }, 5000);
    
    // Pausar o temporizador quando o mouse estiver sobre a mensagem
    messageBox.addEventListener('mouseenter', () => {
        clearTimeout(timeout);
    });
    
    // Retomar o temporizador quando o mouse sair da mensagem
    messageBox.addEventListener('mouseleave', () => {
        const newTimeout = setTimeout(() => {
            messageBox.classList.remove('show');
            
            setTimeout(() => {
                if (messageContainer.contains(messageBox)) {
                    messageContainer.removeChild(messageBox);
                }
            }, 300);
        }, 2000);
        
        messageBox._timeout = newTimeout;
    });
}

// Funções para controle da câmera
let facingMode = 'environment'; // 'environment' é a câmera traseira

// Iniciar a câmera
async function startCamera() {
    try {
        // Se já existe um stream ativo, interrompe
        if (stream) {
            stopCamera();
        }
        
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: currentFacingMode
            }
        };
        
        // Obter stream da câmera
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Atribuir o stream ao elemento de vídeo
        if (cameraElement) {
            cameraElement.srcObject = stream;
            
            // Garantir que o vídeo se encaixe no contêiner sem distorção ou zoom
            cameraElement.style.width = '100%';
            cameraElement.style.height = 'auto';
            cameraElement.style.transform = 'none';
            cameraElement.style.objectFit = 'cover';
            
            // Aguardar o carregamento do vídeo para ajustar a interface
            cameraElement.onloadedmetadata = () => {
                // Habilitar botões relevantes
                if (captureImageButton) captureImageButton.disabled = false;
                if (switchCameraButton) switchCameraButton.disabled = false;
            };
            
            // Mostrar mensagem de sucesso
            showMessage('Câmera iniciada com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao iniciar a câmera:', error);
        showMessage('Não foi possível acessar a câmera. Verifique as permissões.', 'error');
    }
}

// Alternar entre câmeras
async function switchCamera() {
    try {
        // Inverter o modo da câmera
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        
        // Parar o stream atual
        stopCamera();
        
        // Reiniciar com o novo modo
        const constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: currentFacingMode
            }
        };
        
        // Obter stream da câmera
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Atribuir o stream ao elemento de vídeo
        if (cameraElement) {
            cameraElement.srcObject = stream;
        }
        
        showMessage(`Câmera ${currentFacingMode === 'user' ? 'frontal' : 'traseira'} ativada`, 'info');
        
    } catch (error) {
        console.error('Erro ao trocar câmera:', error);
        showMessage('Erro ao trocar câmera', 'error');
    }
}

// Função para executar OCR
async function runOCR(imageDataUrl) {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imageDataUrl,
            'por', // Idioma português
            { 
                logger: m => console.log(m),
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,-/()[]{}:;\'"`´~^<>!@#$%*&_+=|\\ãáàâéêíóôõúüç ' 
            }
        );
        
        return text;
    } catch (error) {
        console.error('Erro no OCR:', error);
        throw new Error('Falha ao executar o reconhecimento de texto.');
    }
}

// Função para formatar o resultado do OCR
function formatOCRResults(text) {
    if (!text) return '';
    
    // Substitui múltiplas quebras de linha por uma única
    let formatted = text.replace(/\n{3,}/g, '\n\n');
    
    // Tenta identificar e formatar informações comuns em documentos brasileiros
    
    // CPF
    const cpfRegex = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
    formatted = formatted.replace(cpfRegex, 'CPF: $1');
    
    // RG (vários formatos possíveis)
    const rgRegex = /([0-9]{1,2})\.?([0-9]{3})\.?([0-9]{3})-?([0-9]|X|x)/g;
    formatted = formatted.replace(rgRegex, 'RG: $1.$2.$3-$4');
    
    // Data de nascimento (formatos DD/MM/AAAA ou DD/MM/AA)
    const dateRegex = /(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(\d{2,4})/g;
    formatted = formatted.replace(dateRegex, 'Data de nascimento: $1/$2/$3');
    
    // Título de eleitor (formato XXXX XXXX XXXX)
    const eleitoralRegex = /(\d{4}\s?\d{4}\s?\d{4})/g;
    formatted = formatted.replace(eleitoralRegex, 'Título de eleitor: $1');
    
    // CNH (formato XXXXXXXXXXX)
    const cnhRegex = /([0-9]{11})/g;
    // Não queremos substituir CPFs, então isso pode ser impreciso
    // Esta regex simplificada é apenas um exemplo
    
    return formatted;
}

// Inicializar UI e animações
function initializeUI() {
    // Inicializar eventos dos botões do alerta de qualidade
    const continueAnywayButton = document.getElementById('continueAnyway');
    const tryAgainButton = document.getElementById('tryAgain');
    
    if (continueAnywayButton) {
        continueAnywayButton.addEventListener('click', function() {
            const qualityAlert = document.getElementById('qualityAlert');
            qualityAlert.classList.remove('show');
            
            // Resolve a Promise retornada por showQualityWarning com true (continuar)
            if (window.qualityWarningResolver) {
                window.qualityWarningResolver(true);
                window.qualityWarningResolver = null;
            }
        });
    }
    
    if (tryAgainButton) {
        tryAgainButton.addEventListener('click', function() {
            const qualityAlert = document.getElementById('qualityAlert');
            qualityAlert.classList.remove('show');
            
            // Resolve a Promise retornada por showQualityWarning com false (tentar novamente)
            if (window.qualityWarningResolver) {
                window.qualityWarningResolver(false);
                window.qualityWarningResolver = null;
            }
        });
    }
    
    // Lidar com dicas de captura
    const tipsHeader = document.querySelector('.tips-header');
    const tipsToggle = document.querySelector('.tips-toggle');
    const captureTips = document.querySelector('.capture-tips');
    
    if (tipsHeader && tipsToggle && captureTips) {
        tipsHeader.addEventListener('click', function() {
            captureTips.classList.toggle('show');
            tipsToggle.classList.toggle('active');
        });
        
        // Ocultar dicas por padrão em dispositivos móveis
        if (window.innerWidth <= 768) {
            captureTips.classList.remove('show');
        } else {
            // Em desktop, mostrar por padrão
            captureTips.classList.add('show');
            tipsToggle.classList.add('active');
        }
    }
    
    // Adicionar transições suaves aos elementos da página
    document.querySelectorAll('.fade-in-up, .fade-in-up-delay-1, .fade-in-up-delay-2, .fade-in-up-delay-3').forEach(el => {
        el.style.opacity = '1';
    });
}

// Função para configurar o comportamento do tooltip
function setupTooltip() {
    const tooltipTrigger = document.querySelector('.tooltip-trigger');
    const tooltipContent = document.querySelector('.ai-tooltip-text');
    const tooltipClose = document.querySelector('.tooltip-close');
    
    if (tooltipTrigger && tooltipContent) {
        // Quando o usuário clicar no ícone de informação
        tooltipTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            tooltipContent.classList.add('show');
            
            // Adicionar uma pequena animação ao ícone
            this.style.transform = 'scale(0.9)';
            setTimeout(() => {
                this.style.transform = '';
            }, 300);
        });
        
        // Quando o usuário clicar no botão de fechar
        if (tooltipClose) {
            tooltipClose.addEventListener('click', function(e) {
                e.stopPropagation();
                tooltipContent.classList.remove('show');
            });
        }
        
        // Fechar o tooltip quando clicar fora dele
        document.addEventListener('click', function(e) {
            if (!tooltipContent.contains(e.target) && e.target !== tooltipTrigger) {
                tooltipContent.classList.remove('show');
            }
        });
        
        // Fechar o tooltip com a tecla ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && tooltipContent.classList.contains('show')) {
                tooltipContent.classList.remove('show');
            }
        });
    }
} 