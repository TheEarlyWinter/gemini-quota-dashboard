export default class GeminiQuotaDashboardPlugin {
  async onload() {
    this.ctx.log.info("[gemini-quota-dashboard] 插件已加载：Gemini 5小时/周限额监控面板启动");
  }

  async onunload() {
    this.ctx.log.info("[gemini-quota-dashboard] 插件已卸载");
  }
}
