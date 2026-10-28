# 販売・ストア・Steamマーケット

更新：2026-10-29。実決済・Steamworks契約・ストア公開・アイテム取引は行っていない。

## 現在の実装

本体を買い切り、追加の有料商品を外観に限定する方針。キャラ・装備の強さ、経験値、小判、ドロップ率は購入で変えない。新しいダンジョンの販売方法は未決定で、今回の地面テーマ購入へ混ぜない。

地面テーマ4種（桜色・月明かり・提灯色・深淵色）のカタログ、所有権、外観選択、永続化、未確定取引の記録、決済アダプター境界を実装した。通常ビルドは販売前を表示して購入を拒否する。表示価格はSteamから取得した値だけで、未取得時はnull。本体980円・各テーマ200円などは検討用の仮値で、販売価格として確定・登録していない。

開発用のsandboxは `profile=dev`、`packaged=false`、明示的なsandbox指定がすべて揃った場合だけ有効。実決済は発生せず、所有権は製品へ移行しない。配布版で環境変数をdevへ変更してもsandboxは使えない。保存先は呼び出し側から渡す `paths.commerce` を正本にし、開発検証用のデータを利用者の保存先へ書かない。

## 接続契約

- `CommerceService({ path, profile, sandbox, packaged, appId?, steamId?, provider? })`
- `getView(): StoreView`：価格・所有・装備・販売状態・確認待ち。SteamIDや署名、鍵はrendererへ渡さない。
- `purchase(sku): Promise<CommerceResult>`：購入開始前に注文を永続化。キャンセルは確定後に再操作可能。
- `equip(sku | null)`、`getAppearance()`：所有した外観だけ有効。nullで既定の地面に戻す。
- `CommerceProvider`：信頼するmain／取引サーバーアダプター。Steam Wallet支払い、価格取得、署名検証を担当。**実際のSteamへの接続は未実装**。

`src/commerce/receipts.ts` は、自前の信頼する取引サーバーが発行するEd25519レシートの検証器。Steam発行のインベントリ署名を直接検証するものではない。将来の取引サーバーはSteam側の取引を確認・確定してから、AppID・SteamID・注文ID・商品ID・レシートIDを束縛して署名する。署名の秘密鍵・Steam Publisher Web API Keyはクライアントへ入れない。

未確認／通信切断／検証失敗の注文はunknownにし、自動で支払いを再送しない。同じレシートを別商品へ再使用できない。起動時のpending注文もunknownになる。保存失敗は購入を停止する。ローカルファイルだけで製品の所有権を復元せず、再確認なしの二重購入も防ぐ。**製品の所有権同期・返金／取り消し反映・unknown注文の照会と解決は、Steam接続アダプターを作る際に実装する必要がある**。現時点で実決済を有効にできる完成した課金システムとは扱わない。

## Steam側の前提

Steam上のゲーム内購入はSteam WalletのAPIを使う必要がある。購入の取引性・不正利用への対処も、ゲーム側の責任を含む。[Steam公式：ゲーム内購入](https://partner.steamgames.com/doc/features/microtransactions)

Steam Inventory ServiceはSteamアカウントのアイテムを扱う基盤で、Item Storeはその定義を使う販売の仕組み。対応したAppID、Steamworksの設定、SDK／APIアダプター、実アカウントでの受入検証が必要。[Steam公式：Inventory Service](https://partner.steamgames.com/doc/features/inventory)、[Item Store](https://partner.steamgames.com/doc/features/inventory/itemstore)

`steam/inventory-schema.json` は未公開の定義ひな型。`appid=0`は未設定を表し、そのままアップロードしない。商品ID1001〜1004はカタログと一致する。販売価格・公開アイコンURL・実AppIDを決め、Valve側で設定するまでhidden/store_hiddenを維持する。

スキーマの `marketable` はCommunity Market、`tradable`はユーザー間トレードへの適格性を示す。ここでは両方false。フラグだけを変えれば公開取引が完成するとは扱わない。[Steam公式：Inventory Schema](https://partner.steamgames.com/doc/features/inventory/schema)

## マーケットの設計境界

ローカルのセーブJSON・小判・装備袋はプレイヤー自身が変更できるため、そのままSteam取引アイテムへ変換しない。現在のストアは `market.available=false` を返し、Steamへの送信・受領・市場への出品を行わない。

マーケットを作る際は、Steam側の一意なitem instanceを権威にして、サーバーが認証済みアカウントと取引記録を検証する。ローカル戦闘結果だけを根拠にした発行は禁止。少数の明確な外観アイテムから始め、供給上限・不正発行の検出・レート制限・返金／取引保留・障害後の照合を持たせる。受け取れたか不明な送信を自動再送しない。ゲーム本編は取引サーバー停止中も遊べる。

## 検証

`pnpm exec vitest run tests/commerce.test.ts`：未接続拒否、配布版sandbox拒否、開発購入／外観／再起動、重複・並行クリック、キャンセル、unknown再送防止、起動時pending、偽署名／異アカウント／別商品／別注文、レシート再使用、壊れた保存の保護、View分離、Ed25519改変検出を検証。実Steamの購入・返金・アイテム受領・マーケット売買は未検証。
