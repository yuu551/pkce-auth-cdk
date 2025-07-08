"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_sdk_1 = require("aws-sdk");
const aws_sdk_2 = require("aws-sdk");
const ssm = new aws_sdk_1.SSM();
const cloudWatchLogs = new aws_sdk_2.CloudWatchLogs();
// Parameter Storeから機密情報を取得
async function getSecureParameters() {
    const params = {
        Names: [
            '/plc/secure/ip-address',
            '/plc/secure/mqtt-topic',
            '/plc/secure/gateway-id'
        ],
        WithDecryption: true
    };
    const result = await ssm.getParameters(params).promise();
    const parameters = {};
    result.Parameters?.forEach(param => {
        const key = param.Name?.split('/').pop();
        if (key && param.Value) {
            parameters[key] = param.Value;
        }
    });
    return parameters;
}
// 監査ログを記録
async function logAuditEvent(eventData) {
    const logGroupName = process.env.LOG_GROUP_NAME || '/aws/lambda/plc-control-audit';
    const logStreamName = new Date().toISOString().split('T')[0];
    try {
        // ログストリームが存在しない場合は作成
        try {
            await cloudWatchLogs.createLogStream({
                logGroupName,
                logStreamName
            }).promise();
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('Failed to write audit log:', error);
        // 監査ログの失敗はAPIの処理を止めない
    }
}
// PLCコマンドを実行（実際の実装では適切なPLC通信ライブラリを使用）
async function executePlcCommand(params) {
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
const handler = async (event) => {
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
        const body = JSON.parse(event.body || '{}');
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
    }
    catch (error) {
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcGktaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxxQ0FBOEI7QUFDOUIscUNBQXlDO0FBRXpDLE1BQU0sR0FBRyxHQUFHLElBQUksYUFBRyxFQUFFLENBQUM7QUFDdEIsTUFBTSxjQUFjLEdBQUcsSUFBSSx3QkFBYyxFQUFFLENBQUM7QUFlNUMsMkJBQTJCO0FBQzNCLEtBQUssVUFBVSxtQkFBbUI7SUFDaEMsTUFBTSxNQUFNLEdBQUc7UUFDYixLQUFLLEVBQUU7WUFDTCx3QkFBd0I7WUFDeEIsd0JBQXdCO1lBQ3hCLHdCQUF3QjtTQUN6QjtRQUNELGNBQWMsRUFBRSxJQUFJO0tBQ3JCLENBQUM7SUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDekQsTUFBTSxVQUFVLEdBQVEsRUFBRSxDQUFDO0lBRTNCLE1BQU0sQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ2pDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pDLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN2QixVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUNoQyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLFVBQThCLENBQUM7QUFDeEMsQ0FBQztBQUVELFVBQVU7QUFDVixLQUFLLFVBQVUsYUFBYSxDQUFDLFNBQWM7SUFDekMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksK0JBQStCLENBQUM7SUFDbkYsTUFBTSxhQUFhLEdBQUcsSUFBSSxJQUFJLEVBQUUs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LEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztnQkFDbEMsa0NBQWtDLEVBQUUsTUFBTTthQUMzQztZQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixPQUFPLEVBQUUsaURBQWlEO2FBQzNELENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQW5GVyxRQUFBLE9BQU8sV0FtRmxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1NNIH0gZnJvbSAnYXdzLXNkayc7XG5pbXBvcnQgeyBDbG91ZFdhdGNoTG9ncyB9IGZyb20gJ2F3cy1zZGsnO1xuXG5jb25zdCBzc20gPSBuZXcgU1NNKCk7XG5jb25zdCBjbG91ZFdhdGNoTG9ncyA9IG5ldyBDbG91ZFdhdGNoTG9ncygpO1xuXG5pbnRlcmZhY2UgUGxjQ29tbWFuZCB7XG4gIGNvbW1hbmQ6IHN0cmluZztcbiAgdmFsdWU6IHN0cmluZztcbiAgYXJlYT86IHN0cmluZztcbiAgYWRkcmVzcz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNlY3VyZVBhcmFtZXRlcnMge1xuICAnaXAtYWRkcmVzcyc6IHN0cmluZztcbiAgJ21xdHQtdG9waWMnOiBzdHJpbmc7XG4gICdnYXRld2F5LWlkJzogc3RyaW5nO1xufVxuXG4vLyBQYXJhbWV0ZXIgU3RvcmXjgYvjgonmqZ/lr4bmg4XloLHjgpLlj5blvpdcbmFzeW5jIGZ1bmN0aW9uIGdldFNlY3VyZVBhcmFtZXRlcnMoKTogUHJvbWlzZTxTZWN1cmVQYXJhbWV0ZXJzPiB7XG4gIGNvbnN0IHBhcmFtcyA9IHtcbiAgICBOYW1lczogW1xuICAgICAgJy9wbGMvc2VjdXJlL2lwLWFkZHJlc3MnLFxuICAgICAgJy9wbGMvc2VjdXJlL21xdHQtdG9waWMnLFxuICAgICAgJy9wbGMvc2VjdXJlL2dhdGV3YXktaWQnXG4gICAgXSxcbiAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZVxuICB9O1xuICBcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3NtLmdldFBhcmFtZXRlcnMocGFyYW1zKS5wcm9taXNlKCk7XG4gIGNvbnN0IHBhcmFtZXRlcnM6IGFueSA9IHt9O1xuICBcbiAgcmVzdWx0LlBhcmFtZXRlcnM/LmZvckVhY2gocGFyYW0gPT4ge1xuICAgIGNvbnN0IGtleSA9IHBhcmFtLk5hbWU/LnNwbGl0KCcvJykucG9wKCk7XG4gICAgaWYgKGtleSAmJiBwYXJhbS5WYWx1ZSkge1xuICAgICAgcGFyYW1ldGVyc1trZXldID0gcGFyYW0uVmFsdWU7XG4gICAgfVxuICB9KTtcbiAgXG4gIHJldHVybiBwYXJhbWV0ZXJzIGFzIFNlY3VyZVBhcmFtZXRlcnM7XG59XG5cbi8vIOebo+afu+ODreOCsOOCkuiomOmMslxuYXN5bmMgZnVuY3Rpb24gbG9nQXVkaXRFdmVudChldmVudERhdGE6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBsb2dHcm91cE5hbWUgPSBwcm9jZXNzLmVudi5MT0dfR1JPVVBfTkFNRSB8fCAnL2F3cy9sYW1iZGEvcGxjLWNvbnRyb2wtYXVkaXQnO1xuICBjb25zdCBsb2dTdHJlYW1OYW1lID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF07XG4gIFxuICB0cnkge1xuICAgIC8vIOODreOCsOOCueODiOODquODvOODoOOBjOWtmOWcqOOBl+OBquOBhOWgtOWQiOOBr+S9nOaIkFxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbG91ZFdhdGNoTG9ncy5jcmVhdGVMb2dTdHJlYW0oe1xuICAgICAgICBsb2dHcm91cE5hbWUsXG4gICAgICAgIGxvZ1N0cmVhbU5hbWVcbiAgICAgIH0pLnByb21pc2UoKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAvLyDjg63jgrDjgrnjg4jjg6rjg7zjg6DjgYzml6LjgavlrZjlnKjjgZnjgovloLTlkIjjga/jgqjjg6njg7zjgpLnhKHoppZcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSAnUmVzb3VyY2VBbHJlYWR5RXhpc3RzRXhjZXB0aW9uJykge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8g44Ot44Kw44Kk44OZ44Oz44OI44KS6YCB5L+hXG4gICAgYXdhaXQgY2xvdWRXYXRjaExvZ3MucHV0TG9nRXZlbnRzKHtcbiAgICAgIGxvZ0dyb3VwTmFtZSxcbiAgICAgIGxvZ1N0cmVhbU5hbWUsXG4gICAgICBsb2dFdmVudHM6IFt7XG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgbWVzc2FnZTogSlNPTi5zdHJpbmdpZnkoZXZlbnREYXRhKVxuICAgICAgfV1cbiAgICB9KS5wcm9taXNlKCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHdyaXRlIGF1ZGl0IGxvZzonLCBlcnJvcik7XG4gICAgLy8g55uj5p+744Ot44Kw44Gu5aSx5pWX44GvQVBJ44Gu5Yem55CG44KS5q2i44KB44Gq44GEXG4gIH1cbn1cblxuLy8gUExD44Kz44Oe44Oz44OJ44KS5a6f6KGM77yI5a6f6Zqb44Gu5a6f6KOF44Gn44Gv6YGp5YiH44GqUExD6YCa5L+h44Op44Kk44OW44Op44Oq44KS5L2/55So77yJXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlUGxjQ29tbWFuZChwYXJhbXM6IHtcbiAgcGxjSVA6IHN0cmluZztcbiAgdG9waWM6IHN0cmluZztcbiAgZ2F0ZXdheUlkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBjb21tYW5kOiBQbGNDb21tYW5kO1xufSk6IFByb21pc2U8YW55PiB7XG4gIC8vIOOBk+OBk+OBp+OBr+S7ruOBruWun+ijhVxuICAvLyDlrp/pmpvjgavjga9NUVRU44Kv44Op44Kk44Ki44Oz44OI44KEUExD6YCa5L+h44Op44Kk44OW44Op44Oq44KS5L2/55SoXG4gIGNvbnNvbGUubG9nKCdFeGVjdXRpbmcgUExDIGNvbW1hbmQ6JywgcGFyYW1zKTtcbiAgXG4gIC8vIOOCt+ODn+ODpeODrOODvOOCt+ODp+ODs+eUqOOBruODrOOCueODneODs+OCuVxuICByZXR1cm4ge1xuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIGNvbW1hbmQ6IHBhcmFtcy5jb21tYW5kLFxuICAgIHJlc3VsdDoge1xuICAgICAgdmFsdWU6ICdPSycsXG4gICAgICBtZXNzYWdlOiAnQ29tbWFuZCBleGVjdXRlZCBzdWNjZXNzZnVsbHknXG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50XG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gQ29nbml0b+OBi+OCieOBruODpuODvOOCtuODvOaDheWgseOCkuWPluW+l1xuICAgIGNvbnN0IGNsYWltcyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0LmF1dGhvcml6ZXI/LmNsYWltcztcbiAgICBpZiAoIWNsYWltcykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiAndHJ1ZScsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSBjbGFpbXMuc3ViO1xuICAgIGNvbnN0IGVtYWlsID0gY2xhaW1zLmVtYWlsO1xuICAgIFxuICAgIC8vIOODquOCr+OCqOOCueODiOODnOODh+OCo+OCkuODkeODvOOCuVxuICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9JykgYXMgUGxjQ29tbWFuZDtcbiAgICBcbiAgICAvLyDmqZ/lr4bmg4XloLHjgpJQYXJhbWV0ZXIgU3RvcmXjgYvjgonlj5blvpdcbiAgICBjb25zdCBzZWN1cmVQYXJhbXMgPSBhd2FpdCBnZXRTZWN1cmVQYXJhbWV0ZXJzKCk7XG4gICAgXG4gICAgLy8gUExD44Kz44Oe44Oz44OJ44Gu5a6f6KGMXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVBsY0NvbW1hbmQoe1xuICAgICAgcGxjSVA6IHNlY3VyZVBhcmFtc1snaXAtYWRkcmVzcyddLFxuICAgICAgdG9waWM6IHNlY3VyZVBhcmFtc1snbXF0dC10b3BpYyddLFxuICAgICAgZ2F0ZXdheUlkOiBzZWN1cmVQYXJhbXNbJ2dhdGV3YXktaWQnXSxcbiAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgY29tbWFuZDogYm9keVxuICAgIH0pO1xuICAgIFxuICAgIC8vIOebo+afu+ODreOCsOOBruiomOmMslxuICAgIGF3YWl0IGxvZ0F1ZGl0RXZlbnQoe1xuICAgICAgdXNlcklkLFxuICAgICAgZW1haWwsXG4gICAgICBhY3Rpb246ICdQTENfQ09NTUFORCcsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIHNvdXJjZUlQOiBldmVudC5yZXF1ZXN0Q29udGV4dC5pZGVudGl0eS5zb3VyY2VJcCxcbiAgICAgIHVzZXJBZ2VudDogZXZlbnQucmVxdWVzdENvbnRleHQuaWRlbnRpdHkudXNlckFnZW50LFxuICAgICAgY29tbWFuZDogYm9keSxcbiAgICAgIHJlc3VsdDogcmVzdWx0LnN0YXR1c1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXN1bHQpXG4gICAgfTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8g44Ko44Op44O844Ot44Kw44Gu6KiY6YyyXG4gICAgYXdhaXQgbG9nQXVkaXRFdmVudCh7XG4gICAgICBhY3Rpb246ICdQTENfQ09NTUFORF9FUlJPUicsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIHNvdXJjZUlQOiBldmVudC5yZXF1ZXN0Q29udGV4dC5pZGVudGl0eS5zb3VyY2VJcFxuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdCdcbiAgICAgIH0pXG4gICAgfTtcbiAgfVxufTsiXX0=