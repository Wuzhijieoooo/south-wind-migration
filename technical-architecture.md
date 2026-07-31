# Technical Architecture

## 技术栈

- Vite + ES Modules
- HTML5 Canvas 2D
- DOM/CSS HUD 与弹层
- Vitest 规则层测试
- localStorage 偏好与本地最佳记录

## 模块边界

- `src/domain`：状态机、资源规则、路线、风险、强化与事件日志，不访问 DOM/Canvas。
- `src/game`：世界渲染、鸟群模拟、风路、输入、音频和游戏编排。
- `src/ui`：首屏、HUD、路线/强化选择、结算和调试面板。
- `src/styles`：视觉系统、响应式、安全区和可访问状态。

规则层按固定步长更新；渲染按浏览器帧率插值。内容定义保持为静态配置，运行时不请求模型或后端。

## 性能策略

所有平台固定 20 只计分候鸟。设备连续 3 秒低于 45 FPS 时，仅降低远景、粒子和 DPR，不改变候鸟数量或规则结果。
