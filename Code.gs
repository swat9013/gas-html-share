/**
 * Drive の特定フォルダ配下にある HTML ファイルを配信・管理するための GAS ウェブアプリ。
 *
 * 動作:
 *   - ?file=<名前> または ?id=<fileId> が無いとき … 2ペイン管理画面を表示
 *   - ?file=<名前> を指定したとき          … サブフォルダも再帰検索して HTML をそのまま表示
 *   - ?id=<fileId> を指定したとき          … その ID の HTML をそのまま表示（重複名でも一意）
 *
 * 表示方式について:
 *   資料では ContentService 推奨だが、Google は ContentService で MimeType.HTML を
 *   指定してもブラウザでレンダリングしない仕様（テキスト/ダウンロード扱い）に変更している。
 *   「そのまま表示」を確実に満たすため HtmlService を使う。
 */

// 設定は Apps Script の「プロジェクトの設定 → スクリプト プロパティ」で手動登録する:
//   FOLDER_ID   … 共有する HTML を置く Drive フォルダの ID（フォルダ URL の末尾）
//   OWNER_EMAIL … CRUD を許可するオーナーのメール（アクセス中ユーザーと一致で管理者判定）

/**
 * ウェブアプリのエントリポイント。
 * @param {GoogleAppsScript.Events.DoGet} e リクエストイベント
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const fileId = params.id;
  const fileName = params.file;

  try {
    if (!fileId && !fileName) {
      return renderIndex();
    }
    const file = fileId ? getFileById_(fileId) : findHtmlByName_(fileName);
    if (!file) {
      return renderMessage_(
        'ファイルが見つかりません',
        '「' + escapeHtml_(fileName || fileId) + '」に一致する HTML が見つかりませんでした。' +
        '<br>一覧に戻る: <a href="' + webAppUrl_() + '">トップへ</a>'
      );
    }
    return renderRawHtml_(file);
  } catch (err) {
    return renderMessage_('エラー', escapeHtml_(String(err && err.message ? err.message : err)));
  }
}

/**
 * 指定された HTML ファイルの中身をそのまま返す。
 * @param {GoogleAppsScript.Drive.File} file
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function renderRawHtml_(file) {
  const content = file.getBlob().getDataAsString('UTF-8');
  const title = file.getName().replace(/\.html?$/i, '');
  return HtmlService.createHtmlOutput(content)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * フォルダ ID から File を取得（HTML 以外なら null）。
 * @param {string} fileId
 * @return {?GoogleAppsScript.Drive.File}
 */
function getFileById_(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return isHtmlFile_(file.getName(), file.getMimeType()) ? file : null;
  } catch (err) {
    return null; // 不正な ID / アクセス不可
  }
}

/**
 * ルートフォルダ配下（サブフォルダ含む）から名前で HTML を再帰検索する。
 * 「.html」は付けても付けなくてもよい。最初に一致した 1 件を返す。
 * @param {string} name
 * @return {?GoogleAppsScript.Drive.File}
 */
function findHtmlByName_(name) {
  const wanted = normalizeName_(name);
  const root = DriveApp.getFolderById(folderId_());
  const stack = [root];
  while (stack.length) {
    const folder = stack.pop();
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (isHtmlFile_(file.getName(), file.getMimeType()) && normalizeName_(file.getName()) === wanted) {
        return file;
      }
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      stack.push(subs.next());
    }
  }
  return null;
}

/**
 * 2ペイン管理画面を描画する。閲覧者には read-only、オーナーには CRUD UI。
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function renderIndex() {
  let tree;
  let listError = '';
  try {
    tree = getTree();
  } catch (err) {
    tree = [];
    listError = String(err && err.message ? err.message : err);
  }
  const owner = isOwner_();

  const fid = folderId_();
  const tmpl = HtmlService.createTemplateFromFile('index');
  tmpl.boot = JSON.stringify({ tree: tree, isOwner: owner, url: webAppUrl_() });
  tmpl.isOwner = owner;
  tmpl.folderUrl = fid ? 'https://drive.google.com/drive/folders/' + fid : '#';
  tmpl.listError = listError;
  tmpl.configured = !!fid;
  return tmpl.evaluate()
    .setTitle('HTML 管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * シンプルなメッセージページを返す。
 * @param {string} title
 * @param {string} bodyHtml すでにエスケープ済みの HTML 断片
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function renderMessage_(title, bodyHtml) {
  const html =
    '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;' +
    'color:#1f2937;line-height:1.7}h1{font-size:1.4rem}a{color:#2563eb}</style></head>' +
    '<body><h1>' + escapeHtml_(title) + '</h1><p>' + bodyHtml + '</p></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ───────────── ツリー取得 ───────────── */

/**
 * FOLDER_ID 直下のサブフォルダと、root・直下サブフォルダ内の HTML を
 * 表示用グループ配列へ整形して返す（buildTree_ で整形）。
 * 読み取りのため owner 限定にはしない（同一ドメインの閲覧者も利用）。
 * @return {!Array<Object>}
 */
