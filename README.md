# Slimi Tasks

App web em português para organizar tarefas e cuidar de companheiros virtuais. Feito com React, Vite e Firebase.

## Funcionalidades

- Conta e login por e-mail e senha com Firebase Authentication.
- Tarefas pessoais armazenadas no Cloud Firestore.
- Quatro pets com progresso separado, níveis, felicidade, energia e alimentação.
- Concluir tarefas dá experiência ao pet selecionado.
- Ações para alimentar, brincar e deixar o pet descansar.

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e preencha a configuração do Firebase Web App.
4. Execute `npm run dev`.

O projeto Firebase precisa ter Authentication com Email/Senha habilitado e uma base Cloud Firestore. As regras estão em `firestore.rules`.

## Build e publicação

- `npm run build` gera o site na pasta `dist`.
- `firebase deploy --only hosting` publica manualmente no Firebase Hosting.
- O projeto está configurado para `slimy-tasks`; ajuste `.firebaserc` se for usar outro projeto.
- O `firebase.json` configura uma SPA e evita cache persistente dos arquivos HTML.

## Dados e segurança

- `users/{uid}/tasks/{taskId}`: tarefas do usuário.
- `users/{uid}/pets/{petId}`: progresso individual dos pets.
- `firestore.rules` restringe leitura e escrita à conta autenticada que possui os dados.
- Nunca adicione `.env`, tokens ou chaves privadas ao repositório. A chave da aplicação Web é usada no navegador; proteja dados com regras do Firestore.

## Personalização

- Pets e valores iniciais: `src/data/pets.js`.
- Interface e interações: `src/App.jsx` e `src/styles.css`.
- Conexão Firebase: `src/firebase.js` e variáveis `VITE_FIREBASE_*`.

Os pets usam emojis como arte provisória.
