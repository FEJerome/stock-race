import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Table, Tag, Statistic, Alert, Spin, Space, Typography } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  ApiOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  UserOutlined,
  StockOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { tradingService } from '../services/trading.service';
import { marketService } from '../services/market.service';
import { aiService } from '../services/ai.service';
import { authService } from '../services/auth.service';
import { formatCurrency, formatPercent, formatDateTime } from '../utils/formatters';

const { Title, Text } = Typography;

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  data?: any;
  time?: number;
}

const TestAPI: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [overallStatus, setOverallStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [marketData, setMarketData] = useState<any>(null);
  const [tradingData, setTradingData] = useState<any>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [authData, setAuthData] = useState<any>(null);

  const tests = [
    {
      name: '认证服务 - 登录',
      icon: <UserOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await authService.login('demo@example.com', 'demo123');
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `登录成功，用户: ${result.user.name}`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `登录失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: '市场服务 - 获取股票行情',
      icon: <StockOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await marketService.getStockQuotes();
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `获取到 ${result.length} 只股票行情`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `获取行情失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: '市场服务 - 搜索股票',
      icon: <DatabaseOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await marketService.searchStocks('苹果');
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `搜索到 ${result.length} 条结果`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `搜索失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: '交易服务 - 获取订单列表',
      icon: <LineChartOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await tradingService.getOrders({ page: 1, pageSize: 5 });
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `获取到 ${result.items.length} 条订单，总计 ${result.total} 条`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `获取订单失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: '交易服务 - 获取持仓列表',
      icon: <DatabaseOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await tradingService.getPositions();
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `获取到 ${result.length} 个持仓`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `获取持仓失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: 'AI服务 - 获取AI账户',
      icon: <RobotOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await aiService.getAIAccounts();
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `获取到 ${result.length} 个AI账户`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `获取AI账户失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: 'AI服务 - 获取AI决策',
      icon: <ApiOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await aiService.getAIDecisions({ page: 1, pageSize: 5 });
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `获取到 ${result.items.length} 条AI决策，总计 ${result.total} 条`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `获取AI决策失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: 'AI服务 - 触发AI分析',
      icon: <RobotOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const result = await aiService.triggerAIAnalysis('AAPL');
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `AI分析完成: ${result.action} ${result.stockSymbol}`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `AI分析失败: ${error.message}`,
            time
          };
        }
      }
    },
    {
      name: '交易服务 - 创建订单',
      icon: <LineChartOutlined />,
      run: async () => {
        const startTime = Date.now();
        try {
          const order = {
            stockSymbol: 'AAPL',
            orderType: 'buy' as const,
            quantity: 10,
            limitPrice: 162.50
          };
          const result = await tradingService.createOrder(order);
          const time = Date.now() - startTime;
          return {
            status: 'success' as const,
            message: `订单创建成功: ${result.orderType} ${result.quantity}股 ${result.stockSymbol}`,
            data: result,
            time
          };
        } catch (error: any) {
          const time = Date.now() - startTime;
          return {
            status: 'error' as const,
            message: `创建订单失败: ${error.message}`,
            time
          };
        }
      }
    }
  ];

  const runAllTests = async () => {
    setIsTesting(true);
    setTestResults(tests.map(test => ({
      name: test.name,
      status: 'pending',
      message: '等待测试...'
    })));

    const results: TestResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      const result = await test.run();
      results.push({ name: test.name, ...result });

      // 更新状态
      const newResults = [...results];
      for (let j = i + 1; j < tests.length; j++) {
        newResults.push({
          name: tests[j].name,
          status: 'pending',
          message: '等待测试...'
        });
      }
      setTestResults(newResults);

      if (result.status === 'success') {
        successCount++;

        // 保存数据用于展示
        if (test.name.includes('市场服务')) {
          setMarketData(result.data);
        } else if (test.name.includes('交易服务')) {
          setTradingData(result.data);
        } else if (test.name.includes('AI服务')) {
          setAiData(result.data);
        } else if (test.name.includes('认证服务')) {
          setAuthData(result.data);
        }
      } else {
        errorCount++;
      }
    }

    setTestResults(results);
    setIsTesting(false);

    if (errorCount === 0) {
      setOverallStatus('success');
    } else if (successCount > 0) {
      setOverallStatus('success');
    } else {
      setOverallStatus('error');
    }
  };

  const runSingleTest = async (index: number) => {
    const test = tests[index];
    const startTime = Date.now();

    const newResults = [...testResults];
    newResults[index] = {
      name: test.name,
      status: 'pending',
      message: '测试中...'
    };
    setTestResults(newResults);

    const result = await test.run();

    newResults[index] = { name: test.name, ...result };
    setTestResults(newResults);

    // 更新数据
    if (result.status === 'success') {
      if (test.name.includes('市场服务')) {
        setMarketData(result.data);
      } else if (test.name.includes('交易服务')) {
        setTradingData(result.data);
      } else if (test.name.includes('AI服务')) {
        setAiData(result.data);
      } else if (test.name.includes('认证服务')) {
        setAuthData(result.data);
      }
    }
  };

  useEffect(() => {
    // 初始化测试结果
    setTestResults(tests.map(test => ({
      name: test.name,
      status: 'pending',
      message: '等待测试...'
    })));
  }, []);

  const columns = [
    {
      title: '测试项目',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: TestResult, index: number) => (
        <Space>
          {tests[index].icon}
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: TestResult, index: number) => {
        if (status === 'pending') {
          return <Tag color="default">等待</Tag>;
        } else if (status === 'success') {
          return <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>;
        } else {
          return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>;
        }
      },
    },
    {
      title: '结果',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '耗时',
      dataIndex: 'time',
      key: 'time',
      render: (time: number) => time ? `${time}ms` : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: TestResult, index: number) => (
        <Button
          size="small"
          onClick={() => runSingleTest(index)}
          disabled={isTesting}
          icon={<ReloadOutlined />}
        >
          重新测试
        </Button>
      ),
    },
  ];

  const renderDataPreview = () => {
    if (!marketData && !tradingData && !aiData && !authData) {
      return null;
    }

    return (
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {authData && (
          <Col span={24}>
            <Card title="认证数据" size="small">
              <Text>用户: {authData.user?.name}</Text>
              <br />
              <Text>Token: {authData.token?.substring(0, 20)}...</Text>
            </Card>
          </Col>
        )}

        {marketData && Array.isArray(marketData) && (
          <Col span={24}>
            <Card title="市场数据预览" size="small">
              <Row gutter={[8, 8]}>
                {marketData.slice(0, 3).map((stock: any) => (
                  <Col span={8} key={stock.symbol}>
                    <Card size="small">
                      <Statistic
                        title={stock.name}
                        value={stock.currentPrice}
                        precision={2}
                        prefix="¥"
                        valueStyle={{ color: stock.change > 0 ? '#3f8600' : '#cf1322' }}
                      />
                      <Text type={stock.change > 0 ? 'success' : 'danger'}>
                        {stock.change > 0 ? '+' : ''}{stock.change} ({stock.changePercent}%)
                      </Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}

        {tradingData && Array.isArray(tradingData) && (
          <Col span={24}>
            <Card title="交易数据预览" size="small">
              <Table
                size="small"
                dataSource={tradingData.slice(0, 3)}
                columns={[
                  { title: '股票', dataIndex: 'stockSymbol', key: 'stockSymbol' },
                  { title: '名称', dataIndex: 'stockName', key: 'stockName' },
                  { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                  { title: '类型', dataIndex: 'orderType', key: 'orderType' },
                  { title: '状态', dataIndex: 'orderStatus', key: 'orderStatus' },
                ]}
                pagination={false}
              />
            </Card>
          </Col>
        )}

        {aiData && Array.isArray(aiData) && (
          <Col span={24}>
            <Card title="AI数据预览" size="small">
              <Table
                size="small"
                dataSource={aiData.slice(0, 3)}
                columns={[
                  { title: '股票', dataIndex: 'stockSymbol', key: 'stockSymbol' },
                  { title: '操作', dataIndex: 'action', key: 'action' },
                  { title: '信心度', dataIndex: 'confidence', key: 'confidence', render: (val) => `${(val * 100).toFixed(1)}%` },
                  { title: '建议价格', dataIndex: 'suggestedPrice', key: 'suggestedPrice', render: (val) => formatCurrency(val) },
                ]}
                pagination={false}
              />
            </Card>
          </Col>
        )}
      </Row>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Title level={2}>API服务测试页面</Title>
        <Text type="secondary">测试前端所有API服务的功能和集成情况</Text>

        <Alert
          style={{ marginTop: 16, marginBottom: 24 }}
          message="注意"
          description="当前使用的是模拟API服务，所有数据均为模拟数据。实际部署时需要连接真实的后端API服务。"
          type="info"
          showIcon
        />

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="总测试数"
                value={tests.length}
                prefix={<ApiOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="成功数"
                value={testResults.filter(r => r.status === 'success').length}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="失败数"
                value={testResults.filter(r => r.status === 'error').length}
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              onClick={runAllTests}
              loading={isTesting}
              icon={<ReloadOutlined />}
              size="large"
            >
              {isTesting ? '测试中...' : '运行所有测试'}
            </Button>
            <Button
              onClick={() => {
                setTestResults(tests.map(test => ({
                  name: test.name,
                  status: 'pending',
                  message: '等待测试...'
                })));
                setOverallStatus('pending');
                setMarketData(null);
                setTradingData(null);
                setAiData(null);
                setAuthData(null);
              }}
              disabled={isTesting}
            >
              重置测试
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={testResults}
          rowKey="name"
          pagination={false}
          loading={isTesting}
        />

        {renderDataPreview()}

        <Alert
          style={{ marginTop: 24 }}
          message="测试结果说明"
          description={
            <div>
              <p>1. 所有API服务均为模拟实现，返回模拟数据</p>
              <p>2. 网络延迟通过setTimeout模拟</p>
              <p>3. 实际部署时需要将服务中的模拟代码替换为真实的API调用</p>
              <p>4. 错误处理已集成到所有服务中</p>
            </div>
          }
          type="success"
          showIcon
        />
      </Card>
    </div>
  );
};

export default TestAPI;