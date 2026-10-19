# 詳細設計（M1〜M7）

`docs/DESIGN.md` は全体の仕様、このフォルダはマイルストーンごとの実装レベルの設計です。両者が食い違う場合は、このフォルダを優先します（DESIGN.md側にも該当箇所に注記してあります）。

作成：2026-10-20　前提：M0のコード（`719e45e`）を読んだうえで作成

| ファイル | 対象 | 内容 |
|---|---|---|
| [01-core.md](01-core.md) | M1・M3 | 戦闘コア：状態の型、ティック、計算、スキルの仕組み、イベント、sim-runner |
| [02-strip.md](02-strip.md) | M2 | 帯の描画：ドット倍率、ウィンドウの高さ、スプライト形式、アニメーション、当たり判定、性能 |
| [03-progression-save.md](03-progression-save.md) | M4 | 成長・装備の生成・道場・オフライン報酬・セーブの保存と移行 |
| [04-panel-ipc.md](04-panel-ipc.md) | M5 | IPCの約束事、コマンド、管理パネルの画面 |
| [05-content-balance.md](05-content-balance.md) | M6 | エリア1〜3の敵・ボス・ウェーブ構成、バランスの目標 |
| [06-release.md](06-release.md) | M7・その後 | 全画面時に隠す、自動起動、配布、将来の追加案 |

## 実装の順番

```
M0の残り確認 → M1 コア → M2 帯の描画 → M3 スキル → M4 成長とセーブ → M5 パネル → M6 中身と調整 → M7 仕上げ
```

- **M0の残り**（HANDOFF.mdの「未確認」）を最初に片付ける。特に「透明部分の後ろのアプリをクリックできるか」と「トレイから終了したときにプロセスが残らないか」。どちらもM2以降の前提になる。
- M1とM2の間で、M2が使う `Snapshot` と `SimEvent` の型（01-core.md §6）を先に固定する。M3で増えるのはイベントの種類だけにする。

## 全マイルストーン共通の約束

- `src/core/` はElectron・DOM・Nodeの入出力に依存しない（`node:fs` も使わない）。テストはここに集中させる。
- 数値は `src/core/data/` だけに置く。コードに数値を直書きしてよいのは、0、1、配列の添字、単位の換算（1000ms）だけ。
- 乱数は `src/core/sim/rng.ts` だけを使う。`Math.random()` と `Date.now()` を `src/core/` で使うことを禁止する（ESLintの `no-restricted-properties` / `no-restricted-globals` で検出する）。
- 時間の単位はms（整数）、距離の単位はドット（小数可）、割合は小数（0.15 = 15%）。表示するときだけ%に直す。
- 識別子は英語のsnake_case（`samurai`、`chochin`）、表示名は日本語でデータに持つ。
- 新しい依存パッケージは、この設計に書いたもの（Preact、koffi、electron-builder）以外を入れる場合、理由をHANDOFF.mdに書く。
- 各マイルストーンの終わりに README.md・HANDOFF.md・CREDITS.md（素材を足したとき）を更新してコミットし、`origin/main` へpushする。GitHub Actionsは使わない。

## Codexへの依頼文の例

```
AGENTS.md → HANDOFF.md → README.md → docs/DESIGN.md → docs/design/README.md → docs/design/01-core.md を読んで、M1を実装して。
受入条件をローカルで確認し、README・HANDOFFを更新してコミット・pushまで。設計と合わない点や決めきれない点は、勝手に決めずにHANDOFFの「要相談」に書いて。
```
