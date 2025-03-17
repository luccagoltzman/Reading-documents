// Elementos da DOM
const cameraElement = document.getElementById('camera');
const canvasElement = document.getElementById('canvas');
const startCameraButton = document.getElementById('startCamera');
const stopCameraButton = document.getElementById('stopCamera');
const captureImageButton = document.getElementById('captureImage');
const resultElement = document.getElementById('result');
const loadingElement = document.getElementById('loading');
const tipsToggleElement = document.querySelector('.tips-toggle');
const captureListElement = document.querySelector('.capture-tips');

// Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
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
        stream.getTracks().forEach(track => {
            track.stop();
        });
        stream = null;
        
        // Limpa o src do elemento de vídeo
        cameraElement.srcObject = null;
        
        // Atualiza o estado dos botões
        startCameraButton.disabled = false;
        stopCameraButton.disabled = true;
        captureImageButton.disabled = true;
        
        // Remove a classe de câmera ativa
        document.querySelector('.camera-container').classList.remove('camera-active');
        
        console.log('Câmera interrompida com sucesso');
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
        const qualityCheck = checkImageQuality(imageDataUrl);
        
        if (qualityCheck.issues) {
            const shouldContinue = await showQualityWarning(qualityCheck);
            if (!shouldContinue) {
                return; // Usuário optou por não continuar com a imagem de baixa qualidade
            }
        }
    }
    
    // Processa a imagem capturada
    processImage(imageDataUrl);
});

// Função para verificar a qualidade da imagem antes do processamento
function checkImageQuality(imageDataUrl) {
    try {
        // Resultado da verificação
        const result = {
            issues: false,
            isDark: false,
            isBlurry: false,
            isSmall: false,
            message: ''
        };
        
        // Carrega a imagem para o OpenCV
        let img = cv.imread(canvasElement);
        
        // Verifica o tamanho
        if (img.rows < 300 || img.cols < 300) {
            result.issues = true;
            result.isSmall = true;
            result.message += 'Imagem muito pequena. ';
        }
        
        // Converte para escala de cinza para análises
        let gray = new cv.Mat();
        cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
        
        // Verifica se está escura - calcula a média de brilho
        let meanValue = new cv.Mat();
        cv.mean(gray); // Retorna um array com a média de intensidade
        const brightness = cv.mean(gray)[0]; // Pega o valor do primeiro canal (único em grayscale)
        
        if (brightness < 80) { // Limiar para considerar imagem escura
            result.issues = true;
            result.isDark = true;
            result.message += 'Imagem muito escura. ';
        }
        
        // Verifica desfoque - usando variação Laplaciana
        let laplacian = new cv.Mat();
        cv.Laplacian(gray, laplacian, cv.CV_64F);
        
        let stdDev = new cv.Mat();
        let mean = new cv.Mat();
        cv.meanStdDev(laplacian, mean, stdDev);
        
        const stdDevValue = stdDev.data64F[0];
        if (stdDevValue < 5) { // Limiar para considerar imagem desfocada
            result.issues = true;
            result.isBlurry = true;
            result.message += 'Imagem desfocada. ';
        }
        
        // Libera a memória
        img.delete();
        gray.delete();
        laplacian.delete();
        stdDev.delete();
        mean.delete();
        
        if (result.issues) {
            result.message += 'Tente novamente com melhor iluminação e mantenha a câmera estável.';
        }
        
        return result;
        
    } catch (error) {
        console.error('Erro ao verificar qualidade da imagem:', error);
        return { issues: false }; // Em caso de erro, continua com o processamento
    }
}

// Função para mostrar aviso de qualidade da imagem
async function showQualityWarning(qualityCheck) {
    // Criando o elemento de alerta
    const alertEl = document.createElement('div');
    alertEl.className = 'quality-alert';
    
    let alertContent = `
        <div class="quality-alert-content">
            <h3><i class="fas fa-exclamation-triangle"></i> Aviso de Qualidade</h3>
            <p>${qualityCheck.message}</p>
            <p>Deseja continuar mesmo assim ou tentar novamente?</p>
            <div class="quality-alert-buttons">
                <button id="continue-anyway" class="alert-button continue">Continuar</button>
                <button id="try-again" class="alert-button tryagain">Tentar Novamente</button>
            </div>
        </div>
    `;
    
    alertEl.innerHTML = alertContent;
    document.body.appendChild(alertEl);
    
    // Aplica animação de entrada
    setTimeout(() => {
        alertEl.classList.add('show');
    }, 10);
    
    // Retorna uma Promise que será resolvida com a escolha do usuário
    return new Promise(resolve => {
        document.getElementById('continue-anyway').addEventListener('click', () => {
            alertEl.classList.remove('show');
            setTimeout(() => {
                alertEl.remove();
                resolve(true); // Continuar com a imagem atual
            }, 300);
        });
        
        document.getElementById('try-again').addEventListener('click', () => {
            alertEl.classList.remove('show');
            setTimeout(() => {
                alertEl.remove();
                resolve(false); // Tentar novamente
            }, 300);
        });
    });
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