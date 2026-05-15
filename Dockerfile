# Stage 1: Build the Angular app
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build -- --configuration production

# Stage 2: Serve the app with NGINX
FROM nginx:alpine

# Copy built files from the builder stage
# Assuming the build output is in dist/codesync-frontend
COPY --from=builder /app/dist/codesync-frontend/browser /usr/share/nginx/html

# Provide a simple custom nginx configuration if needed to handle Angular routing
RUN echo 'server { \
    listen       80; \
    server_name  localhost; \
    location / { \
        root   /usr/share/nginx/html; \
        index  index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
