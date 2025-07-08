import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSM } from 'aws-sdk';
import { CloudWatchLogs } from 'aws-sdk';

const ssm = new SSM();
const cloudWatchLogs = new CloudWatchLogs();

interface PlcCommand {
  command: string;
  value: string;
  area?: string;
  address?: string;
}

interface SecureParameters {
  'ip-address': string;
  'mqtt-topic': string;
  'gateway-id': string;
}

// Parameter Storeから機密情報を取得
async function getSecureParameters(): Promise<SecureParameters> {
  const params = {
    Names: [
      '/plc/secure/ip-address',
      '/plc/secure/mqtt-topic',
      '/plc/secure/gateway-id'
    ],
    WithDecryption: true
  };
  
  const result = await ssm.getParameters(params).promise();
  const parameters: any = {};
  
  result.Parameters?.forEach(param => {
    const key = param.Name?.split('/').pop();
    if (key && param.Value) {
      parameters[key] = param.Value;
    }
  });
  
  return parameters as SecureParameters;
}

// 監査ログを記録
async function logAuditEvent(eventData: any): Promise<void> {
  const logGroupName = process.env.LOG_GROUP_NAME || '/aws/lambda/plc-control-audit';
  const logStreamName = new Date().toISOString().split('T')[0];
  
  try {
    // ログストリームが存在しない場合は作成
    try {
      await cloudWatchLogs.createLogStream({
        logGroupName,
        logStreamName
      }).promise();
    } catch (error: any) {
      // ログストリームが既に存在する場合はエラーを無視
      if (error.code !== 'ResourceAlreadyExistsException') {
        throw error;
      }
    }
    
    // ログイベントを送信
    await cloudWatchLogs.putLogEvents({
      logGroupName,
      logStreamName,
      logEvents: [{
        timestamp: Date.now(),
        message: JSON.stringify(eventData)
      }]
    }).promise();
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // 監査ログの失敗はAPIの処理を止めない
  }
}

// PLCコマンドを実行（実際の実装では適切なPLC通信ライブラリを使用）
async function executePlcCommand(params: {
  plcIP: string;
  topic: string;
  gatewayId: string;
  userId: string;
  command: PlcCommand;
}): Promise<any> {
  // ここでは仮の実装
  // 実際にはMQTTクライアントやPLC通信ライブラリを使用
  console.log('Executing PLC command:', params);
  
  // シミュレーション用のレスポンス
  return {
    status: 'success',
    timestamp: new Date().toISOString(),
    command: params.command,
    result: {
      value: 'OK',
      message: 'Command executed successfully'
    }
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Cognitoからのユーザー情報を取得
    const claims = event.requestContext.authorizer?.claims;
    if (!claims) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    const userId = claims.sub;
    const email = claims.email;
    
    // リクエストボディをパース
    const body = JSON.parse(event.body || '{}') as PlcCommand;
    
    // 機密情報をParameter Storeから取得
    const secureParams = await getSecureParameters();
    
    // PLCコマンドの実行
    const result = await executePlcCommand({
      plcIP: secureParams['ip-address'],
      topic: secureParams['mqtt-topic'],
      gatewayId: secureParams['gateway-id'],
      userId: userId,
      command: body
    });
    
    // 監査ログの記録
    await logAuditEvent({
      userId,
      email,
      action: 'PLC_COMMAND',
      timestamp: new Date().toISOString(),
      sourceIP: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
      command: body,
      result: result.status
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('Error:', error);
    
    // エラーログの記録
    await logAuditEvent({
      action: 'PLC_COMMAND_ERROR',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      sourceIP: event.requestContext.identity.sourceIp
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'An error occurred while processing your request'
      })
    };
  }
};