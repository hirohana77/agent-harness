# agent-harness (中文说明)

> 面向自主 AI 编程智能体的确定性执行沙箱、轨迹评估与断言测试 Harness

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## 核心特性

- 🛡️ **隔离沙箱与路径约束**：动态创建隔离临时工作区，初始化 Git 独立环境，强制约束文件路径不得越权逃逸。
- 🔒 **安全守卫策略**：拦截危险命令（如 `rm -rf /`、未授权网络请求等），防止智能体误操作破坏宿主系统。
- ⏱️ **确定性轨迹记录**：全流程精细化记录 Agent 的轮次（Turn）、思考过程（Thought）、工具调用（Tool Calls）、Token 消耗与耗时。
- 🔁 **离线轨迹回放（Deterministic Replay）**：无需再次消耗 LLM API，直接重放已记录的操作轨迹，高效进行回归比对与环境复现。
- 🧪 **多维断言验证引擎**：
  - **文件断言**：存在性、文本包含/排除、正则匹配、精确内容比对、JSON Schema 校验。
  - **命令断言**：运行项目原生测试命令（如 `npm test`、`pytest` 等）并断言退出码与控制台输出。
  - **行为轨迹断言**：限制最大轮次、指定工具调用、Token 上限守卫。
- 📊 **多格式评测报告**：支持控制台高亮终端报表、GitHub PR 专用的 Markdown 表格、以及自动化流水线集成的 JSON 报表。

---

## 快速安装

```bash
# 全局安装 CLI
npm install -g agent-harness

# 或作为项目依赖
pnpm add agent-harness
```

---

## 快速开始

### 1. 初始化场景模版
```bash
agent-harness init --output ./my-scenario.yaml
```

### 2. 校验场景配置合法性
```bash
agent-harness validate --scenario ./my-scenario.yaml
```

### 3. 运行评测场景
```bash
agent-harness run   --scenario ./my-scenario.yaml   --report-json ./eval-report.json   --report-md ./eval-report.md
```

### 4. 离线确定性重放
```bash
agent-harness replay   --scenario ./my-scenario.yaml   --trajectory ./trajectory.json
```

---

## 开源协议

本项目采用 MIT 许可证开源。
