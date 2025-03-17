# 📄 Leitor de Documentos

![Status: Em Desenvolvimento](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)

Um aplicativo web para captura, análise e extração de dados de documentos usando processamento de imagem e inteligência artificial.

> ⚠️ **AVISO:** Este projeto está em fase de desenvolvimento ativo e pode conter funcionalidades incompletas ou bugs.

## 🚀 Funcionalidades

- ✅ Captura de imagens via webcam
- ✅ Troca entre câmera frontal e traseira
- ✅ Verificação da qualidade da imagem (brilho, foco, tamanho)
- ✅ Processamento de imagem para melhorar leitura do texto
- ✅ Extração de texto via OCR (Tesseract.js)
- ✅ Extração avançada de dados com OpenAI (GPT-4 Vision)
- ✅ Interface responsiva para desktop e dispositivos móveis

## 🔧 Tecnologias

- HTML5, CSS3 e JavaScript (Vanilla)
- [Tesseract.js](https://github.com/naptha/tesseract.js) para OCR
- [OpenCV.js](https://docs.opencv.org/4.5.5/df/d0a/tutorial_js_intro.html) para processamento de imagem
- [OpenAI API](https://openai.com/api/) (GPT-4 Vision) para análise inteligente de documentos
- Font Awesome para ícones

## 📋 Requisitos

- Navegador moderno com suporte a JavaScript ES6+
- Acesso à webcam
- Conexão com a internet
- Chave de API da OpenAI (opcional, para recursos de IA)

## 🚀 Como usar

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/leitor-documentos.git
   ```

2. Abra o arquivo `index.html` em seu navegador ou utilize um servidor web local.

3. Para recursos de IA:
   - Clique em "Configurar API OpenAI"
   - Insira sua chave de API
   - Ative a opção "Usar Inteligência Artificial"

4. Siga as instruções na interface para capturar e processar documentos.

## 🧠 Integração com IA

A integração com a API da OpenAI permite:

- Reconhecimento preciso do tipo de documento (RG, CPF, CNH, etc.)
- Extração estruturada de dados como nome, números de documentos, datas
- Melhoria significativa na precisão em relação ao OCR tradicional

> 🔒 **Segurança:** As chaves de API são armazenadas apenas localmente em seu navegador e nunca são enviadas para nossos servidores.

## 🛣️ Próximos passos

- [ ] Suporte para captura de múltiplas páginas
- [ ] Melhoria na detecção automática de bordas do documento
- [ ] Exportação para formatos adicionais (PDF, JSON)
- [ ] Reconhecimento de QR Codes e códigos de barras
- [ ] Suporte offline para funcionalidades básicas
- [ ] Implementação de PWA (Progressive Web App)

## 📝 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.

---

Desenvolvido por [Lucca Goltzman](https://github.com/luccagoltzman) - 2025
