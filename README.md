# ComfyUI-VRAM-watcher

ComfyUI の画面上に **VRAM / RAM 使用量バー**を表示するためのシンプルなカスタムノードです。

- VRAM: `torch.cuda` から取得（CUDA が無い場合は unavailable 表示）
- RAM: Linux では `/proc/meminfo`、それ以外は `psutil` があれば取得

## インストール

### 手動（git clone）

`ComfyUI/custom_nodes` で:

```bash
git clone https://github.com/zwaigani/ComfyUI-VRAM-watcher.git
```

ComfyUI を再起動。

## 使い方

1. ComfyUI を起動
2. ノード追加から **`VRAM Watcher (Bar)`** を追加（カテゴリ: `utils`）
3. ノード内のウィジェットで表示を調整

### ノードの設定

- **Interval (s)**: ポーリング間隔（秒）
- **Display**: `%` または `MB`
- **Order**: `VRAM→RAM` / `RAM→VRAM`

## 依存関係

- ComfyUI の環境に含まれる `torch` を利用します
- RAM 表示を Linux 以外でも有効にするため `psutil` を使用します（`requirements.txt`）

## トラブルシュート

- **VRAM が unavailable**
  - `torch.cuda.is_available()` が false の環境です（CPU 実行、CUDA 未導入、対応GPUなし等）
- **RAM が unavailable（Windows/macOS 等）**
  - `psutil` がインストールされていない可能性があります。Manager 経由インストールの場合は自動で入る想定です。
## ライセンス

MIT License（[LICENSE](LICENSE)）。
