FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY index.mjs security.mjs service.mjs smartthings.mjs store.mjs ./
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]
