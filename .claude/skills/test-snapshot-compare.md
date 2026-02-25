---
name: test-snapshot-compare
description: 使用 Pixelmatch 进行小程序截图对比测试（视觉回归测试）
---

你是一名视觉回归测试专家。使用 Pixelmatch 进行小程序页面截图对比，检测 UI 变更。

## 工作原理

1. **截图**：使用 MCP `screenshot` 工具捕获当前页面
2. **对比**：使用 Pixelmatch 与基准图对比
3. **判定**：根据差异阈值判断是否通过

## 使用流程

1. **捕获基准图（首次运行）**
   ```
   connect_devtools({ projectPath: "/path/to/miniprogram" })
   navigate_to({ url: "/pages/index" })
   wait_for({ selector: ".page-ready" })
   screenshot({ path: "baselines/index-baseline.png" })
   ```

2. **捕获测试图并对比**
   ```
   screenshot({ path: "snapshots/index-test.png" })
   compare_snapshots({
     baseline: "baselines/index-baseline.png",
     test: "snapshots/index-test.png",
     diffOutput: "diffs/index-diff.png",
     threshold: 0.05
   })
   ```

## 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--baseline` | string | - | 基准截图路径 |
| `--test` | string | - | 测试截图路径（或 auto 自动截图） |
| `--diff` | string | - | 差异图输出路径 |
| `--threshold` | float | 0.05 | 差异阈值（0-1，1=100%） |
| `--includeAA` | boolean | false | 是否包含抗锯齿差异 |

## Pixelmatch 配置

```javascript
const options = {
  threshold: 0.1,        // 感知阈值（0-1）
  includeAA: false,      // 忽略抗锯齿像素
  alpha: 0.1,           // Alpha 通道阈值
  aaColor: [255, 255, 0], // 抗锯齿差异颜色（黄色）
  diffColor: [255, 0, 0], // 差异颜色（红色）
  diffColorAlt: null     // 暗色差异颜色
}
```

## 差异阈值建议

| 场景 | 推荐阈值 | 说明 |
|------|----------|------|
| 精确对比 | 0.01 | 要求像素级一致 |
| 标准对比 | 0.05 | 忽略轻微渲染差异 |
| 宽松对比 | 0.1 | 允许动画/字体差异 |

## 使用示例

```bash
# 自动截图并对比
/test-snapshot-compare --page=/pages/index --threshold=0.05

# 对比已有截图
/test-snapshot-compare --baseline=base.png --test=test.png --diff=diff.png

# 多分辨率对比
/test-snapshot-compare --page=/pages/index --devices=iphone14,iphone14pro,iphoneSE
```

## 集成到 CI

```yaml
# .github/workflows/visual-regression.yml
- name: Run Snapshot Tests
  run: |
    /test-snapshot-compare --page=/pages/index --page=/pages/ranking
```

## 注意事项

1. **动态内容**：时间、随机数据等需要在截图前固定
2. **动画**：确保截图前动画已完成
3. **字体**：不同系统字体渲染可能有差异
4. **定时更新**：定期更新基准图以适应 intentional UI changes
