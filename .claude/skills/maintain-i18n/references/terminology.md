# Taiwan vs PRC Terminology

Rule: the TW column is the ONLY acceptable rendering; every PRC column entry is lint-flagged in `docs/zh-tw/**` (tiers in `scripts/maintain-i18n/forbidden-terms.json`). TW-internal splits have been decided — do not use the alternates.

Decided splits: 相依性 (noun) / 依賴 (verb) · 最佳化 (not 優化) · 迭代 (not 疊代) · 發布 (not 發佈) · 範本 for generic template, 樣板 only for framework template syntax · full-width （） in Chinese prose.

| English | TW (use) | PRC (forbid) |
|---|---|---|
| variable | 變數 | 变量/變量 |
| function | 函式 | 函数 (函數 only in math context) |
| object | 物件 | 对象/對象 |
| array | 陣列 | 数组/數組 |
| string | 字串 | 字符串 |
| string literal | 字串常值 | 字符串字面量 |
| boolean | 布林 | 布尔/布爾 |
| type | 型別 | 类型/類型 |
| cache | 快取 | 缓存/緩存 |
| default | 預設 | 默认/默認 |
| support | 支援 | 支持 |
| component | 元件 | 组件/組件 |
| file | 檔案 | 文件 (as "file") |
| document / docs | 文件、說明文件 | 文档/文檔 |
| folder | 資料夾 | 文件夹/文件夾 |
| project | 專案 | 项目 (項目 = "item" is valid TW; never "project") |
| package (npm) | 套件 | 包 |
| dependency | 相依性 (n.) / 依賴 (v.) | — |
| build | 建置 | 构建/構建 |
| runtime | 執行階段／執行環境 | 运行时/運行時 |
| server | 伺服器 | 服务器/服務器 |
| client | 用戶端 | 客户端/客戶端 |
| user | 使用者 | 用户/用戶 |
| performance | 效能 | 性能 |
| optimization | 最佳化 | 优化/優化 |
| code | 程式碼 | 代码/代碼 |
| source code | 原始碼 | 源代码/源代碼 |
| program | 程式 | 程序 (程序 = process in TW) |
| process | 程序／處理程序 | 进程/進程 |
| thread | 執行緒 | 线程/線程 |
| debug | 除錯 | 调试/調試 |
| configuration | 設定 | 配置 |
| network | 網路 | 网络/網絡 |
| data | 資料 | 数据/數據 |
| information | 資訊 | 信息 |
| message | 訊息 | 信息 |
| interface | 介面 | 接口 |
| callback | callback（回呼 if Chinese needed） | 回调/回調 |
| async | 非同步 | 异步/異步 |
| queue | 佇列 | 队列/隊列 |
| stack | 堆疊 | 堆栈/堆棧 |
| loop | 迴圈 | 循环 (循環 as "cycle" is valid TW; never "loop") |
| recursion | 遞迴 | 递归/遞歸 |
| algorithm | 演算法 | 算法 |
| hash | 雜湊 | 哈希 |
| iteration | 迭代 | 遍历/遍歷 |
| module | 模組 | 模块/模塊 |
| plugin | 外掛 (prose; API contexts keep English) | 插件 |
| browser extension | 擴充功能 | 插件 |
| file extension | 副檔名 | 扩展名/擴展名 |
| import / export (prose) | 匯入／匯出 | 导入/導入、导出/導出 |
| load / lazy loading | 載入／延遲載入 | 加载/加載、懒加载/懶加載 |
| inline | 行內 | 内联/內聯 |
| indentation | 縮排 | 缩进/縮進 |
| nested | 巢狀 | 嵌套 |
| global | 全域 | 全局 |
| comment | 註解 | 注释/注釋 |
| declaration | 宣告 | 声明/聲明 |
| constant | 常數 | 常量 |
| parameter | 參數 | 形参/形參 |
| operator | 運算子 | 操作符 |
| return (a value) | 回傳 | 返回 |
| response | 回應 | 响应/響應 |
| redirect | 重導向 | 重定向 |
| link | 連結 | 链接/鏈接 |
| login | 登入 | 登录/登錄 |
| list | 清單 | 列表 (borderline; prefer 清單) |
| menu | 選單 | 菜单/菜單 |
| icon | 圖示 | 图标/圖標 |
| window / screen | 視窗／螢幕 | 窗口、屏幕 |
| scroll | 捲動 | 滚动/滾動 |
| search | 搜尋 | 搜索 |
| refresh | 重新整理 | 刷新 |
| memory | 記憶體 | 内存/內存 |
| byte | 位元組 | 字节/字節 |
| compatible | 相容 | 兼容 |
| create | 建立 | 创建/創建 |
| custom | 自訂 | 自定义/自定義 |
| template | 範本（框架 template 語法可用 樣板） | 模板 |
| text | 文字 | 文本 |
| field | 欄位 | 字段 |
| setting | 設定 | 设置/設置 |
| software / hardware | 軟體／硬體 | 软件、硬件 |
| operating system | 作業系統 | 操作系统/操作系統 |
| video / audio | 影片·視訊／音訊 | 视频/視頻、音频/音頻 |
| community | 社群 | 社区/社區 |
| blog | 部落格 | 博客 |
| real-time | 即時 | 实时/實時 |
| quality | 品質 | 质量/質量 |
| through / via | 透過 | 通过/通過 (as "via") |
| interact | 互動 | 交互 |
| object-oriented | 物件導向 | 面向对象/面向對象 |
| continuous integration | 持續整合 | 持续集成/持續集成 |
| example | 範例 | 示例 |
| protocol | 協定 | 协议 (協議 = "agreement" is valid TW) |
| command | 指令 | 命令 (borderline; prefer 指令) |
| syntax highlighting | 語法醒目提示 | 语法高亮/語法高亮 |
| release / publish | 發布 | 发布 (same chars; forbid variant 發佈) |
| frame / keyframe | 影格／關鍵影格 | 帧/幀 |
| extract | 擷取 | 提取 |
| fallback | 備用值（fallback） | 回退 |
