// 截图与预览用的示例数据（不会进入正式运行）。人物、号码均为虚构示例。
import type { Row } from '../kit/runner';

/** 画一张缩小的聊天截图：灰底、左白右绿的气泡 */
function shot(seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#EDEDED';
  g.fillRect(0, 0, 160, 160);
  g.fillStyle = '#F7F7F7';
  g.fillRect(0, 0, 160, 22);
  for (let i = 0; i < 5; i++) {
    const me = (i + seed) % 2 === 1;
    const w = 50 + ((i * 37 + seed * 23) % 60);
    const y = 32 + i * 25;
    g.fillStyle = me ? '#4A90D9' : '#D98A4A';
    g.fillRect(me ? 142 : 6, y, 12, 12);
    g.fillStyle = me ? '#A9E87A' : '#FFFFFF';
    g.beginPath();
    g.roundRect(me ? 136 - w : 24, y, w, 16, 3);
    g.fill();
  }
  return c.toDataURL('image/png');
}

const files: [string, Row['status'], string][] = [
  ['示例-办公室净化器-陈女士.png', 'ok', '陈女士 · 意向：高 · 预算 3000 元左右一台'],
  ['示例-复印机-林先生.png', 'ok', '林先生 · 意向：中 · 未提预算'],
  ['示例-会议室投影-周经理.jpg', 'ok', '周经理 · 意向：高 · 预算 2 万以内'],
  ['示例-饮水机租赁.png', 'run', ''],
  ['示例-打印纸批发.png', 'wait', ''],
  ['示例-前台绿植.jpg', 'wait', ''],
  ['示例-空白截图.png', 'err', '截图里没有识别到文字'],
];

export const params = { consent: true };

const DETAIL: Record<number, string> = {
  0: '客户：陈女士\n意向：高\n预算：3000 元左右一台\n需求：办公室约 120 平，采购 6 台空气净化器，含上门安装\n关注点：下周三前送到\n手机号：13800138000\n微信号：demo_chen01\n跟进建议：今天发报价单，确认送货地址和开票信息\n原文依据：预算3000元左右一台｜下周三之前能送到吗？',
  1: '客户：林先生\n意向：中\n需求：彩色复印机\n关注点：价格偏高、耗材费用\n跟进建议：发耗材单价对比表，月底前再联系\n原文依据：价格有点高，耗材贵不贵？｜月底前再说吧',
};

export const notice = new URLSearchParams(location.search).get('state') === 'done'
  ? { kind: 'ok' as const, text: '已整理 6 份客户档案（高意向 2 位），按意向从高到低排列：/Users/demo/Downloads/聊天截图转客户档案/客户档案.xlsx' }
  : undefined;

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, status, text], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    const summary = text || ['', '', '', '刘老板 · 意向：中 · 预算 每月 500 元内', '赵小姐 · 意向：低 · 未提预算', '何主管 · 意向：未知 · 未提预算'][i];
    return {
      item: { id: `p${i}`, name, path: shot(i), size: 210_000 + i * 53_000 },
      status: st, progress: st === 'run' ? 0.62 : st === 'ok' ? 1 : 0, error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { preview: shot(i), summary, text: DETAIL[i] ?? summary } : undefined,
    };
  });
