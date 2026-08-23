FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["sh", "-c", "node db/migrate.js && node db/seed-runner.js && node src/index.js"]