function getTree() {
  const rootId = folderId_();
  const root = DriveApp.getFolderById(rootId);
  const subFolders = [];
  const files = [];
  collectHtml_(root, rootId, files);
  const subs = root.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    subFolders.push({ id: sub.getId(), name: sub.getName() });
    collectHtml_(sub, sub.getId(), files);
  }
  return buildTree_(rootId, subFolders, files);
}

/**
 * 1 フォルダ直下の HTML を files 配列へ push する。
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} parentId
 * @param {!Array<Object>} files 出力先
 */
function collectHtml_(folder, parentId, files) {
  const fi = folder.getFiles();
  while (fi.hasNext()) {
    const f = fi.next();
    if (isHtmlFile_(f.getName(), f.getMimeType())) {
      files.push({ id: f.getId(), name: f.getName(), parentId: parentId });
    }
  }
}

/* ───────────── ミューテーション API（すべて owner 限定） ───────────── */

/**
 * 名前に拡張子が無ければ .html を補う。
 * @param {string} name
 * @return {string}
 */
function ensureHtmlName_(name) {
  const n = String(name).trim();
  return /\.html?$/i.test(n) ? n : n + '.html';
}

/** ルート直下にフォルダを作成。@return {{id:string,name:string}} */
function createFolder(name) {
  assertOwner_();
  const folder = DriveApp.getFolderById(folderId_()).createFolder(String(name).trim());
  return { id: folder.getId(), name: folder.getName() };
}

/** フォルダ名を変更。 */
function renameFolder(id, name) {
  assertOwner_();
  DriveApp.getFolderById(id).setName(String(name).trim());
}

/** フォルダを中身ごとゴミ箱へ。 */
function deleteFolder(id) {
  assertOwner_();
  DriveApp.getFolderById(id).setTrashed(true);
}

/** 指定フォルダに HTML を新規作成。@return {{id:string,name:string}} */
function uploadFile(folderId, name, html) {
  assertOwner_();
  const file = DriveApp.getFolderById(folderId).createFile(ensureHtmlName_(name), String(html), MimeType.HTML);
  return { id: file.getId(), name: file.getName() };
}

/** 既存ファイルの中身だけ差し替え（id/URL/名前は不変）。 */
function updateFile(fileId, html) {
  assertOwner_();
  const file = DriveApp.getFileById(fileId);
  if (!isHtmlFile_(file.getName(), file.getMimeType())) {
    throw new Error('HTML ファイルではありません');
  }
  file.setContent(String(html));
}

/** ファイル名を変更。@return {{id:string,name:string}} */
function renameFile(fileId, name) {
  assertOwner_();
  const file = DriveApp.getFileById(fileId);
  file.setName(ensureHtmlName_(name));
  return { id: file.getId(), name: file.getName() };
}

/** ファイルを別フォルダへ移動。 */
function moveFile(fileId, folderId) {
  assertOwner_();
  DriveApp.getFileById(fileId).moveTo(DriveApp.getFolderById(folderId));
}

/** ファイルをゴミ箱へ。 */
function deleteFile(fileId) {
  assertOwner_();
  DriveApp.getFileById(fileId).setTrashed(true);
}

/* ───────────── ユーティリティ ───────────── */

/**
 * スクリプトプロパティを 1 件読む（未設定なら空文字）。
 * @param {string} key
 * @return {string}
 */
function prop_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (e) {
    return '';
  }
}

/** 共有 HTML を置く Drive フォルダの ID（スクリプトプロパティ FOLDER_ID）。 @return {string} */
function folderId_() {
  return prop_('FOLDER_ID');
}

/** CRUD を許可するオーナーのメール（スクリプトプロパティ OWNER_EMAIL）。 @return {string} */
function ownerEmail_() {
  return prop_('OWNER_EMAIL');
}

/**
 * アクセス中のユーザーがオーナー本人か判定する。
 * getActiveUser（アクセス中ユーザー・同一ドメインなら取得可）と
 * スクリプトプロパティ OWNER_EMAIL を照合する。
 * @return {boolean}
 */
function isOwner_() {
  const owner = ownerEmail_();
  const active = Session.getActiveUser().getEmail();
  return !!owner && !!active && owner === active;
}

/**
 * オーナーでなければ例外を投げる（全ミューテーションの先頭で呼ぶ）。
 */
function assertOwner_() {
  if (!isOwner_()) {
    throw new Error('権限がありません');
  }
}

/**
 * HTML テンプレートから別 HTML ファイルの中身を取り込む（styles/app 用）。
 * @param {string} filename
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * このウェブアプリの公開 URL を返す。
 * @return {string}
 */
function webAppUrl_() {
  return ScriptApp.getService().getUrl();
}

/**
 * HTML エスケープ。
 * @param {string} s
 * @return {string}
 */
function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
