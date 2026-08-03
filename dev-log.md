# Development Log

## 2026-07-31 · Project bootstrap

- Changes: 建立 Vite 项目骨架、MIT 许可、第三方素材说明和六份必需项目文档。
- Validation: 已确认 Node.js `v22.17.0`、npm `10.9.2`，原始 Migration 仓库使用 MIT 许可。
- Known risk: 两段原作 MP3 的独立版权来源尚未核实，只用于本地原型。
- Next step: 实现风路、鸟群、收拢和纯规则状态。
- Commit: `chore: initialize migration roguelite prototype foundation`

## 2026-08-03 · Playable prototype validation

- Changes: 修正路线中轴默认稳路与 `旧河`折后价格；路线门不再打断救援窗口；停栖移除正确的尾鸟；结算显示中文航路并规范分钟进位；竖屏遮罩暂停规则推进；旋转与暂停时释放收拢输入；窄屏强化正文提升至 14px；新增路线、救援窗口与结算格式测试。
- Validation: `npm test` 22/22 通过，`npm run build` 通过；浏览器完成序章、三地区、三次强化、停栖、到达、结算、暂停和再次迁徙回归；`844x390`、`667x375`、`390x844` 无溢出；竖屏持续 2 秒时迁徙进度不变；console 无 warning/error；连续 5 次采样均为 60 FPS。
- Known risk: 浏览器自动化无法模拟持续 1.2 秒的真实按压，救回分支由规则测试覆盖；真实移动设备的输入 P95 与 1% low 尚未测量；两段 MP3 公开发布前仍需确认版权或替换。
- Next step: 完成 10 人无指导双局试玩和真实移动设备性能采样，再按 Go/No-Go 门禁调整核心手感。
- Commit: `fix: harden route defaults and mobile migration UI`
