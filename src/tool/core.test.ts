import { describe, expect, it } from 'vitest';
import {
  buildMessages, byIntent, checkInText, checkPhones, excelRow, extractJson, findPhones, maskPhones, normIntent, parseProfile, profileText, safeName, summaryOf, verifyProfile,
  type Profile,
} from './core';

const chat = `示例客户·陈女士
你好，我想给办公室买 6 台空气净化器
预算 3000 元左右，下周能送到吗？
我的电话 13800138000，微信 demo_chen01
小王（店长）
可以的，下周二能到`;

const empty: Profile = { name: '', phone: '', wechat: '', otherContact: '', needs: '', budget: '', intent: '未知', concerns: '', nextStep: '', evidence: '' };

describe('手机号', () => {
  it('打码中间四位，支持空格和横线写法', () => {
    expect(maskPhones('电话 13800138000，备用 139-1234-5678')).toBe('电话 138****8000，备用 139****5678');
  });
  it('不误伤更长的数字（订单号）', () => {
    expect(maskPhones('订单 2026138001380001')).toBe('订单 2026138001380001');
    expect(findPhones('订单 2026138001380001')).toEqual([]);
  });
  it('打码号码按原文还原，原文没有的号码去掉', () => {
    expect(checkPhones('138****8000', chat)).toBe('13800138000');
    expect(checkPhones('13800138000、13912345678', chat)).toBe('13800138000');
    expect(checkPhones('138****1111', chat)).toBe('');
  });
  it('打码号码在原文对应多个时不猜', () => {
    expect(checkPhones('138****8000', '13800138000 13811118000')).toBe('');
  });
});

describe('微信号核对', () => {
  it('原文出现过才保留，忽略大小写', () => {
    expect(checkInText('DEMO_chen01', chat)).toBe('DEMO_chen01');
    expect(checkInText('chen_fake', chat)).toBe('');
  });
});

describe('提示词', () => {
  it('包含不编造要求、我方昵称和聊天文字', () => {
    const [sys, user] = buildMessages(chat, '小王（店长）');
    expect(sys.content).toContain('不推测、不编造');
    expect(user.content).toContain('「小王（店长）」是我方');
    expect(user.content).toContain('预算 3000 元左右');
  });
  it('没填我方昵称时让模型自己判断', () => {
    expect(buildMessages('你好', '')[1].content).toContain('根据内容判断哪一方是客户');
  });
});

describe('解析回复', () => {
  it('标准 JSON', () => {
    const p = parseProfile('{"name":"陈女士","phone":"138****8000","wechat":"demo_chen01","needs":"办公室空气净化器 6 台","budget":"3000 元左右","intent":"高","concerns":"送货时间","nextStep":"周一确认型号和地址","evidence":"预算 3000 元左右｜下周能送到吗"}');
    expect(p).toMatchObject({ name: '陈女士', intent: '高', budget: '3000 元左右', needs: '办公室空气净化器 6 台' });
  });
  it('代码块、中文键名、嵌套联系方式、数组、「无」当空', () => {
    const p = parseProfile('好的：\n```json\n{"客户称呼":"林先生","联系方式":{"手机":"无","微信":"lin_demo"},"需求":["复印机","上门安装"],"预算":"未提及","意向":"中等","依据":["考虑一下","再比较"],}\n```');
    expect(p).toMatchObject({ name: '林先生', phone: '', wechat: 'lin_demo', needs: '复印机、上门安装', budget: '', intent: '中', evidence: '考虑一下｜再比较' });
  });
  it('意向归一', () => {
    expect(['高', 'High', 'A类', '中', '一般', '低', '意向不高', '无意向', '看不出', ''].map(normIntent)).toEqual(['高', '高', '高', '中', '中', '低', '低', '低', '未知', '未知']);
  });
  it('不是 JSON 时报错', () => {
    expect(() => parseProfile('抱歉，我无法处理')).toThrow('不是有效的 JSON');
    expect(() => extractJson('')).toThrow();
  });
});

describe('核对与输出', () => {
  it('去掉截图里没有的联系方式并说明', () => {
    const { profile, notes } = verifyProfile({ ...empty, phone: '13912345678', wechat: 'demo_chen01', otherContact: 'a@b.com' }, chat);
    expect(profile.phone).toBe('');
    expect(profile.wechat).toBe('demo_chen01');
    expect(notes).toEqual(['手机号「13912345678」在截图里没找到，已去掉', '联系方式「a@b.com」在截图里没找到，已去掉']);
  });
  it('摘要、文字档案、表格行', () => {
    const p = { ...empty, name: '陈女士', intent: '高' as const, budget: '3000 元左右', needs: '净化器' };
    expect(summaryOf(p)).toBe('陈女士 · 意向：高 · 预算 3000 元左右');
    expect(summaryOf(empty)).toBe('未识别称呼 · 意向：未知 · 未提预算');
    expect(profileText(p, ['x'])).toBe('客户：陈女士\n意向：高\n预算：3000 元左右\n需求：净化器\n提示：x');
    expect(excelRow('a.png', p, [], '原文')).toEqual(['a.png', '陈女士', '高', '3000 元左右', '净化器', '', '', '', '', '', '', '', '原文']);
  });
  it('按意向排序，同级保持原顺序', () => {
    const mk = (name: string, intent: Profile['intent']) => ({ profile: { ...empty, name, intent } });
    expect(byIntent([mk('a', '低'), mk('b', '高'), mk('c', '未知'), mk('d', '高'), mk('e', '中')]).map((x) => x.profile.name)).toEqual(['b', 'd', 'e', 'a', 'c']);
  });
  it('文件名去掉非法字符', () => {
    expect(safeName('十月/客户:档案')).toBe('十月_客户_档案');
  });
});
