FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js app.js migrate.js auth-stub.js ./
COPY lib ./lib
COPY routes ./routes
COPY economia ./economia
COPY auth ./auth
COPY perfil ./perfil
COPY mcp ./mcp
COPY migrations ./migrations
RUN for f in server.js app.js migrate.js auth-stub.js lib/*.js routes/*.js economia/*.js auth/*.js perfil/*.js mcp/*.js; do node --check "$f" || exit 1; done
USER node
EXPOSE 3000
CMD ["node", "server.js"]
