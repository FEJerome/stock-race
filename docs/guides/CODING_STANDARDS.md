# 开发规范模板

## 代码风格
- **前端**: [填写前端框架及编码规范，如Vue 3 Composition API，单文件组件(SFC)格式]
- **后端**: [填写后端框架及编码规范，如CommonJS模块，Express中间件模式]
- **命名约定**:
  - 变量/函数: camelCase (如 `fetchData`, `calculateTotal`)
  - 类/构造函数: PascalCase (如 `BaseService`, `DataProcessor`)
  - 常量: UPPER_SNAKE_CASE (如 `MAX_RETRY_COUNT`, `API_TIMEOUT`)
  - 文件: kebab-case (如 `main-component.vue`, `data-service.js`)
  - CSS类: kebab-case (如 `.component-wrapper`, `.data-table`)

## 编码规范
1. **JavaScript**: 使用ES6+语法，避免var，优先使用const/let
2. **Vue组件**: 使用`<script setup>`语法，组合式API优先
3. **错误处理**: 统一使用try-catch处理异步错误，提供有意义的错误信息
4. **注释要求**: 复杂逻辑必须添加注释，公开API需要文档注释
5. **导入顺序**: 第三方库 → 项目模块 → 相对路径导入

## 测试文件组织规范

### 文件夹结构
[请根据stock-race项目实际情况填写测试文件夹结构，例如：]
- `tests/` - 所有测试文件根目录
  - `tests/unit/` - 单元测试文件
  - `tests/integration/` - 集成测试文件
  - `tests/e2e/` - 端到端测试文件
- `scripts/diagnose/` - 诊断和分析脚本

### 文件命名约定
- **测试文件**: 以 `test_` 开头，描述测试内容（如 `test_data_processing.js`, `test_api_integration.js`）
- **诊断文件**: 以 `diagnose_` 开头，描述诊断目标（如 `diagnose_performance.js`, `diagnose_data_flow.js`）
- 使用蛇形命名法（snake_case）提高可读性

### 分类标准
- **单元测试**: 测试单个模块或工具类功能
- **集成测试**: 测试模块间协作或外部依赖（网络、API、数据库等）
- **端到端测试**: 测试完整业务流程和系统集成
- **诊断脚本**: 用于问题排查和系统分析的临时脚本

### Git忽略规则
[根据项目实际情况配置.gitignore，例如：]
```
# Test and diagnostic files/directories
tests/
scripts/diagnose/
test_*
diagnose_*
```

## Git工作流
- **分支策略**: main分支为稳定版本，feature分支开发新功能
- **提交信息**: 遵循Conventional Commits格式（如：`feat: 添加编码转换功能`）
- **代码审查**: 重要更改需要代码审查
- **版本标签**: 重要里程碑打tag标记