# Ministrando a Palavra - Aplicação para Pregadores

Este projeto é uma ferramenta completa para pastores e ministros, oferecendo criação de esboços com IA, organização de agenda ministerial e suporte para pregação (Modo Púlpito).

## 🚀 Como Publicar no GitHub

1. Inicialize um repositório Git local se ainda não o fez:
   ```bash
   git init
   ```
2. Adicione os arquivos:
   ```bash
   git add .
   ```
3. Faça o commit:
   ```bash
   git commit -m "Initial commit"
   ```
4. Crie um repositório no GitHub e adicione o remote:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git
   ```
5. Envie os arquivos:
   ```bash
   git push -u origin main
   ```

## 🌐 Como Publicar na Hostinger (Node.js)

1. No painel da Hostinger, crie uma aplicação **Node.js**.
2. Faça o upload dos arquivos do projeto (ou conecte via GitHub).
3. No terminal da Hostinger (SSH) ou via painel:
   - Instale as dependências: `npm install`
   - Gere o build: `npm run build`
4. Configure o **Arquivo de Inicialização** (Startup File) como:
   `dist/server.cjs`
5. Configure as **Variáveis de Ambiente** no painel da Hostinger (ou arquivo `.env` na raiz):

   ### Backend (Privado)
   - `GEMINI_API_KEY`: Sua chave da API do Google Gemini.
   - `FIREBASE_PROJECT_ID`: ID do seu projeto Firebase.
   - `FIREBASE_CLIENT_EMAIL`: Email da conta de serviço.
   - `FIREBASE_PRIVATE_KEY`: Chave privada da conta de serviço.
   - `NODE_ENV`: Defina como `production`.

   ### Frontend (Público - Prefixo VITE_)
   - `VITE_FIREBASE_API_KEY`: Sua Firebase API Key.
   - `VITE_FIREBASE_AUTH_DOMAIN`: Seu Auth Domain.
   - `VITE_FIREBASE_PROJECT_ID`: Seu Project ID.
   - `VITE_FIREBASE_STORAGE_BUCKET`: Seu Storage Bucket.
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: Seu Messaging Sender ID.
   - `VITE_FIREBASE_APP_ID`: Seu App ID.
   - `VITE_FIREBASE_DATABASE_ID`: ID do seu banco Firestore (opcional se for o default).
   - `VITE_VAPID_KEY`: Sua chave VAPID para notificações.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React, Vite, Tailwind CSS, Framer Motion.
- **Backend:** Node.js, Express.
- **IA:** Google Gemini API.
- **Banco de Dados & Auth:** Firebase Firestore e Firebase Auth.

---
Desenvolvido com excelência para o ministério da Palavra.
