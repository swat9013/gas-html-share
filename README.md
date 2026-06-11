# GAS HTML share

Google Drive の特定フォルダに置いた HTML を、ウェブアプリから **表示・共有** し、
index 画面で **アップロード・更新・フォルダ/ファイルの CRUD** まで行える GAS プロジェクト。

- **閲覧**: 同一 Google Workspace ドメインの全員（`?id=<fileId>` の共有リンク）
- **管理（CRUD）**: オーナー本人のみ（閲覧者には操作 UI が出ない）

## セットアップ

### 1. スクリプトプロパティを登録

Apps Script エディタ → **プロジェクトの設定** → **スクリプト プロパティ** に 2 件登録:

| プロパティ | 値 |
|---|---|
| `FOLDER_ID` | 共有する HTML を置く Drive フォルダの ID |
| `OWNER_EMAIL` | CRUD を許可するオーナーのメール |

### 2-A. clasp でデプロイする場合

clasp は GAS のコードをローカルから push できる Google 公式 CLI。Node.js が入っていれば
インストール不要（`npx` 経由で実行する）。初回のみ Google アカウントでログインする:

```bash
npx --yes @google/clasp login   # ブラウザが開き、~/.clasprc.json に認証情報を保存
```

あとはリポジトリ直下でデプロイスクリプトを実行するだけ:

```bash
./scripts/deploy.sh 【スクリプトID】   # 初回のみ ID 指定。以降は引数不要
```

スクリプト ID は Apps Script エディタの URL
`https://script.google.com/home/projects/【スクリプトID】/edit` から取得する。
push → 既存ウェブアプリデプロイの更新（/exec URL 維持）まで自動で行う。

### 2-B. 手作業で配置する場合（clasp を使わない）

1. [script.google.com](https://script.google.com) で新規プロジェクトを作成
2. **プロジェクトの設定** → 「**`appsscript.json` マニフェスト ファイルをエディタで表示する**」を ON
3. エディタで以下のファイルを作成し、リポジトリの同名ファイルの中身を貼り付ける:
   - `appsscript.json`（マニフェスト。スコープとウェブアプリ設定を含むため必須）
   - `Code.gs` / `Helpers.gs`（スクリプト）
   - `index` / `styles` / `app`（**＋ → HTML** で作成。拡張子 `.html` は自動付与）
4. **デプロイ → 新しいデプロイ** → 種類: **ウェブアプリ** を選択し、
   実行ユーザー: **自分** / アクセスできるユーザー: **同じドメインのユーザー** でデプロイ

### 3. スコープを承認（初回のみ）

初回デプロイ時、`drive` と `userinfo.email` スコープの承認を求められるので許可する。
clasp デプロイの場合は Apps Script エディタの **デプロイ → デプロイを管理** から承認する。

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `Code.gs` | `doGet` ルーティング / 閲覧レンダラ / owner 判定 / `getTree` / CRUD サーバ API |
| `Helpers.gs` | 純粋ヘルパ（`isHtmlFile_` / `normalizeName_` / `buildTree_`） |
| `index.html` | 2ペイン管理画面のテンプレート |
| `styles.html` | UI の CSS（oklch ライト/ダークテーマ） |
| `app.html` | クライアント JS（描画・D&D・CRUD・トースト・owner ゲート） |
| `appsscript.json` | マニフェスト（スコープ・ウェブアプリ設定） |
| `scripts/deploy.sh` | npx clasp で push＋既存デプロイ更新（URL 維持） |
| `samples/demo.html` | 動作確認用のサンプル HTML |

## 設計メモ

- **アクセスモデル**: `access = DOMAIN` で社内閲覧を許可しつつ、CRUD は
  `Session.getActiveUser().getEmail() === OWNER_EMAIL` でオーナー本人だけに限定。
  共有ドライブ配下では `getEffectiveUser()` / `getOwner()` がメールを返せないため、この方式を採る。
- **表示方式は HtmlService**（ContentService は HTML をレンダリングしない仕様のため）。
- **アップデートは id 保持**: `File.setContent` で中身だけ差し替え、id/URL/名前を変えない。
- **フォルダは実 Drive フォルダ**。UI が扱うのは `FOLDER_ID` 直下の 1 階層のみ。

## License

MIT
