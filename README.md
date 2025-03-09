# Leitor de Documentos com Câmera

Um aplicativo web que permite a leitura e extração de informações de documentos (RG e CNH) usando a câmera do dispositivo.

## Funcionalidades

- Captura de imagens usando a câmera do dispositivo
- Processamento de imagem para melhorar a qualidade da leitura
- Reconhecimento óptico de caracteres (OCR) para extrair texto
- Análise e identificação automática de informações em documentos de identidade e CNH
- Interface responsiva que funciona em smartphones e desktops

## Tecnologias Utilizadas

- **HTML5**: Estrutura da aplicação e acesso à câmera via MediaDevices API
- **CSS3**: Estilização da interface com design responsivo
- **JavaScript**: Implementação da lógica da aplicação
- **Tesseract.js**: Biblioteca de OCR para reconhecimento de texto
- **OpenCV.js**: Biblioteca de visão computacional para pré-processamento de imagem

## Como Usar

1. Abra a aplicação em um navegador moderno (Chrome, Firefox, Safari ou Edge)
2. Clique em "Iniciar Câmera" e conceda permissão de acesso
3. Posicione o documento dentro da área demarcada na tela
4. Clique em "Capturar Imagem"
5. Aguarde o processamento e visualize as informações extraídas

## Recomendações para Melhor Resultado

- Use em ambiente bem iluminado
- Evite reflexos e sombras sobre o documento
- Mantenha o documento completamente dentro da área demarcada
- Segure o dispositivo de forma estável ao capturar a imagem

## Privacidade

- Todo o processamento é realizado localmente no seu dispositivo
- Nenhuma imagem ou dado do documento é enviado para servidores externos
- Não há armazenamento permanente das informações extraídas

## Limitações

- A precisão do reconhecimento depende da qualidade da imagem capturada
- Documentos com degradação física, reflexos ou má iluminação podem ter reconhecimento prejudicado
- Alguns formatos mais antigos ou não padronizados podem não ser reconhecidos corretamente

## Requisitos de Sistema

- Navegador com suporte a JavaScript ES6+
- Acesso à câmera do dispositivo
- Conexão com a internet (apenas para o carregamento inicial das bibliotecas)

## Licença

Este projeto é distribuído sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.
