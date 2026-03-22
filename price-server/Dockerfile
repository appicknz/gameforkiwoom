FROM node:20-alpine

WORKDIR /app

# 패키지 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY index.js .

# 포트 노출
EXPOSE 8080

# WebSocket 서버 시작
CMD ["node", "index.js"]
