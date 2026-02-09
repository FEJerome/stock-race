#!/bin/bash

# 修复AdminController.js中的formatResponse调用

echo "=== 修复AdminController.js ==="

# 备份原始文件
cp backend/src/controllers/AdminController.js backend/src/controllers/AdminController.js.backup

# 替换所有formatResponse调用
sed -i 's/return formatResponse(res, \(.*\), \(.*\), false, \(.*\));/return res.status(\3).json(errorResponse(\1, \2));/g' backend/src/controllers/AdminController.js
sed -i 's/return formatResponse(res, \(.*\), \(.*\));/return res.json(successResponse(\1, \2));/g' backend/src/controllers/AdminController.js

echo "✅ 修复完成"
echo "备份文件: backend/src/controllers/AdminController.js.backup"