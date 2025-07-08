import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class PkceAuthCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Cognito User Pool - PKCE対応設定
    const userPool = new cognito.UserPool(this, 'PkceUserPool', {
      userPoolName: 'pkce-auth-user-pool',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用
    });

    // User Pool Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `pkce-auth-${cdk.Stack.of(this).account}`,
      },
    });

    // App Client - PKCE用（クライアントシークレットなし）
    const appClient = new cognito.UserPoolClient(this, 'AppClient', {
      userPool,
      userPoolClientName: 'pkce-app-client',
      generateSecret: false, // PKCEではクライアントシークレットは不要
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'https://your-amplify-app.amplifyapp.com/callback',
          'http://localhost:3000/callback',
          'https://localhost:3000/callback',
        ],
        logoutUrls: [
          'https://your-amplify-app.amplifyapp.com',
          'http://localhost:3000',
          'https://localhost:3000',
        ],
      },
      preventUserExistenceErrors: true,
    });

    // 2. Parameter Store - 機密情報の保存
    const plcIpParameter = new ssm.StringParameter(this, 'PlcIpParameter', {
      parameterName: '/plc/secure/ip-address',
      stringValue: 'YOUR_PLC_IP_ADDRESS', // 実際の環境では適切な値に変更
      description: 'PLC IP Address',
      tier: ssm.ParameterTier.STANDARD,
    });

    const mqttTopicParameter = new ssm.StringParameter(this, 'MqttTopicParameter', {
      parameterName: '/plc/secure/mqtt-topic',
      stringValue: 'your-mqtt-topic/device/gateway',  // 例: company-cmd/device/gateway001
      description: 'MQTT Topic',
      tier: ssm.ParameterTier.STANDARD,
    });

    const gatewayIdParameter = new ssm.StringParameter(this, 'GatewayIdParameter', {
      parameterName: '/plc/secure/gateway-id',
      stringValue: 'your-gateway-unit',  // 例: gateway001
      description: 'Gateway ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    // 3. CloudWatch Logs - 監査ログ用
    const auditLogGroup = new logs.LogGroup(this, 'AuditLogGroup', {
      logGroupName: '/aws/lambda/plc-control-audit',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Lambda Function - API処理
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'api-handler.handler',
      code: lambda.Code.fromAsset('./lambda'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        LOG_GROUP_NAME: auditLogGroup.logGroupName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Lambda に Parameter Store へのアクセス権限を付与
    plcIpParameter.grantRead(apiHandler);
    mqttTopicParameter.grantRead(apiHandler);
    gatewayIdParameter.grantRead(apiHandler);

    // Lambda に CloudWatch Logs への書き込み権限を付与
    auditLogGroup.grantWrite(apiHandler);

    // 5. API Gateway
    const api = new apigateway.RestApi(this, 'PlcControlApi', {
      restApiName: 'PLC Control API',
      description: 'API for PLC control with PKCE authentication',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://your-amplify-app.amplifyapp.com', 'http://localhost:3000', 'https://localhost:3000'],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // API エンドポイント
    const commandResource = api.root.addResource('command');
    commandResource.addMethod('POST', new apigateway.LambdaIntegration(apiHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });


    // 6. Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: appClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Domain URL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway Endpoint',
    });

  }
}