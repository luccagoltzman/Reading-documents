// Elementos da DOM
const cameraElement = document.getElementById('camera');
const canvasElement = document.getElementById('canvas');
const startCameraButton = document.getElementById('startCamera');
const stopCameraButton = document.getElementById('stopCamera');
const captureImageButton = document.getElementById('captureImage');
const resultElement = document.getElementById('result');
const loadingElement = document.getElementById('loading');

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
captureImageButton.addEventListener('click', () => {
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
    
    // Processa a imagem capturada
    processImage(imageDataUrl);
});

// Função para processar a imagem e extrair o texto
async function processImage(imageDataUrl) {
    // Exibe o indicador de carregamento
    loadingElement.style.display = 'flex';
    resultElement.innerHTML = '';

    try {
        if (opencv_ready) {
            // Pré-processamento da imagem usando OpenCV.js
            const processedImageDataUrl = preprocessImage(imageDataUrl);
            
            // Executa OCR com Tesseract.js
            const result = await Tesseract.recognize(
                processedImageDataUrl,
                'por', // Português
                { 
                    logger: message => console.log(message)
                }
            );

            // Extrai e processa o texto reconhecido
            const extractedText = result.data.text;
            const documentInfo = parseDocumentInfo(extractedText);
            
            // Exibe os resultados
            displayResults(documentInfo);
        } else {
            // Se OpenCV não estiver pronto, usa apenas Tesseract
            const result = await Tesseract.recognize(
                imageDataUrl,
                'por', // Português
                { 
                    logger: message => console.log(message)
                }
            );
            
            // Extrai e processa o texto reconhecido
            const extractedText = result.data.text;
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
        
        // Redimensiona a imagem para melhorar o processamento (opcional, dependendo do tamanho original)
        const maxWidth = 1200; // Largura máxima para processamento
        if (img.cols > maxWidth) {
            const scaleFactor = maxWidth / img.cols;
            const newSize = new cv.Size(maxWidth, Math.round(img.rows * scaleFactor));
            cv.resize(gray, gray, newSize, 0, 0, cv.INTER_AREA);
        }
        
        // Aplica desfoque gaussiano para reduzir ruído
        let blurred = new cv.Mat();
        const ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
        
        // Aplica filtro adaptativo para melhorar o contraste
        let binary = new cv.Mat();
        cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
        
        // Operação morfológica para remover ruído
        let kernel = cv.Mat.ones(1, 1, cv.CV_8U);
        let cleaned = new cv.Mat();
        cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, kernel);
        
        // Exibe a imagem processada no canvas
        cv.imshow(canvasElement, cleaned);
        
        // Libera memória
        img.delete();
        gray.delete();
        blurred.delete();
        binary.delete();
        kernel.delete();
        cleaned.delete();
        
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
    const normalizedText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    
    // Expressões regulares para extração de dados
    const cpfRegex = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
    const rgRegex = /(\d{1,2}\.?\d{3}\.?\d{3}-?[0-9X])/g;
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
    const cnhRegex = /(registro nacional|habilitacao|CNH|carteira nacional)/i;
    const rgKeywordRegex = /(identidade|RG|carteira de identidade)/i;
    
    // Verifica o tipo de documento
    if (cnhRegex.test(normalizedText)) {
        info.type = 'CNH';
        
        // Para CNH, busca a categoria
        const categoryMatch = normalizedText.match(/cat\.?:?\s*([A-Z]+)/i);
        if (categoryMatch) {
            info.category = categoryMatch[1].toUpperCase();
        }
        
        // Para CNH, busca o número da habilitação
        const licenseMatch = normalizedText.match(/registro:?\s*(\d+)/i) || 
                            normalizedText.match(/registro nacional:?\s*(\d+)/i) ||
                            normalizedText.match(/nr registro:?\s*(\d+)/i);
        if (licenseMatch) {
            info.driverLicense = licenseMatch[1];
        }
        
        // Busca validade da CNH
        const validityMatch = normalizedText.match(/validade:?\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (validityMatch) {
            info.expirationDate = validityMatch[1];
        }
        
        // Busca data de primeira habilitação
        const firstLicenseMatch = normalizedText.match(/primeira habilitacao:?\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (firstLicenseMatch) {
            info.firstLicenseDate = firstLicenseMatch[1];
        }
        
    } else if (rgKeywordRegex.test(normalizedText)) {
        info.type = 'RG';
        
        // Busca órgão emissor
        const issuerMatch = normalizedText.match(/ssp\/?([A-Z]{2})/i) || 
                           normalizedText.match(/([A-Z]{2,4}[-\/][A-Z]{2})/i) ||
                           normalizedText.match(/orgao emissor:?\s*([A-Z\/\-]{2,7})/i);
        if (issuerMatch) {
            info.issuer = issuerMatch[1].toUpperCase();
        }
        
        // Busca data de expedição
        const issueDateMatch = normalizedText.match(/expedicao:?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                               normalizedText.match(/emissao:?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                               normalizedText.match(/data emissao:?\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (issueDateMatch) {
            info.issueDate = issueDateMatch[1];
        }
    }
    
    // Extrai CPF
    const cpfMatch = text.match(cpfRegex);
    if (cpfMatch) {
        info.cpf = cpfMatch[0];
    }
    
    // Extrai RG
    const rgMatch = text.match(rgRegex);
    if (rgMatch) {
        info.rg = rgMatch[0];
    }
    
    // Extrai datas (a primeira é geralmente data de nascimento)
    const dates = text.match(dateRegex);
    if (dates && dates.length > 0) {
        // Busca especificamente a data de nascimento
        const birthDateMatch = normalizedText.match(/nascimento:?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                               normalizedText.match(/data de nascimento:?\s*(\d{2}\/\d{2}\/\d{4})/i);
        
        if (birthDateMatch) {
            info.birthDate = birthDateMatch[1];
        } else {
            info.birthDate = dates[0];
        }
    }
    
    // Busca pelo nome
    const nameMatch = normalizedText.match(/nome:?\s*([A-Za-z\s]+)/i) ||
                      normalizedText.match(/nome completo:?\s*([A-Za-z\s]+)/i);
    if (nameMatch && nameMatch[1]) {
        info.name = formatName(nameMatch[1]);
    }
    
    // Busca pela nacionalidade
    const nationalityMatch = normalizedText.match(/nacionalidade:?\s*([A-Za-z\s]+)/i);
    if (nationalityMatch && nationalityMatch[1]) {
        info.nationality = formatName(nationalityMatch[1]);
    }
    
    // Busca pela naturalidade
    const naturalnessMatch = normalizedText.match(/naturalidade:?\s*([A-Za-z\s\/\-]+)/i);
    if (naturalnessMatch && naturalnessMatch[1]) {
        info.naturalness = formatName(naturalnessMatch[1]);
    }
    
    // Busca pela filiação (pai)
    const fatherMatch = normalizedText.match(/pai:?\s*([A-Za-z\s]+)/i) ||
                        normalizedText.match(/filiacao pai:?\s*([A-Za-z\s]+)/i);
    if (fatherMatch && fatherMatch[1]) {
        info.fatherName = formatName(fatherMatch[1]);
    }
    
    // Busca pela filiação (mãe)
    const motherMatch = normalizedText.match(/mae:?\s*([A-Za-z\s]+)/i) ||
                        normalizedText.match(/filiacao mae:?\s*([A-Za-z\s]+)/i);
    if (motherMatch && motherMatch[1]) {
        info.motherName = formatName(motherMatch[1]);
    }
    
    // Busca pelo endereço
    const addressMatch = normalizedText.match(/endereco:?\s*([A-Za-z0-9\s,\.-]+)/i);
    if (addressMatch && addressMatch[1]) {
        info.address = formatName(addressMatch[1]);
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
        
        if (info.firstLicenseDate) {
            html += `<p class="result-item" style="--i:13"><strong>Primeira Habilitação:</strong> ${info.firstLicenseDate}</p>`;
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