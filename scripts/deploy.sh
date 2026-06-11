#!/usr/bin/env bash
set -euo pipefail

# html-gas を clasp(npx) で push し、既存ウェブアプリデプロイを新バージョンで更新する。
# 既存デプロイを再利用するため /exec の URL は維持される(配布済み共有リンクが生き続ける)。
# 前提: clasp ログイン済み(~/.clasprc.json)。.clasp.json が無ければ第1引数の scriptId で生成。
# usage: scripts/deploy.sh [scriptId]

cd "$(dirname "$0")/.." # repo root へ

CLASP=(npx --yes @google/clasp)

# .clasp.json (無ければ引数の scriptId から生成。scriptId は Apps Script の URL .../projects/【ID】/edit)
if [[ ! -f .clasp.json ]]; then
  SCRIPT_ID="${1:?usage: scripts/deploy.sh <scriptId>  (初回は scriptId が必要)}"
  printf '{"scriptId":"%s"}\n' "$SCRIPT_ID" >.clasp.json
  echo "==> .clasp.json を生成 (scriptId=$SCRIPT_ID, rootDir はこのファイルの場所=repo root)"
fi

echo "==> push (.claspignore により .gs/.html/manifest のみ送信)"
"${CLASP[@]}" push -f

echo "==> 既存ウェブアプリデプロイを探索"
DEPLOY_ID="$("${CLASP[@]}" deployments | awk '/^- / && $0 !~ /@HEAD/ {print $2; exit}')"

DESC="deploy $(date +%Y-%m-%dT%H:%M:%S)"
if [[ -n "$DEPLOY_ID" ]]; then
  echo "==> 既存デプロイ $DEPLOY_ID を新バージョンで更新 (URL 維持)"
  "${CLASP[@]}" deploy --deploymentId "$DEPLOY_ID" --description "$DESC"
else
  echo "==> 既存デプロイが無いため新規作成 (新しい URL になる)"
  "${CLASP[@]}" deploy --description "$DESC"
fi

cat <<'NOTE'

完了。
- アクセス権(同じドメイン)と実行ユーザーは appsscript.json の webapp 設定に従う。
- スコープ追加(drive / userinfo.email)のため、初回は Apps Script エディタの
  「デプロイ」→「アクセスを承認」で新スコープの承認が必要になる場合がある。
NOTE
