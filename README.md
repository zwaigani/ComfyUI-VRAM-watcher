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

### ComfyUI-Manager 経由

Manager の「Install Custom Nodes」からインストールできるようにするには、
**Comfy-Org/ComfyUI-Manager の `custom-node-list.json` に登録 PR**を出す必要があります（後述）。

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

## ComfyUI-Manager への登録（開発者向け）

1. https://github.com/Comfy-Org/ComfyUI-Manager を fork
2. `custom-node-list.json` にエントリを追加
3. JSON 構文エラーがないことを確認（Manager の `Use local DB` で読み込み確認推奨）
4. PR を作成

追加するエントリ例（`<...>` は置き換え）:

```json
{
  "author": "zwaigani",
  "title": "ComfyUI-VRAM-watcher",
  "id": "comfyui-vram-watcher",
  "reference": "https://github.com/zwaigani/ComfyUI-VRAM-watcher",
  "files": [
    "https://github.com/zwaigani/ComfyUI-VRAM-watcher"
  ],
  "install_type": "git-clone",
  "description": "Displays GPU VRAM usage and system RAM usage as bar widgets in a ComfyUI node.",
  "tags": ["utils", "ui", "vram", "ram"]
}
```

## ライセンス

MIT License（[LICENSE](LICENSE)）。
