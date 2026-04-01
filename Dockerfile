FROM node:20-alpine

WORKDIR /app

# Copiar solo lo necesario de iglesia-app
COPY iglesia-app/package*.json ./
RUN npm install

COPY iglesia-app/ ./

EXPOSE 3000

CMD ["npm", "start"]
