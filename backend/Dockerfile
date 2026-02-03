# 使用Node.js LTS版本作为基础镜像
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖（包括开发依赖）
RUN npm ci --only=production

# 复制Prisma schema
COPY prisma ./prisma/

# 生成Prisma客户端
RUN npx prisma generate

# 复制源代码
COPY src ./src/

# 复制其他配置文件
COPY .env.example ./
COPY docker-compose.yml ./

# 生产阶段
FROM node:18-alpine AS production

# 设置环境变量
ENV NODE_ENV=production

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# 设置工作目录
WORKDIR /app

# 从builder阶段复制文件
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/.env.example ./

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# 启动命令
CMD ["node", "src/app.js"]

# 开发阶段
FROM node:18-alpine AS development

# 设置环境变量
ENV NODE_ENV=development

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装所有依赖（包括开发依赖）
RUN npm ci

# 复制Prisma schema
COPY prisma ./prisma/

# 生成Prisma客户端
RUN npx prisma generate

# 复制源代码
COPY src ./src/

# 复制其他配置文件
COPY .env.example ./
COPY docker-compose.yml ./
COPY docker-compose.dev.yml ./

# 暴露端口
EXPOSE 3001

# 开发模式启动命令
CMD ["npm", "run", "dev"]