/**
 * 純粋ヘルパ群。DriveApp/Session 等の GAS グローバルに依存しない。
 */

/**
 * MIME タイプまたは拡張子で HTML ファイルか判定する。
 * @param {string} name
 * @param {string} mimeType
 * @return {boolean}
 */
function isHtmlFile_(name, mimeType) {
  if (mimeType === 'text/html') return true;
  return /\.html?$/i.test(String(name));
}

/**
 * 比較用にファイル名を正規化する（trim・.html 除去・小文字化）。
 * @param {string} name
 * @return {string}
 */
function normalizeName_(name) {
  return String(name).trim().replace(/\.html?$/i, '').toLowerCase();
}

/**
 * フラットなフォルダ/ファイル情報を、表示用のグループ配列へ整形する。
 * ルート（未分類）を必ず先頭に置き、以降はフォルダ名昇順・各ファイル名昇順。
 * 既知フォルダに属さないファイルはルートへフォールバックする。
 * @param {string} rootFolderId
 * @param {!Array<{id:string,name:string}>} subFolders root 直下のサブフォルダ
 * @param {!Array<{id:string,name:string,parentId:string}>} files root と直下サブフォルダ内の HTML
 * @return {!Array<{id:string,name:string,isRoot:boolean,files:!Array<{id:string,name:string}>}>}
 */
function buildTree_(rootFolderId, subFolders, files) {
  var groups = {};
  groups[rootFolderId] = { id: rootFolderId, name: 'ルート（未分類）', isRoot: true, files: [] };
  subFolders.forEach(function (f) {
    groups[f.id] = { id: f.id, name: f.name, isRoot: false, files: [] };
  });
  files.forEach(function (file) {
    var g = groups[file.parentId] || groups[rootFolderId];
    g.files.push({ id: file.id, name: file.name });
  });
  var list = Object.keys(groups).map(function (k) { return groups[k]; });
  list.forEach(function (g) {
    g.files.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); });
  });
  list.sort(function (a, b) {
    if (a.isRoot) return -1;
    if (b.isRoot) return 1;
    return String(a.name).localeCompare(String(b.name), 'ja');
  });
  return list;
}
