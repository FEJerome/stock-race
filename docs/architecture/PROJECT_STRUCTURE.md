# 项目结构模板

[请在此处填写stock-race项目的目录结构，使用树状图格式，例如：]

```
stock-race/
├── frontend/                    # 前端应用
│   ├── src/
│   │   ├── api/                # API客户端封装
│   │   ├── components/         # 组件目录
│   │   ├── composables/        # 组合式函数
│   │   ├── utils/              # 工具函数
│   │   ├── App.vue             # 根组件
│   │   └── main.js             # 应用入口
│   ├── package.json            # 前端依赖配置
│   ├── vite.config.js          # 构建配置
│   └── README.md               # 前端文档
├── backend/                     # 后端API服务
│   ├── src/
│   │   ├── controllers/        # 控制器
│   │   ├── services/           # 业务服务
│   │   ├── models/             # 数据模型
│   │   ├── routes/             # API路由
│   │   ├── middleware/         # 中间件
│   │   └── utils/              # 工具类
│   ├── package.json            # 后端依赖配置
│   └── index.js                # 服务器入口
├── docs/                       # 项目文档目录
├── CLAUDE.md                   # 本项目主文档
└── .gitignore                  # Git忽略配置
```

**说明**：
- 此结构为通用模板，请根据stock-race项目实际需求调整
- 前端和后端的具体目录结构可根据技术栈变化
- 文档目录包含所有项目文档和多智能体协作文件

<!-- 原项目结构为小说爬虫项目，已清理为通用模板 -->