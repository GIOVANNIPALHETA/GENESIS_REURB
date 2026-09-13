# 🏛️ GENESIS REURB - Sistema de Gestão Fundiária

Sistema completo para gestão de Regularização Fundiária Urbana (REURB), integrando cadastro técnico de lotes, titulares, plantas georreferenciadas, geração de documentos cartoriais, cobranças Asaas e conciliação financeira com o Meu Dinheiro.

---

## 🚀 Como Iniciar Corretamente o Servidor

Para que o sistema funcione perfeitamente sem erros de conexão de banco de dados ou portas, siga a ordem de inicialização abaixo:

### 1. Pré-requisitos
- **Node.js**: Versão 18 ou superior.
- **Docker Desktop**: Instalado e em execução.
- **Google Drive**: Acesso configurado caso utilize upload/sincronização em nuvem.

---

### 2. Passo a Passo de Inicialização

#### Passo 1: Iniciar o Banco de Dados (PostgreSQL via Docker)
Certifique-se de que o Docker Desktop está aberto e execute no terminal raiz do projeto:

```powershell
docker compose up -d