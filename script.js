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
        
        // Aplica filtro adaptativo para melhorar o contraste
        let binary = new cv.Mat();
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
        
        // Exibe a imagem processada no canvas
        cv.imshow(canvasElement, binary);
        
        // Libera memória
        img.delete();
        gray.delete();
        binary.delete();
        
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
        formattedText: text.replace(/\n/g, '<br>')
    };
    
    // Expressões regulares para extração de dados
    const cpfRegex = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
    const rgRegex = /(\d{1,2}\.?\d{3}\.?\d{3}-?[0-9X])/g;
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
    const cnhRegex = /(registro nacional|habilitação|CNH|carteira nacional)/i;
    const rgKeywordRegex = /(identidade|RG|Carteira de Identidade)/i;
    
    // Verifica o tipo de documento
    if (cnhRegex.test(text)) {
        info.type = 'CNH';
        
        // Para CNH, busca a categoria
        const categoryMatch = text.match(/CAT\.?:?\s*([A-Z]+)/i);
        if (categoryMatch) {
            info.category = categoryMatch[1];
        }
        
        // Para CNH, busca o número da habilitação
        const licenseMatch = text.match(/registro:?\s*(\d+)/i);
        if (licenseMatch) {
            info.driverLicense = licenseMatch[1];
        }
    } else if (rgKeywordRegex.test(text)) {
        info.type = 'RG';
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
    
    // Extrai datas
    const dates = text.match(dateRegex);
    if (dates && dates.length > 0) {
        info.birthDate = dates[0];
        if (dates.length > 1) {
            info.expirationDate = dates[1];
        }
    }
    
    // Busca pelo nome (assume que está próximo da palavra "Nome" ou "Nome Completo")
    const nameMatch = text.match(/nome:?\s*([A-ZÀ-ÚÇ\s]+)/i);
    if (nameMatch && nameMatch[1]) {
        info.name = nameMatch[1].trim();
    }
    
    return info;
}

// Função para exibir os resultados extraídos
function displayResults(info) {
    let html = '';
    
    if (info.type !== 'Desconhecido') {
        html += `<p><strong>Tipo de Documento:</strong> ${info.type}</p>`;
    }
    
    if (info.name) {
        html += `<p><strong>Nome:</strong> ${info.name}</p>`;
    }
    
    if (info.cpf) {
        html += `<p><strong>CPF:</strong> ${info.cpf}</p>`;
    }
    
    if (info.rg) {
        html += `<p><strong>RG:</strong> ${info.rg}</p>`;
    }
    
    if (info.birthDate) {
        html += `<p><strong>Data de Nascimento:</strong> ${info.birthDate}</p>`;
    }
    
    if (info.type === 'CNH') {
        if (info.driverLicense) {
            html += `<p><strong>Registro da CNH:</strong> ${info.driverLicense}</p>`;
        }
        if (info.category) {
            html += `<p><strong>Categoria:</strong> ${info.category}</p>`;
        }
        if (info.expirationDate) {
            html += `<p><strong>Validade:</strong> ${info.expirationDate}</p>`;
        }
    }
    
    if (html === '') {
        html = `<p>Não foi possível identificar informações do documento. Tente novamente com melhor iluminação.</p>
                <p><strong>Texto extraído:</strong></p>
                <div class="extracted-text">${info.formattedText}</div>`;
    }
    
    resultElement.innerHTML = html;
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