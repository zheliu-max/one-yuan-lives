# default-workspace

DeepSeek Harness 的默认工作区。这里放两样东西：作品，以及让作品自动存进 git 的那套装置。

## 内容

```
demo/                      「一块钱的两万种人生」互动叙事 demo（作品本体）
plugins/git-autosave/      每回合结束自动本地提交的 DSH 插件
```

## 自动保存是怎么运作的

`plugins/git-autosave` 装在 desktop profile 里，监听每个会话的 `turn/end`：任务一结束，就在会话工作目录里执行 `git add -A .`，有改动就提交一次，没有改动就跳过。

- 只提交，不推送；不联网。
- 遵循 `.gitignore`。
- 按工作目录划定提交范围：在仓库根目录就是整仓，在子目录就只提交子目录。
- 子代理的回合不单独提交。

提交标题取自本次任务最后一条用户消息，正文记时间、会话 id、回合号和文件统计：

```
dsh: 帮我把报告卡导出成 PNG

auto-saved at 2026-11-22T15:31:12.480Z
session 4f1c2a90 · turn 7
 2 files changed, 31 insertions(+), 4 deletions(-)
```

配置项、行为细节和端到端测试见 `plugins/git-autosave/docs/DETAIL.md`，测试可单独跑：

```powershell
node plugins/git-autosave/test/e2e.mjs
```

## 作品预览

```powershell
node demo/serve.mjs     # http://127.0.0.1:4173/
```

静态服务器直接读磁盘，所以任何改动保存后刷新即生效，没有构建步骤。详见 `demo/README.md`。
