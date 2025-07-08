# PKCE認証によるセキュアなPLC制御システム

## 概要

このプロジェクトは、PKCEフローを使用したセキュアなPLC制御システムの実装例です。
AWS Cognito User Pool、API Gateway、Lambda Functionを使用して、OAuth 2.0 PKCE認証によるセキュアなアーキテクチャを構築しています。

## 主要な特徴

- ✅ **PKCEフロー**: クライアントシークレット不要のセキュアな認証
- ✅ **機密情報の暗号化**: AWS Parameter Storeによる機密情報の安全な管理
- ✅ **監査ログ**: 全操作をCloudWatch Logsに記録
- ✅ **CORS対応**: 適切なCORS設定による安全なAPI アクセス
- ✅ **リフレッシュトークン**: 長期セッションサポート

## アーキテクチャ

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Browser   │    │   Cognito   │    │API Gateway  │
│             │    │ User Pool   │    │ + Lambda    │
└─────────────┘    └─────────────┘    └─────────────┘
        │                   │                   │
        │   1. PKCE Auth    │                   │
        │ ─────────────────>│                   │
        │                   │                   │
        │   2. Auth Code    │                   │
        │ <─────────────────│                   │
        │                   │                   │
        │   3. Token Exchange                   │
        │ ─────────────────>│                   │
        │                   │                   │
        │   4. JWT Token    │                   │
        │ <─────────────────│                   │
        │                   │                   │
        │   5. API Request with JWT             │
        │ ─────────────────────────────────────>│
        │                   │                   │
        │   6. Response     │                   │
        │ <─────────────────────────────────────│
```

## セキュリティ強化点

### 従来の問題点
- ❌ クライアントシークレットがソースコードに平文で露出
- ❌ PLC IP アドレスなどの機密情報がハードコード
- ❌ 認証なしでのAPI アクセス
- ❌ 監査ログの不足

### 改善後
- ✅ PKCEフローによりクライアントシークレット不要
- ✅ Parameter Storeによる機密情報の暗号化管理
- ✅ JWT トークンによる認証付きAPI アクセス
- ✅ 全操作のCloudWatch Logs記録

## 前提条件

- AWS CLI がインストールされ、適切な権限で設定済み
- Node.js 18.x 以上
- AWS CDK v2 がインストール済み

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/yuu551/pkce-auth-cdk.git
cd pkce-auth-cdk
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 設定の変更

#### CDKスタック設定
`lib/pkce-auth-cdk-stack.ts` を編集して、以下の値を実際の環境に合わせて変更してください：

```typescript
// Parameter Store設定
const plcIpParameter = new ssm.StringParameter(this, 'PlcIpParameter', {
  parameterName: '/plc/secure/ip-address',
  stringValue: 'YOUR_PLC_IP_ADDRESS', // 実際のPLC IPアドレス
  // ...
});

const mqttTopicParameter = new ssm.StringParameter(this, 'MqttTopicParameter', {
  parameterName: '/plc/secure/mqtt-topic',
  stringValue: 'your-mqtt-topic/device/gateway', // 実際のMQTTトピック
  // ...
});
```

#### フロントエンド設定
`frontend/pkce-auth.js` を編集して、デプロイ後の実際の値を設定してください：

```javascript
const config = {
    clientId: 'YOUR_COGNITO_CLIENT_ID',        // Cognito Client ID
    cognitoDomain: 'https://YOUR_COGNITO_DOMAIN.auth.REGION.amazoncognito.com',
    redirectUri: window.location.origin + '/callback',
    logoutUri: window.location.origin,
    apiEndpoint: 'https://YOUR_API_GATEWAY_ID.execute-api.REGION.amazonaws.com/prod/'
};
```

### 4. CDK デプロイ

```bash
# CDKブートストラップ（初回のみ）
npx cdk bootstrap

# デプロイ
npx cdk deploy
```

デプロイ完了後、以下の値が出力されます：
- `UserPoolId`: Cognito User Pool ID
- `UserPoolClientId`: Cognito App Client ID
- `CognitoDomain`: Cognito Domain URL
- `ApiEndpoint`: API Gateway エンドポイント

### 5. フロントエンド設定の更新

上記のデプロイ出力値を使用して、`frontend/pkce-auth.js`の設定を更新してください。

### 6. Amplify でのフロントエンドデプロイ

```bash
# Amplifyでのホスティング設定
# amplify.yml を参考に設定
```

## 使用方法

### 認証フロー

1. **ログイン**: 「ログイン」ボタンをクリック
2. **Cognito認証**: Cognitoのログインページで認証
3. **認証完了**: 自動的にアプリケーションにリダイレクト

### PLC制御

認証後、以下のフォームでPLC制御コマンドを送信できます：

- **コマンド**: read/write
- **エリア**: DM/HR/WR
- **アドレス**: メモリアドレス
- **値**: 書き込み値（writeの場合）

### デバッグ情報

「デバッグ情報を表示」ボタンで以下が確認できます：
- 認証フローの詳細
- トークン情報
- 設定情報

## 監査ログ

全てのPLC制御操作は以下の情報と共にCloudWatch Logsに記録されます：

```json
{
  "timestamp": "2024-01-XX T XX:XX:XX.XXXZ",
  "userId": "user-id",
  "email": "user@example.com",
  "ipAddress": "xxx.xxx.xxx.xxx",
  "command": "write",
  "area": "DM",
  "address": "31000",
  "value": "999",
  "status": "success"
}
```

## セキュリティ考慮事項

### 本番環境での追加対策

1. **ネットワークセキュリティ**
   - Lambda を VPC 内に配置
   - セキュリティグループの適切な設定
   - プライベートサブネットでの通信

2. **監視・アラート**
   - CloudWatch Alarms の設定
   - 異常アクセスの検知
   - 自動通知の設定

3. **アクセス制御**
   - IAM ロールの最小権限原則
   - IP制限の実装
   - 地理的制限の設定

## トラブルシューティング

### 一般的な問題

**Q: 認証後に403エラーが発生する**
A: API Gateway の CORS 設定を確認し、フロントエンドのオリジンが許可されているか確認してください。

**Q: Parameter Store から値が取得できない**
A: Lambda 関数に適切なIAM権限が設定されているか確認してください。

**Q: トークンが期限切れになる**
A: リフレッシュトークンの実装を確認し、自動更新が機能しているか確認してください。

## 開発・カスタマイズ

### ローカル開発

```bash
# CDKのローカル実行
npx cdk synth

# CloudFormationテンプレートの生成
npx cdk synth > template.yaml
```

### テスト

```bash
# ユニットテスト
npm test

# E2Eテスト
npm run test:e2e
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 貢献

バグ報告や機能要求は、GitHubのIssuesでお願いします。

## 関連リンク

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Cognito PKCE Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- [OAuth 2.0 PKCE Specification](https://tools.ietf.org/html/rfc7636)